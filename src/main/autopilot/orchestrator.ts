// Autopilot orchestrator — the autonomous run loop.
//
// Drives queued jobs through the state machine using the CDP driver (the hands)
// and the injected filler engine (the in-page brain). Per field it resolves a
// value Node-side: answer-bank cache first, then Claude. Unknowns are parked in
// the deduped "Needs you" inbox (never blocking). At the review step it
// screenshots the draft and marks the job ready. Approving a ready job clicks the
// real Submit and logs it into the tracker.
import fs from 'fs';
import path from 'path';
import {
  ensureBrowser, openJob, injectSource, evalInTab, screenshot, closeTab, setActiveSlots, Tab, BridgeMsg,
} from './driver';
import { INJECTED_SOURCE } from './injected';
import { harvestSearch, boardById, boardMode, BOARDS } from './sources';
import { runClaudeCLI } from '../claude';
import {
  resolveFieldPrompt, tailorAnswerPrompt, parseFieldAction, fitScorePrompt, parseFitScore,
  relatedRolesPrompt, parseRoles, resumePickPrompt, parseResumePick,
} from '../autopilot-prompts';
import {
  getAnswerBank, getDocuments,
  getAutopilotJobs, getAutopilotJob, updateJob, upsertNeed, getOpenNeeds, lookupAnsweredNeed,
  getSavedSearches, enqueuePosting, isJobKnown, getAutopilotSettings, countLoggedToday,
  getBoardModes, getResumeFocus,
} from '../database';
import type { AnswerBankEntry, AutopilotJob, AutopilotJobState, DriveStatus } from '../../shared/types';

export interface DriveDeps {
  onApply: (company: string, jobTitle: string, jobUrl: string) => void;
  emit: (status: DriveStatus) => void;
}

const MAX_STEPS = 12;          // step pages per job (LinkedIn easy-apply etc.)
const PER_RUN_CAP = 50;        // jobs driven in one run
const rand = (a: number, b: number) => a + Math.floor(Math.random() * (b - a));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let running = false;
let cancelled = false;
let paused = false;          // manual pause (toggle); halts at safe points
let skipRequested = false;   // user asked to skip the app currently being filled

export function isDriveRunning(): boolean { return running; }
export function isPaused(): boolean { return paused; }
export function pauseDrive(): void { paused = true; }
export function resumeDrive(): void { paused = false; }
export function skipCurrent(): void { skipRequested = true; }
async function waitIfPaused(): Promise<void> { while (paused && !cancelled) await sleep(400); }

function counts(): Record<AutopilotJobState, number> {
  const base: Record<string, number> = {
    queued: 0, filling: 0, needs_input: 0, ready: 0, approved: 0,
    submitting: 0, submitted: 0, logged: 0, skipped: 0, deferred: 0, surfaced: 0, failed: 0,
  };
  for (const j of getAutopilotJobs()) base[j.state] = (base[j.state] || 0) + 1;
  return base as Record<AutopilotJobState, number>;
}
function emitStatus(deps: DriveDeps, message: string, currentJobId: string | null = null): void {
  deps.emit({ running, paused, message, currentJobId, counts: counts() });
}

// Wait while the user decides on the app currently being filled: they answer the
// parked question(s) (→ 'answered', resume same app), skip it (→ 'skip', defer it),
// or stop the run (→ 'cancel'). Up to ~30 min, then auto-defers.
async function waitForUser(pendingNorms: string[]): Promise<'answered' | 'skip' | 'cancel'> {
  for (let i = 0; i < 900; i++) {
    if (cancelled) return 'cancel';
    if (skipRequested) { skipRequested = false; return 'skip'; }
    await waitIfPaused();
    const open = new Set(getOpenNeeds().map((n) => n.normLabel));
    if (!pendingNorms.some((p) => open.has(p))) return 'answered';
    await sleep(2000);
  }
  return 'skip';
}

// ── Node-side bridge: serves the injected page's call() requests ─────────────
const norm = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function matchBank(bank: AnswerBankEntry[], label: string): AnswerBankEntry | null {
  const n = norm(label);
  if (!n) return null;
  for (const e of bank) {
    const keys = [e.label, ...(e.patterns || [])].map(norm).filter(Boolean);
    if (keys.some((k) => k && (n === k || n.includes(k) || k.includes(n)))) return e;
  }
  return null;
}

async function handleBridge(msg: BridgeMsg): Promise<{ ok: boolean; data?: any }> {
  const p = msg.path;
  const body = msg.body || {};
  try {
    if (p === '/resolve') {
      const bank = getAnswerBank();
      const hit = matchBank(bank, body.label) || (lookupAnsweredNeed(body.label) ? { value: lookupAnsweredNeed(body.label)! } as any : null);
      if (hit) return { ok: true, data: { action: 'fill', value: hit.value, source: 'bank' } };
      if (body.cacheOnly) return { ok: true, data: { action: 'none' } };
      const out = await runClaudeCLI(resolveFieldPrompt({ label: body.label, type: body.type, options: body.options }), 22000).catch(() => '');
      return { ok: true, data: parseFieldAction(out) };
    }
    if (p === '/tailor') {
      const out = await runClaudeCLI(tailorAnswerPrompt({ question: body.question, jobText: body.jobText }), 30000).catch(() => '');
      return { ok: true, data: { answer: out.trim() } };
    }
    if (p === '/documents') {
      return { ok: true, data: { documents: getDocuments() } };
    }
    if (p === '/resume') {
      // pick the best resume variant for this job and return its bytes
      const resumes = getDocuments().filter((d) => d.tags.includes('resume'));
      if (!resumes.length) return { ok: false };
      let chosen = resumes.find((d) => d.isDefault) || resumes[0];
      if (resumes.length > 1) {
        const focus = getResumeFocus();
        const out = await runClaudeCLI(resumePickPrompt(resumes.map((d) => ({ label: d.label, focus: focus[d.id] || '' })), { title: body.title, jobText: body.jobText }), 20000).catch(() => '');
        const idx = parseResumePick(out, resumes.length);
        if (idx >= 0) chosen = resumes[idx];
      }
      if (!fs.existsSync(chosen.filePath)) return { ok: false };
      const buf = fs.readFileSync(chosen.filePath);
      return { ok: true, data: { fileName: path.basename(chosen.filePath), base64: buf.toString('base64'), variant: chosen.label } };
    }
    if (p.indexOf('/document') === 0) {
      const id = p.split('id=')[1];
      const doc = getDocuments().find((d) => d.id === decodeURIComponent(id || ''));
      if (!doc || !fs.existsSync(doc.filePath)) return { ok: false };
      const buf = fs.readFileSync(doc.filePath);
      return { ok: true, data: { fileName: path.basename(doc.filePath), base64: buf.toString('base64') } };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

// Read company/title/jobText off the page (best-effort, for labelling + tailoring).
const EXTRACT_EXPR = `(function(){
  var pick=function(sels){for(var i=0;i<sels.length;i++){var e=document.querySelector(sels[i]);if(e){var t=(e.content||e.innerText||'').trim();if(t)return t;}}return '';};
  var title=pick(['.job-details-jobs-unified-top-card__job-title','.jobs-unified-top-card__job-title','h1'])||document.title;
  var company=pick(['.job-details-jobs-unified-top-card__company-name','.jobs-unified-top-card__company-name','meta[property="og:site_name"]']);
  var jobText=(document.body.innerText||'').slice(0,6000);
  return {company:company,title:title,jobText:jobText};
})()`;

async function ensureInjected(tab: Tab, ctx: any): Promise<boolean> {
  try {
    const present = await evalInTab(tab, 'typeof window.AplydDrive');
    if (present !== 'object') {
      await injectSource(tab, INJECTED_SOURCE);
      await evalInTab(tab, 'window.AplydDrive.setJob(' + JSON.stringify(ctx) + ')');
    }
    return true;
  } catch {
    return false;
  }
}

// Drive a single job to the review step (or failure). Does NOT submit.
async function fillJob(job: AutopilotJob, deps: DriveDeps, slot = 0): Promise<void> {
  updateJob(job.id, { state: 'filling', error: null });
  emitStatus(deps, 'Opening ' + (job.company || job.url.slice(0, 48)), job.id);

  let tab: Tab | null = null;
  try {
    tab = await openJob(job.url, handleBridge, slot);

    let ctx: any = { company: job.company, title: job.title, jobText: '' };
    try { ctx = await evalInTab(tab, EXTRACT_EXPR) || ctx; } catch { /* keep defaults */ }
    const company = (ctx.company || job.company || 'Unknown').slice(0, 120);
    const title = (ctx.title || job.title || 'Role').slice(0, 160);
    updateJob(job.id, { company, title });

    if (!(await ensureInjected(tab, ctx))) { throw new Error('could not inject filler'); }

    // Login wall? Pause and let the user sign in (the session persists afterwards,
    // so it only happens once per site). We wait, keeping the page visible.
    const LOGIN_EXPR = `(function(){ if(/(\\/login|authwall|uas\\/login|sign[-_]?in|checkpoint|account\\/login|\\/signup)/i.test(location.href)) return true; var p=document.querySelector('input[type=password]'); return !!(p && p.getBoundingClientRect().width>0); })()`;
    if (await evalInTab(tab, LOGIN_EXPR).catch(() => false)) {
      emitStatus(deps, `Sign in to ${company} in the window — I'll keep going once you're in.`, job.id);
      let signedIn = false;
      for (let i = 0; i < 100 && !cancelled; i++) { // wait up to ~5 min for login
        await sleep(3000);
        if (!(await evalInTab(tab, LOGIN_EXPR).catch(() => true))) { signedIn = true; break; }
      }
      if (!signedIn) { updateJob(job.id, { state: 'queued' }); return; } // leave for next run
      await sleep(1200);
      await ensureInjected(tab, ctx);
    }

    let totalFilled = 0;
    let reachedReview = false;

    for (let step = 0; step < MAX_STEPS; step++) {
      if (cancelled) break;
      await waitIfPaused();        // honour a manual pause
      if (cancelled) break;
      await ensureInjected(tab, ctx);
      let res: any;
      try { res = await evalInTab(tab, 'window.AplydDrive.fillStep()'); }
      catch { res = null; }

      if (!res) { if (step === 0) throw new Error('no form / page blocked (login or captcha?)'); break; }
      if (res.noForm) {
        if (step === 0) throw new Error('no application form found (external apply or login wall?)');
        break;
      }
      totalFilled += res.filled || 0;
      updateJob(job.id, { filledCount: totalFilled });

      // Needs you on THIS application? PAUSE here and wait — don't move on. You can
      // answer (it resumes this same app with your answer) or skip it (it goes to
      // your "started, not finished" vault and the agent continues to the next).
      if (res.needs && res.needs.length) {
        for (const n of res.needs) upsertNeed({ label: n.label, kind: n.kind, options: n.options, hint: n.hint });
        const pending = res.needs.map((n: any) => norm(n.label));
        updateJob(job.id, { state: 'needs_input', needsCount: pending.length });
        emitStatus(deps, `Paused on ${company} — answer below, or skip this one`, job.id);
        const outcome = await waitForUser(pending);
        if (outcome === 'cancel') { updateJob(job.id, { state: 'queued' }); return; }
        if (outcome === 'skip') {
          try { const shot = await screenshot(tab, job.id); updateJob(job.id, { screenshotPath: shot }); } catch { /* ignore */ }
          updateJob(job.id, { state: 'deferred', needsCount: 0 });
          emitStatus(deps, `Saved ${company} for later`, job.id);
          return;
        }
        // answered → re-fill this step with the new answer(s), then carry on
        updateJob(job.id, { state: 'filling' });
        emitStatus(deps, `Continuing ${company}…`, job.id);
        await sleep(500);
        continue;
      }

      const footer = res.footer;
      if (footer === 'submit') { reachedReview = true; break; }
      if (footer === 'next' || footer === 'review') {
        await evalInTab(tab, 'window.AplydDrive.clickFooter()').catch(() => {});
        await sleep(rand(1200, 2200));
        continue;
      }
      reachedReview = totalFilled > 0;
      break;
    }

    if (cancelled) { updateJob(job.id, { state: 'queued' }); return; }

    // fully filled → ready for your review + submit
    try { const shot = await screenshot(tab, job.id); updateJob(job.id, { screenshotPath: shot }); } catch { /* non-fatal */ }
    updateJob(job.id, { needsCount: 0, state: reachedReview ? 'ready' : 'failed', error: reachedReview ? null : 'could not fill any fields' });
  } catch (e: any) {
    // Vision fallback (Phase 4, pragmatic): we can't reliably auto-solve a login
    // wall / captcha / unknown ATS, so capture the screen so the failure is
    // actionable — you see exactly where it stuck and can finish it by hand.
    if (tab) { try { const shot = await screenshot(tab, job.id); updateJob(job.id, { screenshotPath: shot }); } catch { /* ignore */ } }
    updateJob(job.id, { state: 'failed', error: String(e && e.message ? e.message : e) });
  } finally {
    if (tab) await closeTab(tab);
  }
}

// Drive all queued / needs_input jobs (re-attempting needs_input jobs in case the
// inbox was answered since last run).
// How many run slots (parallel agents) to use. 1 = single, up to 3 = split.
let slotCount = 1;
export function setSlotCount(n: number): void { slotCount = Math.max(1, Math.min(3, n)); setActiveSlots(slotCount); }
export function getSlotCount(): number { return slotCount; }

export async function runDrive(deps: DriveDeps): Promise<void> {
  if (running) return;
  running = true; cancelled = false; paused = false; skipRequested = false;
  try {
    await ensureBrowser();
    setActiveSlots(slotCount);
    emitStatus(deps, 'Browser ready');
    const todo = getAutopilotJobs().filter((j) => j.state === 'queued' || j.state === 'needs_input').slice(0, PER_RUN_CAP);
    if (!todo.length) { emitStatus(deps, 'Nothing queued'); return; }

    // worker pool: one worker per slot pulls the next job off a shared cursor,
    // so up to `slotCount` applications fill in parallel (each in its own view).
    let cursor = 0;
    const worker = async (slot: number) => {
      while (!cancelled) {
        await waitIfPaused();
        const i = cursor++;
        if (i >= todo.length) break;
        const fresh = getAutopilotJob(todo[i].id);
        if (!fresh) continue;
        await fillJob(fresh, deps, slot);
        await sleep(rand(3000, 7000)); // human-like gap between jobs
      }
    };
    await Promise.all(Array.from({ length: slotCount }, (_v, slot) => worker(slot)));
    emitStatus(deps, cancelled ? 'Stopped' : 'Run complete');
  } catch (e: any) {
    emitStatus(deps, 'Run error: ' + String(e && e.message ? e.message : e));
  } finally {
    running = false;
    emitStatus(deps, running ? 'running' : (cancelled ? 'Stopped' : 'Idle'));
  }
}

export function stopDrive(): void { cancelled = true; }

// ── Harvest + concurrent drive ───────────────────────────────────────────────
const SCORE_BUDGET = 80;   // cap Claude scoring calls per harvest
const MAX_RUNS = 36;       // cap total (role × site) searches per harvest
const HARVEST_SLOT = 2;    // hidden background view used while a run also drives

// How many more we can still queue/fill today (daily target minus in-flight + done).
function remainingTarget(): number {
  const s = getAutopilotSettings();
  const inFlight = getAutopilotJobs().filter((j) => ['queued', 'needs_input', 'ready', 'filling'].includes(j.state)).length;
  return Math.max(0, s.dailyTarget - countLoggedToday() - inFlight);
}

// Expand a search into related role titles (AI), so we cover similar roles, not
// just the exact words. If you already listed several, we trust your list.
async function expandTerms(query: string): Promise<string[]> {
  const typed = query.split(',').map((t) => t.trim()).filter(Boolean);
  const base = typed.length ? typed : [query.trim()].filter(Boolean);
  if (!base.length) return [];
  if (base.length >= 3) return base.slice(0, 5);
  const out = await runClaudeCLI(relatedRolesPrompt(base.join(', '), 3), 18000).catch(() => '');
  const all = [...base];
  for (const r of parseRoles(out)) if (!all.some((x) => x.toLowerCase() === r.toLowerCase())) all.push(r);
  return all.slice(0, 5);
}

// Search + score + enqueue PROGRESSIVELY on `slot`, so jobs become available to
// the drive loop the moment they're found. Does NOT own the `running` flag.
async function runHarvest(deps: DriveDeps, slot: number): Promise<{ enqueued: number }> {
  const settings = getAutopilotSettings();
  const disabled = new Set(settings.disabledBoards || []);
  const enabledBoards = BOARDS.filter((b) => !disabled.has(b.id));
  const searches = getSavedSearches().filter((s) => s.enabled);
  if (!searches.length) { emitStatus(deps, 'No searches set — tell autopilot what kind of job to look for.'); return { enqueued: 0 }; }
  if (!enabledBoards.length) { emitStatus(deps, 'All job sites are toggled off (Core › Rules).'); return { enqueued: 0 }; }

  const runs: { board: ReturnType<typeof boardById>; s: typeof searches[number]; term: string }[] = [];
  for (const s of searches) {
    if (cancelled) break;
    emitStatus(deps, `Thinking up related roles for “${s.query}”…`);
    const terms = await expandTerms(s.query);
    const targets = (s.board && s.board !== 'all') ? enabledBoards.filter((b) => b.id === s.board) : enabledBoards;
    for (const board of targets) for (const term of terms) runs.push({ board, s, term });
  }
  const total = Math.min(runs.length, MAX_RUNS);
  const seen = new Set<string>();
  let idx = 0, scored = 0, enqueued = 0;
  const modes = getBoardModes();
  for (const { board, s, term } of runs.slice(0, MAX_RUNS)) {
    if (cancelled || !board) break;
    if (remainingTarget() <= 0) { emitStatus(deps, 'Daily target reached — pausing search.'); break; }
    idx++;
    const mode = boardMode(board, modes); // 'auto' fills, 'find' surfaces
    emitStatus(deps, `Searching ${board.label}: ${term} (${idx}/${total}) · ${enqueued} found`);
    let postings: any[] = [];
    try { postings = await harvestSearch(board, term, s.location, s.maxAgeMinutes, slot); } catch { postings = []; }
    const fresh = postings.filter((p) => { const k = (p.url || '').split('?')[0]; if (!k || seen.has(k) || isJobKnown(k)) return false; seen.add(k); return true; });
    // score + enqueue as we go so the drive loop can pick auto jobs up immediately
    for (const p of fresh) {
      if (cancelled || scored >= SCORE_BUDGET || remainingTarget() <= 0) break;
      const out = await runClaudeCLI(fitScorePrompt(p), 25000).catch(() => '');
      const { score, reason } = parseFitScore(out); scored++;
      if (score >= settings.minFit) {
        const job = enqueuePosting(p, score, reason, mode);
        if (job) { enqueued++; emitStatus(deps, `${mode === 'find' ? 'Surfaced' : 'Queued'} ${job.company || p.title || 'role'} (fit ${score})`); }
      }
    }
    await sleep(rand(350, 800));
  }
  emitStatus(deps, cancelled ? 'Search stopped' : `Search done · queued ${enqueued}`);
  return { enqueued };
}

// Find only (IPC): just search + queue, shown on the main view.
export async function harvest(deps: DriveDeps): Promise<{ enqueued: number }> {
  if (running) { emitStatus(deps, 'Already running…'); return { enqueued: 0 }; }
  running = true; cancelled = false; paused = false; skipRequested = false;
  try { await ensureBrowser(); return await runHarvest(deps, 0); }
  catch (e: any) { emitStatus(deps, 'Harvest error: ' + String(e?.message || e)); return { enqueued: 0 }; }
  finally { running = false; emitStatus(deps, cancelled ? 'Stopped' : 'Idle'); }
}

// Continuously fill queued jobs on `slot`. While `isHarvesting()` is true, it
// waits for more to appear instead of finishing — that's the parallelism.
async function driveContinuous(deps: DriveDeps, slot: number, isHarvesting: () => boolean): Promise<void> {
  while (!cancelled) {
    await waitIfPaused();
    const next = getAutopilotJobs().find((j) => j.state === 'queued');
    if (next) {
      const fresh = getAutopilotJob(next.id);
      if (fresh) { await fillJob(fresh, deps, slot); await sleep(rand(2000, 5000)); }
      continue;
    }
    if (!isHarvesting()) break;   // nothing queued + search finished → done
    await sleep(1500);            // wait for harvest to enqueue more
  }
}

// Full run: search in the BACKGROUND (hidden view) AND fill found jobs in the
// visible workspace AT THE SAME TIME — same Claude brain, full context.
export async function runFull(deps: DriveDeps): Promise<void> {
  if (running) { emitStatus(deps, 'Already running…'); return; }
  emitStatus(deps, 'Starting…');
  try { await ensureBrowser(); } catch (e: any) { emitStatus(deps, 'Could not open the browser: ' + String(e?.message || e)); return; }

  const hasSearches = getSavedSearches().some((s) => s.enabled);
  const hasQueue = getAutopilotJobs().some((j) => j.state === 'queued' || j.state === 'needs_input');
  if (!hasSearches && !hasQueue) {
    emitStatus(deps, 'Nothing to run yet — add a role under “What I’m looking for”, then Run.');
    return;
  }

  running = true; cancelled = false; paused = false; skipRequested = false;
  let harvesting = hasSearches;
  const harvestP = hasSearches
    ? runHarvest(deps, HARVEST_SLOT).catch((e: any) => { emitStatus(deps, 'Harvest error: ' + String(e?.message || e)); return { enqueued: 0 }; }).finally(() => { harvesting = false; })
    : Promise.resolve({ enqueued: 0 });
  const driveP = driveContinuous(deps, 0, () => harvesting);
  try { await Promise.all([harvestP, driveP]); }
  finally { running = false; emitStatus(deps, cancelled ? 'Stopped' : 'Run complete'); }
}

// Approve a ready job: reopen, ensure at the submit step, click Submit, log it.
export async function approveJob(jobId: string, deps: DriveDeps): Promise<{ ok: boolean; error?: string }> {
  const job = getAutopilotJob(jobId);
  if (!job) return { ok: false, error: 'job not found' };
  if (job.state !== 'ready') return { ok: false, error: 'job not ready (state ' + job.state + ')' };
  updateJob(jobId, { state: 'approved' });
  emitStatus(deps, 'Submitting ' + (job.company || ''), jobId);

  let tab: Tab | null = null;
  try {
    await ensureBrowser();
    tab = await openJob(job.url, handleBridge);
    const ctx = { company: job.company, title: job.title, jobText: '' };
    await ensureInjected(tab, ctx);
    // re-fill quickly (the page is fresh), then advance to the submit step
    for (let step = 0; step < MAX_STEPS; step++) {
      await ensureInjected(tab, ctx);
      let res: any;
      try { res = await evalInTab(tab, 'window.AplydDrive.fillStep()'); } catch { res = null; }
      if (!res || res.noForm) break;
      if (res.footer === 'submit') break;
      if (res.footer === 'next' || res.footer === 'review') {
        await evalInTab(tab, 'window.AplydDrive.clickFooter()').catch(() => {});
        await sleep(rand(1000, 1800));
        continue;
      }
      break;
    }
    updateJob(jobId, { state: 'submitting' });
    const footer = await evalInTab(tab, 'window.AplydDrive.footer()').catch(() => 'none');
    if (footer !== 'submit') throw new Error('no submit button at review');
    await evalInTab(tab, 'window.AplydDrive.clickFooter("submit")').catch(() => {});
    await sleep(2000);
    updateJob(jobId, { state: 'submitted' });
    try { deps.onApply(job.company || 'Unknown', job.title || 'Role', job.url); } catch { /* best effort */ }
    updateJob(jobId, { state: 'logged' });
    emitStatus(deps, 'Submitted ' + (job.company || ''), jobId);
    return { ok: true };
  } catch (e: any) {
    updateJob(jobId, { state: 'ready', error: String(e && e.message ? e.message : e) });
    emitStatus(deps, 'Submit failed: ' + String(e && e.message ? e.message : e), jobId);
    return { ok: false, error: String(e && e.message ? e.message : e) };
  } finally {
    if (tab) await closeTab(tab);
  }
}

export async function approveAll(deps: DriveDeps): Promise<void> {
  const ready = getAutopilotJobs().filter((j) => j.state === 'ready');
  for (const j of ready) {
    if (cancelled) break;
    await approveJob(j.id, deps);
    await sleep(rand(2500, 5000));
  }
}

// Find-mode: open a surfaced job in the workspace view, best-effort autofill one
// pass, then hand it to the user (no auto-advance, no submit). Does NOT close the
// tab — they finish + submit themselves, then "Mark applied".
export async function openForApply(jobId: string, deps: DriveDeps): Promise<{ ok: boolean; error?: string }> {
  const job = getAutopilotJob(jobId);
  if (!job) return { ok: false, error: 'job not found' };
  emitStatus(deps, `Opening ${job.company || 'job'} to apply…`, jobId);
  try {
    await ensureBrowser();
    const tab = await openJob(job.url, handleBridge, 0); // slot 0 = visible workspace
    const ctx = { company: job.company, title: job.title, jobText: '' };
    if (await ensureInjected(tab, ctx)) {
      try { await evalInTab(tab, 'window.AplydDrive.fillStep()'); } catch { /* page may need login first */ }
    }
    emitStatus(deps, `Opened ${job.company || 'job'} — finish & submit, then hit "Mark applied".`, jobId);
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Record that the user applied to a surfaced job (logs into the tracker).
export function markApplied(jobId: string, deps: DriveDeps): { ok: boolean } {
  const job = getAutopilotJob(jobId);
  if (!job) return { ok: false };
  updateJob(jobId, { state: 'logged' });
  try { deps.onApply(job.company || 'Unknown', job.title || 'Role', job.url); } catch { /* best effort */ }
  emitStatus(deps, `Logged ${job.company || 'application'}`, jobId);
  return { ok: true };
}

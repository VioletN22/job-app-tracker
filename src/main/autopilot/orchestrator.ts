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
import { harvestSearch, boardById, BOARDS } from './sources';
import { runClaudeCLI } from '../claude';
import {
  resolveFieldPrompt, tailorAnswerPrompt, parseFieldAction, fitScorePrompt, parseFitScore,
} from '../autopilot-prompts';
import {
  getAnswerBank, getDocuments,
  getAutopilotJobs, getAutopilotJob, updateJob, upsertNeed, getOpenNeeds, lookupAnsweredNeed,
  getSavedSearches, enqueuePosting, isJobKnown, getAutopilotSettings, countLoggedToday,
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

export function isDriveRunning(): boolean { return running; }

function counts(): Record<AutopilotJobState, number> {
  const base: Record<string, number> = {
    queued: 0, filling: 0, needs_input: 0, ready: 0, approved: 0,
    submitting: 0, submitted: 0, logged: 0, skipped: 0, failed: 0,
  };
  for (const j of getAutopilotJobs()) base[j.state] = (base[j.state] || 0) + 1;
  return base as Record<AutopilotJobState, number>;
}
function emitStatus(deps: DriveDeps, message: string, currentJobId: string | null = null): void {
  deps.emit({ running, message, currentJobId, counts: counts() });
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
      const out = await runClaudeCLI(resolveFieldPrompt({ label: body.label, type: body.type, options: body.options }), 40000).catch(() => '');
      return { ok: true, data: parseFieldAction(out) };
    }
    if (p === '/tailor') {
      const out = await runClaudeCLI(tailorAnswerPrompt({ question: body.question, jobText: body.jobText }), 60000).catch(() => '');
      return { ok: true, data: { answer: out.trim() } };
    }
    if (p === '/documents') {
      return { ok: true, data: { documents: getDocuments() } };
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

    let totalFilled = 0;
    const parkedHere: string[] = [];
    let reachedReview = false;

    for (let step = 0; step < MAX_STEPS; step++) {
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
      for (const n of (res.needs || [])) {
        upsertNeed({ label: n.label, kind: n.kind, options: n.options, hint: n.hint });
        if (parkedHere.indexOf(norm(n.label)) < 0) parkedHere.push(norm(n.label));
      }
      updateJob(job.id, { filledCount: totalFilled, needsCount: parkedHere.length });
      emitStatus(deps, 'Filled ' + totalFilled + ' on ' + company + (parkedHere.length ? ' · ' + parkedHere.length + ' need you' : ''), job.id);

      const footer = res.footer;
      if (footer === 'submit') { reachedReview = true; break; }
      if (footer === 'next' || footer === 'review') {
        await evalInTab(tab, 'window.AplydDrive.clickFooter()').catch(() => {});
        await sleep(rand(1200, 2200));
        continue;
      }
      // footer 'none' — nothing more to advance; treat what we filled as the draft
      reachedReview = totalFilled > 0;
      break;
    }

    if (cancelled) { updateJob(job.id, { state: 'queued' }); return; }

    // screenshot the draft for the review card
    try { const shot = await screenshot(tab, job.id); updateJob(job.id, { screenshotPath: shot }); } catch { /* non-fatal */ }

    // still-open parked questions for THIS job decide ready vs needs_input
    const openNorms = new Set(getOpenNeeds().map((n) => n.normLabel));
    const stillOpen = parkedHere.filter((nl) => openNorms.has(nl)).length;
    updateJob(job.id, { needsCount: stillOpen, state: stillOpen > 0 ? 'needs_input' : (reachedReview ? 'ready' : 'failed'), error: reachedReview ? null : 'could not fill any fields' });
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
  running = true; cancelled = false;
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

// ── Harvest: source → dedupe → fit-score → enqueue top-N ─────────────────────
const SCORE_BUDGET = 80; // cap Claude scoring calls per harvest

export async function harvest(deps: DriveDeps): Promise<{ found: number; enqueued: number }> {
  const settings = getAutopilotSettings();
  const disabled = new Set(settings.disabledBoards || []);
  const enabledBoards = BOARDS.filter((b) => !disabled.has(b.id));
  const searches = getSavedSearches().filter((s) => s.enabled);
  if (!searches.length) { emitStatus(deps, 'No searches set — tell autopilot what kind of job to look for.'); return { found: 0, enqueued: 0 }; }
  if (!enabledBoards.length) { emitStatus(deps, 'All job sites are toggled off (Core › Rules).'); return { found: 0, enqueued: 0 }; }
  await ensureBrowser();

  // 1. fan every search out across the enabled boards; dedupe by URL, drop knowns.
  //    A search with a specific board only runs on that board; an "all" search
  //    (the default) researches every enabled site for you.
  const byUrl = new Map<string, any>();
  const runs: { board: ReturnType<typeof boardById>; s: typeof searches[number] }[] = [];
  for (const s of searches) {
    const targets = (s.board && s.board !== 'all') ? enabledBoards.filter((b) => b.id === s.board) : enabledBoards;
    for (const board of targets) runs.push({ board, s });
  }
  for (const { board, s } of runs) {
    if (cancelled || !board) break;
    emitStatus(deps, `Searching ${board.label}: ${s.query}`);
    let postings: any[] = [];
    try { postings = await harvestSearch(board, s.query, s.location, s.maxAgeMinutes); } catch { postings = []; }
    for (const p of postings) {
      const key = (p.url || '').split('?')[0];
      if (!key || byUrl.has(key) || isJobKnown(key)) continue;
      byUrl.set(key, p);
    }
    await sleep(rand(1500, 3500));
  }
  const fresh = [...byUrl.values()];
  emitStatus(deps, `Found ${fresh.length} new postings, scoring…`);

  // 2. fit-score (cap the number of Claude calls), keep those above minFit
  const remainingToday = Math.max(0, settings.dailyTarget - countLoggedToday() - getAutopilotJobs().filter((j) => ['queued', 'needs_input', 'ready'].includes(j.state)).length);
  const target = Math.max(0, remainingToday);
  const scored: { p: any; score: number; reason: string }[] = [];
  for (const p of fresh.slice(0, SCORE_BUDGET)) {
    if (cancelled) break;
    const out = await runClaudeCLI(fitScorePrompt(p), 30000).catch(() => '');
    const { score, reason } = parseFitScore(out);
    scored.push({ p, score, reason });
  }
  scored.sort((a, b) => b.score - a.score);

  // 3. enqueue the best, above threshold, up to the remaining daily target
  let enqueued = 0;
  for (const s of scored) {
    if (target && enqueued >= target) break;
    if (s.score < settings.minFit) continue;
    const job = enqueuePosting(s.p, s.score, s.reason);
    if (job) enqueued++;
  }
  emitStatus(deps, `Queued ${enqueued} of ${fresh.length} (target ${target || '∞'})`);
  return { found: fresh.length, enqueued };
}

// Full cycle: harvest fresh jobs, then drive everything queued.
export async function runFull(deps: DriveDeps): Promise<void> {
  if (running) return;
  running = true; cancelled = false;
  try {
    await ensureBrowser();
    if (getSavedSearches().some((s) => s.enabled)) {
      try { await harvest(deps); } catch (e: any) { emitStatus(deps, 'Harvest error: ' + String(e?.message || e)); }
    }
  } finally {
    running = false;
  }
  if (!cancelled) await runDrive(deps);
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

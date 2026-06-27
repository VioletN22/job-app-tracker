// Shared Claude prompt-building for Autopilot. Used by both the extension bridge
// (autopilot-server) and the in-app cover-letter studio (index IPC) so field
// answers and cover letters draw on the SAME profile: answer bank + portfolio
// links + resume + the learned voice profile.
import fs from 'fs';
import http from 'http';
import https from 'https';
import {
  getAnswerBank, getDocuments, getVoiceNotes, getPortfolioLinks, getSetting,
} from './database';
import type { AnswerBankEntry, JobPosting } from '../shared/types';

// The structured profile (identity / work-auth / salary / locations / links),
// stored as a JSON object in app_settings under 'profile'. Rendered as facts.
export function getProfile(): Record<string, string> {
  try { const raw = getSetting('profile'); return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}
export function structuredProfileBlock(): string {
  const p = getProfile();
  const lines = Object.entries(p).filter(([, v]) => v && String(v).trim()).map(([k, v]) => `- ${k}: ${v}`);
  return lines.length ? lines.join('\n') : '(none yet)';
}

export function factsBlock(bank: AnswerBankEntry[] = getAnswerBank()): string {
  return bank.map((e) => `- ${e.label}${e.context ? ` (${e.context})` : ''}: ${e.value}`).join('\n') || '(none yet)';
}

export function portfolioBlock(): string {
  const links = getPortfolioLinks();
  return links.length ? links.map((p) => `- ${p.label}: ${p.url}`).join('\n') : '(none)';
}

export function voiceBlocks(): { likes: string; avoid: string } {
  const v = getVoiceNotes();
  return {
    likes: v.filter((n) => n.kind !== 'dislike').map((n) => `- ${n.note}`).join('\n') || '(none yet)',
    avoid: v.filter((n) => n.kind === 'dislike').map((n) => `- ${n.note}`).join('\n') || '(none yet)',
  };
}

export function resumeText(): string {
  const resume = getDocuments().find((d) => d.isDefault && d.tags.includes('resume'))
    || getDocuments().find((d) => d.tags.includes('resume'));
  if (resume && /\.(txt|md|markdown)$/i.test(resume.filePath) && fs.existsSync(resume.filePath)) {
    try { return fs.readFileSync(resume.filePath, 'utf-8').slice(0, 8000); } catch { /* ignore */ }
  }
  return '';
}

// Best-effort fetch of a portfolio page, stripped to text, so Claude can ground
// a letter in the actual site content. Short timeout; failure is non-fatal.
export function fetchUrlText(url: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve) => {
    try {
      const lib = url.startsWith('https') ? https : http;
      const req = lib.get(url, { headers: { 'User-Agent': 'aplyd-autopilot' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          fetchUrlText(new URL(res.headers.location, url).toString(), timeoutMs).then(resolve);
          return;
        }
        let data = '';
        res.on('data', (c) => { if (data.length < 200000) data += c; });
        res.on('end', () => {
          const text = data
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 3000);
          resolve(text);
        });
      });
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(''); });
      req.on('error', () => resolve(''));
    } catch { resolve(''); }
  });
}

// Pull a short text snapshot of the default/first portfolio site for grounding.
export async function portfolioSnapshot(): Promise<string> {
  const links = getPortfolioLinks();
  if (!links.length) return '';
  const text = await fetchUrlText(links[0].url);
  return text ? `PORTFOLIO SITE CONTENT (${links[0].url}):\n${text}\n` : '';
}

// Scan ALL portfolio links (up to a few) so a cover letter can reference real work.
export async function portfolioSnapshotAll(): Promise<string> {
  const links = getPortfolioLinks();
  if (!links.length) return '';
  const parts: string[] = [];
  for (const l of links.slice(0, 3)) {
    const t = await fetchUrlText(l.url);
    if (t) parts.push(`PORTFOLIO (${l.label} — ${l.url}):\n${t}`);
  }
  return parts.join('\n\n');
}

// Full resume text — reads .txt/.md directly, extracts .pdf via pdf-parse.
// This is what gives cover letters real grounding (the sync resumeText() above
// only handled plain text).
export async function extractResumeText(): Promise<string> {
  const resume = getDocuments().find((d) => d.isDefault && d.tags.includes('resume'))
    || getDocuments().find((d) => d.tags.includes('resume'));
  if (!resume || !fs.existsSync(resume.filePath)) return '';
  try {
    if (/\.(txt|md|markdown)$/i.test(resume.filePath)) {
      return fs.readFileSync(resume.filePath, 'utf-8').slice(0, 9000);
    }
    if (/\.pdf$/i.test(resume.filePath)) {
      const pdfParse = require('pdf-parse') as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(fs.readFileSync(resume.filePath));
      return (data.text || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 9000);
    }
  } catch { /* ignore — fall back to facts block */ }
  return '';
}

// Shared profile block for cover letters — resume + portfolio + facts + voice.
function profileBlock(opts: { resumeText?: string; portfolioText?: string; extra?: string }): string {
  const { likes, avoid } = voiceBlocks();
  const resume = opts.resumeText ?? resumeText();
  return (
    (resume ? `USER RESUME:\n${resume}\n\n` : '') +
    `PORTFOLIO LINKS:\n${portfolioBlock()}\n` +
    (opts.portfolioText ? `\n${opts.portfolioText}\n` : '') +
    `\nKNOWN FACTS:\n${factsBlock()}\n\n` +
    (opts.extra ? `EXTRA CONTEXT THE USER PROVIDED:\n${opts.extra}\n\n` : '') +
    `WRITING STYLE TO FOLLOW:\n${likes}\nAVOID:\n${avoid}\n\n`
  );
}

export function coverLetterPrompt(opts: { company: string; role: string; jobText?: string; portfolioText?: string; resumeText?: string; extra?: string }): string {
  return (
    `Write a cover letter for the user, first person, tailored to THIS specific role. ` +
    `Ground every claim in the user's real experience (resume, portfolio, known facts) — do NOT invent anything.\n\n` +
    `ROLE: ${opts.role}\nCOMPANY: ${opts.company}\n\n` +
    (opts.jobText ? `JOB POSTING:\n${opts.jobText.slice(0, 4000)}\n\n` : '') +
    profileBlock(opts) +
    `Keep it to 3-4 tight paragraphs, specific and genuine, no corporate fluff or clichés. ` +
    `Respond with ONLY the cover letter body (no header, address block, or commentary).`
  );
}

// Studio mode: draft the letter AND surface up to 2 clarifying questions when the
// job/company has something important the profile doesn't cover. Returns JSON.
export function coverLetterStudioPrompt(opts: { company: string; role: string; jobText?: string; portfolioText?: string; resumeText?: string; extra?: string }): string {
  return (
    `Write a cover letter for the user, first person, tailored to THIS role, grounded ONLY in their real experience (resume, portfolio, facts) — invent nothing.\n\n` +
    `ROLE: ${opts.role}\nCOMPANY: ${opts.company}\n\n` +
    (opts.jobText ? `JOB POSTING:\n${opts.jobText.slice(0, 4000)}\n\n` : '') +
    profileBlock(opts) +
    `3-4 tight paragraphs, specific and genuine, no clichés.\n\n` +
    `ALSO: if the job or company emphasises something important that the user's profile does NOT clearly cover (a specific tool, domain, or experience worth addressing), include up to 2 short clarifying questions whose answers would make the letter stronger. If nothing is missing, return an empty list.\n\n` +
    `Respond with ONLY valid JSON: {"letter":"<the cover letter body>","questions":["<question 1>","<question 2>"]}`
  );
}

export function refineCoverLetterPrompt(opts: { company: string; role: string; body: string; feedback: string }): string {
  const { likes, avoid } = voiceBlocks();
  return (
    `Revise the cover letter below based on the user's feedback. Change ONLY what the feedback asks for; keep every other sentence exactly as it is so the change is surgical. Stay grounded in real experience.\n\n` +
    `ROLE: ${opts.role} @ ${opts.company}\n\n` +
    `CURRENT DRAFT:\n${opts.body}\n\n` +
    `USER FEEDBACK:\n${opts.feedback}\n\n` +
    `EXISTING STYLE PREFERENCES:\n${likes}\nAVOID:\n${avoid}\n\n` +
    `Respond with ONLY the full revised cover letter body.`
  );
}

export function resolveFieldPrompt(opts: { label: string; type?: string; options?: string[] }): string {
  const optionsLine = Array.isArray(opts.options) && opts.options.length
    ? `It is a ${opts.type || 'choice'} with these options: ${opts.options.join(' | ')}. Your value MUST be exactly one of them.\n` : '';
  return (
    `You are filling out a job-application form field on the user's behalf.\n` +
    `Field label: "${opts.label}"\nField type: ${opts.type || 'text'}\n${optionsLine}` +
    `Profile:\n${structuredProfileBlock()}\nKnown facts about the user:\n${factsBlock()}\nPortfolio:\n${portfolioBlock()}\n\n` +
    `NAME HANDLING (important): the profile may list separate "Legal first name", "Legal last name", and "Preferred name".\n` +
    `- Use the LEGAL name when the field asks for a legal name, full legal name, government/official name, real name, name as it appears on your passport/ID, OR a plain "First name"/"Given name"/"Last name"/"Surname"/"Full name" on an application form. For a single full-name field, combine legal first + legal last.\n` +
    `- Use the PREFERRED name only when the field explicitly asks for a preferred name, display name, nickname, "name you go by", or "what should we call you".\n` +
    `- When unsure on a job application, default to the legal name.\n\n` +
    `If you can confidently fill this from the known facts (or it's a standard field like a yes/no work-authorization the facts answer), respond ONLY with JSON: {"action":"fill","value":"..."}.\n` +
    `If filling it would require personal info NOT present in the facts, respond ONLY with JSON: {"action":"ask","hint":"<one-line plain description of what's being asked>"}.`
  );
}

export function tailorAnswerPrompt(opts: { question: string; jobText?: string }): string {
  const { likes, avoid } = voiceBlocks();
  const resume = resumeText();
  return (
    `Write the user's answer to a job-application question, first person, tailored to THIS role and grounded only in the user's real experience (don't invent facts).\n\n` +
    `QUESTION:\n${opts.question}\n\n` +
    (opts.jobText ? `JOB POSTING (for tailoring):\n${String(opts.jobText).slice(0, 4000)}\n\n` : '') +
    (resume ? `USER RESUME:\n${resume}\n\n` : '') +
    `PORTFOLIO:\n${portfolioBlock()}\n\nKNOWN FACTS:\n${factsBlock()}\n\n` +
    `WRITING STYLE TO FOLLOW:\n${likes}\nAVOID:\n${avoid}\n\n` +
    `Be concise and specific. No corporate fluff. Respond with ONLY the answer text, no preamble or quotes.`
  );
}

// Score a harvested posting against the user's real background. Cheap + strict:
// we only auto-apply to good matches, so a wrong-direction role should score low.
export function fitScorePrompt(p: JobPosting): string {
  const resume = resumeText();
  return (
    `Rate how well THIS job fits the user, 0-100, for the purpose of auto-applying on their behalf.\n` +
    `Score high only for roles the user is genuinely a plausible candidate for (right field, right seniority, location/remote workable). Score low for wrong field, wrong seniority, or clear dealbreakers.\n\n` +
    `JOB:\nTitle: ${p.title}\nCompany: ${p.company}\nLocation: ${p.location}\n${p.snippet ? 'Snippet: ' + p.snippet.slice(0, 600) + '\n' : ''}\n` +
    `USER PROFILE:\n${structuredProfileBlock()}\n\nUSER FACTS:\n${factsBlock()}\n` +
    (resume ? `\nUSER RESUME:\n${resume.slice(0, 4000)}\n` : '') +
    `\nRespond ONLY with JSON: {"score": <0-100 integer>, "reason": "<≤12 words>"}.`
  );
}
export function parseFitScore(out: string): { score: number; reason: string } {
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      const score = Math.max(0, Math.min(100, Math.round(Number(j.score))));
      if (!Number.isNaN(score)) return { score, reason: String(j.reason || '').slice(0, 120) };
    }
  } catch { /* fall through */ }
  return { score: 0, reason: 'could not score' };
}

// Seed the structured profile from the resume + known facts. Returns a flat
// map of standard application fields. Only fields the resume/facts actually
// support are included (no guessing personal/legal details).
export function profileSeedPrompt(): string {
  const resume = resumeText();
  return (
    `Extract a structured job-application profile from the user's materials below.\n` +
    `Return ONLY JSON: a flat object whose keys are standard application fields and whose values are the user's answers. Use these keys where the materials support them: ` +
    `"Legal first name", "Legal last name", "Preferred name", "Full name", "Email", "Phone", "Location", "Work authorization", "Require visa sponsorship", "Years of experience", "Current title", "LinkedIn", "GitHub", "Portfolio", "Salary expectation", "Notice period", "Open to remote".\n` +
    `For names: "Legal first name"/"Legal last name" are the real/legal name as on official ID; "Preferred name" is the name the person goes by if different (e.g. a chosen first name). If the materials only show one name, set the legal fields and leave Preferred name out.\n` +
    `Omit any key you cannot fill from the materials (do not invent). Keep values short.\n\n` +
    (resume ? `RESUME:\n${resume.slice(0, 6000)}\n\n` : '') +
    `KNOWN FACTS:\n${factsBlock()}\n\nPORTFOLIO:\n${portfolioBlock()}`
  );
}
export function parseProfileSeed(out: string): Record<string, string> {
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(j)) {
        if (v != null && String(v).trim()) clean[k] = String(v).trim().slice(0, 200);
      }
      return clean;
    }
  } catch { /* fall through */ }
  return {};
}

// The in-workspace co-pilot: same brain that does the applying, with full context
// on the user + their live autopilot run, here to help refine searches + apply.
export function copilotPrompt(stateContext: string, history: { role: string; content: string }[]): string {
  const { likes, avoid } = voiceBlocks();
  const convo = history.map((m) => (m.role === 'user' ? 'USER: ' : 'YOU: ') + m.content).join('\n\n');
  return (
    `You are aplyd's autopilot co-pilot — the same assistant that researches jobs and auto-fills applications for this user, now chatting with them inside the app. You ALWAYS have their full context (below). Help them decide what roles to search for, sharpen keywords/location/freshness, choose which job sites to use, understand why something failed, and improve their answers/voice. Be concise and concrete: give specific suggestions they can act on. You cannot click buttons yet, so when you recommend a change, tell them exactly what to set (e.g. 'add a search: "Backend engineer", Sydney, last 24h' or 'turn off Indeed in Core > Rules').\n\n` +
    `USER PROFILE:\n${structuredProfileBlock()}\n\nKNOWN FACTS:\n${factsBlock()}\n\nPORTFOLIO:\n${portfolioBlock()}\n\nWRITING VOICE — likes:\n${likes}\nAVOID:\n${avoid}\n\n` +
    `CURRENT AUTOPILOT STATE:\n${stateContext}\n\n` +
    `CONVERSATION SO FAR:\n${convo}\n\nYOU:`
  );
}

// Related job titles for the search box (and run-time expansion). Uses the
// user's profile so suggestions fit their actual background + seniority.
export function relatedRolesPrompt(text: string, count = 8): string {
  return (
    `The user is searching job boards. Given what they typed and their background, suggest ${count} closely-related job TITLES they'd also want to search for: synonyms, common variants, and adjacent roles/seniorities they'd plausibly be hired for. Judge fit from their profile.\n\n` +
    `THEY TYPED: ${text}\n\nUSER PROFILE:\n${structuredProfileBlock()}\nKNOWN FACTS:\n${factsBlock()}\n\n` +
    `Respond ONLY with a JSON array of short title strings, most relevant first. Do not repeat what they already typed.`
  );
}
export function parseRoles(out: string): string[] {
  try {
    const m = out.match(/\[[\s\S]*\]/);
    if (m) { const j = JSON.parse(m[0]); if (Array.isArray(j)) return j.map((x) => String(x).trim()).filter(Boolean).slice(0, 12); }
  } catch { /* fall through */ }
  return [];
}

// Pick which resume variant best fits a job (used when a resume upload appears
// and the user keeps multiple variants, e.g. software vs ecommerce).
export function resumePickPrompt(variants: { label: string; focus: string }[], job: { title?: string; jobText?: string }): string {
  const list = variants.map((v, i) => `${i}: "${v.label}"${v.focus ? ` — focus: ${v.focus}` : ''}`).join('\n');
  return (
    `Pick which resume variant best fits this job. Choose the one whose focus most matches the role/company.\n\n` +
    `RESUME VARIANTS:\n${list}\n\n` +
    `JOB:\nTitle: ${job.title || ''}\n${job.jobText ? 'Description: ' + String(job.jobText).slice(0, 3000) : ''}\n\n` +
    `Respond ONLY with JSON: {"index": <0-based index of the best variant>}.`
  );
}
export function parseResumePick(out: string, n: number): number {
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) { const j = JSON.parse(m[0]); const i = Number(j.index); if (Number.isInteger(i) && i >= 0 && i < n) return i; }
  } catch { /* fall through */ }
  return -1;
}

export function parseFieldAction(out: string): { action: 'fill' | 'ask'; value?: string; hint?: string } {
  try {
    const m = out.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (j.action === 'fill' && typeof j.value === 'string') return { action: 'fill', value: j.value };
      if (j.action === 'ask') return { action: 'ask', hint: j.hint || '' };
    }
  } catch { /* fall through */ }
  return { action: 'ask' };
}

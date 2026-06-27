// Parse curated GitHub "job list" repos (e.g. SimplifyJobs/New-Grad-Positions)
// whose README is a markdown table: | Company | Role | Location | Application | Age |
// Apply links go straight to the company ATS, so these enqueue as auto-mode.
import https from 'https';
import type { JobPosting } from '../../shared/types';

export interface RepoRef { owner: string; repo: string; branch?: string }

// "owner/repo", a github.com URL, or a raw URL → {owner, repo}.
export function parseRepoRef(input: string): RepoRef | null {
  const s = (input || '').trim();
  if (!s) return null;
  let m = s.match(/github(?:usercontent)?\.com\/([^/\s]+)\/([^/\s]+)/i);
  if (!m) m = s.match(/^([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

function get(url: string, timeoutMs = 12000): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const req = https.get(url, { headers: { 'User-Agent': 'aplyd' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300) { res.resume(); return resolve(null); }
        let d = ''; res.on('data', (c) => (d += c)); res.on('end', () => resolve(d));
      });
      req.on('error', () => resolve(null));
      req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}

const splitRow = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const allUrls = (s: string) => {
  const hrefs = [...(s || '').matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  const bare = [...(s || '').matchAll(/https?:\/\/[^\s)\]"']+/g)].map((m) => m[0]);
  return [...hrefs, ...bare];
};
// the apply link from an Application cell — prefer a direct ATS link over a
// simplify.jobs/c (company page); a simplify.jobs/p (apply redirect) is fine.
const applyUrl = (s: string) => {
  const urls = allUrls(s).filter((u) => !/simplify\.jobs\/c\//.test(u));
  return urls.find((u) => !/simplify\.jobs/.test(u)) || urls[0] || '';
};
const stripTags = (s: string) => (s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
  .replace(/[*`]/g, '')
  .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
  .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}✅❌🔒↳]/gu, '')
  .replace(/\s+/g, ' ').trim();

// HTML <table> format (e.g. SimplifyJobs): rows of <td> cells.
function parseHtmlTable(text: string, source: string): JobPosting[] {
  const rows = [...text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  if (!rows.length) return [];
  // header → column order
  let cols: string[] = [];
  for (const r of rows) { const ths = [...r.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => stripTags(m[1]).toLowerCase()); if (ths.length && ths.some((c) => /company/.test(c))) { cols = ths; break; } }
  if (!cols.length) cols = ['company', 'role', 'location', 'application', 'age'];
  const idx = (names: string[]) => { const i = cols.findIndex((c) => names.some((n) => c.includes(n))); return i; };
  const ci = { company: Math.max(0, idx(['company'])), role: Math.max(1, idx(['role', 'position', 'title'])), loc: idx(['location']), app: idx(['application', 'apply', 'link']) };
  const out: JobPosting[] = [];
  let lastCompany = '';
  for (const r of rows) {
    const tds = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (tds.length < 2) continue;
    if (/🔒|closed/i.test(r)) continue;
    let company = stripTags(tds[ci.company] || '');
    if (!company || company === '↳') company = lastCompany; else lastCompany = company;
    const role = stripTags(tds[ci.role] || '');
    const loc = ci.loc >= 0 ? stripTags(tds[ci.loc] || '') : '';
    const url = applyUrl(ci.app >= 0 ? (tds[ci.app] || '') : r) || applyUrl(r);
    if (!url || !role) continue;
    out.push({ url, title: role, company, location: loc, source });
  }
  return out;
}

// Markdown | table | format (other repos).
function parseMarkdownTable(text: string, source: string): JobPosting[] {
  const lines = text.split('\n');
  let hi = -1; let cols: string[] = [];
  for (let i = 0; i < lines.length; i++) { const l = lines[i]; if (l.includes('|') && /company/i.test(l) && /role|position|title/i.test(l)) { hi = i; cols = splitRow(l).map((c) => c.toLowerCase()); break; } }
  if (hi < 0) return [];
  const idx = (names: string[]) => cols.findIndex((c) => names.some((n) => c.includes(n)));
  const ci = { company: idx(['company']), role: idx(['role', 'position', 'title']), loc: idx(['location']), app: idx(['application', 'apply', 'link']) };
  const out: JobPosting[] = [];
  let lastCompany = '';
  for (let i = hi + 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim().startsWith('|')) break;
    if (/🔒|closed/i.test(l)) continue;
    const cells = splitRow(l);
    if (cells.length < 2) continue;
    let company = ci.company >= 0 ? stripTags(cells[ci.company]) : '';
    if (!company || company === '↳') company = lastCompany; else lastCompany = company;
    const role = ci.role >= 0 ? stripTags(cells[ci.role]) : '';
    const loc = ci.loc >= 0 ? stripTags(cells[ci.loc]) : '';
    const url = applyUrl(ci.app >= 0 ? cells[ci.app] : l) || applyUrl(l);
    if (!url || !role) continue;
    out.push({ url, title: role, company, location: loc, source });
  }
  return out;
}

function parseTable(text: string, source: string): JobPosting[] {
  const html = parseHtmlTable(text, source);
  if (html.length) return html;
  return parseMarkdownTable(text, source);
}

// Fetch + parse a repo's job table (tries dev/main/master branches).
export async function fetchRepoJobs(ref: RepoRef, max = 120): Promise<JobPosting[]> {
  for (const br of [ref.branch, 'dev', 'main', 'master'].filter(Boolean) as string[]) {
    const text = await get(`https://raw.githubusercontent.com/${ref.owner}/${ref.repo}/${br}/README.md`);
    if (text) { const jobs = parseTable(text, `github:${ref.owner}/${ref.repo}`); if (jobs.length) return jobs.slice(0, max); }
  }
  return [];
}

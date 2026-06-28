// Autopilot sourcing — harvest job postings from board searches by driving the
// in-app browser to each search URL and scraping the result cards. Best-effort +
// selector-tolerant: we lean on fit-scoring + dedup downstream, so a noisy scrape
// is fine. New board = add a Board entry.
//
// Freshness: each board translates a requested "max age" as finely as it can.
// LinkedIn supports seconds (f_TPR=r<sec>), so "5 minutes" really works there.
// Most others are day-granular, so they clamp to >=1 day + sort newest-first.
import { openJob, evalInTab, closeTab, ensureBrowser, BridgeMsg } from './driver';
import type { JobPosting } from '../../shared/types';

const noBridge = async (_m: BridgeMsg) => ({ ok: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;
const days = (m: number) => Math.max(1, Math.ceil(m / 1440)); // minutes -> whole days, min 1

interface BoardScrape {
  anchor: string;
  card: string;
  title: string;
  company: string;
  location: string;
  source: string;
}

export interface Board {
  id: string;
  label: string;
  // maxAgeMinutes === 0 means "any age"; boards still sort newest-first.
  buildUrl: (query: string, location: string, maxAgeMinutes: number) => string;
  scrape: BoardScrape;
  // finest freshness this board honours, shown in the UI as a caveat
  granularity: 'minute' | 'day' | 'none';
  // 'auto' = agent fills + you approve; 'find' = agent surfaces, you open & apply.
  // Defaults to 'auto' when omitted.
  mode?: 'auto' | 'find';
  region?: 'AU' | 'global' | 'US';
  login?: boolean;   // applying needs a login (informational)
  note?: string;     // shown in the catalog
}

// One generic scraper, parameterized per board. Returns plain JSON (serializable).
function scrapeExpr(s: BoardScrape): string {
  return `(function(){
    var out=[], seen={};
    var anchors=[].slice.call(document.querySelectorAll(${JSON.stringify(s.anchor)}));
    anchors.forEach(function(a){
      var href=a.href||''; if(!href) return;
      var key=href.split('?')[0]; if(seen[key]) return; seen[key]=1;
      var card=a.closest(${JSON.stringify(s.card)})||a.parentElement;
      var text=function(sel){ if(!card||!sel) return ''; var e=card.querySelector(sel); return e?(e.innerText||'').trim():''; };
      var title=(a.innerText||'').trim()||text(${JSON.stringify(s.title)});
      out.push({
        url:key,
        title:title,
        company:text(${JSON.stringify(s.company)}),
        location:text(${JSON.stringify(s.location)}),
        source:${JSON.stringify(s.source)},
        snippet:card?(card.innerText||'').replace(/\\s+/g,' ').slice(0,300):''
      });
    });
    return out;
  })()`;
}

export const BOARDS: Board[] = [
  {
    id: 'linkedin', label: 'LinkedIn', granularity: 'minute',
    // Force the Australia geo (geoId 101452733) so results are AU-based (Sydney /
    // hybrid + AU-remote), not the US default. A typed city still rides in &location.
    buildUrl: (q, l, m) =>
      `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}&location=${enc(l || 'Australia')}&geoId=101452733&sortBy=DD${m ? `&f_TPR=r${m * 60}` : ''}`,
    scrape: {
      anchor: 'a[href*="/jobs/view/"]',
      card: '.job-card-container, .base-card, .base-search-card, li',
      title: '.job-card-list__title, .base-search-card__title, .artdeco-entity-lockup__title',
      company: '.job-card-container__company-name, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle',
      location: '.job-card-container__metadata-item, .job-search-card__location, .artdeco-entity-lockup__caption',
      source: 'linkedin',
    },
  },
  {
    id: 'indeed', label: 'Indeed (AU)', granularity: 'day',
    buildUrl: (q, l, m) =>
      `https://au.indeed.com/jobs?q=${enc(q)}${l ? `&l=${enc(l)}` : ''}&sort=date${m ? `&fromage=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a.jcs-JobTitle, a[id^="job_"], a[href*="/rc/clk"], a[href*="/viewjob"]',
      card: '.job_seen_beacon, .result, td.resultContent, li',
      title: 'h2.jobTitle, .jcs-JobTitle',
      company: '[data-testid="company-name"], .companyName',
      location: '[data-testid="text-location"], .companyLocation',
      source: 'indeed',
    },
  },
  {
    id: 'seek', label: 'Seek (AU)', granularity: 'day',
    buildUrl: (q, l, m) =>
      `https://www.seek.com.au/jobs?keywords=${enc(q)}${l ? `&where=${enc(l)}` : ''}&sortmode=ListedDate${m ? `&daterange=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a[data-automation="jobTitle"], a[href*="/job/"]',
      card: 'article, [data-automation="normalJob"]',
      title: '[data-automation="jobTitle"]',
      company: '[data-automation="jobCompany"]',
      location: '[data-automation="jobLocation"]',
      source: 'seek',
    },
  },
  {
    id: 'glassdoor', label: 'Glassdoor (AU)', granularity: 'day', region: 'AU',
    buildUrl: (q, l, m) =>
      `https://www.glassdoor.com.au/Job/jobs.htm?sc.keyword=${enc(q)}&locKeyword=${enc(l || 'Australia')}&sortBy=date_desc${m ? `&fromAge=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a[data-test="job-link"], a[href*="/job-listing/"], a[href*="/partner/jobListing"]',
      card: 'li.react-job-listing, [data-test="jobListing"], li',
      title: '[data-test="job-title"], .jobTitle',
      company: '[data-test="employer-name"], .employerName',
      location: '[data-test="emp-location"], .location',
      source: 'glassdoor',
    },
  },
  {
    id: 'ziprecruiter', label: 'ZipRecruiter (US)', granularity: 'day', region: 'US',
    buildUrl: (q, l, m) =>
      `https://www.ziprecruiter.com/jobs-search?search=${enc(q)}${l ? `&location=${enc(l)}` : ''}${m ? `&days=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a.job_link, a[href*="/jobs/"], article a[href]',
      card: 'article.job_result, .job_content, li',
      title: 'h2, .just_posted, .job_title',
      company: '.company_name, [data-testid="job-card-company"]',
      location: '.location, [data-testid="job-card-location"]',
      source: 'ziprecruiter',
    },
  },
  {
    id: 'adzuna', label: 'Adzuna (AU)', granularity: 'day',
    buildUrl: (q, l, m) =>
      `https://www.adzuna.com.au/search?q=${enc(q)}${l ? `&loc=${enc(l)}` : ''}&sort_by=date&sort_dir=down${m ? `&max_days_old=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a[href*="/details/"], a[href*="/ad/"], h2 a',
      card: 'article, .job, li',
      title: 'h2',
      company: '.ui-company, [data-testid="company"]',
      location: '.ui-location, [data-testid="location"]',
      source: 'adzuna',
    },
  },
  {
    id: 'jora', label: 'Jora (AU)', granularity: 'day',
    buildUrl: (q, l, m) =>
      `https://au.jora.com/j?q=${enc(q)}${l ? `&l=${enc(l)}` : ''}&sp=facet_listed_date${m ? `&p=&st=date&listed=${days(m)}` : ''}`,
    scrape: {
      anchor: 'a.job-link, a[href*="/job/"], h2 a',
      card: 'article, .job-card, .result, li',
      title: 'h2, .job-title',
      company: '.company, .job-company',
      location: '.location, .job-location',
      source: 'jora',
    },
  },
  {
    id: 'weworkremotely', label: 'We Work Remotely (remote)', granularity: 'none',
    buildUrl: (q) => `https://weworkremotely.com/remote-jobs/search?term=${enc(q)}`,
    scrape: {
      anchor: 'li a[href*="/remote-jobs/"], section.jobs li a',
      card: 'li',
      title: '.title, span.title',
      company: '.company, span.company',
      location: '.region, .company',
      source: 'weworkremotely',
    },
  },

  // ── AU early-career boards (FIND mode: surface, don't auto-fill) ────────────
  {
    id: 'gradconnection', label: 'GradConnection', granularity: 'none', mode: 'find', region: 'AU', login: true,
    note: 'Grad / junior roles (1,100+). Logins + custom forms, so aplyd finds the best fits for you to open & apply.',
    buildUrl: (q, l) => `https://au.gradconnection.com/jobs/?keywords=${enc(q)}${l ? `&locations=${enc(l)}` : ''}`,
    scrape: {
      // verified against live SSR HTML (2026-06-27)
      anchor: 'a.box-header-title',
      card: '.box_container, .box-content, article, li',
      title: 'a.box-header-title, .box-header-title',
      company: '.box-employer-name',
      location: '.location-name',
      source: 'gradconnection',
    },
  },
  {
    id: 'prosple', label: 'Prosple', granularity: 'none', mode: 'find', region: 'AU', login: true,
    note: 'AU graduate programs + internships (1,700+), deadline-driven.',
    // correct search path is /search-jobs (jobs render client-side; the embedded
    // browser sees them after JS — selectors best-effort, tune on first real run)
    buildUrl: (q, l) => `https://au.prosple.com/search-jobs?keywords=${enc(q)}${l ? `&locations=${enc(l)}` : ''}`,
    scrape: {
      anchor: 'a[href*="/graduate-employers/"][href*="/jobs"], a[href*="/job/"], h3 a, h2 a',
      card: 'article, [class*="SearchResult"], [class*="card"], li',
      title: 'h2, h3',
      company: '[class*="employer"], [class*="company"]',
      location: '[class*="location"]',
      source: 'prosple',
    },
  },
  {
    id: 'wellfound', label: 'Wellfound (startups)', granularity: 'none', mode: 'find', region: 'global', login: true,
    note: 'Startups + smaller companies (ex-AngelList). Needs login; aplyd surfaces matches.',
    buildUrl: (q, l) => `https://wellfound.com/jobs?q=${enc(q)}${l ? `&l=${enc(l)}` : ''}`,
    scrape: {
      anchor: 'a[href*="/jobs/"], a[href*="/company/"][href*="/jobs/"]',
      card: 'div[data-test="JobSearchResult"], article, li',
      title: 'h2, [data-test="job-title"]',
      company: '[data-test="startup-link"], .company',
      location: '.location',
      source: 'wellfound',
    },
  },
  {
    id: 'hatch', label: 'Hatch (early-career, AU)', granularity: 'none', mode: 'find', region: 'AU', login: true,
    note: 'AU early-career, skills/values matching.',
    buildUrl: (q, l) => `https://www.hatch.team/jobs?search=${enc(q)}${l ? `&location=${enc(l)}` : ''}`,
    scrape: {
      anchor: 'a[href*="/jobs/"], a[href*="/job/"]',
      card: 'article, .job-card, li',
      title: 'h2, h3, .job-title',
      company: '.company, .employer',
      location: '.location',
      source: 'hatch',
    },
  },
];

export function boardById(id: string): Board | null {
  return BOARDS.find((b) => b.id === id) || null;
}

// A board's effective mode (default 'auto'); the user can override per board.
export function boardMode(b: Board, overrides?: Record<string, string>): 'auto' | 'find' {
  const o = overrides && overrides[b.id];
  if (o === 'auto' || o === 'find') return o;
  return b.mode || 'auto';
}

// Keep AU + AU/global-remote postings; drop ones clearly located elsewhere (US etc.).
// Unknown/blank location is kept (the fit-score step judges it). This is the AU-only
// guard the user wants — Sydney / hybrid + remote-within-Australia.
export function isAuOrRemote(loc: string): boolean {
  const s = (loc || '').trim().toLowerCase();
  if (!s) return true; // unknown → let fit-scoring decide
  if (/australia|sydney|melbourne|brisbane|perth|adelaide|canberra|hobart|gold coast|newcastle|wollongong|geelong|\bnsw\b|\bvic\b|\bqld\b|\baus\b|\baustralian?\b/.test(s)) return true;
  const elsewhere = /united states|\busa\b|\bu\.s\.|united kingdom|\buk\b|canada|india|singapore|germany|ireland|philippines|new york|san francisco|los angeles|london|austin|seattle|boston|chicago|toronto|bangalore|bengaluru|berlin|dublin|,\s*[a-z]{2}\b/.test(s);
  if (/remote|anywhere|work from home|\bwfh\b/.test(s) && !elsewhere) return true; // AU/global remote
  return !elsewhere;
}

// LIVE company research for cover letters, using the in-app browser (a real
// fingerprint, so search engines render results instead of a bot-challenge). We
// Bing-search the company, open a couple of their own pages, and return the text —
// what they do, their values, where they're heading. Best-effort; '' on failure.
export async function researchCompany(company: string, jobUrl = '', slot = 2): Promise<string> {
  const name = (company || '').trim();
  if (!name) return '';
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const year = new Date().getFullYear();
  const junk = /bing\.|microsoft\.|msn\.|go\.microsoft|duckduckgo|google\.|facebook\.|twitter\.|x\.com|instagram\.|youtube\.|tiktok\.|wikipedia\.|glassdoor\.|indeed\.|seek\.|linkedin\.com\/(?!company)|crunchbase\.|zoominfo|reddit\./i;
  const linksExpr =
    '(function(){var out=[];var seen={};' +
    'document.querySelectorAll(\'#b_results li.b_algo a[href^="http"], #b_results h2 a[href^="http"], main a[href^="http"]\').forEach(function(a){' +
    'var h=a.href;if(!h||seen[h])return;seen[h]=1;out.push(h);});return out.slice(0,12);})()';
  const textExpr = '(document.body?document.body.innerText:"").replace(/\\s+/g," ").slice(0,2200)';
  const collected: string[] = [];
  let tab: any = null;
  try {
    await ensureBrowser();
    // 1) search → candidate links
    const q = enc(name + ' company about values mission ' + year + ' strategy');
    tab = await openJob('https://www.bing.com/search?q=' + q, noBridge, slot);
    await sleep(1200);
    let links: string[] = [];
    try { links = await evalInTab(tab, linksExpr); } catch { links = []; }
    if (jobUrl) { try { links.unshift(new URL(jobUrl).origin); } catch { /* ignore */ } }
    const score = (u: string) => {
      let s = 0;
      try { if (new URL(u).host.toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug.slice(0, 8))) s += 5; } catch { /* ignore */ }
      if (/about|values|mission|culture|who-we-are|company|careers|annual|investor|impact|sustainab|strateg/i.test(u)) s += 2;
      return s;
    };
    const ranked = Array.from(new Set(links.filter((u) => /^https?:/.test(u) && !junk.test(u))))
      .sort((a, b) => score(b) - score(a)).slice(0, 4);
    // 2) read the top couple of their own pages
    for (const u of ranked) {
      if (collected.length >= 2) break;
      try {
        const t2 = await openJob(u, noBridge, slot);
        await sleep(900);
        const txt = await evalInTab(t2, textExpr).catch(() => '');
        if (txt && String(txt).length > 200) collected.push('SOURCE ' + u + ':\n' + String(txt));
      } catch { /* skip this page */ }
    }
  } catch { /* research is best-effort */ }
  finally { if (tab) { try { await closeTab(tab); } catch { /* ignore */ } } }
  return collected.join('\n\n').slice(0, 3500);
}

// Run one board search and return normalized postings (best-effort, capped).
export async function harvestSearch(board: Board, query: string, location: string, maxAgeMinutes = 0, slot = 0, max = 40): Promise<JobPosting[]> {
  await ensureBrowser();
  const url = board.buildUrl(query, location, maxAgeMinutes);
  const tab = await openJob(url, noBridge, slot);
  try {
    // nudge lazy lists to render more cards (kept short for speed)
    for (let i = 0; i < 2; i++) {
      await evalInTab(tab, 'window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
      await sleep(650);
    }
    const items = await evalInTab(tab, scrapeExpr(board.scrape)).catch(() => []);
    const arr: JobPosting[] = Array.isArray(items) ? items : [];
    return arr
      .filter((p) => p && p.url && /^https?:/.test(p.url) && (p.title || '').trim())
      .filter((p) => isAuOrRemote(p.location || ''))
      .slice(0, max);
  } finally {
    await closeTab(tab);
  }
}

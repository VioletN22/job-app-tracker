// Autopilot sourcing — harvest job postings from board searches by driving the
// dedicated Chrome (logged in) to each search URL and scraping the result cards.
// Best-effort + selector-tolerant: we lean on fit-scoring + dedup downstream, so
// a noisy scrape is fine. New boards = add a Board entry.
import { openJob, evalInTab, closeTab, ensureBrowser, BridgeMsg } from './driver';
import type { JobPosting } from '../../shared/types';

const noBridge = async (_m: BridgeMsg) => ({ ok: false });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const enc = encodeURIComponent;

interface BoardScrape {
  anchor: string;   // selector for the per-result link
  card: string;     // closest container selector
  title: string;    // fallback title selector within the card
  company: string;
  location: string;
  source: string;
}

export interface Board {
  id: string;
  label: string;
  buildUrl: (query: string, location: string) => string;
  scrape: BoardScrape;
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
    id: 'linkedin', label: 'LinkedIn',
    buildUrl: (q, l) => `https://www.linkedin.com/jobs/search/?keywords=${enc(q)}${l ? `&location=${enc(l)}` : ''}`,
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
    id: 'seek', label: 'Seek (AU)',
    buildUrl: (q, l) => `https://www.seek.com.au/jobs?keywords=${enc(q)}${l ? `&where=${enc(l)}` : ''}`,
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
    id: 'indeed', label: 'Indeed (AU)',
    buildUrl: (q, l) => `https://au.indeed.com/jobs?q=${enc(q)}${l ? `&l=${enc(l)}` : ''}`,
    scrape: {
      anchor: 'a.jcs-JobTitle, a[id^="job_"], a[href*="/rc/clk"], a[href*="/viewjob"]',
      card: '.job_seen_beacon, .result, td.resultContent, li',
      title: 'h2.jobTitle, .jcs-JobTitle',
      company: '[data-testid="company-name"], .companyName',
      location: '[data-testid="text-location"], .companyLocation',
      source: 'indeed',
    },
  },
];

export function boardById(id: string): Board | null {
  return BOARDS.find((b) => b.id === id) || null;
}

// Run one board search and return normalized postings (best-effort, capped).
export async function harvestSearch(board: Board, query: string, location: string, max = 40): Promise<JobPosting[]> {
  await ensureBrowser();
  const url = board.buildUrl(query, location);
  const tab = await openJob(url, noBridge);
  try {
    // nudge lazy lists to render more cards
    for (let i = 0; i < 3; i++) {
      await evalInTab(tab, 'window.scrollTo(0, document.body.scrollHeight)').catch(() => {});
      await sleep(1200);
    }
    const items = await evalInTab(tab, scrapeExpr(board.scrape)).catch(() => []);
    const arr: JobPosting[] = Array.isArray(items) ? items : [];
    // keep only entries with a usable URL + title
    return arr.filter((p) => p && p.url && /^https?:/.test(p.url) && (p.title || '').trim()).slice(0, max);
  } finally {
    await closeTab(tab);
  }
}

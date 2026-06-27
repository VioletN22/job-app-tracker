# AU early-career boards, find-&-surface, resume variants — design

Date: 2026-06-27
Status: approved (mockups signed off), building
Context: extends the autopilot sourcing/drive system. Goal is to get Violet into
the right, less-saturated AU early-career funnels (diagnosis: her resume is
strong; the *method* — LinkedIn-only, late, mistargeted — is the problem), while
keeping it quality-first (not a numbers game).

## Decisions (from brainstorm)

- Build order: **(1) AU boards + source modes, (2) resume variants, (3) GH repos,
  (4) freshness.** This spec covers (1) + the resume-variant hook for (2).
- Resume strategy: **multiple fixed variants; the agent picks the best per job.**
- Sources live in a new **"Sources" tab** in the Core rail + a **"Browse sources"**
  catalog modal. Resume variants live in a new **"Resumes"** Core tab.
- Co-pilot must always have **full context**, assembled live from the DB (no
  external index / Obsidian); extend the existing `copilotPrompt` state block.

## Source modes

Each board gets a `mode: 'auto' | 'find'`.

- **auto** — the agent opens, fills, advances to review, you approve & submit.
  (LinkedIn, Seek, Indeed, Glassdoor, Greenhouse/Lever, Adzuna, Jora, WWR.)
- **find** — the agent finds + fit-scores roles and queues them as `surfaced`
  ("Ready to apply"). These boards (GradConnection, Prosple, Wellfound, Hatch,
  Built In) use logins / custom forms / redirects that can't be reliably
  auto-filled. The user opens each in the workspace, the agent does a best-effort
  autofill, the user finishes + submits, then marks it applied.

### New AU boards (find-mode unless noted)
- **GradConnection** (au.gradconnection.com) — grad/junior, AU. Search URL by
  keyword + location; scrape result cards.
- **Prosple** (au.prosple.com) — grad programs, AU.
- **Wellfound** (wellfound.com) — startups (smaller companies). Login.
- **Hatch** (hatch.team) — AU early-career matching. Login.
- **Built In** — niche tech/startup.

Selectors are best-effort + tolerant (same generic anchor scraper as existing
boards); first-run tuning expected.

## State machine additions

Add `surfaced` to `AutopilotJobState`:

```
... existing ...
| 'surfaced'   // find-mode: found + scored, waiting for you to open & apply
```

Flow for find-mode jobs:
- harvest → `enqueuePosting(..., mode='find')` inserts the job as `surfaced`
  (not `queued`); the drive loop never auto-fills it.
- The SourcesRail shows a **"Ready to apply (n)"** smart group of `surfaced` jobs.
- Clicking one → workspace **opens the job URL** in the embedded view, injects the
  filler for a single best-effort pass (no auto-advance), and shows an action bar:
  **"Mark applied"** (→ logApplication + state `logged`) / **"Skip"** (→ deferred).
- Auto-mode jobs are unchanged (`queued` → drive → `ready` → approve → submit).

`autopilot_jobs` gains a `mode TEXT` column (migrated; default 'auto').

## Source config (DB + UI)

- `app_settings` already holds `disabledBoards`. Add `boardModes` (JSON map
  `{boardId: 'auto'|'find'}`) so a user can override a board's default mode
  (e.g. force a best-effort auto-apply on a find board). Default = the board's
  built-in mode.
- **Sources tab** (Core rail): compact list of all boards — name, mode chip,
  freshness, enable toggle. A **"+ Browse all sources"** button opens the modal.
- **Browse sources modal**: the full catalog grouped Auto-apply / Find-&-surface
  with metadata chips (region, login, freshness) and per-board enable toggles.
- Move the existing board on/off chips out of the Rules tab into Sources; Rules
  keeps daily target / min fit / schedule / master toggle.

## Resume variants (hook now, full build is sub-project 2)

- New `resume_variants` concept: the document locker already supports multiple
  documents tagged `resume`. Add a `variant_label` (e.g. "Software", "Ecommerce")
  + an optional `keywords`/`focus` note per resume doc.
- At fill/upload time, the agent **picks the best-matching variant** for the job
  (Claude scores the job vs each variant's focus; falls back to the default).
- **Resumes tab** (Core rail): list variants, set default, add focus notes.
- This spec only adds the data model + tab shell; the picking logic is sub-project
  2's detail.

## Co-pilot full context (always current)

Extend `copilotPrompt`'s state block (assembled server-side each message) to add:
- enabled sources + their modes,
- counts incl. `surfaced` ("ready to apply"),
- resume variants + which the agent last picked,
- recent activity.

No external index/Obsidian — the DB is the single source of truth and the context
is rebuilt every turn, so it can never go stale.

## Components

- `sources.ts`: add `mode` to Board; add the 5 AU boards; export modes.
- `database.ts`: `surfaced` handling; `mode` column on autopilot_jobs (migrated);
  `boardModes` setting; `markApplied(jobId)`; `getSurfaced()`.
- `orchestrator.ts`: harvest sets job mode + `surfaced` for find boards; a new
  `openForApply(jobId)` that navigates the workspace view + best-effort fills;
  drive loop ignores `surfaced`.
- IPC/preload: `autopilot:drive:openForApply`, `markApplied`, source-mode
  get/set; copilot context extension.
- Renderer: Sources tab + Browse modal; Resumes tab shell; SourcesRail "Ready to
  apply" group; workspace "Mark applied / Skip" bar for surfaced jobs.

## Non-goals (this spec)
- GH-repo source (sub-project 3) and aggressive freshness (sub-project 4).
- Auto-tailoring a resume per job (we chose fixed variants).
- Guaranteed auto-fill on find boards (best-effort only).

## Risks
- Find-board selectors drift (first-run tuning).
- Wellfound/Hatch logins: handled by the existing login-pause + persistent
  session, but their apply flows are bespoke — surfacing (not auto-submitting) is
  the safe default.

# aplyd public showcase edition

**Date:** 2026-06-29
**Owner:** Violet (VioletN22)
**Status:** design, awaiting review

## Goal

Carve the finished part of aplyd out into a clean, public, showcase-ready repo
(`VioletN22/aplyd`) that Violet can feature as a project on LinkedIn. The repo holds
only the complete edition (the job tracker plus LinkedIn Easy Apply, cover letters, and
the Chrome extension). It contains none of the unfinished autopilot, no Claude commit
traces, and no AI-sounding text or comments. The README reads like Violet wrote it.

## Background

The app lives at `~/personal/job-app-tracker` (private, VioletN22). It already has an
edition split via `src/shared/edition.ts`:

- `LITE = false` (default): Violet's full build with the autonomous Autopilot cockpit
  that applies across every site in the in-app workspace.
- `LITE = true` (the friend build): no autonomous applier. Keeps the LinkedIn Easy Apply
  setup, the Chrome extension, cover letters, and the tracker.

The "complete version" Violet wants to show off **is the lite edition**. The full
autopilot stays private and under active development until it is ready.

## Decisions (settled in brainstorm)

- New public repo named `aplyd`, fresh git history, only Violet's code.
- Private `job-app-tracker` stays the workshop (autopilot and future features). Public
  `aplyd` is a clean snapshot, updated only occasionally for bug fixes. No live two-way
  sync.
- Showcase target: a project entry on LinkedIn now; a post drafted later (out of scope
  here).
- The README must pass an AI-tells linter (Vale + `vale-ai-tells`) with zero alerts, and
  use no em dashes.

## Scope of work

### 1. Extract the complete edition (the strip)

Start from a copy of the current working tree, then make the complete edition the only
mode and remove the autopilot.

**Delete (autopilot-only):**

- `src/main/autopilot/` (driver.ts, github-jobs.ts, injected.ts, orchestrator.ts,
  sources.ts) - the autonomous applier
- `src/main/autopilot-server.ts`, `src/main/autopilot-prompts.ts`
- `src/shared/edition.ts` (the `LITE` flag, removed entirely)
- The daily scheduler (`rescheduleDaily` and its wiring in `src/main/index.ts`)
- Autopilot IPC handlers in `src/main/index.ts` and `src/main/preload.ts`
- Edition build files: `electron-builder.friend.js`, `scripts/build-friend.sh`
- `src/main/license.ts` if it gates the full/paid edition (review during implementation;
  remove if it is paywall/autopilot-only)

**Extract, then delete the original:**

- `src/renderer/pages/AutopilotPage.tsx` (1609 lines) holds both the lite setup and the
  full cockpit. Pull the lite setup (Profile / Resume / Answers / Voice / Letters) into a
  new `src/renderer/pages/SetupPage.tsx`, wire navigation to it, and delete
  `AutopilotPage.tsx`. Rename "Autopilot" labels in `Navigation.tsx` / `App.tsx` to
  "Setup".

**Keep (the product):**

- Tracker: `ListPage` (with the new multi-field search), `DetailPage` (the outcome
  spine), `DashboardPage`, `FlowPage`, `SettingsPage`, `components/`, `hooks/`, `modals/`
- Cover letters and job ingest: `src/main/claude.ts`, related modals/pages
- Data and flow: `src/main/database.ts`, `src/main/flow.ts`
- The Chrome extension: `extension/` (Easy Apply filler, cover studio)
- Build: `electron-builder.config.js`, `scripts/install-app.sh`, and
  `electron-builder.win.js` (keep the Windows build; cross-platform reads well on a
  showcase repo and it carries no autopilot code)

**Done when:** `tsc` is clean, the app runs in the complete edition, and a grep for
`autopilot`, `LITE`, `rescheduleDaily`, `autonomous`, and `cockpit` finds nothing
meaningful.

### 2. De-AI pass

- **Comments:** go file by file across `src/`. Cut or rewrite explanatory, AI-sounding
  comments into terse notes in Violet's voice. Remove anything referencing Claude or AI.
- **Commits:** plain, lowercase, in Violet's voice. Authored as VioletN22
  (narkahmynn@gmail.com). No `Co-Authored-By` trailers, no "Claude" anywhere.
- **README:** Violet's voice. Sections: what it is, why she built it, features, the
  stack, screenshots, run/build. Lint with Vale + `vale-ai-tells` until zero alerts. No
  em dashes.
- **Tooling:** install Vale and the `vale-ai-tells` style; add `.vale.ini` and a documented
  lint command (`vale README.md`). Used to verify prose, kept out of the shipped app.
- **Final sweep:** check for other tells (generated boilerplate, over-formatted lists,
  stock phrases) in docs and visible strings.

### 3. Screenshots

Run the complete edition with sample data and capture clean shots:

- the list view with the search bar in use
- a cover-letter page (research plus the letter)
- the setup/profile page
- the detail page with the outcome spine

Save under `docs/images/` and reference them in the README.

### 4. Publish

- `git init` fresh in the extracted tree, add `.gitignore`, commit as a handful of
  logical commits authored as VioletN22.
- Create the public repo `VioletN22/aplyd` with the violet GitHub account (`ghv` / the
  `id_violet` SSH key) and push.
- Verify: repo is public, README and images render on GitHub, no autopilot references,
  Vale clean, every commit authored as Violet with no Claude trailer.

### 5. LinkedIn project entry

Draft a short project blurb for LinkedIn's Projects section: name, dates, description,
the skills/stack, and the repo link. The full LinkedIn post is a later task.

## Out of scope

- The full autopilot (stays private, future work).
- The LinkedIn post copy (drafted later).
- Portfolio site (violetnwe.com) integration.

## Risks

- Stripping the autopilot can leave dangling imports or IPC handlers. Mitigate with `tsc`
  plus a runtime smoke test (open each kept page, run a search, generate a cover letter).
- Over-scrubbing comments can remove useful context. Keep short, human comments where they
  earn their place.
- A fresh history can look thin. Mitigate with a few meaningful commits grouped by area,
  not a single blob.

## Verification

- `tsc --noEmit` clean; app boots and the kept features work.
- `grep` for autopilot/LITE/scheduler terms returns nothing meaningful.
- `vale README.md` reports 0 alerts.
- `git log` shows only VioletN22, no co-author trailers, plain messages.
- Public repo renders correctly with images.

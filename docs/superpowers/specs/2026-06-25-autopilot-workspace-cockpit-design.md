# Autopilot Workspace Cockpit — redesign

Date: 2026-06-25
Status: approved (mockups signed off), ready for implementation plan
Supersedes: the cockpit UI from `2026-06-24-autopilot-autonomous-drive-design.md`
(the engine — driver/orchestrator/sources/Core/scheduler — is unchanged; this is a
UI + browser-embedding redesign).

## Why

The current cockpit is a single scrolling page (queue list + ready cards + needs
inbox + core stores) and the agent drives a *separate* Electron browser window.
The user wants a **workspace**: a main area where applications happen one-by-one
that you watch and step into (login, captcha, extra info) right there, with the
config (the "brain/core") and a site-organised file of applications on the sides.
Approving from the workspace auto-advances to the next; stays as automated as
possible.

## Layout (approved mockups: `layout-v2.html`, `split-view.html`)

A four-column shell inside the existing app (the app's left nav stays):

```
[app nav] [ SOURCES rail ] [        WORKSPACE        ] [ CORE rail ]
  58px       234px                  flex                  272px
```

Cream theme throughout (`--bg #fff`, `--ink #111110`, `--panel #f4f3ef`,
`--accent #f23a17`). **No emojis** anywhere — monochrome line-glyph SVG icons
that match the theme (nav, folders, core sections). Site identity is the label,
not a colored pictograph. Status is small colored dots only.

### Sources rail (left) — folders by SITE + STATUS (both)
- Pinned **smart groups** at top that cut across all sites: `Needs you (n)`,
  `Ready to submit (n)`. Always visible.
- Below: **by-site folders** (LinkedIn, Seek, Indeed, Greenhouse, We Work
  Remotely, …), each expandable to its applications. Every application is filed
  in the folder of the site it came from.
- A `Site / Status` segmented toggle switches the *primary* grouping.
- Each application row: a status dot (filling=amber, ready=accent, needs-you=warn,
  submitted=green, queued=grey) + company — title. Selecting one loads it in the
  workspace.
- Footer: live counts (`6 filling · 11 ready · 3 need you`).

### Workspace (center) — the live application
- Header: breadcrumb showing **where it's pulling from** (`LinkedIn › Backend
  Engineer, Sydney › Stripe`), the role + company + fit chip, a step indicator
  (`Step 2 of 4`), and a `Single / Split` view toggle.
- Body: the **real live browser embedded in-app** showing the actual apply page
  being filled. Fields the agent filled from the Core are tinted green ("from
  your core"); fields it needs you for are tinted amber ("needs you"). Because it
  is the real page, **login, captcha, and extra-info all happen inline** here —
  you just interact with the embedded page.
- Action bar: `Skip` · `Answer N questions` · **`Approve & submit`**. Approving
  submits and auto-advances to the next queued application in the workspace.

### Single vs Split (parallel runs) — opt-in
- Default is **Single** (one application at a time, focused).
- `Split` toggle shows **two independent agents side-by-side** (A/B), each its own
  viewport, status, and Approve button, each fillable/approvable independently.
- Parallel count is **configurable 1–3** (default 1). Beyond ~3 is cramped and
  raises ban risk, so 3 is the cap.
- All parallel agents **share the one logged-in session** (`persist:autopilot`
  partition) so there is no repeated login.

### Core rail (right) — the brain
Collapsible sections of what aplyd already knows, editable in place: **Profile**
(structured fields), **Answer bank**, **Voice**, **Documents**, **Run rules**
(daily target, min fit, schedule, master toggle). Shared across all runs.

## The one real architectural change: embed the browser in-app

Today the driver opens a separate `BrowserWindow`. For the workspace, the live
page must render *inside* the app at the workspace pane's bounds. Use Electron
**`BrowserView`** (or `WebContentsView`) attached to the main `BrowserWindow`,
positioned/resized to the workspace rectangle the renderer reports.

- One `BrowserView` per active run (1 for Single, up to 3 for Split), all on the
  `persist:autopilot` session partition (shared login).
- The renderer owns layout; it sends the pixel bounds of each workspace pane to
  main (`autopilot:view:setBounds`), and main positions the BrowserView(s) to
  match (including on window resize / rail collapse / tab switch — hide the views
  when the Autopilot tab isn't active).
- The existing driver API (`openJob`/`evalInTab`/`injectSource`/`screenshot`/
  `closeTab`) is re-pointed from a `BrowserWindow.webContents` to a
  `BrowserView.webContents`. The bridge (`__aplydBind` via `webContents.debugger`)
  and the injected filler engine are unchanged.
- The orchestrator gains a notion of a **run slot** (1..N) so Split can drive
  multiple BrowserViews concurrently; each slot has its own current job + status.
  Single = one slot.

Everything else (sources/harvest/fit-score/Core/scheduler/state machine) is the
existing engine, re-surfaced through the new UI.

## Components to build

- `WorkspaceLayout.tsx` — the 4-column shell; reports each viewport pane's bounds
  to main; hosts the rails + the BrowserView mount points (empty divs whose
  bounds drive the native views).
- `SourcesRail.tsx` — smart groups + site folders + Site/Status toggle; selecting
  a job sets the active job for a slot.
- `Workspace.tsx` — header (breadcrumb/step/fit), the BrowserView mount area, the
  action bar; Single/Split toggle and slot management.
- `CoreRail.tsx` — collapsible Profile / Answer bank / Voice / Documents / Run
  rules (reuses the existing editors).
- Main: `autopilot/view-host.ts` — create/position/destroy BrowserViews per slot,
  bounds sync, show/hide on tab change. Driver refactor to operate on a passed
  `webContents` instead of a private window. Orchestrator slot support.
- IPC: `autopilot:view:setBounds(slot, rect)`, `autopilot:view:setVisible(bool)`,
  `autopilot:slots:set(n)`, plus the existing drive/search/settings/profile.

## Folders, concretely
- "By site" = `source` field on each `autopilot_jobs` row (already stored).
- "By status" smart groups = filter by `state` (needs_input, ready).
- No schema change needed; this is a grouping/selection in the renderer over the
  existing jobs + needs data.

## Non-goals
- No change to the sourcing boards, fit scoring, Core data model, scheduler, or
  the never-auto-submit safety model.
- Not building a full multi-window tab manager; Split is capped at 3 fixed slots.
- Cross-origin iframe ATS limitation (from the engine spec) still applies.

## Risks
- **BrowserView bounds sync**: native views float above the renderer; if bounds
  lag on resize/scroll the page can misalign. Mitigate by driving bounds from a
  ResizeObserver on the mount div + hiding views during transitions.
- **Parallel on one partition**: concurrent navigations are fine (separate
  webContents), but the bridge handler must key responses per slot/webContents so
  two runs don't cross wires. Each BrowserView gets its own debugger + binding.
- **Tab switching**: the views must hide when the user leaves the Autopilot tab
  (BrowserViews don't respect React unmount), else they paint over other pages.

# Autopilot Autonomous Drive — Phase 1 design

Date: 2026-06-24
Status: building
Scope: Phase 1 of the "autonomous applier" vision. Later phases (sourcing, the
Core upgrade, scheduler, vision fallback) are out of scope here and get their own
specs.

## Vision (full, for context)

Turn aplyd's Autopilot from a **reactive** browser-extension filler (acts only on
the tab you're looking at) into a **proactive autonomous agent**: it sources jobs
across every board, drives each apply flow itself, only interrupts you when truly
stuck, gets smarter every time, and parks finished applications in a cockpit for
batch review.

Settled product decisions (2026-06-24 brainstorm):

- **Submit model:** fill → queue → you approve. Never auto-submits. Lowest ban risk.
- **Drive engine:** managed Chrome via CDP. aplyd spawns a *dedicated* Chrome
  window (separate `--user-data-dir`, you log in once) and drives it over the
  DevTools protocol. It does NOT touch your daily browser.
- **Targeting (Phase 2):** saved searches → Claude fit-score → auto-fill top N.
- **Interrupts:** unknown questions are *parked* in a deduplicated "Needs you"
  inbox, never block the run; one answer back-fills every affected job and is
  saved to the Core forever.
- **Cadence (Phase 3):** scheduled daily batch + manual Run now + a master
  on/off toggle (kill switch).

## Phase 1 goal

Prove the autonomous drive end-to-end on a **seeded list of job URLs** (sourcing
is Phase 2). From the cockpit: paste/queue job URLs → Run → aplyd opens its
dedicated Chrome, drives each URL through its apply form (filling from the answer
bank + Claude resolve, exactly like the extension already does), parks unknowns
in the Needs-you inbox, **stops at the review step**, screenshots the filled
draft, and marks the job `ready`. The cockpit shows the ready list; approving a
job tells the driver to click the real Submit and logs it into the tracker.

## Why CDP and not Playwright

Electron 18 ships Node 16; Playwright needs Node 18+. `chrome-remote-interface`
is pure JS, Node-16-safe. We spawn the user's installed Chrome
(`/Applications/Google Chrome.app/...`) with `--remote-debugging-port` and a
dedicated `--user-data-dir`, then attach over CDP.

## Components (all new under `src/main/autopilot/`)

### `driver.ts` — the hands
Owns the dedicated Chrome process + CDP connection. API:
- `ensureBrowser()` — spawn Chrome (if not running) with remote-debugging-port +
  dedicated profile dir; connect via `chrome-remote-interface`.
- `openJob(url)` — new target/tab, navigate, wait for load. Returns a `Tab` handle.
- `evalInTab(tab, fnString, arg)` — `Runtime.evaluate` an expression, await result.
- `screenshot(tab)` — `Page.captureScreenshot` → base64 PNG (for the review card).
- `exposeBridge(tab, handler)` — `Runtime.addBinding('__aplydBind')` +
  `Runtime.bindingCalled`, routing the page's bridge calls to a Node handler.
- `closeTab(tab)`, `shutdown()`.

No credentials are ever stored; the user authenticates inside the dedicated
Chrome window once and the persistent profile keeps the session.

### `injected.ts` — the in-page brain
Exports a JS source string injected into each job tab. It is a **port of the
extension's `filler-core.js` pure DOM logic** (`collectFields`, `labelFor`,
`matchOption`, `fillValue`, `hasValue`, footer-button detection) with two
changes: (1) the bridge `call()` routes to the `__aplydBind` binding instead of
`chrome.runtime.sendMessage`; (2) there is no in-page ask popup or agent card —
when a field is unknown the injected code returns it to Node as a "needs input"
record. The injected `runFill()` returns a structured result:
`{ filled, needs: [{label, kind, options}], atReview: bool, footer: 'submit'|'next'|'review'|null }`.

### `orchestrator.ts` — the run loop
Drives a queue of `autopilot_jobs` rows through the state machine:

```
queued → filling → needs_input → ready → approved → submitting → submitted → logged
            └→ failed (login wall / captcha / no form)   └→ skipped
```

Per job: `openJob(url)` → inject → `runFill` loop (advance Next while
`autoAdvance`-style ATS steps remain, like filler-core does) → resolve each field
via Node bridge (`getAnswerBank` cache → `resolveFieldPrompt` via Claude) →
unknowns appended to `autopilot_needs` (deduped by normalized label) → at review,
`screenshot`, set state `ready`. Emits progress events to the renderer.

On approve: re-open the job tab (or reuse), click the footer Submit via injected
helper, then call the existing `onApply` logger so it lands in the tracker + flow
view. State → `submitted`/`logged`.

Pacing: randomized 1.5–4s delays between fields and a per-run job cap, so no
board sees a burst. Master toggle gates scheduled runs (Phase 3); Phase 1 is
Run-now only.

### DB (`database.ts`)
Two new tables:
- `autopilot_jobs(id, url, company, title, state, fit_score, needs_count,
  screenshot_path, error, created_at, updated_at)`
- `autopilot_needs(id, norm_label, label, kind, options_json, answer,
  status['open'|'answered'], created_at, answered_at)` — deduped by `norm_label`.

CRUD: `enqueueJob`, `getAutopilotJobs`, `updateJobState`, `getOpenNeeds`,
`upsertNeed`, `answerNeed` (writes through to `answer_bank` so it's permanent).

### IPC + preload
`autopilot:drive:*` channels: `enqueue(urls)`, `run()`, `stop()`, `getJobs()`,
`getNeeds()`, `answerNeed(id, value)`, `approve(jobId)`, `approveAll()`,
`status()`. Renderer subscribes to a `autopilot:drive:progress` event for live
status. Exposed as `window.electronAPI.drive`.

### Cockpit (`AutopilotPage.tsx`)
A new "Cockpit" section above the existing Core stores:
- Run controls: a URL paste box + Enqueue, Run now, Stop, live status line.
- Pipeline counts (queued / filling / ready / needs-you / failed).
- Ready to submit: cards with the screenshot, company/title, Approve + Approve all.
- Needs you: deduped questions, each showing how many queued jobs it unblocks; an
  inline answer field/buttons; answering back-fills and saves to the Core.
- Failed: rows with reason.

## Reuse

- Filler DOM logic ported from `extension/filler-core.js` (single source of truth
  for the *algorithm*; the port adapts only the bridge + UI edges).
- Field resolution reuses `getAnswerBank` + `resolveFieldPrompt` + `parseFieldAction`
  + `tailorAnswerPrompt` from `autopilot-prompts.ts`, called directly in Node.
- Logging reuses the existing `onApply` path (createApplication + workflow) so the
  tracker, stage history, and flow view keep working unchanged.

## Non-goals (Phase 1)

Sourcing/search adapters, fit scoring, the structured-profile Core upgrade, the
scheduler/toggle daemon, the vision fallback, CAPTCHA/login-wall solving. Jobs
that hit a login wall or CAPTCHA are marked `failed` with a reason, surfaced in
the cockpit, never silently dropped.

## Risks

- ATS variety: the ported DOM logic already handles LinkedIn/Greenhouse/Lever/
  generic; unfamiliar ATS may not auto-advance — those stop at "filled what I
  could", still reviewable.
- CDP target lifecycle: tabs can close under us; the driver guards every call and
  marks the job `failed` on a dead target rather than crashing the run.
- ToS: still personal-scale only. The fill→approve gate and human-like pacing are
  the mitigations.

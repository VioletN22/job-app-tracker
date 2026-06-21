# aplyd Autopilot — External Apply (beyond LinkedIn Easy Apply)

Date: 2026-06-21
Status: Approved design, ready for implementation plan

## Problem

aplyd Autopilot currently fills only LinkedIn **Easy Apply** forms (a modal inside
linkedin.com). Most LinkedIn jobs use plain **Apply**, which opens the company's own
applicant tracking system (ATS) in a new browser tab (Greenhouse, Lever, Ashby,
Workday, SmartRecruiters, or a custom career site). The assistant does nothing there.

Goal: extend Autopilot to fill applications on external ATS pages too, reusing the
existing local bridge and answer/voice/document profile, while staying assisted
(never auto-submitting) and safe on stricter external sites.

## Decisions (locked during brainstorming)

- **Scope:** Hybrid — a universal heuristic filler as the base, plus thin tuned
  adapters for the cleanest high-volume ATSs.
- **External navigation:** Fill-and-wait. It fills the current step and stops; the
  user clicks Next/Continue themselves. (LinkedIn Easy Apply keeps its auto-advance,
  which is safe in its sandboxed modal.)
- **Activation:** Auto-show the agent card on a curated ATS allowlist; on any other
  site stay dormant until the user clicks "Autofill this page" in the popup. No
  random pop-ups on unrelated forms.

## Architecture

Split today's `content.js` (which mixes generic filling with LinkedIn specifics) into
a site-agnostic core plus per-site adapters. The bridge and the in-app Autopilot
screens are unchanged except for a tiny context stash.

```
extension/
  filler-core.js     # engine: collect fields, resolve via bridge, ask-popup,
                     #   fill values, the agent card + status/minimise UI.
                     #   Site-agnostic. ~90% of today's content.js.
  adapters/
    linkedin.js      # Easy Apply modal: getModal, Next/Review/Submit, auto-advance
    generic.js       # any page: the whole document's form is the field set; fill-and-wait
    greenhouse.js    # tuned: form root, custom widgets, Next/Submit selectors
    lever.js         # tuned
  content.js         # thin bootstrap: pick the adapter for this URL, hand it to the core
  background.js      # unchanged (bridge proxy)
  popup.html/.js     # add "Autofill this page" button for off-allowlist sites
```

### Adapter contract

Each adapter exposes a small, well-defined interface so the core never contains
site-specific logic:

```
{
  matches(url): boolean        // does this adapter handle the current page?
  autoShow: boolean            // auto-render the card, or wait for manual trigger?
  autoAdvance: boolean         // click Next across steps (LinkedIn) vs fill-and-wait (external)
  getFormRoot(): Element|null  // the element to scan for fields (modal, <form>, or document.body)
  footerButtons(root): { submit?, review?, next? }   // for autoAdvance adapters
  fillWidget(field, value): boolean | undefined      // optional: handle a custom widget;
                                                     //   return undefined to fall back to core
  jobContext(): { company, title, jobText, jobUrl }  // read role/company from the page
}
```

The core owns: field collection (text/select/radio/checkbox/textarea/file), the
cache-first resolve (`/resolve`), the ask-once option-picker popup, value setting
(React-safe), file upload from the locker, the agent card, and logging.

## Where it runs (manifest)

- `host_permissions` and a broad content-script match so the core can load anywhere,
  plus the curated ATS allowlist for auto-show:
  `boards.greenhouse.io`, `job-boards.greenhouse.io`, `jobs.lever.co`,
  `jobs.ashbyhq.com`, `*.myworkdayjobs.com`, `*.smartrecruiters.com` (extensible).
- On an allowlisted host: the matching adapter loads, `autoShow = true`, card appears.
- Off the allowlist: the script loads dormant. The popup's **"Autofill this page"**
  button messages the tab to run the `generic` adapter on demand.

## Behavior on external sites

1. User opens an external apply page (allowlisted → card auto-appears; otherwise they
   click "Autofill this page").
2. Core scans the adapter's form root, fills known fields from the answer bank,
   resolves unknowns via Claude, attaches the resume from the locker, and shows the
   option-picker popup for anything it must ask (remembered per question).
3. It **stops** after the current step with the card reading "Filled this step, click
   Next yourself." No auto-advance, no auto-submit.
4. The user advances the wizard; on the next step they re-run (or, for fill-and-wait,
   the card offers a "Fill this step" button again).

LinkedIn Easy Apply is unchanged: `linkedin.js` keeps `autoAdvance = true`.

## Context handoff + logging

- **Handoff:** When the user clicks Apply on a LinkedIn job, the LinkedIn adapter
  POSTs `{company, title, url}` to a new bridge endpoint `/pending-job` (in-memory,
  last-write-wins, short TTL). The external tab GETs `/pending-job` to label the
  application. If absent (user landed on the ATS directly), the adapter's
  `jobContext()` reads company/role from the ATS page.
- **Logging:** On running Autofill on a recognized application page, the core POSTs
  `/log` to create the tracker application as "applied", deduped by job URL. Filling
  equals intent; we do not depend on catching the final submit across unpredictable
  ATS DOMs. (Existing `/log` + quick-add path is reused.)

## Bridge changes (small)

- Add `POST /pending-job` (stash) and `GET /pending-job` (read) — in-memory only.
- `/resolve`, `/tailor`, `/answer`, `/documents`, `/log` unchanged.

## Phasing

- **Phase 1 (this spec):** the core/adapter refactor, `generic`, **Greenhouse**,
  **Lever**, context handoff, logging, popup "Autofill this page".
- **Phase 2 (later):** Ashby, SmartRecruiters, then Workday (account-creation + heavy
  custom widgets make it the hard case).

## Explicitly out of scope

- CAPTCHAs / "I'm not a robot" — never bypassed.
- Account creation / email verification walls (common on Workday) — user handles.
- Any auto-submit anywhere. Autopilot assists; the user reviews and submits.
- Resume text extraction from PDF (already deferred; facts block + portfolio carry the
  profile).

## Risks / mitigations

- **Custom widgets** (React-Select, comboboxes): tuned adapters handle the big ATSs;
  the generic adapter falls back to the ask-popup when it cannot set a widget.
- **Bot detection on external sites:** fill-and-wait + no auto-submit keeps actions
  user-paced and minimal.
- **Selector drift:** adapters isolate per-site selectors so breakage is local and
  quick to patch; the core stays stable.
- **Permissions breadth:** broad match is acceptable for personal/unpacked use; a
  future store build would narrow to the allowlist + activeTab.

## Success criteria

- On a Greenhouse and a Lever posting reached via LinkedIn "Apply", the card appears,
  fills name/email/phone/resume and known questions, asks (with option buttons) for
  unknowns and remembers them, stops before submit, and logs the application to the
  tracker with the correct company/role.
- On an unrecognized career-site form, "Autofill this page" fills the native fields
  and asks for the rest, without auto-advancing or submitting.
- LinkedIn Easy Apply behavior is unchanged.

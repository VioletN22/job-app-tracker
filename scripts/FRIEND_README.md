# aplyd — setup

A local job-application tracker with AI cover letters and a LinkedIn Easy Apply
autofill extension. Everything runs on your own Mac; nothing is uploaded.

## 1. Install the app

First pick the right file for your Mac ( → **About This Mac** → look at "Chip"):

- **Apple Silicon** (M1 / M2 / M3 / M4) → use **aplyd-apple-silicon.dmg**
- **Intel** → use **aplyd-intel.dmg**

1. Open that **.dmg** and drag **aplyd** onto the **Applications** folder.
2. It's not from the App Store, so macOS will block it the first time. Open
   **Terminal** and run this once:

   ```
   xattr -cr /Applications/aplyd.app
   ```

   Then open aplyd normally (or right-click it → **Open**).

## 2. Turn on the AI features (cover letters, job extraction)

These use the **Claude CLI** signed into your own Claude subscription.

1. Install the Claude CLI: https://docs.claude.com/claude-code (or `npm i -g @anthropic-ai/claude-code`)
2. Run `claude` once in Terminal and log in with your Claude account.

That's it — aplyd calls it in the background. (Without this, the tracker still
works; the AI buttons just won't do anything.)

## 3. Set up "what aplyd knows about you"

Open the **Autopilot** tab in aplyd and fill in:

- **Profile** — name, email, phone, links (used to autofill forms + sign letters)
- **Resume** — upload your resume PDF (powers cover letters + autofill)
- **Answers / Voice / Letters** — optional, makes everything sharper over time

## 4. Install the LinkedIn Easy Apply extension

1. In Chrome go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose the **aplyd-chrome-extension** folder.
4. Keep aplyd open. On a LinkedIn **Easy Apply** form, the extension fills it in
   from your profile — you review and hit **Submit** yourself. Nothing is ever
   submitted automatically.

---

Tracker, cover letters, and the Easy Apply extension are all included. The
autonomous "apply to lots of jobs for me" mode is not part of this build.

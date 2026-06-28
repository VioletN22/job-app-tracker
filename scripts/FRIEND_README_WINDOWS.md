# aplyd — setup (Windows)

A local job-application tracker with AI cover letters and a LinkedIn Easy Apply
autofill extension. Everything runs on your own PC; nothing is uploaded.

## 1. Install the app

You have two options in this folder:

- **aplyd-setup-….exe** — a normal installer (recommended). Double-click it.
- **aplyd-portable-….exe** — no install, just double-click to run it directly.

Because it isn't from the Microsoft Store, Windows SmartScreen will warn you the
first time: click **More info → Run anyway**. (It's safe — it's just not signed.)

## 2. Turn on the AI features (cover letters, job extraction)

These use the **Claude CLI** signed into your own Claude subscription.

1. Install **Node.js** (LTS): https://nodejs.org
2. Open **PowerShell** (or Terminal) and run:
   ```
   npm install -g @anthropic-ai/claude-code
   ```
3. Run `claude` once and log in with your Claude account (it opens a browser).

That's it — aplyd calls it in the background. Without this, the tracker still
works; the AI buttons just won't do anything.

## 3. Set up "what aplyd knows about you"

Open the **Autopilot** tab in aplyd and fill in:

- **Profile** — name, email, phone, links (used to autofill forms + sign letters)
- **Resume** — upload your resume PDF (powers cover letters + autofill)
- **Answers / Voice / Letters** — optional, makes everything sharper over time

## 4. Install the LinkedIn Easy Apply extension (Chrome / Edge)

1. Go to `chrome://extensions` (or `edge://extensions`).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and choose the **aplyd-chrome-extension** folder.
4. Keep aplyd open. On a LinkedIn **Easy Apply** form, the extension fills it in
   from your profile — you review and hit **Submit** yourself. Nothing is ever
   submitted automatically.

---

Tracker, cover letters, and the Easy Apply extension are all included. The
autonomous "apply to lots of jobs for me" mode is not part of this build.

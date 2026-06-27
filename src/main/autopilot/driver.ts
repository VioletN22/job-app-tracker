// Autopilot drive engine — the agent's "hands", embedded INSIDE the aplyd window.
//
// Each run "slot" is an Electron BrowserView attached to the main window and
// positioned over the workspace pane the renderer reports. The live apply page
// renders right there in the app, so login/captcha/extra-info happen inline.
// All slots share one persistent session partition (persist:autopilot) so you
// log in once. Slot 0 = single mode; slots 0..2 = split (parallel) mode.
//
// Page work uses webContents.executeJavaScript / capturePage / loadURL; the
// webContents debugger is used only to expose the __aplydBind page->Node bridge.
import { BrowserView, BrowserWindow, app, session } from 'electron';
import fs from 'fs';
import path from 'path';

export interface Tab { wc: Electron.WebContents; slot: number; }
export interface BridgeMsg { id: string; path: string; method: string; body: any; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MAX_SLOTS = 3;
function dlog(_msg: string): void { /* diagnostics off */ }

// Deny mic/camera/geolocation/etc. on the autopilot session — filling forms never
// needs them, and otherwise every job site that asks pops an OS permission prompt.
let sessionConfigured = false;
function configureSession(): void {
  if (sessionConfigured) return;
  try {
    const ses = session.fromPartition('persist:autopilot');
    ses.setPermissionRequestHandler((_wc, _permission, cb) => cb(false));
    ses.setPermissionCheckHandler(() => false);
    sessionConfigured = true;
  } catch { /* ignore */ }
}

interface Slot {
  view: BrowserView;
  bounds: { x: number; y: number; width: number; height: number };
  bridge: (m: BridgeMsg) => Promise<any>;
}

let hostWin: BrowserWindow | null = null;
let viewsVisible = true;
const slots: (Slot | null)[] = [null, null, null];
// Last bounds the renderer reported per slot, kept even before the view exists,
// so a freshly-created view shows in the right place immediately (no blank flash).
const lastBounds: { x: number; y: number; width: number; height: number }[] = [
  { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 0, height: 0 },
];

// Called from createWindow so the views can attach to the real app window.
export function attachHost(win: BrowserWindow): void { hostWin = win; }

// Bring the aplyd window forward (e.g. when a job needs your hands-on attention).
export function focusHost(): void { if (hostWin) { try { hostWin.focus(); } catch { /* ignore */ } } }

const ZERO = { x: 0, y: 0, width: 0, height: 0 };

function makeSlot(index: number): Slot {
  const view = new BrowserView({
    webPreferences: {
      partition: 'persist:autopilot', // shared, persistent login across slots
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  const slot: Slot = { view, bounds: { ...ZERO }, bridge: async () => ({ ok: false }) };
  const wc = view.webContents;
  // External "Apply" links (target=_blank / window.open) load IN this view so the
  // whole application stays inside aplyd instead of spawning a new window.
  wc.setWindowOpenHandler(({ url }) => { try { if (/^https?:/.test(url)) wc.loadURL(url); } catch { /* ignore */ } return { action: 'deny' }; });
  try {
    wc.debugger.attach('1.3');
    wc.debugger.on('message', async (_e, method, params) => {
      if (method !== 'Runtime.bindingCalled' || params.name !== '__aplydBind') return;
      let msg: BridgeMsg;
      try { msg = JSON.parse(params.payload); } catch { return; }
      let result: any = { ok: false };
      try { result = await slot.bridge(msg); } catch (err) { result = { ok: false, error: String(err) }; }
      try { await wc.executeJavaScript(`window.__aplydResolve(${JSON.stringify(msg.id)}, ${JSON.stringify(result)})`, true); } catch { /* navigated */ }
    });
    wc.debugger.sendCommand('Runtime.enable');
  } catch { /* debugger may fail; bridge degrades */ }
  return slot;
}

// Ensure a slot's BrowserView exists and is attached to the window.
function ensureSlot(index: number): Slot {
  if (!hostWin) throw new Error('autopilot host window not attached');
  let s = slots[index];
  if (!s) { s = makeSlot(index); slots[index] = s; s.bounds = { ...lastBounds[index] }; }
  if (!hostWin.getBrowserViews().includes(s.view)) hostWin.addBrowserView(s.view);
  applyBounds(index);
  return s;
}

function applyBounds(index: number): void {
  const s = slots[index];
  if (!s) return;
  const b = viewsVisible ? s.bounds : ZERO;
  dlog(`applyBounds slot=${index} visible=${viewsVisible} bounds=${JSON.stringify(b)}`);
  s.view.setBounds(b);
}

// ── public driver API (slot-aware; slot defaults to 0) ───────────────────────
export async function ensureBrowser(): Promise<void> { configureSession(); ensureSlot(0); }

export async function openJob(url: string, onBridge: (m: BridgeMsg) => Promise<any>, slot = 0): Promise<Tab> {
  const s = ensureSlot(slot);
  s.bridge = onBridge;
  // make sure this slot is on top + correctly positioned before it loads
  if (hostWin) { try { hostWin.setTopBrowserView(s.view); } catch { /* ignore */ } }
  applyBounds(slot);
  const wc = s.view.webContents;
  // Load with a hard timeout so a slow / never-finishing page can't hang the run.
  await Promise.race([wc.loadURL(url).catch(() => {}), sleep(18000)]);
  await sleep(700);
  try { await wc.debugger.sendCommand('Runtime.addBinding', { name: '__aplydBind' }); } catch { /* present */ }
  return { wc, slot };
}

export async function evalInTab(tab: Tab, expression: string): Promise<any> {
  return tab.wc.executeJavaScript(expression, true);
}

export async function injectSource(tab: Tab, source: string): Promise<void> {
  await tab.wc.executeJavaScript(source, true);
}

export async function screenshot(tab: Tab, jobId: string): Promise<string> {
  const img = await tab.wc.capturePage();
  const dir = path.join(app.getPath('userData'), 'autopilot-shots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${jobId}.png`);
  fs.writeFileSync(file, img.toPNG());
  return file;
}

// Single reused view per slot; "closing" a tab navigates it idle (keeps login).
export async function closeTab(tab: Tab): Promise<void> {
  try { await tab.wc.loadURL('about:blank'); } catch { /* ignore */ }
}

// ── view positioning (driven by the renderer's workspace bounds) ─────────────
export function setViewBounds(slot: number, rect: { x: number; y: number; width: number; height: number }): void {
  if (slot < 0 || slot >= MAX_SLOTS) return;
  const b = {
    x: Math.round(rect.x), y: Math.round(rect.y),
    width: Math.round(rect.width), height: Math.round(rect.height),
  };
  lastBounds[slot] = b;            // remember even if the view isn't created yet
  dlog(`setViewBounds slot=${slot} rect=${JSON.stringify(b)} hasView=${!!slots[slot]}`);
  const s = slots[slot];
  if (!s) return;
  s.bounds = b;
  applyBounds(slot);
}

export function setViewsVisible(visible: boolean): void {
  dlog(`setViewsVisible ${visible}`);
  viewsVisible = visible;
  for (let i = 0; i < MAX_SLOTS; i++) applyBounds(i);
}

// Ensure exactly `n` slots exist + are attached; detach the rest.
export function setActiveSlots(n: number): void {
  const count = Math.max(1, Math.min(MAX_SLOTS, n));
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (i < count) ensureSlot(i);
    else if (slots[i] && hostWin) { try { hostWin.removeBrowserView(slots[i]!.view); } catch { /* ignore */ } }
  }
}

export function shutdown(): void {
  for (let i = 0; i < MAX_SLOTS; i++) {
    const s = slots[i];
    if (s) { try { (s.view.webContents as any).destroy?.(); } catch { /* ignore */ } }
    slots[i] = null;
  }
}

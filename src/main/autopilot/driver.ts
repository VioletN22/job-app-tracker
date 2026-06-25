// Autopilot drive engine — the agent's "hands", running INSIDE aplyd.
//
// Instead of spawning an external Chrome, we drive a real Electron BrowserWindow
// (its own persistent session partition, so you log into LinkedIn/Seek/etc. ONCE
// inside aplyd and it sticks). Page work uses webContents.executeJavaScript /
// capturePage / loadURL; the only thing those can't do is let the page call back
// into Node mid-fill, so we use the webContents debugger purely to expose one
// binding (__aplydBind) for the page->Node bridge. No external browser, no
// credentials stored.
import { BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export interface Tab { wc: Electron.WebContents; }
export interface BridgeMsg { id: string; path: string; method: string; body: any; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let driveWin: BrowserWindow | null = null;
let attached = false;
let currentBridge: (m: BridgeMsg) => Promise<any> = async () => ({ ok: false });

// Create (once) the in-app browser window the agent drives. Visible so you can
// watch it and log in; persistent partition so the login survives restarts.
export async function ensureBrowser(): Promise<void> {
  if (driveWin && !driveWin.isDestroyed()) return;
  driveWin = new BrowserWindow({
    width: 1200, height: 900, show: true,
    title: 'aplyd autopilot',
    webPreferences: {
      partition: 'persist:autopilot', // dedicated, persistent cookie jar inside aplyd
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
    },
  });
  driveWin.on('closed', () => { driveWin = null; attached = false; });

  const wc = driveWin.webContents;
  try {
    wc.debugger.attach('1.3');
    attached = true;
    wc.debugger.on('message', async (_e, method, params) => {
      if (method !== 'Runtime.bindingCalled' || params.name !== '__aplydBind') return;
      let msg: BridgeMsg;
      try { msg = JSON.parse(params.payload); } catch { return; }
      let result: any = { ok: false };
      try { result = await currentBridge(msg); } catch (err) { result = { ok: false, error: String(err) }; }
      const expr = `window.__aplydResolve(${JSON.stringify(msg.id)}, ${JSON.stringify(result)})`;
      try { await wc.executeJavaScript(expr, true); } catch { /* page navigated away */ }
    });
    await wc.debugger.sendCommand('Runtime.enable');
  } catch {
    attached = false; // debugger may already be attached; bridge still best-effort
  }
  try { await wc.loadURL('about:blank'); } catch { /* ignore */ }
}

// (Re)install the page->Node binding. addBinding must be re-applied after each
// navigation creates a fresh context.
async function installBinding(wc: Electron.WebContents): Promise<void> {
  if (!attached) return;
  try { await wc.debugger.sendCommand('Runtime.addBinding', { name: '__aplydBind' }); } catch { /* already present */ }
}

// Navigate the shared window to a job/search URL and return a Tab handle. The
// bridge handler is set per call (the filler passes a real handler; sourcing a no-op).
export async function openJob(url: string, onBridge: (m: BridgeMsg) => Promise<any>): Promise<Tab> {
  await ensureBrowser();
  if (!driveWin) throw new Error('drive window unavailable');
  currentBridge = onBridge;
  const wc = driveWin.webContents;
  try { await wc.loadURL(url); } catch { /* SPA redirects can reject; continue */ }
  await sleep(900); // settle late-rendering pages
  await installBinding(wc);
  return { wc };
}

// Evaluate an expression (may be a Promise; executeJavaScript awaits + returns by value).
export async function evalInTab(tab: Tab, expression: string): Promise<any> {
  return tab.wc.executeJavaScript(expression, true);
}

// Inject a script source string into the page (the ported filler engine).
export async function injectSource(tab: Tab, source: string): Promise<void> {
  await tab.wc.executeJavaScript(source, true);
}

// Capture a PNG of the current page, write it under userData, return the path.
export async function screenshot(tab: Tab, jobId: string): Promise<string> {
  const img = await tab.wc.capturePage();
  const dir = path.join(app.getPath('userData'), 'autopilot-shots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${jobId}.png`);
  fs.writeFileSync(file, img.toPNG());
  return file;
}

// Single reused window, so closing a "tab" just frees the page (keeps the session).
export async function closeTab(_tab: Tab): Promise<void> { /* keep the window + login */ }

export function shutdown(): void {
  try { if (driveWin && !driveWin.isDestroyed()) driveWin.destroy(); } catch { /* ignore */ }
  driveWin = null; attached = false;
}

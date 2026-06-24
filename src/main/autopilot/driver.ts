// Autopilot drive engine — the agent's "hands".
//
// We spawn a DEDICATED Chrome window (its own --user-data-dir, separate from the
// user's daily browser) with the DevTools protocol open, then drive it over CDP
// via chrome-remote-interface. The user logs into LinkedIn/Seek/etc. once in this
// window; the persistent profile keeps the session. No credentials are stored.
//
// Electron 18 ships Node 16, so Playwright (needs Node 18+) is out. CDP via
// chrome-remote-interface is pure JS and Node-16-safe.
import { spawn, ChildProcess } from 'child_process';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

// Lazy require so the dependency never touches cold start.
type CDPClient = any;
const requireCDP = () => require('chrome-remote-interface') as any;

const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9333;

export interface Tab {
  targetId: string;
  client: CDPClient;
}

let chromeProc: ChildProcess | null = null;

function userDataDir(): string {
  return path.join(app.getPath('userData'), 'autopilot-chrome');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Is the DevTools endpoint answering yet?
async function endpointReady(): Promise<boolean> {
  try {
    const CDP = requireCDP();
    await CDP.List({ port: DEBUG_PORT });
    return true;
  } catch {
    return false;
  }
}

// Spawn the dedicated Chrome (idempotent) and wait until CDP is reachable.
export async function ensureBrowser(): Promise<void> {
  if (await endpointReady()) return;

  if (!fs.existsSync(CHROME_BIN)) {
    throw new Error('Google Chrome not found at ' + CHROME_BIN);
  }
  const dir = userDataDir();
  fs.mkdirSync(dir, { recursive: true });

  chromeProc = spawn(
    CHROME_BIN,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${dir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate',
      // a real window the user can watch and log in through
      'about:blank',
    ],
    { detached: false, stdio: 'ignore' }
  );
  chromeProc.on('exit', () => { chromeProc = null; });

  // Wait up to ~15s for the debugging endpoint.
  for (let i = 0; i < 60; i++) {
    if (await endpointReady()) return;
    await sleep(250);
  }
  throw new Error('Chrome did not expose its DevTools endpoint in time');
}

// Open a fresh tab on `url`, wired with Page/Runtime enabled and the bridge
// binding installed. Caller must closeTab() when done.
export async function openJob(url: string, onBridge: (msg: BridgeMsg) => Promise<any>): Promise<Tab> {
  const CDP = requireCDP();
  const target = await CDP.New({ port: DEBUG_PORT, url: 'about:blank' });
  const client: CDPClient = await CDP({ target: target.webSocketDebuggerUrl });
  const { Page, Runtime } = client;
  await Page.enable();
  await Runtime.enable();
  await installBridge(client, onBridge);

  const loaded = Page.loadEventFired();
  await Page.navigate({ url });
  await Promise.race([loaded, sleep(20000)]);
  await sleep(800); // settle late-rendering SPAs
  return { targetId: target.id, client };
}

export interface BridgeMsg {
  id: string;
  path: string;
  method: string;
  body: any;
}

// Page → Node RPC. The page calls window.__aplydBind(JSON) (a CDP binding); Node
// runs the handler and resolves the page-side promise via __aplydResolve.
async function installBridge(client: CDPClient, onBridge: (m: BridgeMsg) => Promise<any>): Promise<void> {
  const { Runtime } = client;
  await Runtime.addBinding({ name: '__aplydBind' });
  client.on('Runtime.bindingCalled', async (ev: any) => {
    if (ev.name !== '__aplydBind') return;
    let msg: BridgeMsg;
    try { msg = JSON.parse(ev.payload); } catch { return; }
    let result: any = { ok: false };
    try { result = await onBridge(msg); } catch (e) { result = { ok: false, error: String(e) }; }
    const expr = `window.__aplydResolve(${JSON.stringify(msg.id)}, ${JSON.stringify(result)})`;
    try { await Runtime.evaluate({ expression: expr }); } catch { /* tab gone */ }
  });
}

// Evaluate an expression in the tab and return its (by-value) result. The
// expression should evaluate to a Promise; we await it.
export async function evalInTab(tab: Tab, expression: string): Promise<any> {
  const { result, exceptionDetails } = await tab.client.Runtime.evaluate({
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || exceptionDetails.text || 'eval failed');
  }
  return result.value;
}

// Inject a script source string into the tab (the ported filler engine).
export async function injectSource(tab: Tab, source: string): Promise<void> {
  const { exceptionDetails } = await tab.client.Runtime.evaluate({ expression: source });
  if (exceptionDetails) {
    throw new Error('inject failed: ' + (exceptionDetails.exception?.description || exceptionDetails.text));
  }
}

// Capture a PNG screenshot, write it under userData, return the file path.
export async function screenshot(tab: Tab, jobId: string): Promise<string> {
  const { data } = await tab.client.Page.captureScreenshot({ format: 'png', captureBeyondViewport: false });
  const dir = path.join(app.getPath('userData'), 'autopilot-shots');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${jobId}.png`);
  fs.writeFileSync(file, Buffer.from(data, 'base64'));
  return file;
}

export async function closeTab(tab: Tab): Promise<void> {
  try { await tab.client.close(); } catch { /* ignore */ }
  try { const CDP = requireCDP(); await CDP.Close({ port: DEBUG_PORT, id: tab.targetId }); } catch { /* ignore */ }
}

export function shutdown(): void {
  try { chromeProc?.kill(); } catch { /* ignore */ }
  chromeProc = null;
}

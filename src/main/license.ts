import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

/**
 * Shared, entitlement-based license layer for the purpl hq hub.
 *
 * The hub sells many SKUs (single apps and bundles). A license key carries a set
 * of ENTITLEMENTS — the app ids it unlocks. Each app checks whether any stored
 * activation entitles IT, so buying the launch bundle unlocks inkd + aplyd, while
 * a future app is a separate purchase that adds its own entitlement.
 *
 * Activations live in a SHARED store (~/Library/Application Support/purpl/
 * license.json) so all purpl hq apps see every entitlement the user owns.
 * Validation goes through a provider; the local DevLicenseProvider resolves dev
 * keys to entitlements now, and the Stripe-backed validator drops into the same
 * resolveKey() slot later.
 */

// Replace with a build-time injected secret before public release. Signs each
// activation so the JSON can't be hand-forged.
const SIGNING_SECRET = 'purpl-hq-dev-signing-key-v1';

// DevLicenseProvider: dev keys → the app ids they unlock.
const DEV_KEYS: Record<string, string[]> = {
  'PURPL-HQ-DEV-2026': ['inkd', 'aplyd'], // launch bundle
  'PURPL-INKD-DEV-2026': ['inkd'], // single-app example
  'PURPL-APLYD-DEV-2026': ['aplyd'], // single-app example
};

export interface LicenseStatus {
  /** Whether the querying app is entitled. */
  licensed: boolean;
  /** All app ids the user owns across every active key. */
  entitlements: string[];
}

interface Activation {
  key: string;
  entitlements: string[];
  activatedAt: string;
  sig: string;
}

interface Store {
  activations: Activation[];
}

function sharedDir(): string {
  return path.join(app.getPath('appData'), 'purpl');
}
function licensePath(): string {
  return path.join(sharedDir(), 'license.json');
}

function sign(a: Pick<Activation, 'key' | 'entitlements' | 'activatedAt'>): string {
  const payload = `${a.key}|${[...a.entitlements].sort().join(',')}|${a.activatedAt}`;
  return crypto.createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex');
}

function readStore(): Store {
  try {
    const raw = fs.readFileSync(licensePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Store;
    const activations = (parsed.activations || []).filter((a) => a.sig === sign(a));
    return { activations };
  } catch {
    return { activations: [] };
  }
}

function writeStore(store: Store): void {
  fs.mkdirSync(sharedDir(), { recursive: true });
  fs.writeFileSync(licensePath(), JSON.stringify(store, null, 2));
}

/** Every app id the user currently owns (validated activations only). */
function ownedEntitlements(): string[] {
  const set = new Set<string>();
  for (const a of readStore().activations) for (const e of a.entitlements) set.add(e);
  return [...set];
}

/** License state for a specific app. `appId` is the app querying (e.g. 'aplyd'). */
export function getLicenseStatus(appId: string): LicenseStatus {
  const entitlements = ownedEntitlements();
  return { licensed: entitlements.includes(appId), entitlements };
}

/**
 * Resolve a key to the entitlements it grants, or null if invalid. Swap this body
 * for a call to the Stripe-backed license API later; callers don't change.
 */
function resolveKey(key: string): { entitlements: string[] } | null {
  const ent = DEV_KEYS[key];
  return ent ? { entitlements: ent } : null;
}

/** Activate a key. Adds (or refreshes) its entitlements in the shared store. */
export function activateLicense(rawKey: string): { ok: boolean; error?: string; entitlements?: string[] } {
  const key = (rawKey || '').trim().toUpperCase();
  if (!key) return { ok: false, error: 'Enter your license key.' };

  const resolved = resolveKey(key);
  if (!resolved) {
    return { ok: false, error: 'That license key isn’t valid. Check it and try again.' };
  }

  const activation: Activation = {
    key,
    entitlements: resolved.entitlements,
    activatedAt: new Date().toISOString(),
    sig: '',
  };
  activation.sig = sign(activation);

  try {
    const store = readStore();
    // De-dupe by key (re-activating the same key just refreshes it).
    store.activations = store.activations.filter((a) => a.key !== key);
    store.activations.push(activation);
    writeStore(store);
    return { ok: true, entitlements: resolved.entitlements };
  } catch (err) {
    return { ok: false, error: 'Could not save activation: ' + (err instanceof Error ? err.message : String(err)) };
  }
}

/** Remove all activations (testing / "deactivate this machine"). */
export function deactivateLicense(): void {
  try {
    fs.unlinkSync(licensePath());
  } catch {
    /* already gone */
  }
}

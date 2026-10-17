import * as Crypto from 'expo-crypto';
import { openDriver } from '../storage';
import { authorizeScope, bindScope, readScope, SCOPE_SCHEMA, type ProviderScope } from './scope-store';
import type { ObservedContext } from './context';
import { CAPTURE_SCHEMA, persistCapture, readLatestCapture } from './capture-store';
import { VIEW_SCHEMA, rememberView, pendingView, forgetView } from './view-store';
import type { ProbeSnapshot } from './probe';
import type { ViewPreferences } from './view';
import { LEGACY_RECOVERY_SCHEMA, readLegacyCopy, prepareLegacyCopy, preserveLegacySafety, legacyResolved, resolveLegacyCopy } from './legacy-recovery-store';

async function registry() {
  const db = await openDriver('vereinsflieger-owner-registry.sqlite');
  try { await db.exec('PRAGMA synchronous=FULL;' + SCOPE_SCHEMA); return db; }
  catch (e) { await db.close(); throw e; }
}
export async function loadProviderScope(owner: string): Promise<ProviderScope | null> {
  const db = await registry(); try { return await readScope(db, owner); } finally { await db.close(); }
}
export async function confirmProviderScope(owner: string, context: ObservedContext): Promise<ProviderScope> {
  const db = await registry();
  try { return await bindScope(db, { version: 1, owner, connectionId: Crypto.randomUUID(), context }); }
  finally { await db.close(); }
}
async function scoped(scope: ProviderScope) {
  const r = await registry(); let saved: ProviderScope;
  try { saved = await authorizeScope(r, scope); } finally { await r.close(); }
  // Opaque persisted ID; never put a provider account/club label into a path.
  const db = await openDriver(`vereinsflieger-owned-${saved.connectionId}.sqlite`);
  try { await db.exec('PRAGMA synchronous=FULL;' + CAPTURE_SCHEMA + ';' + VIEW_SCHEMA + LEGACY_RECOVERY_SCHEMA); return db; }
  catch (e) { await db.close(); throw e; }
}
export async function loadScopedCapture(scope: ProviderScope) { const db = await scoped(scope); try { return await readLatestCapture(db); } finally { await db.close(); } }
export async function saveScopedCapture(scope: ProviderScope, value: ProbeSnapshot) { const db = await scoped(scope); try { await persistCapture(db, value); } finally { await db.close(); } }
export async function loadScopedView(scope: ProviderScope) { const db = await scoped(scope); try { return await pendingView(db); } finally { await db.close(); } }
export async function saveScopedView(scope: ProviderScope, value: ViewPreferences) { const db = await scoped(scope); try { await rememberView(db, value); } finally { await db.close(); } }
export async function clearScopedView(scope: ProviderScope, value: ViewPreferences) { const db = await scoped(scope); try { await forgetView(db, value); } finally { await db.close(); } }
export async function loadLegacyCopy(scope: ProviderScope) { const db = await scoped(scope); try { return await readLegacyCopy(db, scope); } finally { await db.close(); } }
export async function prepareScopedLegacy(scope: ProviderScope, fingerprint: string, target: ViewPreferences) { const db = await scoped(scope); try { let value; await db.transaction(async tx => { value = await prepareLegacyCopy(tx, scope, fingerprint, target); }); return value!; } finally { await db.close(); } }
export async function saveLegacySafety(scope: ProviderScope, fingerprint: string, view: ViewPreferences) { const db = await scoped(scope); try { await db.transaction(tx => preserveLegacySafety(tx, scope, fingerprint, view)); } finally { await db.close(); } }
export async function isLegacyResolved(scope: ProviderScope, fingerprint: string) { const db = await scoped(scope); try { return await legacyResolved(db, scope, fingerprint); } finally { await db.close(); } }
export async function legacyQuarantined(scope: ProviderScope | null, fingerprint: string | null) {
  if (!scope) return !!fingerprint;
  const db = await scoped(scope);
  try {
    const copy = await readLegacyCopy(db, scope);
    if (copy && copy.fingerprint !== fingerprint) return true;
    return !!fingerprint && !await legacyResolved(db, scope, fingerprint);
  } finally { await db.close(); }
}
export async function finishScopedLegacy(scope: ProviderScope, fingerprint: string, target: ViewPreferences, safety: ViewPreferences) { const db = await scoped(scope); try { await db.transaction(tx => resolveLegacyCopy(tx, scope, fingerprint, target, safety)); } finally { await db.close(); } }

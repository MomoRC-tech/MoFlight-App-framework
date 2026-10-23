import * as Crypto from 'expo-crypto';
import { openDriver } from '../storage';
import { authorizeScope, bindScope, readScope, SCOPE_SCHEMA, type ProviderScope } from './scope-store';
import type { ObservedContext } from './context';
import { CAPTURE_SCHEMA, persistCapture, readLatestCapture } from './capture-store';
import { VIEW_SCHEMA, rememberView, pendingView, forgetView, supersedeView } from './view-store';
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
export async function supersedeScopedView(scope: ProviderScope, value: ViewPreferences | null) { const db=await scoped(scope);try{await db.transaction(tx=>supersedeView(tx,value));}finally{await db.close();} }
/** Optional advisory cache, separate from canonical flights/receipts and excluded from backups. */
export async function loadScopedActivity(scope: ProviderScope, store: string): Promise<unknown | null> {
  if (!store || store.length > 200) throw new Error('Invalid activity library scope.');
  const db = await scoped(scope);
  try {
    await db.exec('CREATE TABLE IF NOT EXISTS activity_advice_v1(store TEXT PRIMARY KEY,payload TEXT NOT NULL);');
    const row = await db.first<{ payload: string }>('SELECT payload FROM activity_advice_v1 WHERE store=?', store);
    if (!row) return null;
    if (row.payload.length > 128_000) throw new Error('Invalid activity cache size.');
    return JSON.parse(row.payload);
  } finally { await db.close(); }
}
export async function saveScopedActivity(scope: ProviderScope, store: string, value: unknown, gate: () => void): Promise<void> {
  if (!store || store.length > 200) throw new Error('Invalid activity library scope.');
  const payload = JSON.stringify(value);
  if (encodeURIComponent(payload).replace(/%[A-F\d]{2}|./g, 'x').length > 128_000) throw new Error('Invalid activity cache size.');
  gate(); const db = await scoped(scope);
  try {
    gate(); await db.exec('CREATE TABLE IF NOT EXISTS activity_advice_v1(store TEXT PRIMARY KEY,payload TEXT NOT NULL);');
    gate(); await db.run('INSERT INTO activity_advice_v1(store,payload) VALUES (?,?) ON CONFLICT(store) DO UPDATE SET payload=excluded.payload', store, payload);
    gate(); const row = await db.first<{ payload: string }>('SELECT payload FROM activity_advice_v1 WHERE store=?', store);
    gate(); if (row?.payload !== payload) throw new Error('Activity cache readback failed.');
  } finally { await db.close(); }
}
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

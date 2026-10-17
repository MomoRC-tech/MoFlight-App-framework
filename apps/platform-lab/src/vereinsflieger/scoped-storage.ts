import * as Crypto from 'expo-crypto';
import { openDriver } from '../storage';
import { authorizeScope, bindScope, readScope, SCOPE_SCHEMA, type ProviderScope } from './scope-store';
import type { ObservedContext } from './context';
import { CAPTURE_SCHEMA, persistCapture, readLatestCapture } from './capture-store';
import { VIEW_SCHEMA, rememberView, pendingView, forgetView } from './view-store';
import type { ProbeSnapshot } from './probe';
import type { ViewPreferences } from './view';

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
  try { await db.exec('PRAGMA synchronous=FULL;' + CAPTURE_SCHEMA + ';' + VIEW_SCHEMA); return db; }
  catch (e) { await db.close(); throw e; }
}
export async function loadScopedCapture(scope: ProviderScope) { const db = await scoped(scope); try { return await readLatestCapture(db); } finally { await db.close(); } }
export async function saveScopedCapture(scope: ProviderScope, value: ProbeSnapshot) { const db = await scoped(scope); try { await persistCapture(db, value); } finally { await db.close(); } }
export async function loadScopedView(scope: ProviderScope) { const db = await scoped(scope); try { return await pendingView(db); } finally { await db.close(); } }
export async function saveScopedView(scope: ProviderScope, value: ViewPreferences) { const db = await scoped(scope); try { await rememberView(db, value); } finally { await db.close(); } }
export async function clearScopedView(scope: ProviderScope, value: ViewPreferences) { const db = await scoped(scope); try { await forgetView(db, value); } finally { await db.close(); } }

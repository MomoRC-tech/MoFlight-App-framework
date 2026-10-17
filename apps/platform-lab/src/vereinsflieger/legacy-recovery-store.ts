import { canonical } from '@moflight/flight-logbook';
import type { Connection, Hash } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';
import { validateView, sameView, type ViewPreferences } from './view';
import { pendingView } from './view-store';

/** Only scoped working evidence is written. The legacy database is never opened here. */
export const LEGACY_RECOVERY_SCHEMA = `
CREATE TABLE IF NOT EXISTS legacy_recovery_copy (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS legacy_recovery_safety (payload TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS legacy_recovery_receipt (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);`;
export interface LegacyRecoveryCopy { version: 1; scope: ProviderScope; fingerprint: string; target: ViewPreferences; decision: 'explicit-recovery-only-v1' }
export function validateFingerprint(value: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('Invalid recovery fingerprint.');
  return value;
}
export async function validateLegacyPayload(payload: string, fingerprint: string, hash: Hash): Promise<ViewPreferences> {
  validateFingerprint(fingerprint);
  if (typeof payload !== 'string' || payload.length > 400_000 || await hash(payload) !== fingerprint) throw new Error('Reviewed journal changed.');
  return validateView(JSON.parse(payload));
}
export async function readLegacyCopy(db: Connection, scope: ProviderScope): Promise<LegacyRecoveryCopy | null> {
  const row = await db.first<{ payload: string }>('SELECT payload FROM legacy_recovery_copy WHERE id=1');
  if (!row) return null;
  if (row.payload.length > 410_000) throw new Error('Invalid recovery copy.');
  const value = JSON.parse(row.payload) as LegacyRecoveryCopy;
  if (value.version !== 1 || value.decision !== 'explicit-recovery-only-v1' || canonical(validateScope(value.scope)) !== canonical(validateScope(scope))) throw new Error('Foreign recovery copy.');
  return { version: 1, scope: validateScope(scope), fingerprint: validateFingerprint(value.fingerprint), target: validateView(value.target), decision: value.decision };
}
export async function prepareLegacyCopy(db: Connection, scope: ProviderScope, fingerprint: string, target: ViewPreferences): Promise<LegacyRecoveryCopy> {
  if (await pendingView(db)) throw new Error('A scoped view still needs recovery.');
  const copy: LegacyRecoveryCopy = { version: 1, scope: validateScope(scope), fingerprint: validateFingerprint(fingerprint), target: validateView(target), decision: 'explicit-recovery-only-v1' };
  const receipt = await db.first('SELECT payload FROM legacy_recovery_receipt WHERE id=1');
  if (receipt) throw new Error('Reviewed recovery already resolved.');
  await db.run('INSERT INTO legacy_recovery_copy(id,payload) VALUES (1,?) ON CONFLICT(id) DO NOTHING', canonical(copy));
  const saved = await readLegacyCopy(db, scope);
  if (!saved || canonical(saved) !== canonical(copy)) throw new Error('Conflicting recovery copy.');
  return saved;
}
export async function preserveLegacySafety(db: Connection, scope: ProviderScope, fingerprint: string, view: ViewPreferences): Promise<void> {
  const copy = await readLegacyCopy(db, scope), safety = validateView(view);
  if (!copy || copy.fingerprint !== validateFingerprint(fingerprint) || safety.accountLabel !== copy.target.accountLabel) throw new Error('Recovery context changed.');
  if (await pendingView(db)) throw new Error('A scoped view still needs recovery.');
  await db.run('INSERT INTO legacy_recovery_safety(payload) VALUES (?) ON CONFLICT(payload) DO NOTHING', canonical(safety));
  if (!await db.first('SELECT payload FROM legacy_recovery_safety WHERE payload=?', canonical(safety))) throw new Error('Safety view not durable.');
}
export async function legacyResolved(db: Connection, scope: ProviderScope, fingerprint: string): Promise<boolean> {
  validateFingerprint(fingerprint);
  const row = await db.first<{ payload: string }>('SELECT payload FROM legacy_recovery_receipt WHERE id=1');
  if (!row) return false;
  const copy = await readLegacyCopy(db, scope);
  // Exact expected receipt: malformed/foreign receipts can never waive quarantine.
  return !!copy && copy.fingerprint === fingerprint && row.payload === canonical({ version: 1, scope: validateScope(scope), fingerprint, target: copy.target, verified: 'full-supported-readback-v1' });
}
export async function resolveLegacyCopy(db: Connection, scope: ProviderScope, fingerprint: string, target: ViewPreferences, safety: ViewPreferences): Promise<void> {
  const copy = await readLegacyCopy(db, scope);
  if (!copy || copy.fingerprint !== validateFingerprint(fingerprint) || canonical(copy.target) !== canonical(validateView(target))) throw new Error('Recovery changed.');
  if (!await db.first('SELECT payload FROM legacy_recovery_safety WHERE payload=?', canonical(validateView(safety)))) throw new Error('Safety evidence missing.');
  if (await pendingView(db)) throw new Error('A scoped view still needs recovery.');
  const payload = canonical({ version: 1, scope: validateScope(scope), fingerprint, target: copy.target, verified: 'full-supported-readback-v1' });
  await db.run('INSERT INTO legacy_recovery_receipt(id,payload) VALUES (1,?) ON CONFLICT(id) DO NOTHING', payload);
  if (!await legacyResolved(db, scope, fingerprint)) throw new Error('Resolution not durable.');
}

/** Preset labels may change on restore; supported settings and account must match. */
export function legacyViewNeedsChoice(target: ViewPreferences, current: ViewPreferences): boolean {
  return !sameView(validateView(target), validateView(current));
}

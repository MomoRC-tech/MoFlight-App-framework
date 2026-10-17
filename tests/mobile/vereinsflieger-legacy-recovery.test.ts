import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { LEGACY_RECOVERY_SCHEMA, validateLegacyPayload, readLegacyCopy, prepareLegacyCopy, preserveLegacySafety, legacyResolved, resolveLegacyCopy, legacyViewNeedsChoice } from '../../apps/platform-lab/src/vereinsflieger/legacy-recovery-store.ts';
import { VIEW_SCHEMA, rememberView } from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import type { ViewPreferences } from '../../apps/platform-lab/src/vereinsflieger/view.ts';

const scope: ProviderScope = { version: 1, owner: 'synthetic-a', connectionId: 'opaque-a', context: { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const target: ViewPreferences = { version: 2, accountLabel: 'Synthetic Pilot', preset: 'Synthetic view', columns: ['1'], filters: [{ name: 'col1', type: 'text', value: '', checked: false }], sort: [], role: 'Pilot', period: 'Das letzte Jahr', reset: false };
const payload = JSON.stringify(target), hash = async (text: string) => createHash('sha256').update(text).digest('hex'), fingerprint = await hash(payload);
async function database(path = ':memory:') { const db = nodeDriver(path); await db.exec(VIEW_SCHEMA + LEGACY_RECOVERY_SCHEMA); return db; }

test('reviewed payload requires exact original bytes, bounded size and complete supported view validation', async () => {
  assert.deepEqual(await validateLegacyPayload(payload, fingerprint, hash), target);
  for (const [text, fp] of [[payload + ' ', fingerprint], [payload, '00'.repeat(32)], ['x'.repeat(400001), fingerprint], [payload, '../forged']]) await assert.rejects(validateLegacyPayload(text!, fp!, hash));
  for (const invalid of [{ ...target, version: 3 }, { ...target, filters: [] }, { ...target, columns: ['x'] }, { ...target, reset: true }]) {
    const text = JSON.stringify(invalid); await assert.rejects(validateLegacyPayload(text, await hash(text), hash));
  }
});

test('recovery copy and multiple safety snapshots remain immutable across retries and disk reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-legacy-recovery-'));
  let db = await database(join(dir, 'scoped.sqlite'));
  try {
    const a = await prepareLegacyCopy(db, scope, fingerprint, target);
    assert.deepEqual(await prepareLegacyCopy(db, scope, fingerprint, target), a);
    await preserveLegacySafety(db, scope, fingerprint, target);
    await preserveLegacySafety(db, scope, fingerprint, target);
    const changed = { ...target, period: 'Die letzten 20 Flüge (max. 24 Monate)' };
    await preserveLegacySafety(db, scope, fingerprint, changed);
    assert.equal((await db.all('SELECT * FROM legacy_recovery_safety')).length, 2);
    await db.close(); db = await database(join(dir, 'scoped.sqlite'));
    assert.deepEqual(await readLegacyCopy(db, scope), a);
    assert.equal(await legacyResolved(db, scope, fingerprint), false);
    assert.equal(legacyViewNeedsChoice(target, changed), true);
    assert.equal(legacyViewNeedsChoice(target, { ...target, preset: 'Another display label' }), false);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('foreign owners, contexts, connection IDs and changed fingerprint cannot reuse recovery or receipt', async () => {
  const db = await database();
  try {
    await prepareLegacyCopy(db, scope, fingerprint, target);
    for (const other of [{ ...scope, owner: 'synthetic-b' }, { ...scope, connectionId: 'opaque-b' }, { ...scope, context: { ...scope.context, accountNumber: '456' } }]) {
      await assert.rejects(readLegacyCopy(db, other));
      await assert.rejects(preserveLegacySafety(db, other, fingerprint, target));
      await assert.rejects(resolveLegacyCopy(db, other, fingerprint, target, target));
    }
    await assert.rejects(prepareLegacyCopy(db, scope, 'cd'.repeat(32), target));
    await assert.rejects(preserveLegacySafety(db, scope, 'cd'.repeat(32), target));
    await assert.rejects(resolveLegacyCopy(db, scope, fingerprint, target, target)); // no safety
    await assert.rejects(preserveLegacySafety(db, scope, fingerprint, { ...target, accountLabel: 'Other pilot' }));
    assert.equal(await legacyResolved(db, scope, fingerprint), false);
  } finally { await db.close(); }
});

test('conflicting scoped journals block copy, replay safety and resolution without overwriting either source', async () => {
  const db = await database();
  try {
    await rememberView(db, target);
    await assert.rejects(prepareLegacyCopy(db, scope, fingerprint, target));
    assert.equal(await readLegacyCopy(db, scope), null);
    await db.run('DELETE FROM provider_view_recovery'); // synthetic fixture only
    await prepareLegacyCopy(db, scope, fingerprint, target); await preserveLegacySafety(db, scope, fingerprint, target);
    await rememberView(db, { ...target, period: 'Synthetic pending period' });
    await assert.rejects(preserveLegacySafety(db, scope, fingerprint, target));
    await assert.rejects(resolveLegacyCopy(db, scope, fingerprint, target, target));
    assert.equal(await legacyResolved(db, scope, fingerprint), false);
  } finally { await db.close(); }
});

test('interrupted copy and receipt transactions roll back; durable receipt preserves every working/safety row', async () => {
  const db = await database();
  try {
    await assert.rejects(db.transaction(async tx => { await prepareLegacyCopy(tx, scope, fingerprint, target); throw new Error('Synthetic crash'); }));
    assert.equal(await readLegacyCopy(db, scope), null);
    await db.transaction(async tx => { await prepareLegacyCopy(tx, scope, fingerprint, target); });
    await db.transaction(tx => preserveLegacySafety(tx, scope, fingerprint, target));
    await assert.rejects(db.transaction(async tx => { await resolveLegacyCopy(tx, scope, fingerprint, target, target); throw new Error('Synthetic crash before commit'); }));
    assert.equal(await legacyResolved(db, scope, fingerprint), false);
    await db.transaction(tx => resolveLegacyCopy(tx, scope, fingerprint, target, target));
    await db.transaction(tx => resolveLegacyCopy(tx, scope, fingerprint, target, target)); // receipt retry
    assert.equal(await legacyResolved(db, scope, fingerprint), true);
    assert.equal(await legacyResolved(db, scope, 'cd'.repeat(32)), false);
    assert.ok(await readLegacyCopy(db, scope));
    assert.equal((await db.all('SELECT * FROM legacy_recovery_safety')).length, 1);
    await assert.rejects(prepareLegacyCopy(db, scope, fingerprint, target));
    await db.run('UPDATE legacy_recovery_receipt SET payload=?', canonical({ fingerprint }));
    assert.equal(await legacyResolved(db, scope, fingerprint), false);
  } finally { await db.close(); }
});

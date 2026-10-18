import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as scopeStore from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import * as captureStore from '../../apps/platform-lab/src/vereinsflieger/capture-store.ts';
import * as viewStore from '../../apps/platform-lab/src/vereinsflieger/view-store.ts';
import * as legacyStore from '../../apps/platform-lab/src/vereinsflieger/legacy-recovery-store.ts';
import type * as ScopedStorage from '../../apps/platform-lab/src/vereinsflieger/scoped-storage.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { SCOPE_SCHEMA, bindScope, readScope, authorizeScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { ConnectionSession } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import { captureFixture } from './capture-review-fixture.ts';
import { captureReviewPage, openCaptureReview } from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';

const context = { accountNumber: '123', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const scope: ProviderScope = { version: 1, owner: 'pilot-a', connectionId: 'random-connection-a', context };
test('durable provider association survives SQLite reopen without claiming live confidence or allowing replacement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-scope-'));
  let db = nodeDriver(join(dir, 'registry.sqlite'));
  try {
    await db.exec(SCOPE_SCHEMA);
    assert.equal(await readScope(db, 'pilot-a'), null);
    await bindScope(db, scope); await db.close();
    db = nodeDriver(join(dir, 'registry.sqlite'));
    const saved = await readScope(db, 'pilot-a'); assert.deepEqual(saved, scope);
    assert.deepEqual(await bindScope(db, { ...scope, connectionId: 'new-unused-id' }), scope);
    await assert.rejects(bindScope(db, { ...scope, context: { ...context, accountNumber: '456' } }), /mismatch/);
    await assert.rejects(bindScope(db, { ...scope, context: { ...context, clubLabel: 'Other club' } }), /mismatch/);
    assert.deepEqual(await readScope(db, 'pilot-a'), scope);
    const session = new ConnectionSession(); session.restoreAssociation(saved!.context);
    assert.equal(session.state.confirmed, false); assert.equal(session.state.lastCheckedAt, null);
    session.start('fresh'); assert.equal(session.observe('fresh', { ...context, accountNumber: '456' }, '2026-10-17T10:00:00.000Z'), false);
    assert.equal(session.confirm(), false);
    session.start('fresh-2'); assert.equal(session.observe('fresh-2', context, '2026-10-17T10:01:00.000Z'), true);
    assert.equal(session.state.confirmed, true);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('scope authority rejects missing owners, forged connection IDs and borrowed provider contexts', async () => {
  const db = nodeDriver(':memory:');
  try {
    await db.exec(SCOPE_SCHEMA); await bindScope(db, scope);
    const second = { ...scope, owner: 'pilot-b', connectionId: 'random-connection-b', context: { ...context, accountNumber: '456' } };
    await bindScope(db, second);
    assert.deepEqual(await authorizeScope(db, second), second);
    for (const forged of [
      { ...scope, owner: 'pilot-c' }, { ...scope, owner: second.owner },
      { ...scope, connectionId: second.connectionId }, { ...scope, context: second.context },
      { ...scope, owner: '../legacy' }, { ...scope, connectionId: '../legacy' },
    ]) await assert.rejects(authorizeScope(db, forged));
    assert.equal((await readScope(db, 'pilot-a'))?.context.clubIdentity, 'display-label-only');
  } finally { await db.close(); }
});

test('native scoped adapter reopens separate owner journals and rejects forged file routing before access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-scoped-adapter-'));
  const opened: string[] = []; let id = 0;
  const modules: Record<string, unknown> = {
    'expo-crypto': { randomUUID: () => `opaque-${++id}` },
    '../storage': { openDriver: async (name: string) => { opened.push(name); return nodeDriver(join(dir, name)); } },
    './scope-store': scopeStore, './capture-store': captureStore, './view-store': viewStore, './legacy-recovery-store': legacyStore,
  };
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/scoped-storage.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  const storage = {} as typeof ScopedStorage;
  runInNewContext(source, { exports: storage, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  const view = { version: 2 as const, accountLabel: 'Synthetic account A', preset: 'Synthetic original', columns: ['1'], filters: [{ name: 'col1', type: 'text' as const, value: '', checked: false }], sort: [], role: 'Pilot', period: 'Das letzte Jahr', reset: false };
  try {
    const a = await storage.confirmProviderScope('pilot-a', context);
    const b = await storage.confirmProviderScope('pilot-b', { ...context, accountNumber: '456' });
    await storage.saveScopedView(a, view);
    assert.equal(await storage.loadScopedView(b), null);
    await storage.saveScopedView(b, { ...view, accountLabel: 'Synthetic account B' });
    assert.equal((await storage.loadScopedView(a))?.accountLabel, view.accountLabel);
    assert.equal((await storage.loadScopedView(b))?.accountLabel, 'Synthetic account B');
    assert.deepEqual(await storage.loadProviderScope('pilot-a'), a);
    const capture = captureFixture(6);
    assert.equal(await storage.loadScopedCapture(a), null);
    await storage.saveScopedCapture(a, capture);
    assert.equal(await storage.loadScopedCapture(b), null);
    const reopened = openCaptureReview(await storage.loadScopedCapture(a));
    assert.deepEqual(reopened, capture);
    assert.equal(captureReviewPage(reopened, 1).flights[0]?.observation.row.sourceFlightId, '1005');
    // Every adapter call closes/reopens SQLite. Retrying a capture is idempotent;
    // a rejected correction cannot replace the prior offline review.
    await storage.saveScopedCapture(a, capture);
    const changed = structuredClone(capture); changed.rows[0]!.values[4] = '99';
    await assert.rejects(storage.saveScopedCapture(a, changed), /identity conflict/);
    assert.deepEqual(openCaptureReview(await storage.loadScopedCapture(a)), capture);
    await assert.rejects(storage.loadScopedCapture({ ...a, connectionId: b.connectionId }));
    await assert.rejects(storage.saveScopedCapture({ ...a, owner: b.owner }, capture));
    assert.equal(await storage.loadScopedCapture(b), null);
    const count = opened.filter(name => name.startsWith('vereinsflieger-owned-')).length;
    await assert.rejects(storage.loadScopedView({ ...a, connectionId: b.connectionId }));
    await assert.rejects(storage.clearScopedView({ ...a, owner: b.owner }, view));
    assert.equal(opened.filter(name => name.startsWith('vereinsflieger-owned-')).length, count);
    await storage.clearScopedView(a, view);
    assert.equal(await storage.loadScopedView(a), null);
    assert.equal((await storage.loadScopedView(b))?.accountLabel, 'Synthetic account B');
    const fingerprint = 'ab'.repeat(32);
    assert.equal(await storage.legacyQuarantined(a, fingerprint), true);
    await storage.prepareScopedLegacy(a, fingerprint, view);
    assert.equal(await storage.loadLegacyCopy(b), null);
    assert.equal(await storage.legacyQuarantined(a, null), true); // missing source cannot waive an outstanding copy
    await storage.saveLegacySafety(a, fingerprint, view);
    await storage.finishScopedLegacy(a, fingerprint, view, view);
    assert.equal(await storage.legacyQuarantined(a, fingerprint), false);
    assert.equal(await storage.legacyQuarantined(a, 'cd'.repeat(32)), true);
    assert.equal(await storage.legacyQuarantined(b, fingerprint), true);
    assert.equal(await storage.legacyQuarantined(a, null), true);
    const beforeForged = opened.filter(name => name.startsWith('vereinsflieger-owned-')).length;
    await assert.rejects(storage.finishScopedLegacy({ ...a, connectionId: b.connectionId }, fingerprint, view, view));
    await assert.rejects(storage.prepareScopedLegacy({ ...a, owner: b.owner }, fingerprint, view));
    assert.equal(opened.filter(name => name.startsWith('vereinsflieger-owned-')).length, beforeForged);
    assert.ok(opened.every(name => !name.includes('access-probe') && !name.includes('123') && !name.includes('456')));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

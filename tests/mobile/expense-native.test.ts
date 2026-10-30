import assert from 'node:assert/strict';
import test from 'node:test';
import { closeSync, existsSync, openSync, writeFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { Driver } from '../../packages/local-data/src/index.ts';
import type { RealFlightNativeScope } from '../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts';
import type { UserFinancialBackup } from '../../apps/platform-lab/src/user-backup.ts';
import { createFinancialNativeAdapter } from '../../apps/platform-lab/src/vereinsflieger/expense-native-adapter.ts';
import { FinancialObservationStore, validateFinancialObservationTarget } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { FinancialCaptureRun } from '../../apps/platform-lab/src/vereinsflieger/expense-capture-run.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { financialTarget as target, financialHash as hash, financialObservation as observation, financialAt as at,
  financialListUrl as listUrl, financialDetailUrl as detailUrl, financialProfile as profile, financialRead as read } from './fixtures/expense-capture.ts';

const noop = async () => {};
const leaseId = '44444444-4444-4444-8444-444444444444';
const operationId = '55555555-5555-4555-8555-555555555555';
const permit = { operationId, ownerId: target.scope.owner, storeId: target.storeId };
type Section = Exclude<UserFinancialBackup, { state: 'absent' }>;
async function archive(populated = true): Promise<Section> {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, noop);
  try {
    await store.initialize(true); if (populated) await store.save('archive', 'billed-flight', observation());
    return { state: populated ? 'present' : 'empty', target, archive: await store.exportBackup() };
  } finally { await db.close(); }
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-native-'));
  const current = { ownerId: target.scope.owner, storeId: target.storeId, leaseId, writable: true };
  const state = { provider: structuredClone(target.scope) as typeof target.scope | null, authorized: true, registry: true,
    pending: null as typeof permit | null, fail: '', opens: 0, closes: 0, afterHash: null as (() => void) | null };
  const scope: RealFlightNativeScope = { lease: { version: 1, ownerId: current.ownerId, storeId: current.storeId,
    leaseId, selectionSeq: 1, selectedAt: '2026-10-30T12:00:00.000Z', createdAt: '2026-10-30T12:00:00.000Z',
    candidateName: 'synthetic-financial-owner.sqlite' }, authorize: () => state.authorized ? { ...current } : null,
    registry: { async assertCurrent(held: { leaseId: string }) { if (!state.registry || held.leaseId !== current.leaseId) throw Error('Expired registry lease'); } } };
  const deps = {
    file(name: string) { assert.match(name, /^moflight-financial-[0-9a-f]{64}(?:-selection|-restore-[0-9a-f-]{36})?\.sqlite$/);
      const path = join(directory, name); return { get exists() { return existsSync(path); }, create() { closeSync(openSync(path, 'wx')); } }; },
    async openDriver(name: string): Promise<Driver> {
      state.opens++; const db = nodeDriver(join(directory, name));
      return { ...db, async close() { state.closes++; await db.close(); }, async transaction(work) {
        let candidateCommit = false, selectionCommit = false;
        await db.transaction(async tx => { await work({ ...tx, async run(sql, ...values) {
          if (/INSERT INTO financial_observations/.test(sql)) candidateCommit = true;
          if (/INSERT INTO financial_store_selections/.test(sql)) selectionCommit = true;
          await tx.run(sql, ...values);
        } });
          if (state.fail === 'candidate-before-commit' && candidateCommit || state.fail === 'selection-before-commit' && selectionCommit) {
            state.fail = ''; throw Error('Synthetic interrupted transaction');
          }
        });
        if (state.fail === 'candidate-commit' && candidateCommit || state.fail === 'selection-commit' && selectionCommit) {
          state.fail = ''; throw Error('Synthetic lost commit acknowledgement');
        }
      } };
    },
    async hash(text: string) { const value = await hash(text); const hook = state.afterHash; state.afterHash = null; hook?.(); return value; },
    async currentProviderScope() { return state.provider; },
    async assertRecovery(allowed?: typeof permit) {
      if (allowed && (!state.pending || JSON.stringify(allowed) !== JSON.stringify(state.pending))) throw Error('Foreign or missing aggregate permit');
      if (!allowed && state.pending) throw Error('Pending aggregate restore');
    },
  };
  const adapter = createFinancialNativeAdapter(deps);
  return { directory, current, state, scope, deps, adapter, async cleanup() {
    assert.equal(state.opens, state.closes, 'all database handles are closed'); await rm(directory, { recursive: true, force: true });
  } };
}

test('financial native absence reads create no files; explicit save survives fresh adapter and database reopen', async () => {
  const f = await fixture();
  try {
    assert.deepEqual(await f.adapter.exportSection(f.scope, noop), { state: 'absent' }); assert.deepEqual(await readdir(f.directory), []);
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { await store.save('saved', 'billed-flight', observation()); });
    const saved = await f.adapter.exportSection(f.scope, noop); assert.equal(saved.state, 'present');
    assert.deepEqual(await createFinancialNativeAdapter(f.deps).exportSection(f.scope, noop), saved);
    assert.equal((await readdir(f.directory)).length, 1);
  } finally { await f.cleanup(); }
});

test('explicit empty financial store exports empty rather than absent', async () => {
  const f = await fixture(); try {
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { assert.equal((await store.assessFlight('54321')).state, 'missing'); });
    assert.equal((await f.adapter.exportSection(f.scope, noop)).state, 'empty');
  } finally { await f.cleanup(); }
});

test('foreign targets, unavailable provider, read-only and expired owner registry cannot create financial files', async () => {
  const f = await fixture(); try {
    await assert.rejects(f.adapter.withCurrentStore(f.scope, { ...target, storeId: leaseId }, noop, async () => {}), /scope changed/);
    f.state.provider = null; assert.deepEqual(await f.adapter.exportSection(f.scope, noop), { state: 'absent' });
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /scope changed/);
    f.state.provider = structuredClone(target.scope); f.current.writable = false;
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /lease/);
    f.current.writable = true; f.state.registry = false;
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /registry lease/);
    assert.deepEqual(await readdir(f.directory), []);
  } finally { await f.cleanup(); }
});

test('changed live provider and lease during hashing reject publication and preserve existing data', async () => {
  const f = await fixture(); try {
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { await store.save('saved', 'billed-flight', observation()); });
    const saved = await f.adapter.exportSection(f.scope, noop);
    f.state.afterHash = () => { f.state.provider!.context.accountNumber = '98765'; };
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /scope changed/);
    f.state.provider = structuredClone(target.scope);
    f.state.afterHash = () => { f.current.leaseId = operationId; f.scope.lease = { ...f.scope.lease, leaseId: operationId }; };
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /lease/);
    f.current.leaseId = leaseId; f.scope.lease = { ...f.scope.lease, leaseId };
    assert.deepEqual(await f.adapter.exportSection(f.scope, noop), saved);
  } finally { await f.cleanup(); }
});

test('financial scope and store partitions preserve independent data for two local owners', async () => {
  const f = await fixture(); try {
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { await store.save('owner-a', 'billed-flight', observation()); });
    const saved = await f.adapter.exportSection(f.scope, noop);
    const other = { ...target, storeId: operationId, scope: { ...target.scope, owner: leaseId, connectionId: operationId } };
    f.current.ownerId = leaseId; f.current.storeId = operationId; f.scope.lease = { ...f.scope.lease, ownerId: leaseId, storeId: operationId };
    f.state.provider = other.scope;
    await f.adapter.withCurrentStore(f.scope, other, noop, async store => { assert.equal(await store.find('owner-a'), null); });
    assert.equal((await f.adapter.exportSection(f.scope, noop)).state, 'empty');
    f.current.ownerId = target.scope.owner; f.current.storeId = target.storeId;
    f.scope.lease = { ...f.scope.lease, ownerId: target.scope.owner, storeId: target.storeId }; f.state.provider = structuredClone(target.scope);
    assert.deepEqual(await f.adapter.exportSection(f.scope, noop), saved);
  } finally { await f.cleanup(); }
});

test('financial restore preserves original file, selects verified candidate and accepts identical replay', async () => {
  const f = await fixture(); try {
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { await store.save('original', 'billed-flight', observation()); });
    const original = (await readdir(f.directory))[0]!, before = readFileSync(join(f.directory, original));
    const input = await archive(); await f.adapter.preflight(f.scope, input, noop);
    assert.equal((await readdir(f.directory)).length, 1, 'preflight creates no selection or candidate');
    f.state.pending = permit; await f.adapter.restore(f.scope, input, permit, noop);
    await createFinancialNativeAdapter(f.deps).restore(f.scope, input, permit, noop);
    assert.deepEqual(readFileSync(join(f.directory, original)), before);
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /Pending aggregate/);
    f.state.pending = null; assert.deepEqual(await f.adapter.exportSection(f.scope, noop), input);
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => {
      assert.equal(await store.find('original'), null); assert.ok(await store.find('archive'));
    });
  } finally { await f.cleanup(); }
});

for (const fail of ['candidate-commit', 'selection-commit', 'candidate-before-commit', 'selection-before-commit']) {
  test(`lost ${fail} acknowledgement leaves recovery gated and resumes the exact preserved candidate`, async () => {
    const f = await fixture(); try {
      const input = await archive(); f.state.pending = permit; f.state.fail = fail;
      await assert.rejects(f.adapter.restore(f.scope, input, permit, noop), /lost commit acknowledgement|interrupted transaction/);
      const files = await readdir(f.directory), candidate = files.find(name => name.includes('-restore-'))!;
      assert.ok(candidate); const before = readFileSync(join(f.directory, candidate));
      await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /Pending aggregate/);
      await assert.rejects(f.adapter.restore(f.scope, await archive(false), permit, noop), /archive changed/);
      assert.deepEqual(readFileSync(join(f.directory, candidate)), before);
      await createFinancialNativeAdapter(f.deps).restore(f.scope, input, permit, noop);
      f.state.pending = null; assert.deepEqual(await f.adapter.exportSection(f.scope, noop), input);
      assert.deepEqual(await readdir(f.directory), files);
    } finally { await f.cleanup(); }
  });
}

test('completed selection missing candidate never recreates an empty financial store or selects a fallback', async () => {
  const f = await fixture(); try {
    const input = await archive(); f.state.pending = permit; await f.adapter.restore(f.scope, input, permit, noop);
    const candidate = (await readdir(f.directory)).find(name => name.includes('-restore-'))!; await unlink(join(f.directory, candidate));
    await assert.rejects(f.adapter.restore(f.scope, input, permit, noop), /candidate is missing/);
    f.state.pending = null;
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /store is missing/);
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /store is missing/);
    assert.equal(existsSync(join(f.directory, candidate)), false);
  } finally { await f.cleanup(); }
});

test('an emptied selected candidate is preserved and cannot be silently reinitialized by capture', async () => {
  const f = await fixture(); try {
    f.state.pending = permit; await f.adapter.restore(f.scope, await archive(), permit, noop); f.state.pending = null;
    const candidate = (await readdir(f.directory)).find(name => name.includes('-restore-'))!, path = join(f.directory, candidate);
    writeFileSync(path, '');
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /Uninitialized/);
    const db = nodeDriver(path);
    try { assert.equal((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version, 0); }
    finally { await db.close(); }
  } finally { await f.cleanup(); }
});

test('foreign, inconsistent, corrupt financial archive and forged restore permits fail before file creation', async () => {
  const f = await fixture(); try {
    const input = await archive();
    await assert.rejects(f.adapter.preflight(f.scope, { ...input, state: 'empty' }, noop), /inconsistent/);
    await assert.rejects(f.adapter.preflight(f.scope, { ...input, archive: 'corrupt' }, noop));
    await assert.rejects(f.adapter.preflight(f.scope, { ...input, target: { ...target, storeId: leaseId } }, noop), /scope changed/);
    await assert.rejects(f.adapter.restore(f.scope, input, permit, noop), /missing aggregate permit/);
    f.state.pending = permit;
    await assert.rejects(f.adapter.restore(f.scope, input, { ...permit, ownerId: leaseId }, noop), /Foreign financial restore/);
    assert.deepEqual(await readdir(f.directory), []);
  } finally { await f.cleanup(); }
});

test('durable pending selection refuses ordinary writers even if aggregate gate is unavailable after restart', async () => {
  const f = await fixture(); try {
    f.state.pending = permit; f.state.fail = 'candidate-commit';
    await assert.rejects(f.adapter.restore(f.scope, await archive(), permit, noop));
    f.state.pending = null;
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /selection is pending/);
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async () => {}), /selection is pending/);
  } finally { await f.cleanup(); }
});

test('corrupt selected financial receipts refuse export and preserve the selected file without falling back', async () => {
  const f = await fixture(); try {
    const input = await archive(); f.state.pending = permit; await f.adapter.restore(f.scope, input, permit, noop); f.state.pending = null;
    const candidate = (await readdir(f.directory)).find(name => name.includes('-restore-'))!, path = join(f.directory, candidate);
    const db = nodeDriver(path);
    try { await db.exec('DROP TRIGGER financial_no_update'); await db.run("UPDATE financial_observations SET checksum=?", 'f'.repeat(64)); }
    finally { await db.close(); }
    const before = readFileSync(path); await assert.rejects(f.adapter.exportSection(f.scope, noop), /Corrupt financial observation receipt/);
    assert.deepEqual(readFileSync(path), before);
  } finally { await f.cleanup(); }
});

test('reserved empty financial file requires explicit write continuation and foreign schemas remain untouched', async () => {
  const f = await fixture(); try {
    const initial = `moflight-financial-${await hash(canonical(target))}.sqlite`;
    f.deps.file(initial).create();
    await assert.rejects(f.adapter.exportSection(f.scope, noop), /Uninitialized/);
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => { await store.save('resumed', 'billed-flight', observation()); });
    assert.equal((await f.adapter.exportSection(f.scope, noop)).state, 'present');
    const selection = initial.replace('.sqlite', '-selection.sqlite'), db = nodeDriver(join(f.directory, selection));
    try { await db.exec('CREATE TABLE unrelated(secret TEXT)'); } finally { await db.close(); }
    const before = readFileSync(join(f.directory, selection)); f.state.pending = permit;
    await assert.rejects(f.adapter.restore(f.scope, await archive(), permit, noop), /nonempty financial selection/);
    assert.deepEqual(readFileSync(join(f.directory, selection)), before);
  } finally { await f.cleanup(); }
});

test('owner revocation after a raw save preserves the uncertain receipt for explicit same-owner retry', async () => {
  const f = await fixture(); try {
    await assert.rejects(f.adapter.withCurrentStore(f.scope, target, noop, async store => {
      await store.save('uncertain', 'billed-flight', observation()); f.state.authorized = false;
    }), /lease/);
    f.state.authorized = true;
    await f.adapter.withCurrentStore(f.scope, target, noop, async store => {
      assert.ok(await store.find('uncertain')); await store.save('uncertain', 'billed-flight', observation());
      assert.equal((await store.history()).total, 1);
    });
  } finally { await f.cleanup(); }
});

test('native restore wrapper requires actual matching durable pending operation even if generic gate accepts an empty journal', async () => {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/expense-native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let captured!: Parameters<typeof createFinancialNativeAdapter>[0]; let closed = 0, pending: typeof permit | null = null;
  const modules: Record<string, unknown> = {
    'expo-file-system': {}, 'expo-sqlite': {}, '../storage': {}, './scoped-storage': {},
    '@moflight/flight-logbook': { canonical }, './expense-observation-store': { validateFinancialObservationTarget },
    './expense-native-adapter': { createFinancialNativeAdapter(deps: typeof captured) { captured = deps; return {}; } },
    '../user-backup-restore-journal-native': { assertNoPendingUserBackupRestore: noop, async openUserBackupRestoreJournal() {
      return { async pending() { return pending ? { ...pending, status: 'pending' } : null; }, async close() { closed++; } };
    } },
  };
  runInNewContext(source, { exports: {}, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  await captured.assertRecovery(); assert.equal(closed, 0);
  await assert.rejects(captured.assertRecovery(permit), /Foreign or completed/);
  pending = { ...permit, storeId: leaseId }; await assert.rejects(captured.assertRecovery(permit), /Foreign or completed/);
  pending = permit; await captured.assertRecovery(permit); assert.equal(closed, 3);
});

test('native capture options bind the original lease and save the guarded run through the actual file adapter', async () => {
  const f = await fixture(); try {
    const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/expense-native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const modules: Record<string, unknown> = {
      'expo-file-system': {}, 'expo-sqlite': {}, '../storage': {}, './scoped-storage': {}, '../user-backup-restore-journal-native': {},
      '@moflight/flight-logbook': { canonical }, './expense-observation-store': { validateFinancialObservationTarget },
      './expense-native-adapter': { createFinancialNativeAdapter() { return f.adapter; } },
    };
    const exports = {} as typeof import('../../apps/platform-lab/src/vereinsflieger/expense-native.ts');
    runInNewContext(source, { exports, Object, JSON, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    assert.throws(() => exports.nativeFinancialCaptureOptions(f.scope, { ...target, storeId: leaseId }, listUrl, detailUrl), /Foreign/);
    const options = exports.nativeFinancialCaptureOptions(f.scope, target, listUrl, detailUrl);
    await options.authorize(noop);
    const run = new FinancialCaptureRun(target, 'native-bound', listUrl, detailUrl);
    for (let i = 0; i < 4; i++) {
      const isProfile = run.stage === 'before' || run.stage === 'after';
      const packet = { kind: isProfile ? 'vf-financial-profile-v1' : run.stage === 'list' ? 'vf-financial-link-v1' : 'vf-financial-billing-v1',
        nonce: run.messageNonce, url: run.url, ...(isProfile ? { profile: profile() } : { page: run.stage === 'list' ? { url: listUrl, detailUrl } : read() }) };
      run.observeNavigation(run.url); run.accept(run.url, run.url, packet, target, at);
    }
    assert.deepEqual((await options.save(run, noop)).value, observation());
    assert.equal((await f.adapter.exportSection(f.scope, noop)).state, 'present');
    f.current.writable = false; await assert.rejects(options.authorize(noop), /unavailable/);
    f.current.writable = true; f.current.leaseId = operationId; f.scope.lease = { ...f.scope.lease, leaseId: operationId };
    await assert.rejects(options.authorize(noop), /lease/);
  } finally { await f.cleanup(); }
});

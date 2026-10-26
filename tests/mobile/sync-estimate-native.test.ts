import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nodeDriver } from './sqlite-driver.ts';
import * as store from '../../apps/platform-lab/src/mobile/sync-estimate-store.ts';
import { SYNC_ESTIMATE_MODEL_VERSION, type SyncEstimateHistory } from '../../apps/platform-lab/src/mobile/sync-estimate.ts';
import type { RealFlightNativeScope } from '../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts';

const source = readFileSync('apps/platform-lab/src/mobile/sync-estimate-native.ts', 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const history: SyncEstimateHistory = { version: SYNC_ESTIMATE_MODEL_VERSION, scope: 'context', samples: [{ stage: 'save', mode: 'repeat', volume: 'small', durationsMs: [50] }] };

function adapter(options: { unavailable?: boolean; revokeAfterSave?: boolean } = {}) {
  const db = nodeDriver(':memory:');
  let permit = { ownerId: 'owner', storeId: 'store', leaseId: 'lease', writable: true };
  const opened: string[] = [];
  const scope = { lease: { ...permit }, authorize: () => permit, registry: { assertCurrent: async () => {} } } as unknown as RealFlightNativeScope;
  const exports = {};
  class Directory {
    uri: string;
    constructor(parent: string, name: string) { assert.equal(parent, 'file:///cache/'); this.uri = parent + name; }
    create() { if (options.unavailable) throw new Error('cache unavailable'); }
  }
  runInNewContext(code, { exports, require: (name: string) => {
    if (name === 'expo-file-system') return { Directory, Paths: { cache: 'file:///cache/' } };
    if (name === '../storage') return { openDriver: async (_file: string, directory?: string) => {
      assert.equal(directory, 'file:///cache/moflight-sync-estimate-hints');
      opened.push(directory);
      return { ...db, close: async () => {} };
    } };
    if (name === './sync-estimate-store') return { ...store, saveSyncEstimateHistoryRow: async (...args: Parameters<typeof store.saveSyncEstimateHistoryRow>) => {
      await store.saveSyncEstimateHistoryRow(...args);
      if (options.revokeAfterSave) permit = { ...permit, leaseId: 'different-lease' };
    } };
    throw new Error(`Unexpected native dependency ${name}`);
  } });
  return { db, opened, scope, native: exports as {
    readSyncEstimateHistory(scope: RealFlightNativeScope, context: string): Promise<SyncEstimateHistory>;
    saveSyncEstimateHistory(scope: RealFlightNativeScope, history: SyncEstimateHistory): Promise<void>;
  } };
}

test('native estimate hints use only cache storage and unavailable cache preserves caller fallback', async t => {
  const ready = adapter(), unavailable = adapter({ unavailable: true });
  t.after(async () => { await ready.db.close(); await unavailable.db.close(); });
  await ready.native.saveSyncEstimateHistory(ready.scope, history);
  assert.deepEqual(await ready.native.readSyncEstimateHistory(ready.scope, 'context'), history);
  assert.equal(ready.opened.length, 2);
  await assert.rejects(unavailable.native.readSyncEstimateHistory(unavailable.scope, 'context'), /cache unavailable/);
  await assert.rejects(unavailable.native.saveSyncEstimateHistory(unavailable.scope, history), /cache unavailable/);
  assert.equal(unavailable.opened.length, 0, 'unavailable cache never falls back to backed-up database storage');
});

test('authorization lost during native hint write rolls back its owner row', async t => {
  const { db, scope, native } = adapter({ revokeAfterSave: true }); t.after(() => db.close());
  await assert.rejects(native.saveSyncEstimateHistory(scope, history), /owner changed/);
  assert.deepEqual((await store.readSyncEstimateHistoryRow(db, 'owner', 'store', 'context')).samples, []);
});

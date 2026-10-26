import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { parseSyncEstimateHistory, SYNC_ESTIMATE_MODEL_VERSION, type SyncEstimateHistory } from '../../apps/platform-lab/src/mobile/sync-estimate.ts';
import { readSyncEstimateHistoryRow, saveSyncEstimateHistoryRow, SYNC_ESTIMATE_HISTORY_BYTES, SYNC_ESTIMATE_SCHEMA } from '../../apps/platform-lab/src/mobile/sync-estimate-store.ts';

const context = 'sync-local-replay-v1';
const history: SyncEstimateHistory = { version: SYNC_ESTIMATE_MODEL_VERSION, scope: context,
  samples: [{ mode: 'repeat', volume: 'small', stage: 'save', durationsMs: [500, 700] }] };

test('disposable estimate hints survive offline reopen and isolate both owner and store', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-estimate-hints-')), path = join(directory, 'hints.sqlite');
  let db = nodeDriver(path);
  try {
    await db.exec(SYNC_ESTIMATE_SCHEMA);
    await saveSyncEstimateHistoryRow(db, 'owner-a', 'store-a', history);
    await saveSyncEstimateHistoryRow(db, 'owner-b', 'store-a', { ...history, samples: [] });
    await db.close(); db = nodeDriver(path);
    assert.deepEqual(await readSyncEstimateHistoryRow(db, 'owner-a', 'store-a', context), history);
    assert.deepEqual((await readSyncEstimateHistoryRow(db, 'owner-b', 'store-a', context)).samples, []);
    assert.deepEqual((await readSyncEstimateHistoryRow(db, 'owner-a', 'store-b', context)).samples, []);
    assert.deepEqual((await readSyncEstimateHistoryRow(db, 'owner-a', 'store-a', 'new-build')).samples, [], 'incompatible timing context resets');
    assert.deepEqual(await readSyncEstimateHistoryRow(db, 'owner-a', 'store-a', context), history, 'other reads do not overwrite existing hints');
  } finally { await db.close(); await unlink(path); await rmdir(directory); }
});

test('malformed, excessive and obsolete hints reset without admitting source payload', async t => {
  const db = nodeDriver(':memory:'); t.after(() => db.close()); await db.exec(SYNC_ESTIMATE_SCHEMA);
  for (const payload of ['{broken', 'null', JSON.stringify({ ...history, version: 999 }), 'x'.repeat(SYNC_ESTIMATE_HISTORY_BYTES + 1),
    JSON.stringify({ ...history, samples: [{ mode: 'repeat', volume: 'small', stage: 'save', durationsMs: [-1, null, '200'] }] })]) {
    await db.run('INSERT OR REPLACE INTO sync_estimate_hints VALUES (?,?,?)', 'owner', 'store', payload);
    assert.deepEqual(await readSyncEstimateHistoryRow(db, 'owner', 'store', context), parseSyncEstimateHistory(null, context));
  }
  await saveSyncEstimateHistoryRow(db, 'owner', 'store', { ...history, sourcePayload: 'must not persist',
    samples: [{ ...history.samples[0]!, durationsMs: [1, 2, 3, 4, 5, 6, 7], rawFlight: 'must not persist' }] } as unknown as SyncEstimateHistory);
  const stored = await db.first<{payload: string}>('SELECT payload FROM sync_estimate_hints WHERE owner=? AND store=?', 'owner', 'store');
  assert.ok(stored); assert.ok(new TextEncoder().encode(stored.payload).length <= SYNC_ESTIMATE_HISTORY_BYTES);
  assert.equal(stored.payload.includes('must not persist'), false);
  assert.deepEqual((await readSyncEstimateHistoryRow(db, 'owner', 'store', context)).samples[0]?.durationsMs, [3, 4, 5, 6, 7]);
});

test('invalid history context is rejected before replacing useful hints', async t => {
  const db = nodeDriver(':memory:'); t.after(() => db.close()); await db.exec(SYNC_ESTIMATE_SCHEMA);
  await saveSyncEstimateHistoryRow(db, 'owner', 'store', history);
  await assert.rejects(saveSyncEstimateHistoryRow(db, 'owner', 'store', { ...history, scope: '' }), /context/);
  await assert.rejects(readSyncEstimateHistoryRow(db, 'owner', 'store', 'x'.repeat(129)), /context/);
  assert.deepEqual(await readSyncEstimateHistoryRow(db, 'owner', 'store', context), history);
});


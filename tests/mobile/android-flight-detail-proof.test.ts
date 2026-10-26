import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver';
import { runFlightDetailProof } from '../../apps/platform-lab/src/development/android-flight-detail-proof';

test('paired production detail reads preserve full evidence, reject reactivation, refresh facts and persist after reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-detail-proof-'));
  const displayed: string[] = [], names = new Set<string>();
  const ports = {open: async (name: string) => { names.add(name); return nodeDriver(join(directory, name)); },
    hash: async (text: string) => createHash('sha256').update(text).digest('hex'), uuid: randomUUID, now: () => performance.now(),
    display: async (_detail: unknown, label: string) => { displayed.push(label); return {renderCommitMilliseconds: 0, nextFrameCallbackMilliseconds: 0}; }};
  try {
    const id = randomUUID();
    for (const seed of [true, false]) {
      const report = await runFlightDetailProof(ports, id, seed);
      assert.equal(report.mode, seed ? 'seed' : 'reopen');
      assert.equal(report.initialGeneration, seed ? 6 : 7);
      assert.equal(report.finalGeneration, seed ? 7 : 8);
      assert.equal(report.flightCount, 101);
      assert.equal(report.samples.length, 5);
      assert.ok(report.samples.every(sample => sample.fullDetailEqual && sample.retained.guardChecks === 2));
      assert.ok(report.samples.every(sample => sample.fresh.hashCalls > sample.retained.hashCalls));
      assert.ok(report.samples.every(sample => sample.fresh.milliseconds >= 0 && sample.retained.milliseconds >= 0));
      assert.equal(report.changedSelectionRejected, true);
      assert.equal(report.refreshedListChanged, true);
      assert.equal(report.persistedReadback, seed ? null : true);
    }
    assert.deepEqual(displayed, Array.from({length: 2}, () => Array.from({length: 5}, (_, i) => [`fresh-${i + 1}`, `retained-${i + 1}`]).flat()).flat());
    assert.equal(names.size, 3);
    assert.ok([...names].every(name => name.includes(id)));
    await assert.rejects(runFlightDetailProof(ports, '../foreign', true));
  } finally { await rm(directory, {recursive: true, force: true}); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver';
import { duplicateCountProof, duplicateProofFile } from '../../apps/platform-lab/src/development/duplicate-count-proof';

test('duplicate UI proof uses durable source rows with exact contributors and unchanged reopen graph', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-duplicates-'));
  const id = randomUUID(), names = new Set<string>();
  const ports = { open: async (name: string) => { names.add(name); return nodeDriver(join(directory, name)); },
    hash: async (text: string) => createHash('sha256').update(text).digest('hex'), uuid: randomUUID };
  try {
    const first = await duplicateCountProof(ports, id, true);
    const second = await duplicateCountProof(ports, id, false);
    assert.deepEqual({ ...second.report, mode: 'seed' }, first.report);
    assert.equal(first.report.rawCount, 4); assert.equal(first.report.countedCount, 3);
    assert.equal(first.report.countedMinutes, 45); assert.equal(first.report.excluded, 1);
    assert.equal(first.report.unknownMarkers, 1);
    assert.deepEqual(first.report.contributorRefs, ['9001', '9002', '9004']);
    assert.deepEqual(first.details.map(row => row.sourceFlightRef).sort(), ['9001', '9002', '9003', '9004']);
    assert.equal(first.view.snapshot.savedRetrievals.length, 1);
    assert.deepEqual([...names], [duplicateProofFile(id)]);
    await assert.rejects(duplicateCountProof(ports, '../ordinary-owner', true));
    await assert.rejects(duplicateCountProof(ports, randomUUID(), false));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

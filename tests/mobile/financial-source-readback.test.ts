import assert from 'node:assert/strict';
import test from 'node:test';
import { readFinancialSourceProof } from '../../apps/platform-lab/src/development/financial-source-readback.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import type { UserFinancialBackup } from '../../apps/platform-lab/src/user-backup.ts';
import { financialHash as hash, financialTarget as target, financialObservation } from './fixtures/expense-capture.ts';
import { nodeDriver } from './sqlite-driver.ts';

async function fixture() {
  const db = nodeDriver(':memory:');
  const store = new FinancialObservationStore(db, target, hash, async () => {});
  await store.initialize(true);
  const receipt = await store.save('synthetic-readback', 'billed-flight', financialObservation());
  const section: UserFinancialBackup = { state: 'present', target, archive: await store.exportBackup() };
  await db.close();
  let gates = 0, exports = 0, revokedAt = 0;
  const ports = { hash, async gate() { if (++gates === revokedAt) throw Error('Expired owner'); },
    async exportSection() { exports++; return section; } };
  return { receipt, section, ports, counts: () => ({ gates, exports }), revoke: (at: number) => { revokedAt = at; } };
}

test('raw SQLite export verifies the exact acknowledged receipt with only aggregate/checksum output', async () => {
  const f = await fixture();
  assert.deepEqual(await readFinancialSourceProof(f.ports, f.receipt), { state: 'verified', receiptCount: 1,
    billedFlightCount: 1, latestBilledChecksum: f.receipt.checksum });
  assert.deepEqual(f.counts(), { gates: 3, exports: 1 });
});

test('local absence never initializes or captures and cannot confirm an acknowledged receipt', async () => {
  const f = await fixture(), ports = { ...f.ports, exportSection: async (): Promise<UserFinancialBackup> => ({ state: 'absent' }) };
  assert.deepEqual(await readFinancialSourceProof(ports), { state: 'absent' });
  await assert.rejects(readFinancialSourceProof(ports, f.receipt), /unavailable/);
  assert.equal(f.counts().exports, 0);
});

test('missing, foreign and changed receipts cannot pass exact readback', async () => {
  const f = await fixture();
  for (const expected of [{ ...f.receipt, id: 'missing' }, { ...f.receipt, sequence: 2 },
    { ...f.receipt, value: { ...f.receipt.value, storeId: '44444444-4444-4444-8444-444444444444' } }]) {
    await assert.rejects(readFinancialSourceProof(f.ports, expected), /Exact acknowledged/);
  }
});

test('corrupt archives and false empty/present state are rejected', async () => {
  const f = await fixture();
  f.section.state = 'empty';
  await assert.rejects(readFinancialSourceProof(f.ports), /Inconsistent/);
  f.section.state = 'present'; f.section.archive += ' ';
  await assert.rejects(readFinancialSourceProof(f.ports), /archive/);
});

test('owner/lifecycle revocation before, during and after archive validation rejects', async () => {
  for (const at of [1, 2, 3]) {
    const f = await fixture(); f.revoke(at);
    await assert.rejects(readFinancialSourceProof(f.ports, f.receipt), /Expired owner/);
    assert.equal(f.counts().exports, at === 1 ? 0 : 1);
  }
});

test('caller mutation during export cannot substitute the expected captured receipt', async () => {
  const f = await fixture();
  const expected = { ...f.receipt, id: 'foreign' };
  await assert.rejects(readFinancialSourceProof({ ...f.ports, exportSection: async () => {
    Object.assign(expected, f.receipt); return f.section;
  } }, expected), /Exact acknowledged/);
});

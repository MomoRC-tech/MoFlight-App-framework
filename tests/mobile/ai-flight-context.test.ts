import assert from 'node:assert/strict';
import test from 'node:test';
import { readAiFlightSnapshot, assertAiFlightSnapshotCurrent, type AiFlightContextPorts } from '../../apps/platform-lab/src/ai/flight-context.ts';
import type { OwnFlightStoredSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import { AI_SOURCE_OWNER, AI_SOURCE_STORE, aiSourceIdentity, aiSourceFlight } from './fixtures/ai-source.ts';
function fixture() {
  let owner: string | null = AI_SOURCE_OWNER, closed = 0, pending = false, failRead = false;
  let onAssert = () => {};
  const snapshot: OwnFlightStoredSnapshot = { version: 1, ownerId: AI_SOURCE_OWNER, storeId: AI_SOURCE_STORE, generation: 4,
    account: { provider: 'vereinsflieger', accountRef: '10001' }, coverage: [], savedRetrievals: [], pending: [], latestSavedResult: null, recovery: { readOnly: false, warning: null } };
  const flights = [aiSourceFlight('101', '01.08.2026', '1:00')];
  const ports: AiFlightContextPorts = { currentOwner: async () => owner, flights: { open: async () => ({
    ownerId: AI_SOURCE_OWNER, storeId: AI_SOURCE_STORE,
    assertCurrent: async () => { onAssert(); if (owner !== AI_SOURCE_OWNER) throw new Error('Owner changed'); },
    pendingCommand: async () => pending,
    service: { readStored: async () => { if (failRead) throw new Error('unreadable'); return { snapshot, flights }; }, detail: async () => { throw new Error('Not used'); } },
    readMedical: async () => { throw new Error('Medical must not be read'); },
    readFeatureInformation: async () => { throw new Error('Information must not be read'); },
    readDuties: async () => { throw new Error('Duties must not be read'); },
    close: async () => { closed++; },
  }) } };
  return { snapshot, flights, ports, closed: () => closed, owner: (value: string | null) => { owner = value; }, pending: () => { pending = true; }, fail: () => { failRead = true; }, onAssert: (action: () => void) => { onAssert = action; } };
}
test('reads only real flight ports and releases lease before returning a copied snapshot', async () => {
  const f = fixture(); const result = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
  assert.equal(result.context.flights.state, 'available'); assert.equal(result.projection?.rows[0]?.knownMinutes, 60);
  assert.equal(f.closed(), 1);
  f.flights[0]!.facts.assessment.observation.row.values.fill('mutated');
  assert.equal(result.projection?.rows[0]?.knownMinutes, 60);
  assert.equal(result.projection?.sourceByReference.values().next().value?.facts.assessment.observation.row.values.includes('mutated'), false);
});
test('historical identity admits general context with no store or binding, without a current provider session', async () => {
  const f = fixture();
  const missing = { ...f.ports, flights: { open: async () => null } };
  const result = await readAiFlightSnapshot(missing, aiSourceIdentity, 1);
  assert.equal(result.context.flights.state, 'flights-unavailable'); assert.equal(result.projection, null);
  f.snapshot.account = null; f.flights.length = 0;
  assert.equal((await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)).unavailableReason, 'no-flight-binding');
  f.owner(null); await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1));
});
test('pending operations, read failures and recovery block flight evidence while preserving general context', async () => {
  const f = fixture(); f.pending();
  assert.equal((await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)).unavailableReason, 'recovery');
  const failed = fixture(); failed.fail();
  assert.equal((await readAiFlightSnapshot(failed.ports, aiSourceIdentity, 1)).unavailableReason, 'read-failed');
  assert.equal(failed.closed(), 1);
  const recovery = fixture(); recovery.snapshot.recovery.readOnly = true;
  assert.equal((await readAiFlightSnapshot(recovery.ports, aiSourceIdentity, 1)).unavailableReason, 'recovery');
});
test('foreign owner/account/store and switching during a read fail closed and release leases', async () => {
  for (const field of ['ownerId', 'storeId'] as const) {
    const f = fixture(); f.snapshot[field] = 'foreign';
    await assert.rejects(readAiFlightSnapshot(f.ports, aiSourceIdentity, 1)); assert.equal(f.closed(), 1);
  }
  const account = fixture(); account.snapshot.account!.accountRef = '20002';
  await assert.rejects(readAiFlightSnapshot(account.ports, aiSourceIdentity, 1)); assert.equal(account.closed(), 1);
  const switched = fixture(); switched.onAssert(() => switched.owner('owner-b'));
  await assert.rejects(readAiFlightSnapshot(switched.ports, aiSourceIdentity, 1)); assert.equal(switched.closed(), 1);
});
test('generation, availability and owner changes revoke a pinned read before late publication', async () => {
  const f = fixture(), original = await readAiFlightSnapshot(f.ports, aiSourceIdentity, 1);
  await assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original);
  f.snapshot.generation++; await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
  f.snapshot.generation--; f.pending(); await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
  f.owner('owner-b'); await assert.rejects(assertAiFlightSnapshotCurrent(f.ports, aiSourceIdentity, original));
});

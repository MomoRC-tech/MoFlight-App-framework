import assert from 'node:assert/strict';
import test from 'node:test';
import { AiFlightTools } from '../../apps/platform-lab/src/ai/flight-tools.ts';
import { projectAiFlights } from '../../apps/platform-lab/src/ai/projection.ts';
import type { AiFlightSnapshot } from '../../apps/platform-lab/src/ai/flight-context.ts';
import { aiSourceContext, aiSourceFlight } from './fixtures/ai-source.ts';
const filter = { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null };
const period = { ...filter, from: '2026-08-01', to: '2026-08-31' };
const flightRows = () => [aiSourceFlight('101', '01.08.2026', '1:00'), aiSourceFlight('102', '15.08.2026', '1:30'), aiSourceFlight('103', '31.08.2026', ''), aiSourceFlight('104', '31.07.2026', '0:45', 'D-SYN2', 'Alex Example')];
const snapshot = (rows = flightRows()): AiFlightSnapshot => ({ context: aiSourceContext, projection: projectAiFlights(rows, aiSourceContext), coverageWindows: [{ from: '2026-01-01', to: '2026-12-31', retrievedAt: '2026-10-24T12:00:00.000Z', savedAt: '2026-10-24T12:01:00.000Z' }], pendingIssueCount: 0, unavailableReason: null });
const ports = () => { let n = 0; return { assertCurrent: async () => {}, token: () => String(++n).padStart(43, 'a') }; };

test('bounded full-August aggregation reuses exact source minutes and excludes unknown denominator', async () => {
  const tools = new AiFlightTools(snapshot(), ports(), '2026-10-24');
  const result = await tools.execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count', 'knownMinutes', 'averageKnownMinutes'] } });
  assert.deepEqual(result.metrics.map(m => [m.measure, m.value, m.unit]), [['count', 3, 'flights'], ['knownMinutes', 150, 'minutes'], ['averageKnownMinutes', 75, 'minutes']]);
  assert.equal(result.coverage.state, 'complete'); assert.equal(result.coverage.unknownDurationRows, 1);
  assert.equal(result.coverage.referenceDate, '2026-10-24'); assert.equal(result.coverage.timezone, 'Europe/Berlin');
  assert.equal(tools.metrics.size, 3);
});
test('queries use run-local aliases, bounded pages and supporting evidence without raw data', async () => {
  const snap = snapshot(), tools = new AiFlightTools(snap, ports(), '2026-10-24');
  const first = await tools.execute({ id: 'c1', name: 'queryFlights', arguments: { filter: period, limit: 2, pageToken: null } });
  assert.equal(first.rows.length, 2); assert.ok(first.nextPageToken); assert.equal(first.rows[0]?.date, '2026-08-31');
  const second = await tools.execute({ id: 'c2', name: 'queryFlights', arguments: { filter: period, limit: 2, pageToken: first.nextPageToken } });
  assert.equal(second.rows.length, 1); assert.equal(second.rows[0]?.date, '2026-08-01'); assert.equal(second.nextPageToken, null);
  await assert.rejects(tools.execute({ id: 'c3', name: 'queryFlights', arguments: { filter, limit: 2, pageToken: first.nextPageToken } }));
  const other = new AiFlightTools(snap, ports(), '2026-10-24');
  await assert.rejects(other.execute({ id: 'c4', name: 'queryFlights', arguments: { filter: period, limit: 2, pageToken: first.nextPageToken } }));
  const evidence = await tools.execute({ id: 'c5', name: 'getFlightEvidence', arguments: { referenceIds: [first.rows[0]!.referenceId] } });
  assert.deepEqual(evidence.rows[0], first.rows[0]);
  await assert.rejects(tools.execute({ id: 'c6', name: 'getFlightEvidence', arguments: { referenceIds: ['foreign'] } }));
  const json = JSON.stringify([first, second, evidence]);
  for (const forbidden of ['Casey Sample', 'D-SYN1', 'Synthetic private remark', 'accountRef', 'factsRevision', 'flightId', 'medical', 'credentials']) assert.equal(json.includes(forbidden), false, forbidden);
});
test('source-label resolution keeps ambiguity, matches only declared crew slots and deduplicates matching flights', async () => {
  const rows = [...flightRows(), aiSourceFlight('105', '20.08.2026', '0:20', 'D-SYN3', 'Alex Sample')];
  const tools = new AiFlightTools(snapshot(rows), ports(), '2026-10-24');
  const candidates = await tools.execute({ id: 'c1', name: 'resolveEntities', arguments: { kind: 'crew', text: 'Alex' } });
  assert.equal(candidates.candidates.length, 2); assert.ok(candidates.candidates.every(c => c.match === 'candidate'));
  const casey = await tools.execute({ id: 'c2', name: 'resolveEntities', arguments: { kind: 'crew', text: 'casey  sample' } });
  assert.equal(casey.candidates.length, 1); assert.equal(casey.candidates[0]?.match, 'exact');
  const found = await tools.execute({ id: 'c3', name: 'aggregateFlights', arguments: { filter: { ...period, crewAlias: casey.candidates[0]!.alias }, measures: ['count'] } });
  assert.equal(found.metrics[0]?.value, 3); // Each source row has the same label in Pilot and PIC.
  assert.equal(found.coverage.state, 'partial'); assert.ok(found.coverage.unknownCrewRows > 0);
  const remark = await tools.execute({ id: 'c4', name: 'resolveEntities', arguments: { kind: 'crew', text: 'private remark' } });
  assert.equal(remark.candidates.length, 0);
  await assert.rejects(tools.execute({ id: 'c5', name: 'queryFlights', arguments: { filter: { ...filter, registrationAlias: 'foreign' }, limit: 2, pageToken: null } }));
});
test('missing registrations cannot establish an exhaustive aircraft match or a zero outside saved coverage', async () => {
  const tools = new AiFlightTools(snapshot([...flightRows(), aiSourceFlight('105', '20.08.2026', '0:20', '')]), ports(), '2026-10-24');
  const resolved = await tools.execute({ id: 'c1', name: 'resolveEntities', arguments: { kind: 'registration', text: 'D-SYN1' } });
  const result = await tools.execute({ id: 'c2', name: 'aggregateFlights', arguments: { filter: { ...period, registrationAlias: resolved.candidates[0]!.alias }, measures: ['count'] } });
  assert.equal(result.metrics[0]?.value, 3); assert.equal(result.coverage.unknownRegistrationRows, 1); assert.equal(result.coverage.state, 'partial');
  const outside = await tools.execute({ id: 'c3', name: 'aggregateFlights', arguments: { filter: { ...filter, from: '2025-01-01', to: '2025-12-31' }, measures: ['count'] } });
  assert.equal(outside.metrics[0]?.value, 0); assert.equal(outside.coverage.state, 'partial');
});
test('unknown dates, pending source issues and incomplete coverage never claim a complete period', async () => {
  const snap = snapshot([...flightRows(), aiSourceFlight('105', '', '1:00')]);
  const tools = new AiFlightTools(snap, ports(), '2026-10-24');
  const result = await tools.execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count', 'knownMinutes'] } });
  assert.equal(result.metrics[0]?.value, 3); assert.equal(result.metrics[1]?.value, 150);
  assert.equal(result.coverage.unknownDateRows, 1); assert.equal(result.coverage.state, 'partial');
  for (const changed of [{ ...snapshot(), coverageWindows: [] }, { ...snapshot(), pendingIssueCount: 1 }]) {
    const partial = await new AiFlightTools(changed, ports(), '2026-10-24').execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count'] } });
    assert.equal(partial.coverage.state, 'partial');
  }
});
test('unavailable history, complete empty history and unknown-only averages remain distinct', async () => {
  const none = { ...snapshot([]), context: { ...aiSourceContext, flights: { state: 'flights-unavailable' as const } }, projection: null, coverageWindows: [], unavailableReason: 'no-flight-binding' as const };
  const unavailable = await new AiFlightTools(none, ports(), '2026-10-24').execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count'] } });
  assert.equal(unavailable.coverage.state, 'unavailable'); assert.deepEqual(unavailable.metrics, []);
  const empty = await new AiFlightTools(snapshot([]), ports(), '2026-10-24').execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count', 'averageKnownMinutes'] } });
  assert.equal(empty.coverage.state, 'empty'); assert.deepEqual(empty.metrics.map(m => m.value), [0, null]);
  const unknown = await new AiFlightTools(snapshot([aiSourceFlight('101', '01.08.2026', '')]), ports(), '2026-10-24').execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['knownMinutes', 'averageKnownMinutes'] } });
  assert.deepEqual(unknown.metrics.map(m => m.value), [0, null]); assert.equal(unknown.coverage.unknownDurationRows, 1);
});
test('call bounds, cancellation and source changes suppress tools and late grants', async () => {
  const tools = new AiFlightTools(snapshot(), ports(), '2026-10-24', 1);
  await tools.execute({ id: 'c1', name: 'describeDataset', arguments: {} });
  await assert.rejects(tools.execute({ id: 'c2', name: 'describeDataset', arguments: {} }));
  tools.dispose(); await assert.rejects(tools.execute({ id: 'c3', name: 'describeDataset', arguments: {} }));
  let checks = 0;
  const switched = new AiFlightTools(snapshot(), { ...ports(), assertCurrent: async () => { if (++checks > 1) throw new Error('generation changed'); } }, '2026-10-24');
  await assert.rejects(switched.execute({ id: 'c1', name: 'aggregateFlights', arguments: { filter: period, measures: ['count'] } }));
  assert.equal(switched.metrics.size, 0);
  assert.throws(() => new AiFlightTools(snapshot(), ports(), '2026-02-30'));
});

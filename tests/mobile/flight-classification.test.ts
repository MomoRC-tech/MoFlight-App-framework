import test from 'node:test';
import assert from 'node:assert/strict';
import { ownFlightFixture } from './own-flight-fixture';
import { adaptHistoryFacts, validateHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts';
import { classifyAircraft, classifyLaunch } from '../../apps/platform-lab/src/mobile/flight-classification';
import { allOwnFlights, ownFlightFilterTags, removeOwnFlightFilter, selectOwnFlights } from '../../apps/platform-lab/src/mobile/own-flight-model';
import { groupStatisticsClassification } from '../../apps/platform-lab/src/mobile/statistics-overlay-model';

function flight(id: string, fields: Record<string, string>) {
  const f = ownFlightFixture().flights[0]!;
  const observation = f.facts.assessment.observation;
  const pairs = observation.headers.map((label, i) => [label, observation.row.values[i]!] as const)
    .filter(([label]) => !Object.hasOwn(fields, label));
  pairs.push(...Object.entries(fields));
  f.facts = adaptHistoryFacts(f.facts.scope, {
    captureId: observation.captureId, headers: pairs.map(([label]) => label),
    rows: [{ sourceFlightId: observation.row.sourceFlightId, values: pairs.map(([, value]) => value) }],
  }, 0);
  f.flightId = id;
  return f;
}

test('explicit aircraft category is independent of model, launch and legal book credit', () => {
  const examples = [
    ['Segelflugzeug', 'glider'], [' Motorsegler ', 'motorGlider'], ['TMG', 'tmg'],
    ['Reisemotorsegler', 'tmg'], ['Motorflugzeug', 'powered'], ['Ultraleichtflugzeug', 'ultralight'], ['Hubschrauber', 'helicopter'],
  ] as const;
  for (const [raw, expected] of examples) {
    const f = flight('a', { Luftfahrzeugart: raw, 'Lfz.-Muster': 'Contradictory model guess', 'S.-Art': 'Selbststart' });
    assert.equal(classifyAircraft(f.facts.assessment).key, expected);
    assert.equal(f.facts.assessment.semantics.aircraftClass, 'unresolved');
  }
  const missing = flight('a', { 'Lfz.': 'D-1234', 'Lfz.-Muster': 'ASK 21' });
  assert.equal(classifyAircraft(missing.facts.assessment).key, 'unknown');
  assert.equal(classifyAircraft(flight('a', { Luftfahrzeugart: 'Segelflugzeug mit Hilfsmotor' }).facts.assessment).key, 'unknown');
});

test('launch full-word aliases normalize, while unverified codes and conflicting columns stay unknown', () => {
  for (const label of ['S.-Art', 'S-Art', 'Startart']) {
    for (const [raw, expected] of [['Windenstart', 'winch'], ['F-Schlepp', 'aerotow'], ['Eigenstart', 'self'], ['Selbststart', 'self'], ['Autoschlepp', 'autoTow']]) {
      const f = flight('a', { [label]: raw! });
      assert.equal(classifyLaunch(f.facts.assessment).key, expected);
    }
  }
  for (const raw of ['W', 'F', 'E', '1', 'unknown', '__proto__']) {
    const c = classifyLaunch(flight('a', { 'S-Art': raw }).facts.assessment);
    assert.equal(c.key, 'unknown'); assert.equal(c.state, 'unrecognized'); assert.equal(c.evidence[0]?.raw, raw);
  }
  const agreeing = classifyLaunch(flight('a', { 'S-Art': 'Winde', Startart: 'Windenstart' }).facts.assessment);
  assert.equal(agreeing.key, 'winch');
  for (const other of ['F-Schlepp', '', 'W']) {
    assert.equal(classifyLaunch(flight('a', { 'S-Art': 'Winde', Startart: other }).facts.assessment).state, 'conflict');
  }
});

test('missing, blank, custom and conflicting evidence remain distinct without modifying saved facts', () => {
  const missing = ownFlightFixture().flights[0]!;
  assert.equal(classifyAircraft(missing.facts.assessment).state, 'not-captured');
  assert.equal(classifyLaunch(missing.facts.assessment).state, 'not-captured');
  const f = flight('a', { Luftfahrzeugart: ' ', 'S-Art': 'Winde' });
  const original = JSON.stringify(f.facts);
  assert.equal(classifyAircraft(f.facts.assessment).state, 'blank');
  assert.equal(classifyLaunch(f.facts.assessment).key, 'winch');
  assert.equal(f.facts.assessment.fields.launch.state, 'not-captured', 'v1 mapper is intentionally unchanged');
  validateHistoryFacts(f.facts, f.facts.scope);
  assert.equal(JSON.stringify(f.facts), original);
});

test('category and launch combine with period, search, registration and exact IDs; reset is independent', () => {
  const a = flight('a', { Luftfahrzeugart: 'Segelflugzeug', 'S-Art': 'Winde' });
  const b = flight('b', { Luftfahrzeugart: 'Motorsegler', 'S-Art': 'Eigenstart' });
  const c = flight('c', { Luftfahrzeugart: 'Segelflugzeug', 'S-Art': 'F-Schlepp' });
  const filters = { ...allOwnFlights, aircraftCategory: 'glider' as const, launchMethod: 'winch' as const, year: 2026, search: 'D-T000' };
  assert.deepEqual(selectOwnFlights([a, b, c], filters).map(f => f.flightId), ['a']);
  assert.equal(selectOwnFlights([a, b, c], { ...filters, year: 2025 }).length, 0);
  assert.equal(selectOwnFlights([a, b, c], { ...filters, flightIds: ['b'] }).length, 0);
  assert.equal(selectOwnFlights([a, b, c], { ...filters, registration: 'foreign' }).length, 0);
  assert.equal(removeOwnFlightFilter(filters, 'aircraftCategory').launchMethod, 'winch');
  assert.equal(removeOwnFlightFilter(filters, 'launchMethod').aircraftCategory, 'glider');
  assert.ok(ownFlightFilterTags(filters).some(tag => tag.label === 'Segelflugzeug'));
  assert.ok(ownFlightFilterTags(filters).some(tag => tag.label === 'Winde'));
  assert.equal(selectOwnFlights([a, b, c], allOwnFlights).length, 3);
});

test('statistics count unique contributing flights, preserve unknown durations/categories and exclude conflicts', () => {
  const a = flight('a', { Luftfahrzeugart: 'Segelflugzeug', 'S-Art': 'Winde' });
  const b = flight('b', { Luftfahrzeugart: '', 'S-Art': 'W' });
  b.facts.assessment.durations.flight = { state: 'unknown', minutes: null, evidence: [] };
  const c = flight('c', { Luftfahrzeugart: 'Motorflugzeug', 'S-Art': 'Eigenstart' });
  const changed = structuredClone(c); changed.facts.assessment.fields.model = { state: 'blank', label: 'Lfz.-Muster', raw: '' };
  for (const dimension of ['aircraftCategory', 'launchMethod'] as const) {
    const result = groupStatisticsClassification([a, a, b, c, changed], dimension);
    assert.deepEqual(result.conflictingIds, ['c']);
    assert.equal(result.groups.length, 2);
    assert.equal(result.groups[0]?.count, 1); assert.equal(result.groups[0]?.knownMinutes, 12);
    assert.deepEqual(result.groups[0]?.supportingIds, ['a']);
    assert.equal(result.groups[1]?.key, 'unknown'); assert.equal(result.groups[1]?.unknownDurationCount, 1);
    assert.deepEqual(result.groups[1]?.supportingIds, ['b']);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AiContext } from '../../packages/ai-contracts/src/index.ts';
import { projectAiFlights, normalizeAiSourceLabel } from '../../apps/platform-lab/src/ai/projection.ts';
import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { REAL_FLIGHT_LIBRARY_RECORD_LIMIT } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import type { ProbeSnapshot } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const BINDING = '22222222-2222-4222-8222-222222222222';
const OTHER_OWNER = '33333333-3333-4333-8333-333333333333';
const OTHER_BINDING = '44444444-4444-4444-8444-444444444444';
const CONTEXT: AiContext = {
  version: 1,
  localOwnerId: OWNER,
  provider: 'vereinsflieger',
  accountRef: '10001',
  contextVersion: 4,
  flights: { state: 'available', storeId: 'synthetic-store', generation: 8, snapshotRevision: 'snapshot-8' },
};

const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Flugzeit in hh:mm', 'Lfz.-Muster',
  'Pilot', 'PIC', 'Begleiter/FI', 'Begleiter 2', 'Begleiter 3', 'SIC', 'Bemerkung'];
const defaultValues = ['18.10.2026', 'D-ABC', '15:30', '16:40', '70', '', 'Synthetic glider',
  'Alex Example', 'Alex Example', 'Casey Crew', 'Jordan Crew', 'Taylor Crew', 'Morgan Crew', 'private note marker'];

function flight(options: {
  flightId?: string;
  sourceFlightId?: string;
  values?: string[];
  ownerId?: string;
  bindingId?: string;
  accountRef?: string;
  factsRevision?: number;
} = {}): RealFlightListItem {
  const flightId = options.flightId ?? 'flight-1';
  const bindingId = options.bindingId ?? BINDING;
  const capture: ProbeSnapshot = {
    captureId: 'synthetic-capture-1',
    retrievedAt: '2026-10-24T12:00:00.000Z',
    headers,
    rows: [{ sourceFlightId: options.sourceFlightId ?? '7001', values: options.values ?? [...defaultValues] }],
    sourceIdentity: 'unverified', coverage: 'visible-personal-list-only', timeBasis: 'unknown',
  };
  return {
    flightId,
    bindingId,
    accountRef: options.accountRef ?? CONTEXT.accountRef,
    sourceFlightRef: options.sourceFlightId ?? '7001',
    firstCaptureId: capture.captureId,
    factsRevision: options.factsRevision ?? 1,
    facts: adaptHistoryFacts({ ownerId: options.ownerId ?? OWNER, scopeId: bindingId }, capture, 0),
    unassigned: true,
  };
}

test('projects only validated source-derived fields and issues local references', () => {
  const source = flight();
  const projection = projectAiFlights([source], CONTEXT);
  assert.deepEqual(projection.rows, [{
    referenceId: 'e1', date: '2026-10-18', startTime: '15:30', landingTime: '16:40', registrationAlias: 'a1',
    knownMinutes: 70, durationState: 'known',
    crew: [
      { alias: 'p1', slot: 'pilot' }, { alias: 'p1', slot: 'pic' }, { alias: 'p2', slot: 'companion' },
      { alias: 'p3', slot: 'companion2' }, { alias: 'p4', slot: 'companion3' }, { alias: 'p5', slot: 'sic' },
    ],
  }]);
  assert.equal(projection.references[0]?.flightId, 'flight-1');
  assert.equal(projection.references[0]?.factsRevision, '1');
  assert.equal(projection.sourceByReference.get('e1')?.flightId, 'flight-1');
  assert.deepEqual(projection.candidates.filter(value => value.kind === 'registration'), [
    { alias: 'a1', kind: 'registration', label: 'D-ABC', normalized: 'd-abc' },
  ]);
  assert.equal(projection.candidates.filter(value => value.kind === 'crew' && value.normalized === 'alex example').length, 1);

  const projectedJson = JSON.stringify(projection.rows[0]);
  for (const excluded of ['flight-1', '7001', 'synthetic-capture-1', 'Alex Example', 'D-ABC', 'Synthetic glider', 'private note marker', OWNER, BINDING]) {
    assert.equal(projectedJson.includes(excluded), false, `projected row leaked ${excluded}`);
  }
});

test('normalizes Unicode composition, case and whitespace without spelling or accent folding', () => {
  assert.equal(normalizeAiSourceLabel('  Mu\u0308ller\t  Alex\n'), 'müller alex');
  assert.equal(normalizeAiSourceLabel('MÜLLER Alex'), 'müller alex');
  assert.notEqual(normalizeAiSourceLabel('Müller Alex'), normalizeAiSourceLabel('Muller Alex'));

  const base = [...defaultValues]; base.splice(8, 5, '', '', '', '', '');
  const first = flight({ values: [...base.slice(0, 7), '  Mu\u0308ller\t Alex ', ...base.slice(8)] });
  const sameLabel = flight({ flightId: 'flight-2', sourceFlightId: '7002', values: [...base.slice(0, 7), 'MÜLLER Alex', ...base.slice(8)] });
  const differentSpelling = flight({ flightId: 'flight-3', sourceFlightId: '7003', values: [...base.slice(0, 7), 'Muller Alex', ...base.slice(8)] });
  const candidates = projectAiFlights([first, sameLabel, differentSpelling], CONTEXT).candidates.filter(value => value.kind === 'crew');
  assert.deepEqual(candidates.map(value => [value.alias, value.normalized]), [['p1', 'müller alex'], ['p2', 'muller alex']]);
});

test('keeps source-label ambiguity between distinct explicit crew fields', () => {
  const base = [...defaultValues]; base.splice(8, 5, '', '', '', '', '');
  const alexExample = flight({ values: base });
  const alexSample = flight({ flightId: 'flight-2', sourceFlightId: '7002', values: [...base.slice(0, 7), 'Alex Sample', ...base.slice(8)] });
  const candidates = projectAiFlights([alexExample, alexSample], CONTEXT).candidates.filter(value => value.kind === 'crew' && value.normalized.startsWith('alex '));
  assert.deepEqual(candidates.map(value => value.label), ['Alex Example', 'Alex Sample']);
  assert.equal(new Set(candidates.map(value => value.alias)).size, 2);
});

test('rejects foreign account, owner and binding scope before projection', () => {
  assert.throws(() => projectAiFlights([flight({ accountRef: '10002' })], CONTEXT), /account/);
  assert.throws(() => projectAiFlights([flight({ ownerId: OTHER_OWNER })], CONTEXT), /scope/);
  const mismatchedBinding = flight();
  mismatchedBinding.bindingId = OTHER_BINDING;
  assert.throws(() => projectAiFlights([mismatchedBinding], CONTEXT), /scope/);
  assert.throws(() => projectAiFlights([flight({ factsRevision: 0 })], CONTEXT), /revision/);
  assert.throws(() => projectAiFlights([flight()], { ...CONTEXT, flights: { state: 'flights-unavailable' } }), /unavailable/);
  const oversized = [] as RealFlightListItem[];
  oversized.length = REAL_FLIGHT_LIBRARY_RECORD_LIMIT + 1;
  assert.throws(() => projectAiFlights(oversized, CONTEXT), /library bound/);
});

test('binds numeric outer source references to evidence and rejects shared references across flights', () => {
  const mismatched = flight();
  mismatched.sourceFlightRef = '7002';
  assert.throws(() => projectAiFlights([mismatched], CONTEXT), /source reference/);
  const nonNumeric = flight();
  nonNumeric.sourceFlightRef = 'flight-source';
  assert.throws(() => projectAiFlights([nonNumeric], CONTEXT), /identity/);
  assert.throws(() => projectAiFlights([flight(), flight({ flightId: 'flight-2' })], CONTEXT), /share a source reference/);
});

test('deduplicates structurally exact flight records and rejects any duplicate identity or fact revision conflict', () => {
  const source = flight();
  const exactDuplicate = JSON.parse(JSON.stringify(source)) as RealFlightListItem;
  assert.equal(projectAiFlights([source, exactDuplicate], CONTEXT).rows.length, 1);
  assert.throws(() => projectAiFlights([source, { ...source, factsRevision: 2 }], CONTEXT), /duplicate/);
  assert.throws(() => projectAiFlights([source, { ...source, firstCaptureId: 'synthetic-capture-2' }], CONTEXT), /duplicate/);

  const changedFacts = flight({ flightId: 'flight-1', sourceFlightId: '7001', values: [...defaultValues] });
  changedFacts.facts = flight({ flightId: 'flight-1', sourceFlightId: '7001', values: [...defaultValues.slice(0, 1), 'D-OTHER', ...defaultValues.slice(2)] }).facts;
  assert.throws(() => projectAiFlights([source, changedFacts], CONTEXT), /duplicate/);
});

test('retains only parsed dates and clocks and known safe reported minutes', () => {
  const invalid = [...defaultValues]; invalid[0] = '32.13.2026'; invalid[2] = '25:70'; invalid[3] = '';
  invalid[4] = '9007199254740992';
  const blank = [...defaultValues]; blank[0] = ''; blank[2] = ''; blank[3] = ''; blank[4] = '';
  const conflicting = [...defaultValues]; conflicting[4] = '60'; conflicting[5] = '01:01';
  const result = projectAiFlights([
    flight({ values: invalid }),
    flight({ flightId: 'flight-2', sourceFlightId: '7002', values: blank }),
    flight({ flightId: 'flight-3', sourceFlightId: '7003', values: conflicting }),
  ], CONTEXT);
  assert.deepEqual(result.rows.map(row => [row.date, row.startTime, row.landingTime, row.knownMinutes, row.durationState]), [
    [null, null, null, null, 'conflict'],
    [null, null, null, null, 'unknown'],
    ['2026-10-18', '15:30', '16:40', null, 'conflict'],
  ]);
});

test('copies raw local source rows for pinned evidence calculations', () => {
  const source = flight();
  const projection = projectAiFlights([source], CONTEXT);
  const pinned = projection.sourceByReference.get('e1')!;
  source.facts.assessment.observation.row.values[1] = 'D-MUTATED';
  assert.equal(pinned.facts.assessment.observation.row.values[1], 'D-ABC');
  const registration = pinned.facts.assessment.fields.registration;
  if (registration.state !== 'value') assert.fail('Pinned registration was not retained.');
  assert.equal(registration.raw, 'D-ABC');
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { AiContext, AiProjectedFlight, AiToolResult } from '../../packages/ai-contracts/src/index.ts';
import { AI_CHAT_ACCEPTANCE_CASES, AI_FIXTURE_FLIGHTS, AI_FIXTURE_OWNERS,
  type FrozenAcceptanceCase, type FrozenCaseInput, type FrozenMetricPeriod, type SyntheticFlightRecord,
  type SyntheticOwnerId } from './fixtures/ai-chat-cases.ts';
import { AiFlightTools } from '../../apps/platform-lab/src/ai/flight-tools.ts';
import { projectAiFlights } from '../../apps/platform-lab/src/ai/projection.ts';
import { projectAiSourceReview } from '../../apps/platform-lab/src/ai/source-review.ts';
import type { AiFlightSnapshot } from '../../apps/platform-lab/src/ai/flight-context.ts';
import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { SavedSourceReview } from '../../apps/platform-lab/src/vereinsflieger/real-flight-review-evidence.ts';

const OWNER_UUID: Record<SyntheticOwnerId, string> = {
  'owner-a': '11111111-1111-4111-8111-111111111111',
  'owner-b': '44444444-4444-4444-8444-444444444444',
};
const STORE_UUID: Record<SyntheticOwnerId, string> = {
  'owner-a': '22222222-2222-4222-8222-222222222222',
  'owner-b': '55555555-5555-4555-8555-555555555555',
};
const BINDING_UUID: Record<SyntheticOwnerId, string> = {
  'owner-a': '33333333-3333-4333-8333-333333333333',
  'owner-b': '66666666-6666-4666-8666-666666666666',
};
const SOURCE_HEADERS = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Flugzeit in hh:mm', 'Lfz.-Muster',
  'Pilot', 'PIC', 'Begleiter/FI', 'Begleiter 2', 'Begleiter 3', 'SIC', 'Bemerkung'];
const CREW_SLOTS = ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic'] as const;
const FIXTURE_BY_REF = new Map(AI_FIXTURE_FLIGHTS.map(flight => [flight.flightRef, flight]));
const OWNER_BY_KEY = new Map(AI_FIXTURE_OWNERS.map(owner => [owner.ownerId, owner]));

interface ReviewFixtureIssue {
  sourceFlightId: string;
  kind: 'duplicate-source-row' | 'conflicting-source-row';
  evidenceIndexes: number[];
  flightRefs: string[];
}

interface AdaptedCase {
  context: AiContext;
  snapshot: AiFlightSnapshot;
  tools: AiFlightTools;
  fixtureByReference: Map<string, SyntheticFlightRecord>;
  review: SavedSourceReview | null;
  reviewIssues: ReviewFixtureIssue[];
  reviewReferenceIds: string[];
}

function numericSourceId(sourceFlightId: string): string {
  const suffix = /-(\d+)$/.exec(sourceFlightId)?.[1];
  if (!suffix) throw new Error(`Fixture source ID has no stable numeric suffix: ${sourceFlightId}`);
  return String(7000 + Number(suffix));
}

function rowValues(flight: SyntheticFlightRecord, durationOverride?: { minutes: number; formattedMinutes?: number }): string[] {
  let minutes = '';
  let formatted = '';
  if (durationOverride) {
    minutes = String(durationOverride.minutes);
    if (durationOverride.formattedMinutes !== undefined) {
      const hours = Math.floor(durationOverride.formattedMinutes / 60);
      const remainder = durationOverride.formattedMinutes % 60;
      formatted = `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
    }
  } else if (flight.durationState === 'known') {
    minutes = String(flight.durationMinutes);
  } else if (flight.durationState === 'conflict') {
    const [minuteValue, formattedValue] = flight.conflictingDurationMinutes ?? [];
    if (minuteValue === undefined || formattedValue === undefined) throw new Error(`Missing frozen conflict facts for ${flight.flightRef}`);
    minutes = String(minuteValue);
    const hours = Math.floor(formattedValue / 60);
    const remainder = formattedValue % 60;
    formatted = `${String(hours).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  const sourceCrew = CREW_SLOTS.map(slot => {
    const entry = flight.crew[slot];
    return entry?.sourceLabelAvailability === 'available' ? entry.displayName ?? '' : '';
  });
  return [flight.recordedDate ?? '', flight.registration ?? '', flight.startTime ?? '', flight.landingTime ?? '', minutes, formatted,
    flight.aircraftModel ?? '', ...sourceCrew, 'Synthetic private remark; must stay local.'];
}

function makeFacts(owner: SyntheticOwnerId, flight: SyntheticFlightRecord, captureId: string, rowIndex: number,
  durationOverride?: { minutes: number; formattedMinutes?: number }) {
  const facts = adaptHistoryFacts({ ownerId: OWNER_UUID[owner], scopeId: BINDING_UUID[owner] }, {
    captureId, headers: [...SOURCE_HEADERS], rows: [{ sourceFlightId: numericSourceId(flight.sourceFlightId), values: rowValues(flight, durationOverride) }],
  }, 0);
  facts.assessment.observation.rowIndex = rowIndex;
  return facts;
}

function makeSavedFlight(owner: SyntheticOwnerId, flight: SyntheticFlightRecord): RealFlightListItem {
  const flightId = `saved-${owner.slice(-1)}-${flight.flightId.slice(-7)}`;
  const captureId = `capture-${owner.slice(-1)}-${flight.flightId.slice(-7)}`;
  const conflict = flight.durationState === 'conflict' ? flight.conflictingDurationMinutes : undefined;
  return {
    flightId, bindingId: BINDING_UUID[owner], accountRef: flight.accountRef,
    sourceFlightRef: numericSourceId(flight.sourceFlightId), firstCaptureId: captureId,
    factsRevision: flight.factsRevision, facts: makeFacts(owner, flight, captureId, 0,
      conflict ? { minutes: conflict[0]!, formattedMinutes: conflict[1]! } : undefined), unassigned: true,
  };
}

function makeSavedSourceReview(owner: SyntheticOwnerId, selected: readonly SyntheticFlightRecord[], generation: number): {
  review: SavedSourceReview; issues: ReviewFixtureIssue[];
} {
  const grouped = new Map<string, SyntheticFlightRecord[]>();
  for (const flight of selected) {
    const group = grouped.get(flight.sourceFlightId) ?? [];
    group.push(flight);
    grouped.set(flight.sourceFlightId, group);
  }
  const rows: SavedSourceReview['rows'] = [];
  const issues: SavedSourceReview['issues'] = [];
  const fixtureIssues: ReviewFixtureIssue[] = [];
  for (const [sourceFlightId, group] of grouped) {
    if (group.length < 2) continue;
    const conflicting = group.some(flight => flight.durationState === 'conflict');
    const captureId = `review-${owner.slice(-1)}-${numericSourceId(sourceFlightId)}`;
    const captureSha256 = createHash('sha256').update(`${owner}:${sourceFlightId}:synthetic-capture`).digest('hex');
    const evidenceIndexes: number[] = [];
    for (const [index, flight] of group.entries()) {
      const rowIndex = index;
      const durationOverride = conflicting
        ? { minutes: flight.conflictingDurationMinutes?.[index] ?? flight.conflictingDurationMinutes?.[0] ?? 0 }
        : undefined;
      evidenceIndexes.push(rows.length);
      rows.push({ captureId, captureSha256, rowIndex, facts: makeFacts(owner, flight, captureId, rowIndex, durationOverride) });
    }
    const kind = conflicting ? 'conflicting-source-row' as const : 'duplicate-source-row' as const;
    issues.push({ id: `issue-${issues.length + 1}`, kind, evidenceIndexes, rowCount: group.length });
    fixtureIssues.push({ sourceFlightId, kind, evidenceIndexes, flightRefs: group.map(flight => flight.flightRef) });
  }
  const review: SavedSourceReview = {
    version: 1, ownerId: OWNER_UUID[owner], storeId: STORE_UUID[owner], generation,
    accountRef: OWNER_BY_KEY.get(owner)!.accountRef, rows, issues,
    totalRows: rows.length, omittedRows: 0, totalIssues: issues.length,
  };
  if (review.rows.length > 200) throw new Error('Synthetic source review exceeds the supported report bound.');
  return { review, issues: fixtureIssues };
}

function buildCase(frozenCase: FrozenAcceptanceCase, input: FrozenCaseInput = frozenCase.input): AdaptedCase {
  const owner = OWNER_BY_KEY.get(input.ownerId);
  assert.ok(owner, `unknown fixture owner ${input.ownerId}`);
  const context: AiContext = {
    version: 1, localOwnerId: OWNER_UUID[input.ownerId], provider: 'vereinsflieger', accountRef: input.accountRef,
    contextVersion: 1,
    flights: input.flightContext === 'available'
      ? { state: 'available', storeId: STORE_UUID[input.ownerId], generation: 4, snapshotRevision: 'generation-4' }
      : { state: 'flights-unavailable' },
  };
  const selected = input.flightRefs.map(reference => {
    const record = FIXTURE_BY_REF.get(reference);
    assert.ok(record, `${frozenCase.id} references missing fixture ${reference}`);
    assert.equal(record.ownerId, input.ownerId, `${frozenCase.id} crosses fixture owners at ${reference}`);
    assert.equal(record.accountRef, input.accountRef, `${frozenCase.id} crosses fixture accounts at ${reference}`);
    assert.equal(record.storeId, input.storeId, `${frozenCase.id} crosses fixture stores at ${reference}`);
    return record;
  });

  if (context.flights.state === 'flights-unavailable') {
    const snapshot: AiFlightSnapshot = { context, projection: null, coverageWindows: [], pendingIssueCount: 0,
      unavailableReason: 'no-flight-binding' };
    return { context, snapshot, tools: makeTools(snapshot), fixtureByReference: new Map(), review: null,
      reviewIssues: [], reviewReferenceIds: [] };
  }

  const grouped = new Map<string, SyntheticFlightRecord[]>();
  for (const record of selected) {
    const group = grouped.get(record.sourceFlightId) ?? [];
    group.push(record);
    grouped.set(record.sourceFlightId, group);
  }
  const savedGroups = [...grouped.values()];
  const savedFlights = savedGroups.map(group => makeSavedFlight(input.ownerId, group[0]!));
  const projection = projectAiFlights(savedFlights, context);
  const sourceReview = makeSavedSourceReview(input.ownerId, selected, context.flights.generation);
  const projectedReview = projectAiSourceReview(sourceReview.review, projection, context);
  const coverageWindows = input.coverage.map(window => ({ from: window.from, to: window.through,
    retrievedAt: `${input.reference.date}T12:00:00.000Z`, savedAt: `${input.reference.date}T12:01:00.000Z` }));
  const snapshot: AiFlightSnapshot = { context, projection, coverageWindows, pendingIssueCount: 0,
    unavailableReason: null, sourceReview: projectedReview };
  const flightById = new Map(savedGroups.map(group => [makeSavedFlight(input.ownerId, group[0]!).flightId, group[0]! ]));
  const fixtureByReference = new Map(projection.references.flatMap(reference => {
    const record = flightById.get(reference.flightId);
    return record ? [[reference.id, record] as const] : [];
  }));
  assert.equal(fixtureByReference.size, projection.rows.length);
  return { context, snapshot, tools: makeTools(snapshot), fixtureByReference, review: sourceReview.review,
    reviewIssues: sourceReview.issues, reviewReferenceIds: projectedReview.references.map(reference => reference.id) };
}

function makeTools(snapshot: AiFlightSnapshot): AiFlightTools {
  let token = 0;
  return new AiFlightTools(snapshot, { assertCurrent: async () => {}, token: () => `page_${String(++token).padStart(42, '0')}` }, '2026-10-24');
}

function toolRowsToFixture(adapted: AdaptedCase, rows: readonly AiProjectedFlight[]): SyntheticFlightRecord[] {
  return rows.map(row => {
    const fixture = adapted.fixtureByReference.get(row.referenceId);
    assert.ok(fixture, `unknown projected flight reference ${row.referenceId}`);
    return fixture;
  });
}

function sourceIdsForKind(adapted: AdaptedCase, kind: ReviewFixtureIssue['kind']): string[] {
  return adapted.reviewIssues.filter(issue => issue.kind === kind).map(issue => issue.sourceFlightId).sort();
}

function safeToolResult(result: AiToolResult): void {
  const json = JSON.stringify(result);
  const forbidden = new Set<string>(['owner-a', 'owner-b', '10001', '10002', 'medical', 'credentials', 'accountRef', 'factsRevision',
    'Synthetic private remark; must stay local.']);
  for (const flight of AI_FIXTURE_FLIGHTS) {
    if (flight.registration) forbidden.add(flight.registration);
    if (flight.aircraftModel) forbidden.add(flight.aircraftModel);
    forbidden.add(flight.flightId);
    forbidden.add(flight.sourceFlightId);
    for (const entry of Object.values(flight.crew)) if (entry?.sourceLabelAvailability === 'available' && entry.displayName) forbidden.add(entry.displayName);
  }
  for (const value of forbidden) assert.equal(json.includes(value), false, `tool result leaked ${value}`);
}

let callSequence = 0;
async function call(adapted: AdaptedCase, name: string, args: Record<string, unknown>): Promise<AiToolResult> {
  const result = await adapted.tools.execute({ id: `case-call-${++callSequence}`, name, arguments: args });
  safeToolResult(result);
  return result;
}

const noFilter = { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null };
const periodFilter = (from: string, to: string) => ({ ...noFilter, from, to });

async function comparePeriod(adapted: AdaptedCase, frozenCase: FrozenAcceptanceCase, period: FrozenMetricPeriod): Promise<void> {
  const filter = periodFilter(period.from, period.through);
  const aggregate = await call(adapted, 'aggregateFlights', { filter, measures: ['count', 'knownMinutes', 'averageKnownMinutes'] });
  const query = await call(adapted, 'queryFlights', { filter, limit: 200, pageToken: null });
  const values = new Map(aggregate.metrics.map(metric => [metric.measure, metric.value]));
  const suppliedFixtureRows = frozenCase.input.flightRefs.map(ref => FIXTURE_BY_REF.get(ref)!).filter(record =>
    record.recordedDate !== null && record.recordedDate >= period.from && record.recordedDate <= period.through);
  const actual = {
    label: period.label,
    from: aggregate.coverage.requestedFrom,
    through: aggregate.coverage.requestedTo,
    uniqueFlightCount: values.get('count'),
    knownDurationCount: query.rows.filter(row => row.durationState === 'known').length,
    knownMinutes: values.get('knownMinutes'),
    averageKnownMinutes: values.get('averageKnownMinutes'),
    unknownDurationFlightRefs: toolRowsToFixture(adapted, query.rows)
      .filter((record, index) => query.rows[index]!.durationState === 'unknown').map(record => record.flightRef).sort(),
    conflictingSourceFlightIds: sourceIdsForKind(adapted, 'conflicting-source-row'),
    deduplicatedSourceFlightIds: sourceIdsForKind(adapted, 'duplicate-source-row'),
    suppliedRowCount: suppliedFixtureRows.length,
    coverage: {
      requestedFrom: aggregate.coverage.requestedFrom,
      requestedThrough: aggregate.coverage.requestedTo,
      observedFrom: aggregate.coverage.observedFrom,
      observedThrough: aggregate.coverage.observedTo,
      fullyCovered: aggregate.coverage.state === 'complete' || aggregate.coverage.state === 'empty',
    },
  };
  assert.deepEqual(actual, period, `${frozenCase.id}: ${period.label}`);
}

async function registrationLatestCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const resolved = await call(adapted, 'resolveEntities', { kind: 'registration', text: 'D-SYN1' });
  assert.equal(resolved.candidates.length, 1);
  assert.equal(resolved.candidates[0]?.match, 'exact');
  const candidate = resolved.candidates[0]!;
  const result = await call(adapted, 'queryFlights', { filter: { ...noFilter, registrationAlias: candidate.alias }, limit: 200, pageToken: null });
  const latest = result.rows[0];
  assert.ok(latest);
  const latestFixture = adapted.fixtureByReference.get(latest.referenceId);
  assert.equal(latestFixture?.flightRef, frozenCase.expected.metrics?.latestFlightRef);
  assert.equal(latest.date, '2026-10-20');
  assert.equal(latest.startTime, '15:30');
  assert.equal(adapted.snapshot.projection?.references.find(reference => reference.id === latest.referenceId)?.context.localOwnerId,
    adapted.context.localOwnerId);
  assert.equal(frozenCase.expected.detailActionFlightRef, latestFixture?.flightRef);
}

async function crewMatchCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const resolved = await call(adapted, 'resolveEntities', { kind: 'crew', text: 'Casey Sample' });
  assert.equal(resolved.candidates.length, 1);
  assert.equal(resolved.candidates[0]?.match, 'exact');
  const result = await call(adapted, 'queryFlights', { filter: { ...noFilter, crewAlias: resolved.candidates[0]!.alias }, limit: 200, pageToken: null });
  const matchedRefs = toolRowsToFixture(adapted, result.rows).map(record => record.flightRef).sort();
  assert.deepEqual(matchedRefs, [...(frozenCase.expected.metrics?.matchedFlightRefs ?? [])].sort());
  assert.equal(matchedRefs.length, frozenCase.expected.metrics?.matchCountAmongAvailableLabels);
  assert.equal(adapted.fixtureByReference.get(result.rows[0]!.referenceId)?.flightRef, frozenCase.expected.metrics?.latestFlightRef);
  assert.ok(result.coverage.unknownCrewRows > 0, 'unverified or missing crew slots must keep the match set partial');
  const repeatedSlots = result.rows.flatMap(row => [row.crew.filter(crew => crew.alias === resolved.candidates[0]!.alias).length]);
  assert.ok(repeatedSlots.reduce((sum, slots) => sum + slots, 0) > matchedRefs.length);
  assert.equal(result.rows.length, frozenCase.expected.metrics?.matchCountAmongAvailableLabels);
  assert.equal(frozenCase.expected.metrics?.mayBeAdditionalMatches, true);
}

async function ambiguityCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const result = await call(adapted, 'resolveEntities', { kind: 'crew', text: 'Alex' });
  const labelByAlias = new Map(adapted.snapshot.projection?.candidates.filter(candidate => candidate.kind === 'crew')
    .map(candidate => [candidate.alias, candidate.label] as const));
  assert.deepEqual(result.candidates.map(candidate => labelByAlias.get(candidate.alias)).sort(),
    [...(frozenCase.expected.personResolution?.candidateLabels ?? [])].sort());
  assert.ok(result.candidates.every(candidate => candidate.match === 'candidate'));
  assert.equal(frozenCase.expected.status, 'clarification');
  assert.equal(frozenCase.expected.metrics, undefined);
}

async function sourceReviewCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  assert.equal(adapted.review?.rows.length, frozenCase.expected.metrics?.reviewedRowCount);
  assert.equal(adapted.review?.totalIssues, frozenCase.expected.metrics?.duplicateGroupCount! + frozenCase.expected.metrics?.conflictGroupCount!);
  const described = await call(adapted, 'describeDataset', {});
  assert.equal(described.sourceReview.totalRows, 4);
  assert.equal(described.sourceReview.totalIssues, 2);
  assert.deepEqual(described.sourceReview.issues.map(issue => [issue.kind, issue.rowCount]).sort(),
    [['conflicting-source-row', 2], ['duplicate-source-row', 2]]);
  const evidence = await call(adapted, 'getFlightEvidence', { referenceIds: adapted.reviewReferenceIds });
  assert.equal(evidence.rows.length, 0);
  assert.equal(evidence.sourceRows.length, 4);
  const actualFindings = adapted.reviewIssues.map(issue => {
    const durationMinutes = [...new Set(issue.evidenceIndexes.map(index => adapted.review!.rows[index]!.facts.assessment.durations.flight)
      .filter(duration => duration.state === 'known').map(duration => duration.minutes))].sort((a, b) => a - b);
    const sourceFlightId = issue.sourceFlightId;
    return { kind: issue.kind === 'duplicate-source-row' ? 'duplicate' : 'conflicting-facts', sourceFlightId,
      flightRefs: issue.flightRefs, durationMinutes };
  }).sort((a, b) => a.kind.localeCompare(b.kind));
  const expectedFindings = [...(frozenCase.expected.findings ?? [])].map(({ kind, sourceFlightId, flightRefs, durationMinutes }) => ({
    kind, sourceFlightId, flightRefs: [...flightRefs], durationMinutes: [...(durationMinutes ?? [])],
  })).sort((a, b) => a.kind.localeCompare(b.kind));
  assert.deepEqual(actualFindings, expectedFindings);
  const sourceFacts = evidence.sourceRows.map(row => [row.knownMinutes, row.durationState]);
  assert.deepEqual(sourceFacts, [[45, 'known'], [45, 'known'], [35, 'known'], [52, 'known']]);
  const savedConflict = adapted.snapshot.projection?.rows.find(row => row.durationState === 'conflict');
  assert.ok(savedConflict, 'the already-saved source-008 row must retain both supported conflicting fields');
  assert.equal(savedConflict.knownMinutes, null);
  assert.equal(adapted.snapshot.projection?.rows.length, 2, 'duplicate and conflict issue rows must not become extra saved flights');
}

async function unusualCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const query = await call(adapted, 'queryFlights', { filter: noFilter, limit: 200, pageToken: null });
  assert.equal(query.rows.length, 1);
  assert.equal(query.rows[0]?.knownMinutes, 780);
  assert.equal(query.rows[0]?.durationState, 'known');
  assert.equal(query.rows[0]?.date, '2026-07-02');
  assert.equal(query.rows[0]?.startTime, '05:00');
  assert.equal(query.rows[0]?.landingTime, '18:00');
  assert.deepEqual(frozenCase.expected.findings?.[0]?.durationMinutes, [780]);
}

async function unavailableAndEmptyCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const unavailable = buildCase(frozenCase);
  const unavailableResult = await call(unavailable, 'aggregateFlights', { filter: periodFilter('2026-01-01', '2026-10-24'), measures: ['count'] });
  assert.equal(unavailableResult.coverage.state, 'unavailable');
  assert.deepEqual(unavailableResult.metrics, []);
  assert.equal(frozenCase.expected.status, 'unavailable');
  assert.equal(frozenCase.expected.metrics, undefined);

  const variant = frozenCase.variants?.[0];
  assert.ok(variant, 'the frozen empty-history variant is required');
  const emptyCase = buildCase(frozenCase, variant.input);
  const emptyResult = await call(emptyCase, 'aggregateFlights', { filter: periodFilter('2026-01-01', '2026-10-24'), measures: ['count', 'knownMinutes', 'averageKnownMinutes'] });
  assert.equal(emptyResult.coverage.state, 'empty');
  assert.deepEqual(emptyResult.metrics.map(metric => metric.value), [0, 0, null]);
  assert.equal(variant.expected.metrics?.periods?.[0]?.coverage.fullyCovered, true);
}

async function injectionCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const result = await call(adapted, 'queryFlights', { filter: noFilter, limit: 200, pageToken: null });
  assert.deepEqual(adapted.fixtureByReference.size, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows.some(row => row.referenceId === 'owner-b/flight-001'), false);
  await assert.rejects(adapted.tools.execute({ id: `case-call-${++callSequence}`, name: 'getFlightEvidence',
    arguments: { referenceIds: ['owner-b/flight-001'] } }));

  const foreignRecord = FIXTURE_BY_REF.get('owner-b/flight-001');
  assert.ok(foreignRecord);
  const foreignFlight = makeSavedFlight('owner-b', foreignRecord);
  assert.throws(() => projectAiFlights([foreignFlight], adapted.context), /account|scope/);
  assert.equal(frozenCase.expected.rejectedFlightRefs?.[0], 'owner-b/flight-001');
  assert.deepEqual(frozenCase.expected.supportingFlightRefs, []);
}

async function termCase(frozenCase: FrozenAcceptanceCase): Promise<void> {
  const adapted = buildCase(frozenCase);
  const result = await call(adapted, 'describeDataset', {});
  assert.equal(result.coverage.state, 'unavailable');
  assert.equal(result.sourceReview.state, 'unavailable');
  assert.deepEqual(result.rows, []);
  assert.deepEqual(result.sourceRows, []);
  assert.equal(frozenCase.expected.answerKind, 'general-aviation-term');
  assert.equal(frozenCase.expected.metrics, undefined);
  assert.match(frozenCase.expected.requiredClaims.join(' '), /No flight-history data is needed/);
}

for (const frozenCase of AI_CHAT_ACCEPTANCE_CASES) {
  test(`AI02 frozen source case: ${frozenCase.id}`, async t => {
    switch (frozenCase.id) {
      case 'ai01-year-to-date-known-unknown-conflict': {
        const adapted = buildCase(frozenCase);
        const periods = frozenCase.expected.metrics?.periods ?? [];
        assert.equal(periods.length, 1);
        await comparePeriod(adapted, frozenCase, periods[0]!);
        assert.equal(adapted.snapshot.projection?.rows.length, 7);
        assert.equal(adapted.snapshot.projection?.rows.filter(row => row.durationState === 'conflict').length, 1);
        assert.equal(adapted.snapshot.projection?.rows.filter(row => row.durationState === 'unknown').length, 1);
        break;
      }
      case 'ai02-latest-registration-flight':
        await registrationLatestCase(frozenCase);
        break;
      case 'ai03-calendar-year-to-date-comparison': {
        const adapted = buildCase(frozenCase);
        for (const period of frozenCase.expected.metrics?.periods ?? []) await comparePeriod(adapted, frozenCase, period);
        break;
      }
      case 'ai04-available-label-matches-with-incomplete-crew':
        await crewMatchCase(frozenCase);
        break;
      case 'ai05-full-august-year-comparison': {
        const adapted = buildCase(frozenCase);
        for (const period of frozenCase.expected.metrics?.periods ?? []) await comparePeriod(adapted, frozenCase, period);
        break;
      }
      case 'ai06-duplicate-and-conflicting-source-review':
        await sourceReviewCase(frozenCase);
        break;
      case 'ai06-unusual-valid-row-review':
        await unusualCase(frozenCase);
        break;
      case 'ai07-partial-flying-progress': {
        const adapted = buildCase(frozenCase);
        for (const period of frozenCase.expected.metrics?.periods ?? []) await comparePeriod(adapted, frozenCase, period);
        break;
      }
      case 'aviation-term-tow-release-explanation':
        await termCase(frozenCase);
        break;
      case 'ai04-ambiguous-first-name-query':
        await ambiguityCase(frozenCase);
        break;
      case 'injection-and-foreign-flight-reference':
        await injectionCase(frozenCase);
        break;
      case 'missing-flight-context-versus-complete-empty-history':
        await unavailableAndEmptyCase(frozenCase);
        break;
      default:
        assert.fail(`No deterministic AI02 source scenario for ${frozenCase.id}`);
    }
    if (frozenCase.variants?.length) {
      for (const variant of frozenCase.variants) {
        await t.test(`variant: ${variant.id}`, async () => {
          assert.equal(variant.input.flightContext, 'available');
          assert.equal(variant.expected.metrics?.periods?.[0]?.uniqueFlightCount, 0);
        });
      }
    }
  });
}

test('AI02 fixtures exercise local source tools only; frozen claims do not score a model', () => {
  assert.equal(AI_CHAT_ACCEPTANCE_CASES.length, 12);
  assert.ok(AI_CHAT_ACCEPTANCE_CASES.every(frozenCase => frozenCase.expected.requiredClaims.length > 0));
  assert.ok(AI_CHAT_ACCEPTANCE_CASES.every(frozenCase => frozenCase.expected.forbiddenClaims.length > 0));
});

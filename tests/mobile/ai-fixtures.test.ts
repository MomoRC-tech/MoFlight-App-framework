import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AI_CHAT_ACCEPTANCE_CASES,
  AI_FIXTURE_FLIGHTS,
  AI_FIXTURE_OWNERS,
  AI_FIXTURE_REFERENCE,
} from './fixtures/ai-chat-cases.ts';

const CREW_SLOTS = ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic'] as const;

const caseById = (id: string) => {
  const frozenCase = AI_CHAT_ACCEPTANCE_CASES.find((candidate) => candidate.id === id);
  assert.ok(frozenCase, `missing frozen case: ${id}`);
  return frozenCase;
};

test('frozen suite has twelve cases, a fixed reference date, and owner-scoped references', () => {
  assert.equal(AI_CHAT_ACCEPTANCE_CASES.length, 12);
  assert.deepEqual(AI_FIXTURE_REFERENCE, { date: '2026-10-24', timezone: 'Europe/Berlin' });
  assert.deepEqual(AI_FIXTURE_OWNERS.map(({ ownerId }) => ownerId), ['owner-a', 'owner-b']);
  assert.notEqual(AI_FIXTURE_OWNERS[0]!.accountRef, AI_FIXTURE_OWNERS[1]!.accountRef);
  assert.equal(new Set(AI_CHAT_ACCEPTANCE_CASES.map(({ id }) => id)).size, 12);
  assert.equal(new Set(AI_FIXTURE_FLIGHTS.map(({ flightRef }) => flightRef)).size, AI_FIXTURE_FLIGHTS.length);
  assert.equal(AI_CHAT_ACCEPTANCE_CASES.filter(({ inputLanguage }) => inputLanguage === 'en').length, 6);
  assert.equal(AI_CHAT_ACCEPTANCE_CASES.filter(({ inputLanguage }) => inputLanguage === 'de').length, 6);

  const flightByRef = new Map(AI_FIXTURE_FLIGHTS.map((flight) => [flight.flightRef, flight]));
  for (const frozenCase of AI_CHAT_ACCEPTANCE_CASES) {
    assert.deepEqual(Object.keys(frozenCase.localizedQuestions).sort(), ['de', 'en']);
    assert.ok(frozenCase.localizedQuestions.en.trim());
    assert.ok(frozenCase.localizedQuestions.de.trim());
    assert.equal(frozenCase.input.question, frozenCase.localizedQuestions[frozenCase.inputLanguage], frozenCase.id);
    assert.equal(frozenCase.responseLanguageRule, 'match-question');
    for (const variant of [{ input: frozenCase.input, expected: frozenCase.expected }, ...(frozenCase.variants ?? [])]) {
      const { input } = variant;
      assert.deepEqual(input.reference, AI_FIXTURE_REFERENCE, frozenCase.id);
      const owner = AI_FIXTURE_OWNERS.find(({ ownerId }) => ownerId === input.ownerId);
      assert.ok(owner, frozenCase.id);
      assert.equal(input.accountRef, owner.accountRef, frozenCase.id);
      assert.equal(input.storeId, owner.storeId, frozenCase.id);
      for (const flightRef of input.flightRefs) {
        const flight = flightByRef.get(flightRef);
        assert.ok(flight, `${frozenCase.id} references missing row ${flightRef}`);
        assert.equal(flight.ownerId, input.ownerId, `${frozenCase.id} crosses owners at ${flightRef}`);
        assert.equal(flight.accountRef, input.accountRef, `${frozenCase.id} crosses accounts at ${flightRef}`);
        assert.equal(flight.storeId, input.storeId, `${frozenCase.id} crosses stores at ${flightRef}`);
      }
      const expectedRefs = [
        ...(variant.expected.supportingFlightRefs ?? []),
        ...(variant.expected.detailActionFlightRef ? [variant.expected.detailActionFlightRef] : []),
        ...(variant.expected.showAllFlightRefs ?? []),
        ...(variant.expected.findings?.flatMap((finding) => finding.flightRefs) ?? []),
      ];
      for (const flightRef of expectedRefs) {
        assert.ok(input.flightRefs.includes(flightRef), `${frozenCase.id} cites a row outside its supplied scope: ${flightRef}`);
      }
      for (const flightRef of variant.expected.rejectedFlightRefs ?? []) {
        assert.equal(input.flightRefs.includes(flightRef), false, `${frozenCase.id} permits a rejected row`);
        const rejected = flightByRef.get(flightRef);
        assert.ok(rejected, `${frozenCase.id} must identify a known foreign fixture row`);
        assert.notEqual(rejected.ownerId, input.ownerId, `${frozenCase.id} rejected a same-owner fixture row`);
      }
    }
  }
});

test('every row has explicit crew slots and honest known, unknown, and conflict facts', () => {
  for (const flight of AI_FIXTURE_FLIGHTS) {
    assert.deepEqual(Object.keys(flight.crew), CREW_SLOTS, flight.flightRef);
    assert.match(flight.flightRef, /^owner-[ab]\/flight-\d{3}$/);
    assert.match(flight.recordedDate ?? '', /^\d{4}-\d{2}-\d{2}$/);
    for (const entry of Object.values(flight.crew)) {
      if (entry === null) continue;
      if (entry.sourceLabelAvailability === 'available') {
        assert.ok(entry.syntheticPersonKey);
        assert.ok(entry.displayName);
      } else {
        assert.equal(entry.syntheticPersonKey, null);
      }
    }
    if (flight.durationState === 'known') {
      assert.ok(Number.isSafeInteger(flight.durationMinutes));
      assert.ok((flight.durationMinutes ?? -1) >= 0);
      assert.equal(flight.conflictingDurationMinutes, undefined);
    } else if (flight.durationState === 'unknown') {
      assert.equal(flight.durationMinutes, null);
      assert.equal(flight.landingTime, null);
    } else {
      assert.equal(flight.durationMinutes, null);
      assert.deepEqual(flight.conflictingDurationMinutes, [35, 52]);
    }
  }

  const ownerAFlight = AI_FIXTURE_FLIGHTS.find((flight) => flight.flightRef === 'owner-a/flight-001');
  const ownerBFlight = AI_FIXTURE_FLIGHTS.find((flight) => flight.flightRef === 'owner-b/flight-001');
  assert.ok(ownerAFlight && ownerBFlight);
  assert.equal(ownerAFlight.flightId, ownerBFlight.flightId);
  assert.equal(ownerAFlight.sourceFlightId, ownerBFlight.sourceFlightId);
  assert.notEqual(ownerAFlight.accountRef, ownerBFlight.accountRef);
});

test('AI01–AI05 expected metrics are fixed literals with exact counts, minutes, and coverage', () => {
  const annual = caseById('ai01-year-to-date-known-unknown-conflict').expected.metrics!.periods![0]!;
  assert.deepEqual({
    uniqueFlightCount: annual.uniqueFlightCount,
    knownDurationCount: annual.knownDurationCount,
    knownMinutes: annual.knownMinutes,
    averageKnownMinutes: annual.averageKnownMinutes,
    unknownDurationFlightRefs: annual.unknownDurationFlightRefs,
    conflictingSourceFlightIds: annual.conflictingSourceFlightIds,
    deduplicatedSourceFlightIds: annual.deduplicatedSourceFlightIds,
    suppliedRowCount: annual.suppliedRowCount,
    coverage: annual.coverage,
  }, {
    uniqueFlightCount: 7,
    knownDurationCount: 5,
    knownMinutes: 355,
    averageKnownMinutes: 71,
    unknownDurationFlightRefs: ['owner-a/flight-005'],
    conflictingSourceFlightIds: ['source-conflict-008'],
    deduplicatedSourceFlightIds: ['source-duplicate-006'],
    suppliedRowCount: 9,
    coverage: { requestedFrom: '2026-01-01', requestedThrough: '2026-10-24',
      observedFrom: '2026-01-01', observedThrough: '2026-10-18', fullyCovered: false },
  });

  const latest = caseById('ai02-latest-registration-flight').expected;
  assert.equal(latest.metrics!.latestFlightRef, 'owner-a/flight-010');
  assert.equal(latest.detailActionFlightRef, 'owner-a/flight-010');
  assert.deepEqual(caseById('ai03-calendar-year-to-date-comparison').expected.metrics!.periods!.map((period) => ({
    from: period.from, through: period.through, count: period.uniqueFlightCount, minutes: period.knownMinutes,
    average: period.averageKnownMinutes, covered: period.coverage.fullyCovered,
  })), [
    { from: '2026-01-01', through: '2026-10-24', count: 5, minutes: 374, average: 74.8, covered: true },
    { from: '2025-01-01', through: '2025-10-24', count: 2, minutes: 190, average: 95, covered: true },
  ]);
  assert.deepEqual(caseById('ai03-calendar-year-to-date-comparison').expected.metrics && {
    flightCountDelta: caseById('ai03-calendar-year-to-date-comparison').expected.metrics!.flightCountDelta,
    knownMinutesDelta: caseById('ai03-calendar-year-to-date-comparison').expected.metrics!.knownMinutesDelta,
  }, { flightCountDelta: 3, knownMinutesDelta: 184 });
  assert.deepEqual(caseById('ai04-available-label-matches-with-incomplete-crew').expected.metrics && {
    matchCount: caseById('ai04-available-label-matches-with-incomplete-crew').expected.metrics!.matchCountAmongAvailableLabels,
    latest: caseById('ai04-available-label-matches-with-incomplete-crew').expected.metrics!.latestFlightRef,
    mayBeAdditionalMatches: caseById('ai04-available-label-matches-with-incomplete-crew').expected.metrics!.mayBeAdditionalMatches,
  }, { matchCount: 4, latest: 'owner-a/flight-010', mayBeAdditionalMatches: true });
  assert.deepEqual(caseById('ai05-full-august-year-comparison').expected.metrics!.periods!.map((period) => ({
    from: period.from, through: period.through, count: period.uniqueFlightCount, minutes: period.knownMinutes,
    average: period.averageKnownMinutes, covered: period.coverage.fullyCovered,
  })), [
    { from: '2026-08-01', through: '2026-08-31', count: 2, minutes: 195, average: 97.5, covered: true },
    { from: '2025-08-01', through: '2025-08-31', count: 1, minutes: 90, average: 90, covered: true },
  ]);
});

test('review, ambiguity, injection, and missing-versus-empty cases preserve their explicit limits', () => {
  const review = caseById('ai06-duplicate-and-conflicting-source-review').expected;
  assert.deepEqual({ rows: review.metrics!.reviewedRowCount, duplicates: review.metrics!.duplicateGroupCount,
    conflicts: review.metrics!.conflictGroupCount }, { rows: 4, duplicates: 1, conflicts: 1 });
  assert.deepEqual(review.findings!.map(({ kind, flightRefs, durationMinutes }) => ({ kind, flightRefs, durationMinutes })), [
    { kind: 'duplicate', flightRefs: ['owner-a/flight-006', 'owner-a/flight-007'], durationMinutes: [45] },
    { kind: 'conflicting-facts', flightRefs: ['owner-a/flight-008', 'owner-a/flight-009'], durationMinutes: [35, 52] },
  ]);
  const unusual = caseById('ai06-unusual-valid-row-review').expected;
  assert.deepEqual(unusual.findings![0]!.durationMinutes, [780]);
  assert.equal(unusual.findings![0]!.kind, 'unusual-valid-row');

  const progress = caseById('ai07-partial-flying-progress').expected;
  assert.equal(progress.metrics!.periods![0]!.knownMinutes, 270);
  assert.deepEqual(progress.metrics!.periods![0]!.unknownDurationFlightRefs, ['owner-a/flight-005']);
  assert.equal(progress.metrics!.periods![1]!.coverage.fullyCovered, false);
  assert.equal(progress.metrics!.percentagesSuppressedReason, 'incomplete-prior-period-coverage');

  const ambiguous = caseById('ai04-ambiguous-first-name-query').expected;
  assert.equal(ambiguous.personResolution!.state, 'ambiguous');
  assert.equal(ambiguous.personResolution!.queryLabel, 'Alex');
  assert.deepEqual(ambiguous.personResolution!.candidateLabels, ['Alex Example', 'Alex Sample']);
  const ambiguousRows = AI_FIXTURE_FLIGHTS.filter((flight) =>
    ['owner-a/flight-001', 'owner-a/flight-002', 'owner-a/flight-004'].includes(flight.flightRef));
  const labels = ambiguousRows.flatMap((flight) => Object.values(flight.crew))
    .filter((entry) => entry?.sourceLabelAvailability === 'available')
    .map((entry) => entry.displayName);
  for (const label of ambiguous.personResolution!.candidateLabels) assert.ok(labels.includes(label));
  assert.equal(ambiguous.metrics, undefined);

  const foreign = caseById('injection-and-foreign-flight-reference');
  assert.deepEqual(foreign.expected.rejectedFlightRefs, ['owner-b/flight-001']);
  assert.deepEqual(foreign.expected.supportingFlightRefs, []);
  assert.equal(foreign.input.flightRefs.includes('owner-b/flight-001'), false);

  const distinction = caseById('missing-flight-context-versus-complete-empty-history');
  assert.equal(distinction.expected.status, 'unavailable');
  assert.equal(distinction.expected.metrics, undefined);
  assert.deepEqual(distinction.variants?.[0]?.expected.metrics?.periods?.map((period) => ({
    count: period.uniqueFlightCount, minutes: period.knownMinutes, average: period.averageKnownMinutes,
    covered: period.coverage.fullyCovered,
  })), [{ count: 0, minutes: 0, average: null, covered: true }]);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {canonical} from '../../packages/flight-logbook/src/index.ts';
import { adaptHistoryFacts, historyCandidateId, validateHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import { confirmHistoryChoice, planHistoryReview, HISTORY_PLAN_LIMIT, type HistoryCapture, type HistoryWorkspace, type HistoryPlanFixture } from '../../apps/platform-lab/src/vereinsflieger/history-plan.ts';

const copy = <T,>(value: T): T => structuredClone(value);
const scope = { ownerId: 'fixture-owner-a', scopeId: 'fixture-scope-a' };
function trial(cells: Record<string, string> = {}) {
  const values = { Datum: '10.10.2026', 'Lfz.': 'D-TEST', Start: '23:55', Landung: '00:10', Flugzeit: '12', Pilot: 'Example, Student', PIC: 'Example, Instructor', 'Begleiter/FI': 'Example, Instructor', ...cells };
  const capture: HistoryCapture = { scope: { ...scope }, observation: { captureId: 'fixture-capture-a', headers: Object.keys(values), rows: [{ sourceFlightId: '101', values: Object.values(values) }] },
    retrievedAt: '2026-10-19T10:00:00.000Z', coverage: { from: '2026-10-01', through: '2026-10-19', state: 'complete' } };
  const workspace: HistoryWorkspace = { scope: { ...scope }, generation: 0, previous: [], choices: [], books: [
    { ownerId: scope.ownerId, id: 'fixture-book-a', formatId: 'fixture-gliding', formatVersion: '1', classes: ['glider'], from: '2026-01-01', through: null },
  ] };
  const fixture: HistoryPlanFixture = { mode: 'synthetic-only', scope: { ...scope }, identity: 'fixture-established', formats: [{ id: 'fixture-gliding', version: '1' }], aircraft: [] };
  return { workspace, capture, fixture };
}
type Trial = ReturnType<typeof trial>;
const plan = (t: Trial) => planHistoryReview(t.workspace, t.capture, t.fixture);
const facts = (t: Trial, index = 0) => adaptHistoryFacts(t.workspace.scope, t.capture.observation, index);

test('evidence ordering preserves exact named and unnamed fields, escaping and positional identity',()=>{
  const observation={captureId:'sort-evidence',headers:['Z','', 'A','\u03a9','\u00e4','Quote "','', '7','8','9',''],
    rows:[{sourceFlightId:'101',values:['z','second','a','omega','umlaut','line\n"','sixth','seven','eight','nine','tenth']}]};
  const before=copy(observation),result=adaptHistoryFacts(scope,observation,0);
  assert.equal(result.evidenceKey,canonical({reference:'101',fields:[
    ['named','7','seven'],['named','8','eight'],['named','9','nine'],['named','A','a'],['named','Quote "','line\n"'],
    ['named','Z','z'],['named','\u00e4','umlaut'],['named','\u03a9','omega'],
    ['unnamed','1','second'],['unnamed','10','tenth'],['unnamed','6','sixth'],
  ]}));
  assert.deepEqual(result.assessment.observation.row,observation.rows[0]);assert.deepEqual(observation,before);
  validateHistoryFacts(result,scope);
});
function classify(t: Trial, index = 0) {
  const f = facts(t, index);
  t.fixture.aircraft.push({ flightId: f.candidateId!, evidenceKey: f.evidenceKey, aircraftRef: 'fixture-aircraft-a', aircraftClass: 'glider', duplicate: 'countable' });
}
function choose(t: Trial, bookId: string | null = 'fixture-book-a', index = 0) {
  const p = plan(t), id = facts(t, index).candidateId!;
  t.workspace = confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, id, bookId);
}
function cell(t: Trial, label: string, value: string, index = 0) {
  t.capture.observation.rows[index]!.values[t.capture.observation.headers.indexOf(label)] = value;
}
function prior(t: Trial) {
  t.workspace.previous = t.capture.observation.rows.map((_, i) => facts(t, i));
  t.workspace.generation++;
  t.capture.observation.captureId = 'fixture-capture-b';
  t.capture.retrievedAt = '2026-10-19T11:00:00.000Z';
}

test('history adapter preserves exact unknown, blank, invalid and zero evidence without canonical crew/UTC inference', () => {
  const t = trial({ Flugzeit: '0', Start: '24:01', 'Begleiter 2': ' ', 'Future field': 'ö\n' + 'long '.repeat(100) });
  const f = facts(t), a = f.assessment;
  assert.equal(f.authority, 'unverified-source-facts');
  assert.deepEqual(a.observation.row, t.capture.observation.rows[0]);
  assert.equal(a.fields.pilot.state === 'value' && a.fields.pilot.raw, 'Example, Student');
  assert.equal(a.fields.pic.state === 'value' && a.fields.pic.raw, 'Example, Instructor');
  assert.equal(a.fields.companion.state === 'value' && a.fields.companion.raw, 'Example, Instructor');
  assert.equal(a.fields.companion2.state, 'blank'); assert.equal(a.fields.companion3.state, 'not-captured');
  assert.equal(a.clocks.start.state, 'invalid'); assert.equal(a.clocks.landing.value, '00:10');
  assert.equal(a.durations.flight.minutes, 0); assert.equal(a.durations.block.minutes, null);
  assert.equal(a.semantics.timeBasis, 'unknown'); assert.equal(a.semantics.landingDayOffset, null);
  assert.equal(a.semantics.crewCredit, 'unresolved'); assert.equal(a.semantics.sourceIdentity, 'unverified');
  assert.ok(!('flight' in f) && !('identityVerified' in f));
  validateHistoryFacts(f, scope);
});

test('candidate IDs are scoped and evidence equality ignores retrieval metadata/named column order without losing original positions', () => {
  const t = trial(), original = facts(t);
  t.capture.observation.captureId = 'fixture-next-capture';
  t.capture.observation.headers.reverse(); t.capture.observation.rows[0]!.values.reverse();
  assert.equal(facts(t).candidateId, original.candidateId); assert.equal(facts(t).evidenceKey, original.evidenceKey);
  assert.notDeepEqual(facts(t).assessment.observation, original.assessment.observation);
  assert.notEqual(historyCandidateId({ ...scope, ownerId: 'other-owner' }, '101'), original.candidateId);
  assert.notEqual(historyCandidateId({ ...scope, scopeId: 'other-scope' }, '101'), original.candidateId);
  const unnamed = { captureId: 'fixture-unnamed', headers: ['', 'Datum'], rows: [{ sourceFlightId: '101', values: ['x', '10.10.2026'] }] };
  const first = adaptHistoryFacts(scope, unnamed, 0);
  unnamed.headers[0] = '#unnamed-0';
  assert.notEqual(adaptHistoryFacts(scope, unnamed, 0).evidenceKey, first.evidenceKey);
});

test('adapter rejects malformed rows, foreign or tampered derived facts and unsupported mapping without trusting flags', () => {
  const t = trial(), f = facts(t);
  for (const index of [-1, 1, NaN]) assert.throws(() => adaptHistoryFacts(scope, t.capture.observation, index));
  const bad = copy(t.capture.observation); bad.headers.push('Datum'); bad.rows[0]!.values.push('10.10.2026');
  assert.throws(() => adaptHistoryFacts(scope, bad, 0));
  const altered = copy(f); altered.assessment.durations.flight.minutes = 99;
  assert.throws(() => validateHistoryFacts(altered, scope));
  assert.throws(() => validateHistoryFacts(f, { ...scope, ownerId: 'foreign-owner' }));
  assert.throws(() => validateHistoryFacts({ ...f, mapping: 'future' } as unknown as typeof f, scope));
  assert.throws(() => validateHistoryFacts({ ...f, authority: 'verified' } as unknown as typeof f, scope));
});

test('all plans are synthetic-only, unverified identity blocks choice and fixture assumptions never attest source semantics', () => {
  const t = trial(); classify(t); t.fixture.identity = 'unverified';
  const p = plan(t);
  assert.equal(p.authority, 'synthetic-only-no-live-write');
  assert.deepEqual(p.blockers, ['unverified-identity']);
  assert.equal(p.rows[0]!.readiness, 'pending-source-validation');
  assert.throws(() => confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, p.rows[0]!.id, null));
  t.fixture.identity = 'fixture-established';
  assert.equal(plan(t).rows[0]!.variants[0]!.assessment.semantics.sourceIdentity, 'unverified');
  assert.throws(() => planHistoryReview(t.workspace, t.capture, { ...t.fixture, mode: 'production' } as unknown as HistoryPlanFixture));
  assert.throws(() => planHistoryReview(t.workspace, t.capture, { ...t.fixture, identity: 'verified' } as unknown as HistoryPlanFixture));
});

test('D1 unknown/conflicting duration and clocks can be explicitly deferred, never assigned fabricated minutes or credit', () => {
  const cases: Record<string, string>[] = [{ Flugzeit: '' }, { Flugzeit: 'invalid' }, { Flugzeit: '12', 'Flugzeit in hh:mm': '00:13' }];
  for (const cells of cases) {
    const t = trial(cells); choose(t, null);
    const row = plan(t).rows[0]!;
    assert.equal(row.readiness, 'history-with-deferred-book');
    assert.equal(row.variants[0]!.assessment.durations.flight.minutes, null);
    assert.equal(row.variants[0]!.assessment.semantics.crewCredit, 'unresolved');
    assert.equal(row.variants[0]!.assessment.semantics.timeBasis, 'unknown');
    assert.equal(row.candidateBookIds.length, 0);
  }
});

test('D2 eligible suggestions require explicit confirmation and repeat retains the chosen book exactly', () => {
  const t = trial(); classify(t);
  let row = plan(t).rows[0]!;
  assert.equal(row.assignmentReason, 'category'); assert.equal(row.suggestedBookId, 'fixture-book-a');
  assert.equal(row.choice, null); assert.equal(row.readiness, 'needs-book-choice');
  choose(t); prior(t); row = plan(t).rows[0]!;
  assert.equal(row.status, 'unchanged'); assert.equal(row.assignmentReason, 'confirmed');
  assert.equal(row.readiness, 'ready-for-history'); assert.equal(row.choice!.bookId, 'fixture-book-a');
});

test('explicit deferral persists despite a later eligible suggestion; it is not silently assigned', () => {
  const t = trial(); choose(t, null); prior(t); classify(t);
  const row = plan(t).rows[0]!;
  assert.equal(row.assignmentReason, 'confirmed'); assert.equal(row.choice!.bookId, null);
  assert.equal(row.suggestedBookId, null); assert.equal(row.readiness, 'history-with-deferred-book');
});

test('class, duplicate and format eligibility are explicit fixture evidence, never inferred from name or raw aircraft fields', () => {
  const t = trial({ 'Luftfahrzeugart': 'Segelflugzeug', Duplikat: '0' });
  assert.equal(plan(t).rows[0]!.assignmentReason, 'unknown-class');
  assert.throws(() => choose(t)); classify(t);
  for (const state of ['unverified', 'source-duplicate'] as const) {
    t.fixture.aircraft[0]!.duplicate = state;
    assert.equal(plan(t).rows[0]!.candidateBookIds.length, 0);
    assert.throws(() => choose(t));
  }
  t.fixture.aircraft[0]!.duplicate = 'countable'; t.fixture.formats = [];
  assert.equal(plan(t).rows[0]!.assignmentReason, 'no-eligible-book'); assert.throws(() => choose(t));
  choose(t, null); assert.equal(plan(t).rows[0]!.readiness, 'history-with-deferred-book');
});

test('corrected evidence preserves prior facts and stale choice, requiring explicit review without overwriting either input', () => {
  const t = trial(); classify(t); choose(t); prior(t);
  const old = copy(t.workspace); cell(t, 'Flugzeit', '18');
  let row = plan(t).rows[0]!;
  assert.equal(row.status, 'changed'); assert.equal(row.assignmentReason, 'stale-choice');
  assert.equal(row.previous!.assessment.durations.flight.minutes, 12); assert.equal(row.variants[0]!.assessment.durations.flight.minutes, 18);
  assert.deepEqual(t.workspace, old); assert.deepEqual(row.choice, old.choices[0]);
  assert.equal(row.readiness, 'needs-book-choice'); assert.throws(() => choose(t));
  t.fixture.aircraft = []; classify(t); choose(t); row = plan(t).rows[0]!;
  assert.equal(row.readiness, 'ready-for-history'); assert.equal(row.previous!.assessment.durations.flight.minutes, 12);
});

test('same-ID repeated rows count once, conflicting variants stay pending and distinct IDs are never merged by matching values', () => {
  const t = trial(); prior(t);
  const row = copy(t.capture.observation.rows[0]!);
  t.capture.observation.rows.push(copy(row), { ...copy(row), sourceFlightId: '102' });
  assert.equal(plan(t).repeatedRows, 1); assert.equal(plan(t).rows.length, 2);
  const conflict = copy(row); conflict.values[t.capture.observation.headers.indexOf('Flugzeit')] = '13';
  t.capture.observation.rows.push(conflict);
  const p = plan(t), changed = p.rows.find(r => r.id === facts(t).candidateId)!;
  assert.equal(changed.status, 'conflict'); assert.equal(changed.variants.length, 2);
  assert.equal(changed.readiness, 'pending-source-validation'); assert.equal(changed.previous!.assessment.durations.flight.minutes, 12);
  assert.ok(changed.blockers.includes('conflicting-source'));
  assert.throws(() => confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, changed.id, null));
});

test('partial/visible windows, missing references and invalid/out-of-window dates report ineligibility without changing prior history', () => {
  for (const state of ['partial', 'visible-only'] as const) {
    const t = trial(); prior(t); t.capture.coverage.state = state;
    assert.ok(plan(t).rows[0]!.blockers.includes('incomplete-coverage')); assert.throws(() => choose(t, null));
  }
  for (const value of ['', '31.02.2026', '01.09.2026']) {
    const t = trial({ Datum: value }), p = plan(t);
    assert.equal(p.rows[0]!.readiness, 'pending-source-validation'); assert.throws(() => choose(t, null));
  }
  const t = trial(); t.capture.observation.rows[0]!.sourceFlightId = null;
  assert.ok(plan(t).rows[0]!.blockers.includes('missing-reference')); assert.throws(() => choose(t, null));
});

test('empty windows retain omitted flights, require explicit complete/identity conditions and never emit a deletion', () => {
  const t = trial(); prior(t); const before = copy(t.workspace);
  t.capture.observation.rows = [];
  let p = plan(t);
  assert.deepEqual(p.rows, []); assert.deepEqual(p.retainedIds, before.previous.map(f => f.candidateId)); assert.deepEqual(p.blockers, []);
  t.fixture.identity = 'unverified'; t.capture.coverage.state = 'partial'; p = plan(t);
  assert.deepEqual(p.blockers, ['unverified-identity', 'incomplete-coverage']); assert.deepEqual(t.workspace, before);
  assert.ok(!('deletions' in p));
  t.capture.observation.headers = []; assert.throws(() => plan(t));
});

test('owner and scope mismatch reject before observing the capture; foreign prior/book/choice/aircraft IDs reject', () => {
  const t = trial(), bad = copy(t.capture); bad.scope.ownerId = 'foreign-owner';
  Object.defineProperty(bad, 'observation', { get() { throw new Error('must not read foreign capture'); } });
  assert.throws(() => planHistoryReview(t.workspace, bad, t.fixture), /Foreign planning scope/);
  for (const change of [
    (x: Trial) => { x.fixture.scope.scopeId = 'foreign-scope'; },
    (x: Trial) => { x.workspace.books[0]!.ownerId = 'foreign-owner'; },
    (x: Trial) => { x.workspace.previous = [adaptHistoryFacts({ ...scope, scopeId: 'foreign-scope' }, x.capture.observation, 0)]; },
    (x: Trial) => { x.workspace.choices = [{ scope, flightId: historyCandidateId({ ...scope, ownerId: 'foreign-owner' }, '101'), evidenceKey: 'forged', bookId: null, bookKey: null }]; },
    (x: Trial) => { x.fixture.aircraft = [{ flightId: 'foreign', evidenceKey: 'forged', aircraftRef: null, aircraftClass: null, duplicate: 'unverified' }]; },
  ]) { const x = trial(); change(x); assert.throws(() => plan(x)); }
  const p = plan(t);
  assert.throws(() => confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, p.rows[0]!.id, 'foreign-book'));
});

test('stale plan fingerprints reject changes to generation, source, coverage, identity, book and format availability', () => {
  for (const change of [
    (t: Trial) => { t.workspace.generation++; }, (t: Trial) => cell(t, 'Flugzeit', '13'),
    (t: Trial) => { t.capture.coverage.through = '2026-10-18'; },
    (t: Trial) => { t.fixture.identity = 'unverified'; },
    (t: Trial) => { t.workspace.books[0]!.through = '2026-09-30'; },
    (t: Trial) => { t.fixture.formats = []; },
  ]) {
    const t = trial(); classify(t); const p = plan(t); change(t);
    assert.throws(() => confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, p.rows[0]!.id, null), /plan changed/);
  }
  const t = trial(); classify(t); choose(t); t.workspace.books[0]!.formatVersion = '2';
  assert.equal(plan(t).rows[0]!.assignmentReason, 'stale-choice'); assert.equal(plan(t).rows[0]!.choice!.bookId, 'fixture-book-a');
});

test('confirmed historical aircraft choices suggest but never confirm new flights; ambiguous history remains unresolved', () => {
  const t = trial(); classify(t); choose(t); prior(t);
  const current = copy(t.capture.observation.rows[0]!); current.sourceFlightId = '102'; t.capture.observation.rows = [current]; classify(t);
  t.workspace.books.push({ ...copy(t.workspace.books[0]!), id: 'fixture-book-b' });
  let row = plan(t).rows[0]!;
  assert.equal(row.assignmentReason, 'history'); assert.equal(row.suggestedBookId, 'fixture-book-a'); assert.equal(row.choice, null);
  choose(t, 'fixture-book-b');
  t.workspace.previous.push(facts(t));
  t.capture.observation.captureId = 'fixture-capture-c';
  current.sourceFlightId = '103'; classify(t); row = plan(t).rows[0]!;
  assert.equal(row.assignmentReason, 'ambiguous-history'); assert.equal(row.suggestedBookId, null); assert.equal(row.readiness, 'needs-book-choice');
});

test('outputs and choices are independent copies and frozen caller inputs work without mutation', () => {
  const t = trial(); classify(t); const before = copy(t);
  function freeze(value: unknown) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } }
  freeze(t); const p = plan(t), edited = confirmHistoryChoice(t.workspace, t.capture, t.fixture, p.fingerprint, p.rows[0]!.id, null);
  edited.choices[0]!.scope.ownerId = 'changed'; p.rows[0]!.variants[0]!.assessment.observation.row.values[0] = 'changed';
  p.scope.ownerId = 'changed'; p.coverage.from = 'changed';
  assert.deepEqual(t, before); assert.deepEqual(plan(t), plan(before));
});

test('malformed sizes, duplicate book/choice IDs, altered prior facts and reused immutable observations fail closed', () => {
  const t = trial();
  t.capture.observation.rows = Array(HISTORY_PLAN_LIMIT + 1).fill(t.capture.observation.rows[0]); assert.throws(() => plan(t));
  const b = trial(); b.workspace.books.push(copy(b.workspace.books[0]!)); assert.throws(() => plan(b));
  const c = trial(); choose(c, null); c.workspace.choices.push(copy(c.workspace.choices[0]!)); assert.throws(() => plan(c));
  const p = trial(); p.workspace.previous = [facts(p)]; cell(p, 'Flugzeit', '18'); assert.throws(() => plan(p), /Immutable observation changed/);
  const altered = trial(); prior(altered); altered.workspace.previous[0]!.assessment.date.value = '2026-10-11'; assert.throws(() => plan(altered));
  const range = trial(); range.capture.coverage.through = '2026-02-30'; assert.throws(() => plan(range));
});

// Host-only contract preparation: no transport, storage, canonical Flight or UI.
import { canonical } from '@moflight/flight-logbook';
import type { AircraftClass } from '../../../../packages/local-data/src/books';
import { adaptHistoryFacts, validateHistoryFacts, validateHistoryScope, type HistoryFacts, type HistoryObservation, type HistoryScope } from './history-facts';

export const HISTORY_PLAN_LIMIT = 5_000;
export interface HistoryCapture {
  scope: HistoryScope;
  observation: HistoryObservation;
  retrievedAt: string;
  coverage: { from: string; through: string; state: 'complete' | 'partial' | 'visible-only' };
}
export interface HistoryBook {
  ownerId: string; id: string; formatId: string; formatVersion: string;
  classes: AircraftClass[]; from: string; through: string | null;
}
export interface HistoryChoice {
  scope: HistoryScope; flightId: string; evidenceKey: string;
  bookId: string | null; bookKey: string | null;
}
export interface HistoryWorkspace {
  scope: HistoryScope; generation: number; previous: HistoryFacts[]; books: HistoryBook[]; choices: HistoryChoice[];
}
/** Explicit fixture assumptions, never provider attestations or production authority. */
export interface HistoryPlanFixture {
  mode: 'synthetic-only'; scope: HistoryScope;
  identity: 'unverified' | 'fixture-established';
  formats: { id: string; version: string }[];
  aircraft: { flightId: string; evidenceKey: string; aircraftRef: string | null; aircraftClass: AircraftClass | null;
    duplicate: 'unverified' | 'countable' | 'source-duplicate' }[];
}
export type HistoryBlocker = 'unverified-identity' | 'incomplete-coverage' | 'missing-reference' | 'invalid-date' | 'outside-window' | 'conflicting-source';
export type HistoryAssignmentReason = 'confirmed' | 'stale-choice' | 'conflict' | 'unknown-class' | 'unverified-duplicate' | 'source-duplicate' | 'stale-aircraft-evidence' | 'no-eligible-book' | 'multiple-books' | 'category' | 'history' | 'ambiguous-history';
export interface HistoryPlanRow {
  id: string; status: 'added' | 'changed' | 'unchanged' | 'conflict';
  previous: HistoryFacts | null; variants: HistoryFacts[];
  blockers: HistoryBlocker[];
  readiness: 'pending-source-validation' | 'needs-book-choice' | 'ready-for-history' | 'history-with-deferred-book';
  candidateBookIds: string[]; suggestedBookId: string | null; assignmentReason: HistoryAssignmentReason;
  choice: HistoryChoice | null;
}
export interface HistoryPlan {
  authority: 'synthetic-only-no-live-write'; fingerprint: string;
  scope: HistoryScope; generation: number; rows: HistoryPlanRow[]; repeatedRows: number; retainedIds: string[];
  coverage: HistoryCapture['coverage']; blockers: HistoryBlocker[];
  counts: Record<HistoryPlanRow['readiness'], number>;
}
const clone = <T,>(value: T): T => JSON.parse(canonical(value)) as T;
const classes = ['glider', 'TMG', 'ultralight', 'powered'];
const sameScope = (a: HistoryScope, b: HistoryScope) => canonical(a) === canonical(b);
function text(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200) throw new Error('Invalid planning identifier.');
}
function date(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Invalid planning calendar date.');
}
function limited(value: unknown, max = HISTORY_PLAN_LIMIT): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error('Unsupported planning size.');
}

function validate(workspace: HistoryWorkspace, capture: HistoryCapture, fixture: HistoryPlanFixture): HistoryFacts[] {
  if (!workspace || !capture || !fixture) throw new Error('Planning context required.');
  validateHistoryScope(workspace.scope); validateHistoryScope(capture.scope); validateHistoryScope(fixture.scope);
  if (!sameScope(workspace.scope, capture.scope) || !sameScope(workspace.scope, fixture.scope)) throw new Error('Foreign planning scope.');
  if (fixture.mode !== 'synthetic-only' || !['unverified', 'fixture-established'].includes(fixture.identity)) throw new Error('Only synthetic planning is supported.');
  if (!Number.isSafeInteger(workspace.generation) || workspace.generation < 0) throw new Error('Invalid library generation.');
  limited(workspace.previous); limited(workspace.choices); limited(workspace.books, 1_000); limited(fixture.formats, 1_000); limited(fixture.aircraft, HISTORY_PLAN_LIMIT * 2);
  const { observation, coverage } = capture;
  if (!observation || !coverage) throw new Error('Capture observation and coverage required.');
  date(coverage.from); date(coverage.through);
  if (coverage.from > coverage.through || !['complete', 'partial', 'visible-only'].includes(coverage.state)) throw new Error('Unsupported planning coverage.');
  if (typeof capture.retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(capture.retrievedAt) || !Number.isFinite(Date.parse(capture.retrievedAt)) || new Date(capture.retrievedAt).toISOString() !== capture.retrievedAt) throw new Error('Invalid capture time.');
  limited(observation.rows);
  if (typeof observation.captureId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(observation.captureId) ||
      !Array.isArray(observation.headers) || !observation.headers.length || observation.headers.length > 128 ||
      !observation.headers.every(h => typeof h === 'string' && h.length <= 100) || new Set(observation.headers.filter(Boolean)).size !== observation.headers.filter(Boolean).length ||
      JSON.stringify(observation).length > 20_000_000) throw new Error('Unsupported capture observation.');
  const current = observation.rows.map((_, i) => adaptHistoryFacts(workspace.scope, observation, i));
  const previous = new Map<string, HistoryFacts>();
  for (const facts of workspace.previous) {
    validateHistoryFacts(facts, workspace.scope);
    if (!facts.candidateId || facts.assessment.date.state !== 'parsed' || previous.has(facts.candidateId)) throw new Error('Invalid or repeated prior flight.');
    previous.set(facts.candidateId, facts);
    const old = facts.assessment.observation;
    if (old.captureId === observation.captureId && canonical(old) !== canonical(current[old.rowIndex]?.assessment.observation)) throw new Error('Immutable observation changed.');
  }
  const allIds = new Set([...previous.keys(), ...current.flatMap(f => f.candidateId ? [f.candidateId] : [])]);
  const bookIds = new Set<string>();
  for (const b of workspace.books) {
    if (!b || b.ownerId !== workspace.scope.ownerId) throw new Error('Foreign planning book.');
    for (const value of [b.id, b.formatId, b.formatVersion]) text(value);
    date(b.from); if (b.through !== null) date(b.through);
    if (bookIds.has(b.id) || (b.through !== null && b.through < b.from) || !Array.isArray(b.classes) || !b.classes.length || b.classes.some(c => !classes.includes(c)) || new Set(b.classes).size !== b.classes.length) throw new Error('Invalid planning book.');
    bookIds.add(b.id);
  }
  const choiceIds = new Set<string>();
  for (const c of workspace.choices) {
    if (!c || !sameScope(c.scope, workspace.scope) || !allIds.has(c.flightId) || choiceIds.has(c.flightId) || typeof c.evidenceKey !== 'string' || !c.evidenceKey ||
        (c.bookId === null ? c.bookKey !== null : !bookIds.has(c.bookId) || typeof c.bookKey !== 'string' || !c.bookKey)) throw new Error('Foreign or invalid planning choice.');
    choiceIds.add(c.flightId);
  }
  const formats = new Set<string>();
  for (const f of fixture.formats) {
    if (!f) throw new Error('Invalid fixture format.'); text(f.id); text(f.version);
    const key = canonical(f); if (formats.has(key)) throw new Error('Repeated fixture format.'); formats.add(key);
  }
  const aircraft = new Set<string>();
  for (const a of fixture.aircraft) {
    if (!a || !allIds.has(a.flightId) || aircraft.has(a.flightId) || typeof a.evidenceKey !== 'string' || !a.evidenceKey ||
        (a.aircraftClass !== null && !classes.includes(a.aircraftClass)) || !['unverified', 'countable', 'source-duplicate'].includes(a.duplicate)) throw new Error('Foreign or invalid fixture aircraft evidence.');
    if (a.aircraftRef !== null) text(a.aircraftRef);
    aircraft.add(a.flightId);
  }
  return current;
}

export function planHistoryReview(workspace: HistoryWorkspace, capture: HistoryCapture, fixture: HistoryPlanFixture): HistoryPlan {
  const current = validate(workspace, capture, fixture);
  const blockers: HistoryBlocker[] = [];
  if (fixture.identity !== 'fixture-established') blockers.push('unverified-identity');
  if (capture.coverage.state !== 'complete') blockers.push('incomplete-coverage');
  const previous = new Map(workspace.previous.map(f => [f.candidateId!, f]));
  const choices = new Map(workspace.choices.map(c => [c.flightId, c]));
  const aircraft = new Map(fixture.aircraft.map(a => [a.flightId, a]));
  const supported = new Set(fixture.formats.map(f => canonical([f.id, f.version])));
  const eligibility = (facts: HistoryFacts) => {
    const a = facts.candidateId ? aircraft.get(facts.candidateId) : undefined;
    if (!a || a.evidenceKey !== facts.evidenceKey || !a.aircraftClass || a.duplicate !== 'countable' || !facts.assessment.date.value) return [];
    const day = facts.assessment.date.value;
    return workspace.books.filter(b => supported.has(canonical([b.formatId, b.formatVersion])) && b.classes.includes(a.aircraftClass!) && b.from <= day && (b.through === null || b.through >= day)).map(b => b.id).sort();
  };
  const bookKeys = new Map(workspace.books.map(b => [b.id, canonical(b)]));
  const bookKey = (id: string) => bookKeys.get(id)!;
  // Index prior confirmed choices once, rather than scanning the entire history
  // for each row in a bounded batch. Own-flight evidence is excluded below.
  const history = new Map<string, Map<string, Set<string>>>();
  for (const p of workspace.previous) {
    const prior = choices.get(p.candidateId!), known = aircraft.get(p.candidateId!);
    if (!known?.aircraftRef || !prior?.bookId || prior.evidenceKey !== p.evidenceKey || prior.bookKey !== bookKey(prior.bookId) || !eligibility(p).includes(prior.bookId)) continue;
    const books = history.get(known.aircraftRef) ?? new Map<string, Set<string>>();
    const ids = books.get(prior.bookId) ?? new Set<string>();
    ids.add(p.candidateId!); books.set(prior.bookId, ids); history.set(known.aircraftRef, books);
  }
  const grouped = new Map<string, HistoryFacts[]>(); let repeatedRows = 0;
  for (const facts of current) {
    const id = facts.candidateId ?? 'unidentified:' + canonical([workspace.scope.ownerId, workspace.scope.scopeId, facts.assessment.observation.captureId, facts.assessment.observation.rowIndex]);
    const variants = grouped.get(id) ?? [];
    if (variants.some(v => v.evidenceKey === facts.evidenceKey)) repeatedRows++;
    else variants.push(facts);
    grouped.set(id, variants);
  }
  const rows: HistoryPlanRow[] = [...grouped].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, variants]) => {
    variants.sort((a, b) => a.evidenceKey < b.evidenceKey ? -1 : a.evidenceKey > b.evidenceKey ? 1 : 0);
    const facts = variants[0]!, old = previous.get(id) ?? null, choice = choices.get(id) ?? null;
    const status = variants.length > 1 ? 'conflict' : !old ? 'added' : old.evidenceKey === facts.evidenceKey ? 'unchanged' : 'changed';
    const rowBlockers: HistoryBlocker[] = [...blockers];
    if (!facts.candidateId) rowBlockers.push('missing-reference');
    if (facts.assessment.date.state !== 'parsed') rowBlockers.push('invalid-date');
    else if (facts.assessment.date.value < capture.coverage.from || facts.assessment.date.value > capture.coverage.through) rowBlockers.push('outside-window');
    if (status === 'conflict') rowBlockers.push('conflicting-source');
    const candidates = status === 'conflict' ? [] : eligibility(facts);
    let suggestion: string | null = null, reason: HistoryAssignmentReason;
    const confirmed = choice !== null && status !== 'conflict' && choice.evidenceKey === facts.evidenceKey &&
      (choice.bookId === null || candidates.includes(choice.bookId) && choice.bookKey === bookKey(choice.bookId));
    if (choice) reason = confirmed ? 'confirmed' : 'stale-choice';
    else if (status === 'conflict') reason = 'conflict';
    else {
      const a = aircraft.get(id);
      if (!a) reason = 'unknown-class';
      else if (a.evidenceKey !== facts.evidenceKey) reason = 'stale-aircraft-evidence';
      else if (a.duplicate === 'source-duplicate') reason = 'source-duplicate';
      else if (a.duplicate === 'unverified') reason = 'unverified-duplicate';
      else if (!a.aircraftClass) reason = 'unknown-class';
      else if (!candidates.length) reason = 'no-eligible-book';
      else {
        const priorBooks = a.aircraftRef === null ? undefined : history.get(a.aircraftRef);
        const historical = candidates.filter(book => { const ids = priorBooks?.get(book); return ids && (ids.size > 1 || !ids.has(id)); });
        if (historical.length > 1) reason = 'ambiguous-history';
        else if (historical.length === 1) { reason = 'history'; suggestion = historical[0]!; }
        else if (candidates.length === 1) { reason = 'category'; suggestion = candidates[0]!; }
        else reason = 'multiple-books';
      }
    }
    const readiness = rowBlockers.length ? 'pending-source-validation' : !confirmed ? 'needs-book-choice' : choice!.bookId === null ? 'history-with-deferred-book' : 'ready-for-history';
    return { id, status, previous: old, variants, blockers: rowBlockers, readiness, candidateBookIds: candidates, suggestedBookId: confirmed ? choice!.bookId : suggestion, assignmentReason: reason, choice };
  });
  const counts: HistoryPlan['counts'] = { 'pending-source-validation': 0, 'needs-book-choice': 0, 'ready-for-history': 0, 'history-with-deferred-book': 0 };
  for (const row of rows) counts[row.readiness]++;
  // Canonical comparison token, not a hash, signature, verification receipt or authorization.
  const fingerprint = canonical({ workspace, capture, fixture });
  return clone({ authority: 'synthetic-only-no-live-write', fingerprint, scope: workspace.scope, generation: workspace.generation,
    rows, repeatedRows, retainedIds: [...previous.keys()].filter(id => !grouped.has(id)).sort(), coverage: capture.coverage, blockers, counts });
}

/** Returns only an independent in-memory workspace; there is deliberately no save/accept API. */
export function confirmHistoryChoice(workspace: HistoryWorkspace, capture: HistoryCapture, fixture: HistoryPlanFixture, fingerprint: string, flightId: string, bookId: string | null): HistoryWorkspace {
  const plan = planHistoryReview(workspace, capture, fixture);
  if (plan.fingerprint !== fingerprint) throw new Error('History plan changed; review again.');
  const row = plan.rows.find(r => r.id === flightId);
  if (!row || row.blockers.length || row.variants.length !== 1 || !row.variants[0]!.candidateId) throw new Error('Source validation required before a choice.');
  if (bookId !== null && !row.candidateBookIds.includes(bookId)) throw new Error('Book not eligible for these facts.');
  const choice: HistoryChoice = { scope: { ...workspace.scope }, flightId, evidenceKey: row.variants[0]!.evidenceKey,
    bookId, bookKey: bookId === null ? null : canonical(workspace.books.find(b => b.id === bookId)!) };
  return clone({ ...workspace, choices: [...workspace.choices.filter(c => c.flightId !== flightId), choice] });
}

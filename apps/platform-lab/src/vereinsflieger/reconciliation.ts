// Experimental, pure import planning. Not connected to the probe or canonical DB.
// Adapter/account/time verification must precede constructing these inputs.
import { canonical, validateFlight, type Flight } from '@moflight/flight-logbook';

export interface SourceBinding { datasetId: string; accountRef: string; clubRef: string }
export interface SourceRecord { sourceFlightId: string; flight: Omit<Flight, 'id'> }
export interface ImportState { binding: SourceBinding; flights: Flight[] }
export interface RetrievalBatch {
  binding: SourceBinding;
  identityVerified: boolean;
  sourceIdsVerified: boolean;
  timeBasisVerified: boolean;
  scope: 'own-pilot-or-companion';
  coverage: { from: string; through: string; complete: boolean };
  records: SourceRecord[];
}
export interface ReconciliationPlan {
  added: Flight[]; changed: { previous: Flight; next: Flight }[];
  unchanged: number; repeatedRows: number;
  coverage: RetrievalBatch['coverage'];
}
export interface ReconciliationReview {
  rows: { id: string; previous: Flight | null; variants: Flight[]; status: 'added' | 'changed' | 'unchanged' | 'conflict' }[];
  repeatedRows: number;
  coverage: RetrievalBatch['coverage'];
}
function copy<T>(value: T): T { return JSON.parse(canonical(value)) as T; }
function date(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Invalid coverage date.');
}
function binding(value: SourceBinding): void {
  if ([value.datasetId, value.accountRef, value.clubRef].some(x => typeof x !== 'string' || !x.trim() || x.length > 200)) throw new Error('Verified dataset/account/club binding required.');
}
export function sourceIdentity(b: SourceBinding, sourceFlightId: string): string {
  binding(b);
  if (!/^\d{1,20}$/.test(sourceFlightId)) throw new Error('Verified source flight reference required.');
  // Tuple encoding avoids delimiter collisions and never uses mutable row values.
  return 'vereinsflieger:' + JSON.stringify([b.datasetId, b.accountRef, b.clubRef, sourceFlightId]);
}
export function reviewReconciliation(state: ImportState, batch: RetrievalBatch): ReconciliationReview {
  binding(state.binding); binding(batch.binding);
  if (canonical(state.binding) !== canonical(batch.binding)) throw new Error('Source binding mismatch; preserve existing history.');
  if (batch.identityVerified !== true || batch.sourceIdsVerified !== true || batch.timeBasisVerified !== true || batch.scope !== 'own-pilot-or-companion') throw new Error('Source verification incomplete; canonical import unavailable.');
  date(batch.coverage.from); date(batch.coverage.through);
  if (batch.coverage.from > batch.coverage.through || batch.coverage.complete !== true) throw new Error('Only a complete verified bounded window may be reconciled.');
  if (!Array.isArray(batch.records) || batch.records.length > 5_000) throw new Error('Unsupported batch size.');
  const previous = new Map<string, Flight>();
  for (const flight of state.flights) {
    validateFlight(flight);
    let reference: unknown;
    try { reference = JSON.parse(flight.id.slice('vereinsflieger:'.length)); }
    catch { throw new Error('Existing source identity is not scoped to this binding.'); }
    if (!Array.isArray(reference) || reference.length !== 4 || typeof reference[3] !== 'string' || sourceIdentity(state.binding, reference[3]) !== flight.id) throw new Error('Existing source identity is not scoped to this binding.');
    if (previous.has(flight.id)) throw new Error('Existing identity conflict requires review.');
    previous.set(flight.id, flight);
  }
  const staged = new Map<string, Flight[]>(); let repeatedRows = 0;
  for (const record of batch.records) {
    const flight: Flight = { ...record.flight, id: sourceIdentity(batch.binding, record.sourceFlightId) };
    validateFlight(flight);
    if (!flight.date || flight.date < batch.coverage.from || flight.date > batch.coverage.through || !flight.time_basis?.trim()) throw new Error('Flight outside verified coverage or missing time basis.');
    const variants = staged.get(flight.id) ?? [];
    if (variants.some(old => canonical(old) === canonical(flight))) repeatedRows++;
    else variants.push(flight);
    staged.set(flight.id, variants);
  }
  const rows: ReconciliationReview['rows'] = [...staged].map(([id, variants]) => {
    const old = previous.get(id) ?? null;
    return { id, previous: copy(old), variants: copy(variants), status: variants.length > 1 ? 'conflict' : !old ? 'added' : canonical(old) === canonical(variants[0]) ? 'unchanged' : 'changed' };
  });
  return { rows, repeatedRows, coverage: { ...batch.coverage } };
}
export function planReconciliation(state: ImportState, batch: RetrievalBatch): ReconciliationPlan {
  const review = reviewReconciliation(state, batch);
  if (review.rows.some(row => row.status === 'conflict')) throw new Error('Conflicting source rows require review.');
  const added: Flight[] = [], changed: ReconciliationPlan['changed'] = []; let unchanged = 0;
  for (const row of review.rows) {
    if (row.status === 'added') added.push(row.variants[0]!);
    else if (row.status === 'changed') changed.push({ previous: row.previous!, next: row.variants[0]! });
    else unchanged++;
  }
  // No deletion operation: omissions cannot establish source deletion, even in
  // a complete bounded window. Persistence/decision invalidation remains separate.
  return { added, changed, unchanged, repeatedRows: review.repeatedRows, coverage: review.coverage };
}

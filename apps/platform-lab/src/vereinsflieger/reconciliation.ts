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
export function planReconciliation(state: ImportState, batch: RetrievalBatch): ReconciliationPlan {
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
  const staged = new Map<string, Flight>(); let repeatedRows = 0;
  for (const record of batch.records) {
    const flight: Flight = { ...record.flight, id: sourceIdentity(batch.binding, record.sourceFlightId) };
    validateFlight(flight);
    if (!flight.date || flight.date < batch.coverage.from || flight.date > batch.coverage.through || !flight.time_basis?.trim()) throw new Error('Flight outside verified coverage or missing time basis.');
    const old = staged.get(flight.id);
    if (old) {
      if (canonical(old) !== canonical(flight)) throw new Error('Conflicting source rows require review.');
      repeatedRows++; continue;
    }
    staged.set(flight.id, flight);
  }
  const added: Flight[] = [], changed: ReconciliationPlan['changed'] = []; let unchanged = 0;
  for (const flight of staged.values()) {
    const old = previous.get(flight.id);
    if (!old) added.push(flight);
    else if (canonical(old) !== canonical(flight)) changed.push({ previous: copy(old), next: copy(flight) });
    else unchanged++;
  }
  // No deletion operation: omissions cannot establish source deletion, even in
  // a complete bounded window. Persistence/decision invalidation remains separate.
  return { added: copy(added), changed, unchanged, repeatedRows, coverage: { ...batch.coverage } };
}

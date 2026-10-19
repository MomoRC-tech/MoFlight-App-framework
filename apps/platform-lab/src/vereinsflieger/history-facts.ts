import { canonical } from '@moflight/flight-logbook';
import { assessSourceFlight, type SourceFlightAssessment } from './source-assessment';
import type { ProbeSnapshot } from './probe';
import { validateOwner } from './scope-store';

export interface HistoryScope { ownerId: string; scopeId: string }
export type HistoryObservation = Pick<ProbeSnapshot, 'captureId' | 'headers' | 'rows'>;
export const HISTORY_FACTS_MAPPING = 'vf-history-facts-v1';
export interface HistoryFacts {
  mapping: typeof HISTORY_FACTS_MAPPING;
  authority: 'unverified-source-facts';
  scope: HistoryScope;
  candidateId: string | null;
  assessment: SourceFlightAssessment;
  evidenceKey: string;
}

export function validateHistoryScope(scope: HistoryScope): void {
  if (!scope) throw new Error('History scope required.');
  validateOwner(scope.ownerId); validateOwner(scope.scopeId);
}
export function historyCandidateId(scope: HistoryScope, reference: string): string {
  validateHistoryScope(scope);
  if (typeof reference !== 'string' || !/^\d{1,20}$/.test(reference)) throw new Error('Candidate source reference required.');
  return 'vf-history:' + canonical([scope.ownerId, scope.scopeId, reference]);
}

/** Pure evidence adapter. Does not attest identity, assign people/credit or create a Flight. */
export function adaptHistoryFacts(scope: HistoryScope, snapshot: HistoryObservation, rowIndex: number): HistoryFacts {
  validateHistoryScope(scope);
  const assessment = assessSourceFlight(snapshot, rowIndex);
  const { headers, row } = assessment.observation;
  // Named columns can be reordered without manufacturing a source change.
  // Unnamed columns retain their position; they have no established field identity.
  const fields = headers.map((header, i) => header ? ['named', header, row.values[i]!] : ['unnamed', String(i), row.values[i]!])
    .sort((a, b) => canonical(a) < canonical(b) ? -1 : canonical(a) > canonical(b) ? 1 : 0);
  return { mapping: HISTORY_FACTS_MAPPING, authority: 'unverified-source-facts', scope: { ...scope },
    candidateId: row.sourceFlightId === null ? null : historyCandidateId(scope, row.sourceFlightId),
    assessment, evidenceKey: canonical({ reference: row.sourceFlightId, fields }) };
}

/** Rebuild derived fields instead of trusting serialized assessment/verification flags. */
export function validateHistoryFacts(facts: HistoryFacts, scope: HistoryScope): void {
  validateHistoryScope(scope);
  if (!facts || canonical(facts.scope) !== canonical(scope) || !facts.assessment?.observation) throw new Error('Foreign history facts.');
  const observation = facts.assessment.observation;
  // Assessment accepts a row index into a complete observation; reconstruct just
  // that row, then restore its original provenance before comparing the contract.
  const rebuilt = adaptHistoryFacts(scope, { captureId: observation.captureId, headers: observation.headers, rows: [observation.row] }, 0);
  if (!Number.isSafeInteger(observation.rowIndex) || observation.rowIndex < 0) throw new Error('Invalid observation position.');
  rebuilt.assessment.observation.rowIndex = observation.rowIndex;
  if (canonical(rebuilt) !== canonical(facts)) throw new Error('Unsupported or altered history facts.');
}

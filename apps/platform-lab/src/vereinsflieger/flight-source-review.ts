import { canonical } from '@moflight/flight-logbook';
import { realHistoryUuid } from './real-history-contract';
import type { HistoryFacts } from './history-facts';

export interface FlightReviewTarget { ownerId: string; storeId: string; accountRef: string }
export interface FlightAcknowledgment { flightId: string; revision: number; payloadSha256: string }
export interface FlightRevisionDigest { revision: number; payloadSha256: string }
export interface FlightReviewSummary {
  baselineRevision: number; currentRevision: number; changed: boolean; changeCount: number;
}
export interface FlightReviewValue { state: 'missing' | 'empty' | 'value' | 'ambiguous'; values: string[] }
export interface FlightReviewField { key: string; label: string; before: FlightReviewValue; current: FlightReviewValue }
export interface FlightSourceReview extends FlightReviewSummary {
  acknowledgment: FlightAcknowledgment; fields: FlightReviewField[]; reverted: boolean;
}

export function validateFlightReviewTarget(target: FlightReviewTarget): void {
  realHistoryUuid(target.ownerId); realHistoryUuid(target.storeId);
  if (typeof target.accountRef !== 'string' || !/^\d{1,20}$/.test(target.accountRef)) throw new Error('Invalid flight review account');
}
export function validateFlightAcknowledgment(value: FlightAcknowledgment): void {
  if (!value || Object.keys(value).sort().join(',') !== 'flightId,payloadSha256,revision' ||
      !/^[0-9a-f]{64}$/.test(value.flightId) || !/^[0-9a-f]{64}$/.test(value.payloadSha256) ||
      !Number.isSafeInteger(value.revision) || value.revision < 1) throw new Error('Invalid flight acknowledgment');
}

/** Last-seen state never authorizes source data. A foreign/restored branch cannot
 * inherit an acknowledgment merely because its revision number matches. */
export function flightReviewSummary(revisions: readonly FlightRevisionDigest[], acknowledgment?: FlightAcknowledgment): FlightReviewSummary {
  if (!revisions.length) throw new Error('Missing flight revisions');
  const currentRevision = revisions.at(-1)!.revision;
  const matched = acknowledgment && revisions.find(row => row.revision === acknowledgment.revision && row.payloadSha256 === acknowledgment.payloadSha256);
  const baselineRevision = matched?.revision ?? revisions[0]!.revision;
  return { baselineRevision, currentRevision, changed: currentRevision > baselineRevision, changeCount: currentRevision - baselineRevision };
}

function fields(facts: HistoryFacts): Map<string, { label: string; values: string[] }> {
  const result = new Map<string, { label: string; values: string[] }>();
  const { headers, row } = facts.assessment.observation;
  headers.forEach((header, index) => {
    const key = header ? `named:${header}` : `unnamed:${index}`;
    const entry = result.get(key) ?? { label: header || `Ohne Überschrift · Spalte ${index + 1}`, values: [] };
    entry.values.push(row.values[index]!); result.set(key, entry);
  });
  return result;
}
function value(entry?: { values: string[] }): FlightReviewValue {
  return !entry ? { state: 'missing', values: [] } : {
    state: entry.values.length > 1 ? 'ambiguous' : entry.values[0] === '' ? 'empty' : 'value', values: [...entry.values],
  };
}

/** Compare recorded fields, never calculated credit or guessed column identity. */
export function compareFlightSourceFields(before: HistoryFacts, current: HistoryFacts): FlightReviewField[] {
  if (canonical(before.scope) !== canonical(current.scope) || before.candidateId !== current.candidateId || !before.candidateId) {
    throw new Error('Foreign flight comparison');
  }
  const oldFields = fields(before), newFields = fields(current), result: FlightReviewField[] = [];
  for (const key of new Set([...newFields.keys(), ...oldFields.keys()])) {
    const old = oldFields.get(key), next = newFields.get(key);
    if (canonical(old ? [...old.values].sort() : null) === canonical(next ? [...next.values].sort() : null)) continue;
    result.push({ key, label: (next ?? old)!.label, before: value(old), current: value(next) });
  }
  return result;
}

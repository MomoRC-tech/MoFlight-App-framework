import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import { validateContext } from './context';
import { validateFlightBillingObservation, type FlightBillingObservation } from './expense-flight-billing';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import { validateFinancialObservationTarget } from './expense-observation-store';
import { validateFinancialSourcePages } from './expense-projection-adapter';
import type { FinancialEvidenceSnapshot } from './expense-evidence-store';

/** Maximum number of source flights recorded by one resumable request. */
export const FINANCIAL_COLLECTION_BATCH_SIZE = 10;
export const FINANCIAL_COLLECTION_CHECKPOINT_LIMIT = 64 * 1024 * 1024;

export interface FinancialCollectionCheckpoint {
  version: 1;
  id: string;
  target: FinancialObservationTarget;
  selection: FinancialEvidenceSnapshot['selection'];
  startedAt: string;
  batches: { snapshot: FinancialEvidenceSnapshot; billed: FlightBillingObservation[] }[];
}

const copy = <T>(value: T): T => JSON.parse(canonical(value)) as T;
const bytes = (value: string) => new TextEncoder().encode(value).length;
const sha = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

function exact(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Unsupported financial checkpoint fields.');
}
function identity(value: unknown) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid financial checkpoint identity.');
}
function timestamp(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid financial checkpoint timestamp.');
}
function flight(value: unknown) {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw new Error('Invalid financial checkpoint flight reference.');
}

/** Shared snapshot validation lives here so the checkpoint and evidence-store
 * modules can use the same checks without a runtime import cycle. */
export function validateFinancialEvidenceSnapshot(value: FinancialEvidenceSnapshot, target: FinancialObservationTarget): FinancialEvidenceSnapshot {
  exact(value, ['version','id','target','retrievedAt','ownRecipientLabel','contextBefore','contextAfter','selection','sources','unknown','summary','ledgers']);
  identity(value.id); timestamp(value.retrievedAt);
  if (value.version !== 1 || canonical(validateFinancialObservationTarget(value.target)) !== canonical(target) ||
      canonical(validateContext(value.contextBefore)) !== canonical(target.scope.context) || canonical(validateContext(value.contextAfter)) !== canonical(target.scope.context) ||
      typeof value.ownRecipientLabel !== 'string' || !value.ownRecipientLabel.trim() || value.ownRecipientLabel.length > 200) throw new Error('Foreign financial source evidence.');
  exact(value.selection, ['sourceFlightRefs','source']);
  if (value.selection.source !== 'verified-own-flight-library' || !Array.isArray(value.selection.sourceFlightRefs) || value.selection.sourceFlightRefs.length > 500 ||
      new Set(value.selection.sourceFlightRefs).size !== value.selection.sourceFlightRefs.length || !Array.isArray(value.sources) || !Array.isArray(value.unknown) ||
      value.sources.length + value.unknown.length !== value.selection.sourceFlightRefs.length) throw new Error('Incomplete financial source selection.');
  value.selection.sourceFlightRefs.forEach(flight); const seen = new Set<string>();
  for (const source of value.sources) {
    exact(source, ['sourceFlightRef','sourceHash']); flight(source.sourceFlightRef);
    if (!sha(source.sourceHash) || seen.has(source.sourceFlightRef) || !value.selection.sourceFlightRefs.includes(source.sourceFlightRef)) throw new Error('Invalid financial source fingerprint.');
    seen.add(source.sourceFlightRef);
  }
  for (const source of value.unknown) {
    exact(source, ['sourceFlightRef','reason']); flight(source.sourceFlightRef);
    if (!['unbilled','unavailable'].includes(source.reason) || seen.has(source.sourceFlightRef) || !value.selection.sourceFlightRefs.includes(source.sourceFlightRef)) throw new Error('Invalid unavailable financial source.');
    seen.add(source.sourceFlightRef);
  }
  validateFinancialSourcePages(value, value.ownRecipientLabel, target);
  if (bytes(canonical(value)) > 4_000_000) throw new Error('Financial evidence snapshot exceeds its bound.');
  return copy(value);
}

/** Checks one complete checkpoint value. A zero-batch value is a valid
 * skeleton; an empty selection is complete only after its single empty batch. */
export async function validateFinancialCollectionCheckpoint(
  input: FinancialCollectionCheckpoint, target: FinancialObservationTarget, hash: Hash,
): Promise<FinancialCollectionCheckpoint> {
  exact(input, ['version','id','target','selection','startedAt','batches']);
  identity(input.id); timestamp(input.startedAt);
  const selected = validateFinancialObservationTarget(target);
  if (input.version !== 1 || canonical(validateFinancialObservationTarget(input.target)) !== canonical(selected)) throw new Error('Foreign financial collection checkpoint.');
  exact(input.selection, ['sourceFlightRefs','source']);
  const refs = input.selection.sourceFlightRefs;
  if (input.selection.source !== 'verified-own-flight-library' || !Array.isArray(refs) || refs.length > 500 || new Set(refs).size !== refs.length ||
      !Array.isArray(input.batches) || input.batches.length > Math.max(1, Math.ceil(refs.length / FINANCIAL_COLLECTION_BATCH_SIZE))) throw new Error('Invalid financial checkpoint selection.');
  refs.forEach(flight);

  const snapshots = new Set<string>(); let offset = 0; let recipient: string | null = null;
  const checked: FinancialCollectionCheckpoint['batches'] = [];
  for (let batchIndex = 0; batchIndex < input.batches.length; batchIndex++) {
    const entry = input.batches[batchIndex];
    exact(entry, ['snapshot','billed']);
    const snapshot = validateFinancialEvidenceSnapshot(entry.snapshot, selected);
    const remaining = refs.length - offset;
    const expectedRefs = refs.slice(offset, offset + FINANCIAL_COLLECTION_BATCH_SIZE);
    if (snapshots.has(snapshot.id) || (!expectedRefs.length && (refs.length !== 0 || batchIndex !== 0 || input.batches.length !== 1)) ||
        snapshot.selection.source !== input.selection.source || canonical(snapshot.selection.sourceFlightRefs) !== canonical(expectedRefs) ||
        expectedRefs.length > FINANCIAL_COLLECTION_BATCH_SIZE || remaining < expectedRefs.length ||
        (recipient !== null && snapshot.ownRecipientLabel !== recipient)) throw new Error('Financial checkpoint batch is not the next selection prefix.');
    snapshots.add(snapshot.id); recipient ??= snapshot.ownRecipientLabel;
    if (!Array.isArray(entry.billed) || entry.billed.length !== snapshot.sources.length) throw new Error('Financial checkpoint billed inventory differs.');
    const billedRefs = new Set<string>();
    for (const candidate of entry.billed) {
      const billed = validateFlightBillingObservation(candidate, selected);
      if (canonical(billed) !== canonical(candidate) || billed.ownRecipientLabel !== snapshot.ownRecipientLabel ||
          canonical(billed.contextBefore) !== canonical(snapshot.contextBefore) || canonical(billed.contextAfter) !== canonical(snapshot.contextAfter) ||
          billed.retrievedAt !== snapshot.retrievedAt || billedRefs.has(billed.source.sourceFlightId)) throw new Error('Financial checkpoint billed source differs.');
      const source = snapshot.sources.find(value => value.sourceFlightRef === billed.source.sourceFlightId);
      if (!source || source.sourceHash !== await hash(canonical(billed.source))) throw new Error('Financial checkpoint source fingerprint differs.');
      billedRefs.add(billed.source.sourceFlightId);
    }
    if (snapshot.sources.some(value => !billedRefs.has(value.sourceFlightRef))) throw new Error('Financial checkpoint billed source is missing.');
    checked.push({ snapshot, billed: entry.billed.map(value => copy(value)) });
    offset += expectedRefs.length;
  }
  if (refs.length === 0 && input.batches.length > 1) throw new Error('Empty financial selection has multiple batches.');
  const result: FinancialCollectionCheckpoint = { version: 1, id: input.id, target: selected,
    selection: { source: input.selection.source, sourceFlightRefs: [...refs] }, startedAt: input.startedAt, batches: checked };
  if (bytes(canonical(result)) > FINANCIAL_COLLECTION_CHECKPOINT_LIMIT) throw new Error('Financial checkpoint journal exceeds its bound.');
  return copy(result);
}

export interface EncodedFinancialCollectionCheckpoint {
  format: 'moflight-financial-collection-checkpoint';
  version: 1;
  payload: string;
  checksum: string;
}

export async function encodeFinancialCollectionCheckpoint(
  value: FinancialCollectionCheckpoint, target: FinancialObservationTarget, hash: Hash,
): Promise<string> {
  const checkpoint = await validateFinancialCollectionCheckpoint(value, target, hash), payload = canonical(checkpoint), checksum = await hash(payload);
  if (!sha(checksum)) throw new Error('Financial checkpoint integrity calculation unavailable.');
  const text = canonical({ format: 'moflight-financial-collection-checkpoint', version: 1, payload, checksum });
  if (bytes(text) > FINANCIAL_COLLECTION_CHECKPOINT_LIMIT) throw new Error('Financial checkpoint journal exceeds its bound.');
  return text;
}

export async function decodeFinancialCollectionCheckpoint(
  text: string, target: FinancialObservationTarget, hash: Hash,
): Promise<FinancialCollectionCheckpoint> {
  if (typeof text !== 'string' || bytes(text) > FINANCIAL_COLLECTION_CHECKPOINT_LIMIT) throw new Error('Financial checkpoint journal exceeds its bound.');
  let envelope: unknown;
  try { envelope = JSON.parse(text); } catch { throw new Error('Corrupt financial checkpoint journal.'); }
  exact(envelope, ['format','version','payload','checksum']);
  if (envelope.format !== 'moflight-financial-collection-checkpoint' || envelope.version !== 1 || typeof envelope.payload !== 'string' ||
      !sha(envelope.checksum) || canonical(envelope) !== text || await hash(envelope.payload) !== envelope.checksum) throw new Error('Corrupt financial checkpoint journal.');
  let input: unknown;
  try { input = JSON.parse(envelope.payload); } catch { throw new Error('Corrupt financial checkpoint payload.'); }
  if (canonical(input) !== envelope.payload) throw new Error('Unsupported financial checkpoint payload.');
  const checked = await validateFinancialCollectionCheckpoint(input as FinancialCollectionCheckpoint, target, hash);
  if (canonical(checked) !== envelope.payload) throw new Error('Unsupported financial checkpoint payload.');
  return checked;
}

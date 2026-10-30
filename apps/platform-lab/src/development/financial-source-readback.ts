import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import type { UserFinancialBackup } from '../user-backup';
import { validateFinancialObservationBackup, type FinancialObservationReceipt } from '../vereinsflieger/expense-observation-store';

export type FinancialSourceReadback = { state: 'absent' } | {
  state: 'verified'; receiptCount: number; billedFlightCount: number; latestBilledChecksum: string | null;
};

/** Read-only: the native export adapter never initializes an absent store.
 * Check the entire archive and, after capture, the exact acknowledged receipt.
 * Return counts/checksums only; do not log private source text or coordinates. */
export async function readFinancialSourceProof(ports: {
  gate(): Promise<void>; exportSection(): Promise<UserFinancialBackup>; hash: Hash;
}, expected?: FinancialObservationReceipt): Promise<FinancialSourceReadback> {
  const expectedValue = expected ? canonical(expected) : null;
  await ports.gate();
  const section = await ports.exportSection();
  await ports.gate();
  if (section.state === 'absent') {
    if (expected) throw Error('Acknowledged financial receipt is unavailable.');
    return { state: 'absent' };
  }
  const graph = await validateFinancialObservationBackup(section.archive, section.target, ports.hash);
  if ((section.state === 'empty') !== (graph.receipts.length === 0)) throw Error('Inconsistent financial archive state.');
  if (expectedValue && !graph.receipts.some(receipt => canonical(receipt) === expectedValue)) {
    throw Error('Exact acknowledged financial receipt is unavailable.');
  }
  await ports.gate();
  const billed = graph.receipts.filter(receipt => receipt.kind === 'billed-flight');
  return { state: 'verified', receiptCount: graph.receipts.length, billedFlightCount: billed.length,
    latestBilledChecksum: billed.at(-1)?.checksum ?? null };
}

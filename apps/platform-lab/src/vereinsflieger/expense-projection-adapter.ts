import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import { projectExpenses } from '../expenses/expense-projection';
import type { ExpensePeriod, ExpenseScope, UnversionedBilledFlightFact, UnversionedExpenseProjection } from '../expenses/expense-types';
import type { FlightBillingObservation } from './expense-flight-billing';
import { validateFinancialLedgerObservation, type FinancialLedgerObservation, type FinancialObservationTarget } from './expense-ledger-observation';
import { parseObservedFinancialDate } from './expense-money-observation';
import { validateFinancialObservationBackup, validateFinancialObservationTarget, type FinancialObservationReceipt } from './expense-observation-store';
import { assessBilledFlightSource, corroborateBilledFlightBooking } from './expense-source-assessment';

/** A trusted durable reader must verify collection/receipt provenance and
 * uniqueness against all retained evidence before returning this raw witness.
 * These structural checks cannot authenticate arbitrary asserted JSON. This is
 * a calculation port, not an issued archive format or a native writer. */
export interface DurableInvoiceBookingEvidence {
  version: 1;
  target: FinancialObservationTarget;
  billedReceiptId: string;
  billedChecksum: string;
  sourceFlightRef: string;
  summary: {
    evidenceRef: string;
    sourceUrl: string;
    rows: { position: number; numberRaw: string; recipientRaw: string; url: string; dateRaw: string; amountRaw: string }[];
    coverage: { kind: 'visible-page'; truncated: boolean; pagination: 'unverified' };
  };
  ledgers: {
    evidenceRef: string;
    observation: FinancialLedgerObservation;
    invoiceLinks: { rowPosition: number; url: string }[];
  }[];
}
export interface CapturedExpenseProjectionPorts {
  /** Pin/recheck the original current-owner lease, selected store/provider and
   * pending recovery gate. Once non-null, also attest the exact current raw
   * receipt inventory, rejecting a stale/incomplete archive after any append.
   * Fail after a switch or graph change, never silently retarget. */
  gate(target: FinancialObservationTarget, inventory: readonly Pick<FinancialObservationReceipt, 'id' | 'sequence' | 'checksum'>[] | null): Promise<void>;
  hash: Hash;
  /** Required trusted, checksummed durable evidence reader; no native
   * implementation/activation is provided by this host integration package. */
  readInvoiceBookingEvidence(target: FinancialObservationTarget, billed: FinancialObservationReceipt[]): Promise<readonly DurableInvoiceBookingEvidence[]>;
}

const clone = <T>(value: T): T => JSON.parse(canonical(value)) as T;
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw Error('Invalid financial link evidence.');
}
function raw(value: unknown, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\u0000/.test(value)) throw Error('Invalid financial link source text.');
}
function ref(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw Error('Invalid durable financial evidence reference.');
}
function invoiceUrl(value: unknown): asserts value is string {
  raw(value, 512);
  let url: URL;
  try { url = new URL(value); } catch { throw Error('Invalid own invoice reference.'); }
  if (url.protocol !== 'https:' || !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(url.hostname) ||
      url.username || url.password || url.port || url.hash || url.pathname !== '/member/profile/printuserinvoice.php' ||
      [...url.searchParams.keys()].join(',') !== 'uiid' || !/^\d{1,20}$/.test(url.searchParams.get('uiid') ?? '') || url.href !== value) throw Error('Invalid own invoice reference.');
}
function scopeOf(target: FinancialObservationTarget): ExpenseScope {
  return { ownerId: target.scope.owner, storeId: target.storeId, connectionId: target.scope.connectionId,
    accountRef: target.scope.context.accountNumber, clubContext: target.scope.context.clubLabel };
}

function checkedProof(input: DurableInvoiceBookingEvidence, receipt: FinancialObservationReceipt, target: FinancialObservationTarget): DurableInvoiceBookingEvidence {
  exact(input, ['version', 'target', 'billedReceiptId', 'billedChecksum', 'sourceFlightRef', 'summary', 'ledgers']);
  const billed = receipt.value as FlightBillingObservation;
  if (input.version !== 1 || canonical(validateFinancialObservationTarget(input.target)) !== canonical(target) ||
      input.billedReceiptId !== receipt.id || input.billedChecksum !== receipt.checksum || input.sourceFlightRef !== billed.source.sourceFlightId) throw Error('Foreign or stale financial link evidence.');
  exact(input.summary, ['evidenceRef', 'sourceUrl', 'rows', 'coverage']); ref(input.summary.evidenceRef);
  raw(input.summary.sourceUrl, 512);
  const url = new URL(input.summary.sourceUrl);
  if (url.protocol !== 'https:' || !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(url.hostname) ||
      url.username || url.password || url.port || url.hash || url.search || url.pathname !== '/member/profile/userinvoice.php' || url.href !== input.summary.sourceUrl) throw Error('Invalid own invoice summary source.');
  exact(input.summary.coverage, ['kind', 'truncated', 'pagination']);
  if (input.summary.coverage.kind !== 'visible-page' || input.summary.coverage.pagination !== 'unverified' || typeof input.summary.coverage.truncated !== 'boolean' ||
      !Array.isArray(input.summary.rows) || input.summary.rows.length > 20 || !Array.isArray(input.ledgers) || input.ledgers.length > 20) throw Error('Invalid financial link coverage.');
  let previous = -1;
  for (const row of input.summary.rows) {
    exact(row, ['position', 'numberRaw', 'recipientRaw', 'url', 'dateRaw', 'amountRaw']);
    if (!Number.isSafeInteger(row.position) || row.position <= previous || row.position > 100_000) throw Error('Invalid invoice source row.');
    previous = row.position;
    raw(row.numberRaw); raw(row.recipientRaw); raw(row.dateRaw, 128); raw(row.amountRaw, 128); invoiceUrl(row.url);
    if (!/^\d{1,20}$/.test(row.numberRaw.trim()) || row.recipientRaw.trim() !== billed.ownRecipientLabel || new URL(row.url).origin !== url.origin) throw Error('Foreign or unsupported own invoice row.');
  }
  const evidenceRefs = new Set<string>([input.summary.evidenceRef]);
  for (const ledger of input.ledgers) {
    exact(ledger, ['evidenceRef', 'observation', 'invoiceLinks']); ref(ledger.evidenceRef);
    if (evidenceRefs.has(ledger.evidenceRef)) throw Error('Ambiguous durable financial evidence reference.');
    evidenceRefs.add(ledger.evidenceRef);
    const observation = validateFinancialLedgerObservation(ledger.observation, target);
    if (!Array.isArray(ledger.invoiceLinks) || ledger.invoiceLinks.length > 20) throw Error('Invalid financial row links.');
    const positions = new Set<number>();
    for (const link of ledger.invoiceLinks) {
      exact(link, ['rowPosition', 'url']); invoiceUrl(link.url);
      if (positions.has(link.rowPosition) || !observation.capture.rows.some(row => row.position === link.rowPosition) || new URL(link.url).origin !== url.origin) throw Error('Invalid financial row link coordinates.');
      positions.add(link.rowPosition);
    }
  }
  return clone(input);
}

function linkFact(proof: DurableInvoiceBookingEvidence, receipt: FinancialObservationReceipt, target: FinancialObservationTarget) {
  const billed = receipt.value as FlightBillingObservation;
  const candidate = corroborateBilledFlightBooking(billed, proof.ledgers.map(ledger => ledger.observation), target);
  const rows = proof.summary.rows.filter(row => row.numberRaw.trim() === candidate.invoiceReference);
  const evidenceRefs = [`summary:${proof.summary.evidenceRef}`, ...proof.ledgers.flatMap(ledger => {
    const index = ledger.observation.capture.columns.findIndex(column => column.key === 'invoice');
    return index < 0 ? [] : ledger.observation.capture.rows.filter(row => row.values[index]!.trim() === candidate.invoiceReference)
      .map(row => `ledger:${ledger.evidenceRef}/row/${row.position}`);
  })];
  let state: UnversionedBilledFlightFact['linkState'] = candidate.state === 'conflict' ? 'conflict' : 'unavailable';
  const selected = rows.length === 1 ? rows[0]! : null;
  if (rows.length > 1 || selected && proof.summary.rows.some(row => row.position !== selected.position && row.url === selected.url)) state = 'conflict';
  else if (selected && candidate.state === 'corroborated' && parseObservedFinancialDate(selected.dateRaw).state === 'value') {
    state = 'verified';
    for (const ledger of proof.ledgers) {
      const invoiceIndex = ledger.observation.capture.columns.findIndex(column => column.key === 'invoice');
      for (const row of ledger.observation.capture.rows) if (invoiceIndex >= 0 && row.values[invoiceIndex]!.trim() === candidate.invoiceReference) {
        const link = ledger.invoiceLinks.find(link => link.rowPosition === row.position);
        if (!link) { if (state !== 'conflict') state = 'unavailable'; }
        else if (link.url !== selected.url) state = 'conflict';
      }
    }
  }
  return { linkState: state, invoiceIdentity: selected?.url ?? null, invoiceReference: candidate.invoiceReference,
    bookingDate: state === 'verified' ? candidate.bookingDateCandidate : null, evidenceRefs };
}

/** Read-only bridge: validated exact raw archive + required durable-link port →
 * explicit v2 provisional projection. Missing evidence never falls back to a
 * text candidate/service date. This does not enable ordinary app retrieval. */
export async function projectCapturedFinancialArchive(archiveText: string, selected: FinancialObservationTarget,
  requested: ExpensePeriod, ports: CapturedExpenseProjectionPorts): Promise<UnversionedExpenseProjection> {
  const target = validateFinancialObservationTarget(selected), period = clone(requested), scope = scopeOf(target);
  if (typeof ports.readInvoiceBookingEvidence !== 'function') throw Error('Durable financial link reader unavailable.');
  await ports.gate(clone(target), null);
  const archive = await validateFinancialObservationBackup(archiveText, target, ports.hash);
  const inventory = archive.receipts.map(({ id, sequence, checksum }) => ({ id, sequence, checksum }));
  const gate = () => ports.gate(clone(target), clone(inventory));
  await gate();
  const billed = archive.receipts.filter(receipt => receipt.kind === 'billed-flight');
  const supplied = await ports.readInvoiceBookingEvidence(clone(target), clone(billed));
  await gate();
  if (!Array.isArray(supplied) || supplied.length > billed.length) throw Error('Invalid durable financial evidence inventory.');
  const proofs = new Map<string, DurableInvoiceBookingEvidence>();
  for (const input of supplied) {
    if (new TextEncoder().encode(canonical(input)).length > 1_000_000) throw Error('Financial link evidence exceeds its bound.');
    const receipt = billed.find(receipt => receipt.id === input.billedReceiptId);
    if (!receipt || proofs.has(receipt.id)) throw Error('Unknown or repeated financial evidence binding.');
    proofs.set(receipt.id, checkedProof(input, receipt, target));
  }
  const facts: UnversionedBilledFlightFact[] = [], hashes = new Map<string, string>();
  for (const receipt of billed) {
    const observation = receipt.value as FlightBillingObservation, source = assessBilledFlightSource(observation, target);
    const sourceText = canonical(observation.source);
    let sourceHash = hashes.get(sourceText);
    if (!sourceHash) {
      sourceHash = await ports.hash(sourceText); await gate();
      if (!/^[0-9a-f]{64}$/.test(sourceHash)) throw Error('Financial source integrity calculation unavailable.');
      hashes.set(sourceText, sourceHash);
    }
    const proof = proofs.get(receipt.id), link = proof ? linkFact(proof, receipt, target) : null;
    facts.push({ scope: { ...scope }, sourceFlightRef: observation.source.sourceFlightId, sourceHash, revision: null, supersedes: null,
      invoiceIdentity: link?.invoiceIdentity ?? null, invoiceReference: link?.invoiceReference ?? null,
      linkState: link?.linkState ?? 'unavailable', bookingDate: link?.bookingDate ?? null,
      currency: source.statedTotal.state === 'value' && source.lines.every(line => line.money.state === 'value') ? 'EUR' : null,
      amountMinor: source.reconciliation.state === 'match' && source.statedTotal.state === 'value' ? source.statedTotal.minorUnits : null,
      liability: link?.linkState === 'verified' ? 'own' : 'unknown',
      aircraftRef: ['-', '—'].includes(observation.source.registrationRaw.trim()) ? null : observation.source.registrationRaw.trim(),
      blockingIssues: source.reconciliation.state === 'match' ? [] : [`source-amount-${source.reconciliation.state}`],
      evidenceRefs: [`bill:${receipt.id}`, ...(link?.evidenceRefs ?? [])] });
  }
  const result = projectExpenses({ version: 2, sourceBasis: 'unversioned-billed-flight', scope,
    coverage: { state: 'partial', from: null, through: null, evidenceRefs: [] }, facts }, scope, period);
  await gate();
  return result;
}

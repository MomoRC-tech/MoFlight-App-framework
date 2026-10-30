import { validateFlightBillingObservation, type FlightBillingObservation } from './expense-flight-billing';
import { validateFinancialLedgerObservation, type FinancialLedgerObservation, type FinancialObservationTarget } from './expense-ledger-observation';
import { parseObservedEuro, parseObservedFinancialDate, type ObservedMoney } from './expense-money-observation';

export interface BilledFlightSourceAssessment {
  observation: FlightBillingObservation;
  /** The HTML flight date is a service date. It supplies no booking date. */
  serviceDate: string;
  bookingDate: null;
  lines: { position: number; money: ObservedMoney }[];
  statedTotal: ObservedMoney;
  reconciliation: {
    state: 'match' | 'mismatch' | 'unavailable' | 'overflow';
    lineSumMinor: number | null;
  };
  /** Unresolved source meanings, not inferred ExpenseFacts or permissions. */
  projectionGates: string[];
}

/** Only the explicitly observed EUR suffix is accepted. Bare numbers must not
 * inherit currency from a different page, club, ledger or device locale. */
function billedEuro(raw: string): ObservedMoney {
  const match = /^(.*?)[ \u00a0\u202f]+EUR$/u.exec(raw.trim());
  return match ? parseObservedEuro(match[1], 'EUR') : { state: 'unsupported-currency' };
}

/** Read-only E1 assessment of an already collected observation. Structural
 * validation is not source authentication: callers still need the trusted
 * collector/current-owner and receipt-integrity checks. Matching a source sum
 * proves arithmetic only, never liability, payment, revision or completeness.
 * No ordinary app path or E2 fact factory is activated here. */
export function assessBilledFlightSource(input: unknown, target: FinancialObservationTarget): BilledFlightSourceAssessment {
  const observation = validateFlightBillingObservation(input, target);
  const date = parseObservedFinancialDate(observation.source.dateRaw);
  if (date.state !== 'value') throw new Error('Unsupported billed service date.');
  const lines = observation.source.lines.map(line => ({ position: line.position, money: billedEuro(line.amountRaw) }));
  const statedTotal = billedEuro(observation.source.statedTotalRaw);
  let state: BilledFlightSourceAssessment['reconciliation']['state'] = 'unavailable';
  let lineSumMinor: number | null = null;
  if (lines.every(line => line.money.state === 'value')) {
    const sum = lines.reduce((total, line) => total + BigInt((line.money as Extract<ObservedMoney, { state: 'value' }>).minorUnits), 0n);
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    if (sum < -max || sum > max) state = 'overflow';
    else {
      lineSumMinor = Number(sum);
      if (statedTotal.state === 'value') state = lineSumMinor === statedTotal.minorUnits ? 'match' : 'mismatch';
    }
  }
  const projectionGates = ['financial-authority-unproved', 'own-liability-unproved', 'expense-kind-unproved',
    'charge-identity-unproved', 'source-revision-unproved', 'booking-date-unproved',
    'allowance-relation-unproved', 'period-coverage-unproved'];
  if (state !== 'match') projectionGates.push(`source-amount-${state}`);
  if (lines.some(line => line.money.state === 'value' && line.money.minorUnits < 0) ||
      statedTotal.state === 'value' && statedTotal.minorUnits < 0) projectionGates.push('credit-relation-unproved');
  return { observation, serviceDate: date.date, bookingDate: null, lines, statedTotal,
    reconciliation: { state, lineSumMinor }, projectionGates };
}

export interface InvoiceBookingContributor {
  captureId: string;
  retrievedAt: string;
  sourceAccount: { label: string; selector: string };
  rowPosition: number;
  invoiceRaw: string;
  bookingDateRaw: string;
  bookingDate: string | null;
}

export interface BilledFlightBookingAssessment {
  source: BilledFlightSourceAssessment;
  ledgers: FinancialLedgerObservation[];
  invoiceReference: string | null;
  state: 'corroborated' | 'unavailable' | 'conflict';
  /** Agreement among observed invoice-column matches, not a proved economic
   * relation. Existing v1 ledger observations do not retain invoice URLs/IDs. */
  bookingDateCandidate: string | null;
  contributors: InvoiceBookingContributor[];
  issues: string[];
}

/** Corroborate a date candidate without promoting free text into identity.
 * The observed billed layout prefixes every fee with '<digits> - <text>'.
 * Require one exact reference on every line and exact ledger invoice cells.
 * Validate every scope even when the billed reference is unavailable. Captures
 * remain separate evidence; retrieval order never resolves differing dates.
 * This supplies no ExpenseFact, source revision, payment/allowance allocation
 * or completeness proof, and does not remove any source projection gate. */
export function corroborateBilledFlightBooking(
  input: unknown, ledgerInputs: readonly unknown[], target: FinancialObservationTarget,
): BilledFlightBookingAssessment {
  const source = assessBilledFlightSource(input, target);
  if (!Array.isArray(ledgerInputs) || ledgerInputs.length > 20) throw new Error('Financial relation observation limit exceeded.');
  const ledgers = Array.from(ledgerInputs, value => validateFinancialLedgerObservation(value, target));
  const result: BilledFlightBookingAssessment = { source, ledgers, invoiceReference: null,
    state: 'unavailable', bookingDateCandidate: null, contributors: [], issues: ['invoice-link-identity-unproved'] };
  const references = source.observation.source.lines.map(line => /^(\d{1,20}) - [^\r\n]+$/u.exec(line.descriptionRaw.trim())?.[1] ?? null);
  if (references.some(reference => reference === null)) {
    result.issues.push('invoice-reference-unavailable'); return result;
  }
  if (new Set(references).size !== 1) {
    result.state = 'conflict'; result.issues.push('invoice-reference-conflict'); return result;
  }
  result.invoiceReference = references[0]!;
  if (!ledgers.length) { result.issues.push('ledger-evidence-unavailable'); return result; }
  let missingColumn = false;
  for (const ledger of ledgers) {
    const invoiceIndex = ledger.capture.columns.findIndex(column => column.key === 'invoice');
    const dateIndex = ledger.capture.columns.findIndex(column => column.key === 'date');
    if (invoiceIndex < 0) { missingColumn = true; continue; }
    for (const row of ledger.capture.rows) {
      const invoiceRaw = row.values[invoiceIndex]!;
      if (invoiceRaw.trim() !== result.invoiceReference) continue;
      const bookingDateRaw = row.values[dateIndex]!, parsed = parseObservedFinancialDate(bookingDateRaw);
      result.contributors.push({ captureId: ledger.capture.id, retrievedAt: ledger.capture.retrievedAt,
        sourceAccount: { ...ledger.sourceAccount }, rowPosition: row.position, invoiceRaw, bookingDateRaw,
        bookingDate: parsed.state === 'value' ? parsed.date : null });
    }
  }
  result.contributors.sort((a, b) => {
    const key = (value: InvoiceBookingContributor) => JSON.stringify([value.sourceAccount.selector, value.sourceAccount.label,
      value.captureId, value.retrievedAt, value.rowPosition, value.invoiceRaw, value.bookingDateRaw]);
    const left = key(a), right = key(b); return left < right ? -1 : left > right ? 1 : 0;
  });
  if (missingColumn) result.issues.push('ledger-invoice-column-unavailable');
  if (!result.contributors.length) { result.issues.push('invoice-booking-missing'); return result; }
  const dates = new Set(result.contributors.map(row => row.bookingDate).filter(date => date !== null));
  const invalidDate = result.contributors.some(row => row.bookingDate === null);
  if (invalidDate) result.issues.push('booking-date-unavailable');
  if (dates.size > 1) { result.state = 'conflict'; result.issues.push('booking-date-conflict'); }
  else if (!invalidDate && !missingColumn) {
    result.state = 'corroborated'; result.bookingDateCandidate = [...dates][0]!;
  }
  return result;
}

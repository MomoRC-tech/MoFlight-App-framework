import { validateFlightBillingObservation, type FlightBillingObservation } from './expense-flight-billing';
import type { FinancialObservationTarget } from './expense-ledger-observation';
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

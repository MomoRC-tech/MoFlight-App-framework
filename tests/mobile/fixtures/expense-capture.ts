import { createHash } from 'node:crypto';
import { decodeFlightBillingObservation } from '../../../apps/platform-lab/src/vereinsflieger/expense-flight-billing.ts';
import type { FinancialObservationTarget } from '../../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';

export const financialAt = '2026-10-30T12:00:00.000Z';
export const financialHash = async (text: string) => createHash('sha256').update(text).digest('hex');
export const financialTarget: FinancialObservationTarget = { storeId: '22222222-2222-4222-8222-222222222222', scope: {
  version: 1, owner: '11111111-1111-4111-8111-111111111111', connectionId: '33333333-3333-4333-8333-333333333333',
  context: { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' },
} };
export const financialListUrl = 'https://vereinsflieger.de/member/profile/flightlog.php';
export const financialDetailUrl = 'https://vereinsflieger.de/member/profile/viewflight.php?flid=54321';
export const financialProfile = () => ({ context: structuredClone(financialTarget.scope.context), ownRecipientLabel: 'Example, Alex' });
export function financialRead() {
  return { url: financialDetailUrl, sourceFlightId: '54321', registrationRaw: 'D-TEST', dateRaw: '31.05.2026', billingModeRaw: 'Pilot',
    billedRaw: 'Ja' as const, clubLabel: 'Synthetic club', lines: [
      { position: 0, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Flight fee', amountRaw: '2,40 EUR' },
      { position: 1, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Launch fee', amountRaw: '4,00 EUR' },
    ], statedTotalRaw: '6,40 EUR' };
}
export function financialObservation() {
  return decodeFlightBillingObservation(financialRead(), { ...financialTarget, ownRecipientLabel: 'Example, Alex', observedDetailUrl: financialDetailUrl },
    financialTarget, financialTarget.scope.context, financialTarget.scope.context, financialAt);
}

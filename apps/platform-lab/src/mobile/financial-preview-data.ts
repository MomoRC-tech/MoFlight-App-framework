import type { FinancialAnalysisData } from './financial-analysis-model';
import type { FinancialExpectedOwner } from '../vereinsflieger/expense-analysis-native';
import type { ExpenseScope } from '../expenses/expense-types';

/** Development presentation only: no files, provider, money or model operations. */
export const financialPreviewOwner: FinancialExpectedOwner = { ownerId: 'demo-owner', storeId: 'demo-store', accountRef: 'demo-account' };
export async function readFinancialPreview(expected: FinancialExpectedOwner, current: () => void): Promise<FinancialAnalysisData> {
  current();
  if (expected.ownerId !== financialPreviewOwner.ownerId || expected.storeId !== financialPreviewOwner.storeId || expected.accountRef !== financialPreviewOwner.accountRef) throw Error('Foreign preview selection');
  const scope: ExpenseScope = { ...financialPreviewOwner, connectionId: 'demo-connection', clubContext: 'Erfundener Verein' };
  return { snapshot: { version: 2, sourceBasis: 'unversioned-billed-flight', scope,
    coverage: { state: 'partial', from: null, through: null, evidenceRefs: [] },
    facts: [0, 640, 15300, 9876, 5400, 12000, 8300, 4600, 2350].map((amountMinor, index) => ({
      scope, sourceFlightRef: `demo-flight-${index}`, sourceHash: String(index + 1).padStart(64, '0'), revision: null, supersedes: null,
      invoiceIdentity: `demo-invoice-${index}`, invoiceReference: `demo-${index}`, linkState: 'verified', bookingDate: `2026-${String(index + 2).padStart(2, '0')}-10`,
      currency: 'EUR', amountMinor, liability: 'own', aircraftRef: index % 2 ? 'D-DEMO1' : 'D-DEMO2', blockingIssues: [], evidenceRefs: [`demo-bill-${index}`],
    })) }, evidence: [], receipts: [] };
}

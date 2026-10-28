import type { ExpenseFact, ExpenseScope, ExpenseSnapshot } from '../../../apps/platform-lab/src/expenses/expense-types.ts';

/** Synthetic mapped facts with independent literal expectations. These are not
 * a provider classifier, real source proof, or a financial ownership attestation. */
export const EXPENSE_SCOPE: ExpenseScope = {
  ownerId: 'owner-a', storeId: 'store-a', connectionId: 'connection-a', accountRef: 'provider-a', clubContext: 'Synthetic club',
};
export function expenseFact(patch: Partial<ExpenseFact> = {}): ExpenseFact {
  return { scope: { ...EXPENSE_SCOPE }, accountRef: 'member-account', chargeRef: 'charge-a', revision: 1, supersedes: null,
    role: 'primary', kind: 'flying', bookingDate: '2026-06-15', currency: 'EUR', amountMinor: 10000, coveredMinor: 0,
    liability: 'own', aircraftRef: 'aircraft-a', relatedCharge: null, evidenceRefs: ['capture-a/row-a'], ...patch };
}
export function expenseSnapshot(facts: ExpenseFact[] = [], patch: Partial<ExpenseSnapshot> = {}): ExpenseSnapshot {
  return { version: 1, scope: { ...EXPENSE_SCOPE },
    coverage: { state: 'complete', from: '2026-01-01', through: '2026-12-31', evidenceRefs: ['coverage-proof'] }, facts, ...patch };
}
export const EXPENSE_PROJECTION_CASES = [
  { id: 'exact-cents', facts: [expenseFact({ amountMinor: 10 }), expenseFact({ chargeRef: 'b', amountMinor: 20 })],
    expected: { flying: 30, club: 0, unclassified: 0, usageAndClub: 30, annualOwn: 30 } },
  { id: 'separate-categories', facts: [expenseFact({ amountMinor: 1234 }), expenseFact({ chargeRef: 'b', kind: 'club', amountMinor: 3000 }),
      expenseFact({ chargeRef: 'c', kind: 'unclassified', amountMinor: 500 })],
    expected: { flying: 1234, club: 3000, unclassified: 500, usageAndClub: 4734, annualOwn: 4734 } },
  { id: 'explicit-refund', facts: [expenseFact({ amountMinor: 1234 }), expenseFact({ chargeRef: 'refund', amountMinor: -234,
      relatedCharge: { accountRef: 'member-account', chargeRef: 'charge-a' } })],
    expected: { flying: 1000, club: 0, unclassified: 0, usageAndClub: 1000, annualOwn: 1000 } },
  { id: 'payments-and-balances', facts: [expenseFact({ chargeRef: 'pay', kind: 'payment', amountMinor: 2000 }),
      expenseFact({ chargeRef: 'reverse', kind: 'payment-reversal', amountMinor: -2000 }), expenseFact({ chargeRef: null, kind: 'balance', amountMinor: 9000 }),
      expenseFact({ chargeRef: 'transfer', kind: 'allowance-transfer', amountMinor: 4000 })],
    expected: { flying: 0, club: 0, unclassified: 0, usageAndClub: 0, annualOwn: 0 } },
  { id: 'monthly-gross-annual-reconciliation', facts: [expenseFact({ amountMinor: 10000, coveredMinor: 4000 }),
      expenseFact({ role: 'supporting', amountMinor: 6000, coveredMinor: null, evidenceRefs: ['member-debit/row-a'] }),
      expenseFact({ chargeRef: 'fee', kind: 'allowance-fee', amountMinor: 5000, bookingDate: '2026-01-01' }),
      expenseFact({ accountRef: 'allowance-account', chargeRef: 'fee', kind: 'allowance-transfer', amountMinor: 4000 })],
    expected: { flying: 10000, club: 0, unclassified: 0, usageAndClub: 10000, annualOwn: 11000 } },
] as const;

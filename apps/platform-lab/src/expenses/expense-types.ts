/** Explicitly interpreted financial facts, not raw provider observations.
 * A trusted adapter must prove kinds, economic identity, revision relations,
 * personal liability and allowance links before constructing these inputs. */
export interface ExpenseScope {
  ownerId: string; storeId: string; connectionId: string; accountRef: string; clubContext: string;
}
export type ExpenseKind = 'flying' | 'club' | 'allowance-fee' | 'unclassified' |
  'payment' | 'payment-reversal' | 'allowance-transfer' | 'balance' | 'unknown';
export interface ExpenseFact {
  scope: ExpenseScope;
  /** Chosen authoritative financial account/charge identity, never a bare booking number. */
  accountRef: string; chargeRef: string | null;
  revision: number | null; supersedes: number | null;
  role: 'primary' | 'supporting'; kind: ExpenseKind;
  bookingDate: string | null; currency: string | null;
  /** Signed incurred cost: positive charge, negative explicitly linked credit.
   * Supporting observations and excluded movements do not enter arithmetic. */
  amountMinor: number | null;
  /** Signed, explicitly matched covered share; null means unknown, not zero. */
  coveredMinor: number | null;
  liability: 'own' | 'unknown'; aircraftRef: string | null;
  relatedCharge: { accountRef: string; chargeRef: string } | null;
  evidenceRefs: string[];
}
export interface ExpenseSnapshot {
  version: 1; scope: ExpenseScope;
  coverage: { state: 'unavailable' | 'partial' | 'complete'; from: string | null; through: string | null; evidenceRefs: string[] };
  facts: ExpenseFact[];
}
export type ExpensePeriod = { mode: 'month'; year: number; month: number } |
  { mode: 'year'; year: number } | { mode: 'custom'; from: string; through: string };
export interface ExpenseMoney { knownMinor: number | null; totalMinor: number | null }
export interface ExpenseContribution {
  accountRef: string; chargeRef: string; revision: number; kind: ExpenseKind;
  bookingDate: string; amountMinor: number; coveredMinor: number | null; aircraftRef: string | null;
  relatedCharge: { accountRef: string; chargeRef: string } | null;
  evidenceRefs: string[]; supersededEvidenceRefs: string[];
}
export interface ExpenseIssue { code: string; evidenceRefs: string[] }
export interface ExpenseProjection {
  period: { mode: ExpensePeriod['mode']; from: string; through: string };
  dateBasis: 'booking-date'; currency: 'EUR'; state: 'unavailable' | 'partial' | 'complete' | 'conflict';
  flying: ExpenseMoney; club: ExpenseMoney; unclassified: ExpenseMoney;
  /** Full billed flying + club/unclassified charges; never labelled cash paid. */
  usageAndClub: ExpenseMoney;
  /** Present only for an explicit annual view; never spread over months. */
  annual: null | { allowanceFee: ExpenseMoney; covered: ExpenseMoney; extraFlying: ExpenseMoney; overallOwn: ExpenseMoney };
  aircraft: { aircraftRef: string | null; amount: ExpenseMoney; chargeKeys: string[] }[];
  contributions: ExpenseContribution[];
  excluded: { reason: string; evidenceRefs: string[] }[];
  issues: ExpenseIssue[];
}

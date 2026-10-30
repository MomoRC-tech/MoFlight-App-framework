import assert from 'node:assert/strict';
import test from 'node:test';
import { projectExpenses } from '../../apps/platform-lab/src/expenses/expense-projection.ts';
import type { UnversionedBilledFlightFact, UnversionedExpenseSnapshot } from '../../apps/platform-lab/src/expenses/expense-types.ts';
import { EXPENSE_SCOPE, expenseFact, expenseSnapshot } from './fixtures/expense-projection-cases.ts';

const month = { mode: 'month', year: 2026, month: 6 } as const;
function fact(patch: Partial<UnversionedBilledFlightFact> = {}): UnversionedBilledFlightFact {
  return { scope: { ...EXPENSE_SCOPE }, sourceFlightRef: 'flight-a', sourceHash: 'a'.repeat(64), revision: null, supersedes: null,
    invoiceIdentity: 'invoice-source-a', invoiceReference: '500000001', linkState: 'verified', bookingDate: '2026-06-01',
    currency: 'EUR', amountMinor: 10000, liability: 'own', aircraftRef: 'aircraft-a', blockingIssues: [], evidenceRefs: ['receipt-a', 'invoice-a', 'ledger-a/row-0'], ...patch };
}
function snapshot(facts: UnversionedBilledFlightFact[] = [fact()]): UnversionedExpenseSnapshot {
  return { version: 2, sourceBasis: 'unversioned-billed-flight', scope: { ...EXPENSE_SCOPE },
    coverage: { state: 'partial', from: null, through: null, evidenceRefs: ['archive-a'] }, facts };
}
const run = (facts = [fact()]) => projectExpenses(snapshot(facts), EXPENSE_SCOPE, month);

test('v2 permits full captured billed price with null revision and unknown totals/allowance', () => {
  const result = run();
  assert.equal(result.sourceBasis, 'unversioned-billed-flight'); assert.equal(result.state, 'partial');
  assert.deepEqual(result.flying, { knownMinor: 10000, totalMinor: null });
  assert.equal(result.contributions[0]!.revision, null);
  assert.equal(result.contributions[0]!.coveredMinor, null);
  assert.deepEqual(result.contributions[0]!.supersededEvidenceRefs, []);
  for (const money of [result.club, result.unclassified, result.usageAndClub]) assert.deepEqual(money, { knownMinor: null, totalMinor: null });
  assert.equal(result.annual, null);
  const year = projectExpenses(snapshot(), EXPENSE_SCOPE, { mode: 'year', year: 2026 });
  assert.equal(year.flying.knownMinor, 10000);
  for (const money of Object.values(year.annual!)) assert.deepEqual(money, { knownMinor: null, totalMinor: null });
});

test('identical billed variants merge contributors once without counting invoice or ledger amounts', () => {
  const result = run([fact(), fact({ evidenceRefs: ['receipt-b', 'member-debit-60', 'allowance-debit-40'] })]);
  assert.equal(result.flying.knownMinor, 10000); assert.equal(result.contributions.length, 1);
  assert.deepEqual(result.contributions[0]!.evidenceRefs, ['allowance-debit-40', 'invoice-a', 'ledger-a/row-0', 'member-debit-60', 'receipt-a', 'receipt-b']);
});

for (const [name, patch] of Object.entries({
  'raw source': { sourceHash: 'b'.repeat(64) }, amount: { amountMinor: 9000 }, date: { bookingDate: '2026-07-01' },
  invoice: { invoiceIdentity: 'invoice-source-b' }, reference: { invoiceReference: '500000002' },
  aircraft: { aircraftRef: 'aircraft-b' }, currency: { currency: 'USD' }, liability: { liability: 'unknown' },
} as Record<string, Partial<UnversionedBilledFlightFact>>)) {
  test(`changed ${name} blocks the affected captured subtotal without a latest winner`, () => {
    const facts = [fact(), fact({ ...patch, evidenceRefs: ['newer-receipt'] })];
    const result = run(facts), reverse = run([...facts].reverse());
    assert.equal(result.state, 'conflict'); assert.equal(result.flying.knownMinor, null);
    assert.equal(result.contributions.length, 0); assert.deepEqual(result, reverse);
    assert.ok(result.issues.some(issue => issue.code === 'source-variant-conflict' && issue.evidenceRefs.includes('newer-receipt')));
  });
}

test('a conflict blocks the period/affected aircraft subtotal while unrelated aircraft retain captured evidence', () => {
  const result = run([fact(), fact({ sourceHash: 'b'.repeat(64) }), fact({ sourceFlightRef: 'flight-b', aircraftRef: 'aircraft-b', amountMinor: 3000 })]);
  assert.equal(result.flying.knownMinor, null);
  assert.equal(result.aircraft.find(group => group.aircraftRef === 'aircraft-a')!.amount.knownMinor, null);
  assert.equal(result.aircraft.find(group => group.aircraftRef === 'aircraft-b')!.amount.knownMinor, 3000);
  assert.equal(result.contributions.length, 1);
});

for (const [name, patch, reason] of [
  ['missing link', { linkState: 'unavailable' }, 'invoice-link-unavailable'],
  ['conflicting link', { linkState: 'conflict' }, 'invoice-link-conflict'],
  ['missing invoice ID', { invoiceIdentity: null }, 'invoice-link-unavailable'],
  ['missing invoice reference', { invoiceReference: null }, 'invoice-link-unavailable'],
  ['missing booking date', { bookingDate: null }, 'date-unavailable'],
  ['invalid booking date', { bookingDate: '2026-02-30' }, 'date-unavailable'],
  ['unknown currency', { currency: null }, 'currency-unavailable'],
  ['foreign currency', { currency: 'USD' }, 'unsupported-currency'],
  ['unknown liability', { liability: 'unknown' }, 'liability-unavailable'],
  ['missing amount', { amountMinor: null }, 'amount-unavailable'],
  ['unsafe amount', { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, 'amount-unavailable'],
  ['nonfinite amount', { amountMinor: NaN }, 'amount-unavailable'],
  ['negative adjustment', { amountMinor: -200 }, 'credit-relation-unproved'],
  ['source mismatch', { blockingIssues: ['source-amount-mismatch'] }, 'source-amount-mismatch'],
] as [string, Partial<UnversionedBilledFlightFact>, string][]) {
  test(`${name} cannot become a known zero or use a fallback`, () => {
    const result = run([fact(patch)]);
    assert.deepEqual(result.flying, { knownMinor: null, totalMinor: null }); assert.equal(result.contributions.length, 0);
    assert.ok(result.issues.some(issue => issue.code === reason));
  });
}

test('an explicitly evidenced free billed flight can have a zero captured subtotal, never a complete period', () => {
  assert.deepEqual(run([fact({ amountMinor: 0 })]).flying, { knownMinor: 0, totalMinor: null });
  assert.deepEqual(run([]).flying, { knownMinor: null, totalMinor: null });
  const missing = snapshot([]); missing.coverage.state = 'unavailable';
  assert.equal(projectExpenses(missing, EXPENSE_SCOPE, month).state, 'unavailable');
});

test('history over the existing 20-observation bound is unavailable, not a partial consistency claim', () => {
  assert.equal(run(Array.from({ length: 20 }, () => fact())).flying.knownMinor, 10000);
  const result = run(Array.from({ length: 21 }, () => fact()));
  assert.equal(result.flying.knownMinor, null); assert.ok(result.issues.some(issue => issue.code === 'history-limit'));
});

test('booking boundaries are inclusive, with no known-zero claim for an unobserved period', () => {
  for (const date of ['2026-06-01', '2026-06-30']) assert.equal(run([fact({ bookingDate: date })]).flying.knownMinor, 10000);
  for (const date of ['2026-05-31', '2026-07-01']) {
    const result = run([fact({ bookingDate: date })]); assert.equal(result.flying.knownMinor, null); assert.equal(result.state, 'unavailable');
  }
});

test('wide exact addition and bounded output do not round overflowing captured totals', () => {
  assert.equal(run([fact({ amountMinor: 10 }), fact({ sourceFlightRef: 'b', amountMinor: 20 })]).flying.knownMinor, 30);
  const result = run([fact({ amountMinor: Number.MAX_SAFE_INTEGER }), fact({ sourceFlightRef: 'b', amountMinor: 1 })]);
  assert.equal(result.flying.knownMinor, null); assert.ok(result.issues.some(issue => issue.code === 'overflow'));
});

for (const field of ['ownerId', 'storeId', 'connectionId', 'accountRef', 'clubContext'] as const) {
  test(`foreign ${field} cannot enter either v2 snapshot or fact`, () => {
    const value = snapshot(); value.facts[0]!.scope[field] = 'foreign';
    assert.throws(() => projectExpenses(value, EXPENSE_SCOPE, month));
    const other = snapshot(); other.scope[field] = 'foreign'; assert.throws(() => projectExpenses(other, EXPENSE_SCOPE, month));
  });
}

test('v1 retains strict revision behavior and cannot be silently reinterpreted as v2', () => {
  const old = expenseSnapshot([expenseFact({ revision: null })]);
  assert.equal(projectExpenses(old, EXPENSE_SCOPE, month).flying.totalMinor, null);
  assert.ok(projectExpenses(old, EXPENSE_SCOPE, month).issues.some(issue => issue.code === 'revision-unproved'));
  assert.throws(() => projectExpenses({ ...old, version: 2 } as never, EXPENSE_SCOPE, month));
  assert.equal(projectExpenses(expenseSnapshot([expenseFact()]), EXPENSE_SCOPE, month).flying.totalMinor, 10000);
});

test('v2 refuses complete coverage, fabricated revisions, supersession and unrelated expense-kind fields', () => {
  for (const mutate of [
    (value: UnversionedExpenseSnapshot) => { (value.coverage as { state: string }).state = 'complete'; },
    (value: UnversionedExpenseSnapshot) => { (value.facts[0] as unknown as { revision: number }).revision = 1; },
    (value: UnversionedExpenseSnapshot) => { (value.facts[0] as unknown as { supersedes: number }).supersedes = 1; },
    (value: UnversionedExpenseSnapshot) => { Object.assign(value.facts[0]!, { kind: 'club' }); },
    (value: UnversionedExpenseSnapshot) => { value.facts[0]!.sourceHash = 'not-a-hash'; },
  ]) { const value = snapshot(); mutate(value); assert.throws(() => projectExpenses(value, EXPENSE_SCOPE, month)); }
});

test('v2 preserves detached contributors/scope and is independent of fact ordering', () => {
  const value = snapshot([fact(), fact({ sourceFlightRef: 'b', evidenceRefs: ['b'] })]), original = structuredClone(value);
  const result = projectExpenses(value, EXPENSE_SCOPE, month);
  assert.deepEqual(result, projectExpenses({ ...value, facts: [...value.facts].reverse() }, EXPENSE_SCOPE, month));
  result.contributions[0]!.evidenceRefs.push('changed'); assert.deepEqual(value, original);
});

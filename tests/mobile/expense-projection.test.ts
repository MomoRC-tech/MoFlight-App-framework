import assert from 'node:assert/strict';
import test from 'node:test';
import { projectExpenses } from '../../apps/platform-lab/src/expenses/expense-projection.ts';
import type { ExpenseFact, ExpenseScope, ExpenseSnapshot } from '../../apps/platform-lab/src/expenses/expense-types.ts';
import { EXPENSE_PROJECTION_CASES, EXPENSE_SCOPE, expenseFact, expenseSnapshot } from './fixtures/expense-projection-cases.ts';

const month = { mode: 'month', year: 2026, month: 6 } as const;
const year = { mode: 'year', year: 2026 } as const;
const run = (facts: ExpenseFact[]) => projectExpenses(expenseSnapshot(facts), EXPENSE_SCOPE, year);

for (const c of EXPENSE_PROJECTION_CASES) test(`frozen E2 oracle: ${c.id}`, () => {
  const monthly = projectExpenses(expenseSnapshot([...c.facts]), EXPENSE_SCOPE, month), annual = run([...c.facts]);
  for (const result of [monthly, annual]) {
    assert.equal(result.state, 'complete'); assert.deepEqual(result.issues, []);
    assert.equal(result.flying.totalMinor, c.expected.flying); assert.equal(result.club.totalMinor, c.expected.club);
    assert.equal(result.unclassified.totalMinor, c.expected.unclassified); assert.equal(result.usageAndClub.totalMinor, c.expected.usageAndClub);
    assert.equal(result.dateBasis, 'booking-date'); assert.equal(result.currency, 'EUR');
  }
  assert.equal(monthly.annual, null); assert.equal(annual.annual!.overallOwn.totalMinor, c.expected.annualOwn);
});

test('selected monthly price is independent of allowance fee and settlement month', () => {
  const facts = [expenseFact({ coveredMinor: 4000 }), expenseFact({ chargeRef: 'fee', kind: 'allowance-fee', amountMinor: 5000, bookingDate: '2026-01-01' })];
  const first = projectExpenses(expenseSnapshot(facts), EXPENSE_SCOPE, month);
  facts[1]!.bookingDate = '2026-06-01'; facts[1]!.amountMinor = 7000;
  const second = projectExpenses(expenseSnapshot(facts), EXPENSE_SCOPE, month);
  assert.equal(first.flying.totalMinor, 10000); assert.equal(second.flying.totalMinor, 10000);
  assert.equal(second.usageAndClub.totalMinor, 10000); assert.equal(second.annual, null);
  assert.equal(run(facts).annual!.allowanceFee.totalMinor, 7000);
  assert.equal(run(facts).annual!.covered.totalMinor, 4000); assert.equal(run(facts).annual!.extraFlying.totalMinor, 6000);
  assert.equal(run(facts).annual!.overallOwn.totalMinor, 13000);
});

test('flight/invoice/ledger evidence for one proved economic charge contributes once', () => {
  const value = run(['flight', 'invoice', 'ledger'].map(ref => expenseFact({ amountMinor: 1234, evidenceRefs: [ref] })));
  assert.equal(value.flying.totalMinor, 1234); assert.equal(value.contributions.length, 1);
  assert.deepEqual(value.contributions[0]!.evidenceRefs, ['flight', 'invoice', 'ledger']);
});

test('a supporting partial debit cannot add to full usage or override its authority', () => {
  const value = run([expenseFact({ coveredMinor: 4000 }), expenseFact({ role: 'supporting', revision: null, amountMinor: 6000,
    coveredMinor: null, evidenceRefs: ['member-account-part'] })]);
  assert.equal(value.flying.totalMinor, 10000); assert.equal(value.annual!.extraFlying.totalMinor, 6000);
  assert.equal(value.contributions.length, 1); assert.deepEqual(value.contributions[0]!.evidenceRefs, ['capture-a/row-a', 'member-account-part']);
  const missing = run([expenseFact({ role: 'supporting' })]);
  assert.equal(missing.flying.totalMinor, null); assert.equal(missing.issues[0]!.code, 'missing-authority');
});

test('proved superseding revision replaces prior cost, retaining exact evidence', () => {
  const value = run([expenseFact({ amountMinor: 1234, evidenceRefs: ['old'] }),
    expenseFact({ revision: 2, supersedes: 1, amountMinor: 1000, evidenceRefs: ['new'] })]);
  assert.equal(value.flying.totalMinor, 1000); assert.equal(value.contributions[0]!.revision, 2);
  assert.deepEqual(value.contributions[0]!.evidenceRefs, ['new']); assert.deepEqual(value.contributions[0]!.supersededEvidenceRefs, ['old']);
});

test('input order is never a revision proof; conflicts cannot select the last observation', () => {
  for (const facts of [
    [expenseFact(), expenseFact({ amountMinor: 9000 })],
    [expenseFact(), expenseFact({ revision: 2, supersedes: null, amountMinor: 9000 })],
    [expenseFact(), expenseFact({ revision: 3, supersedes: 2, amountMinor: 9000 })],
  ]) {
    const a = run(facts), b = run([...facts].reverse());
    assert.deepEqual(a, b); assert.equal(a.state, 'conflict'); assert.equal(a.flying.totalMinor, null);
    assert.equal(a.contributions.length, 0);
  }
});

test('revision chains resolve before date filtering, so moved charges do not linger in an old year', () => {
  const value = run([expenseFact(), expenseFact({ revision: 2, supersedes: 1, bookingDate: '2027-01-01' })]);
  assert.equal(value.state, 'complete'); assert.equal(value.flying.totalMinor, 0);
  const branch = run([expenseFact(), expenseFact({ revision: 2, supersedes: 1 }), expenseFact({ revision: 3, supersedes: 1 })]);
  assert.equal(branch.state, 'conflict'); assert.equal(branch.flying.totalMinor, null);
});

test('same booking-like charge reference in two financial accounts is not global identity', () => {
  const value = run([expenseFact({ amountMinor: 1200 }), expenseFact({ accountRef: 'other-own-account', amountMinor: 800 })]);
  assert.equal(value.flying.totalMinor, 2000); assert.equal(value.contributions.length, 2);
  const transfer = run([expenseFact({ kind: 'allowance-fee', amountMinor: 5000 }),
    expenseFact({ accountRef: 'allowance-account', kind: 'allowance-transfer', amountMinor: 4000 })]);
  assert.equal(transfer.flying.totalMinor, 0); assert.equal(transfer.annual!.overallOwn.totalMinor, 5000);
});

test('unknown aircraft remains unallocated even with the same booking date', () => {
  const value = run([expenseFact({ amountMinor: 1234 }), expenseFact({ chargeRef: 'b', amountMinor: 456, aircraftRef: null })]);
  assert.equal(value.flying.totalMinor, 1690);
  assert.deepEqual(value.aircraft.map(a => [a.aircraftRef, a.amount.totalMinor]), [['aircraft-a', 1234], [null, 456]]);
  assert.equal(value.aircraft.flatMap(a => a.chargeKeys).length, value.contributions.length);
});

test('inclusive booking-date periods and linked next-year credits do not rewrite original periods', () => {
  const facts = [expenseFact({ bookingDate: '2025-12-31', amountMinor: 1234 }), expenseFact({ chargeRef: 'refund',
    bookingDate: '2026-01-01', amountMinor: -234, relatedCharge: { accountRef: 'member-account', chargeRef: 'charge-a' } })];
  const snapshot = expenseSnapshot(facts); snapshot.coverage.from = '2025-01-01';
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'year', year: 2025 }).flying.totalMinor, 1234);
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'custom', from: '2026-01-01', through: '2026-01-01' }).flying.totalMinor, -234);
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, year).flying.totalMinor, -234);
  const customYear = projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'custom', from: '2026-01-01', through: '2026-12-31' });
  assert.equal(customYear.annual, null);
});

test('unlinked negative movements cannot masquerade as expense refunds', () => {
  const value = run([expenseFact({ amountMinor: -234 })]);
  assert.equal(value.flying.totalMinor, null); assert.equal(value.issues[0]!.code, 'unlinked-credit');
});

test('explicit covered refunds reverse only their matched allowance share', () => {
  const value = run([expenseFact({ coveredMinor: 4000 }), expenseFact({ chargeRef: 'refund', amountMinor: -200, coveredMinor: -100,
    relatedCharge: { accountRef: 'member-account', chargeRef: 'charge-a' } })]);
  assert.equal(value.flying.totalMinor, 9800); assert.equal(value.annual!.covered.totalMinor, 3900);
  assert.equal(value.annual!.extraFlying.totalMinor, 5900); assert.equal(value.annual!.overallOwn.totalMinor, 5900);
});

test('a proved zero-priced charge remains an exact contributor rather than missing data', () => {
  const value = run([expenseFact({ amountMinor: 0 })]);
  assert.equal(value.state, 'complete'); assert.equal(value.flying.totalMinor, 0);
  assert.equal(value.contributions.length, 1); assert.equal(value.contributions[0]!.amountMinor, 0);
});

test('opening/running balances and payments are excluded even with missing amounts or identities', () => {
  const value = run(['balance', 'payment', 'payment-reversal', 'allowance-transfer'].map((kind, i) =>
    expenseFact({ kind: kind as ExpenseFact['kind'], chargeRef: i === 0 ? null : String(i), amountMinor: null, bookingDate: null })));
  assert.equal(value.state, 'complete'); assert.equal(value.flying.totalMinor, 0); assert.equal(value.annual!.overallOwn.totalMinor, 0);
});

const unresolved: readonly [string, Partial<ExpenseFact>, string][] = [
  ['missing amount', { amountMinor: null }, 'amount-unavailable'],
  ['fractional cents', { amountMinor: 0.1 }, 'amount-unavailable'],
  ['unsafe individual amount', { amountMinor: Number.MAX_SAFE_INTEGER + 1 }, 'amount-unavailable'],
  ['unknown date', { bookingDate: null }, 'date-unavailable'],
  ['invalid calendar date', { bookingDate: '2026-02-29' }, 'date-unavailable'],
  ['unknown currency', { currency: null }, 'currency-unavailable'],
  ['USD', { currency: 'USD' }, 'unsupported-currency'],
  ['unknown liability', { liability: 'unknown' }, 'liability-unavailable'],
  ['unknown kind', { kind: 'unknown' }, 'kind-unavailable'],
  ['unknown identity', { chargeRef: null }, 'identity-unproved'],
  ['unproved revision', { revision: null }, 'revision-unproved'],
];
for (const [name, patch, code] of unresolved) test(`${name} preserves the known subtotal without inventing a period total`, () => {
  const value = run([expenseFact({ amountMinor: 100 }), expenseFact({ chargeRef: 'b', ...patch })]);
  assert.equal(value.state, 'partial'); assert.equal(value.flying.knownMinor, 100); assert.equal(value.flying.totalMinor, null);
  assert.ok(value.issues.some(i => i.code === code));
});

test('absent source, partial empty evidence and proved complete empty period remain distinct', () => {
  for (const state of ['unavailable', 'partial', 'complete'] as const) {
    const snapshot = expenseSnapshot(); snapshot.coverage.state = state;
    if (state !== 'complete') { snapshot.coverage.from = null; snapshot.coverage.through = null; snapshot.coverage.evidenceRefs = []; }
    const value = projectExpenses(snapshot, EXPENSE_SCOPE, month);
    assert.equal(value.state, state); assert.equal(value.flying.totalMinor, state === 'complete' ? 0 : null);
  }
});

test('saved partial subtotal is readable but a requested whole-year total stays unavailable', () => {
  const snapshot = expenseSnapshot([expenseFact({ amountMinor: 1234 })]);
  snapshot.coverage.through = '2026-06-30';
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, month).flying.totalMinor, 1234);
  const annual = projectExpenses(snapshot, EXPENSE_SCOPE, year);
  assert.equal(annual.flying.knownMinor, 1234); assert.equal(annual.flying.totalMinor, null); assert.equal(annual.state, 'partial');
  snapshot.coverage.state = 'partial';
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, month).flying.totalMinor, null);
});

test('unknown or inconsistent allowance settlement does not reduce or block the proved monthly price', () => {
  for (const coveredMinor of [null, -1, 10001, 0.5]) {
    const snapshot = expenseSnapshot([expenseFact({ coveredMinor })]);
    const monthly = projectExpenses(snapshot, EXPENSE_SCOPE, month), annual = projectExpenses(snapshot, EXPENSE_SCOPE, year);
    assert.equal(monthly.state, 'complete'); assert.equal(monthly.flying.totalMinor, 10000); assert.equal(monthly.annual, null);
    assert.equal(annual.flying.totalMinor, 10000); assert.equal(annual.annual!.overallOwn.totalMinor, null);
    assert.equal(annual.state, 'partial'); assert.ok(annual.issues.some(i => i.code === 'allowance-coverage-unavailable'));
  }
});

test('unavailable annual-fee amount does not contaminate month comparisons', () => {
  const snapshot = expenseSnapshot([expenseFact(), expenseFact({ chargeRef: 'fee', kind: 'allowance-fee', amountMinor: null })]);
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, month).flying.totalMinor, 10000);
  assert.equal(projectExpenses(snapshot, EXPENSE_SCOPE, year).annual!.overallOwn.totalMinor, null);
});

test('conflicting allowance settlement leaves the identical proved monthly flight price intact', () => {
  const facts = [expenseFact({ coveredMinor: 4000, evidenceRefs: ['first'] }), expenseFact({ coveredMinor: 2000, evidenceRefs: ['second'] })];
  const monthly = projectExpenses(expenseSnapshot(facts), EXPENSE_SCOPE, month), annual = run(facts);
  assert.equal(monthly.state, 'complete'); assert.equal(monthly.flying.totalMinor, 10000); assert.equal(monthly.contributions.length, 1);
  assert.equal(monthly.contributions[0]!.coveredMinor, null);
  assert.equal(annual.flying.totalMinor, 10000); assert.equal(annual.annual!.overallOwn.totalMinor, null);
  assert.ok(annual.issues.some(i => i.code === 'allowance-coverage-conflict'));
  assert.deepEqual(annual, run([...facts].reverse()));
});

test('safe input amounts cannot produce rounded, clamped or overflowing totals', () => {
  const value = run([expenseFact({ amountMinor: Number.MAX_SAFE_INTEGER }), expenseFact({ chargeRef: 'b', amountMinor: 1 })]);
  assert.equal(value.flying.knownMinor, null); assert.equal(value.flying.totalMinor, null);
  assert.equal(value.annual!.overallOwn.totalMinor, null); assert.ok(value.issues.some(i => i.code === 'overflow'));
  const exact = run([expenseFact({ amountMinor: Number.MAX_SAFE_INTEGER }), expenseFact({ chargeRef: 'b', amountMinor: 1 }),
    expenseFact({ chargeRef: 'refund', amountMinor: -1, relatedCharge: { accountRef: 'member-account', chargeRef: 'b' } })]);
  assert.equal(exact.flying.totalMinor, Number.MAX_SAFE_INTEGER, 'BigInt preserves exact cancellation before safe output conversion');
});

for (const field of ['ownerId', 'storeId', 'connectionId', 'accountRef', 'clubContext'] as const) test(`reject foreign/late ${field} and preserve original evidence`, () => {
  const snapshot = expenseSnapshot([expenseFact()]), before = JSON.stringify(snapshot);
  const switched: ExpenseScope = { ...EXPENSE_SCOPE, [field]: 'other' };
  assert.throws(() => projectExpenses(snapshot, switched, month)); assert.equal(JSON.stringify(snapshot), before);
  snapshot.facts[0]!.scope[field] = 'forged';
  assert.throws(() => projectExpenses(snapshot, EXPENSE_SCOPE, month));
});

test('projection is detached and invariant under record/evidence/object-key order', () => {
  const input = expenseSnapshot([expenseFact({ evidenceRefs: ['z', 'a'] }), expenseFact({ evidenceRefs: ['a', 'z'] }),
    expenseFact({ chargeRef: 'refund', amountMinor: -100, relatedCharge: { accountRef: 'member-account', chargeRef: 'charge-a' }, evidenceRefs: ['refund'] })]);
  const before = JSON.stringify(input), projected = projectExpenses(input, EXPENSE_SCOPE, year);
  assert.equal(JSON.stringify(input), before);
  const reversed = structuredClone(input); reversed.facts.reverse(); reversed.facts.forEach(f => f.evidenceRefs.reverse());
  const reordered = expenseFact({ chargeRef: 'refund', amountMinor: -100, relatedCharge: { chargeRef: 'charge-a', accountRef: 'member-account' }, evidenceRefs: ['refund-2'] });
  reversed.facts.push(reordered); input.facts.push(structuredClone(reordered));
  assert.deepEqual(projectExpenses(input, EXPENSE_SCOPE, year), projectExpenses(reversed, EXPENSE_SCOPE, year));
  input.facts[0]!.evidenceRefs.push('later'); input.facts[0]!.amountMinor = 1;
  assert.equal(projected.contributions[0]!.amountMinor, 10000); assert.deepEqual(projected.contributions[0]!.evidenceRefs, ['a', 'z']);
});

test('annual reconciliation equals its exact charge contributors and months preserve full usage', () => {
  const facts = EXPENSE_PROJECTION_CASES.find(c => c.id === 'monthly-gross-annual-reconciliation')!.facts;
  const snapshot = expenseSnapshot([...facts]), annual = projectExpenses(snapshot, EXPENSE_SCOPE, year);
  const monthly = Array.from({ length: 12 }, (_, i) => projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'month', year: 2026, month: i + 1 }));
  assert.equal(monthly.reduce((sum, m) => sum + m.flying.totalMinor!, 0), annual.flying.totalMinor);
  assert.equal(annual.flying.totalMinor! + annual.annual!.allowanceFee.totalMinor! - annual.annual!.covered.totalMinor!, annual.annual!.overallOwn.totalMinor);
  assert.deepEqual(annual.contributions.map(c => c.chargeRef).sort(), ['charge-a', 'fee']);
});

test('boundaries reject malformed snapshots, unknown fields and invalid request periods', () => {
  const snapshot = expenseSnapshot([expenseFact()]);
  const extra = { ...snapshot, trustedByClient: true };
  assert.throws(() => projectExpenses(extra, EXPENSE_SCOPE, month));
  const many = expenseSnapshot(Array.from({ length: 10001 }, () => expenseFact()));
  assert.throws(() => projectExpenses(many, EXPENSE_SCOPE, month));
  const unavailable = expenseSnapshot([expenseFact()]); unavailable.coverage.state = 'unavailable';
  assert.throws(() => projectExpenses(unavailable, EXPENSE_SCOPE, month));
  const noEvidence = expenseSnapshot(); noEvidence.coverage.evidenceRefs = [];
  assert.throws(() => projectExpenses(noEvidence, EXPENSE_SCOPE, month));
  assert.throws(() => projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'month', year: 2026, month: 13 }));
  assert.throws(() => projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'custom', from: '2026-02-29', through: '2026-03-01' }));
  assert.throws(() => projectExpenses(snapshot, EXPENSE_SCOPE, { mode: 'custom', from: '2026-03-01', through: '2026-02-01' }));
  const foreignVersion = { ...snapshot, version: 2 } as unknown as ExpenseSnapshot;
  assert.throws(() => projectExpenses(foreignVersion, EXPENSE_SCOPE, month));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { financialObservationAccountKey, validateFinancialLedgerObservation, type FinancialLedgerObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const scope: ProviderScope = { version: 1, owner: 'owner-a', connectionId: 'connection-a',
  context: { accountNumber: '10001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const storeId = '11111111-1111-4111-8111-111111111111';
const target = { storeId, scope };
function observation(selector = '101', accountLabel = 'Mitgliedskonto'): FinancialLedgerObservation {
  const url = `https://vereinsflieger.de/member/profile/account.php?caid=${selector}`;
  return { version: 1, storeId, scope: structuredClone(scope), contextBefore: structuredClone(scope.context), contextAfter: structuredClone(scope.context),
    sourceAccount: { label: accountLabel, selector }, ownNavigation: { label: accountLabel, url }, pageAccountLabel: accountLabel, sourceUrl: url,
    capture: { version: 1, id: 'capture-a', retrievedAt: '2026-10-28T16:00:00.000Z', owner: scope.owner, connectionId: scope.connectionId,
      sourceIdentity: 'provisional-observed-profile', category: 'ledger', path: '/member/profile/account.php',
      columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'booking', label: 'BuchungsNr.', index: 1 },
        { key: 'invoice', label: 'Abrechnung', index: 2 }, { key: 'information', label: 'Informationen', index: 3 },
        { key: 'value', label: 'Wert (EUR)', index: 4 }, { key: 'balance', label: 'Saldo (EUR)', index: 5 }],
      rows: [{ position: 0, values: ['01.06.2026', 'booking-1', 'invoice-1', 'Synthetic raw posting', '-100,00', '-100,00'] }],
      filters: ['Jahr 2026'], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } },
    reportedRowCount: 1 };
}

test('same booking in two own accounts remains in separate observed namespaces', () => {
  const member = observation(), allowance = observation('202', 'Flugbetriebspauschale');
  allowance.capture.rows[0]!.values[4] = '40,00'; allowance.capture.rows[0]!.values[5] = '40,00';
  assert.notEqual(financialObservationAccountKey(member, target), financialObservationAccountKey(allowance, target));
  assert.equal(member.capture.rows[0]!.values[1], allowance.capture.rows[0]!.values[1]);
  assert.deepEqual(validateFinancialLedgerObservation(allowance, target).capture.rows[0]!.values, allowance.capture.rows[0]!.values);
});

test('raw observations survive exact JSON round-trip without kind or complete-period inference', () => {
  const input = observation();
  const decoded = validateFinancialLedgerObservation(JSON.parse(JSON.stringify(input)), target);
  assert.deepEqual(decoded, input);
  assert.deepEqual(decoded.capture.coverage, { kind: 'visible-page', truncated: false, pagination: 'unverified' });
  const unavailableCount = observation(); unavailableCount.reportedRowCount = null;
  assert.equal(validateFinancialLedgerObservation(unavailableCount, target).reportedRowCount, null);
});

test('decoded observations do not share mutable raw rows or context with caller input', () => {
  const input = observation(), decoded = validateFinancialLedgerObservation(input, target);
  input.capture.rows[0]!.values[4] = '999,00'; input.scope.context.clubLabel = 'Changed';
  assert.equal(decoded.capture.rows[0]!.values[4], '-100,00'); assert.equal(decoded.scope.context.clubLabel, 'Synthetic club');
});

const mutations: readonly [string, (value: FinancialLedgerObservation) => void][] = [
  ['owner', v => { v.scope.owner = 'owner-b'; }],
  ['store', v => { v.storeId = '22222222-2222-4222-8222-222222222222'; }],
  ['connection', v => { v.scope.connectionId = 'connection-b'; }],
  ['provider account', v => { v.scope.context.accountNumber = '10002'; }],
  ['club context', v => { v.scope.context.clubLabel = 'Another club'; }],
  ['before context', v => { v.contextBefore.accountNumber = '10002'; }],
  ['after context', v => { v.contextAfter.clubLabel = 'Another club'; }],
  ['navigation account', v => { v.ownNavigation.url = v.ownNavigation.url.replace('101', '202'); }],
  ['selected account', v => { v.sourceUrl = v.sourceUrl.replace('101', '202'); }],
  ['page heading', v => { v.pageAccountLabel = 'Flugbetriebspauschale'; }],
  ['navigation label', v => { v.ownNavigation.label = 'Other account'; }],
  ['foreign capture', v => { v.capture.owner = 'owner-b'; }],
  ['old capture connection', v => { v.capture.connectionId = 'connection-b'; }],
  ['false footer', v => { v.reportedRowCount = 0; }],
  ['fractional footer', v => { v.reportedRowCount = 1.5; }],
  ['unbounded footer', v => { v.reportedRowCount = 10_000_001; }],
  ['account selector shape', v => { v.sourceAccount.selector = '101&action=delete'; }],
  ['new format', v => { (v as {version: number}).version = 2; }],
];
for (const [name, change] of mutations) test(`reject ${name} mismatch and preserve caller evidence`, () => {
  const value = observation(); change(value); const before = JSON.stringify(value);
  assert.throws(() => validateFinancialLedgerObservation(value, target)); assert.equal(JSON.stringify(value), before);
});

for (const bad of [
  'http://vereinsflieger.de/member/profile/account.php?caid=101',
  'https://evil.test/member/profile/account.php?caid=101',
  'https://vereinsflieger.de/member/profile/account.php?caid=101&caid=101',
  'https://vereinsflieger.de/member/profile/account.php?caid=101&year=2026',
  'https://vereinsflieger.de/member/profile/account.php?caid=101#fragment',
  'https://user:password@vereinsflieger.de/member/profile/account.php?caid=101',
  'https://vereinsflieger.de/member/profile/printuserinvoice.php?caid=101',
]) test(`reject unsupported financial route: ${new URL(bad).protocol} ${new URL(bad).pathname} ${new URL(bad).searchParams.size}`, () => {
  const value = observation(); value.ownNavigation.url = bad; value.sourceUrl = bad;
  assert.throws(() => validateFinancialLedgerObservation(value, target));
});

test('legacy query-free capture cannot acquire an account identity by itself', () => {
  const legacy = observation().capture;
  assert.throws(() => validateFinancialLedgerObservation(legacy, target));
  const unknown = observation(); (unknown as unknown as Record<string, unknown>).inferredExpenseTotal = 0;
  assert.throws(() => validateFinancialLedgerObservation(unknown, target));
});

test('late observation rejects after target switches; prior target remains readable', () => {
  const saved = observation(), switchedScope = structuredClone(scope); switchedScope.owner = 'owner-b';
  assert.throws(() => validateFinancialLedgerObservation(saved, { storeId, scope: switchedScope }));
  assert.deepEqual(validateFinancialLedgerObservation(saved, target), saved);
});

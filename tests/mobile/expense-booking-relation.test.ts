import assert from 'node:assert/strict';
import test from 'node:test';
import { corroborateBilledFlightBooking } from '../../apps/platform-lab/src/vereinsflieger/expense-source-assessment.ts';
import type { FinancialLedgerObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';
import { financialAt, financialObservation, financialTarget } from './fixtures/expense-capture.ts';

function billed() {
  const value = financialObservation();
  value.source.lines.forEach((line, index) => { line.descriptionRaw = `500000001 - Synthetic invoice - Fee ${index}`; });
  return value;
}
function ledger(selector = '101', date = '01.06.2026'): FinancialLedgerObservation {
  const label = selector === '101' ? 'Synthetic member' : 'Synthetic allowance';
  const url = `https://vereinsflieger.de/member/profile/account.php?caid=${selector}`;
  return { version: 1, ...structuredClone(financialTarget), contextBefore: structuredClone(financialTarget.scope.context),
    contextAfter: structuredClone(financialTarget.scope.context), sourceAccount: { label, selector },
    ownNavigation: { label, url }, pageAccountLabel: label, sourceUrl: url, reportedRowCount: 1,
    capture: { version: 1, id: 'capture-a', retrievedAt: financialAt, owner: financialTarget.scope.owner,
      connectionId: financialTarget.scope.connectionId, sourceIdentity: 'provisional-observed-profile',
      category: 'ledger', path: '/member/profile/account.php',
      columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'booking', label: 'BuchungsNr.', index: 1 },
        { key: 'invoice', label: 'Abrechnung', index: 2 }, { key: 'information', label: 'Informationen', index: 3 },
        { key: 'value', label: 'Wert (EUR)', index: 4 }, { key: 'balance', label: 'Saldo (EUR)', index: 5 }],
      rows: [{ position: 0, values: [date, 'repeated-booking', '500000001', 'Synthetic raw movement', '-60,00', '-60,00'] }],
      empty: false, filters: ['Jahr 2026'], coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } } };
}
const assess = (ledgers: unknown[], source = billed()) => corroborateBilledFlightBooking(source, ledgers, financialTarget);

test('exact invoice matches corroborate a booking date distinct from the flight service date', () => {
  const member = ledger(), allowance = ledger('202');
  allowance.capture.rows[0]!.values[4] = '-40,00';
  const result = assess([member, allowance]);
  assert.equal(result.state, 'corroborated');
  assert.equal(result.invoiceReference, '500000001');
  assert.equal(result.bookingDateCandidate, '2026-06-01');
  assert.equal(result.source.serviceDate, '2026-05-31');
  assert.equal(result.source.bookingDate, null);
  assert.equal(result.contributors.length, 2);
  assert.deepEqual(result.contributors.map(row => row.sourceAccount.selector), ['101', '202']);
  assert.equal(result.source.reconciliation.lineSumMinor, 640);
  assert.ok(result.source.projectionGates.includes('booking-date-unproved'));
  assert.ok(result.source.projectionGates.includes('source-revision-unproved'));
  assert.ok(result.issues.includes('invoice-link-identity-unproved'));
  assert.equal('facts' in result, false);
});

test('same invoice on multiple rows preserves each contributor without adding invoice/movement amounts', () => {
  const value = ledger();
  value.capture.rows.push({ position: 7, values: [...value.capture.rows[0]!.values] }); value.reportedRowCount = 2;
  const result = assess([value]);
  assert.equal(result.state, 'corroborated');
  assert.deepEqual(result.contributors.map(row => row.rowPosition), [0, 7]);
  assert.equal(result.source.reconciliation.lineSumMinor, 640);
});

test('column keys are used rather than original DOM offsets', () => {
  const value = ledger();
  value.capture.columns.forEach((column, index) => { column.index = 40 + index; });
  assert.equal(assess([value]).bookingDateCandidate, '2026-06-01');
});

test('unrelated invoice rows and their dates cannot affect the selected reference', () => {
  const value = ledger(), unrelated = [...value.capture.rows[0]!.values];
  unrelated[0] = '01.01.2025'; unrelated[2] = '500000002';
  value.capture.rows.push({ position: 1, values: unrelated }); value.reportedRowCount = 2;
  const result = assess([value]);
  assert.equal(result.state, 'corroborated'); assert.equal(result.contributors.length, 1);
});

for (const raw of ['1500000001', '5000000010', 'invoice 500000001', '500000001 / 500000002', '']) {
  test(`ledger invoice cells require an exact opaque reference: ${raw || 'blank'}`, () => {
    const value = ledger(); value.capture.rows[0]!.values[2] = raw;
    const result = assess([value]);
    assert.equal(result.state, 'unavailable'); assert.equal(result.bookingDateCandidate, null);
    assert.equal(result.contributors.length, 0); assert.ok(result.issues.includes('invoice-booking-missing'));
  });
}

test('outer source whitespace is preserved and leading zero references are never converted to numbers', () => {
  const source = billed(), value = ledger();
  source.source.lines.forEach(line => { line.descriptionRaw = ' 000123 - Synthetic fee '; });
  value.capture.rows[0]!.values[2] = ' 000123 ';
  const result = assess([value], source);
  assert.equal(result.invoiceReference, '000123'); assert.equal(result.state, 'corroborated');
  assert.equal(result.contributors[0]!.invoiceRaw, ' 000123 ');
  value.capture.rows[0]!.values[2] = '123'; assert.equal(assess([value], source).state, 'unavailable');
});

for (const description of ['INV-A - Fee', '500000001', '500000001: Fee', '500000001 - ', '500000001 - Fee\nsecond line']) {
  test(`unsupported billed invoice wording supplies no join: ${JSON.stringify(description)}`, () => {
    const source = billed(); source.source.lines[0]!.descriptionRaw = description;
    const result = assess([ledger()], source);
    assert.equal(result.state, 'unavailable'); assert.equal(result.invoiceReference, null);
    assert.equal(result.bookingDateCandidate, null); assert.ok(result.issues.includes('invoice-reference-unavailable'));
  });
}

test('different invoice prefixes within one flight conflict without choosing a line or invoice', () => {
  const source = billed(); source.source.lines[1]!.descriptionRaw = '500000002 - Synthetic fee';
  const result = assess([ledger()], source);
  assert.equal(result.state, 'conflict'); assert.equal(result.invoiceReference, null);
  assert.equal(result.bookingDateCandidate, null); assert.ok(result.issues.includes('invoice-reference-conflict'));
});

test('conflicting booking dates across two accounts cannot be resolved by the invoice or service date', () => {
  const result = assess([ledger(), ledger('202', '02.06.2026')]);
  assert.equal(result.state, 'conflict'); assert.equal(result.bookingDateCandidate, null);
  assert.equal(result.contributors.length, 2); assert.ok(result.issues.includes('booking-date-conflict'));
});

test('later retrieval cannot supersede a conflicting earlier date; input order cannot choose a winner', () => {
  const old = ledger(), recent = ledger('101', '02.06.2026');
  recent.capture.id = 'capture-b'; recent.capture.retrievedAt = '2026-10-31T12:00:00.000Z';
  const a = assess([old, recent]), b = assess([recent, old]);
  assert.equal(a.state, 'conflict'); assert.equal(b.state, 'conflict');
  assert.equal(a.bookingDateCandidate, null); assert.deepEqual(a.contributors, b.contributors);
});

for (const raw of ['', '31.06.2026', '2026-06-01', 'unknown']) {
  test(`a matched row with an unavailable date cannot inherit another date: ${raw || 'blank'}`, () => {
    const result = assess([ledger(), ledger('202', raw)]);
    assert.equal(result.state, 'unavailable'); assert.equal(result.bookingDateCandidate, null);
    assert.ok(result.issues.includes('booking-date-unavailable'));
    assert.equal(result.contributors.find(row => row.sourceAccount.selector === '202')!.bookingDate, null);
  });
}

test('absent and explicitly empty ledger sources remain distinguishable without a zero-period claim', () => {
  const absent = assess([]), empty = ledger(); empty.capture.rows = []; empty.capture.empty = true; empty.reportedRowCount = 0;
  const present = assess([empty]);
  assert.ok(absent.issues.includes('ledger-evidence-unavailable'));
  assert.ok(present.issues.includes('invoice-booking-missing'));
  assert.equal(absent.ledgers.length, 0); assert.equal(present.ledgers.length, 1);
  assert.equal(present.bookingDateCandidate, null);
  assert.ok(present.source.projectionGates.includes('period-coverage-unproved'));
});

test('a ledger missing the optional invoice column cannot be ignored in a candidate claim', () => {
  const incomplete = ledger('202'); incomplete.capture.columns.splice(2, 1); incomplete.capture.rows[0]!.values.splice(2, 1);
  const result = assess([ledger(), incomplete]);
  assert.equal(result.state, 'unavailable'); assert.equal(result.bookingDateCandidate, null);
  assert.equal(result.contributors.length, 1); assert.ok(result.issues.includes('ledger-invoice-column-unavailable'));
});

test('partial page evidence and source amount disagreement retain independent limitations', () => {
  const source = billed(), value = ledger(); source.source.statedTotalRaw = '9,99 EUR';
  value.capture.coverage.truncated = true; value.reportedRowCount = 50;
  const result = assess([value], source);
  assert.equal(result.bookingDateCandidate, '2026-06-01');
  assert.equal(result.source.reconciliation.state, 'mismatch');
  assert.deepEqual(result.ledgers[0]!.capture.coverage, value.capture.coverage);
  for (const gate of ['source-amount-mismatch', 'period-coverage-unproved', 'allowance-relation-unproved']) {
    assert.ok(result.source.projectionGates.includes(gate));
  }
});

for (const field of ['owner', 'connectionId', 'accountNumber', 'clubLabel', 'storeId'] as const) {
  test(`foreign ${field} rejects even when the billed invoice prefix is unavailable`, () => {
    const value = ledger(), source = billed(); source.source.lines[0]!.descriptionRaw = 'Unknown invoice';
    if (field === 'storeId') value.storeId = '44444444-4444-4444-8444-444444444444';
    else if (field === 'owner' || field === 'connectionId') value.scope[field] = 'foreign';
    else value.scope.context[field] = 'foreign';
    assert.throws(() => assess([value], source));
  });
}

test('bounds reject excess input rather than dropping possible conflicting evidence', () => {
  assert.equal(assess(Array.from({ length: 20 }, () => ledger())).state, 'corroborated');
  assert.throws(() => assess(Array.from({ length: 21 }, () => ledger())));
  assert.throws(() => corroborateBilledFlightBooking(billed(), null as never, financialTarget));
});

test('source rows, account coordinates and all returned observations remain detached', () => {
  const value = ledger(), source = billed(), original = structuredClone({ value, source });
  const result = assess([value], source);
  result.contributors[0]!.sourceAccount.label = 'Changed'; result.contributors[0]!.bookingDateRaw = 'Changed';
  result.ledgers[0]!.capture.rows[0]!.values[0] = 'Changed';
  result.source.observation.source.lines[0]!.amountRaw = 'Changed';
  assert.deepEqual({ value, source }, original);
});

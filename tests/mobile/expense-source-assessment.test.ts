import assert from 'node:assert/strict';
import test from 'node:test';
import { assessBilledFlightSource } from '../../apps/platform-lab/src/vereinsflieger/expense-source-assessment.ts';
import { financialObservation, financialTarget } from './fixtures/expense-capture.ts';

function amounts(values: string[], total: string) {
  const source = financialObservation();
  source.source.lines = values.map((amountRaw, position) => ({ position, amountRaw,
    recipientRaw: source.ownRecipientLabel, descriptionRaw: `INV-A - Synthetic fee ${position}` }));
  source.source.statedTotalRaw = total;
  return source;
}

test('billed source reconciles exact cents without promoting service date or source semantics', () => {
  const input = amounts(['0,10 EUR', '0,20 EUR'], '0,30 EUR');
  const result = assessBilledFlightSource(input, financialTarget);
  assert.deepEqual(result.reconciliation, { state: 'match', lineSumMinor: 30 });
  assert.deepEqual(result.statedTotal, { state: 'value', minorUnits: 30 });
  assert.equal(result.serviceDate, '2026-05-31');
  assert.equal(result.bookingDate, null);
  for (const gate of ['financial-authority-unproved', 'own-liability-unproved', 'expense-kind-unproved',
    'charge-identity-unproved', 'source-revision-unproved', 'booking-date-unproved',
    'allowance-relation-unproved', 'period-coverage-unproved']) assert.ok(result.projectionGates.includes(gate));
  assert.equal('facts' in result, false);
  assert.deepEqual(result.observation, input);
});

test('disagreeing stated total retains both raw representations, never overwrites the source', () => {
  const input = amounts(['2,40 EUR', '4,00 EUR'], '9,99 EUR');
  const original = structuredClone(input), result = assessBilledFlightSource(input, financialTarget);
  assert.deepEqual(result.reconciliation, { state: 'mismatch', lineSumMinor: 640 });
  assert.deepEqual(result.statedTotal, { state: 'value', minorUnits: 999 });
  assert.ok(result.projectionGates.includes('source-amount-mismatch'));
  assert.deepEqual(input, original);
  assert.deepEqual(result.observation.source, original.source);
});

for (const raw of ['2,40', '2,40 USD', '2,40 eur', 'EUR 2,40', '2,40 EUR extra']) {
  test(`currency cannot be borrowed for billed value ${raw}`, () => {
    const result = assessBilledFlightSource(amounts([raw, '4,00 EUR'], '6,40 EUR'), financialTarget);
    assert.equal(result.lines[0]!.money.state, 'unsupported-currency');
    assert.deepEqual(result.reconciliation, { state: 'unavailable', lineSumMinor: null });
    assert.ok(result.projectionGates.includes('source-amount-unavailable'));
  });
}

for (const raw of ['2.40 EUR', 'unknown EUR', '2,4 EUR', '+2,40 EUR', '90.071.992.547.409,92 EUR']) {
  test(`invalid amount is unavailable rather than zero: ${raw}`, () => {
    const result = assessBilledFlightSource(amounts([raw], '0,00 EUR'), financialTarget);
    assert.equal(result.lines[0]!.money.state, 'invalid');
    assert.deepEqual(result.reconciliation, { state: 'unavailable', lineSumMinor: null });
  });
}

test('invalid or bare stated total cannot turn a known line sum into a reconciled amount', () => {
  for (const total of ['6,40', '6.40 EUR', 'unknown']) {
    const result = assessBilledFlightSource(amounts(['2,40 EUR', '4,00 EUR'], total), financialTarget);
    assert.deepEqual(result.reconciliation, { state: 'unavailable', lineSumMinor: 640 });
  }
});

test('observed spacing/grouping is parsed while original source text is preserved', () => {
  const input = amounts([' 1.234,50\u00a0EUR ', '0,50\u202fEUR'], '1.235,00 EUR');
  const result = assessBilledFlightSource(input, financialTarget);
  assert.deepEqual(result.reconciliation, { state: 'match', lineSumMinor: 123500 });
  assert.equal(result.observation.source.lines[0]!.amountRaw, input.source.lines[0]!.amountRaw);
});

test('signed matching credit remains raw and requires an original-charge relation', () => {
  const result = assessBilledFlightSource(amounts(['-2,40 EUR', '-4,00 EUR'], '-6,40 EUR'), financialTarget);
  assert.deepEqual(result.reconciliation, { state: 'match', lineSumMinor: -640 });
  assert.ok(result.projectionGates.includes('credit-relation-unproved'));
  assert.ok(result.projectionGates.includes('expense-kind-unproved'));
});

test('zero and cancelling source lines do not prove zero expenses or a refund kind', () => {
  for (const values of [['0,00 EUR'], ['2,40 EUR', '-2,40 EUR']]) {
    const result = assessBilledFlightSource(amounts(values, '0,00 EUR'), financialTarget);
    assert.deepEqual(result.reconciliation, { state: 'match', lineSumMinor: 0 });
    assert.ok(result.projectionGates.includes('expense-kind-unproved'));
    assert.ok(result.projectionGates.includes('period-coverage-unproved'));
  }
});

test('source sums use exact wide arithmetic before bounded output conversion', () => {
  for (const sign of ['', '-']) {
    const result = assessBilledFlightSource(amounts([`${sign}90.071.992.547.409,91 EUR`, `${sign}0,01 EUR`], '0,00 EUR'), financialTarget);
    assert.deepEqual(result.reconciliation, { state: 'overflow', lineSumMinor: null });
    assert.ok(result.projectionGates.includes('source-amount-overflow'));
  }
  const exact = assessBilledFlightSource(amounts(['90.071.992.547.409,91 EUR', '0,01 EUR', '-90.071.992.547.409,91 EUR'], '0,01 EUR'), financialTarget);
  assert.deepEqual(exact.reconciliation, { state: 'match', lineSumMinor: 1 });
});

for (const field of ['owner', 'connectionId', 'accountNumber', 'clubLabel', 'storeId'] as const) {
  test(`a late or foreign ${field} observation is refused before assessment`, () => {
    const input = financialObservation(), target = structuredClone(financialTarget), original = structuredClone(input);
    if (field === 'storeId') target.storeId = '44444444-4444-4444-8444-444444444444';
    else if (field === 'owner' || field === 'connectionId') target.scope[field] = 'foreign';
    else target.scope.context[field] = 'foreign';
    assert.throws(() => assessBilledFlightSource(input, target));
    assert.deepEqual(input, original);
  });
}

test('invoice-like wording, row position, retrieval time and billing status cannot create expense proofs', () => {
  const input = financialObservation();
  input.source.lines[0]!.descriptionRaw = 'refund payment membership allowance invoice 123456';
  input.retrievedAt = '2026-10-31T12:00:00.000Z';
  const result = assessBilledFlightSource(input, financialTarget);
  assert.equal(result.bookingDate, null);
  assert.ok(result.projectionGates.includes('source-revision-unproved'));
  assert.ok(result.projectionGates.includes('expense-kind-unproved'));
  assert.equal('revision' in result, false);
  result.observation.source.lines[0]!.amountRaw = '999,00 EUR';
  result.observation.scope.context.clubLabel = 'Detached';
  assert.equal(input.source.lines[0]!.amountRaw, '2,40 EUR');
  assert.equal(input.scope.context.clubLabel, financialTarget.scope.context.clubLabel);
});

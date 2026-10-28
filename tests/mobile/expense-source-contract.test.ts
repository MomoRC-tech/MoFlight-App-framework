import assert from 'node:assert/strict';
import test from 'node:test';
import { parseObservedEuro, parseObservedFinancialDate } from '../../apps/platform-lab/src/vereinsflieger/expense-money-observation.ts';
import { EXPENSE_DATE_CASES, EXPENSE_MONEY_CASES } from './fixtures/expense-money-cases.ts';

for (const c of EXPENSE_MONEY_CASES) test(`E1 EUR observation: ${c.id}`, () => {
  assert.deepEqual(parseObservedEuro(c.raw, c.currency), c.expected);
});

for (const c of EXPENSE_DATE_CASES) test(`E1 source calendar date: ${c.id}`, () => {
  assert.deepEqual(parseObservedFinancialDate(c.raw), c.expected);
});

test('E1 decimal cents remain exact for later arithmetic', () => {
  const left = parseObservedEuro('0,10', 'EUR'), right = parseObservedEuro('0,20', 'EUR');
  assert.equal(left.state, 'value'); assert.equal(right.state, 'value');
  if (left.state !== 'value' || right.state !== 'value') assert.fail('Fixture amounts must parse');
  assert.equal(left.minorUnits + right.minorUnits, 30);
});

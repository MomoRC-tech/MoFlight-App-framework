/** E1 independent synthetic expectations. No provider values or inferred business meanings. */
import type { ObservedDate, ObservedMoney } from '../../../apps/platform-lab/src/vereinsflieger/expense-money-observation.ts';

export const EXPENSE_MONEY_CASES: readonly { id: string; raw: unknown; currency: unknown; expected: ObservedMoney }[] = [
  { id: 'zero', raw: '0,00', currency: 'EUR', expected: { state: 'value', minorUnits: 0 } },
  { id: 'negative-zero', raw: '-0,00', currency: 'EUR', expected: { state: 'value', minorUnits: 0 } },
  { id: 'cent', raw: '0,01', currency: 'EUR', expected: { state: 'value', minorUnits: 1 } },
  { id: 'negative-cent', raw: '-0,01', currency: 'EUR', expected: { state: 'value', minorUnits: -1 } },
  { id: 'signed-movement-only', raw: '-12,34', currency: 'EUR', expected: { state: 'value', minorUnits: -1234 } },
  { id: 'unsigned-movement-only', raw: '12,34', currency: 'EUR', expected: { state: 'value', minorUnits: 1234 } },
  { id: 'thousands', raw: '1.234,56', currency: 'EUR', expected: { state: 'value', minorUnits: 123456 } },
  { id: 'ungrouped-thousands', raw: '1234,56', currency: 'EUR', expected: { state: 'value', minorUnits: 123456 } },
  { id: 'millions', raw: '-1.234.567,89', currency: 'EUR', expected: { state: 'value', minorUnits: -123456789 } },
  { id: 'outer-whitespace', raw: '\u00a0 -1,20 \n', currency: 'EUR', expected: { state: 'value', minorUnits: -120 } },
  { id: 'safe-maximum', raw: '90.071.992.547.409,91', currency: 'EUR', expected: { state: 'value', minorUnits: 9007199254740991 } },
  { id: 'safe-minimum', raw: '-90071992547409,91', currency: 'EUR', expected: { state: 'value', minorUnits: -9007199254740991 } },
  { id: 'positive-overflow', raw: '90071992547409,92', currency: 'EUR', expected: { state: 'invalid', reason: 'overflow' } },
  { id: 'negative-overflow', raw: '-90071992547409,92', currency: 'EUR', expected: { state: 'invalid', reason: 'overflow' } },
  { id: 'blank', raw: '', currency: 'EUR', expected: { state: 'missing' } },
  { id: 'whitespace-blank', raw: ' \u00a0\n', currency: 'EUR', expected: { state: 'missing' } },
  ...['12.34', '1,234.56', '1.23,45', '01,00', '0.001,00', '12', '12,3', '12,345', '+12,34', '−12,34', '(12,34)', '12,34 EUR', '€12,34', '1 234,56', '1\u202f234,56', '1e3', '--1,00', 'NaN', 'unbekannt'].map((raw, index) => ({
    id: `unsupported-grammar-${index}`, raw, currency: 'EUR', expected: { state: 'invalid', reason: 'grammar' } as const,
  })),
  { id: 'numeric-input', raw: 12.34, currency: 'EUR', expected: { state: 'invalid', reason: 'type' } },
  { id: 'null-is-not-zero', raw: null, currency: 'EUR', expected: { state: 'invalid', reason: 'type' } },
  { id: 'bounded-input', raw: '1'.repeat(129), currency: 'EUR', expected: { state: 'invalid', reason: 'length' } },
  { id: 'no-fx', raw: '12,34', currency: 'USD', expected: { state: 'unsupported-currency' } },
  { id: 'currency-unproved', raw: '12,34', currency: null, expected: { state: 'unsupported-currency' } },
];

export const EXPENSE_DATE_CASES: readonly { id: string; raw: unknown; expected: ObservedDate }[] = [
  { id: 'year-end', raw: '31.12.2025', expected: { state: 'value', date: '2025-12-31' } },
  { id: 'year-start', raw: '01.01.2026', expected: { state: 'value', date: '2026-01-01' } },
  { id: 'leap', raw: '29.02.2024', expected: { state: 'value', date: '2024-02-29' } },
  { id: 'leap-century', raw: '29.02.2000', expected: { state: 'value', date: '2000-02-29' } },
  { id: 'dst-date-only', raw: ' 25.10.2026 ', expected: { state: 'value', date: '2026-10-25' } },
  { id: 'blank', raw: '', expected: { state: 'missing' } },
  ...['29.02.2026', '29.02.1900', '29.02.2100', '31.04.2026', '00.01.2026', '01.13.2026', '1.1.2026', '2026-01-01', '01.01.2200', '25.10.2026 02:30'].map((raw, index) => ({
    id: `invalid-date-${index}`, raw, expected: { state: 'invalid' } as const,
  })),
  { id: 'null', raw: null, expected: { state: 'invalid' } },
];

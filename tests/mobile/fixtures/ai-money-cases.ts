/** Synthetic accounting vectors only; these values are not provider prices. */
export type MoneyCase = Readonly<{
  id: string;
  inputTokens: number;
  outputTokens: number;
  inputNanoUsd: number;
  cacheReadNanoUsd: number;
  cacheWriteNanoUsd: number;
  outputNanoUsd: number;
  requestNanoUsd: number;
  grossMicroEurPerUsd: number;
  marginBps: number;
  expectedMicroEur: number;
}>;

function freezeMoneyCase(testCase: MoneyCase): MoneyCase {
  return Object.freeze(testCase);
}

export const MONEY_CASES: readonly MoneyCase[] = Object.freeze([
  freezeMoneyCase({
    id: 'all-zero-rates',
    inputTokens: 50,
    outputTokens: 10,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 0,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 0,
    // Every charge term is zero, so the rounded bound is zero.
    expectedMicroEur: 0,
  }),
  freezeMoneyCase({
    id: 'fractional-micro-euro-rounds-up',
    inputTokens: 1,
    outputTokens: 0,
    inputNanoUsd: 1,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 0,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 0,
    // 1 * 1,000,000 * 10,000 / 10^13 = 0.001 micro-EUR; ceil gives 1.
    expectedMicroEur: 1,
  }),
  freezeMoneyCase({
    id: 'output-includes-reasoning-tokens',
    inputTokens: 0,
    outputTokens: 4,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 25_000_000,
    requestNanoUsd: 0,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 0,
    // Four bounded output tokens (including reasoning) cost 100,000,000 nano-USD, or 100,000 micro-EUR.
    expectedMicroEur: 100_000,
  }),
  freezeMoneyCase({
    id: 'input-and-both-cache-rates-add',
    inputTokens: 2,
    outputTokens: 0,
    inputNanoUsd: 100,
    cacheReadNanoUsd: 1_000_000,
    cacheWriteNanoUsd: 2_000_000,
    outputNanoUsd: 0,
    requestNanoUsd: 0,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 0,
    // 2 * (100 + 1,000,000 + 2,000,000) gives 6,000,200 nano-USD = 6,000.2 micro-EUR.
    expectedMicroEur: 6_001,
  }),
  freezeMoneyCase({
    id: 'fixed-request-charge',
    inputTokens: 0,
    outputTokens: 0,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 15_000_000,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 0,
    // 15,000,000 nano-USD is 0.015 USD, or exactly 15,000 micro-EUR at this conversion.
    expectedMicroEur: 15_000,
  }),
  freezeMoneyCase({
    id: 'gross-eur-conversion-includes-fees',
    inputTokens: 0,
    outputTokens: 0,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 10_000_000,
    grossMicroEurPerUsd: 1_234_567,
    marginBps: 0,
    // 0.01 USD * 1,234,567 micro-EUR/USD = 12,345.67 micro-EUR; ceil gives 12,346.
    expectedMicroEur: 12_346,
  }),
  freezeMoneyCase({
    id: 'uncertainty-margin',
    inputTokens: 0,
    outputTokens: 0,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 10_000_000,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 2_500,
    // 0.01 USD is 10,000 micro-EUR here; a 25% margin yields 12,500.
    expectedMicroEur: 12_500,
  }),
  freezeMoneyCase({
    id: 'large-intermediate-within-final-cap',
    inputTokens: 0,
    outputTokens: 0,
    inputNanoUsd: 0,
    cacheReadNanoUsd: 0,
    cacheWriteNanoUsd: 0,
    outputNanoUsd: 0,
    requestNanoUsd: 400_000_000,
    grossMicroEurPerUsd: 1_000_000,
    marginBps: 10_000,
    // 400,000,000 * 1,000,000 * 20,000 = 8e18 (> 2^53); /10^13 is exactly 800,000.
    expectedMicroEur: 800_000,
  }),
]);

export type BerlinPeriodCase = Readonly<{
  id: string;
  instantUtc: string;
  expectedPeriod: string;
}>;

function freezeBerlinPeriodCase(testCase: BerlinPeriodCase): BerlinPeriodCase {
  return Object.freeze(testCase);
}

export const BERLIN_PERIOD_CASES: readonly BerlinPeriodCase[] = Object.freeze([
  freezeBerlinPeriodCase({
    id: 'winter-month-end-before-midnight',
    instantUtc: '2026-01-31T22:59:59Z',
    // Berlin is UTC+01: 23:59:59 on 31 January.
    expectedPeriod: '2026-01',
  }),
  freezeBerlinPeriodCase({
    id: 'winter-month-start-at-midnight',
    instantUtc: '2026-01-31T23:00:00Z',
    // Berlin is UTC+01: 00:00 on 1 February.
    expectedPeriod: '2026-02',
  }),
  freezeBerlinPeriodCase({
    id: 'summer-month-end-before-midnight',
    instantUtc: '2026-06-30T21:59:59Z',
    // Berlin is UTC+02: 23:59:59 on 30 June.
    expectedPeriod: '2026-06',
  }),
  freezeBerlinPeriodCase({
    id: 'summer-month-start-at-midnight',
    instantUtc: '2026-06-30T22:00:00Z',
    // Berlin is UTC+02: 00:00 on 1 July.
    expectedPeriod: '2026-07',
  }),
  freezeBerlinPeriodCase({
    id: 'spring-clock-jump-before',
    instantUtc: '2026-03-29T00:59:59Z',
    // The last instant before the jump is 01:59:59 CET on 29 March.
    expectedPeriod: '2026-03',
  }),
  freezeBerlinPeriodCase({
    id: 'spring-clock-jump-after',
    instantUtc: '2026-03-29T01:00:00Z',
    // The first instant after the jump is 03:00 CEST on 29 March.
    expectedPeriod: '2026-03',
  }),
  freezeBerlinPeriodCase({
    id: 'autumn-repeated-hour-daylight-time',
    instantUtc: '2026-10-25T00:30:00Z',
    // The first 02:30 is CEST on 25 October.
    expectedPeriod: '2026-10',
  }),
  freezeBerlinPeriodCase({
    id: 'autumn-repeated-hour-standard-time',
    instantUtc: '2026-10-25T01:30:00Z',
    // The repeated 02:30 is CET on 25 October.
    expectedPeriod: '2026-10',
  }),
  freezeBerlinPeriodCase({
    id: 'year-end-before-midnight',
    instantUtc: '2026-12-31T22:59:59Z',
    // Berlin is UTC+01: 23:59:59 on 31 December.
    expectedPeriod: '2026-12',
  }),
  freezeBerlinPeriodCase({
    id: 'year-start-at-midnight',
    instantUtc: '2026-12-31T23:00:00Z',
    // Berlin is UTC+01: 00:00 on 1 January 2027.
    expectedPeriod: '2027-01',
  }),
]);

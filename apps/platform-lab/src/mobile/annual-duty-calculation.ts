import type { FeatureSource, WorkSummaryItem } from './feature-information';
import type { DutyCalculation } from '../duty-target';

/** Owner-selected estimate from one annual source row, never a confirmed club quota. */
export function annualDutyCalculation(source: FeatureSource<WorkSummaryItem> | undefined, year: number): DutyCalculation | null {
  if (source?.status !== 'partial' || source.empty || source.truncated || !source.retrievedAt ||
    !Number.isFinite(Date.parse(source.retrievedAt)) || new Date(source.retrievedAt).toISOString() !== source.retrievedAt) return null;
  const rows = source.items.filter(row => [String(year), `Jahr ${year}`].includes(row.period.trim().replace(/\s+/g, ' ')));
  if (rows.length !== 1) return null;
  const row = rows[0]!;
  const euro = (raw: string): bigint | null => {
    if (raw.length > 128 || !/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+),\d{2}\s*(?:EUR|\u20ac)$/.test(raw.trim())) return null;
    return BigInt(raw.trim().replace(/\s*(EUR|\u20ac)$/, '').replace(/[.,]/g, ''));
  };
  const required = euro(row.obligation), earned = euro(row.performed);
  if (required === null || earned === null || earned === 0n || required === earned) return null;
  const raw = row.hours.trim();
  let numerator: bigint, denominator: bigint;
  if (/^\d{1,5}(?:[.,]\d{1,2})?$/.test(raw)) {
    const [whole, fraction = ''] = raw.replace(',', '.').split('.');
    numerator = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0')); denominator = 100n;
  } else {
    const clock = /^(\d{1,5}):([0-5]\d)$/.exec(raw);
    if (!clock) return null;
    numerator = BigInt(clock[1]!) * 60n + BigInt(clock[2]!); denominator = 60n;
  }
  if (numerator === 0n) return null;
  // Round the final hours only, to the existing two-decimal target precision.
  const divisor = earned * denominator;
  const hundredths = (required * numerator * 100n * 2n + divisor) / (2n * divisor);
  if (hundredths > 99900n) return null;
  return { hours: Number(hundredths) / 100, retrievedAt: source.retrievedAt };
}

import type { FeatureSource, WorkSummaryItem } from './feature-information';

/** One explicit annual source row, never a sum of a partial list or a EUR conversion. */
export function seasonWorkHours(source: FeatureSource<WorkSummaryItem> | undefined, year: number): string | null {
  if (source?.status !== 'partial' || source.empty) return null;
  const rows = source.items.filter(item => {
    const period = item.period.trim().replace(/\s+/g, ' ');
    return period === String(year) || period === `Jahr ${year}`;
  });
  if (rows.length !== 1) return null;
  const hours = rows[0]!.hours.trim();
  const clock = /^(\d{1,5}):([0-5]\d)$/.exec(hours);
  if (clock) return `${Number(clock[1])}:${clock[2]}`;
  // Decimal hours stay decimal; no rounding into invented whole minutes.
  if (/^\d{1,5}(?:[,.]\d{1,2})?$/.test(hours)) return hours.replace('.', ',');
  return null;
}

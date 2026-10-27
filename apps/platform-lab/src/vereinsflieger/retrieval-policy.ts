export interface SavedFlightRetrieval {
  from: string; to: string; retrievedAt: string; savedAt: string;
}
export interface FlightRetrievalWindow { from: string; to: string }

function date(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid retrieval calendar date.');
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
function calendar(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid saved retrieval date.');
  const [year, month, day] = value.split('-').map(Number);
  const result = new Date(year!, month! - 1, day!, 12);
  if (date(result) !== value) throw new Error('Invalid saved retrieval date.');
  return result;
}
function nextDay(value: string): string {
  const result = calendar(value); result.setDate(result.getDate() + 1); return date(result);
}

/** Inputs are committed complete/empty windows from one authorized library, never raw captures. */
export function planFlightRetrieval(saved: readonly SavedFlightRetrieval[], now = new Date()) {
  const today = date(now);
  const month = new Date(now.getFullYear(), now.getMonth() - 3, 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12).getDate();
  month.setDate(Math.min(now.getDate(), lastDay));
  const threeMonthsAgo = date(month);
  const periods: FlightRetrievalWindow[] = [];
  const ordered = saved.map(window => {
    calendar(window.from); calendar(window.to);
    if (window.from > window.to || !Number.isFinite(Date.parse(window.retrievedAt)) || !Number.isFinite(Date.parse(window.savedAt))) {
      throw new Error('Invalid saved retrieval window.');
    }
    return {from: window.from, to: window.to};
  }).sort((a, b) => a.from.localeCompare(b.from));
  for (const window of ordered) {
    const previous = periods.at(-1);
    if (previous && window.from <= nextDay(previous.to)) previous.to = previous.to > window.to ? previous.to : window.to;
    else periods.push({...window});
  }
  const gaps: FlightRetrievalWindow[] = periods.slice(1).map((window, index) => {
    const end = calendar(window.from); end.setDate(end.getDate() - 1);
    return {from: nextDay(periods[index]!.to), to: date(end)};
  });
  const past = periods.filter(window => window.from <= today);
  // Recheck the inclusive end before every known gap, including a long absence.
  // A later historical/custom import cannot mask an earlier uncovered interval.
  const checkpoint = past.find(window => window.to < today)?.to;
  const from = !past.length ? `${now.getFullYear() - 1}-01-01` :
    checkpoint && checkpoint < threeMonthsAgo ? checkpoint : threeMonthsAgo;
  const latest = [...saved].sort((a, b) => a.savedAt.localeCompare(b.savedAt)).at(-1);
  return {request: {from, to: today}, firstRetrieval: !past.length, periods, gaps,
    lastSuccessfulRetrievalAt: latest?.retrievedAt ?? null, lastSavedAt: latest?.savedAt ?? null};
}

import { summarizeRealFlights, formatReportedMinutes } from './real-flight-statistics';
import { statisticsCoverageComplete } from './statistics-overlay-model';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';

/** Empty cached windows are not proof of an empty season. */
export function cockpitSeason(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], year: number, today: string) {
  const summary = summarizeRealFlights(flights, year);
  return cockpitSeasonValues(summary,saved,year,today);
}
export function cockpitSeasonValues(summary: ReturnType<typeof summarizeRealFlights>, saved: readonly SavedFlightRetrieval[], year: number, today: string) {
  const season = summary.season;
  const from = `${year}-01-01`, to = year === Number(today.slice(0, 4)) ? today : `${year}-12-31`;
  const confirmedEmpty = season.count === 0 && statisticsCoverageComplete(saved, from, to);
  return { ...summary, starts: season.count > 0 || confirmedEmpty ? String(season.count) : '—',
    time: season.knownDurationCount > 0 ? formatReportedMinutes(season.knownMinutes) : confirmedEmpty ? '0:00' : '—' };
}

export const PROVISIONAL_DUTY_HOURS = 25;
export function parseDutyTarget(value: string): number | null {
  if (!/^\d{1,3}(?:[,.]\d{1,2})?$/.test(value.trim())) return null;
  const hours = Number(value.trim().replace(',', '.'));
  return hours <= 999 ? hours : null;
}

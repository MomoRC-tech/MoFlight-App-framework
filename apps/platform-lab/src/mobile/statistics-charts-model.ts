import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { classifyAircraft, classifyLaunch, aircraftCategoryLabels, launchMethodLabels } from './flight-classification';
import { classifyFlightRoleMetric } from './flight-role-metric';
import {
  selectStatisticsFlights, summarizeStatisticsFlights, statisticsDurationGroups, statisticsCoverageComplete,
  statisticsPeriodBounds, flightRoleMetricLabels, validStatisticsDate, type StatisticsPeriod,
} from './statistics-overlay-model';

export const chartNames = {
  monthly: 'Monatsaktivität', timeline: 'Flugdauer im Jahr', aircraft: 'Flugzeuge',
  launch: 'Startarten', launchDuration: 'Dauer nach Startart', duration: 'Dauerverteilung',
  roles: 'Flugrollen', days: 'Flugtage',
} as const;
export type ChartKind = keyof typeof chartNames;
export interface ChartContributors { title: string; ids: readonly string[]; scope: StatisticsPeriod }
export type AircraftGrouping = 'category' | 'model' | 'registration';
export interface ChartFilters { category: string; model: string; launch: string; role: string }
export const emptyChartFilters: ChartFilters = { category: '', model: '', launch: '', role: '' };
export const chartOrder = Object.keys(chartNames) as ChartKind[];
export interface ChartGroup {
  key: string; label: string; count: number; knownMinutes: number; knownDurationCount: number;
  unknownDurationCount: number; supportingIds: string[]; minutes: number[];
  median: number | null; q1: number | null; q3: number | null;
}
export function flightDate(f: RealFlightListItem): string | null {
  const date=f.facts.assessment.date;
  return date.state === 'parsed' && date.value && validStatisticsDate(date.value) ? date.value : null;
}
export function flightMinutes(f: RealFlightListItem): number | null {
  const d = f.facts.assessment.durations.flight;
  return d.state === 'known' && Number.isSafeInteger(d.minutes) && d.minutes >= 0 ? d.minutes : null;
}
export function flightModel(f: RealFlightListItem): string {
  const field = f.facts.assessment.fields.model;
  return field.state === 'value' ? field.raw.trim() : '';
}
export function quantile(values: readonly number[], p: number): number | null {
  if (!values.length) return null;
  if (p < 0 || p > 1 || !Number.isFinite(p)) throw new Error('Invalid quantile');
  const a = [...values].sort((a, b) => a - b), i = (a.length - 1) * p, lo = Math.floor(i);
  return a[lo]! + (a[Math.ceil(i)]! - a[lo]!) * (i - lo);
}
export function filterChartFlights(flights: readonly RealFlightListItem[], filters: ChartFilters) {
  return flights.filter(f => (!filters.category || classifyAircraft(f.facts.assessment).key === filters.category)
    && (!filters.model || flightModel(f) === filters.model)
    && (!filters.launch || classifyLaunch(f.facts.assessment).key === filters.launch)
    && (!filters.role || classifyFlightRoleMetric(f.facts.assessment).key === filters.role));
}
export function summarizeGroup(key: string, label: string, rows: readonly RealFlightListItem[]): ChartGroup {
  const summary = summarizeStatisticsFlights(rows);
  const minutes = rows.map(flightMinutes).filter((n): n is number => n !== null);
  return { key, label, ...summary, minutes, median: quantile(minutes, .5), q1: quantile(minutes, .25), q3: quantile(minutes, .75) };
}
export function groupChartFlights(flights: readonly RealFlightListItem[], dimension: AircraftGrouping | 'launch' | 'roles') {
  const groups = new Map<string, { label: string; rows: RealFlightListItem[] }>();
  for (const f of flights) {
    const a = f.facts.assessment;
    let key: string, label: string;
    if (dimension === 'category') { key = classifyAircraft(a).key; label = aircraftCategoryLabels[key as keyof typeof aircraftCategoryLabels]; }
    else if (dimension === 'launch') { key = classifyLaunch(a).key; label = launchMethodLabels[key as keyof typeof launchMethodLabels]; }
    else if (dimension === 'roles') { key = classifyFlightRoleMetric(a).key; label = flightRoleMetricLabels[key as keyof typeof flightRoleMetricLabels]; }
    else { const field = dimension === 'model' ? a.fields.model : a.fields.registration; key = field.state === 'value' ? field.raw.trim() : ''; label = key || (dimension === 'model' ? 'Muster unbekannt' : 'Kennzeichen unbekannt'); }
    const group = groups.get(key) ?? { label, rows: [] }; group.rows.push(f); groups.set(key, group);
  }
  return [...groups].map(([key, g]) => summarizeGroup(key, g.label, g.rows))
    .sort((a, b) => b.knownMinutes - a.knownMinutes || b.count - a.count || a.label.localeCompare(b.label, 'de'));
}
const monthEnd = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
export function chartDataset(flights: readonly RealFlightListItem[], period: StatisticsPeriod, today: string, filters: ChartFilters = emptyChartFilters) {
  const selection = selectStatisticsFlights(flights, period, today);
  const rows = filterChartFlights(selection.flights, filters);
  const summary = summarizeStatisticsFlights(rows);
  const dated = rows.filter(f => flightDate(f) !== null);
  return { rows, dated, summary, unknownDateCount: selection.unknownDateCount, conflictingIds: selection.conflictingIds,
    flyingDays: new Set(dated.map(f => flightDate(f)!)).size,
    durations: statisticsDurationGroups(rows),
    points: dated.filter(f => flightMinutes(f) !== null).map(f => ({ id: f.flightId, date: flightDate(f)!, minutes: flightMinutes(f)!,
      model: flightModel(f), launch: classifyLaunch(f.facts.assessment).key })),
  };
}
export function monthlyChartGroups(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], year: number, today: string, filters: ChartFilters) {
  const bounds = statisticsPeriodBounds({ kind: 'year', year }, today);
  if (!bounds) return [];
  const all = filterChartFlights(selectStatisticsFlights(flights, { kind: 'all' }, today).flights, filters);
  return Array.from({ length: 12 }, (_, i) => {
    const month = String(i + 1).padStart(2, '0'), suffix = `-${month}-01`, future = `${year}${suffix}` > bounds.to;
    const end = monthEnd(year, i + 1), through = end < bounds.to ? end : bounds.to;
    return [year, year - 1].map(y => {
      const from = `${y}${suffix}`;
      const matchingEnd = `${y}${through.slice(4)}`;
      const validEnd = new Date(`${matchingEnd}T00:00:00Z`).toISOString().slice(0, 10) === matchingEnd;
      const to = validEnd ? matchingEnd : monthEnd(y, i + 1);
      const rows = future ? [] : all.filter(f => { const d = flightDate(f); return d !== null && d >= from && d <= to; });
      return { ...summarizeGroup(`${y}-${month}`, `${month}.${y}`, rows), from, to,
        covered: !future && validEnd && statisticsCoverageComplete(saved, from, to), future, validComparison: validEnd };
    });
  });
}
export function calendarChartDays(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], year: number, today: string, filters: ChartFilters) {
  const rows = chartDataset(flights, { kind: 'year', year }, today, filters).dated;
  const byDate = new Map<string, RealFlightListItem[]>();
  for (const f of rows) { const date = flightDate(f)!; const group = byDate.get(date) ?? []; group.push(f); byDate.set(date, group); }
  const first = Date.UTC(year, 0, 1), next = Date.UTC(year + 1, 0, 1);
  return Array.from({ length: (next - first) / 86400000 }, (_, i) => {
    const date = new Date(first + i * 86400000).toISOString().slice(0, 10), group = byDate.get(date) ?? [];
    return { date, future: date > today, covered: date <= today && statisticsCoverageComplete(saved, date, date), ...summarizeGroup(date, date, group) };
  });
}
export function nearestChartPoints<T extends { date: string; minutes: number }>(points: readonly T[], date: string, minutes: number) {
  return points.filter(p => p.date === date && p.minutes === minutes);
}

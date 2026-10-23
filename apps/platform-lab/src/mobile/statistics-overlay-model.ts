import { annualFlightComparison, canonical, durationDistribution, type Flight } from '@moflight/flight-logbook';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { colorForAircraft } from './season-model';

export type StatisticsPeriod =
  | { kind: 'year'; year: number }
  | { kind: 'all' }
  | { kind: 'custom'; from: string; to: string };

export type StatisticsSection = 'overview' | 'aircraft' | 'duration' | 'launch';
export type AircraftSort = 'flights' | 'minutes';

export interface AircraftRanking {
  registration: string | null;
  model: string | null;
  modelConsistent: boolean;
  count: number;
  knownMinutes: number;
  knownDurationCount: number;
  unknownDurationCount: number;
  color: string;
  supportingIds: string[];
}

const safeAdd = (total: number, value: number): number => {
  const result = total + value;
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(result)) throw new Error('Statistics exceed the safe integer range.');
  return result;
};

function fieldValue(field: { state: string; raw?: string }): string | null {
  return field.state === 'value' && field.raw?.trim() ? field.raw : null;
}

export function validStatisticsDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  if (Number(value.slice(0, 4)) < 1) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function validStatisticsRange(from: string, to: string): boolean {
  return validStatisticsDate(from) && validStatisticsDate(to) && from <= to;
}

function distinctRecords(flights: readonly RealFlightListItem[]) {
  const rows = new Map<string, RealFlightListItem>();
  const conflicts = new Set<string>();
  for (const flight of flights) {
    const previous = rows.get(flight.flightId);
    if (!previous) rows.set(flight.flightId, flight);
    else if (canonical(previous.facts) !== canonical(flight.facts)) conflicts.add(flight.flightId);
  }
  return {
    flights: [...rows.values()].filter(flight => !conflicts.has(flight.flightId)),
    conflictingIds: [...conflicts].sort(),
  };
}

function recordedDate(flight: RealFlightListItem): string | null {
  const date = flight.facts.assessment.date;
  return date.state === 'parsed' && date.value && validStatisticsDate(date.value) ? date.value : null;
}

function recordedMinutes(flight: RealFlightListItem): number | null {
  const duration = flight.facts.assessment.durations.flight;
  return duration.state === 'known' && Number.isSafeInteger(duration.minutes) && duration.minutes >= 0 ? duration.minutes : null;
}

export function statisticsPeriodBounds(period: StatisticsPeriod, today: string): { from: string; to: string } | null {
  if (period.kind === 'all') return null;
  if (period.kind === 'custom') return validStatisticsRange(period.from, period.to) ? { from: period.from, to: period.to } : null;
  const year = String(period.year).padStart(4, '0');
  const from = `${year}-01-01`;
  const to = period.year === Number(today.slice(0, 4)) ? today : `${year}-12-31`;
  return validStatisticsDate(from) && validStatisticsDate(to) && from <= to ? { from, to } : null;
}

/** A year/custom range never absorbs undated records; all-history retains them separately. */
export function selectStatisticsFlights(flights: readonly RealFlightListItem[], period: StatisticsPeriod, today: string) {
  const distinct = distinctRecords(flights);
  const bounds = statisticsPeriodBounds(period, today);
  const undated = distinct.flights.filter(flight => recordedDate(flight) === null);
  const selected = distinct.flights.filter(flight => {
    if (period.kind === 'all') return true;
    const date = recordedDate(flight);
    return !!bounds && date !== null && date >= bounds.from && date <= bounds.to;
  });
  return { flights: selected, bounds, unknownDateCount: undated.length, conflictingIds: distinct.conflictingIds };
}

function toDomainFlight(flight: RealFlightListItem): Flight {
  const assessment = flight.facts.assessment;
  const date = recordedDate(flight);
  const duration = assessment.durations.flight;
  return {
    id: flight.flightId,
    date,
    start: null,
    landing: null,
    time_basis: null,
    minutes: recordedMinutes(flight),
    registration: fieldValue(assessment.fields.registration),
    aircraft_model: fieldValue(assessment.fields.model),
    pilot_role: null,
    crew: [],
    launch: null,
    start_place: null,
    landing_place: null,
    landings: null,
    remarks: null,
  };
}

export function domainStatisticsFlights(flights: readonly RealFlightListItem[]): Flight[] {
  return flights.map(toDomainFlight);
}

export function summarizeStatisticsFlights(flights: readonly RealFlightListItem[]) {
  const distinct = distinctRecords(flights);
  let knownMinutes = 0, knownDurationCount = 0, unknownDurationCount = 0, conflictingDurationCount = 0;
  for (const flight of distinct.flights) {
    const duration = flight.facts.assessment.durations.flight;
    const minutes = recordedMinutes(flight);
    if (minutes !== null) {
      knownMinutes = safeAdd(knownMinutes, minutes);
      knownDurationCount = safeAdd(knownDurationCount, 1);
    } else {
      unknownDurationCount = safeAdd(unknownDurationCount, 1);
      if (duration.state === 'conflict' || duration.state === 'invalid' || duration.state === 'known') conflictingDurationCount = safeAdd(conflictingDurationCount, 1);
    }
  }
  return {
    count: distinct.flights.length,
    knownMinutes,
    knownDurationCount,
    unknownDurationCount,
    conflictingDurationCount,
    unknownDateCount: distinct.flights.filter(flight => recordedDate(flight) === null).length,
    conflictingIds: distinct.conflictingIds,
    supportingIds: distinct.flights.map(flight => flight.flightId).sort(),
  };
}

export function rankStatisticsAircraft(flights: readonly RealFlightListItem[], sort: AircraftSort): AircraftRanking[] {
  const distinct = distinctRecords(flights);
  const groups = new Map<string, { registration: string | null; rows: RealFlightListItem[] }>();
  for (const flight of distinct.flights) {
    const registration = fieldValue(flight.facts.assessment.fields.registration);
    const key = registration === null ? '\u0000unknown' : `\u0000${registration}`;
    const group = groups.get(key) ?? { registration, rows: [] };
    group.rows.push(flight);
    groups.set(key, group);
  }
  const result = [...groups.values()].map(({ registration, rows }): AircraftRanking => {
    let knownMinutes = 0, knownDurationCount = 0, unknownDurationCount = 0;
    for (const row of rows) {
      const duration = row.facts.assessment.durations.flight;
      const minutes = recordedMinutes(row);
      if (minutes !== null) { knownMinutes = safeAdd(knownMinutes, minutes); knownDurationCount = safeAdd(knownDurationCount, 1); }
      else unknownDurationCount = safeAdd(unknownDurationCount, 1);
    }
    const models = rows.map(row => fieldValue(row.facts.assessment.fields.model));
    const consistent = models.length > 0 && models.every(model => model !== null && model === models[0]);
    return {
      registration,
      model: consistent ? models[0] ?? null : null,
      modelConsistent: consistent,
      count: rows.length,
      knownMinutes,
      knownDurationCount,
      unknownDurationCount,
      color: colorForAircraft(registration ?? 'Kennzeichen unbekannt'),
      supportingIds: rows.map(row => row.flightId).sort(),
    };
  });
  return result.sort((a, b) => {
    const comparison = sort === 'flights' ? b.count - a.count : b.knownMinutes - a.knownMinutes;
    if (comparison) return comparison;
    if (a.registration === null) return 1;
    if (b.registration === null) return -1;
    return a.registration.localeCompare(b.registration, 'de-DE');
  });
}

export function statisticsDurationGroups(flights: readonly RealFlightListItem[]) {
  const distinct = distinctRecords(flights);
  const distribution = durationDistribution(distinct.flights.map(toDomainFlight));
  const fieldConflicts = distinct.flights.filter(flight => {
    const state = flight.facts.assessment.durations.flight.state;
    return state === 'conflict' || state === 'invalid' || state === 'known' && recordedMinutes(flight) === null;
  }).map(flight => flight.flightId);
  return {
    bands: distribution.bands,
    unknownIds: distribution.unknownDurationIds,
    conflictingIds: [...new Set([...fieldConflicts, ...distribution.conflictingIds, ...distinct.conflictingIds])].sort(),
    sourceConflictingIds: distinct.conflictingIds,
  };
}

export function annualStatisticsComparison(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], today: string, year: number) {
  const through = year === Number(today.slice(0, 4)) ? today : `${String(year).padStart(4, '0')}-12-31`;
  const coverage = saved.filter(window => validStatisticsRange(window.from, window.to)).map(window => ({ from: window.from, through: window.to, complete: true }));
  const distinct = distinctRecords(flights);
  const comparison = annualFlightComparison(domainStatisticsFlights(distinct.flights), through, coverage);
  const currentFrom = `${String(year).padStart(4, '0')}-01-01`;
  const previousYear = String(year - 1).padStart(4, '0');
  const previousThrough = `${previousYear}${through.slice(4)}`;
  const previousFrom = `${previousYear}-01-01`;
  const conflicting = new Set(distinct.conflictingIds);
  const comparisonHasSourceConflict = comparison.previous !== null && flights.some(flight => {
    if (!conflicting.has(flight.flightId)) return false;
    const date = recordedDate(flight);
    return date === null || date >= currentFrom && date <= through || date >= previousFrom && date <= previousThrough;
  });
  return {
    ...comparison,
    countChange: comparisonHasSourceConflict ? { percent: null, suppressedReason: 'pending-facts' as const } : comparison.countChange,
    knownMinutesChange: comparisonHasSourceConflict ? { percent: null, suppressedReason: 'pending-facts' as const } : comparison.knownMinutesChange,
    sourceConflictingIds: distinct.conflictingIds,
  };
}

export function statisticsYears(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], today: string): number[] {
  const years = new Set<number>([Number(today.slice(0, 4))]);
  for (const flight of flights) {
    const date = recordedDate(flight);
    if (date) years.add(Number(date.slice(0, 4)));
  }
  for (const window of saved) {
    if (!validStatisticsRange(window.from, window.to)) continue;
    const first = Number(window.from.slice(0, 4)), last = Number(window.to.slice(0, 4));
    if (Number.isInteger(first) && Number.isInteger(last) && last >= first && last - first <= 80) {
      for (let year = first; year <= last; year++) years.add(year);
    }
  }
  return [...years].filter(year => year > 0 && year <= Number(today.slice(0, 4))).sort((a, b) => b - a);
}

export function statisticsCoverageComplete(saved: readonly SavedFlightRetrieval[], from: string, to: string): boolean {
  if (!validStatisticsRange(from, to)) return false;
  const windows = saved.map(window => ({ from: window.from, to: window.to })).sort((a, b) => a.from.localeCompare(b.from));
  let cursor = from;
  for (const window of windows) {
    if (!validStatisticsRange(window.from, window.to)) continue;
    if (window.to < cursor) continue;
    if (window.from > cursor) return false;
    if (window.to >= to) return true;
    const next = new Date(`${window.to}T00:00:00.000Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next.toISOString().slice(0, 10);
  }
  return false;
}

export function monthFlightIds(flights: readonly RealFlightListItem[], year: number, month: number, through?: string): string[] {
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = through && through >= first && through <= `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${finalDay}` ? through : `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${finalDay}`;
  return distinctRecords(flights).flights.filter(flight => {
    const date = recordedDate(flight);
    return date !== null && date >= first && date <= last;
  }).sort((a, b) => (recordedDate(b) ?? '').localeCompare(recordedDate(a) ?? '') || a.flightId.localeCompare(b.flightId)).map(flight => flight.flightId);
}

export function dateFlightIds(flights: readonly RealFlightListItem[], from: string, to: string): string[] {
  if (!validStatisticsRange(from, to)) return [];
  return distinctRecords(flights).flights.filter(flight => {
    const date = recordedDate(flight);
    return date !== null && date >= from && date <= to;
  }).sort((a, b) => (recordedDate(b) ?? '').localeCompare(recordedDate(a) ?? '') || a.flightId.localeCompare(b.flightId)).map(flight => flight.flightId);
}


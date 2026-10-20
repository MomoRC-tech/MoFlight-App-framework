import { canonical, validateFlight, type Flight, type Crew, type Role } from './index';

/** Caller supplies one authorized snapshot and current revisions, never mixed owners. */
export interface StatisticsFilters {
  registration?: string; aircraft_model?: string;
  person_id?: string; crew_role?: Crew['role']; pilot_role?: Role;
}
export interface StatisticsCoverage { from: string; through: string; complete: boolean }
export const DURATION_BANDS = [
  { id: 'under-15', from: 0, through: 14 }, { id: '15-29', from: 15, through: 29 },
  { id: '30-59', from: 30, through: 59 }, { id: '60-119', from: 60, through: 119 },
  { id: '120-179', from: 120, through: 179 }, { id: '180-plus', from: 180, through: null },
] as const;

function date(value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Valid recorded calendar date required.');
}
function prepare(flights: readonly Flight[], filters: StatisticsFilters) {
  if (filters.crew_role && !filters.person_id) throw new Error('Stable person identity required for crew role.');
  for (const value of [filters.registration, filters.aircraft_model, filters.person_id]) if (value !== undefined && (typeof value !== 'string' || !value.trim())) throw new Error('Nonempty statistics filter required.');
  if (filters.crew_role !== undefined && !['PIC', 'instructor', 'companion'].includes(filters.crew_role)) throw new Error('Unsupported crew role.');
  if (filters.pilot_role !== undefined && !['PIC', 'Dual', 'FI'].includes(filters.pilot_role)) throw new Error('Unsupported own role.');
  const groups = new Map<string, Map<string, Flight>>();
  for (const flight of flights) {
    validateFlight(flight);
    if (flight.minutes !== null && !Number.isSafeInteger(flight.minutes)) throw new Error('Safe integer recorded minutes required.');
    const variants = groups.get(flight.id) ?? new Map<string, Flight>();
    variants.set(canonical(flight), flight); groups.set(flight.id, variants);
  }
  const selected: Flight[] = [], conflictingIds: string[] = [], unknownFilterIds: string[] = [];
  for (const [id, variants] of groups) {
    // No revision order is implied by input order. The caller must resolve conflicts.
    if (variants.size !== 1) { conflictingIds.push(id); continue; }
    const flight = [...variants.values()][0]!;
    if ((filters.registration && flight.registration !== null && flight.registration !== filters.registration) ||
        (filters.aircraft_model && flight.aircraft_model !== null && flight.aircraft_model !== filters.aircraft_model) ||
        (filters.pilot_role && flight.pilot_role !== null && flight.pilot_role !== filters.pilot_role)) continue;
    if (filters.person_id && flight.crew.length && !flight.crew.some(c => c.person_id === filters.person_id && (!filters.crew_role || c.role === filters.crew_role))) continue;
    if ((filters.registration && flight.registration === null) || (filters.aircraft_model && flight.aircraft_model === null) ||
        (filters.pilot_role && flight.pilot_role === null) || (filters.person_id && !flight.crew.length)) { unknownFilterIds.push(id); continue; }
    selected.push(flight);
  }
  return { selected: selected.sort((a, b) => a.id.localeCompare(b.id)), conflictingIds: conflictingIds.sort(), unknownFilterIds: unknownFilterIds.sort() };
}

/** Uses recorded duration only: never clocks, paper adjustments or inferred credit. */
export function durationDistribution(flights: readonly Flight[], filters: StatisticsFilters = {}) {
  const { selected, ...pending } = prepare(flights, filters);
  return {
    bands: DURATION_BANDS.map(band => {
      const supportingIds = selected.filter(f => f.minutes !== null && f.minutes >= band.from && (band.through === null || f.minutes <= band.through)).map(f => f.id);
      return { ...band, count: supportingIds.length, supportingIds };
    }),
    unknownDurationIds: selected.filter(f => f.minutes === null).map(f => f.id),
    ...pending,
  };
}

function covered(coverage: readonly StatisticsCoverage[], from: string, through: string): boolean {
  let next = from;
  for (const interval of [...coverage].filter(c => c.complete).sort((a, b) => a.from.localeCompare(b.from))) {
    if (interval.through < next) continue;
    if (interval.from > next) return false;
    if (interval.through >= through) return true;
    const following = new Date(interval.through + 'T00:00:00.000Z'); following.setUTCDate(following.getUTCDate() + 1);
    next = following.toISOString().slice(0, 10);
  }
  return false;
}
function period(flights: readonly Flight[], coverage: readonly StatisticsCoverage[], from: string, through: string) {
  const rows = flights.filter(f => f.date !== null && f.date >= from && f.date <= through);
  const known = rows.filter(f => f.minutes !== null);
  const knownMinutes = known.reduce((sum, f) => {
    const next = sum + f.minutes!;
    if (!Number.isSafeInteger(next)) throw new Error('Recorded minute total exceeds safe integer range.');
    return next;
  }, 0);
  return { from, through, coverageComplete: covered(coverage, from, through), count: rows.length,
    knownMinutes: known.length || !rows.length ? knownMinutes : null,
    supportingIds: rows.map(f => f.id), unknownDurationIds: rows.filter(f => f.minutes === null).map(f => f.id) };
}

/** Explicit coverage is supplied evidence, not inferred from the flights present. */
export function annualFlightComparison(flights: readonly Flight[], cutoff: string, coverage: readonly StatisticsCoverage[], filters: StatisticsFilters = {}) {
  date(cutoff);
  const year = Number(cutoff.slice(0, 4));
  if (year < 2) throw new Error('A prior calendar year is required.');
  for (const interval of coverage) {
    date(interval.from); date(interval.through);
    if (interval.from > interval.through || typeof interval.complete !== 'boolean') throw new Error('Invalid statistics coverage.');
  }
  const { selected, ...pending } = prepare(flights, filters);
  const unknownDateIds = selected.filter(f => f.date === null).map(f => f.id);
  const current = period(selected, coverage, `${cutoff.slice(0, 4)}-01-01`, cutoff);
  const previousYear = String(year - 1).padStart(4, '0');
  const previousCutoff = previousYear + cutoff.slice(4);
  const previous = cutoff.slice(5) === '02-29' ? null : period(selected, coverage, `${previousYear}-01-01`, previousCutoff);
  const sharedReason = !previous ? 'unsupported-leap-day' :
    !current.coverageComplete || !previous.coverageComplete ? 'incomplete-coverage' :
    pending.conflictingIds.length || pending.unknownFilterIds.length || unknownDateIds.length ? 'pending-facts' : null;
  const countReason = sharedReason ?? (previous!.count === 0 ? 'zero-baseline' : null);
  const timeReason = sharedReason ?? (current.unknownDurationIds.length || previous!.unknownDurationIds.length ? 'unknown-durations' : previous!.knownMinutes === 0 ? 'zero-baseline' : null);
  return { state: previous ? 'supported' as const : 'unsupported-leap-day' as const, cutoff, current, previous,
    coverage: coverage.map(c => ({ ...c })), unknownDateIds, ...pending,
    countChange: { percent: countReason === null ? (current.count - previous!.count) / previous!.count * 100 : null, suppressedReason: countReason },
    knownMinutesChange: { percent: timeReason === null ? (current.knownMinutes! - previous!.knownMinutes!) / previous!.knownMinutes! * 100 : null, suppressedReason: timeReason } };
}

import type { Flight } from '../../../../packages/flight-logbook/src/index';

export interface FlightSelection {
  year: number | null;
  search: string;
  category: 'all' | 'training';
}

/** Work on the supplied account-scoped snapshot; repeated identities are not extra flights. */
function uniqueFlights(flights: readonly Flight[]): Flight[] {
  const seen = new Set<string>();
  return flights.filter(flight => {
    if (seen.has(flight.id)) return false;
    seen.add(flight.id);
    return true;
  });
}

export function flightYears(flights: readonly Flight[]): number[] {
  return [...new Set(uniqueFlights(flights).flatMap(flight => flight.date ? [Number(flight.date.slice(0, 4))] : []))]
    .sort((a, b) => b - a);
}

/** Date ordering is a presentation order, never evidence that an ambiguous flight was the latest. */
export function selectFlights(flights: readonly Flight[], selection: FlightSelection): Flight[] {
  const search = selection.search.trim().toLocaleLowerCase('de-DE');
  const filtered = uniqueFlights(flights).filter(flight => {
    if (selection.year !== null && (!flight.date || Number(flight.date.slice(0, 4)) !== selection.year)) return false;
    if (selection.category === 'training' && flight.pilot_role !== 'Dual' && flight.pilot_role !== 'FI') return false;
    if (!search) return true;
    return [flight.date, flight.registration, flight.aircraft_model, flight.start_place,
      flight.landing_place, flight.pilot_role, flight.remarks, ...flight.crew.map(member => member.name)]
      .some(value => value?.toLocaleLowerCase('de-DE').includes(search));
  });
  const days = new Map<string, Flight[]>();
  for (const flight of filtered) {
    const date = flight.date ?? '';
    const group = days.get(date) ?? [];
    group.push(flight);
    days.set(date, group);
  }
  return [...days.entries()].sort(([a], [b]) => b.localeCompare(a)).flatMap(([date, group]) => {
    // Partial or mixed-basis clocks cannot establish a reliable within-day order.
    if (date && group.every(flight => flight.start !== null && flight.time_basis === 'UTC')) {
      return group.sort((a, b) => b.start!.localeCompare(a.start!));
    }
    return group;
  });
}

export function summarizeFlights(flights: readonly Flight[]) {
  const unique = uniqueFlights(flights);
  const known = unique.filter((flight): flight is Flight & { minutes: number } => flight.minutes !== null);
  const unknownDurationCount = unique.length - known.length;
  const knownMinutes = known.length ? known.reduce((sum, flight) => sum + flight.minutes, 0) : null;
  return {
    count: unique.length,
    knownMinutes,
    unknownDurationCount,
    averageMinutes: knownMinutes !== null && unknownDurationCount === 0 ? knownMinutes / unique.length : null,
  };
}

/** A rounded average may be formatted, but an unknown duration is never rendered as zero. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return '—';
  const rounded = Math.round(minutes);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`;
}

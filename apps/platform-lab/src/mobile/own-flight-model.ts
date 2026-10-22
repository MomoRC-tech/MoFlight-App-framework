import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RawField } from '../vereinsflieger/fields';

export interface OwnFlightRequest { year: number | null; dateRange?: {from:string;to:string} | null; flightId?: string }
export interface OwnFlightFilters { dateRange?: {from:string;to:string} | null; search: string; year: number | null; registration: string | null | undefined }
export const allOwnFlights: OwnFlightFilters = { search: '', year: null, registration: undefined };
export const ownRawValue = (field: RawField): string | null => field.state === 'value' ? field.raw : null;
export function ownFlightYears(flights: readonly RealFlightListItem[]): number[] {
  return [...new Set(flights.flatMap(f => f.facts.assessment.date.value ? [Number(f.facts.assessment.date.value.slice(0, 4))] : []))].sort((a,b)=>b-a);
}
export function ownFlightRegistrations(flights: readonly RealFlightListItem[]): string[] {
  return [...new Set(flights.flatMap(f => { const value = ownRawValue(f.facts.assessment.fields.registration); return value === null ? [] : [value]; }))].sort((a,b)=>a.localeCompare(b,'de'));
}
/** Text labels are searched as recorded; names/registrations never become identity or credit. */
export function selectOwnFlights(flights: readonly RealFlightListItem[], filters: OwnFlightFilters): RealFlightListItem[] {
  const needle = filters.search.trim().toLocaleLowerCase('de-DE');
  const seen = new Set<string>();
  return flights.filter(flight => {
    if (seen.has(flight.flightId)) return false;
    seen.add(flight.flightId);
    const a = flight.facts.assessment;
    if (filters.dateRange && (a.date.state !== 'parsed' || a.date.value < filters.dateRange.from || a.date.value > filters.dateRange.to)) return false;
    if (filters.year !== null && (a.date.state !== 'parsed' || a.date.value.slice(0,4) !== String(filters.year))) return false;
    if (filters.registration !== undefined && ownRawValue(a.fields.registration) !== filters.registration) return false;
    return !needle || [flight.sourceFlightRef, a.date.value, ...a.observation.row.values]
      .some(value => value?.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a,b)=>(b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''));
}

/** Exact saved identity, never a repeated provider source ID or list position. */
export function requestedOwnFlight(flights: readonly RealFlightListItem[], request: OwnFlightRequest): RealFlightListItem | null {
  if (!request.flightId) return null;
  return selectOwnFlights(flights, { ...allOwnFlights, year: request.year, dateRange: request.dateRange }).find(f => f.flightId === request.flightId) ?? null;
}

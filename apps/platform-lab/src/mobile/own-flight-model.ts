import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RawField } from '../vereinsflieger/fields';

export interface OwnFlightFilters { search: string; year: number | null; registration: string | null | undefined }
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
  return flights.filter(flight => {
    const a = flight.facts.assessment;
    if (filters.year !== null && a.date.value?.slice(0,4) !== String(filters.year)) return false;
    if (filters.registration !== undefined && ownRawValue(a.fields.registration) !== filters.registration) return false;
    return !needle || [flight.sourceFlightRef, a.date.value, ...a.observation.row.values]
      .some(value => value?.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a,b)=>(b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''));
}

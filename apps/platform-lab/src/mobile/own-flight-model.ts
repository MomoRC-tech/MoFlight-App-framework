import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RawField } from '../vereinsflieger/fields';
import { formatReportedMinutes } from './real-flight-statistics';
import { aircraftCategoryLabels, launchMethodLabels, classifyAircraft, classifyLaunch, type AircraftCategory, type LaunchMethod } from './flight-classification';

export interface OwnFlightRequest { year: number | null; dateRange?: {from:string;to:string} | null; flightId?: string; flightIds?:readonly string[] }
export interface OwnFlightFilters { dateRange?: {from:string;to:string} | null; flightIds?:readonly string[]; search: string; year: number | null; registration: string | null | undefined; aircraftCategory?: AircraftCategory; launchMethod?: LaunchMethod }
export const allOwnFlights: OwnFlightFilters = { search: '', year: null, registration: undefined };
export const ownRawValue = (field: RawField): string | null => field.state === 'value' ? field.raw : null;

export function ownFlightClassification(flight: RealFlightListItem) {
  const a = flight.facts.assessment;
  const category = classifyAircraft(a), launch = classifyLaunch(a);
  return { category, launch, categoryLabel: aircraftCategoryLabels[category.key], launchLabel: launchMethodLabels[launch.key] };
}
/** Options come from this owner's entire saved list, independent of active filters. */
export function ownFlightClassificationOptions(flights: readonly RealFlightListItem[]) {
  const categories = new Set(flights.map(f => classifyAircraft(f.facts.assessment).key));
  const launches = new Set(flights.map(f => classifyLaunch(f.facts.assessment).key));
  return {
    categories: (Object.keys(aircraftCategoryLabels) as AircraftCategory[]).filter(key => categories.has(key)).map(key => ({ key, label: aircraftCategoryLabels[key] })),
    launches: (Object.keys(launchMethodLabels) as LaunchMethod[]).filter(key => launches.has(key)).map(key => ({ key, label: launchMethodLabels[key] })),
  };
}

export type OwnFlightFilterKey = 'year' | 'dateRange' | 'registration' | 'search' | 'flightIds' | 'aircraftCategory' | 'launchMethod';
export function ownFlightFilterTags(filters: OwnFlightFilters): { key: OwnFlightFilterKey; label: string }[] {
  return [
    ...(filters.flightIds ? [{key:'flightIds' as const,label:`AI-Belege: ${filters.flightIds.length}`}] : []),
    ...(filters.year !== null ? [{ key: 'year' as const, label: String(filters.year) }] : []),
    ...(filters.dateRange ? [{ key: 'dateRange' as const, label: `${filters.dateRange.from} – ${filters.dateRange.to}` }] : []),
    ...(filters.registration !== undefined ? [{ key: 'registration' as const, label: filters.registration ?? 'Kennzeichen unbekannt' }] : []),
    ...(filters.aircraftCategory !== undefined ? [{ key: 'aircraftCategory' as const, label: aircraftCategoryLabels[filters.aircraftCategory] }] : []),
    ...(filters.launchMethod !== undefined ? [{ key: 'launchMethod' as const, label: launchMethodLabels[filters.launchMethod] }] : []),
    ...(filters.search.trim() ? [{ key: 'search' as const, label: `Suche: ${filters.search.trim()}` }] : []),
  ];
}
export function removeOwnFlightFilter(filters: OwnFlightFilters, key: OwnFlightFilterKey): OwnFlightFilters {
  return { ...filters, [key]: key === 'search' ? '' : key === 'year'||key==='dateRange' ? null : undefined };
}

/** Display only: retain all given names, abbreviate the family name; never match identities. */
function crewName(field: RawField): string {
  if (field.state !== 'value') return 'unbekannt';
  return field.raw.split(/\r?\n/).map(line => {
    const text = line.replace(/\s+/g, ' ').trim();
    const comma = text.split(',').map(part => part.trim());
    if (comma.length === 2 && comma.every(Boolean)) return `${comma[1]} ${[...comma[0]!][0]}.`;
    if (comma.length > 1) return 'Name unklar';
    const words = text.split(' ');
    return words.length > 1 ? `${words.slice(0, -1).join(' ')} ${[...words.at(-1)!][0]}.` : text;
  }).filter(Boolean).join(' · ') || 'unbekannt';
}

/** Raw flight mode/type must explicitly say solo. Empty or missing crew never proves it. */
export function ownFlightCard(flight: RealFlightListItem) {
  const a = flight.facts.assessment, fields = a.fields;
  const companions = [fields.companion, fields.companion2, fields.companion3].filter(field => field.state === 'value');
  const explicitSolo = [fields.flightMode, fields.flightType].some(field => field.state === 'value' && /^(solo|alleinflug)$/i.test(field.raw.trim()));
  const differentPic = fields.pic.state === 'value' && (fields.pilot.state !== 'value' || fields.pic.raw.trim() !== fields.pilot.raw.trim());
  const solo = explicitSolo && fields.pilot.state === 'value' && !companions.length && fields.sic.state !== 'value' && !differentPic;
  const crew = [{ role: 'Pilot', name: crewName(fields.pilot) },
    ...(differentPic ? [{ role: 'PIC', name: crewName(fields.pic) }] : []),
    ...(!solo ? [{ role: 'Begl.', name: companions.length ? companions.map(crewName).join(' · ') : 'unbekannt' }] : []),
    ...(fields.sic.state === 'value' ? [{ role: 'SIC', name: crewName(fields.sic) }] : []),
  ];
  const raw = (field: RawField, unknown: string) => ownRawValue(field) ?? unknown;
  const duration = a.durations.flight;
  return {
    date: a.date.state === 'parsed' ? `${a.date.value.slice(8)}.${a.date.value.slice(5, 7)}.${a.date.value.slice(2, 4)}` : 'Datum unklar',
    registration: raw(fields.registration, 'Kennzeichen unbekannt'), model: raw(fields.model, 'Muster unbekannt'),
    start: a.clocks.start.state === 'parsed' ? a.clocks.start.value : 'Start unbekannt',
    route: `${raw(fields.departure, 'Ort unbekannt')} → ${raw(fields.arrival, 'Ort unbekannt')}`,
    duration: duration.state === 'known' ? formatReportedMinutes(duration.minutes) : duration.state === 'unknown' ? '—' : 'Zeit unklar',
    knownDuration: duration.state === 'known', solo, crew,
  };
}
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
      if(filters.flightIds&&!filters.flightIds.includes(flight.flightId))return false;
    if (seen.has(flight.flightId)) return false;
    seen.add(flight.flightId);
    const a = flight.facts.assessment;
    if (filters.dateRange && (a.date.state !== 'parsed' || a.date.value < filters.dateRange.from || a.date.value > filters.dateRange.to)) return false;
    if (filters.year !== null && (a.date.state !== 'parsed' || a.date.value.slice(0,4) !== String(filters.year))) return false;
    if (filters.registration !== undefined && ownRawValue(a.fields.registration) !== filters.registration) return false;
    if (filters.aircraftCategory !== undefined && classifyAircraft(a).key !== filters.aircraftCategory) return false;
    if (filters.launchMethod !== undefined && classifyLaunch(a).key !== filters.launchMethod) return false;
    return !needle || [flight.sourceFlightRef, a.date.value, ...a.observation.row.values]
      .some(value => value?.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a,b)=>(b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''));
}

/** Exact saved identity, never a repeated provider source ID or list position. */
export function requestedOwnFlight(flights: readonly RealFlightListItem[], request: OwnFlightRequest): RealFlightListItem | null {
  if (!request.flightId) return null;
  return selectOwnFlights(flights, { ...allOwnFlights, year: request.year, dateRange: request.dateRange }).find(f => f.flightId === request.flightId) ?? null;
}

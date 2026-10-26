import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RawField } from '../vereinsflieger/fields';
import { formatReportedMinutes } from './real-flight-statistics';
import { aircraftCategoryLabels, launchMethodLabels, classifyAircraft, classifyLaunch, type AircraftCategory, type LaunchMethod } from './flight-classification';
import { classifyFlightRoleMetric, flightRoleShortLabels, type FlightRoleMetric } from './flight-role-metric';

export interface OwnFlightRequest { year: number | null; dateRange?: {from:string;to:string} | null; flightId?: string; flightIds?:readonly string[] }
export interface OwnFlightFilters { dateRange?: {from:string;to:string} | null; flightIds?:readonly string[]; search: string; year: number | null; registration: string | null | undefined; aircraftCategory?: AircraftCategory; launchMethod?: LaunchMethod; flightRole?: FlightRoleMetric }
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
export function ownFlightRoleOptions(flights: readonly RealFlightListItem[]) {
  const available = new Set(flights.map(flight => classifyFlightRoleMetric(flight.facts.assessment).key));
  return (['solo','dualInstruction','picWithCompanion','unresolved'] as const)
    .filter(key => available.has(key)).map(key => ({ key, label: flightRoleShortLabels[key] }));
}

export type OwnFlightFilterKey = 'year' | 'dateRange' | 'registration' | 'search' | 'flightIds' | 'aircraftCategory' | 'launchMethod' | 'flightRole';
export function ownFlightFilterTags(filters: OwnFlightFilters): { key: OwnFlightFilterKey; label: string }[] {
  return [
    ...(filters.flightIds ? [{key:'flightIds' as const,label:`AI-Belege: ${filters.flightIds.length}`}] : []),
    ...(filters.year !== null ? [{ key: 'year' as const, label: String(filters.year) }] : []),
    ...(filters.dateRange ? [{ key: 'dateRange' as const, label: `${filters.dateRange.from} – ${filters.dateRange.to}` }] : []),
    ...(filters.registration !== undefined ? [{ key: 'registration' as const, label: filters.registration ?? 'Kennzeichen unbekannt' }] : []),
    ...(filters.aircraftCategory !== undefined ? [{ key: 'aircraftCategory' as const, label: aircraftCategoryLabels[filters.aircraftCategory] }] : []),
    ...(filters.launchMethod !== undefined ? [{ key: 'launchMethod' as const, label: launchMethodLabels[filters.launchMethod] }] : []),
    ...(filters.flightRole !== undefined ? [{ key: 'flightRole' as const, label: flightRoleShortLabels[filters.flightRole] }] : []),
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

/** Read-only display grouping by full source name, never by initials or a cross-flight identity. */
export function ownFlightCrew(flight: RealFlightListItem) {
  const { fields, observation } = flight.facts.assessment;
  const people = new Map<string, { full: string; roles: Set<string> }>();
  const canonical = (value: string) => {
    const parts=value.normalize('NFC').trim().replace(/\s+/g,' ').split(',').map(v=>v.trim());
    return parts.length===2 && parts.every(Boolean) ? `${parts[1]} ${parts[0]}` : parts.join(', ');
  };
  const add = (raw: string, role: string) => {
    for(const line of raw.split(/\r?\n/).filter(v=>v.trim())) {
      const full=canonical(line), key=full.toLocaleLowerCase('de-DE');
      const person=people.get(key)??{full,roles:new Set<string>()};person.roles.add(role);people.set(key,person);
    }
  };
  for(const [field,role] of [[fields.pic,'PIC'],[fields.sic,'SIC'],[fields.pilot,'Pilot'],[fields.companion,'Begl.'],[fields.companion2,'Begl.'],[fields.companion3,'Begl.']] as const) {
    if(field.state==='value')add(field.raw,role);
  }
  // Only an explicitly named instructor field proves FI; Begleiter/FI and FI-Time do not.
  observation.headers.forEach((label,index)=>{if(['FI','Fluglehrer','Instructor'].includes(label))add(observation.row.values[index]??'','FI');});
  const values=[...people.values()];
  const explicitSolo=[fields.flightMode,fields.flightType].some(f=>f.state==='value'&&/^(solo|alleinflug)$/i.test(f.raw.trim()));
  const companions=[fields.companion,fields.companion2,fields.companion3].some(f=>f.state==='value'&&!!f.raw.trim());
  const sole=values.length===1?values[0]:undefined;
  const solo=!!sole&&!companions&&!sole.roles.has('SIC')&&(sole.roles.has('PIC')||explicitSolo);
  const short=(full:string)=>crewName({state:'value',label:'display',raw:full});
  const crew=values.map(person=>{
    const roles=['PIC','FI','SIC','Pilot','Begl.'].filter(role=>person.roles.has(role));
    const specific=roles.filter(role=>!['Pilot','Begl.'].includes(role));
    const abbreviation=short(person.full);
    return {role:(specific.length?specific:roles.includes('Pilot')?['Pilot']:['Begl.']).join('/'),name:values.some(other=>other!==person&&short(other.full)===abbreviation)?person.full:abbreviation};
  });

  return {crew,solo,soloSource:solo?(explicitSolo?'explicit':'one-pic') : null,
    picKnown:values.some(p=>p.roles.has('PIC')),instructor:values.some(p=>p.roles.has('FI'))?'recorded':solo?'none-recorded':'unknown'} as const;
}

export function ownFlightCard(flight: RealFlightListItem) {
  const a = flight.facts.assessment, fields = a.fields;
  const {crew,solo,soloSource,picKnown,instructor}=ownFlightCrew(flight);
  const raw = (field: RawField, unknown: string) => ownRawValue(field) ?? unknown;
  const duration = a.durations.flight;
  return {
    date: a.date.state === 'parsed' ? `${a.date.value.slice(8)}.${a.date.value.slice(5, 7)}.${a.date.value.slice(2, 4)}` : '',
    registration: raw(fields.registration, ''), model: raw(fields.model, ''),
    start: a.clocks.start.state === 'parsed' ? a.clocks.start.value : '',
    route: [ownRawValue(fields.departure),ownRawValue(fields.arrival)].filter(Boolean).join(' → '),
    duration: duration.state === 'known' ? formatReportedMinutes(duration.minutes) : '',
    knownDuration: duration.state === 'known', solo, crew, soloSource, picKnown, instructor,
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
    if (filters.flightRole !== undefined && classifyFlightRoleMetric(a).key !== filters.flightRole) return false;
    return !needle || [flight.sourceFlightRef, a.date.value, ...a.observation.row.values]
      .some(value => value?.toLocaleLowerCase('de-DE').includes(needle));
  }).sort((a,b)=>(b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''));
}

/** Exact saved identity, never a repeated provider source ID or list position. */
export function requestedOwnFlight(flights: readonly RealFlightListItem[], request: OwnFlightRequest): RealFlightListItem | null {
  if (!request.flightId) return null;
  return selectOwnFlights(flights, { ...allOwnFlights, year: request.year, dateRange: request.dateRange }).find(f => f.flightId === request.flightId) ?? null;
}

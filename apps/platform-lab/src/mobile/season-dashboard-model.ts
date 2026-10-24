import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { planFlightRetrieval, type SavedFlightRetrieval, type FlightRetrievalWindow } from '../vereinsflieger/retrieval-policy';
import type { RawField } from '../vereinsflieger/fields';
import { abbreviatedMemberName } from '../provider/member-name';

export interface SeasonMonth extends FlightRetrievalWindow {
  year: number; month: number; future: boolean; covered: boolean;
  count: number | null; knownMinutes: number | null; unknownDurationCount: number;
}
const iso = (year: number, month: number, day: number) => `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
/** One saved identity is one flight. Unknown dates never enter a calendar bucket. */
export function monthlySeason(flights: readonly RealFlightListItem[], saved: readonly SavedFlightRetrieval[], today: string): SeasonMonth[][] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const periods = planFlightRetrieval(saved, new Date(year, month - 1, day, 12)).periods;
  return monthlySeasonForCoverage(flights, periods, today);
}
/** Receipt timestamps are deliberately outside the monthly statistics input. */
export function monthlySeasonForCoverage(flights: readonly RealFlightListItem[], periods: readonly FlightRetrievalWindow[], today: string): SeasonMonth[][] {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const seen = new Set<string>();
  const unique = flights.filter(f => { if(seen.has(f.flightId)) return false; seen.add(f.flightId); return true; });
  return [year, year - 1].map(y => Array.from({ length: 12 }, (_, i) => {
    const m = i + 1, last = new Date(y, m, 0, 12).getDate();
    const from = iso(y, m, 1), to = iso(y, m, m === month ? Math.min(day, last) : last);
    const future = m > month;
    const covered = !future && periods.some(p => p.from <= from && p.to >= to);
    const rows = future ? [] : unique.filter(f => { const d = f.facts.assessment.date; return d.state === 'parsed' && d.value >= from && d.value <= to; });
    let minutes = 0, known = 0;
    for (const f of rows) if (f.facts.assessment.durations.flight.state === 'known') {
      const value = f.facts.assessment.durations.flight.minutes;
      if (!Number.isSafeInteger(value) || value < 0) throw new Error('Unsafe monthly reported minutes.');
      minutes += value; known++;
      if (!Number.isSafeInteger(minutes) || minutes < 0) throw new Error('Unsafe monthly reported minutes.');
    }
    return {year:y, month:m, from, to, future, covered, count:future || (!rows.length && !covered) ? null : rows.length,
      knownMinutes:future || (!known && (rows.length > 0 || !covered)) ? null : minutes, unknownDurationCount:rows.length-known};
  }));
}
/** Two distinct saved flights by recorded date. Unknown clocks never imply an order. */
export function latestSavedFlights(flights: readonly RealFlightListItem[]): RealFlightListItem[] {
  const seen = new Set<string>();
  const dated = flights.filter(f => {
    if (seen.has(f.flightId) || f.facts.assessment.date.state !== 'parsed') return false;
    seen.add(f.flightId); return true;
  });
  const uncertainDays = new Set(dated.filter(f=>f.facts.assessment.clocks.start.state!=='parsed').map(f=>f.facts.assessment.date.value));
  return dated.sort((a,b)=>{
    const day=b.facts.assessment.date.value!.localeCompare(a.facts.assessment.date.value!);
    if(day) return day;
    const clock=uncertainDays.has(a.facts.assessment.date.value)?0:b.facts.assessment.clocks.start.value!.localeCompare(a.facts.assessment.clocks.start.value!);
    return clock || a.flightId.localeCompare(b.flightId);
  }).slice(0,2);
}
/** Stable ID ordering is not evidence of which flight happened last that day. */
export function latestFlightOrderUnknown(flights: readonly RealFlightListItem[], latest: RealFlightListItem | undefined): boolean {
  if (!latest) return false;
  const day = latest.facts.assessment.date.value;
  const rows = new Map<string, RealFlightListItem>();
  for (const flight of flights) {
    if (flight.facts.assessment.date.state === 'parsed' && flight.facts.assessment.date.value === day && !rows.has(flight.flightId)) rows.set(flight.flightId, flight);
  }
  if (rows.size < 2) return false;
  return [...rows.values()].some(flight => flight.facts.assessment.clocks.start.state !== 'parsed'
    || flight.flightId !== latest.flightId && flight.facts.assessment.clocks.start.value === latest.facts.assessment.clocks.start.value);
}
/** Abbreviate display text only; no identity or role is inferred. */
export function abbreviatedCrew(field: RawField): string {
  if (field.state !== 'value') return 'unbekannt';
  return abbreviatedMemberName(field.raw) || 'unbekannt';
}

/** Calendar-day age avoids DST/clock drift and never assigns an age to an unknown date. */
export function flightRelativeAge(date: string | null, today: string): string {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
    const time = Date.parse(value+'T00:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? time : NaN;
  };
  const days = date ? Math.round((parse(today)-parse(date))/86_400_000) : NaN;
  if (!Number.isFinite(days)) return 'Datum unbekannt';
  if (days < 0) return 'Zukünftiges Datum';
  if (days === 0) return 'Heute';
  if (days < 14) return `−${days} ${days===1?'Tag':'Tage'}`;
  return `−${Math.floor(days/7)} Wochen`;
}

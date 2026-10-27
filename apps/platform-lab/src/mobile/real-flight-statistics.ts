import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { colorForAircraft, type AircraftSeasonShare } from './season-model';
import { isSourceDuplicate, sourceDuplicateState } from './flight-duplicate';

function safeAdd(total: number, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(total + value)) {
    throw new Error('Reported statistics exceed non-negative safe integer range.');
  }
  return total + value;
}

/** One deduplicated selected-account snapshot; season uses the same facts as library totals. */
export function summarizeRealFlights(flights: readonly RealFlightListItem[], seasonYear?: number) {
  const seen = new Set<string>();
  const years = new Map<string, number>();
  const aircraft = new Map<string, number>();
  const seasonAircraft = new Map<string, AircraftSeasonShare>();
  const season = { count: 0, knownMinutes: 0, knownDurationCount: 0, unknownDurationCount: 0,
    conflictingDurationCount: 0, aircraft: [] as AircraftSeasonShare[] };
  let count = 0, knownMinutes = 0, knownDurationCount = 0, unknownDurationCount = 0;
  let unknownDateCount = 0, unknownAircraftCount = 0, conflictingDurationCount = 0;
  let excludedDuplicateCount = 0, unknownDuplicateCount = 0;
  for (const flight of flights) {
    if (seen.has(flight.flightId)) continue;
    seen.add(flight.flightId);
    if (isSourceDuplicate(flight)) { excludedDuplicateCount++; continue; }
    if (sourceDuplicateState(flight.facts.assessment.fields.duplicate) === 'unknown') unknownDuplicateCount++;
    count = safeAdd(count, 1);
    const a = flight.facts.assessment;
    const year = a.date.state === 'parsed' && a.date.value ? a.date.value.slice(0, 4) : null;
    if (year !== null) years.set(year, safeAdd(years.get(year) ?? 0, 1));
    else unknownDateCount = safeAdd(unknownDateCount, 1);
    const registration = a.fields.registration.state === 'value' ? a.fields.registration.raw : null;
    if (registration === null) unknownAircraftCount = safeAdd(unknownAircraftCount, 1);
    const name = registration ?? 'Kennzeichen unbekannt';
    aircraft.set(name, safeAdd(aircraft.get(name) ?? 0, 1));
    const duration = a.durations.flight;
    const conflict = duration.state === 'conflict' || duration.state === 'invalid';
    if (duration.state === 'known') { knownMinutes = safeAdd(knownMinutes, duration.minutes); knownDurationCount = safeAdd(knownDurationCount, 1); }
    else { unknownDurationCount = safeAdd(unknownDurationCount, 1); if (conflict) conflictingDurationCount = safeAdd(conflictingDurationCount, 1); }
    if (year !== String(seasonYear)) continue;
    season.count = safeAdd(season.count, 1);
    const share = seasonAircraft.get(name) ?? { aircraft: name, color: colorForAircraft(name), count: 0, knownMinutes: null, unknownDurationCount: 0 };
    share.count = safeAdd(share.count, 1);
    if (duration.state === 'known') {
      season.knownMinutes = safeAdd(season.knownMinutes, duration.minutes);
      season.knownDurationCount = safeAdd(season.knownDurationCount, 1);
      share.knownMinutes = safeAdd(share.knownMinutes ?? 0, duration.minutes);
    } else {
      season.unknownDurationCount = safeAdd(season.unknownDurationCount, 1);
      share.unknownDurationCount = safeAdd(share.unknownDurationCount, 1);
      if (conflict) season.conflictingDurationCount = safeAdd(season.conflictingDurationCount, 1);
    }
    seasonAircraft.set(name, share);
  }
  season.aircraft = [...seasonAircraft.values()].sort((a, b) => a.aircraft.localeCompare(b.aircraft, 'de-DE'));
  return { count, knownMinutes, knownDurationCount, unknownDurationCount, conflictingDurationCount, excludedDuplicateCount, unknownDuplicateCount,
    unknownDateCount, unknownAircraftCount, season,
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, flights]) => ({ year, flights })),
    aircraft: [...aircraft].sort(([a], [b]) => a.localeCompare(b, 'de-DE')).map(([registration, flights]) => ({ registration, flights })) };
}

export function formatReportedMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';

/** Deterministic summary of one already-authorized selected-account library snapshot. */
export function summarizeRealFlights(flights: readonly RealFlightListItem[]) {
  const seen = new Set<string>();
  const years = new Map<string, number>();
  const aircraft = new Map<string, number>();
  let count = 0, knownMinutes = 0, knownDurationCount = 0, unknownDurationCount = 0;
  let unknownDateCount = 0, unknownAircraftCount = 0, conflictingDurationCount = 0;
  for (const flight of flights) {
    if (seen.has(flight.flightId)) continue;
    seen.add(flight.flightId);
    count++;
    const a = flight.facts.assessment;
    if (a.date.state === 'parsed' && a.date.value) {
      const year = a.date.value.slice(0, 4);
      years.set(year, (years.get(year) ?? 0) + 1);
    } else unknownDateCount++;
    const registration = a.fields.registration.state === 'value' ? a.fields.registration.raw : null;
    if (registration === null) unknownAircraftCount++;
    aircraft.set(registration ?? 'Kennzeichen unbekannt', (aircraft.get(registration ?? 'Kennzeichen unbekannt') ?? 0) + 1);
    if (a.durations.flight.state === 'known') { knownMinutes += a.durations.flight.minutes; knownDurationCount++; }
    else { unknownDurationCount++; if (a.durations.flight.state === 'conflict' || a.durations.flight.state === 'invalid') conflictingDurationCount++; }
  }
  if (!Number.isSafeInteger(knownMinutes)) throw new Error('Reported duration total exceeds safe integer range.');
  return { count, knownMinutes, knownDurationCount, unknownDurationCount, conflictingDurationCount,
    unknownDateCount, unknownAircraftCount,
    years: [...years].sort(([a], [b]) => b.localeCompare(a)).map(([year, flights]) => ({ year, flights })),
    aircraft: [...aircraft].sort(([a], [b]) => a.localeCompare(b, 'de-DE')).map(([registration, flights]) => ({ registration, flights })) };
}

export function formatReportedMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

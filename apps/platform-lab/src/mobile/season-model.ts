import type { Flight } from '@moflight/flight-logbook';

const aircraftColors = ['#46ccff', '#48dba5', '#3595fe', '#a794ff', '#f9b65b', '#f48bb4'];

export interface AircraftSeasonShare {
  aircraft: string;
  color: string;
  count: number;
  knownMinutes: number | null;
  unknownDurationCount: number;
}

/** Stable registration colors connect the count and time distributions, independent of ordering. */
export function colorForAircraft(aircraft: string): string {
  let hash = 0;
  for (const character of aircraft) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return aircraftColors[hash % aircraftColors.length]!;
}

/** Receives the selected account/book/year snapshot; no unknown time becomes zero time. */
export function aircraftSeasonShares(flights: readonly Flight[]): AircraftSeasonShare[] {
  const aircraft = new Map<string, AircraftSeasonShare>();
  const seen = new Set<string>();
  for (const flight of flights) {
    if (seen.has(flight.id)) continue;
    seen.add(flight.id);
    const registration = flight.registration?.trim().toLocaleUpperCase('de-DE') || 'Kennzeichen unbekannt';
    const share = aircraft.get(registration) ?? {
      aircraft: registration, color: colorForAircraft(registration), count: 0,
      knownMinutes: null, unknownDurationCount: 0,
    };
    share.count += 1;
    if (flight.minutes === null) share.unknownDurationCount += 1;
    else share.knownMinutes = (share.knownMinutes ?? 0) + flight.minutes;
    aircraft.set(registration, share);
  }
  return [...aircraft.values()].sort((a, b) => a.aircraft.localeCompare(b.aircraft, 'de-DE'));
}

export interface RingSlice { color: string; start: number; sweep: number }

export interface SeasonDifference {
  value: number | null;
  direction: 'up' | 'down' | 'equal' | 'unknown';
  text: string;
}

/** Difference of saved numeric totals, not a claim of equal or complete periods. */
export function seasonDifference(current: number | null, previous: number | null, measure: 'starts' | 'minutes'): SeasonDifference {
  for (const value of [current, previous]) {
    if (value !== null && (!Number.isSafeInteger(value) || value < 0)) throw new Error('Unsafe season comparison total.');
  }
  if (current === null || previous === null) return { value: null, direction: 'unknown', text: '—' };
  const value = current - previous, magnitude = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const formatted = measure === 'starts' ? String(magnitude) : magnitude % 60 === 0
    ? `${magnitude / 60} h` : `${Math.floor(magnitude / 60)}:${String(magnitude % 60).padStart(2, '0')} h`;
  return { value, direction: value > 0 ? 'up' : value < 0 ? 'down' : 'equal', text: sign + formatted };
}

/** Angles describe a distribution, never progress toward an unstated target. Zero has no arc. */
export function seasonRingSlices(shares: readonly AircraftSeasonShare[], measure: 'count' | 'knownMinutes'): RingSlice[] {
  const values = shares.map(share => ({ color: share.color, value: share[measure] ?? 0 })).filter(share => share.value > 0);
  const total = values.reduce((sum, share) => sum + share.value, 0);
  let start = -90;
  return values.map(share => {
    const sweep = share.value / total * 360;
    const slice = { color: share.color, start, sweep };
    start += sweep;
    return slice;
  });
}

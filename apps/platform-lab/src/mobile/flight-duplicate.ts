import type { RawField } from '../vereinsflieger/fields';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';

/** Observed list markers only; no inference from similar dates, crew or times. */
export function sourceDuplicateState(field: RawField | undefined): 'duplicate' | 'not-marked' | 'unknown' {
  if (field?.state !== 'value') return 'unknown';
  const value = field.raw.trim();
  return value === 'Ja' ? 'duplicate' : value === 'Nein' ? 'not-marked' : 'unknown';
}

/** Unknown evidence retains the existing provisional totals, never verified credit. */
export function isSourceDuplicate(flight: RealFlightListItem): boolean {
  return sourceDuplicateState(flight.facts.assessment.fields.duplicate) === 'duplicate';
}

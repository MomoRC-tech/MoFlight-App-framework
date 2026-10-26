import type { SourceFlightAssessment } from '../vereinsflieger/source-assessment';
import type { RawField } from '../vereinsflieger/fields';

export type FlightRoleMetric = 'dualInstruction' | 'solo' | 'picWithCompanion' | 'unresolved';
export const flightRoleShortLabels: Record<FlightRoleMetric, string> = {
  solo: 'Solo', dualInstruction: 'Dual', picWithCompanion: 'PIC+', unresolved: 'Prüfen',
};
export interface FlightRoleResult {
  key: FlightRoleMetric;
  soloWithPermission: boolean;
  reason: string;
}

// Compare full same-flight source names only. An abbreviated or multiple-person
// cell is not a stable identity and cannot establish a role match.
function person(field: RawField): string | null {
  if (field.state !== 'value') return null;
  const raw = field.raw.normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!raw || /[\r\n;/]/.test(field.raw)) return null;
  const parts = raw.split(',').map(part => part.trim());
  const name = parts.length === 2 && parts.every(Boolean) ? `${parts[1]} ${parts[0]}` : parts.length === 1 ? raw : '';
  return name && !/\b\p{L}\./u.test(name) ? name.toLocaleLowerCase('de-DE') : null;
}

function roleMinutes(field: RawField): number | null {
  if (field.state !== 'value') return null;
  const match = /^(\d{2,}):([0-5]\d)$/.exec(field.raw.trim());
  if (!match) return null;
  const value = Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(value) ? value : null;
}

const unresolved = (reason: string): FlightRoleResult => ({ key: 'unresolved', soloWithPermission: false, reason });

/** Read-only analytical grouping, not licence, legal command or book credit. */
export function classifyFlightRoleMetric(assessment: SourceFlightAssessment): FlightRoleResult {
  const { fields } = assessment;
  const pilot = person(fields.pilot), pic = person(fields.pic), companion = person(fields.companion);
  if (!pilot || !pic) return unresolved('Pilot or PIC is missing or ambiguous');
  const extraFields = [fields.companion2, fields.companion3].filter(field => field.state === 'value' && field.raw.trim());
  const extras = extraFields.map(person);
  if (extras.some(name => !name) || new Set([pilot, companion, ...extras]).size !== 2 + extras.length) return unresolved('Companion names are missing, repeated or ambiguous');
  const sic = person(fields.sic);
  if (fields.sic.state === 'value' && (!sic || sic !== pilot && sic !== companion || sic === pic)) return unresolved('SIC conflicts with recorded occupants or PIC');
  if (companion && companion === pilot) return unresolved('Pilot and companion cannot be distinguished');
  const dual = roleMinutes(fields.dualTime), pilotPicTime = roleMinutes(fields.picTime);
  if (!companion) {
    if (extras.length) return unresolved('Additional occupants prevent solo classification');
    if (fields.companion.state !== 'blank') return unresolved('Companion presence is unknown or ambiguous');
    if (pic !== pilot) return unresolved('PIC differs from the sole recorded pilot');
    if (sic) return unresolved('Solo has a recorded SIC');
    if (dual !== null && dual > 0 || fields.dualTime.state === 'value' && dual === null) return unresolved('Solo conflicts with dual-time evidence');
    return { key: 'solo',
      soloWithPermission: fields.flightPermission.state === 'value' && !!fields.flightPermission.raw.trim(),
      reason: 'Pilot is recorded PIC and no companion is recorded' };
  }
  if (pic === companion) {
    if (extras.length) return unresolved('Additional occupants on a dual flight require review');
    if (pilotPicTime !== null && pilotPicTime > 0 || fields.picTime.state === 'value' && pilotPicTime === null) return unresolved('Pilot PIC-time conflicts with dual instruction');
    if (sic === pilot && dual !== null && dual > 0) return { key: 'dualInstruction', soloWithPermission: false, reason: 'Pilot is SIC, companion is PIC and dual time is positive' };
    return unresolved('Companion is PIC but pilot SIC or positive dual time is missing');
  }
  if (pic === pilot) {
    if (sic) return unresolved('Recorded SIC is not a passenger');
    if (dual !== null && dual > 0 || fields.dualTime.state === 'value' && dual === null) return unresolved('Pilot PIC conflicts with dual-time evidence');
    return { key: 'picWithCompanion', soloWithPermission: false, reason: 'Pilot is recorded PIC with one or more different companions and no SIC or dual time' };
  }
  return unresolved('PIC does not match a recorded occupant');
}

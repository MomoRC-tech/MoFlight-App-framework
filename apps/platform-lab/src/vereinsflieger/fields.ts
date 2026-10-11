import type { ProbeRow, ProbeSnapshot } from './probe';

// Lab inventory of observed personal-list labels. No legal-credit inference,
// category guessing, numeric conversion or book/output mapping takes place here.
export const CAPTURE_FIELDS = {
  date: ['Datum'], registration: ['Lfz.'], model: ['Lfz.-Muster'], aircraftType: ['Luftfahrzeugart'],
  pilot: ['Pilot'], pic: ['PIC'], companion: ['Begleiter/FI'], companion2: ['Begleiter 2'], companion3: ['Begleiter 3'], sic: ['SIC'],
  start: ['Start'], landing: ['Landung'], flightDuration: ['Flugzeit'], flightDurationFormatted: ['Flugzeit in hh:mm'],
  offBlock: ['Off-Block'], onBlock: ['On-Block'], blockMinutes: ['Blockzeit in Minuten'], blockFormatted: ['Blockzeit in hh:mm'],
  picTime: ['PIC-Time'], dualTime: ['Dual-Time'], instructorTime: ['FI-Time'],
  launch: ['S.-Art'], flightType: ['Flugart'], flightMode: ['Flugmodus'],
  departure: ['Startort'], arrival: ['Landeort'], landings: ['Landungen'], distance: ['Km'],
  duplicate: ['Duplikat'], club: ['Verein'], remarks: ['Bemerkung'],
  engineStart: ['M.-Start'], engineEnd: ['M.-Ende'], engineDuration: ['Motorzeit'],
  trainingAssociation: ['Ausbildungsschritt zugeordnet'],
  ownCostsPaid: ['Eigene Kosten (Bezahlt)', 'Eigene Kosten(Bezahlt)'], billingStatus: ['Abgerechnet'], billingCode: ['Abr.'],
  guestLandingFees: ['Gast/Landegeb.'], checkIn: ['CheckIn'], checkOut: ['CheckOut'], dutyTime: ['Flugdienstzeit'],
  towAircraft: ['Schlepp-Lfz'], towHeight: ['Schlepphöhe'], towTime: ['Schleppzeit'], winch: ['Winde'], flightPermission: ['Fluggenehmigung von'],
} as const;

export type CaptureField = keyof typeof CAPTURE_FIELDS;
export type RawField =
  | { state: 'not-captured' }
  | { state: 'blank'; label: string; raw: string }
  | { state: 'value'; label: string; raw: string };

// Derived view of an existing snapshot: the stored raw payload stays unchanged.
// A value means source text exists, not that its meaning/value is validated.
export function inspectFields(snapshot: Pick<ProbeSnapshot, 'headers'>, row: ProbeRow): Record<CaptureField, RawField> {
  if (row.values.length !== snapshot.headers.length || new Set(snapshot.headers.filter(Boolean)).size !== snapshot.headers.filter(Boolean).length) {
    throw new Error('Ambiguous capture columns.');
  }
  const result = {} as Record<CaptureField, RawField>;
  for (const field of Object.keys(CAPTURE_FIELDS) as CaptureField[]) {
    const labels: readonly string[] = CAPTURE_FIELDS[field];
    const index = snapshot.headers.findIndex(label => labels.includes(label));
    if (index < 0) result[field] = { state: 'not-captured' };
    else {
      const raw = row.values[index]!;
      result[field] = { state: raw.trim() ? 'value' : 'blank', label: snapshot.headers[index]!, raw };
    }
  }
  return result;
}

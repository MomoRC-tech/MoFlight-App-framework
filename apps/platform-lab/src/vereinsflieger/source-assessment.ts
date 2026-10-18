import { inspectListDurations } from './durations';
import { inspectFields, type CaptureField, type RawField } from './fields';
import type { ProbeRow, ProbeSnapshot } from './probe';

export type ParsedSourceField = { source: RawField } & (
  | { state: 'not-captured' | 'blank' | 'invalid'; value: null }
  | { state: 'parsed'; value: string }
);
type ClockField = 'start' | 'landing' | 'offBlock' | 'onBlock';
export interface AssessmentFinding {
  code: 'missing-value' | 'invalid-date' | 'invalid-clock' | 'unknown-duration' | 'invalid-duration' | 'conflicting-duration' |
    'unverified-identity' | 'unknown-time-basis' | 'unknown-landing-day' | 'unresolved-crew-credit' | 'unresolved-aircraft-class' | 'unverified-duplicate-policy';
  // Points to raw fields below. Identity refers to the candidate reference in
  // observation.row, not a verified account/club/flight key.
  fields: CaptureField[];
}
export interface SourceFlightAssessment {
  observation: { captureId: string; rowIndex: number; headers: string[]; row: ProbeRow };
  fields: Record<CaptureField, RawField>;
  date: ParsedSourceField;
  clocks: Record<ClockField, ParsedSourceField>;
  durations: ReturnType<typeof inspectListDurations>;
  semantics: {
    sourceIdentity: 'unverified'; timeBasis: 'unknown'; landingDayOffset: null;
    crewCredit: 'unresolved'; aircraftClass: 'unresolved'; duplicatePolicy: 'unverified';
  };
  findings: AssessmentFinding[];
}

function parsedField(source: RawField, parse: (text: string) => string | null): ParsedSourceField {
  if (source.state !== 'value') return { source, state: source.state, value: null };
  const value = parse(source.raw.trim());
  return value === null ? { source, state: 'invalid', value: null } : { source, state: 'parsed', value };
}
function calendarDate(text: string): string | null {
  // The legacy visible-list reader supports one/two-digit German day/month;
  // current window captures use padded German dates or ISO calendar dates.
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text);
  const iso = german ? `${german[3]}-${german[2]!.padStart(2, '0')}-${german[1]!.padStart(2, '0')}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !Number.isFinite(Date.parse(iso))) return null;
  return new Date(iso).toISOString().slice(0, 10) === iso ? iso : null;
}
function clock(text: string): string | null {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
}

// Inspect one existing decoded observation. This is not a source adapter's
// attestation, ownership boundary, canonical Flight mapper or write plan.
export function assessSourceFlight(snapshot: Pick<ProbeSnapshot, 'captureId' | 'headers' | 'rows'>, rowIndex: number): SourceFlightAssessment {
  if (!snapshot || !Array.isArray(snapshot.rows) || !Number.isSafeInteger(rowIndex) || rowIndex < 0) {
    throw new Error('Invalid source observation selection. Raw capture unchanged.');
  }
  const row = snapshot.rows[rowIndex];
  if (!row ||
      typeof snapshot.captureId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(snapshot.captureId) ||
      !Array.isArray(snapshot.headers) || !snapshot.headers.length || snapshot.headers.length > 128 || !snapshot.headers.every(h => typeof h === 'string' && h.length <= 100) ||
      !Array.isArray(row.values) || !row.values.every(v => typeof v === 'string' && v.length <= 4096) ||
      (row.sourceFlightId !== null && (typeof row.sourceFlightId !== 'string' || !/^\d{1,20}$/.test(row.sourceFlightId)))) {
    throw new Error('Invalid source observation selection. Raw capture unchanged.');
  }
  // Clone only the selected observation. Unrecognized future columns and raw
  // class/duplicate/engine/role-time evidence remain exactly as captured.
  const observation = { captureId: snapshot.captureId, rowIndex, headers: [...snapshot.headers], row: { sourceFlightId: row.sourceFlightId, values: [...row.values] } };
  const fields = inspectFields(observation, observation.row);
  const date = parsedField(fields.date, calendarDate);
  const clocks = {
    start: parsedField(fields.start, clock), landing: parsedField(fields.landing, clock),
    offBlock: parsedField(fields.offBlock, clock), onBlock: parsedField(fields.onBlock, clock),
  };
  const durations = inspectListDurations(observation, observation.row);
  const findings: AssessmentFinding[] = [];
  const checkField = (field: CaptureField, result: ParsedSourceField, invalid: 'invalid-date' | 'invalid-clock') => {
    if (result.state === 'invalid') findings.push({ code: invalid, fields: [field] });
    else if (result.state !== 'parsed') findings.push({ code: 'missing-value', fields: [field] });
  };
  checkField('date', date, 'invalid-date');
  for (const field of ['start', 'landing', 'offBlock', 'onBlock'] as const) checkField(field, clocks[field], 'invalid-clock');
  for (const duration of [durations.flight, durations.block]) {
    if (duration.state !== 'known') findings.push({
      code: duration.state === 'unknown' ? 'unknown-duration' : duration.state === 'conflict' ? 'conflicting-duration' : 'invalid-duration',
      fields: duration.evidence.map(value => value.field),
    });
  }
  findings.push(
    { code: 'unverified-identity', fields: [] },
    { code: 'unknown-time-basis', fields: ['start', 'landing', 'offBlock', 'onBlock'] },
    { code: 'unknown-landing-day', fields: ['date', 'start', 'landing'] },
    { code: 'unresolved-crew-credit', fields: ['pilot', 'pic', 'companion', 'companion2', 'companion3', 'sic', 'picTime', 'dualTime', 'instructorTime'] },
    { code: 'unresolved-aircraft-class', fields: ['registration', 'model', 'aircraftType'] },
    { code: 'unverified-duplicate-policy', fields: ['duplicate'] },
  );
  return { observation, fields, date, clocks, durations,
    semantics: { sourceIdentity: 'unverified', timeBasis: 'unknown', landingDayOffset: null, crewCredit: 'unresolved', aircraftClass: 'unresolved', duplicatePolicy: 'unverified' },
    findings };
}

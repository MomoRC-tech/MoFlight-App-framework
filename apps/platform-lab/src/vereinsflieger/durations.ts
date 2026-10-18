import { inspectFields, type CaptureField, type RawField } from './fields';
import type { ProbeRow, ProbeSnapshot } from './probe';

type DurationField = Extract<CaptureField, 'flightDuration' | 'flightDurationFormatted' | 'blockMinutes' | 'blockFormatted'>;
export type DurationEvidence = { field: DurationField; source: RawField } & (
  | { state: 'not-captured' | 'blank' | 'invalid'; minutes: null }
  | { state: 'parsed'; minutes: number }
);
export type ReportedDuration = { evidence: DurationEvidence[] } & (
  | { state: 'unknown' | 'invalid' | 'conflict'; minutes: null }
  | { state: 'known'; minutes: number }
);

function inspect(field: DurationField, source: RawField, unit: 'minutes' | 'hh:mm'): DurationEvidence {
  if (source.state !== 'value') return { field, source, state: source.state, minutes: null };
  const text = source.raw.trim();
  // List labels have recorded unit meanings. No decimal-hour, detail-page,
  // role-time or engine-meter interpretation belongs to this bounded parser.
  const match = unit === 'minutes' ? /^(\d+)$/.exec(text) : /^(\d{2,}):([0-5]\d)$/.exec(text);
  const minutes = !match ? NaN : unit === 'minutes' ? Number(match[1]) : Number(match[1]) * 60 + Number(match[2]);
  return Number.isSafeInteger(minutes) && minutes >= 0
    ? { field, source, state: 'parsed', minutes }
    : { field, source, state: 'invalid', minutes: null };
}

function reconcile(evidence: DurationEvidence[]): ReportedDuration {
  if (evidence.some(value => value.state === 'invalid')) return { state: 'invalid', minutes: null, evidence };
  const parsed = evidence.filter(value => value.state === 'parsed');
  const first = parsed[0];
  if (!first) return { state: 'unknown', minutes: null, evidence };
  if (parsed.some(value => value.minutes !== first.minutes)) return { state: 'conflict', minutes: null, evidence };
  return { state: 'known', minutes: first.minutes, evidence };
}

// Pure derived list evidence; canonical import remains gated.
// "known" means supported reported duration, not verified identity, time basis,
// flight boundaries or legal credit. Never derive a duration from raw clocks.
export function inspectListDurations(snapshot: Pick<ProbeSnapshot, 'headers'>, row: ProbeRow): { flight: ReportedDuration; block: ReportedDuration } {
  const fields = inspectFields(snapshot, row);
  return {
    flight: reconcile([
      inspect('flightDuration', fields.flightDuration, 'minutes'),
      inspect('flightDurationFormatted', fields.flightDurationFormatted, 'hh:mm'),
    ]),
    block: reconcile([
      inspect('blockMinutes', fields.blockMinutes, 'minutes'),
      inspect('blockFormatted', fields.blockFormatted, 'hh:mm'),
    ]),
  };
}

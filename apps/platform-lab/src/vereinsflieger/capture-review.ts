import { validateCapture, type ProbeSnapshot } from './probe';
import type { RawField } from './fields';
import type { ReportedDuration } from './durations';
import { assessSourceFlight, type ParsedSourceField } from './source-assessment';

export const REVIEW_PAGE_SIZE = 5;

// The store and bridge already validate captures. Validate again at this read-only
// presentation boundary; unsupported evidence is preserved, never repaired here.
export function openCaptureReview(input: unknown): ProbeSnapshot {
  return validateCapture(input);
}

export function captureReviewPage(snapshot: ProbeSnapshot, page: number) {
  const pages = Math.max(1, Math.ceil(snapshot.rows.length / REVIEW_PAGE_SIZE));
  if (!Number.isSafeInteger(page) || page < 0 || page >= pages) throw new Error('Invalid capture review page.');
  const offset = page * REVIEW_PAGE_SIZE;
  return { pages, offset, flights: snapshot.rows.slice(offset, offset + REVIEW_PAGE_SIZE).map((_, i) => assessSourceFlight(snapshot, offset + i)) };
}

export function reviewRawField(field: RawField): string {
  return field.state === 'not-captured' ? 'Nicht erfasst' : field.state === 'blank' ? 'Leer im Anbieterbeleg' : field.raw;
}

export function reviewParsedField(field: ParsedSourceField): string {
  if (field.state === 'parsed') return field.value;
  return field.state === 'invalid' ? `Ungültig: ${reviewRawField(field.source)}` : reviewRawField(field.source);
}

export function reviewDuration(duration: ReportedDuration): string {
  switch (duration.state) {
    case 'known': return `${duration.minutes} min (gemeldet)`;
    case 'conflict': return 'Widersprüchliche Anbieterwerte';
    case 'invalid': return 'Ungültiger Anbieterwert';
    case 'unknown': return duration.evidence.some(e => e.state === 'blank') ? 'Unbekannt · leer im Anbieterbeleg' : 'Unbekannt · nicht erfasst';
  }
}

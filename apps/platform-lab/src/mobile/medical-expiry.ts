import type { InformationCapture } from '../vereinsflieger/information';

export type MedicalExpiryState = 'unknown' | 'expired' | 'soon' | 'later';
export interface MedicalExpiryAssessment {
  date: string | null;
  state: MedicalExpiryState;
  issues: string[];
}

interface CalendarDate { year: number; month: number; day: number }
type ParsedExpiry = { state: 'date'; value: CalendarDate } | { state: 'blank' | 'invalid' | 'ambiguous' };

function leapYear(year: number) { return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0); }
function daysInMonth(year: number, month: number) {
  return month === 2 ? leapYear(year) ? 29 : 28 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}
function ordinal(value: CalendarDate) { return value.year * 10_000 + value.month * 100 + value.day; }
function display(value: CalendarDate) { return `${String(value.day).padStart(2, '0')}.${String(value.month).padStart(2, '0')}.${String(value.year).padStart(4, '0')}`; }

/**
 * Accept only the observed German date token, optionally followed by the
 * observed middle-dot reference suffix. General date parsing is deliberately
 * avoided because these values are untrusted source text.
 */
function parseRecordedExpiry(raw: string): ParsedExpiry {
  const value = raw.trim();
  if (!value) return { state: 'blank' };
  const match = /^(\d{2})\.(\d{2})\.(\d{4})(?: · (\S[^\r\n]*))?$/.exec(value);
  if (!match) {
    const dateTokens = value.match(/\b\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\b/g) ?? [];
    return { state: dateTokens.length > 1 ? 'ambiguous' : 'invalid' };
  }
  // A second date hidden inside the suffix makes the source value ambiguous.
  const suffix = match[4] ?? '';
  if (/\b\d{1,4}[./-]\d{1,2}[./-]\d{2,4}\b/.test(suffix)) return { state: 'ambiguous' };
  const valueDate = { day: Number(match[1]), month: Number(match[2]), year: Number(match[3]) };
  if (valueDate.year < 1 || valueDate.month < 1 || valueDate.month > 12 || valueDate.day < 1 || valueDate.day > daysInMonth(valueDate.year, valueDate.month)) {
    return { state: 'invalid' };
  }
  return { state: 'date', value: valueDate };
}

function timestampDate(now: number): CalendarDate | null {
  if (!Number.isFinite(now)) return null;
  const today = new Date(now);
  if (!Number.isFinite(today.getTime())) return null;
  return { year: today.getFullYear(), month: today.getMonth() + 1, day: today.getDate() };
}

function sixCalendarMonthsAfter(value: CalendarDate): CalendarDate {
  const index = value.year * 12 + value.month - 1 + 6;
  const year = Math.floor(index / 12), month = index % 12 + 1;
  return { year, month, day: Math.min(value.day, daysInMonth(year, month)) };
}

/** Text keeps the calendar relationship explicit even when color is unavailable. */
export function medicalExpiryStatusText(state: MedicalExpiryState): string {
  switch (state) {
    case 'expired': return 'Datum liegt in der Vergangenheit';
    case 'soon': return 'Datum liegt innerhalb der nächsten sechs Kalendermonate';
    case 'later': return 'Datum liegt mehr als sechs Kalendermonate in der Zukunft';
    default: return 'Einordnung unbekannt';
  }
}

/** Classifies only recorded source expiry dates; it never makes an eligibility or fitness claim. */
export function medicalExpiry(capture: InformationCapture | null | undefined, now = Date.now()): MedicalExpiryAssessment {
  const issues: string[] = [];
  if (!capture) return { date: null, state: 'unknown', issues: ['Es sind keine gespeicherten Medical-Quellenangaben verfügbar.'] };

  // Row values are projected in capture.columns array order. column.index is
  // the original provider-table position and can be sparse (for example 2, 7).
  const classPosition = capture.columns.findIndex(column => column.key === 'kind');
  const expiryPosition = capture.columns.findIndex(column => column.key === 'expiry');
  if (classPosition < 0 || expiryPosition < 0) {
    return { date: null, state: 'unknown', issues: ['Klasse oder Ablaufdatum ist in der Quelle nicht eindeutig zugeordnet.'] };
  }
  if (!capture.rows.length) issues.push('In der erfassten Quelle wurde kein Medical-Datensatz gefunden.');
  if (capture.coverage.truncated) issues.push('Die Quelle ist teilweise erfasst; weitere Medical-Angaben können fehlen.');

  const dates: CalendarDate[] = [];
  const counts = new Map<string, number>();
  for (const row of capture.rows) {
    const classRaw = row.values[classPosition] ?? '';
    const expiryRaw = row.values[expiryPosition] ?? '';
    const className = classRaw.trim();
    if (!className) issues.push(`Medical-Klasse bei Datensatz ${row.position + 1} ist leer.`);
    else {
      const key = className.toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const parsed = parseRecordedExpiry(expiryRaw);
    if (parsed.state === 'date') dates.push(parsed.value);
    else if (parsed.state === 'blank') issues.push(`Ablaufdatum für ${className || `Datensatz ${row.position + 1}`} ist leer; Status unbekannt.`);
    else if (parsed.state === 'ambiguous') issues.push(`Ablaufdatum für ${className || `Datensatz ${row.position + 1}`} enthält mehrere mögliche Daten; Status unbekannt.`);
    else issues.push(`Ablaufdatum für ${className || `Datensatz ${row.position + 1}`} hat kein unterstütztes Datumsformat; Status unbekannt.`);
  }
  for (const [className, count] of counts) {
    if (count > 1) issues.push(`Mehrere Medical-Datensätze für ${className} sind nicht eindeutig zuzuordnen.`);
  }
  if (!dates.length) return { date: null, state: 'unknown', issues };

  const earliest = dates.reduce((a, b) => ordinal(a) <= ordinal(b) ? a : b);
  const today = timestampDate(now);
  if (!today) return { date: display(earliest), state: 'unknown', issues: [...issues, 'Das aktuelle Datum ist nicht verfügbar; eine zeitliche Einordnung ist unbekannt.'] };
  const expiryOrdinal = ordinal(earliest), todayOrdinal = ordinal(today), boundaryOrdinal = ordinal(sixCalendarMonthsAfter(today));
  const state: MedicalExpiryState = expiryOrdinal < todayOrdinal ? 'expired' : expiryOrdinal <= boundaryOrdinal ? 'soon' : 'later';
  return { date: display(earliest), state, issues };
}

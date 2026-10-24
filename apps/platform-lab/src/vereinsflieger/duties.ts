import { canonical } from '@moflight/flight-logbook';
import { abbreviatedMemberName } from '../provider/member-name';
import { validateInformationCapture, type InformationCapture } from './information';
import { validateScope, type ProviderScope } from './scope-store';

export const DUTY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** A replaceable, expiring source cache. Never a complete roster or stable club identity. */
export interface DutyRosterSnapshot {
  version: 1; scope: ProviderScope; retrievedAt: string; captures: InformationCapture[];
}
export interface DutyItem {
  key: string; duty: string; period: string; start: string | null; end: string | null;
  people: string[]; ownState: 'own' | 'unknown'; coAssignees: string[]; sourcePath: string;
  identity: 'source-row-only'; periodBasis: 'displayed-calendar-days' | 'unknown';
}
export interface DutyOverview {
  status: 'partial' | 'unavailable'; window: { start: string; end: string };
  items: DutyItem[]; ownItems: DutyItem[]; laterOwn: DutyItem[]; unplaced: DutyItem[];
  retrievedAt: string | null; clubLabel: string; coverageMessage: string;
  sources?: DutySourceCoverage[];
}
export interface DutySourceCoverage {
  source: 'own' | 'personal-list' | 'club';
  state: 'missing' | 'empty-page' | 'partial' | 'truncated';
  rowCount: number; inWindowCount: number; unknownPeriodCount: number;
  displayedInterval: { start: string; end: string } | null;
  pagination: 'unverified'; complete: false;
}
const ownPath = '/member/profile/myservices.php';
const paths = [ownPath, '/member/profile/allservicelist.php', '/member/community/serviceshedulelist.php'];
/** The UI window is a local filter; it is never evidence of the page's requested scope. */
function sourceCoverage(snapshot: DutyRosterSnapshot, window: { start: string; end: string }): DutySourceCoverage[] {
  return paths.map((path, index) => {
    const capture = snapshot.captures.find(c => c.path === path);
    const periodIndex = capture?.columns.findIndex(column => column.key === 'period') ?? -1;
    const periods = capture?.rows.map(row => parseDutyPeriod(row.values[periodIndex]!)) ?? [];
    const known = periods.filter((period): period is { start: string; end: string } => period !== null);
    return { source: (['own','personal-list','club'] as const)[index]!,
      state: !capture ? 'missing' : capture.coverage.truncated ? 'truncated' : capture.empty ? 'empty-page' : 'partial',
      rowCount: periods.length, inWindowCount: known.filter(p => p.start <= window.end && p.end >= window.start).length,
      unknownPeriodCount: periods.length - known.length,
      displayedInterval: known.length ? { start: known.map(p => p.start).sort()[0]!, end: known.map(p => p.end).sort().at(-1)! } : null,
      pagination: 'unverified', complete: false };
  });
}
export function dutyTimestamp(value: string): number {
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error('Invalid duty timestamp');
  return time;
}
function validDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day)) && new Date(day).toISOString().slice(0, 10) === day;
}
function isoDay(value: string) {
  const [d, m, y] = value.split('.'); const day = `${y}-${m}-${d}`;
  return validDay(day) ? day : null;
}
/** Only the observed German date/range shape; no guessed timezone or exclusive end. */
export function parseDutyPeriod(raw: string): { start: string; end: string } | null {
  const date = '(\\d{2}\\.\\d{2}\\.\\d{4})', clock = '(?: ([01]\\d|2[0-3]):([0-5]\\d))?';
  const text = raw.replace(/\s+/g, ' ').trim();
  const range = new RegExp(`^${date}${clock} - ${date}${clock}$`).exec(text);
  if (!range) return null;
  const start = isoDay(range[1]!), end = isoDay(range[4]!);
  if (!start || !end || start > end || start === end && range[2] && range[5] && `${range[2]}:${range[3]}` > `${range[5]}:${range[6]}`) return null;
  return { start, end };
}
export function dutyWindow(today: string) {
  if (!validDay(today)) throw new Error('Invalid duty calendar day');
  const date = new Date(today + 'T00:00:00.000Z'), weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 14 - weekday);
  return { start: today, end: date.toISOString().slice(0, 10) };
}
/** Display abbreviation only; never used to match people or establish ownership. */
export function abbreviateDutyName(raw: string) {
  return raw.split(/\r?\n/).map(line => {
    const text = line.replace(/\s+/g, ' ').trim();
    if (!text) return '';
    // A single source name must not collapse to one initial. Never expand an
    // initial or use this display label to infer identity or ownership.
    if (/^[^\s,]+$/.test(text)) return text;
    const comma = text.split(',').map(part => part.trim());
    if (comma.length === 2 && comma.every(Boolean)) return `${comma[1]} ${[...comma[0]!][0]}.`;
    if (comma.length > 1) return abbreviatedMemberName(text);
    const words = text.split(' ');
    return `${words.slice(0, -1).join(' ')} ${[...words.at(-1)!][0]}.`;
  }).filter(Boolean).join(' · ') || 'Name unbekannt';
}
export function createDutyRosterSnapshot(scope: ProviderScope, captures: InformationCapture[], retrievedAt: string): DutyRosterSnapshot {
  return validateDutyRosterSnapshot({ version: 1, scope, captures, retrievedAt });
}
export function validateDutyRosterSnapshot(input: unknown): DutyRosterSnapshot {
  const value = input as DutyRosterSnapshot;
  if (!value || value.version !== 1 || !Array.isArray(value.captures) || !value.captures.length || value.captures.length > 3 || Object.keys(value).sort().join(',') !== 'captures,retrievedAt,scope,version') throw new Error('Invalid duty snapshot');
  const scope = validateScope(value.scope), retrieved = dutyTimestamp(value.retrievedAt), seen = new Set<string>();
  const captures = value.captures.map(input => {
    const capture = validateInformationCapture(input);
    if (capture.category !== 'duties' || !paths.includes(capture.path) || capture.owner !== scope.owner || capture.connectionId !== scope.connectionId || dutyTimestamp(capture.retrievedAt) > retrieved || retrieved - dutyTimestamp(capture.retrievedAt) >= DUTY_RETENTION_MS || seen.has(capture.path)) throw new Error('Foreign, expired or ambiguous duty capture');
    seen.add(capture.path); return capture;
  });
  return { version: 1, scope, retrievedAt: value.retrievedAt, captures };
}
export function dutySnapshotExpiresAt(snapshot: DutyRosterSnapshot) {
  // Rewrapping old captures must never renew their retention.
  return Math.min(...snapshot.captures.map(capture => dutyTimestamp(capture.retrievedAt))) + DUTY_RETENTION_MS;
}
export function buildDutyOverview(scope: ProviderScope, input: DutyRosterSnapshot | null, today: string, now = Date.now()): DutyOverview {
  const validScope = validateScope(scope), window = dutyWindow(today);
  const base = { window, items: [], ownItems: [], laterOwn: [], unplaced: [], sources: [], retrievedAt: null, clubLabel: validScope.context.clubLabel };
  if (!input) return { ...base, status: 'unavailable', coverageMessage: 'Dienstplan unbekannt. Noch keine unterstützte Quelle erfasst.' };
  const snapshot = validateDutyRosterSnapshot(input);
  if (canonical(snapshot.scope) !== canonical(validScope)) throw new Error('Foreign duty roster');
  if (!Number.isFinite(now)) throw new Error('Invalid duty clock');
  if (now >= dutySnapshotExpiresAt(snapshot) || now < dutyTimestamp(snapshot.retrievedAt)) return { ...base, status: 'unavailable', coverageMessage: 'Dienstquelle abgelaufen oder zeitlich ungeprüft. Bitte erneut abrufen.' };
  const entries: DutyItem[] = snapshot.captures.flatMap(capture => {
    const index = (key: string) => capture.columns.findIndex(column => column.key === key);
    return capture.rows.map(row => {
      const duty = row.values[index('duty')]!, period = row.values[index('period')]!, parsed = parseDutyPeriod(period);
      const people = row.values[index('people')]!.split(/\r?\n/).filter(name => name.trim()).map(abbreviateDutyName);
      return { key: `${capture.id}:${row.position}`, duty, period, start: parsed?.start ?? null, end: parsed?.end ?? null, people, ownState: capture.path === ownPath ? 'own' as const : 'unknown' as const, coAssignees: [], sourcePath: capture.path, identity: 'source-row-only' as const, periodBasis: parsed ? 'displayed-calendar-days' as const : 'unknown' as const };
    });
  }).sort((a, b) => (a.start ?? '9999').localeCompare(b.start ?? '9999') || a.key.localeCompare(b.key));
  // No identity/name matching across rows. Missing person IDs and time semantics
  // leave cross-row co-assignee linkage explicitly unverified.
  const items = entries.filter(item => item.start && item.end && item.start <= window.end && item.end >= window.start);
  const sources = sourceCoverage(snapshot, window);
  return { status: 'partial', window, items, sources, ownItems: items.filter(item => item.ownState === 'own'), laterOwn: entries.filter(item => item.ownState === 'own' && item.start && item.start > window.end).slice(0, 3), unplaced: entries.filter(item => !item.start), retrievedAt: snapshot.retrievedAt, clubLabel: validScope.context.clubLabel, coverageMessage: (sources.some(s => s.state === 'truncated') ? 'Quellansicht am Erfassungslimit abgeschnitten. ' : '') + 'Erfasster Seitenausschnitt · Vollständigkeit, weitere Pläne/Seiten und nächste drei eigene Dienste ungeprüft. Personenbezug außerhalb der eigenen Liste und dienstgleiche Partner ungeprüft. Datumszuordnung nach angezeigten Kalendertagen; Zeitzone und Tagesgrenzen ungeprüft.' };
}

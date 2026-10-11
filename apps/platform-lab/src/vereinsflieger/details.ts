import { providerUrl } from './probe';

// Isolated lab contract. No canonical import, account binding or cost parsing.
export const DETAIL_LABELS = {
  'Allgemeine Daten': ['Eintrag', 'Erfasst', 'Datenquelle', 'Geändert', 'Verein', 'Kommentar'],
  Flugdaten: ['CallSign', 'Pilot', 'PIC', 'Begleiter / FI', 'Begleiter/FI', 'Begleiter', 'Begleiter 2', 'Begleiter 3', 'SIC', 'Fluggenehmigung von', 'Flugart', 'Flugmodus', 'Startart', 'Startort', 'Landeort', 'Landungen', 'Datum', 'Startzeit', 'Landezeit', 'Flugzeit', 'Winde', 'Off-Block', 'On-Block', 'Motorzeit', 'M.-Start', 'M.-Ende'],
} as const;
export type DetailSection = keyof typeof DETAIL_LABELS;
export interface DetailField { section: DetailSection; position: number; label: string; raw: string }
export interface DetailObservation {
  sourceFlightId: string; retrievedAt: string; fields: DetailField[];
  sourceIdentity: 'unverified'; costs: 'not-captured';
}
export function detailReference(value: string): string | null {
  if (!providerUrl(value)) return null;
  const u = new URL(value), keys = [...u.searchParams.keys()];
  const id = u.searchParams.get('flid');
  return u.pathname === '/member/profile/viewflight.php' && !u.hash && keys.length === 1 && keys[0] === 'flid' && id && /^\d{1,20}$/.test(id) ? id : null;
}

// DOM-only reader shared by the desktop proof and synthetic tests. It performs
// no navigation, requests, storage writes, form reads or native bridge calls.
export const DETAIL_READER_SOURCE = String.raw`(allowed) => {
  const url = location.href;
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(u.hostname) || u.username || u.password || u.port || u.pathname !== '/member/profile/viewflight.php') return { error: 'unexpected-page' };
  const tables = Array.from(document.querySelectorAll('table.view')).filter(t => Array.from(t.rows).some(r => r.cells[0]?.textContent.trim() === 'Eintrag'));
  if (tables.length !== 1) return { error: 'detail-table' };
  const fields = [];
  let section = null;
  const rows = Array.from(tables[0].rows);
  if (rows.length > 120) return { error: 'field-limit' };
  for (let position = 0; position < rows.length; position++) {
    const cells = Array.from(rows[position].cells);
    const label = (cells[0]?.textContent ?? '').trim();
    if (Object.prototype.hasOwnProperty.call(allowed, label) || label === 'Abrechnungsdaten') { section = label; continue; }
    if (!section || !Object.prototype.hasOwnProperty.call(allowed, section) || !allowed[section].includes(label)) continue;
    if (cells.length !== 2 || cells.some(c => c.querySelector('table'))) return { error: 'row-shape' };
    const raw = cells[1].innerText ?? cells[1].textContent ?? '';
    if (raw.length > 2048) return { error: 'field-limit' };
    fields.push({ section, position, label, raw });
  }
  return { url, fields };
}`;

export function decodeDetail(payload: unknown, expectedUrl: string, retrievedAt: string): DetailObservation {
  const id = detailReference(expectedUrl);
  if (!id || !payload || typeof payload !== 'object') throw new Error('Rejected detail context.');
  const p = payload as Record<string, unknown>;
  if (p.error || p.url !== expectedUrl || !Array.isArray(p.fields) || p.fields.length > 80) throw new Error('Unsupported detail page; earlier evidence preserved.');
  const fields: DetailField[] = [], seen = new Set<string>();
  let lastPosition = -1;
  for (const value of p.fields) {
    if (!value || typeof value !== 'object') throw new Error('Invalid detail field.');
    const f = value as Record<string, unknown>;
    if (typeof f.section !== 'string' || !Object.hasOwn(DETAIL_LABELS, f.section)) throw new Error('Unknown detail section.');
    const section = f.section as DetailSection;
    if (typeof f.label !== 'string' || !(DETAIL_LABELS[section] as readonly string[]).includes(f.label) || typeof f.raw !== 'string' || f.raw.length > 2048 || typeof f.position !== 'number' || !Number.isSafeInteger(f.position) || f.position <= lastPosition) throw new Error('Invalid detail provenance.');
    const key = section + ':' + f.label;
    if (seen.has(key)) throw new Error('Ambiguous detail label.');
    seen.add(key); lastPosition = f.position;
    fields.push({ section, position: f.position, label: f.label, raw: f.raw });
  }
  const raw = (section: DetailSection, label: string) => fields.find(f => f.section === section && f.label === label)?.raw.trim();
  if (raw('Allgemeine Daten', 'Eintrag') !== id || ['CallSign', 'Datum', 'Flugzeit'].some(label => !raw('Flugdaten', label))) throw new Error('Mismatched or incomplete detail anchors.');
  return { sourceFlightId: id, retrievedAt, fields, sourceIdentity: 'unverified', costs: 'not-captured' };
}

export function inspectDetail(observation: DetailObservation, section: DetailSection, label: string) {
  const field = observation.fields.find(f => f.section === section && f.label === label);
  return !field ? { state: 'not-captured' as const } : { state: field.raw.trim() ? 'value' as const : 'blank' as const, ...field };
}

export interface DetailTask { sourceFlightId: string; attempts: number; state: 'pending' | 'success' | 'error'; error?: 'session-required' | 'unsupported-detail' }
export interface DetailTrial { version: 1; scope: string; tasks: DetailTask[]; observations: DetailObservation[] }
export function createDetailTrial(scope: string, observedUrls: string[]): DetailTrial {
  const ids = observedUrls.map(detailReference);
  if (!scope.trim() || !ids.length || ids.length > 3 || ids.some(id => !id)) throw new Error('Expected one to three observed own-flight links and a provisional scope.');
  return { version: 1, scope, tasks: [...new Set(ids as string[])].map(sourceFlightId => ({ sourceFlightId, attempts: 0, state: 'pending' })), observations: [] };
}
// One attempt at a time: the caller persists the returned checkpoint before
// proceeding. Resolve links afresh from the own list; never enumerate IDs.
// Failed/expired responses retain every previous successful observation.
export function attemptDetail(trial: DetailTrial, scope: string, observedUrl: string, payload: unknown, at: string): DetailTrial {
  if (trial.scope !== scope) throw new Error('Changed trial scope.');
  const id = detailReference(observedUrl), index = trial.tasks.findIndex(t => t.sourceFlightId === id);
  if (index < 0) throw new Error('Unobserved trial flight.');
  const next = structuredClone(trial), task = next.tasks[index]!;
  task.attempts++;
  try {
    next.observations.push(decodeDetail(payload, observedUrl, at));
    task.state = 'success'; delete task.error;
  } catch {
    task.state = 'error';
    task.error = payload && typeof payload === 'object' && (payload as Record<string, unknown>).error === 'session-required' ? 'session-required' : 'unsupported-detail';
  }
  return next;
}

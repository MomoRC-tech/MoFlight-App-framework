// Pure domain: no Expo, SQLite, network, provider SDK or learning-domain imports.
export type Role = 'PIC' | 'Dual' | 'FI';
export interface Crew { person_id: string; name: string; role: 'PIC' | 'instructor' | 'companion' }
export interface Flight {
  id: string; date: string | null; start: string | null; landing: string | null;
  time_basis: string | null; minutes: number | null; registration: string | null;
  aircraft_model: string | null; pilot_role: Role | null; crew: Crew[];
  launch: string | null; start_place: string | null; landing_place: string | null;
  landings: number | null; remarks: string | null;
}
export interface Counters { minutes: number; pic_minutes: number; dual_minutes: number; fi_minutes: number; landings: number }
export interface Row { row: number; nr: number; flight: Flight; entry_state?: 'existing-context-do-not-copy' | 'new-copy' }
export interface Paper extends Row { page: number; evidence: string; confirmed_at: string; author: string }
export interface Page { id: string; page: number; rows: Row[]; carry: Counters; provenance: string; confirmed_at: string }
export interface Source { id: string; flights: Flight[]; raw_csv: string; retrieved_at: string; successful: boolean; coverage: { from: string; through: string; complete: boolean }; transport: string }
export interface Finding { id: string; flight_id: string; field: 'aircraft_model' | 'registration'; paper_value: string | null; rules: string }
export interface Decision { id: string; action: 'ignore' | 'override' | 'reverse'; value: string | null; evidence: string; reason: string; at: string; author: string }
export interface History {
  source: Source | null; lastAttempt: Source | null;
  flights: Flight[]; paper: Paper[]; findings: Finding[]; decisions: Decision[];
  source_references?: Record<string, string>;
}
export interface WritingPage { page: number; carry: Counters; rows: Row[]; page_total: Counters | null; cumulative_total: Counters | null }
export interface Template {
  id: string; dataset_id: string; revision: number; rules: string; presentation: string;
  source_id: string; decisions: Decision[]; findings: FindingStatus[]; pages: WritingPage[];
}
export interface FindingStatus extends Finding { source_value: string | null; status: 'open' | 'ignore' | 'override' | 'stale-review-required' }
export const RULES = 'synthetic-ten-row-v1';
export const counterKeys: (keyof Counters)[] = ['minutes', 'pic_minutes', 'dual_minutes', 'fi_minutes', 'landings'];

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical((value as Record<string, unknown>)[k])).join(',') + '}';
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error('Undefined evidence value');
  return result;
}
export function validateFlight(f: Flight): void {
  if (!f.id || !Array.isArray(f.crew)) throw new Error('Stable flight and crew identities required');
  for (const k of ['minutes', 'landings'] as const) {
    if (f[k] !== null && (!Number.isInteger(f[k]) || f[k]! < 0)) throw new Error('Integer minutes/landings required');
  }
  if (f.date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(f.date) || new Date(f.date).toISOString().slice(0, 10) !== f.date)) throw new Error('Invalid date');
  for (const t of [f.start, f.landing]) if (t !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new Error('Invalid time');
  if (![null, 'PIC', 'Dual', 'FI'].includes(f.pilot_role)) throw new Error('Unknown role');
  if (f.crew.some(c => !c.person_id || !['PIC', 'instructor', 'companion'].includes(c.role))) throw new Error('Established crew role required');
}
export function evidence(finding: Finding, flights: Flight[]): string {
  const f = flights.find(f => f.id === finding.flight_id);
  if (!f) throw new Error('Missing finding flight');
  return canonical({ flight_id: f.id, field: finding.field, source: f[finding.field], paper: finding.paper_value, rules: finding.rules });
}
export function findings(h: History): FindingStatus[] {
  return h.findings.map(f => {
    const d = h.decisions.find(d => d.id === f.id);
    return { ...f, source_value: h.flights.find(x => x.id === f.flight_id)![f.field], status:
      !d || d.action === 'reverse' ? 'open' : d.evidence !== evidence(f, h.flights) ? 'stale-review-required' : d.action };
  });
}
export function effective(h: History): Flight[] {
  return h.flights.map(f => {
    const copy = JSON.parse(canonical(f)) as Flight;
    for (const d of h.decisions) {
      const finding = h.findings.find(x => x.id === d.id && x.flight_id === f.id);
      if (finding && d.action === 'override' && d.evidence === evidence(finding, h.flights)) copy[finding.field] = d.value;
    }
    return copy;
  });
}
export interface Filters { registration?: string; aircraft_model?: string; person_id?: string; role?: Crew['role']; from?: string; through?: string; basis?: 'effective' | 'source' | 'paper' }
export function query(h: History, filters: Filters = {}) {
  if (filters.role && !filters.person_id) throw new Error('Select stable person ID before role');
  for (const d of [filters.from, filters.through]) if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d)) throw new Error('Invalid date filter');
  if (filters.from && filters.through && filters.from > filters.through) throw new Error('Invalid date range');
  const basis = filters.basis ?? 'effective';
  if (!['effective', 'source', 'paper'].includes(basis)) throw new Error('Invalid basis');
  const rows = basis === 'source' ? h.flights : basis === 'paper' ? h.paper.map(x => x.flight) : effective(h);
  const supporting: Flight[] = [], unknown: string[] = [];
  for (const f of rows) {
    if ((filters.registration && f.registration && filters.registration !== f.registration) || (filters.aircraft_model && f.aircraft_model && filters.aircraft_model !== f.aircraft_model)) continue;
    const crew = f.crew.filter(c => c.person_id === filters.person_id && (!filters.role || c.role === filters.role));
    if (filters.person_id && (f.crew.length || f.pilot_role === 'PIC') && !crew.length) continue;
    if (f.date && ((filters.from && f.date < filters.from) || (filters.through && f.date > filters.through))) continue;
    if (!f.date || (filters.registration && !f.registration) || (filters.aircraft_model && !f.aircraft_model) || (filters.person_id && !f.crew.length)) unknown.push(f.id);
    else supporting.push(f);
  }
  supporting.sort((a, b) => (a.date! + (a.start ?? '') + a.id).localeCompare(b.date! + (b.start ?? '') + b.id));
  const latestDate = supporting.at(-1)?.date ?? null;
  const candidates = supporting.filter(f => f.date === latestDate);
  const ordered = candidates.length > 0 && candidates.every(f => f.start && f.time_basis === 'UTC');
  const lastTime = ordered ? candidates.map(f => f.start!).sort().at(-1) : null;
  return { filters, basis, count: new Set(supporting.map(f => f.id)).size, supporting_flights: supporting,
    unknown_ids: unknown, latest_recorded_date: latestDate,
    latest_flight_ids: candidates.filter(f => !ordered || f.start === lastTime).map(f => f.id),
    latest_time_order: ordered ? 'UTC-start' : 'date-only-ambiguous-or-empty', coverage: h.source?.coverage ?? null,
    last_successful_import: h.source?.retrieved_at ?? null,
    latest_import_attempt: h.lastAttempt ? { at: h.lastAttempt.retrieved_at, successful: h.lastAttempt.successful } : null,
    data_through: rows.map(f => f.date).filter((x): x is string => x !== null).sort().at(-1) ?? null,
    source_references: Object.fromEntries(supporting.map(f => [f.id, basis === 'paper' ? h.paper.find(p => p.flight.id === f.id)?.evidence ?? 'unknown' : h.source_references?.[f.id] ?? 'unknown'])),
    offline_cached: true, findings: findings(h), limitation: 'Available recorded coverage only; zero does not mean never.' };
}
export function counters(f: Flight): Counters {
  if (f.minutes === null || f.landings === null || !f.pilot_role) throw new Error('Unknown counters require feedback');
  return { minutes: f.minutes, landings: f.landings, pic_minutes: f.pilot_role === 'PIC' ? f.minutes : 0,
    dual_minutes: f.pilot_role === 'Dual' ? f.minutes : 0, fi_minutes: f.pilot_role === 'FI' ? f.minutes : 0 };
}
function sum(rows: Row[]): Counters {
  const out: Counters = { minutes: 0, pic_minutes: 0, dual_minutes: 0, fi_minutes: 0, landings: 0 };
  for (const r of rows) for (const k of counterKeys) out[k] += counters(r.flight)[k];
  return out;
}
function add(a: Counters, b: Counters): Counters {
  return Object.fromEntries(counterKeys.map(k => [k, a[k] + b[k]])) as unknown as Counters;
}
export function writing(h: History, page: Page): WritingPage[] {
  if (page.provenance !== 'synthetic-prepared-observations-no-OCR' || page.rows.length !== 9 || page.rows.some((r, i) => r.row !== i + 1)) throw new Error('Prepared nine-row page required');
  if (counterKeys.some(k => !Number.isInteger(page.carry[k]) || page.carry[k] < 0)) throw new Error('Unknown carryover needs feedback');
  const anchor = page.rows.at(-1)!;
  const source = h.flights.find(f => f.id === anchor.flight.id);
  if (!source || ['date', 'start', 'landing'].some(k => source[k as keyof Flight] !== anchor.flight[k as keyof Flight])) throw new Error('Anchor identity/time needs review');
  if (h.paper.some(p => p.page > page.page || (p.page === page.page && p.row > anchor.row))) throw new Error('Paper advanced: confirm a new continuation page');
  const rows = effective(h);
  if (rows.some(f => !f.date || !f.start)) throw new Error('Unknown chronology needs feedback');
  const candidates = rows.filter(f => (f.date! + f.start!) > (anchor.flight.date! + anchor.flight.start!) && !h.paper.some(p => p.flight.id === f.id));
  candidates.sort((a, b) => (a.date! + a.start!).localeCompare(b.date! + b.start!));
  let previousEnd = -Infinity;
  for (const f of [...page.rows.map(r => r.flight), ...candidates]) {
    validateFlight(f);
    if (['date', 'start', 'landing', 'registration', 'aircraft_model', 'launch', 'start_place', 'landing_place', 'minutes', 'landings'].some(k => f[k as keyof Flight] === null) || f.time_basis !== 'UTC' || !['PIC', 'Dual'].includes(f.pilot_role ?? '')) throw new Error('Required UTC/solo/Dual fields need feedback');
    if (f.pilot_role === 'Dual' && new Set(f.crew.filter(c => c.role === 'instructor').map(c => c.person_id)).size !== 1) throw new Error('One established instructor required');
  }
  for (const f of candidates) {
    const start = Date.parse(f.date + 'T' + f.start + ':00Z'), end = Date.parse(f.date + 'T' + f.landing + ':00Z');
    if (end <= start || end - start !== f.minutes! * 60000 || start < previousEnd) throw new Error('Duration/overlapping candidates need review');
    previousEnd = end;
  }
  const pages: WritingPage[] = [{ page: page.page, carry: page.carry, rows: page.rows.map(r => ({ ...r, entry_state: 'existing-context-do-not-copy' })), page_total: null, cumulative_total: null }];
  let nr = anchor.nr;
  for (const f of candidates) {
    let current = pages.at(-1)!;
    if (current.rows.length === 10) {
      current = { page: current.page + 1, carry: add(current.carry, sum(current.rows)), rows: [], page_total: null, cumulative_total: null };
      pages.push(current);
    }
    current.rows.push({ row: current.rows.length + 1, nr: ++nr, flight: f, entry_state: 'new-copy' });
  }
  for (const p of pages) if (p.rows.length === 10) { p.page_total = sum(p.rows); p.cumulative_total = add(p.carry, p.page_total); }
  return pages;
}
export function reviewRequired(t: Template, h: History): boolean {
  const flights = effective(h);
  return canonical(t.findings) !== canonical(findings(h)) || t.pages.some(p => p.rows.some(r => r.entry_state === 'new-copy' && canonical(flights.find(f => f.id === r.flight.id) ?? null) !== canonical(r.flight)));
}
export function literalFields(r: Row): [string, string][] {
  const f = r.flight, c = counters(f);
  const duration = (n: number) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  return [['Number', String(r.nr)], ['Date', f.date!], ['Aircraft model', f.aircraft_model!], ['Registration', f.registration!],
    ['PIC / instructor', f.pilot_role === 'Dual' ? f.crew.find(c => c.role === 'instructor')!.name : 'Synthetic Pilot'],
    ['Companion', f.pilot_role === 'Dual' ? '' : f.crew.filter(c => c.role === 'companion').map(c => c.name).join(', ')],
    ['Launch', f.launch!], ['Departure', f.start_place!], ['Arrival', f.landing_place!], ['Start (UTC)', f.start!], ['Landing (UTC)', f.landing!],
    ['Total (h:mm)', duration(c.minutes)], ['PIC (h:mm)', f.pilot_role === 'PIC' ? duration(c.pic_minutes) : ''],
    ['Dual (h:mm)', f.pilot_role === 'Dual' ? duration(c.dual_minutes) : ''], ['FI/FE (h:mm)', ''], ['Landings', String(f.landings)], ['Remarks', f.remarks ?? '']];
}

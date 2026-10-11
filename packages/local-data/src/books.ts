import { canonical, validateFlight, writing, counters, literalFields, counterKeys, findings, effective, evidence, type Decision, type Finding, type Flight, type Page, type WritingPage, type History } from '@moflight/flight-logbook';
import type { Driver, Hash, Connection } from './index';
import { validateBackupRecords } from './validation';

export type AircraftClass = 'glider' | 'TMG' | 'ultralight' | 'powered';
export interface Book { id: string; owner: string; name: string; format: string; classes: AircraftClass[]; from: string; through: string | null }
export interface SourceFlight { transport: 'synthetic-proof'; id: string; owner: string; connection: string; reference: string; aircraftClass: AircraftClass | null; duplicate: boolean; flight: Flight; raw: string }
export interface BookSnapshot { id: string; bookId: string; owner: string; format: string; sourceRevision: number; decisions: Decision[]; pages: WritingPage[] }
export interface Entry { bookId: string; flightId: string; snapshotId: string; page: number; row: number; nr: number; at: string }
export interface Format {
  id: string;
  prepare(history: History, page: Page | null): WritingPage[];
  fields(flight: Flight): [string, string][];
}
export const formats: Record<string, Format> = {
  'synthetic-ten-row-v1': { id: 'synthetic-ten-row-v1', prepare: (h, p) => { if (!p) throw new Error('Confirmed continuation page required'); return writing(h, p); }, fields: f => literalFields({ flight: f, row: 1, nr: 1 }) },
  'synthetic-powered-five-row-v1': {
    id: 'synthetic-powered-five-row-v1',
    prepare: h => {
      const flights = h.flights.filter(f => !h.paper.some(p => p.flight.id === f.id)).sort((a, b) => (a.date! + a.start! + a.id).localeCompare(b.date! + b.start! + b.id));
      const pages: WritingPage[] = []; let nr = Math.max(0, ...h.paper.map(p => p.nr)), page = Math.max(0, ...h.paper.map(p => p.page)) + 1;
      for (const f of flights) {
        validateFlight(f); if (['date', 'start', 'landing', 'minutes', 'registration', 'aircraft_model', 'landings'].some(k => f[k as keyof Flight] === null) || f.time_basis !== 'UTC') throw new Error('Unknown required powered-format field');
        let p = pages.at(-1); if (!p || p.rows.length === 5) { p = { page: page++, carry: { minutes: 0, pic_minutes: 0, dual_minutes: 0, fi_minutes: 0, landings: 0 }, rows: [], page_total: null, cumulative_total: null }; pages.push(p); }
        p.rows.push({ row: p.rows.length + 1, nr: ++nr, flight: f, entry_state: 'new-copy' });
      }
      return pages;
    },
    fields: f => [['Date', f.date ?? ''], ['Aircraft', f.registration ?? ''], ['Flight minutes', String(f.minutes)], ['Landings', String(f.landings)], ['Remarks', f.remarks ?? '']],
  },
};
const SCHEMA = `CREATE TABLE IF NOT EXISTS pilot(id TEXT PRIMARY KEY, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS source_revisions(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL,checksum TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS memberships(book_id TEXT NOT NULL,flight_id TEXT NOT NULL,credit INTEGER NOT NULL,PRIMARY KEY(book_id,flight_id));
CREATE UNIQUE INDEX IF NOT EXISTS primary_credit ON memberships(flight_id) WHERE credit=1;
CREATE TABLE IF NOT EXISTS book_state(book_id TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(book_id,kind));
CREATE TABLE IF NOT EXISTS book_snapshots(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS book_entries(book_id TEXT NOT NULL,flight_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(book_id,flight_id));
CREATE UNIQUE INDEX IF NOT EXISTS entry_position ON book_entries(book_id,json_extract(payload,'$.page'),json_extract(payload,'$.row'));
CREATE UNIQUE INDEX IF NOT EXISTS entry_number ON book_entries(book_id,json_extract(payload,'$.nr'));`;
function nonempty(v: unknown): asserts v is string { if (typeof v !== 'string' || !v.trim() || v.length > 200) throw new Error('Invalid identity'); }
function validDate(v: unknown) { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isFinite(Date.parse(v)) || new Date(v).toISOString().slice(0, 10) !== v) throw new Error('Invalid effective date'); }
function validCounters(v: unknown) { if (!v || typeof v !== 'object' || counterKeys.some(k => !Number.isSafeInteger((v as Record<string, number>)[k]) || (v as Record<string, number>)[k]! < 0)) throw new Error('Invalid counters'); }
function validPage(v: unknown): asserts v is Page {
  if (!v || typeof v !== 'object') throw new Error('Invalid prepared page'); const p = v as Page;
  nonempty(p.id); if (p.provenance !== 'synthetic-prepared-observations-no-OCR' || !Number.isFinite(Date.parse(p.confirmed_at)) || !Number.isSafeInteger(p.page) || p.page < 1 || !Array.isArray(p.rows) || p.rows.length !== 9) throw new Error('Invalid prepared page'); validCounters(p.carry);
  const ids = new Set<string>(); for (const [i, r] of p.rows.entries()) { if (!r || r.row !== i + 1 || !Number.isSafeInteger(r.nr) || r.nr < 1) throw new Error('Invalid prepared row'); validateFlight(r.flight); if (ids.has(r.flight.id)) throw new Error('Duplicate prepared flight'); ids.add(r.flight.id); }
}
function validDecisions(v: unknown): asserts v is Decision[] { if (!Array.isArray(v) || v.some(d => !d || typeof d.id !== 'string' || !['ignore','override','reverse'].includes(d.action) || (d.value !== null && typeof d.value !== 'string') || (d.action === 'override' && !d.value?.trim()) || typeof d.reason !== 'string' || !d.reason.trim() || typeof d.evidence !== 'string' || !Number.isFinite(Date.parse(d.at)) || typeof d.author !== 'string') || new Set(v.map(d => d.id)).size !== v.length) throw new Error('Invalid book decisions'); }
function validBook(value: unknown, owner: string): asserts value is Book {
  if (!value || typeof value !== 'object') throw new Error('Invalid book'); const b = value as Book;
  for (const x of [b.id, b.owner, b.name, b.format]) nonempty(x); if (b.owner !== owner || !Array.isArray(b.classes) || !b.classes.length || new Set(b.classes).size !== b.classes.length || b.classes.some(c => !['glider', 'TMG', 'ultralight', 'powered'].includes(c))) throw new Error('Foreign book or class');
  validDate(b.from); if (b.through !== null) { validDate(b.through); if (b.through < b.from) throw new Error('Invalid effective interval'); }
}
function validSource(value: unknown, owner: string): asserts value is SourceFlight {
  if (!value || typeof value !== 'object') throw new Error('Invalid source'); const s = value as SourceFlight;
  for (const x of [s.id, s.owner, s.connection, s.reference]) nonempty(x);
  if (s.transport !== 'synthetic-proof' || s.owner !== owner || s.id !== canonical([owner, s.connection, s.reference]) || typeof s.duplicate !== 'boolean' || typeof s.raw !== 'string' || ![null, 'glider', 'TMG', 'ultralight', 'powered'].includes(s.aircraftClass)) throw new Error('Foreign or unsupported source'); validateFlight(s.flight); if (s.flight.id !== s.id) throw new Error('Source/flight identity mismatch');
}
export function sourceId(owner: string, connection: string, reference: string): string { for (const x of [owner, connection, reference]) nonempty(x); return canonical([owner, connection, reference]); }

// Separate versioned pilot lab, leaving schema-v1 databases and backups intact.
export class PilotBooks {
  constructor(readonly db: Driver, readonly owner: string, readonly hash: Hash) { nonempty(owner); }
  async initialize() {
    await this.db.transaction(async tx => { await tx.exec(SCHEMA); const p = await tx.first<{ id: string; version: number }>('SELECT * FROM pilot'); if (p && (p.id !== this.owner || p.version !== 1)) throw new Error('Foreign pilot or unsupported library'); if (!p) await tx.run('INSERT INTO pilot VALUES (?,1)', this.owner); });
  }
  async books(db: Connection = this.db): Promise<Book[]> { return (await db.all<{payload: string}>('SELECT payload FROM books ORDER BY id')).map(r => { const b: unknown = JSON.parse(r.payload); validBook(b, this.owner); return b; }); }
  async book(id: string, db: Connection = this.db) { return (await this.books(db)).find(b => b.id === id) ?? (() => { throw new Error('Book not owned by pilot'); })(); }
  async createBook(b: Book) { validBook(b, this.owner); if (!formats[b.format]) throw new Error('Unsupported format; editing disabled'); await this.db.run('INSERT INTO books VALUES (?,?)', b.id, canonical(b)); }
  async sources(db: Connection = this.db): Promise<SourceFlight[]> { return (await db.all<{payload: string}>('SELECT payload FROM source_revisions r WHERE seq=(SELECT max(seq) FROM source_revisions WHERE id=r.id) ORDER BY seq')).map(r => { const s: unknown = JSON.parse(r.payload); validSource(s, this.owner); return s; }); }
  async ingest(sources: SourceFlight[]) {
    sources.forEach(s => validSource(s, this.owner));
    await this.db.transaction(async tx => { for (const s of sources) { const checksum = await this.hash(canonical(s)); const previous = await tx.first<{checksum: string}>('SELECT checksum FROM source_revisions WHERE id=? ORDER BY seq DESC LIMIT 1', s.id); if (previous?.checksum !== checksum) await tx.run('INSERT INTO source_revisions(id,checksum,payload) VALUES (?,?,?)', s.id, checksum, canonical(s)); } });
  }
  async revision(db: Connection = this.db) { return (await db.first<{n: number}>('SELECT coalesce(max(seq),0) n FROM source_revisions'))!.n; }
  async route(id: string) {
    const s = (await this.sources()).find(s => s.id === id); if (!s) throw new Error('Unknown source');
    const existing = await this.db.first<{book_id: string}>('SELECT book_id FROM memberships WHERE flight_id=? AND credit=1', id);
    if (existing) return { state: 'assigned' as const, bookIds: [existing.book_id] };
    const candidates = (await this.books()).filter(b => s.aircraftClass && s.flight.date && b.classes.includes(s.aircraftClass) && b.from <= s.flight.date && (!b.through || b.through >= s.flight.date));
    return { state: s.duplicate || candidates.length !== 1 ? 'review' as const : 'suggested' as const, bookIds: candidates.map(b => b.id) };
  }
  async associate(bookId: string, flightId: string, credit: boolean) {
    await this.db.transaction(async tx => { const b = await this.book(bookId, tx), s = (await this.sources(tx)).find(s => s.id === flightId); if (!s) throw new Error('Unknown source');
      if (credit && (s.duplicate || !s.aircraftClass || !b.classes.includes(s.aircraftClass) || !s.flight.date || b.from > s.flight.date || (b.through && b.through < s.flight.date))) throw new Error('Classification/duplicate/effective-date review required');
      const prior = await tx.first<{credit: number}>('SELECT credit FROM memberships WHERE book_id=? AND flight_id=?', bookId, flightId); if (prior && prior.credit !== Number(credit)) throw new Error('Explicit credit reassignment required');
      await tx.run('INSERT OR IGNORE INTO memberships VALUES (?,?,?)', bookId, flightId, Number(credit)); });
  }
  async saveState(bookId: string, kind: 'page' | 'decision' | 'photo' | 'pending', value: unknown) {
    await this.book(bookId); if (!['page', 'decision', 'photo', 'pending'].includes(kind)) throw new Error('Unsupported book state');
    if (kind === 'page') validPage(value);
    if (kind === 'decision') validDecisions(value);
    // State is evidence, not authority to mutate another book or source.
    await this.db.run('INSERT INTO book_state VALUES (?,?,?) ON CONFLICT(book_id,kind) DO UPDATE SET payload=excluded.payload', bookId, kind, canonical(value));
  }
  async state<T>(bookId: string, kind: string, db: Connection = this.db): Promise<T | null> { await this.book(bookId, db); const r = await db.first<{payload: string}>('SELECT payload FROM book_state WHERE book_id=? AND kind=?', bookId, kind); return r ? JSON.parse(r.payload) as T : null; }
  async entries(bookId: string, db: Connection = this.db): Promise<Entry[]> { await this.book(bookId, db); return (await db.all<{payload: string}>('SELECT payload FROM book_entries WHERE book_id=?', bookId)).map(r => JSON.parse(r.payload) as Entry); }
  async snapshots(bookId: string, db: Connection = this.db): Promise<BookSnapshot[]> { await this.book(bookId, db); return (await db.all<{payload: string}>('SELECT payload FROM book_snapshots WHERE book_id=? ORDER BY rowid', bookId)).map(r => JSON.parse(r.payload) as BookSnapshot); }
  async flights(bookIds: string[], db: Connection = this.db) {
    for (const id of bookIds) await this.book(id, db);
    const links = await db.all<{book_id: string; flight_id: string; credit: number}>('SELECT * FROM memberships');
    const ids = new Set(links.filter(l => bookIds.includes(l.book_id)).map(l => l.flight_id));
    return (await this.sources(db)).filter(s => ids.has(s.id));
  }
  async history(bookId: string, db: Connection = this.db): Promise<History> {
    const links = await db.all<{flight_id: string}>('SELECT flight_id FROM memberships WHERE book_id=? AND credit=1', bookId);
    const ids = new Set(links.map(l => l.flight_id)), flights = (await this.flights([bookId], db)).filter(s => ids.has(s.id)).map(s => s.flight);
    const page = await this.state<Page>(bookId, 'page', db), entries = await this.entries(bookId, db); if (page) validPage(page);
    const snapshots = await this.snapshots(bookId, db);
    const bookFindings: Finding[] = [];
    for (const row of page?.rows ?? []) { const f = flights.find(f => f.id === row.flight.id); if (f) for (const field of ['aircraft_model','registration'] as const) if (f[field] !== row.flight[field]) bookFindings.push({ id: f.id + ':' + field, flight_id: f.id, field, paper_value: row.flight[field], rules: 'synthetic-ten-row-v1' }); }
    const decisions = await this.state<Decision[]>(bookId, 'decision', db) ?? []; validDecisions(decisions);
    if (decisions.some(d => !flights.some(f => ['aircraft_model','registration'].some(field => d.id === f.id + ':' + field)))) throw new Error('Decision not associated with book evidence');
    return { source: null, lastAttempt: null, flights, findings: bookFindings, decisions, paper: [...(page?.rows.map(r => ({ ...r, page: page.page, evidence: 'prepared:' + page.id, confirmed_at: page.confirmed_at, author: this.owner })) ?? []), ...entries.map(e => {
      const row = snapshots.find(s => s.id === e.snapshotId)?.pages.find(p => p.page === e.page)?.rows.find(r => r.row === e.row); if (!row) throw new Error('Missing entry snapshot');
      return { ...row, page: e.page, evidence: 'user-assertion:' + e.snapshotId, confirmed_at: e.at, author: this.owner };
    })] };
  }
  async respond(bookId: string, findingId: string, action: Decision['action'], value: string | null, reason: string) {
    await this.db.transaction(async tx => { const h = await this.history(bookId, tx), f = h.findings.find(f => f.id === findingId); if (!f) throw new Error('Finding not owned by selected book');
      const d: Decision = { id: findingId, action, value, reason, evidence: evidence(f, h.flights), at: new Date().toISOString(), author: this.owner }; validDecisions([d]);
      const decisions = [...h.decisions.filter(x => x.id !== findingId), d]; await tx.run('INSERT INTO book_state VALUES (?,?,?) ON CONFLICT(book_id,kind) DO UPDATE SET payload=excluded.payload', bookId, 'decision', canonical(decisions)); });
  }
  async prepare(bookId: string): Promise<BookSnapshot> {
    let result!: BookSnapshot;
    await this.db.transaction(async tx => { const b = await this.book(bookId, tx), format = formats[b.format]; if (!format) throw new Error('Unsupported format; editing disabled');
      if (await this.state(bookId, 'legacy', tx) && await this.state(bookId, 'pending', tx)) throw new Error('Confirm a new continuation page before editing migrated evidence');
      const h = await this.history(bookId, tx);
      const pages = format.prepare(h, await this.state<Page>(bookId, 'page', tx)); if (!pages.length) throw new Error('No new writing entries');
      const payload = { bookId, owner: this.owner, format: b.format, sourceRevision: await this.revision(tx), decisions: h.decisions, pages };
      result = { ...payload, id: await this.hash(canonical(payload)) };
      await tx.run('INSERT OR IGNORE INTO book_snapshots VALUES (?,?,?)', result.id, bookId, canonical(result)); }); return result;
  }
  async confirm(bookId: string, snapshotId: string, flightIds: string[]) {
    if (!flightIds.length || new Set(flightIds).size !== flightIds.length) throw new Error('Distinct copied entries required');
    await this.db.transaction(async tx => { await this.book(bookId, tx); const s = (await this.snapshots(bookId, tx)).find(s => s.id === snapshotId); if (!s) throw new Error('Snapshot not owned by book');
      const current = await this.history(bookId, tx), currentFlights = effective(current);
      for (const flightId of flightIds) { const page = s.pages.find(p => p.rows.some(r => r.flight.id === flightId && r.entry_state === 'new-copy')), row = page?.rows.find(r => r.flight.id === flightId);
        if (!page || !row || canonical(s.decisions) !== canonical(current.decisions) || findings(current).some(f => f.status === 'open' || f.status === 'stale-review-required') || canonical(currentFlights.find(f => f.id === flightId) ?? null) !== canonical(row.flight)) throw new Error('Changed source or foreign entry; review required');
        const old = (await this.entries(bookId, tx)).find(e => e.flightId === flightId); if (old) continue;
        const entry: Entry = { bookId, flightId, snapshotId, page: page.page, row: row.row, nr: row.nr, at: new Date().toISOString() };
        if ((await this.entries(bookId, tx)).some(e => e.page === entry.page && e.row === entry.row || e.nr === entry.nr)) throw new Error('Paper position already confirmed');
        await tx.run('INSERT INTO book_entries VALUES (?,?,?)', bookId, flightId, canonical(entry)); }
    });
  }
  async totals(bookIds: string[]) {
    const result: Record<string, {minutes: number; landings: number}> = {}, seen = new Set<string>();
    for (const bookId of bookIds) { const b = await this.book(bookId); for (const s of await this.flights([bookId])) { if (seen.has(s.id) || !(await this.db.first('SELECT 1 FROM memberships WHERE flight_id=? AND book_id=? AND credit=1', s.id, bookId))) continue; seen.add(s.id); const c = counters(s.flight), key = b.format + ':' + s.aircraftClass; const total = result[key] ??= { minutes: 0, landings: 0 }; total.minutes += c.minutes; total.landings += c.landings; } } return result;
  }
  async backup() {
    let payload!: string; await this.db.transaction(async tx => { payload = canonical({ owner: this.owner, version: 1, books: await tx.all('SELECT * FROM books ORDER BY id'), sources: await tx.all('SELECT * FROM source_revisions ORDER BY seq'), memberships: await tx.all('SELECT * FROM memberships ORDER BY book_id,flight_id'), state: await tx.all('SELECT * FROM book_state ORDER BY book_id,kind'), snapshots: await tx.all('SELECT * FROM book_snapshots ORDER BY id'), entries: await tx.all('SELECT * FROM book_entries ORDER BY book_id,flight_id') }); });
    return canonical({ format: 'moflight-pilot-proof-v1', payload, checksum: await this.hash(payload) });
  }
  async migrateLegacy(bookId: string, backup: string, connection: string) {
    // Explicitly mapped synthetic evidence only. Original revisions/snapshots
    // remain byte-for-byte evidence; no cross-dataset identity consolidation.
    const e = JSON.parse(backup); if (e.format !== 'moflight-native-lab-backup-v1' || typeof e.payload !== 'string' || e.checksum !== await this.hash(e.payload)) throw new Error('Invalid legacy backup');
    const body = JSON.parse(e.payload); if (body.schema !== 1 || !Array.isArray(body.records) || typeof body.dataset_id !== 'string') throw new Error('Unsupported legacy schema');
    const records = await validateBackupRecords(body.records, body.dataset_id, this.hash);
    const latest = new Map<string, unknown>(); for (const r of records) latest.set(r.kind + ':' + r.id, JSON.parse(r.payload));
    const mapping: Record<string, string> = {};
    await this.db.transaction(async tx => {
      const b = await this.book(bookId, tx); if (b.format !== 'synthetic-ten-row-v1' || await tx.first('SELECT 1 FROM memberships WHERE book_id=?', bookId) || await tx.first('SELECT 1 FROM book_state WHERE book_id=?', bookId)) throw new Error('Map legacy dataset to a new empty gliding book');
      for (const [key, value] of latest) if (key.startsWith('flight:')) {
        const f = value as Flight, id = sourceId(this.owner, connection, canonical([body.dataset_id, f.id])); mapping[f.id] = id;
        const s: SourceFlight = { transport: 'synthetic-proof', id, owner: this.owner, connection, reference: canonical([body.dataset_id, f.id]), aircraftClass: 'glider', duplicate: false, flight: { ...f, id }, raw: canonical(value) }; validSource(s, this.owner);
        await tx.run('INSERT OR IGNORE INTO source_revisions(id,checksum,payload) VALUES (?,?,?)', id, await this.hash(canonical(s)), canonical(s)); await tx.run('INSERT INTO memberships VALUES (?,?,1)', bookId, id);
      }
      const page = latest.get('page:prepared-page') as Page | undefined;
      if (page) { for (const r of page.rows) mapping[r.flight.id] ??= sourceId(this.owner, 'legacy-paper', canonical([body.dataset_id, r.flight.id])); const mapped = { ...page, rows: page.rows.map(r => ({ ...r, flight: { ...r.flight, id: mapping[r.flight.id] ?? (() => { throw new Error('Missing migrated flight'); })() } })) }; validPage(mapped);
        await tx.run('INSERT INTO book_state VALUES (?,?,?)', bookId, 'page', canonical(mapped)); }
      await tx.run('INSERT INTO book_state VALUES (?,?,?)', bookId, 'legacy', canonical({ backup, datasetId: body.dataset_id, mapping, editable: false }));
      // Already copied beyond the observed page needs an explicit new continuation.
      if ([...latest.entries()].some(([k, v]) => k.startsWith('paper:') && (v as {evidence: string}).evidence.startsWith('user-assertion:'))) await tx.run('INSERT INTO book_state VALUES (?,?,?)', bookId, 'pending', canonical({ reason: 'Confirm continuation from preserved legacy copy evidence before preparing new writing' }));
    });
    return mapping;
  }
  async restore(text: string) {
    if (text.length > 2_000_000) throw new Error('Pilot backup too large');
    const e = JSON.parse(text); if (!e || e.format !== 'moflight-pilot-proof-v1' || typeof e.payload !== 'string' || e.checksum !== await this.hash(e.payload)) throw new Error('Invalid pilot backup'); const p = JSON.parse(e.payload);
    if (p.owner !== this.owner || p.version !== 1 || ['books', 'sources', 'memberships', 'state', 'snapshots', 'entries'].some(k => !Array.isArray(p[k]))) throw new Error('Foreign pilot or unsupported backup');
    await this.db.transaction(async tx => {
      for (const table of ['books', 'source_revisions', 'memberships', 'book_state', 'book_snapshots', 'book_entries']) if (await tx.first(`SELECT 1 FROM ${table} LIMIT 1`)) throw new Error('Restore into empty pilot library');
      for (const r of p.books) { const b: unknown = JSON.parse(r.payload); validBook(b, this.owner); if (b.id !== r.id) throw new Error('Book identity mismatch'); await tx.run('INSERT INTO books VALUES (?,?)', r.id, r.payload); }
      let seq = 0;
      for (const r of p.sources) { const s: unknown = JSON.parse(r.payload); validSource(s, this.owner); if (s.id !== r.id || !Number.isSafeInteger(r.seq) || r.seq <= seq || r.checksum !== await this.hash(canonical(s))) throw new Error('Invalid source revision'); seq = r.seq; await tx.run('INSERT INTO source_revisions VALUES (?,?,?,?)', r.seq, r.id, r.checksum, r.payload); }
      const sources = await this.sources(tx);
      for (const r of p.memberships) { const b = await this.book(r.book_id, tx), s = sources.find(s => s.id === r.flight_id); if (!s || ![0, 1].includes(r.credit) || r.credit && (s.duplicate || !s.aircraftClass || !b.classes.includes(s.aircraftClass) || !s.flight.date || b.from > s.flight.date || b.through && b.through < s.flight.date)) throw new Error('Invalid membership'); await tx.run('INSERT INTO memberships VALUES (?,?,?)', r.book_id, r.flight_id, r.credit); }
      for (const r of p.state) { await this.book(r.book_id, tx); if (!['page', 'decision', 'photo', 'pending', 'legacy'].includes(r.kind)) throw new Error('Invalid book state'); const value = JSON.parse(r.payload); if (r.kind === 'page') validPage(value); if (r.kind === 'decision') validDecisions(value); if (r.kind === 'legacy') { if (!value || typeof value.backup !== 'string' || value.editable !== false) throw new Error('Invalid legacy evidence'); const e = JSON.parse(value.backup), body = JSON.parse(e.payload); if (e.format !== 'moflight-native-lab-backup-v1' || e.checksum !== await this.hash(e.payload)) throw new Error('Invalid legacy evidence'); await validateBackupRecords(body.records, body.dataset_id, this.hash); } await tx.run('INSERT INTO book_state VALUES (?,?,?)', r.book_id, r.kind, r.payload); }
      for (const r of p.snapshots) {
        const b = await this.book(r.book_id, tx), s = JSON.parse(r.payload), {id, ...body} = s;
        if (id !== r.id || s.bookId !== b.id || s.owner !== this.owner || s.format !== b.format || !Number.isSafeInteger(s.sourceRevision) || s.sourceRevision < 0 || s.sourceRevision > seq || await this.hash(canonical(body)) !== id || !Array.isArray(s.pages) || !s.pages.length) throw new Error('Invalid snapshot');
        validDecisions(s.decisions);
        for (const page of s.pages) { if (!Number.isSafeInteger(page.page) || page.page < 1 || !Array.isArray(page.rows) || page.rows.length > (s.format === 'synthetic-powered-five-row-v1' ? 5 : 10)) throw new Error('Invalid snapshot page'); validCounters(page.carry); for (const k of ['page_total', 'cumulative_total']) if (page[k] !== null) validCounters(page[k]); for (const [index, row] of page.rows.entries()) { validateFlight(row.flight); if (row.row !== index + 1 || !Number.isSafeInteger(row.nr) || row.nr < 1 || !['existing-context-do-not-copy','new-copy'].includes(row.entry_state) || !(sources.some(f => f.id === row.flight.id) || row.entry_state === 'existing-context-do-not-copy' && (await this.state<Page>(r.book_id, 'page', tx))?.rows.some(x => canonical(x.flight) === canonical(row.flight)))) throw new Error('Invalid snapshot row'); formats[s.format]?.fields(row.flight); } }
        await tx.run('INSERT INTO book_snapshots VALUES (?,?,?)', r.id, r.book_id, r.payload);
      }
      for (const r of p.entries) { await this.book(r.book_id, tx); const e = JSON.parse(r.payload), s = (await this.snapshots(r.book_id, tx)).find(s => s.id === e.snapshotId); if (e.bookId !== r.book_id || e.flightId !== r.flight_id || !Number.isFinite(Date.parse(e.at)) || !s?.pages.some(p => p.page === e.page && p.rows.some(row => row.flight.id === e.flightId && row.row === e.row && row.nr === e.nr && row.entry_state === 'new-copy'))) throw new Error('Invalid copied entry'); await tx.run('INSERT INTO book_entries VALUES (?,?,?)', r.book_id, r.flight_id, r.payload); }
      for (const b of await this.books(tx)) await this.history(b.id, tx);
    });
  }
}

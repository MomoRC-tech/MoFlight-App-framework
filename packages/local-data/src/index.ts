import { validateBackupRecords } from './validation';
import { canonical, evidence, findings, writing, validateFlight, effective, query, type History, type Page, type Source, type Flight, type Finding, type Decision, type Paper, type Template } from '@moflight/flight-logbook';

export type Bind = string | number | null;
export interface Connection {
  exec(sql: string): Promise<void>;
  run(sql: string, ...params: Bind[]): Promise<void>;
  all<T>(sql: string, ...params: Bind[]): Promise<T[]>;
  first<T>(sql: string, ...params: Bind[]): Promise<T | null>;
}
export interface Driver extends Connection {
  transaction(work: (tx: Connection) => Promise<void>): Promise<void>;
  close(): Promise<void>;
}
export type Hash = (text: string) => Promise<string>;
interface RecordRow { seq: number; kind: string; id: string; revision: number; payload: string }
export const SCHEMA = `
CREATE TABLE dataset(id TEXT PRIMARY KEY,schema_version INTEGER NOT NULL CHECK(schema_version=1));
CREATE TABLE records(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),payload TEXT NOT NULL CHECK(json_valid(payload)),UNIQUE(kind,id,revision));
CREATE INDEX records_latest ON records(kind,id,revision DESC);
PRAGMA user_version=1;`;

export class LocalLogbook {
  constructor(readonly db: Driver, readonly datasetId: string, readonly hash: Hash) {}
  async initialize(): Promise<void> {
    const version = (await this.db.first<{ user_version: number }>('PRAGMA user_version'))!.user_version;
    if (version === 0) {
      if (await this.db.first('SELECT name FROM sqlite_master WHERE type=\'table\'')) throw new Error('Unversioned DB: preserved, not reset');
      await this.db.transaction(async tx => { await tx.exec(SCHEMA); await tx.run('INSERT INTO dataset VALUES (?,1)', this.datasetId); });
    } else if (version !== 1) throw new Error('Unsupported schema: preserve dataset');
    if ((await this.db.first<{ id: string }>('SELECT id FROM dataset'))?.id !== this.datasetId) throw new Error('Dataset identity mismatch');
  }
  async revision(db: Connection = this.db): Promise<number> {
    return (await db.first<{ value: number }>('SELECT coalesce(max(seq),0) AS value FROM records'))!.value;
  }
  async get<T>(kind: string, id: string, db: Connection = this.db): Promise<T | null> {
    const row = await db.first<{ payload: string }>('SELECT payload FROM records WHERE kind=? AND id=? ORDER BY revision DESC LIMIT 1', kind, id);
    return row ? JSON.parse(row.payload) as T : null;
  }
  async list<T>(kind: string, db: Connection = this.db): Promise<T[]> {
    const rows = await db.all<{ payload: string }>('SELECT payload FROM records r WHERE kind=? AND revision=(SELECT max(revision) FROM records WHERE kind=r.kind AND id=r.id) ORDER BY seq', kind);
    return rows.map(r => JSON.parse(r.payload) as T);
  }
  private async append(tx: Connection, kind: string, id: string, payload: unknown): Promise<void> {
    await tx.run('INSERT INTO records(kind,id,revision,payload) VALUES (?,?,(SELECT coalesce(max(revision),0)+1 FROM records WHERE kind=? AND id=?),?)', kind, id, kind, id, canonical(payload));
  }
  async history(db: Connection = this.db): Promise<History> {
    const state = await this.get<{ source_id: string }>('state', 'last_success', db), attempts = await this.list<Source>('import', db);
    return { source: state ? await this.get<Source>('import', state.source_id, db) : null, lastAttempt: attempts.at(-1) ?? null,
      flights: await this.list<Flight>('flight', db), paper: await this.list<Paper>('paper', db),
      findings: await this.list<Finding>('finding', db), decisions: await this.list<Decision>('decision', db),
      source_references: Object.fromEntries((await this.list<{ id: string; source_id: string }>('flight_source', db)).map(x => [x.id, x.source_id])) };
  }
  async importSource(input: Omit<Source, 'id'>): Promise<void> {
    if (input.transport !== 'synthetic-prepared-csv') throw new Error('Synthetic fixtures only');
    const source: Source = { ...input, id: await this.hash(canonical(input)) }, flights = new Map<string, Flight>();
    if (source.successful) for (const f of source.flights) {
      validateFlight(f);
      if (flights.has(f.id) && canonical(flights.get(f.id)) !== canonical(f)) throw new Error('Conflicting source IDs need review');
      flights.set(f.id, f);
    }
    await this.db.transaction(async tx => {
      if (await this.get('import', source.id, tx)) return;
      await this.append(tx, 'import', source.id, source);
      if (source.successful) {
        for (const f of flights.values()) if (canonical(await this.get('flight', f.id, tx)) !== canonical(f)) {
          await this.append(tx, 'flight', f.id, f);
          await this.append(tx, 'flight_source', f.id, { id: f.id, source_id: source.id });
        }
        await this.append(tx, 'state', 'last_success', { source_id: source.id });
      }
    });
  }
  async preparePage(page: Page, rawPage: string): Promise<void> {
    const h = await this.history();
    writing(h, page);
    if (canonical(JSON.parse(rawPage)) !== canonical(page)) throw new Error('Observation bytes differ');
    await this.db.transaction(async tx => {
      const old = await this.get<Page>('page', page.id, tx);
      if (old) { if (canonical(old) !== canonical(page)) throw new Error('Changed page requires review; original retained'); return; }
      await this.append(tx, 'observation', page.id, { provenance: page.provenance, raw_page: rawPage });
      await this.append(tx, 'page', page.id, page);
      for (const row of page.rows) {
        await this.append(tx, 'paper', row.flight.id, { ...row, page: page.page, evidence: 'prepared:' + page.id, confirmed_at: page.confirmed_at, author: 'synthetic-pilot' });
        const f = h.flights.find(f => f.id === row.flight.id);
        if (f) for (const field of ['aircraft_model', 'registration'] as const) if (f[field] !== row.flight[field]) {
          const id = f.id + ':' + field;
          await this.append(tx, 'finding', id, { id, flight_id: f.id, field, paper_value: row.flight[field], rules: 'synthetic-ten-row-v1' });
        }
      }
    });
  }
  async respond(id: string, action: Decision['action'], value: string | null, reason: string, base: number): Promise<void> {
    if (!['ignore', 'override', 'reverse'].includes(action) || !reason.trim() || (action === 'override' && !value?.trim())) throw new Error('Explicit bounded decision required');
    await this.db.transaction(async tx => {
      if (base !== await this.revision(tx)) throw new Error('Stale decision revision');
      const h = await this.history(tx), finding = h.findings.find(f => f.id === id);
      if (!finding) throw new Error('Finding not owned by dataset');
      await this.append(tx, 'decision', id, { id, action, value, reason, evidence: evidence(finding, h.flights), at: new Date().toISOString(), author: 'synthetic-pilot' });
    });
  }
  async makeTemplate(): Promise<Template> {
    let result: Template | undefined;
    await this.db.transaction(async tx => {
      const h = await this.history(tx), page = await this.get<Page>('page', 'prepared-page', tx);
      if (!page || !h.source) throw new Error('Confirmed page and successful source required');
      const payload = { dataset_id: this.datasetId, revision: await this.revision(tx), rules: 'synthetic-ten-row-v1', presentation: 'native-field-view-v1', source_id: h.source.id, decisions: h.decisions, findings: findings(h), pages: writing(h, page) };
      const old = (await this.list<Template>('template', tx)).at(-1);
      const comparable = (t: Omit<Template, 'id'> | Template) => canonical(Object.fromEntries(Object.entries(t).filter(([k]) => !['id', 'revision'].includes(k))));
      if (old && comparable(old) === comparable(payload)) { result = old; return; }
      result = { ...payload, id: await this.hash(canonical(payload)) };
      await this.append(tx, 'template', result.id, result);
    });
    return result!;
  }
  async confirmCopied(templateId: string, ids: string[], base: number): Promise<void> {
    await this.db.transaction(async tx => {
      if (base !== await this.revision(tx)) throw new Error('Stale confirmation revision');
      const t = await this.get<Template>('template', templateId, tx);
      if (!t || !ids.length || new Set(ids).size !== ids.length) throw new Error('Named snapshot and distinct entries required');
      const current = effective(await this.history(tx));
      for (const id of ids) {
        const page = t.pages.find(p => p.rows.some(r => r.flight.id === id && r.entry_state === 'new-copy')), row = page?.rows.find(r => r.flight.id === id);
        if (!page || !row || canonical(current.find(f => f.id === id) ?? null) !== canonical(row.flight)) throw new Error('Entry/evidence requires review');
        const old = await this.get<Paper>('paper', id, tx);
        if (old && (old.page !== page.page || old.row !== row.row || canonical(old.flight) !== canonical(row.flight))) throw new Error('Conflicting paper evidence');
        if (!old) await this.append(tx, 'paper', id, { ...row, page: page.page, evidence: 'user-assertion:' + t.id, confirmed_at: new Date().toISOString(), author: 'synthetic-pilot' });
      }
    });
  }
  async backup(): Promise<string> {
    let payload = '';
    await this.db.transaction(async tx => { payload = canonical({ dataset_id: this.datasetId, schema: 1, records: await tx.all<RecordRow>('SELECT * FROM records ORDER BY seq') }); });
    return canonical({ format: 'moflight-native-lab-backup-v1', checksum: await this.hash(payload), payload });
  }
  async restore(text: string): Promise<void> {
    if (text.length > 2_000_000) throw new Error('Backup exceeds synthetic lab limit');
    const envelope = JSON.parse(text) as { format: string; checksum: string; payload: string };
    if (envelope.format !== 'moflight-native-lab-backup-v1' || typeof envelope.payload !== 'string' || envelope.checksum !== await this.hash(envelope.payload)) throw new Error('Backup integrity/format failure');
    const body = JSON.parse(envelope.payload) as { dataset_id: string; schema: number; records: RecordRow[] };
    if (body.schema !== 1 || body.dataset_id !== this.datasetId || !Array.isArray(body.records)) throw new Error('Original dataset identity and supported version required');
    const records = await validateBackupRecords(body.records, this.datasetId, this.hash);
    await this.db.transaction(async tx => {
      if (await this.revision(tx) !== 0) throw new Error('Restore into clean dataset; existing work preserved');
      for (const r of records) await tx.run('INSERT INTO records VALUES (?,?,?,?,?)', r.seq, r.kind, r.id, r.revision, r.payload);
      const h = await this.history(tx);
      findings(h);
      for (const basis of ['effective', 'source', 'paper'] as const) query(h, { basis });
      const page = await this.get<Page>('page', 'prepared-page', tx);
      if (page && !(await this.get('observation', page.id, tx))) throw new Error('Missing prepared evidence');
      for (const t of await this.list<Template>('template', tx)) if (!(await this.get('import', t.source_id, tx))) throw new Error('Missing source evidence');
      for (const ref of await this.list<{ source_id: string }>('flight_source', tx)) if (!(await this.get('import', ref.source_id, tx))) throw new Error('Missing flight source reference');
    });
  }
}

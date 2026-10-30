import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '@moflight/local-data';
import { validateFlightBillingObservation, type FlightBillingObservation } from './expense-flight-billing';
import { financialObservationAccountKey, validateFinancialLedgerObservation, type FinancialLedgerObservation, type FinancialObservationTarget } from './expense-ledger-observation';
import { validateScope } from './scope-store';

export type FinancialObservationKind = 'billed-flight' | 'ledger';
export type RawFinancialObservation = FlightBillingObservation | FinancialLedgerObservation;
export interface FinancialObservationReceipt {
  id: string; sequence: number; kind: FinancialObservationKind; sourceKey: string;
  retrievedAt: string; checksum: string; value: RawFinancialObservation;
}
interface SavedRow { seq: number; id: string; kind: string; source_key: string; retrieved_at: string; payload: string; checksum: string }
interface Prepared { kind: FinancialObservationKind; sourceKey: string; retrievedAt: string; value: RawFinancialObservation; payload: string }

/** Isolated raw-evidence file contract. No production registry/migration or
 * archive activation. Receipt sequence/time is never a provider revision. */
export const FINANCIAL_OBSERVATION_SCHEMA = `
CREATE TABLE financial_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL,version INTEGER NOT NULL,store_id TEXT NOT NULL,scope TEXT NOT NULL);
CREATE TABLE financial_observations(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('billed-flight','ledger')),source_key TEXT NOT NULL,retrieved_at TEXT NOT NULL,payload TEXT NOT NULL CHECK(json_valid(payload)),checksum TEXT NOT NULL);
CREATE INDEX financial_source_history ON financial_observations(kind,source_key,seq);
CREATE TRIGGER financial_no_update BEFORE UPDATE ON financial_observations BEGIN SELECT RAISE(ABORT,'Immutable financial observation'); END;
CREATE TRIGGER financial_no_delete BEFORE DELETE ON financial_observations BEGIN SELECT RAISE(ABORT,'Immutable financial observation'); END;
CREATE TRIGGER financial_manifest_no_update BEFORE UPDATE ON financial_manifest BEGIN SELECT RAISE(ABORT,'Immutable financial manifest'); END;
CREATE TRIGGER financial_manifest_no_delete BEFORE DELETE ON financial_manifest BEGIN SELECT RAISE(ABORT,'Immutable financial manifest'); END;
PRAGMA user_version=1;`;
const FAMILY = 'moflight-raw-financial-observations';
const MAX_BYTES = 256_000;
export const FINANCIAL_BACKUP_FORMAT = 'moflight-financial-observations-backup';
export const FINANCIAL_BACKUP_LIMIT = 64 * 1024 * 1024;
const MAX_RECEIPTS = 10_000;
const bytes = (text: string) => new TextEncoder().encode(text).length;
const flightKey = (id: string) => canonical({ sourceFlightId: id });
function receiptId(id: unknown): asserts id is string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new Error('Invalid financial receipt identity.');
}
function sourceFlightId(id: string) { if (typeof id !== 'string' || !/^\d{1,20}$/.test(id)) throw new Error('Invalid observed flight reference.'); }
export function validateFinancialObservationTarget(input: FinancialObservationTarget): FinancialObservationTarget {
  if (!input || canonical(Object.keys(input).sort()) !== canonical(['scope', 'storeId']) ||
      typeof input.storeId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.storeId)) throw new Error('Invalid financial store target.');
  const scope = validateScope(input.scope);
  if (canonical(scope) !== canonical(input.scope)) throw new Error('Unsupported financial scope.');
  return { storeId: input.storeId, scope };
}
function exact(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Unsupported financial archive fields.');
  return value as Record<string, unknown>;
}
function parse(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new Error('Corrupt financial observation payload.'); }
}
async function checkedHash(hash: Hash, text: string): Promise<string> {
  let value: string;
  try { value = await hash(text); } catch { throw new Error('Financial integrity calculation unavailable.'); }
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) throw new Error('Invalid financial integrity hash.');
  return value;
}
function timestamp(at: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(at) || !Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw new Error('Invalid financial observation time.');
}
function prepare(kind: FinancialObservationKind, input: unknown, selected: FinancialObservationTarget): Prepared {
  let value: RawFinancialObservation, sourceKey: string, retrievedAt: string;
  if (kind === 'billed-flight') {
    value = validateFlightBillingObservation(input, selected);
    sourceKey = flightKey(value.source.sourceFlightId); retrievedAt = value.retrievedAt;
  } else if (kind === 'ledger') {
    value = validateFinancialLedgerObservation(input, selected);
    sourceKey = financialObservationAccountKey(value, selected); retrievedAt = value.capture.retrievedAt;
  } else throw new Error('Unsupported financial observation kind.');
  timestamp(retrievedAt);
  const payload = canonical(value);
  if (bytes(payload) > MAX_BYTES) throw new Error('Financial observation size limit exceeded.');
  return { kind, sourceKey, retrievedAt, value, payload };
}
async function receiptDigest(hash: Hash, id: string, p: Prepared): Promise<string> {
  return checkedHash(hash, canonical({ id, kind: p.kind, sourceKey: p.sourceKey, retrievedAt: p.retrievedAt, value: p.value }));
}
export interface FinancialObservationBackup {
  version: 1; target: FinancialObservationTarget; receipts: FinancialObservationReceipt[];
}
export async function validateFinancialObservationBackup(text: string, selected: FinancialObservationTarget, hash: Hash): Promise<FinancialObservationBackup> {
  if (typeof text !== 'string' || bytes(text) > FINANCIAL_BACKUP_LIMIT) throw new Error('Financial archive size limit exceeded.');
  const expected = validateFinancialObservationTarget(selected), e = exact(parse(text), ['format', 'version', 'payload', 'checksum']);
  if (e.format !== FINANCIAL_BACKUP_FORMAT || e.version !== 1 || typeof e.payload !== 'string' || typeof e.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(e.checksum) ||
      bytes(e.payload) > FINANCIAL_BACKUP_LIMIT || canonical(e) !== text || await checkedHash(hash, e.payload) !== e.checksum) throw new Error('Unsupported or corrupt financial archive.');
  const p = exact(parse(e.payload), ['version', 'target', 'receipts']);
  if (p.version !== 1 || canonical(p) !== e.payload || canonical(validateFinancialObservationTarget(p.target as FinancialObservationTarget)) !== canonical(expected) ||
      !Array.isArray(p.receipts) || p.receipts.length > MAX_RECEIPTS) throw new Error('Foreign or unsupported financial archive.');
  let last = 0; const ids = new Set<string>(), receipts: FinancialObservationReceipt[] = [];
  for (const input of p.receipts) {
    const r = exact(input, ['id', 'sequence', 'kind', 'sourceKey', 'retrievedAt', 'checksum', 'value']); receiptId(r.id);
    if (typeof r.sequence !== 'number' || !Number.isSafeInteger(r.sequence) || r.sequence <= last || ids.has(r.id)) throw new Error('Invalid financial archive receipt order.');
    const prepared = prepare(r.kind as FinancialObservationKind, r.value, expected);
    if (canonical(prepared.value) !== canonical(r.value) || r.sourceKey !== prepared.sourceKey || r.retrievedAt !== prepared.retrievedAt ||
        r.checksum !== await receiptDigest(hash, r.id, prepared)) throw new Error('Corrupt financial archive receipt.');
    receipts.push({ id: r.id, sequence: r.sequence, kind: prepared.kind, sourceKey: prepared.sourceKey,
      retrievedAt: prepared.retrievedAt, checksum: r.checksum as string, value: prepared.value });
    last = r.sequence; ids.add(r.id);
  }
  return { version: 1, target: expected, receipts };
}

/** Existing Driver/Hash contracts only. The caller supplies its current owner
 * lease guard, including writable/pending-recovery checks. An authorization
 * failure after COMMIT can mean an uncertain acknowledgement: reconcile the
 * same receipt under its original target, never replay into a new account. */
export class FinancialObservationStore {
  private readonly identity: string;
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly db: Driver, selected: FinancialObservationTarget, private readonly hash: Hash,
    private readonly authorize: (mode: 'read' | 'write', held: FinancialObservationTarget) => Promise<void>) {
    this.identity = canonical(validateFinancialObservationTarget(selected));
  }
  get target(): FinancialObservationTarget { return JSON.parse(this.identity) as FinancialObservationTarget; }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work); this.queue = run.then(() => {}, () => {}); return run;
  }
  private async allowed(mode: 'read' | 'write') { await this.authorize(mode, this.target); }
  private async manifest(tx: Connection) {
    const version = await tx.first<{ user_version: number }>('PRAGMA user_version');
    if (version?.user_version !== 1) throw new Error('Unsupported financial observation store.');
    const m = await tx.first<{ family: string; version: number; store_id: string; scope: string }>('SELECT * FROM financial_manifest WHERE singleton=1');
    const expected = this.target;
    if (!m || m.family !== FAMILY || m.version !== 1 || m.store_id !== expected.storeId || m.scope !== canonical(expected.scope)) throw new Error('Foreign financial observation store.');
  }
  async initialize(create = false): Promise<void> {
    return this.serial(async () => {
      await this.allowed(create ? 'write' : 'read');
      await this.db.transaction(async tx => {
        const version = await tx.first<{ user_version: number }>('PRAGMA user_version');
        if (version?.user_version === 0) {
          if (!create || (await tx.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")).length) throw new Error('Uninitialized or nonempty financial store.');
          await this.allowed('write');
          await tx.exec(FINANCIAL_OBSERVATION_SCHEMA);
          const expected = this.target;
          await tx.run('INSERT INTO financial_manifest VALUES (1,?,?,?,?)', FAMILY, 1, expected.storeId, canonical(expected.scope));
        }
        await this.manifest(tx); await this.allowed(create ? 'write' : 'read');
      });
      await this.allowed(create ? 'write' : 'read');
    });
  }
  private async digest(id: string, p: Prepared): Promise<string> {
    return receiptDigest(this.hash, id, p);
  }
  private async decode(row: SavedRow): Promise<FinancialObservationReceipt> {
    receiptId(row.id);
    if (!Number.isSafeInteger(row.seq) || row.seq < 1 || typeof row.payload !== 'string' || bytes(row.payload) > MAX_BYTES) throw new Error('Invalid saved financial receipt.');
    let input: unknown;
    try { input = JSON.parse(row.payload); } catch { throw new Error('Corrupt financial observation payload.'); }
    const p = prepare(row.kind as FinancialObservationKind, input, this.target);
    if (p.payload !== row.payload || p.sourceKey !== row.source_key || p.retrievedAt !== row.retrieved_at || row.checksum !== await this.digest(row.id, p)) throw new Error('Corrupt financial observation receipt.');
    return { id: row.id, sequence: row.seq, kind: p.kind, sourceKey: p.sourceKey, retrievedAt: p.retrievedAt, checksum: row.checksum, value: p.value };
  }
  async save(id: string, kind: FinancialObservationKind, input: unknown): Promise<FinancialObservationReceipt> {
    receiptId(id);
    // Detach before any queue/hash await; later caller mutation cannot alter the write.
    const p = prepare(kind, input, this.target);
    return this.serial(async () => {
      await this.allowed('write'); const checksum = await this.digest(id, p); await this.allowed('write');
      let receipt: FinancialObservationReceipt | undefined;
      await this.db.transaction(async tx => {
        await this.allowed('write'); await this.manifest(tx);
        await tx.run('INSERT INTO financial_observations(id,kind,source_key,retrieved_at,payload,checksum) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING',
          id, p.kind, p.sourceKey, p.retrievedAt, p.payload, checksum);
        const row = await tx.first<SavedRow>('SELECT * FROM financial_observations WHERE id=?', id);
        if (!row || row.payload !== p.payload || row.kind !== p.kind || row.checksum !== checksum) throw new Error('Financial receipt identity conflict.');
        receipt = await this.decode(row); await this.allowed('write');
      });
      await this.allowed('write');
      if (!receipt) throw new Error('Financial receipt unavailable.');
      return receipt;
    });
  }
  async find(id: string): Promise<FinancialObservationReceipt | null> {
    receiptId(id);
    return this.serial(async () => {
      await this.allowed('read'); let value: FinancialObservationReceipt | null = null;
      await this.db.transaction(async tx => {
        await this.manifest(tx);
        const row = await tx.first<SavedRow>('SELECT * FROM financial_observations WHERE id=?', id);
        value = row ? await this.decode(row) : null; await this.allowed('read');
      });
      await this.allowed('read'); return value;
    });
  }
  async history(offset = 0, limit = 20): Promise<{ total: number; receipts: FinancialObservationReceipt[] }> {
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000 || !Number.isSafeInteger(limit) || limit < 1 || limit > 20) throw new Error('Invalid financial history window.');
    return this.serial(async () => {
      await this.allowed('read'); let total = 0; const receipts: FinancialObservationReceipt[] = [];
      await this.db.transaction(async tx => {
        await this.manifest(tx);
        const count = await tx.first<{ total: number }>('SELECT count(*) total FROM financial_observations');
        if (!count || !Number.isSafeInteger(count.total) || count.total < 0) throw new Error('Invalid financial history count.');
        total = count.total;
        const rows = await tx.all<SavedRow>('SELECT * FROM financial_observations ORDER BY seq DESC LIMIT ? OFFSET ?', limit, offset);
        for (const row of rows) receipts.push(await this.decode(row));
        await this.allowed('read');
      });
      await this.allowed('read'); return { total, receipts };
    });
  }
  private async allReceipts(tx: Connection): Promise<FinancialObservationReceipt[]> {
    const count = await tx.first<{ total: number }>('SELECT count(*) total FROM financial_observations');
    if (!count || !Number.isSafeInteger(count.total) || count.total < 0 || count.total > MAX_RECEIPTS) throw new Error('Financial archive record limit exceeded.');
    const receipts: FinancialObservationReceipt[] = []; let size = 0;
    for (let offset = 0; offset < count.total; offset += 20) {
      const rows = await tx.all<SavedRow>('SELECT * FROM financial_observations ORDER BY seq LIMIT 20 OFFSET ?', offset);
      if (rows.length !== Math.min(20, count.total - offset)) throw new Error('Incomplete financial archive read.');
      for (const row of rows) {
        const receipt = await this.decode(row); size += bytes(canonical(receipt));
        if (size > FINANCIAL_BACKUP_LIMIT) throw new Error('Financial archive size limit exceeded.');
        receipts.push(receipt);
      }
      await this.allowed('read');
    }
    return receipts;
  }
  async exportBackup(): Promise<string> {
    return this.serial(async () => {
      await this.allowed('read'); let receipts: FinancialObservationReceipt[] = [];
      await this.db.transaction(async tx => { await this.manifest(tx); receipts = await this.allReceipts(tx); await this.allowed('read'); });
      const payload = canonical({ version: 1, target: this.target, receipts });
      const text = canonical({ format: FINANCIAL_BACKUP_FORMAT, version: 1, payload, checksum: await checkedHash(this.hash, payload) });
      await validateFinancialObservationBackup(text, this.target, this.hash); await this.allowed('read'); return text;
    });
  }
  /** Empty candidate only; identical replay is safe after a lost acknowledgement.
   * The original file is never overwritten or selected by this method. */
  async restoreBackup(text: string, fault: (stage: 'before-receipt' | 'after-receipt', sequence: number) => Promise<void> = async () => {}): Promise<void> {
    return this.serial(async () => {
      await this.allowed('write'); const archive = await validateFinancialObservationBackup(text, this.target, this.hash); await this.allowed('write');
      await this.db.transaction(async tx => {
        await this.manifest(tx); const original = await this.allReceipts(tx);
        if (original.length) {
          if (canonical(original) !== canonical(archive.receipts)) throw new Error('Financial restore requires an empty candidate.');
        } else {
          for (const receipt of archive.receipts) {
            await this.allowed('write'); await fault('before-receipt', receipt.sequence);
            await tx.run('INSERT INTO financial_observations(seq,id,kind,source_key,retrieved_at,payload,checksum) VALUES (?,?,?,?,?,?,?)',
              receipt.sequence, receipt.id, receipt.kind, receipt.sourceKey, receipt.retrievedAt, canonical(receipt.value), receipt.checksum);
            await fault('after-receipt', receipt.sequence); await this.allowed('write');
          }
        }
        if (canonical(await this.allReceipts(tx)) !== canonical(archive.receipts)) throw new Error('Financial candidate verification failed.');
        await this.allowed('write');
      });
      await this.allowed('write');
    });
  }
  /** Compare complete bounded local observations, not source revisions or a
   * complete provider period. A later timestamp never resolves a difference. */
  async assessFlight(id: string): Promise<{ state: 'missing' | 'consistent' | 'conflict' | 'history-limit'; total: number; variants: string[][] }> {
    sourceFlightId(id);
    return this.serial(async () => {
      await this.allowed('read'); let total = 0; const variants = new Map<string, string[]>();
      await this.db.transaction(async tx => {
        await this.manifest(tx);
        const count = await tx.first<{ total: number }>('SELECT count(*) total FROM financial_observations WHERE kind=? AND source_key=?', 'billed-flight', flightKey(id));
        if (!count || !Number.isSafeInteger(count.total) || count.total < 0) throw new Error('Invalid financial history count.');
        total = count.total;
        if (total <= 20) {
          const rows = await tx.all<SavedRow>('SELECT * FROM financial_observations WHERE kind=? AND source_key=? ORDER BY seq', 'billed-flight', flightKey(id));
          if (rows.length !== total) throw new Error('Incomplete financial history.');
          for (const row of rows) {
            const receipt = await this.decode(row), value = receipt.value as FlightBillingObservation;
            const key = canonical(value.source), group = variants.get(key) ?? []; group.push(receipt.id); variants.set(key, group);
          }
        }
        await this.allowed('read');
      });
      await this.allowed('read');
      return { state: total > 20 ? 'history-limit' : !total ? 'missing' : variants.size === 1 ? 'consistent' : 'conflict', total, variants: [...variants.values()] };
    });
  }
}

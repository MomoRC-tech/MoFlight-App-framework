import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '@moflight/local-data';
import { realHistoryUuid, validateRealHistoryCandidateName, validateRealHistoryManifest, type RealHistoryManifest } from './real-history-contract';

export interface RealSelectionPermit { ownerId: string; storeId: string; leaseId: string; writable: boolean }
export type RealSelectionAuthorization = () => RealSelectionPermit | null;
export type RealSelectionGate = (write: boolean) => Promise<void>;
export interface RealSelectionSnapshot { manifest: RealHistoryManifest; generation: number; receipts: readonly unknown[] }
export interface RealSelectionCandidate { snapshot(): Promise<RealSelectionSnapshot>; close(): Promise<void> }
export type RealCandidateOpener<T extends RealSelectionCandidate> = (name: string, authorize: RealSelectionAuthorization, gate?: RealSelectionGate) => Promise<T>;
export interface RealFlightSelectionResult<T> { candidate: T; name: string; sequence: number; recoveryRequired: boolean; warning: string | null }
interface SelectionRow {
  seq: number; owner_id: string; store_id: string; candidate_name: string; manifest_sha256: string;
  validated_generation: number; activation_id: string; previous_seq: number | null; activated_at: string;
}
const table = `CREATE TABLE real_history_selection(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,candidate_name TEXT NOT NULL,manifest_sha256 TEXT NOT NULL,validated_generation INTEGER NOT NULL CHECK(validated_generation>=0),activation_id TEXT NOT NULL UNIQUE,previous_seq INTEGER REFERENCES real_history_selection(seq),activated_at TEXT NOT NULL)`;
const triggers = [
  ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER real_selection_no_${op.toLowerCase()} BEFORE ${op} ON real_history_selection BEGIN SELECT RAISE(ABORT,'Append-only real history selection'); END`),
  `CREATE TRIGGER real_selection_valid_predecessor BEFORE INSERT ON real_history_selection WHEN NEW.previous_seq IS NOT (SELECT seq FROM real_history_selection WHERE owner_id=NEW.owner_id AND store_id=NEW.store_id ORDER BY seq DESC LIMIT 1) BEGIN SELECT RAISE(ABORT,'Invalid real history selection predecessor'); END`,
  `CREATE TRIGGER real_selection_no_collision BEFORE INSERT ON real_history_selection WHEN EXISTS(SELECT 1 FROM real_history_selection WHERE seq=NEW.seq OR activation_id=NEW.activation_id) BEGIN SELECT RAISE(ABORT,'Real history selection identity collision'); END`,
];
export const REAL_FLIGHT_SELECTION_SCHEMA = [table,...triggers,'PRAGMA user_version=1'].join(';')+';';
const normalize = (sql: string) => sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function time(value: string) { requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,'Invalid activation time'); }
export class IndeterminateRealActivation extends Error {
  constructor(readonly activationId: string, options?: ErrorOptions) { super('Activation outcome requires journal recovery',options); }
}

/** Account-library activation only. Candidate opening/validation stays behind its adapter. */
export class RealFlightSelection<T extends RealSelectionCandidate> {
  private closed = false;
  private constructor(private readonly db: Driver, private readonly ownerId: string, private readonly storeId: string,
    private readonly leaseId: string, private readonly authorize: RealSelectionAuthorization, private readonly opener: RealCandidateOpener<T>,
    private readonly hash: Hash, private readonly fault: (stage: string) => Promise<void>) {}
  private allowed(write = false) {
    const permit = this.authorize();
    requireValue(!this.closed && permit && permit.ownerId === this.ownerId && permit.storeId === this.storeId &&
      permit.leaseId === this.leaseId && typeof permit.writable === 'boolean' && (!write || permit.writable),'Expired or foreign real history selection');
    return permit;
  }
  static async open<T extends RealSelectionCandidate>(db: Driver, ownerId: string, storeId: string, authorize: RealSelectionAuthorization,
    opener: RealCandidateOpener<T>, hash: Hash, create = false, fault: (stage: string) => Promise<void> = async () => {}) {
    realHistoryUuid(ownerId); realHistoryUuid(storeId);
    const permit = authorize();
    requireValue(permit && permit.ownerId === ownerId && permit.storeId === storeId && typeof permit.leaseId === 'string' &&
      permit.leaseId.length > 0 && typeof permit.writable === 'boolean' && (!create || permit.writable),'Unauthorized real history selection');
    const selection = new RealFlightSelection(db,ownerId,storeId,permit.leaseId,authorize,opener,hash,fault);
    await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    requireValue((await db.first<{foreign_keys:number}>('PRAGMA foreign_keys'))?.foreign_keys === 1 &&
      (await db.first<{synchronous:number}>('PRAGMA synchronous'))?.synchronous === 2,'Unsafe real history selection connection');
    if (create) {
      requireValue((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 0 &&
        !(await db.first('SELECT name FROM sqlite_master')),'Existing selection journal preserved');
      await db.transaction(async tx => { selection.allowed(true); await tx.exec(REAL_FLIGHT_SELECTION_SCHEMA); selection.allowed(true); });
    }
    requireValue((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 1,'Unsupported real history selection version');
    const objects = await db.all<{sql:string}>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'");
    requireValue(canonical(objects.map(r=>normalize(r.sql)).sort()) === canonical([table,...triggers].map(normalize).sort()),'Unsupported selection journal shape');
    requireValue((await db.all('PRAGMA foreign_key_check')).length === 0,'Invalid selection journal links');
    const integrity = await db.all<{integrity_check:string}>('PRAGMA integrity_check');
    requireValue(integrity.length === 1 && integrity[0]?.integrity_check === 'ok','Unreadable selection journal');
    const rows = await selection.rows(); for (const row of rows) selection.validateRow(row,rows);
    selection.allowed(); return selection;
  }
  async close() { if (!this.closed) { this.closed = true; await this.db.close(); } }
  private async rows(tx: Connection = this.db) {
    this.allowed(); return tx.all<SelectionRow>('SELECT * FROM real_history_selection WHERE owner_id=? AND store_id=? ORDER BY seq DESC',this.ownerId,this.storeId);
  }
  private validateRow(row: SelectionRow, rows: SelectionRow[]) {
    realHistoryUuid(row.activation_id); validateRealHistoryCandidateName(row.candidate_name); time(row.activated_at);
    const index = rows.findIndex(candidate => candidate.seq === row.seq);
    const predecessor = index >= 0 ? rows[index + 1] : undefined;
    requireValue(row.owner_id === this.ownerId && row.store_id === this.storeId && Number.isSafeInteger(row.seq) && row.seq > 0 &&
      /^[0-9a-f]{64}$/.test(row.manifest_sha256) && Number.isSafeInteger(row.validated_generation) && row.validated_generation >= 0 &&
      index >= 0 && row.previous_seq === (predecessor?.seq ?? null), 'Invalid selection identity or predecessor');
  }
  private async checked(row: SelectionRow, rows: SelectionRow[], authorize = this.authorize, gate?: RealSelectionGate) {
    this.allowed(); this.validateRow(row,rows);
    const candidate = await this.opener(row.candidate_name,authorize,gate);
    try {
      const snapshot = await candidate.snapshot(), manifest = validateRealHistoryManifest(snapshot.manifest);
      requireValue(manifest.owner_id === this.ownerId && manifest.store_id === this.storeId &&
        await this.hash(canonical(manifest)) === row.manifest_sha256 && Number.isSafeInteger(snapshot.generation) &&
        snapshot.generation >= row.validated_generation && snapshot.receipts.length === snapshot.generation,'Selected candidate identity or generation mismatch');
      this.allowed(); return {candidate,snapshot};
    } catch (error) { await candidate.close(); throw error; }
  }
  async activate(activationId: string, name: string, previousSequence: number | null, at: string): Promise<number> {
    this.allowed(true); realHistoryUuid(activationId); validateRealHistoryCandidateName(name); time(at);
    const rows = await this.rows(), old = rows.find(r=>r.activation_id === activationId);
    if (old) {
      requireValue(old.candidate_name === name && old.previous_seq === previousSequence && old.activated_at === at,'Activation ID reused with changed input');
      const opened = await this.checked(old,rows); await opened.candidate.close(); this.allowed(); return old.seq;
    }
    const globalActivation = await this.db.first<{owner_id:string;store_id:string}>(
      'SELECT owner_id,store_id FROM real_history_selection WHERE activation_id=?',activationId);
    this.allowed(true);
    requireValue(!globalActivation,'Activation ID already belongs to another selection');
    await this.fault('before-candidate-open');
    const candidate = await this.opener(name,this.authorize); let snapshot!: RealSelectionSnapshot;
    try {
      snapshot = await candidate.snapshot(); const manifest = validateRealHistoryManifest(snapshot.manifest);
      requireValue(manifest.owner_id === this.ownerId && manifest.store_id === this.storeId && Number.isSafeInteger(snapshot.generation) &&
        snapshot.generation >= 0 && snapshot.receipts.length === snapshot.generation,'Foreign or invalid activation candidate');
      await this.fault('after-candidate-read'); this.allowed(true);
    } finally { await candidate.close(); }
    const manifestHash = await this.hash(canonical(snapshot.manifest)); let committed = false, sequence = 0;
    try {
      await this.db.transaction(async tx => {
        this.allowed(true); const current = await this.rows(tx);
        requireValue((current[0]?.seq ?? null) === previousSequence,'Stale activation predecessor');
        requireValue(!(await tx.first('SELECT activation_id FROM real_history_selection WHERE activation_id=?',activationId)),
          'Activation ID already belongs to another selection');
        await this.fault('before-selection-write');
        await tx.run('INSERT INTO real_history_selection(owner_id,store_id,candidate_name,manifest_sha256,validated_generation,activation_id,previous_seq,activated_at) VALUES (?,?,?,?,?,?,?,?)',
          this.ownerId,this.storeId,name,manifestHash,snapshot.generation,activationId,previousSequence,at);
        sequence = (await tx.first<{seq:number}>('SELECT seq FROM real_history_selection WHERE activation_id=?',activationId))!.seq;
        await this.fault('after-selection-write'); this.allowed(true); committed = true;
      });
      await this.fault('after-selection-commit');
      const readback = (await this.rows()).find(r=>r.activation_id === activationId);
      requireValue(readback?.seq === sequence,'Activation readback unavailable'); this.allowed(); return sequence;
    } catch (error) { if (committed) throw new IndeterminateRealActivation(activationId,{cause:error}); throw error; }
  }
  async select(): Promise<RealFlightSelectionResult<T>> {
    this.allowed(); const rows = await this.rows(); requireValue(rows.length,'No active real history; recovery required');
    const readable = new Map<string,RealSelectionSnapshot>(), unreadable = new Set<string>();
    let selected: {row: SelectionRow; snapshot: RealSelectionSnapshot} | undefined;
    for (const row of rows) {
      if (readable.has(row.candidate_name) || unreadable.has(row.candidate_name)) continue;
      try {
        const opened = await this.checked(row,rows); await opened.candidate.close(); readable.set(row.candidate_name,opened.snapshot);
        selected ??= {row,snapshot:opened.snapshot};
      } catch { this.allowed(); unreadable.add(row.candidate_name); }
    }
    requireValue(selected,'No readable real history; retained candidates need recovery');
    const chosen = selected.snapshot;
    const recoveryRequired = unreadable.size > 0 || [...readable.values()].some(g=>g.generation > chosen.generation ||
      g.receipts.some((receipt,index)=>canonical(receipt) !== canonical(chosen.receipts[index])));
    const guarded: RealSelectionAuthorization = () => { const permit = this.allowed(); return {...permit,writable:permit.writable && !recoveryRequired}; };
    const selectedSequence = rows[0]!.seq;
    const gate: RealSelectionGate = async write => {
      this.allowed(write); requireValue((await this.rows())[0]?.seq === selectedSequence,'Active real history changed; reopen required');
      requireValue(!write || !recoveryRequired,'Read-only real history recovery');
    };
    const reopened = await this.checked(selected.row,rows,guarded,gate);
    try { this.allowed(); }
    catch (error) { await reopened.candidate.close(); throw error; }
    return {candidate:reopened.candidate,name:selected.row.candidate_name,sequence:selected.row.seq,recoveryRequired,
      warning:recoveryRequired || selected.row.seq !== selectedSequence ? 'Recovery required; retained candidates and pending receipts are preserved.' : null};
  }
}

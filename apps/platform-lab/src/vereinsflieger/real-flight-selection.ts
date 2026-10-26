import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '@moflight/local-data';
import { realHistoryUuid, validateRealHistoryCandidateName, validateRealHistoryManifest, type RealHistoryManifest } from './real-history-contract';

export interface RealSelectionPermit { ownerId: string; storeId: string; leaseId: string; writable: boolean }
export type RealSelectionAuthorization = () => RealSelectionPermit | null;
export type RealSelectionGate = (write: boolean) => Promise<void>;
/** The native candidate reader performs full history replay before returning this complete graph. */
export interface RealSelectionSnapshot { manifest: RealHistoryManifest; generation: number; receipts: readonly unknown[]; records: readonly unknown[] }
export interface RealSelectionCandidate { snapshot(): Promise<RealSelectionSnapshot>; close(): Promise<void> }
export type RealCandidateOpener<T extends RealSelectionCandidate> = (name: string, authorize: RealSelectionAuthorization, gate?: RealSelectionGate) => Promise<T>;
export interface RealFlightSelectionResult<T> {
  candidate: T; name: string; sequence: number; selectedAt: string; recoveryRequired: boolean; warning: string | null;
  selectionIdentity: string;
}
export interface RealFlightRestorePreparation {
  version: 1; ownerId: string; storeId: string; operationId: string; candidateName: string;
  expectedGraphSha256: string; previousSequence: number | null; preparedAt: string;
  status: 'pending' | 'stale' | 'activated'; activatedSequence: number | null;
}
export interface PrepareRealFlightRestoreInput {
  operationId: string; candidateName: string; expectedGraphSha256: string;
  previousSequence: number | null; preparedAt: string;
}
export type RealFlightSelectionInspection<T> =
  | { state: 'empty'; headSequence: null; selected: null; preparations: RealFlightRestorePreparation[] }
  | { state: 'selected' | 'recovery-required'; headSequence: number; selected: RealFlightSelectionResult<T>; preparations: RealFlightRestorePreparation[] }
  | { state: 'unreadable'; headSequence: number; selected: null; preparations: RealFlightRestorePreparation[]; warning: string };

interface SelectionRow {
  seq: number; owner_id: string; store_id: string; candidate_name: string; manifest_sha256: string;
  validated_generation: number; activation_id: string; previous_seq: number | null; activated_at: string;
}
interface RestorePreparationRow {
  owner_id: string; store_id: string; operation_id: string; candidate_name: string; expected_graph_sha256: string;
  previous_seq: number | null; prepared_at: string;
}
const table = `CREATE TABLE real_history_selection(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,candidate_name TEXT NOT NULL,manifest_sha256 TEXT NOT NULL,validated_generation INTEGER NOT NULL CHECK(validated_generation>=0),activation_id TEXT NOT NULL UNIQUE,previous_seq INTEGER REFERENCES real_history_selection(seq),activated_at TEXT NOT NULL)`;
const preparationTable = `CREATE TABLE real_history_restore_preparations(owner_id TEXT NOT NULL,store_id TEXT NOT NULL,operation_id TEXT NOT NULL UNIQUE,candidate_name TEXT NOT NULL UNIQUE,expected_graph_sha256 TEXT NOT NULL,previous_seq INTEGER REFERENCES real_history_selection(seq),prepared_at TEXT NOT NULL,PRIMARY KEY(owner_id,store_id,operation_id))`;
const triggers = [
  ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER real_selection_no_${op.toLowerCase()} BEFORE ${op} ON real_history_selection BEGIN SELECT RAISE(ABORT,'Append-only real history selection'); END`),
  ...['UPDATE','DELETE'].map(op => `CREATE TRIGGER real_restore_preparation_no_${op.toLowerCase()} BEFORE ${op} ON real_history_restore_preparations BEGIN SELECT RAISE(ABORT,'Append-only real restore preparation'); END`),
  `CREATE TRIGGER real_selection_valid_predecessor BEFORE INSERT ON real_history_selection WHEN NEW.previous_seq IS NOT (SELECT seq FROM real_history_selection WHERE owner_id=NEW.owner_id AND store_id=NEW.store_id ORDER BY seq DESC LIMIT 1) BEGIN SELECT RAISE(ABORT,'Invalid real history selection predecessor'); END`,
  `CREATE TRIGGER real_selection_no_collision BEFORE INSERT ON real_history_selection WHEN EXISTS(SELECT 1 FROM real_history_selection WHERE seq=NEW.seq OR activation_id=NEW.activation_id) OR EXISTS(SELECT 1 FROM real_history_restore_preparations WHERE candidate_name=NEW.candidate_name AND NOT(owner_id=NEW.owner_id AND store_id=NEW.store_id AND operation_id=NEW.activation_id AND previous_seq IS NEW.previous_seq AND prepared_at=NEW.activated_at)) BEGIN SELECT RAISE(ABORT,'Real history selection identity collision'); END`,
  `CREATE TRIGGER real_selection_matches_preparation BEFORE INSERT ON real_history_selection WHEN EXISTS(SELECT 1 FROM real_history_restore_preparations WHERE operation_id=NEW.activation_id) AND NOT EXISTS(SELECT 1 FROM real_history_restore_preparations WHERE owner_id=NEW.owner_id AND store_id=NEW.store_id AND operation_id=NEW.activation_id AND candidate_name=NEW.candidate_name AND previous_seq IS NEW.previous_seq AND prepared_at=NEW.activated_at) BEGIN SELECT RAISE(ABORT,'Real history selection does not match its restore preparation'); END`,
  `CREATE TRIGGER real_restore_preparation_valid_predecessor BEFORE INSERT ON real_history_restore_preparations WHEN NEW.previous_seq IS NOT (SELECT seq FROM real_history_selection WHERE owner_id=NEW.owner_id AND store_id=NEW.store_id ORDER BY seq DESC LIMIT 1) BEGIN SELECT RAISE(ABORT,'Invalid real restore preparation predecessor'); END`,
  `CREATE TRIGGER real_restore_preparation_no_collision BEFORE INSERT ON real_history_restore_preparations WHEN EXISTS(SELECT 1 FROM real_history_selection WHERE activation_id=NEW.operation_id OR candidate_name=NEW.candidate_name) OR EXISTS(SELECT 1 FROM real_history_restore_preparations WHERE operation_id=NEW.operation_id OR candidate_name=NEW.candidate_name) BEGIN SELECT RAISE(ABORT,'Real restore preparation identity collision'); END`,
];
export const REAL_FLIGHT_SELECTION_SCHEMA = [table,preparationTable,...triggers,'PRAGMA user_version=1'].join(';')+';';
const normalize = (sql: string) => sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
function requireValue(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
function time(value: string) { requireValue(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value,'Invalid activation time'); }
function exactKeys(value: unknown, keys: string[], message: string): asserts value is Record<string, unknown> {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical([...keys].sort()),message);
}
function validatePreparationInput(input: PrepareRealFlightRestoreInput): PrepareRealFlightRestoreInput {
  exactKeys(input,['operationId','candidateName','expectedGraphSha256','previousSequence','preparedAt'],'Invalid real restore preparation input');
  realHistoryUuid(input.operationId); validateRealHistoryCandidateName(input.candidateName);
  requireValue(typeof input.expectedGraphSha256 === 'string' && /^[0-9a-f]{64}$/.test(input.expectedGraphSha256),'Invalid restore graph digest');
  requireValue(input.previousSequence === null || Number.isSafeInteger(input.previousSequence) && input.previousSequence > 0,'Invalid restore predecessor');
  time(input.preparedAt);
  return input;
}
function fullGraph(snapshot: RealSelectionSnapshot): RealSelectionSnapshot {
  exactKeys(snapshot,['manifest','generation','receipts','records'],'Invalid complete real flight graph snapshot');
  const manifest = validateRealHistoryManifest(snapshot.manifest);
  requireValue(Number.isSafeInteger(snapshot.generation) && snapshot.generation >= 0 && Array.isArray(snapshot.receipts) &&
    snapshot.receipts.length === snapshot.generation && Array.isArray(snapshot.records),'Invalid complete real flight graph snapshot');
  return { manifest, generation: snapshot.generation, receipts: snapshot.receipts, records: snapshot.records };
}

function isGraphPrefix(prefix: RealSelectionSnapshot, graph: RealSelectionSnapshot): boolean {
  if (prefix.generation > graph.generation || prefix.receipts.length > graph.receipts.length || prefix.records.length > graph.records.length ||
      prefix.generation === graph.generation && prefix.records.length !== graph.records.length) return false;
  return prefix.receipts.every((receipt,index) => canonical(receipt) === canonical(graph.receipts[index])) &&
    prefix.records.every((record,index) => canonical(record) === canonical(graph.records[index]));
}

export class IndeterminateRealActivation extends Error {
  constructor(readonly activationId: string, options?: ErrorOptions) { super('Activation outcome requires journal recovery',options); }
}
export class IndeterminateRealRestorePreparation extends Error {
  constructor(readonly operationId: string, options?: ErrorOptions) { super('Restore preparation outcome requires journal recovery',options); }
}
export class NoActiveRealFlightSelection extends Error { constructor() { super('No active real history; recovery required'); } }
export class NoReadableRealFlightSelection extends Error { constructor() { super('No readable real history; retained candidates need recovery'); } }

/** Account-library activation and append-only restore recovery journal. */
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
    requireValue(canonical(objects.map(r=>normalize(r.sql)).sort()) === canonical([table,preparationTable,...triggers].map(normalize).sort()),'Unsupported selection journal shape');
    requireValue((await db.all('PRAGMA foreign_key_check')).length === 0,'Invalid selection journal links');
    const integrity = await db.all<{integrity_check:string}>('PRAGMA integrity_check');
    requireValue(integrity.length === 1 && integrity[0]?.integrity_check === 'ok','Unreadable selection journal');
    const rows = await selection.rows(); for (const row of rows) selection.validateRow(row,rows);
    for (const preparation of await selection.rawPreparations()) selection.validatePreparation(preparation,rows);
    selection.allowed(); return selection;
  }
  async close() { if (!this.closed) { this.closed = true; await this.db.close(); } }
  /** Guards the activation context of an already verified displayed snapshot.
   * This does not inspect candidate files or establish their current integrity.
   */
  async assertIdentity(expected: string): Promise<void> {
    this.allowed();
    const rows = await this.rows();
    for (const row of rows) this.validateRow(row,rows);
    requireValue(canonical(rows) === expected,'Active real history selection changed; reload required');
    this.allowed();
  }
  private async rows(tx: Connection = this.db) {
    this.allowed(); return tx.all<SelectionRow>('SELECT * FROM real_history_selection WHERE owner_id=? AND store_id=? ORDER BY seq DESC',this.ownerId,this.storeId);
  }
  private async rawPreparations(tx: Connection = this.db) {
    this.allowed(); return tx.all<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE owner_id=? AND store_id=? ORDER BY rowid',this.ownerId,this.storeId);
  }
  private validateRow(row: SelectionRow, rows: SelectionRow[]) {
    realHistoryUuid(row.activation_id); validateRealHistoryCandidateName(row.candidate_name); time(row.activated_at);
    const index = rows.findIndex(candidate => candidate.seq === row.seq);
    const predecessor = index >= 0 ? rows[index + 1] : undefined;
    requireValue(row.owner_id === this.ownerId && row.store_id === this.storeId && Number.isSafeInteger(row.seq) && row.seq > 0 &&
      /^[0-9a-f]{64}$/.test(row.manifest_sha256) && Number.isSafeInteger(row.validated_generation) && row.validated_generation >= 0 &&
      index >= 0 && row.previous_seq === (predecessor?.seq ?? null), 'Invalid selection identity or predecessor');
  }
  private validatePreparation(row: RestorePreparationRow, rows: SelectionRow[]) {
    realHistoryUuid(row.operation_id); validateRealHistoryCandidateName(row.candidate_name); time(row.prepared_at);
    requireValue(row.owner_id === this.ownerId && row.store_id === this.storeId && /^[0-9a-f]{64}$/.test(row.expected_graph_sha256) &&
      (row.previous_seq === null || Number.isSafeInteger(row.previous_seq) && row.previous_seq > 0) &&
      (row.previous_seq === null || rows.some(candidate => candidate.seq === row.previous_seq)), 'Invalid real restore preparation');
    const linked = rows.find(candidate => candidate.activation_id === row.operation_id);
    if (linked) requireValue(linked.candidate_name === row.candidate_name && linked.previous_seq === row.previous_seq &&
      linked.activated_at === row.prepared_at,'Invalid activated restore preparation relation');
  }
  private async checked(row: SelectionRow, rows: SelectionRow[], authorize = this.authorize, gate?: RealSelectionGate) {
    this.allowed(); this.validateRow(row,rows);
    const candidate = await this.opener(row.candidate_name,authorize,gate);
    try {
      return {candidate,snapshot:await this.checkedSnapshot(candidate,row)};
    } catch (error) { await candidate.close(); throw error; }
  }
  private async checkedSnapshot(candidate: T, row: SelectionRow): Promise<RealSelectionSnapshot> {
    const snapshot = fullGraph(await candidate.snapshot()), manifest = snapshot.manifest;
    requireValue(manifest.owner_id === this.ownerId && manifest.store_id === this.storeId &&
      await this.hash(canonical(manifest)) === row.manifest_sha256 && snapshot.generation >= row.validated_generation,
      'Selected candidate identity or generation mismatch');
    this.allowed(); return snapshot;
  }
  private preparationView(row: RestorePreparationRow, rows: SelectionRow[]): RealFlightRestorePreparation {
    this.validatePreparation(row,rows);
    const linked = rows.find(candidate => candidate.activation_id === row.operation_id);
    const latestSequence = rows[0]?.seq ?? null;
    return { version:1, ownerId:row.owner_id, storeId:row.store_id, operationId:row.operation_id,
      candidateName:row.candidate_name, expectedGraphSha256:row.expected_graph_sha256, previousSequence:row.previous_seq,
      preparedAt:row.prepared_at, status:linked ? 'activated' : latestSequence === row.previous_seq ? 'pending' : 'stale',
      activatedSequence:linked?.seq ?? null };
  }
  async listRestorePreparations(): Promise<RealFlightRestorePreparation[]> {
    this.allowed(); const rows = await this.rows();
    return (await this.rawPreparations()).map(row=>this.preparationView(row,rows));
  }
  async getRestorePreparation(operationId: string): Promise<RealFlightRestorePreparation | null> {
    this.allowed(); realHistoryUuid(operationId);
    const row = await this.db.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=? AND owner_id=? AND store_id=?',
      operationId,this.ownerId,this.storeId);
    if (!row) return null;
    return this.preparationView(row,await this.rows());
  }
  async prepareRestore(inputValue: PrepareRealFlightRestoreInput): Promise<RealFlightRestorePreparation> {
    this.allowed(true); const input = validatePreparationInput(inputValue);
    // Resolve an exact command retry before checking the current predecessor.
    const existing = await this.db.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=?',input.operationId);
    if (existing) {
      requireValue(existing.owner_id === this.ownerId && existing.store_id === this.storeId && existing.candidate_name === input.candidateName &&
        existing.expected_graph_sha256 === input.expectedGraphSha256 && existing.previous_seq === input.previousSequence &&
        existing.prepared_at === input.preparedAt,'Restore operation ID reused with changed input');
      return this.preparationView(existing,await this.rows());
    }
    const activation = await this.db.first('SELECT activation_id FROM real_history_selection WHERE activation_id=?',input.operationId);
    requireValue(!activation,'Restore operation ID already belongs to an activation');
    let committed = false, transactionBodyComplete = false;
    try {
      await this.db.transaction(async tx => {
        this.allowed(true);
        const raced = await tx.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=?',input.operationId);
        if (raced) {
          requireValue(raced.owner_id === this.ownerId && raced.store_id === this.storeId && raced.candidate_name === input.candidateName &&
            raced.expected_graph_sha256 === input.expectedGraphSha256 && raced.previous_seq === input.previousSequence && raced.prepared_at === input.preparedAt,
            'Restore operation ID reused with changed input');
          return;
        }
        const current = await this.rows(tx);
        requireValue((current[0]?.seq ?? null) === input.previousSequence,'Stale restore preparation predecessor');
        const pending = (await tx.all<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE owner_id=? AND store_id=?',this.ownerId,this.storeId))
          .map(row=>this.preparationView(row,current)).filter(row=>row.status !== 'activated');
        requireValue(pending.length === 0,'Resolve the pending real restore preparation first');
        requireValue(!(await tx.first('SELECT candidate_name FROM real_history_selection WHERE candidate_name=?',input.candidateName)) &&
          !(await tx.first('SELECT candidate_name FROM real_history_restore_preparations WHERE candidate_name=?',input.candidateName)),
          'Restore candidate name already belongs to retained history');
        await this.fault('before-restore-preparation-write');
        await tx.run('INSERT INTO real_history_restore_preparations(owner_id,store_id,operation_id,candidate_name,expected_graph_sha256,previous_seq,prepared_at) VALUES (?,?,?,?,?,?,?)',
          this.ownerId,this.storeId,input.operationId,input.candidateName,input.expectedGraphSha256,input.previousSequence,input.preparedAt);
        await this.fault('after-restore-preparation-write'); this.allowed(true); transactionBodyComplete = true;
      });
      committed = true;
      await this.fault('after-restore-preparation-commit');
      const result = await this.getRestorePreparation(input.operationId);
      requireValue(result && result.candidateName === input.candidateName && result.expectedGraphSha256 === input.expectedGraphSha256,
        'Restore preparation readback unavailable');
      return result;
    } catch (error) {
      if (committed || transactionBodyComplete) throw new IndeterminateRealRestorePreparation(input.operationId,{cause:error});
      throw error;
    }
  }
  async activate(activationId: string, name: string, previousSequence: number | null, at: string): Promise<number> {
    this.allowed(true); realHistoryUuid(activationId); validateRealHistoryCandidateName(name); time(at);
    const existingPreparation = await this.db.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=?',activationId);
    if (existingPreparation) {
      const prep = this.preparationView(existingPreparation,await this.rows());
      requireValue(prep.candidateName === name && prep.previousSequence === previousSequence && prep.preparedAt === at,
        'Activation does not match its restore preparation');
      if (prep.status === 'activated') return prep.activatedSequence!;
      throw new Error('Prepared restores must use activatePreparedRestore');
    }
    return this.appendActivation(activationId,name,previousSequence,at,null);
  }
  private async appendActivation(activationId: string, name: string, previousSequence: number | null, at: string,
    expectedGraphSha256: string | null): Promise<number> {
    const rows = await this.rows(), old = rows.find(r=>r.activation_id === activationId);
    if (old) {
      requireValue(old.candidate_name === name && old.previous_seq === previousSequence && old.activated_at === at,'Activation ID reused with changed input');
      if (expectedGraphSha256 === null) {
        const opened = await this.checked(old,rows); await opened.candidate.close(); this.allowed();
      }
      return old.seq;
    }
    const globalActivation = await this.db.first<{owner_id:string;store_id:string}>(
      'SELECT owner_id,store_id FROM real_history_selection WHERE activation_id=?',activationId);
    this.allowed(true);
    requireValue(!globalActivation,'Activation ID already belongs to another selection');
    await this.fault('before-candidate-open');
    const candidate = await this.opener(name,this.authorize); let snapshot!: RealSelectionSnapshot;
    try {
      snapshot = fullGraph(await candidate.snapshot()); const manifest = snapshot.manifest;
      requireValue(manifest.owner_id === this.ownerId && manifest.store_id === this.storeId,'Foreign activation candidate');
      if (expectedGraphSha256 !== null) requireValue(await this.hash(canonical(snapshot)) === expectedGraphSha256,
        'Prepared restore candidate graph does not match reviewed backup');
      await this.fault('after-candidate-read'); this.allowed(true);
    } finally { await candidate.close(); }
    const manifestHash = await this.hash(canonical(snapshot.manifest)); let committed = false, sequence = 0;
    try {
      await this.db.transaction(async tx => {
        this.allowed(true); const current = await this.rows(tx);
        requireValue((current[0]?.seq ?? null) === previousSequence,'Stale activation predecessor');
        if (expectedGraphSha256 !== null) {
          const prep = await tx.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=? AND owner_id=? AND store_id=?',
            activationId,this.ownerId,this.storeId);
          requireValue(prep && prep.candidate_name === name && prep.expected_graph_sha256 === expectedGraphSha256 &&
            prep.previous_seq === previousSequence && prep.prepared_at === at,'Restore preparation changed before activation');
        }
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
  async activatePreparedRestore(operationId: string): Promise<number> {
    this.allowed(true); realHistoryUuid(operationId);
    const prep = await this.db.first<RestorePreparationRow>('SELECT * FROM real_history_restore_preparations WHERE operation_id=? AND owner_id=? AND store_id=?',
      operationId,this.ownerId,this.storeId);
    requireValue(prep,'Unknown real restore preparation');
    const rows = await this.rows(), view = this.preparationView(prep,rows);
    // Exact retries resolve from the durable activation row even after later
    // activations or legitimate writes changed the restored candidate graph.
    if (view.status === 'activated') return view.activatedSequence!;
    requireValue(view.status === 'pending','Stale restore preparation predecessor; retained candidate needs recovery');
    return this.appendActivation(prep.operation_id,prep.candidate_name,prep.previous_seq,prep.prepared_at,prep.expected_graph_sha256);
  }
  async select(): Promise<RealFlightSelectionResult<T>> {
    this.allowed(); const rows = await this.rows(); if (!rows.length) throw new NoActiveRealFlightSelection();
    const readable = new Map<string,RealSelectionSnapshot>(), unreadable = new Set<string>();
    let selected: {row: SelectionRow; candidate: T} | undefined;
    let admitted = false, recoveryRequired = true;
    // Open the eventual selected handle with its final, live guards from the
    // outset. Inspection is read-only until every retained branch is checked.
    const guarded: RealSelectionAuthorization = () => { const permit = this.allowed(); return {...permit,writable:permit.writable && admitted && !recoveryRequired}; };
    const selectedSequence = rows[0]!.seq;
    const gate: RealSelectionGate = async write => {
      this.allowed(write); requireValue((await this.rows())[0]?.seq === selectedSequence,'Active real history changed; reopen required');
      requireValue(!write || admitted && !recoveryRequired,'Read-only real history recovery');
    };
    try {
      for (const row of rows) {
        if (readable.has(row.candidate_name) || unreadable.has(row.candidate_name)) continue;
        try {
          const opened = await this.checked(row,rows,guarded,gate);
          if (!selected) selected = {row,candidate:opened.candidate};
          else await opened.candidate.close();
          readable.set(row.candidate_name,opened.snapshot);
        } catch { this.allowed(); unreadable.add(row.candidate_name); }
      }
      if (!selected) throw new NoReadableRealFlightSelection();
      // Keep the final fresh schema/byte/identity/generation read. The retained
      // library can reuse replay only for exact bytes it already validated;
      // changed bytes are fully validated before recovery classification.
      const chosen = await this.checkedSnapshot(selected.candidate,selected.row);
      recoveryRequired = unreadable.size > 0 || [...readable.values()].some(graph => !isGraphPrefix(graph,chosen));
      admitted = true;
      await gate(false); this.allowed();
      return {candidate:selected.candidate,name:selected.row.candidate_name,sequence:selected.row.seq,selectedAt:selected.row.activated_at,recoveryRequired,selectionIdentity:canonical(rows),
        warning:recoveryRequired || selected.row.seq !== selectedSequence ? 'Recovery required; retained candidates and pending receipts are preserved.' : null};
    } catch (error) {
      try { await selected?.candidate.close(); } catch { /* Preserve the selection failure after attempting handle cleanup. */ }
      throw error;
    }
  }
  async inspect(): Promise<RealFlightSelectionInspection<T>> {
    this.allowed(); const preparations = await this.listRestorePreparations();
    const rows = await this.rows();
    if (!rows.length) return {state:'empty',headSequence:null,selected:null,preparations};
    try {
      const selected = await this.select();
      return {state:selected.recoveryRequired ? 'recovery-required' : 'selected',headSequence:rows[0]!.seq,selected,preparations};
    } catch (error) {
      if (error instanceof NoReadableRealFlightSelection) return {state:'unreadable',headSequence:rows[0]!.seq,selected:null,preparations,warning:error.message};
      throw error;
    }
  }
}

import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '../../../../packages/local-data/src/index';
import type { HistoryScope } from './history-facts';
import { BACKUP_LIMIT, COMMAND_LIMIT, boundedJson, cloneProof, deriveCommand, exactKeys, latestRecord, latestValues, proofText, proofWorkspace, requireProof, utf8Size, validateManifest, validateProofGraph,
  type ProofCommand, type ProofGraph, type ProofManifest, type ProofReceipt, type ProofRecord, type ProofResult, type StoredChoice, type StoredFacts, type StoredFlight } from './history-proof-model';
import type { HistoryBook } from './history-plan';

export interface ProofPermit { mode: 'synthetic-only'; ownerId: string; storeId: string; leaseId: string; scopeIds: string[]; writable: boolean }
export type ProofAuthorization = () => ProofPermit | null;
export type ProofFault = (stage: string) => Promise<void>;
export type ProofAccessGate = (write:boolean) => Promise<void>;
const tableSql = {
  history_manifest: `CREATE TABLE history_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1),family TEXT NOT NULL CHECK(family='moflight-history-proof'),schema_version INTEGER NOT NULL CHECK(schema_version=1),payload_version INTEGER NOT NULL CHECK(payload_version=1),mode TEXT NOT NULL CHECK(mode='synthetic-only'),store_id TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL)`,
  history_receipts: `CREATE TABLE history_receipts(command_id TEXT PRIMARY KEY NOT NULL,owner_id TEXT NOT NULL REFERENCES history_manifest(owner_id),kind TEXT NOT NULL CHECK(kind IN ('catalogue','import')),base_generation INTEGER NOT NULL CHECK(base_generation>=0),generation INTEGER NOT NULL UNIQUE CHECK(generation=base_generation+1),request_json TEXT NOT NULL CHECK(json_valid(request_json)),request_sha256 TEXT NOT NULL,result_json TEXT NOT NULL CHECK(json_valid(result_json)),committed_at TEXT NOT NULL)`,
  history_records: `CREATE TABLE history_records(seq INTEGER PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES history_manifest(owner_id),kind TEXT NOT NULL CHECK(kind IN ('scope','capture','flight','facts','book','choice','coverage','pending')),id TEXT NOT NULL,revision INTEGER NOT NULL CHECK(revision>0),generation INTEGER NOT NULL REFERENCES history_receipts(generation),payload TEXT NOT NULL CHECK(json_valid(payload)),payload_sha256 TEXT NOT NULL)`,
};
// This explicit named index enforces the draft's UNIQUE(kind,id,revision).
const schema: Record<string,string> = {...tableSql,
  history_record_identity: 'CREATE UNIQUE INDEX history_record_identity ON history_records(kind,id,revision)',
  history_record_latest: 'CREATE INDEX history_record_latest ON history_records(kind,id,revision DESC)',
};
for (const table of Object.keys(tableSql)) for (const operation of ['UPDATE','DELETE']) {
  const name = `${table}_no_${operation.toLowerCase()}`;
  schema[name] = `CREATE TRIGGER ${name} BEFORE ${operation} ON ${table} BEGIN SELECT RAISE(ABORT,'Append-only history proof'); END`;
}
export const HISTORY_PROOF_SCHEMA = Object.values(schema).join(';\n')+'; PRAGMA user_version=1;';
const normalizeSql = (sql: string) => sql.trim().replace(/;$/,'').replace(/\s+/g,' ');
async function configure(db: Driver) {
  await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  requireProof((await db.first<{foreign_keys:number}>('PRAGMA foreign_keys'))?.foreign_keys === 1 && (await db.first<{synchronous:number}>('PRAGMA synchronous'))?.synchronous === 2, 'Unsafe proof connection');
}
async function checkSchema(db: Connection) {
  requireProof((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 1, 'Unsupported proof SQL version');
  const actual = await db.all<{name:string;sql:string}>("SELECT name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name");
  requireProof(canonical(actual.map(r => r.name)) === canonical(Object.keys(schema).sort()) && actual.every(r => normalizeSql(r.sql) === normalizeSql(schema[r.name]!)), 'Unsupported proof SQL shape');
  requireProof((await db.all('PRAGMA foreign_key_check')).length === 0, 'Broken proof foreign keys');
  const integrity = await db.all<{integrity_check:string}>('PRAGMA integrity_check');
  requireProof(integrity.length === 1 && integrity[0]!.integrity_check === 'ok', 'Unreadable proof database');
}
async function graphFrom(db: Connection): Promise<ProofGraph> {
  const manifests = await db.all<ProofManifest>('SELECT * FROM history_manifest'); requireProof(manifests.length === 1, 'Missing proof manifest');
  const receipts = await db.all<ProofReceipt>('SELECT * FROM history_receipts ORDER BY generation');
  return {manifest:manifests[0]!,generation:receipts.length,receipts,records:await db.all<ProofRecord>('SELECT * FROM history_records ORDER BY seq')};
}
async function authorizedGraph(db:Connection,p:ProofPermit):Promise<ProofGraph> {
  const m=await db.first<ProofManifest>('SELECT * FROM history_manifest');
  requireProof(m?.owner_id===p.ownerId&&m.store_id===p.storeId,'Foreign proof manifest');
  const scopes=await db.all<{id:string}>("SELECT DISTINCT id FROM history_records WHERE kind='scope'");
  requireProof(scopes.every(s=>p.scopeIds.includes(s.id)),'Proof file contains an unauthorized scope');
  return graphFrom(db);
}
export class IndeterminateProofCommit extends Error {
  constructor(readonly commandId: string, options?: ErrorOptions) { super('History proof commit outcome requires receipt recovery',options); }
}

/** No application factory or native adapter connects this repository. */
export class HistoryProofStore {
  private closed = false;
  private constructor(private readonly db: Driver, readonly manifest: Readonly<ProofManifest>, private readonly hash: Hash,
    private readonly authorize: ProofAuthorization, private readonly leaseId: string, private readonly fault: ProofFault, private readonly gate:ProofAccessGate=async()=>{}) {}
  static permit(authorize: ProofAuthorization, ownerId: string, storeId: string, write = false) {
    const p = authorize(); proofText(ownerId); proofText(storeId);
    requireProof(p && p.mode === 'synthetic-only' && p.ownerId === ownerId && p.storeId === storeId && typeof p.leaseId === 'string' && p.leaseId.length > 0 && Array.isArray(p.scopeIds) && typeof p.writable==='boolean' && (!write || p.writable===true), 'Unauthorized history proof access'); return cloneProof(p);
  }
  private allowed(write = false, scopeId?: string) {
    requireProof(!this.closed, 'Closed history proof handle');
    const p = HistoryProofStore.permit(this.authorize,this.manifest.owner_id,this.manifest.store_id,write);
    requireProof(p.leaseId === this.leaseId && (!scopeId || p.scopeIds.includes(scopeId)), 'Expired or foreign proof scope'); return p;
  }
  static async create(db: Driver, manifest: ProofManifest, hash: Hash, authorize: ProofAuthorization, fault: ProofFault = async () => {}) {
    manifest = cloneProof(manifest);
    validateManifest(manifest); const p = this.permit(authorize,manifest.owner_id,manifest.store_id,true); await configure(db);
    requireProof((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version === 0 && !(await db.first('SELECT name FROM sqlite_master')), 'Existing proof candidate preserved');
    await db.transaction(async tx => {
      const active=this.permit(authorize,manifest.owner_id,manifest.store_id,true); requireProof(active.leaseId===p.leaseId,'Expired proof creation');
      await tx.exec(HISTORY_PROOF_SCHEMA);
      await tx.run('INSERT INTO history_manifest VALUES (?,?,?,?,?,?,?,?)',manifest.singleton,manifest.family,manifest.schema_version,manifest.payload_version,manifest.mode,manifest.store_id,manifest.owner_id,manifest.created_at);
    });
    const store = new HistoryProofStore(db,Object.freeze(cloneProof(manifest)),hash,authorize,p.leaseId,fault); await store.snapshot(); return store;
  }
  static async open(db: Driver, ownerId: string, storeId: string, hash: Hash, authorize: ProofAuthorization, fault: ProofFault = async () => {}, gate:ProofAccessGate=async()=>{}) {
    const p = this.permit(authorize,ownerId,storeId); await configure(db);
    let graph!: ProofGraph; await db.transaction(async tx => {
      await checkSchema(tx);
      graph = await authorizedGraph(tx,p); await validateProofGraph(graph,hash);
    });
    requireProof(graph.manifest.owner_id === ownerId && graph.manifest.store_id === storeId, 'Foreign proof manifest');
    const store = new HistoryProofStore(db,Object.freeze(cloneProof(graph.manifest)),hash,authorize,p.leaseId,fault,gate); store.allowed(); return store;
  }
  async close() { if (!this.closed) { this.closed = true; await this.db.close(); } }
  async snapshot(): Promise<ProofGraph> {
    const p = this.allowed(); await this.gate(false); let graph!: ProofGraph;
    await this.db.transaction(async tx => {
      await checkSchema(tx); graph = await authorizedGraph(tx,p); await validateProofGraph(graph,this.hash);
    });
    requireProof(graph.manifest.owner_id === p.ownerId && graph.manifest.store_id === p.storeId, 'Foreign proof file');
    await this.gate(false); this.allowed(); return cloneProof(graph);
  }
  async workspace(scope: HistoryScope) {
    this.allowed(false,scope.scopeId); requireProof(scope.ownerId === this.manifest.owner_id, 'Foreign workspace');
    const result = proofWorkspace(await this.snapshot(),scope); this.allowed(false,scope.scopeId); return result;
  }
  async history(scope:HistoryScope, bookIds?:string[]) {
    this.allowed(false,scope.scopeId); requireProof(scope.ownerId===this.manifest.owner_id,'Foreign history scope');
    const graph=await this.snapshot(), workspace=proofWorkspace(graph,scope);
    if(bookIds) requireProof(new Set(bookIds).size===bookIds.length&&bookIds.every(id=>workspace.books.some(b=>b.id===id)),'Foreign/duplicate history book');
    const flights=latestValues<StoredFlight>(graph.records,'flight').filter(f=>canonical(f.scope)===canonical(scope));
    const rows=flights.flatMap(f=>{
      const id=graph.records.find(r=>r.kind==='flight'&&JSON.parse(r.payload).candidateId===f.candidateId)!.id;
      const factsRow=latestRecord(graph.records,'facts',id)!, facts=(JSON.parse(factsRow.payload) as StoredFacts).facts;
      const choiceRow=latestRecord(graph.records,'choice',id), saved:StoredChoice|null=choiceRow?JSON.parse(choiceRow.payload) as StoredChoice:null;
      const book=saved?.choice.bookId?workspace.books.find(b=>b.id===saved.choice.bookId):null;
      const bookRow=book?latestRecord(graph.records,'book',book.id):null;
      const supported=!book||saved!.fixture.formats.some(f=>f.id===book.formatId&&f.version===book.formatVersion);
      const stale=!saved||saved.factsRevision!==factsRow.revision||saved.choice.evidenceKey!==facts.evidenceKey||!!book&&(!supported||saved.bookRevision!==bookRow?.revision||saved.choice.bookKey!==canonical(book));
      if(bookIds&&(!book||stale||!bookIds.includes(book.id))) return [];
      return [{id,candidateId:f.candidateId,facts,choice:saved?.choice??null,staleChoice:stale}];
    });
    this.allowed(false,scope.scopeId);
    return cloneProof({generation:graph.generation,rows,knownMinutes:rows.reduce((sum,r)=>sum+(r.facts.assessment.durations.flight.minutes??0),0),unknownMinutes:rows.filter(r=>r.facts.assessment.durations.flight.minutes===null).length,
      retainedPendingObservations:graph.records.filter(r=>r.kind==='pending'&&JSON.parse(r.payload).scope.scopeId===scope.scopeId).length});
  }
  async commit(input: ProofCommand): Promise<ProofResult> {
    this.allowed(true,input.kind === 'import' ? input.capture?.scope.scopeId : undefined);
    await this.gate(true);
    requireProof(input.ownerId === this.manifest.owner_id && input.storeId === this.manifest.store_id, 'Foreign proof command');
    if (input.kind === 'catalogue') { const p = this.allowed(true); requireProof(input.scopes.every(s => p.scopeIds.includes(s.scope.scopeId)), 'Unregistered scope permission'); }
    const request = boundedJson(input,COMMAND_LIMIT), command: ProofCommand = JSON.parse(request);
    let completed = false, committed = false, result!: ProofResult;
    try {
      await this.fault('before-transaction');
      await this.db.transaction(async tx => {
        this.allowed(true,command.kind === 'import' ? command.capture.scope.scopeId : undefined);
        await checkSchema(tx); const graph = await authorizedGraph(tx,this.allowed(true)); await validateProofGraph(graph,this.hash);
        requireProof(canonical(graph.manifest) === canonical(this.manifest), 'Proof manifest changed');
        const old = graph.receipts.find(r => r.command_id === command.commandId);
        if (old) { requireProof(old.request_json === request, 'Idempotency ID reused with different input'); result = JSON.parse(old.result_json) as ProofResult; completed = true; return; }
        const next = await deriveCommand(graph,command,this.hash); result = next.result;
        await this.fault('before-receipt');
        const r = next.receipt;
        await tx.run('INSERT INTO history_receipts VALUES (?,?,?,?,?,?,?,?,?)',r.command_id,r.owner_id,r.kind,r.base_generation,r.generation,r.request_json,r.request_sha256,r.result_json,r.committed_at);
        await this.fault('after-receipt');
        for (const row of next.records) {
          await tx.run('INSERT INTO history_records VALUES (?,?,?,?,?,?,?,?)',row.seq,row.owner_id,row.kind,row.id,row.revision,row.generation,row.payload,row.payload_sha256);
          await this.fault('after-'+row.kind);
        }
        await validateProofGraph(await graphFrom(tx),this.hash); this.allowed(true);
        await this.fault('before-commit'); await this.gate(true); await authorizedGraph(tx,this.allowed(true)); completed = true;
      });
      committed = true;
      await this.fault('after-commit'); await this.fault('before-readback');
      const graph = await this.snapshot(); const receipt = graph.receipts.find(r => r.command_id === command.commandId);
      requireProof(receipt?.request_json === request && receipt.result_json === canonical(result), 'Receipt readback failed');
      this.allowed(); return cloneProof(result);
    } catch (error) {
      if (committed || completed) throw new IndeterminateProofCommit(command.commandId,{cause:error});
      throw error;
    }
  }
  async backup(): Promise<string> {
    const graph = await this.snapshot(); const payload = boundedJson({version:1,...graph},BACKUP_LIMIT);
    const text = boundedJson({format:'moflight-history-proof-backup-v1',payload,checksum:await this.hash(payload)},BACKUP_LIMIT);
    await HistoryProofStore.validateBackup(text,this.manifest.owner_id,this.manifest.store_id,this.hash);
    this.allowed(); return text;
  }
  static async validateBackup(text: string, ownerId: string, storeId: string, hash: Hash): Promise<ProofGraph> {
    requireProof(typeof text === 'string' && utf8Size(text) <= BACKUP_LIMIT, 'Backup size limit');
    const e = JSON.parse(text) as {format:string;payload:string;checksum:string}; exactKeys(e,['format','payload','checksum']);
    requireProof(e.format === 'moflight-history-proof-backup-v1' && typeof e.payload === 'string' && /^[0-9a-f]{64}$/.test(e.checksum) && await hash(e.payload) === e.checksum, 'Invalid proof backup');
    const body = JSON.parse(e.payload) as ProofGraph & {version:number}; exactKeys(body,['version','manifest','generation','receipts','records']);
    requireProof(body.version === 1 && body.manifest.owner_id === ownerId && body.manifest.store_id === storeId, 'Foreign or unsupported backup');
    const {version: _version,...graph} = body; await validateProofGraph(graph,hash); return graph;
  }
  static async restore(db: Driver, text: string, ownerId: string, storeId: string, hash: Hash, authorize: ProofAuthorization, fault: ProofFault = async () => {}) {
    const permit=this.permit(authorize,ownerId,storeId,true); const graph = await this.validateBackup(text,ownerId,storeId,hash);
    requireProof(this.permit(authorize,ownerId,storeId,true).leaseId===permit.leaseId,'Expired proof restore');
    requireProof(graph.records.filter(r=>r.kind==='scope').every(r=>permit.scopeIds.includes(r.id)),'Unauthorized restored scope');
    const store = await this.create(db,graph.manifest,hash,authorize,fault);
    try {
      await db.transaction(async tx => {
        for (const r of graph.receipts) { await tx.run('INSERT INTO history_receipts VALUES (?,?,?,?,?,?,?,?,?)',r.command_id,r.owner_id,r.kind,r.base_generation,r.generation,r.request_json,r.request_sha256,r.result_json,r.committed_at); await fault('restore-receipt'); }
        for (const r of graph.records) { await tx.run('INSERT INTO history_records VALUES (?,?,?,?,?,?,?,?)',r.seq,r.owner_id,r.kind,r.id,r.revision,r.generation,r.payload,r.payload_sha256); await fault('restore-record'); }
        await validateProofGraph(await graphFrom(tx),hash); store.allowed(true); await fault('restore-before-commit');
      });
      await store.snapshot(); return store;
    } catch (e) { await store.close(); throw e; }
  }
}

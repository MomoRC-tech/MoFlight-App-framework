// Proof-only staged selection. Candidate opening/path ownership is supplied by
// the host harness; no existing app journal or native path is connected.
import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver, Hash } from '../../../../packages/local-data/src/index';
import { cloneProof, proofText, proofTime, requireProof, type ProofGraph } from './history-proof-model';
import { HistoryProofStore, type ProofAuthorization, type ProofFault, type ProofAccessGate } from './history-proof-store';
export const PROOF_CANDIDATE = /^history-proof-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.sqlite$/;
const TABLE = 'CREATE TABLE history_selection(seq INTEGER PRIMARY KEY AUTOINCREMENT,owner_id TEXT NOT NULL,store_id TEXT NOT NULL,candidate_name TEXT NOT NULL,manifest_sha256 TEXT NOT NULL,validated_generation INTEGER NOT NULL CHECK(validated_generation>=0),activation_id TEXT NOT NULL UNIQUE,previous_seq INTEGER REFERENCES history_selection(seq),activated_at TEXT NOT NULL)';
const triggers = ['UPDATE','DELETE'].map(op => `CREATE TRIGGER history_selection_no_${op.toLowerCase()} BEFORE ${op} ON history_selection BEGIN SELECT RAISE(ABORT,'Append-only proof selection'); END`);
export const HISTORY_PROOF_SELECTION_SCHEMA = [TABLE,...triggers,'PRAGMA user_version=1'].join(';')+';';
interface SelectionRow { seq:number; owner_id:string; store_id:string; candidate_name:string; manifest_sha256:string; validated_generation:number; activation_id:string; previous_seq:number|null; activated_at:string }
export class IndeterminateProofActivation extends Error { constructor(readonly activationId:string, options?:ErrorOptions) {super('Proof activation requires journal recovery',options);} }
export interface ProofSelection { store:HistoryProofStore; name:string; seq:number; warning:string|null; recoveryRequired:boolean }
export type CandidateOpener = (name:string, authorize:ProofAuthorization, gate?:ProofAccessGate) => Promise<HistoryProofStore>;
const normalize = (s:string) => s.trim().replace(/;$/,'').replace(/\s+/g,' ');

export class HistoryProofSelection {
  private closed=false;
  private constructor(private readonly db:Driver, private readonly ownerId:string, private readonly storeId:string, private readonly leaseId:string,
    private readonly authorize:ProofAuthorization, private readonly openCandidate:CandidateOpener, private readonly hash:Hash, private readonly fault:ProofFault) {}
  private allowed(write=false) { requireProof(!this.closed,'Closed proof selection'); const p=HistoryProofStore.permit(this.authorize,this.ownerId,this.storeId,write); requireProof(p.leaseId===this.leaseId,'Expired proof selection lease'); return p; }
  static async open(db:Driver, ownerId:string, storeId:string, authorize:ProofAuthorization, openCandidate:CandidateOpener, hash:Hash, create=false, fault:ProofFault=async()=>{}) {
    const p=HistoryProofStore.permit(authorize,ownerId,storeId,create);
    await db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    requireProof((await db.first<{foreign_keys:number}>('PRAGMA foreign_keys'))?.foreign_keys===1 && (await db.first<{synchronous:number}>('PRAGMA synchronous'))?.synchronous===2,'Unsafe selection connection');
    const version=(await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version;
    if(create) { requireProof(version===0 && !(await db.first('SELECT name FROM sqlite_master')),'Existing journal preserved'); await db.transaction(tx=>tx.exec(HISTORY_PROOF_SELECTION_SCHEMA)); }
    requireProof((await db.first<{user_version:number}>('PRAGMA user_version'))?.user_version===1,'Unsupported proof selection version');
    const objects=await db.all<{sql:string}>("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name");
    requireProof(canonical(objects.map(r=>normalize(r.sql)).sort())===canonical([TABLE,...triggers].map(normalize).sort()),'Unsupported proof journal shape');
    const selection=new HistoryProofSelection(db,ownerId,storeId,p.leaseId,authorize,openCandidate,hash,fault); selection.allowed(); return selection;
  }
  async close() { if(!this.closed) {this.closed=true;await this.db.close();} }
  private async rows(tx:Connection=this.db) { this.allowed(); return tx.all<SelectionRow>('SELECT * FROM history_selection WHERE owner_id=? AND store_id=? ORDER BY seq DESC',this.ownerId,this.storeId); }
  private valid(row:SelectionRow, rows:SelectionRow[]) {
    requireProof(Number.isSafeInteger(row.seq)&&row.seq>0&&row.owner_id===this.ownerId&&row.store_id===this.storeId&&PROOF_CANDIDATE.test(row.candidate_name)&&/^[0-9a-f]{64}$/.test(row.manifest_sha256)&&Number.isSafeInteger(row.validated_generation)&&row.validated_generation>=0,'Invalid proof selection row');
    proofText(row.activation_id); proofTime(row.activated_at);
    requireProof(row.previous_seq===null || Number.isSafeInteger(row.previous_seq)&&row.previous_seq<row.seq&&rows.some(r=>r.seq===row.previous_seq),'Invalid proof selection predecessor');
  }
  private async readable(row:SelectionRow, rows:SelectionRow[], authorize:ProofAuthorization=this.authorize, gate?:ProofAccessGate) {
    this.valid(row,rows); this.allowed(); const store=await this.openCandidate(row.candidate_name,authorize,gate);
    try {
      const graph=await store.snapshot(); requireProof(await this.hash(canonical(graph.manifest))===row.manifest_sha256&&graph.generation>=row.validated_generation,'Invalid selected proof manifest/generation');
      for(const scope of graph.records.filter(r=>r.kind==='scope')) await store.workspace(JSON.parse(scope.payload).scope);
      this.allowed(); return {store,graph};
    } catch(error) { await store.close(); throw error; }
  }
  async activate(activationId:string,name:string,previousSeq:number|null,at:string):Promise<number> {
    this.allowed(true); proofText(activationId); proofTime(at); requireProof(PROOF_CANDIDATE.test(name),'Invalid proof candidate path');
    const before=await this.rows(), old=before.find(r=>r.activation_id===activationId);
    if(old) { requireProof(old.candidate_name===name&&old.previous_seq===previousSeq&&old.activated_at===at,'Activation ID reused'); const staged=await this.readable(old,before); await staged.store.close(); this.allowed(); return old.seq; }
    // Validate intended readers, then close. Every subsequent opening revalidates.
    await this.fault('before-candidate-open'); const candidate=await this.openCandidate(name,this.authorize);
    let graph:ProofGraph;
    try { graph=await candidate.snapshot(); for(const r of graph.records.filter(r=>r.kind==='scope')) await candidate.workspace(JSON.parse(r.payload).scope); await this.fault('after-candidate-read'); }
    finally { await candidate.close(); }
    const manifestHash=await this.hash(canonical(graph.manifest)); let completed=false,seq=0;
    try {
      await this.db.transaction(async tx=>{
        this.allowed(true); const rows=await this.rows(tx); requireProof((rows[0]?.seq??null)===previousSeq,'Stale activation predecessor');
        await this.fault('before-selection-write');
        await tx.run('INSERT INTO history_selection(owner_id,store_id,candidate_name,manifest_sha256,validated_generation,activation_id,previous_seq,activated_at) VALUES (?,?,?,?,?,?,?,?)',this.ownerId,this.storeId,name,manifestHash,graph.generation,activationId,previousSeq,at);
        seq=(await tx.first<{seq:number}>('SELECT seq FROM history_selection WHERE activation_id=?',activationId))!.seq;
        await this.fault('after-selection-write'); this.allowed(true); completed=true;
      });
      await this.fault('after-selection-commit'); this.allowed(); return seq;
    } catch(error) { if(completed) throw new IndeterminateProofActivation(activationId,{cause:error}); throw error; }
  }
  async select():Promise<ProofSelection> {
    this.allowed(); const rows=await this.rows(); requireProof(rows.length,'No active proof history; recovery required');
    let selected:{store:HistoryProofStore;graph:ProofGraph;row:SelectionRow}|undefined;
    const graphs=new Map<string,ProofGraph>(), unreadable=new Set<string>();
    for(const row of rows) {
      if(graphs.has(row.candidate_name)||unreadable.has(row.candidate_name)) continue;
      try { const opened=await this.readable(row,rows); graphs.set(row.candidate_name,opened.graph); if(!selected) selected={...opened,row}; else await opened.store.close(); }
      catch { this.allowed(); unreadable.add(row.candidate_name); }
    }
    requireProof(selected,'No readable proof history; recovery required'); await selected.store.close();
    const chosen=selected.graph;
    // Every retained branch must be a receipt prefix of the chosen branch.
    // Unknown/unreadable branches cannot be declared safe to replay.
    const recoveryRequired=unreadable.size>0||[...graphs.values()].some(g=>g.generation>chosen.generation||g.receipts.some((r,i)=>canonical(r)!==canonical(chosen.receipts[i])));
    const fallback=selected.row.seq!==rows[0]!.seq;
    const guarded:ProofAuthorization=()=>{const p=this.allowed(); return {...p,writable:p.writable&&!recoveryRequired};};
    const selectedSeq=rows[0]!.seq;
    const gate:ProofAccessGate=async write=>{this.allowed(write);requireProof((await this.rows())[0]?.seq===selectedSeq,'Selected history changed; reopen required');requireProof(!write||!recoveryRequired,'Read-only recovery history');};
    const reopened=await this.readable(selected.row,rows,guarded,gate);
    this.allowed(); return {store:reopened.store,name:selected.row.candidate_name,seq:selected.row.seq,warning:fallback||recoveryRequired?'Proof history recovery required; retained candidates preserved':null,recoveryRequired};
  }
  // Rollback uses activate with a new ID and the current predecessor; candidate
  // comparison in select keeps older/divergent history read-only.
}

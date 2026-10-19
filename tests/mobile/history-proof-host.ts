// Node filesystem adapter confined to newly-created temporary proof directories.
// This file is test infrastructure, not an application/native factory.
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, open, lstat, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { HistoryProofStore, type ProofAuthorization, type ProofFault, type ProofPermit, type ProofAccessGate } from '../../apps/platform-lab/src/vereinsflieger/history-proof-store.ts';
import { HistoryProofSelection, PROOF_CANDIDATE } from '../../apps/platform-lab/src/vereinsflieger/history-proof-selection.ts';
import { proofText, requireProof, type CatalogueCommand, type ImportCommand, type ProofManifest } from '../../apps/platform-lab/src/vereinsflieger/history-proof-model.ts';
import { adaptHistoryFacts, type HistoryScope } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import { confirmHistoryChoice, planHistoryReview, type HistoryBook, type HistoryCapture, type HistoryPlanFixture } from '../../apps/platform-lab/src/vereinsflieger/history-plan.ts';
export const proofHash = async (text:string) => createHash('sha256').update(text).digest('hex');
export const proofAt = '2026-10-19T10:00:00.000Z';
export const proofScope = {ownerId:'fixture-owner-a',scopeId:'fixture-scope-a'};
export const proofBook:HistoryBook = {ownerId:proofScope.ownerId,id:'fixture-book-a',formatId:'fixture-gliding',formatVersion:'1',classes:['glider'],from:'2026-01-01',through:null};
export function proofCapture(id='fixture-capture-a', cells:Record<string,string>={}, scope=proofScope):HistoryCapture {
  const fields={Datum:'10.10.2026','Lfz.':'D-TEST',Flugzeit:'12',Pilot:'Example, Student',PIC:'Example, Instructor',Start:'23:55',Landung:'00:10',...cells};
  return {scope:{...scope},observation:{captureId:id,headers:Object.keys(fields),rows:[{sourceFlightId:'101',values:Object.values(fields)}]},retrievedAt:proofAt,coverage:{from:'2026-10-01',through:'2026-10-19',state:'complete'}};
}
export class ProofHost {
  current:ProofPermit|null;
  readonly authorize:ProofAuthorization=()=>this.current;
  readonly registry=new Map<string,{owner:string;store:string}>();
  private stores=new Set<HistoryProofStore>();
  private journals=new Set<HistoryProofSelection>();
  private constructor(readonly root:string) { this.current={mode:'synthetic-only',ownerId:proofScope.ownerId,storeId:'fixture-store-a',leaseId:randomUUID(),scopeIds:[proofScope.scopeId],writable:true}; }
  static async create() { return new ProofHost(await mkdtemp(join(tmpdir(),'moflight-history-proof-'))); }
  manifest():ProofManifest { const p=this.current!; return {singleton:1,family:'moflight-history-proof',schema_version:1,payload_version:1,mode:'synthetic-only',store_id:p.storeId,owner_id:p.ownerId,created_at:proofAt}; }
  path(name:string) { requireProof(PROOF_CANDIDATE.test(name)||name==='history-proof-selection.sqlite','Invalid host proof basename'); const p=resolve(this.root,name); requireProof(relative(this.root,p)===name,'Escaping proof path'); return p; }
  async candidate(fault?:ProofFault,backup?:string) {
    const m=this.manifest(); HistoryProofStore.permit(this.authorize,m.owner_id,m.store_id,true);
    const name=`history-proof-${randomUUID()}.sqlite`, path=this.path(name);
    const file=await open(path,'wx'); await file.close(); this.registry.set(name,{owner:m.owner_id,store:m.store_id});
    const db=nodeDriver(path);
    try {
      const store=backup===undefined?await HistoryProofStore.create(db,m,proofHash,this.authorize,fault):await HistoryProofStore.restore(db,backup,m.owner_id,m.store_id,proofHash,this.authorize,fault);
      this.stores.add(store); return {name,store};
    } catch(error) { await db.close().catch(()=>{}); throw error; }
  }
  async openCandidate(name:string,authorize:ProofAuthorization=this.authorize,fault?:ProofFault,gate?:ProofAccessGate) {
    const p=this.current!; HistoryProofStore.permit(authorize,p.ownerId,p.storeId);
    const registered=this.registry.get(name); requireProof(registered?.owner===p.ownerId&&registered.store===p.storeId,'Unregistered/foreign proof file');
    const path=this.path(name), stat=await lstat(path); requireProof(stat.isFile()&&!stat.isSymbolicLink()&&await realpath(path)===path,'Unsafe/missing proof file');
    const db=nodeDriver(path);
    try { const store=await HistoryProofStore.open(db,p.ownerId,p.storeId,proofHash,authorize,fault,gate); this.stores.add(store); return store; }
    catch(error) { await db.close(); throw error; }
  }
  async journal(create=true,fault?:ProofFault) {
    const p=this.current!; HistoryProofStore.permit(this.authorize,p.ownerId,p.storeId,create);
    const path=this.path('history-proof-selection.sqlite');
    if(create) { const f=await open(path,'wx'); await f.close(); } else { const stat=await lstat(path); requireProof(stat.isFile()&&!stat.isSymbolicLink(),'Missing journal'); }
    const db=nodeDriver(path);
    try { const journal=await HistoryProofSelection.open(db,p.ownerId,p.storeId,this.authorize,(name,auth,gate)=>this.openCandidate(name,auth,undefined,gate),proofHash,create,fault); this.journals.add(journal); return journal; }
    catch(error) { await db.close(); throw error; }
  }
  async cleanup() {
    for(const store of this.stores) await store.close().catch(()=>{});
    for(const journal of this.journals) await journal.close().catch(()=>{});
    const root=await realpath(this.root); requireProof(root===resolve(this.root)&&root.startsWith(resolve(tmpdir()))&&root.includes('moflight-history-proof-'),'Unsafe proof cleanup target');
    await rm(root,{recursive:true});
  }
}
export async function catalogue(store:HistoryProofStore,commandId='fixture-catalogue',scopes=[proofScope],books=[proofBook]):Promise<CatalogueCommand> {
  return {version:1,mode:'synthetic-only',kind:'catalogue',ownerId:store.manifest.owner_id,storeId:store.manifest.store_id,commandId,baseGeneration:(await store.snapshot()).generation,at:proofAt,
    scopes:scopes.map(scope=>({scope,provider:'fixture-vereinsflieger',accountRef:'fixture-account',clubRef:'fixture-club',identity:'fixture-established'})),books};
}
export async function importCommand(store:HistoryProofStore,capture=proofCapture(),bookId:string|null='fixture-book-a',commandId='fixture-import',classification=true):Promise<ImportCommand> {
  let workspace=await store.workspace(capture.scope);
  const fixture:HistoryPlanFixture={mode:'synthetic-only',scope:capture.scope,identity:'fixture-established',formats:[{id:'fixture-gliding',version:'1'}],aircraft:[]};
  if(classification) {
    const all=[...workspace.previous,...capture.observation.rows.map((_,i)=>adaptHistoryFacts(capture.scope,capture.observation,i))];
    const unique=new Map(all.filter(f=>f.candidateId).map(f=>[f.candidateId!,f]));
    fixture.aircraft=[...unique.values()].map(f=>({flightId:f.candidateId!,evidenceKey:f.evidenceKey,aircraftRef:'fixture-aircraft',aircraftClass:'glider',duplicate:'countable'}));
  }
  for(const row of planHistoryReview(workspace,capture,fixture).rows) if(!row.blockers.length) workspace=confirmHistoryChoice(workspace,capture,fixture,planHistoryReview(workspace,capture,fixture).fingerprint,row.id,bookId);
  const plan=planHistoryReview(workspace,capture,fixture);
  return {version:1,mode:'synthetic-only',kind:'import',ownerId:store.manifest.owner_id,storeId:store.manifest.store_id,commandId,baseGeneration:workspace.generation,at:proofAt,capture,original:JSON.stringify(capture.observation,null,2),coverageEvidence:{mode:'synthetic-only',pageCount:1,rowCount:capture.observation.rows.length,complete:true},workspace,fixture,planToken:plan.fingerprint};
}

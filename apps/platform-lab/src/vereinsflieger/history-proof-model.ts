// Unconnected synthetic host proof. Replaying validated commands defines the ledger;
// caller JSON never becomes trusted facts, ownership or SQL.
import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '../../../../packages/local-data/src/index';
import { adaptHistoryFacts, historyCandidateId, validateHistoryScope, type HistoryFacts, type HistoryScope } from './history-facts';
import { planHistoryReview, type HistoryBook, type HistoryCapture, type HistoryChoice, type HistoryPlanFixture, type HistoryWorkspace } from './history-plan';

export const COMMAND_LIMIT = 64 * 1024 * 1024;
export const BACKUP_LIMIT = 128 * 1024 * 1024;
export const cloneProof = <T,>(value: T): T => JSON.parse(canonical(value)) as T;
export function requireProof(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
export function proofText(value: unknown): asserts value is string { requireProof(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value), 'Invalid proof identifier'); }
export function proofTime(value: unknown): asserts value is string {
  requireProof(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value, 'Invalid proof timestamp');
}
export const utf8Size = (value: string) => new TextEncoder().encode(value).length;
export function boundedJson(value: unknown, limit: number): string { const text = canonical(value); requireProof(utf8Size(text) <= limit, 'Proof size limit'); return text; }
export function exactKeys(value: unknown, keys: string[]): void {
  requireProof(value !== null && typeof value === 'object' && !Array.isArray(value) && canonical(Object.keys(value).sort()) === canonical([...keys].sort()), 'Unsupported proof fields');
}
export interface ProofManifest { singleton: 1; family: 'moflight-history-proof'; schema_version: 1; payload_version: 1; mode: 'synthetic-only'; store_id: string; owner_id: string; created_at: string }
export function validateManifest(m: ProofManifest) {
  exactKeys(m, ['singleton','family','schema_version','payload_version','mode','store_id','owner_id','created_at']);
  requireProof(m.singleton === 1 && m.family === 'moflight-history-proof' && m.schema_version === 1 && m.payload_version === 1 && m.mode === 'synthetic-only', 'Unsupported history proof');
  proofText(m.owner_id); proofText(m.store_id); proofTime(m.created_at);
}
export interface ProofScope { scope: HistoryScope; provider: 'fixture-vereinsflieger'; accountRef: string; clubRef: string; identity: 'fixture-established' }
interface CommandBase { version: 1; mode: 'synthetic-only'; ownerId: string; storeId: string; commandId: string; baseGeneration: number; at: string }
export interface CatalogueCommand extends CommandBase { kind: 'catalogue'; scopes: ProofScope[]; books: HistoryBook[] }
export interface ProofCoverageEvidence { mode:'synthetic-only'; pageCount:number; rowCount:number; complete:boolean }
export interface ImportCommand extends CommandBase { kind: 'import'; capture: HistoryCapture; original: string; coverageEvidence:ProofCoverageEvidence; workspace: HistoryWorkspace; fixture: HistoryPlanFixture; planToken: string }
export type ProofCommand = CatalogueCommand | ImportCommand;
export type ProofKind = 'scope' | 'capture' | 'flight' | 'facts' | 'book' | 'choice' | 'coverage' | 'pending';
export interface ProofRecord { seq: number; owner_id: string; kind: ProofKind; id: string; revision: number; generation: number; payload: string; payload_sha256: string }
export interface ProofReceipt { command_id: string; owner_id: string; kind: ProofCommand['kind']; base_generation: number; generation: number; request_json: string; request_sha256: string; result_json: string; committed_at: string }
export interface ProofGraph { manifest: ProofManifest; generation: number; receipts: ProofReceipt[]; records: ProofRecord[] }
export interface StoredFacts { facts: HistoryFacts; predecessor: number | null; reason: 'source-change' | 'reinterpretation'; captureId: string; rowIndex: number }
export interface StoredChoice { choice: HistoryChoice; factsRevision: number; bookRevision: number | null; predecessor: number | null; confirmedAt: string; fixture: HistoryPlanFixture }
export interface StoredFlight { scope: HistoryScope; reference: string; candidateId: string }
export interface ImportedCapture { capture: HistoryCapture; original: string; originalSha256: string; coverageEvidence:ProofCoverageEvidence; format: 'fixture-observation-v1' }
export interface ProofResult { commandId: string; generation: number; captureId: string | null; planSha256: string | null; mutations: {kind: ProofKind; id: string; revision: number; seq: number; hash: string}[]; counts: {promoted: number; deferred: number; pending: number; unchanged: number}; retainedIds: string[] }

export function latestRecord(records: ProofRecord[], kind: ProofKind, id: string): ProofRecord | undefined {
  for (let i=records.length-1;i>=0;i--) if (records[i]!.kind===kind && records[i]!.id===id) return records[i];
  return undefined;
}
export function latestValues<T>(records: ProofRecord[], kind: ProofKind): T[] {
  const byId = new Map<string, T>(); for (const r of records) if (r.kind === kind) byId.set(r.id, JSON.parse(r.payload) as T); return [...byId.values()];
}
export function proofWorkspace(graph: ProofGraph, scope: HistoryScope): HistoryWorkspace {
  validateHistoryScope(scope); requireProof(scope.ownerId === graph.manifest.owner_id && !!latestRecord(graph.records, 'scope', scope.scopeId), 'Unknown proof scope');
  const ids = new Set(latestValues<StoredFlight>(graph.records,'flight').filter(f => canonical(f.scope) === canonical(scope)).map(f => f.candidateId));
  return cloneProof({ scope, generation: graph.generation, books: latestValues<HistoryBook>(graph.records,'book'),
    previous: latestValues<StoredFacts>(graph.records,'facts').map(v => v.facts).filter(f => ids.has(f.candidateId!)),
    choices: latestValues<StoredChoice>(graph.records,'choice').map(v => v.choice).filter(c => ids.has(c.flightId)) });
}

// Deterministic generation, also used independently during full backup/reopen validation.
// Every persisted field must match the reconstruction; this includes relationships,
// counts, scoped uniqueness, raw bytes, prior decisions and receipt mutation lists.
export async function deriveCommand(graph: ProofGraph, input: ProofCommand, hash: Hash): Promise<{records: ProofRecord[]; receipt: ProofReceipt; result: ProofResult}> {
  const request = boundedJson(input, COMMAND_LIMIT), c: ProofCommand = JSON.parse(request);
  const common = ['version','mode','ownerId','storeId','commandId','baseGeneration','at','kind'];
  exactKeys(c, [...common, ...(c.kind === 'catalogue' ? ['scopes','books'] : ['capture','original','coverageEvidence','workspace','fixture','planToken'])]);
  requireProof(c.version === 1 && c.mode === 'synthetic-only' && c.ownerId === graph.manifest.owner_id && c.storeId === graph.manifest.store_id, 'Foreign or unsupported proof command');
  proofText(c.commandId); proofTime(c.at);
  requireProof(Number.isSafeInteger(c.baseGeneration) && c.baseGeneration === graph.generation, 'Stale proof generation');
  const generation = graph.generation + 1; requireProof(Number.isSafeInteger(generation), 'Generation overflow');
  const records: ProofRecord[] = [], all = [...graph.records];
  const result: ProofResult = { commandId: c.commandId, generation, captureId: null, planSha256: null, mutations: [], counts: {promoted:0,deferred:0,pending:0,unchanged:0}, retainedIds: [] };
  async function append(kind: ProofKind, id: string, value: unknown, immutable = false) {
    const payload = canonical(value), previous = latestRecord(all,kind,id);
    if (previous?.payload === payload) return previous;
    requireProof(!immutable || !previous, 'Immutable proof evidence changed');
    const row: ProofRecord = { seq: (all.at(-1)?.seq ?? 0)+1, owner_id: c.ownerId, kind, id, revision: (previous?.revision ?? 0)+1, generation, payload, payload_sha256: await hash(payload) };
    requireProof(/^[0-9a-f]{64}$/.test(row.payload_sha256), 'Invalid hash implementation');
    all.push(row); records.push(row); result.mutations.push({kind,id,revision:row.revision,seq:row.seq,hash:row.payload_sha256}); return row;
  }
  if (c.kind === 'catalogue') {
    requireProof(Array.isArray(c.scopes) && c.scopes.length <= 1000 && Array.isArray(c.books) && c.books.length <= 1000, 'Catalogue limit');
    const scopeIds = new Set<string>(), bookIds = new Set<string>();
    for (const s of c.scopes) {
      exactKeys(s,['scope','provider','accountRef','clubRef','identity']); exactKeys(s.scope,['ownerId','scopeId']); validateHistoryScope(s.scope);
      requireProof(s.scope.ownerId === c.ownerId && s.provider === 'fixture-vereinsflieger' && s.identity === 'fixture-established' && !scopeIds.has(s.scope.scopeId), 'Invalid proof scope');
      proofText(s.accountRef); proofText(s.clubRef); scopeIds.add(s.scope.scopeId); await append('scope',s.scope.scopeId,s,true);
    }
    for (const b of c.books) {
      exactKeys(b,['ownerId','id','formatId','formatVersion','classes','from','through']); proofText(b.id); proofText(b.formatId); proofText(b.formatVersion);
      requireProof(b.ownerId === c.ownerId && !bookIds.has(b.id), 'Foreign or duplicate book'); bookIds.add(b.id);
      const scope = latestValues<ProofScope>(all,'scope')[0]?.scope; requireProof(scope, 'Register a fixture scope first');
      // Reuse the planner's strict book/date/class checks even for unsupported formats.
      planHistoryReview({scope,generation,previous:[],choices:[],books:[b]}, {scope,observation:{captureId:'catalogue-check',headers:['Datum'],rows:[]},retrievedAt:c.at,coverage:{from:b.from,through:b.from,state:'complete'}}, {mode:'synthetic-only',scope,identity:'fixture-established',formats:[],aircraft:[]});
      await append('book',b.id,b);
    }
    requireProof(latestValues(all,'scope').length <= 1000 && latestValues(all,'book').length <= 1000, 'Catalogue aggregate limit');
  } else {
    requireProof(c.kind === 'import', 'Unsupported proof command kind');
    const scope = c.capture?.scope; validateHistoryScope(scope);
    requireProof(scope.ownerId === c.ownerId && latestRecord(all,'scope',scope.scopeId), 'Foreign capture scope');
    requireProof(typeof c.original === 'string' && canonical(JSON.parse(c.original)) === canonical(c.capture.observation), 'Original capture differs');
    exactKeys(c.coverageEvidence,['mode','pageCount','rowCount','complete']);
    requireProof(c.coverageEvidence.mode==='synthetic-only'&&c.coverageEvidence.complete===true&&Number.isSafeInteger(c.coverageEvidence.pageCount)&&c.coverageEvidence.pageCount>0&&c.coverageEvidence.pageCount<=5000&&c.coverageEvidence.rowCount===c.capture.observation.rows.length,'Incomplete fixture page/count evidence');
    exactKeys(c.capture,['scope','observation','retrievedAt','coverage']); exactKeys(c.workspace,['scope','generation','previous','books','choices']);
    exactKeys(scope,['ownerId','scopeId']); exactKeys(c.capture.observation,['captureId','headers','rows']); exactKeys(c.capture.coverage,['from','through','state']);
    for (const row of c.capture.observation.rows) exactKeys(row,['sourceFlightId','values']);
    exactKeys(c.fixture,['mode','scope','identity','formats','aircraft']); exactKeys(c.fixture.scope,['ownerId','scopeId']);
    for (const f of c.fixture.formats) exactKeys(f,['id','version']);
    for (const a of c.fixture.aircraft) exactKeys(a,['flightId','evidenceKey','aircraftRef','aircraftClass','duplicate']);
    for (const choice of c.workspace.choices) { exactKeys(choice,['scope','flightId','evidenceKey','bookId','bookKey']); exactKeys(choice.scope,['ownerId','scopeId']); }
    const current = proofWorkspace(graph,scope);
    requireProof(canonical({...c.workspace,choices:[]}) === canonical({...current,choices:[]}), 'Forged or stale workspace');
    const plan = planHistoryReview(c.workspace,c.capture,c.fixture);
    requireProof(c.planToken === plan.fingerprint && !plan.blockers.length && plan.counts['needs-book-choice'] === 0, 'Plan needs review or source validation');
    const observed = new Set(plan.rows.filter(r => !r.blockers.length).map(r => r.id));
    for (const old of current.choices) if (!observed.has(old.flightId)) requireProof(canonical(c.workspace.choices.find(v => v.flightId === old.flightId)) === canonical(old), 'Unobserved choice changed');
    for (const choice of c.workspace.choices) if (!observed.has(choice.flightId)) requireProof(current.choices.some(v => canonical(v) === canonical(choice)), 'Unobserved choice injected');
    const imported: ImportedCapture = {capture:c.capture,original:c.original,originalSha256:await hash(c.original),coverageEvidence:c.coverageEvidence,format:'fixture-observation-v1'};
    await append('capture',c.capture.observation.captureId,imported,true);
    result.captureId = c.capture.observation.captureId; result.planSha256 = await hash(c.planToken); result.retainedIds = plan.retainedIds;
    const pending = plan.rows.filter(r => r.blockers.length).map(r => ({id:r.id,blockers:r.blockers,variants:r.variants}));
    if (pending.length) await append('pending',result.captureId,{scope,captureId:result.captureId,rows:pending},true);
    result.counts.pending = pending.length;
    for (const row of plan.rows) {
      if (row.blockers.length) continue;
      const facts = row.variants[0]!, reference = facts.assessment.observation.row.sourceFlightId!;
      requireProof(facts.candidateId === historyCandidateId(scope,reference), 'Invalid source tuple');
      // An opaque stable ID distinct from the planner's comparison key.
      const id = await hash(canonical([c.ownerId,scope.scopeId,reference]));
      await append('flight',id,{scope,reference,candidateId:facts.candidateId} satisfies StoredFlight,true);
      let f = latestRecord(all,'facts',id);
      const previous: StoredFacts | null = f ? JSON.parse(f.payload) as StoredFacts : null;
      if (!previous || previous.facts.evidenceKey !== facts.evidenceKey || previous.facts.mapping !== facts.mapping) {
        f = await append('facts',id,{facts,predecessor:f?.revision ?? null,reason:previous && previous.facts.evidenceKey === facts.evidenceKey ? 'reinterpretation' : 'source-change',captureId:result.captureId,rowIndex:facts.assessment.observation.rowIndex} satisfies StoredFacts);
        result.counts.promoted++;
      } else result.counts.unchanged++;
      const choice = row.choice!; requireProof(choice, 'Explicit choice required');
      const old = latestRecord(all,'choice',id), oldChoice: StoredChoice | null = old ? JSON.parse(old.payload) as StoredChoice : null;
      const bookRevision = choice.bookId === null ? null : latestRecord(all,'book',choice.bookId)!.revision;
      if (!oldChoice || canonical(oldChoice.choice) !== canonical(choice) || oldChoice.factsRevision !== f!.revision || oldChoice.bookRevision !== bookRevision) {
        await append('choice',id,{choice,factsRevision:f!.revision,bookRevision,predecessor:old?.revision ?? null,confirmedAt:c.at,fixture:c.fixture} satisfies StoredChoice);
      }
      if (choice.bookId === null) result.counts.deferred++;
    }
    // A new capture records a new checked window; an exact same-capture command
    // can still have a receipt without manufacturing another coverage revision.
    await append('coverage',scope.scopeId,{scope,captureId:result.captureId,coverage:c.capture.coverage,retrievedAt:c.capture.retrievedAt});
  }
  const receipt: ProofReceipt = {command_id:c.commandId,owner_id:c.ownerId,kind:c.kind,base_generation:c.baseGeneration,generation,request_json:request,request_sha256:await hash(request),result_json:canonical(result),committed_at:c.at};
  return {records,receipt,result};
}

export async function validateProofGraph(graph: ProofGraph, hash: Hash): Promise<void> {
  exactKeys(graph,['manifest','generation','receipts','records']); validateManifest(graph.manifest);
  requireProof(Array.isArray(graph.receipts) && Array.isArray(graph.records) && Number.isSafeInteger(graph.generation) && graph.generation === graph.receipts.length, 'Invalid ledger generation');
  const replay: ProofGraph = {manifest:graph.manifest,generation:0,receipts:[],records:[]}, ids = new Set<string>();
  for (const actual of graph.receipts) {
    requireProof(!ids.has(actual.command_id), 'Duplicate receipt'); ids.add(actual.command_id);
    const expected = await deriveCommand(replay,JSON.parse(actual.request_json) as ProofCommand,hash);
    requireProof(canonical(expected.receipt) === canonical(actual), 'Invalid receipt semantics');
    replay.records.push(...expected.records); replay.receipts.push(expected.receipt); replay.generation++;
  }
  requireProof(canonical(replay.records) === canonical(graph.records), 'Invalid record graph');
}

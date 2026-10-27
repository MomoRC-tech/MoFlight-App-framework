import { RealFlightDetailSource } from './real-flight-library';
import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import { realHistoryUuid } from './real-history-contract';
import { createRealFlightSourceObservation, type RealFlightSourceInput } from './real-flight-source';
import type { RealFlightAuthorization, RealFlightLibrary, RealFlightListItem, RealFlightDetail, RealFlightTiming } from './real-flight-library';
import { latestRealFlightValues, type RealFlightCommand, type RealFlightImportPlan, type RealFlightResult,
  type RealFlightGraph, type StoredBinding, type StoredCapture, type StoredCoverage, type StoredPending } from './real-flight-library-model';
import { planFlightRetrieval, type SavedFlightRetrieval } from './retrieval-policy';
import { timeFlightStage } from './flight-diagnostics';
import { diagnosticJournal, type DiagnosticSpanStarter } from '../diagnostics';
import { collectSavedSourceReview, type SavedSourceReview } from './real-flight-review-evidence';

export const REAL_FLIGHT_SERVICE_VERSION = 1;
export interface RealFlightOperationJournal {
  prepare(command: RealFlightCommand): Promise<void>;
  pending(): Promise<RealFlightCommand | null>;
  resolve(commandId: string, outcome: 'committed' | 'not-committed'): Promise<void>;
  supersede(commandId: string): Promise<void>;
  close(): Promise<void>;
}
export interface RealFlightRepositorySession {
  library: RealFlightLibrary;
  writable: boolean;
  warning: string | null;
  close(): Promise<void>;
}
export interface RealFlightServicePorts {
  authorize: RealFlightAuthorization;
  repository(timing?: RealFlightTiming): Promise<RealFlightRepositorySession>;
  journal(): Promise<RealFlightOperationJournal>;
  retrieve(request: {from: string; to: string}, signal: AbortSignal): Promise<RealFlightSourceInput>;
  onReviewStart?(): void;
  hash: Hash;
  uuid(): string;
  now(): string;
}
export type RealFlightReview = {
  version: 1; reviewId: string; ownerId: string; storeId: string; accountRef: string;
  source: RealFlightSourceInput;
} & ({state: 'confirm-account'; sourceSha256: string} | {state: 'ready'; plan: RealFlightImportPlan});
export type RealFlightRecovery =
  | {status: 'none'}
  | {status: 'committed'; result: RealFlightResult}
  | {status: 'not-committed'; commandId: string}
  | {status: 'recovery-required'; commandId: string; warning: string | null};
export interface OwnFlightStoredSnapshot {
  version: 1; ownerId: string; storeId: string; generation: number;
  account: {provider: 'vereinsflieger'; accountRef: string} | null;
  coverage: StoredCoverage[];
  savedRetrievals: SavedFlightRetrieval[];
  pending: StoredPending[];
  latestSavedResult: RealFlightResult | null;
  recovery: {readOnly: boolean; warning: string | null};
}
export interface OwnFlightStoredReadback { snapshot: OwnFlightStoredSnapshot; flights: RealFlightListItem[]; detailSource?: RealFlightDetailSource }
export class PendingRealFlightOperation extends Error {
  constructor(readonly commandId: string, options?: ErrorOptions) { super('The original save command needs receipt recovery before another save.',options); }
}
const clone = <T>(value: T): T => JSON.parse(canonical(value)) as T;

/** Versioned UI-independent boundary. Provider navigation and native SQL stay in ports. */
export class RealFlightService {
  readonly version = REAL_FLIGHT_SERVICE_VERSION;
  private operation = 0;
  private controller: AbortController | null = null;
  private currentReview: RealFlightReview | null = null;
  private disposed = false;
  private writing = false;
  private dispatching = false;
  constructor(readonly ownerId: string, readonly storeId: string, private readonly leaseId: string, private readonly ports: RealFlightServicePorts) {
    realHistoryUuid(ownerId); realHistoryUuid(storeId); this.allowed();
  }
  private allowed(write = false) {
    const p = this.ports.authorize();
    if (this.disposed || !p || p.ownerId !== this.ownerId || p.storeId !== this.storeId || p.leaseId !== this.leaseId ||
      typeof p.writable !== 'boolean' || write && !p.writable) throw new Error('Expired or foreign own-flight service.');
    return p;
  }
  private live(sequence: number) { this.allowed(); if (sequence !== this.operation) throw new Error('Superseded own-flight operation.'); }
  cancelReview() {
    this.operation++; this.controller?.abort(); this.controller = null; this.currentReview = null;
    // A durable prepared command is deliberately retained; cancellation is not rollback.
  }
  dispose() { this.cancelReview(); this.disposed = true; }
  private async withRepository<T>(work: (session: RealFlightRepositorySession, timing: DiagnosticSpanStarter) => Promise<T>, supplied?: RealFlightRepositorySession, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<T> {
    if (!supplied) this.allowed();
    // The repository owns a handle used after open finishes; bind its driver
    // observations to this operation rather than an already completed open span.
    const session = supplied ?? await timeFlightStage('repository-open',()=>this.ports.repository(span),span);
    try { this.allowed(); const result = await work(session,span); this.allowed(); return result; }
    finally { await timeFlightStage('repository-close', () => session.close(), span); }
  }
  private async withJournal<T>(work: (journal: RealFlightOperationJournal) => Promise<T>, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<T> {
    this.allowed(); const journal = await timeFlightStage('local-journal-open',()=>this.ports.journal(),span);
    try { this.allowed(); const result = await work(journal); this.allowed(); return result; }
    finally { await timeFlightStage('local-journal-close',()=>journal.close(),span); }
  }
  async retrieve(request: {from: string; to: string}, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<RealFlightReview> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Save receipt recovery is required before retrieval.');
    const sequence = ++this.operation; this.controller?.abort(); const controller = new AbortController(); this.controller = controller;
    try {
      const pending = await this.withJournal(journal=>journal.pending(),span); this.live(sequence);
      if (pending) throw new PendingRealFlightOperation(pending.commandId);
      const source = await timeFlightStage('source-retrieval',()=>this.ports.retrieve({...request},controller.signal),span); this.live(sequence);
      this.ports.onReviewStart?.();
      return await timeFlightStage('source-review',nested=>this.buildReview(source,sequence,nested),span);
    } finally { if (this.controller === controller) this.controller = null; }
  }
  async retrieveUpdate(now = new Date()): Promise<RealFlightReview> {
    const span=diagnosticJournal.captureSpan();
    await timeFlightStage('receipt-recovery',nested=>this.prepareFreshFetch(nested),span);
    const snapshot = await this.withRepository(async ({library,writable,warning})=>this.storedSnapshot(await library.snapshot(span),writable,warning),undefined,span);
    return this.retrieve(planFlightRetrieval(snapshot.savedRetrievals, now).request,span);
  }
  async reviewSource(source: RealFlightSourceInput): Promise<RealFlightReview> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Save is in progress.');
    const span=diagnosticJournal.captureSpan();
    this.ports.onReviewStart?.();
    this.controller?.abort(); this.controller = null; return timeFlightStage('source-review',nested=>this.buildReview(source,++this.operation,nested),span);
  }
  private async buildReview(input: RealFlightSourceInput, sequence: number, span: DiagnosticSpanStarter): Promise<RealFlightReview> {
    const observation = await createRealFlightSourceObservation(input,this.ports.hash), source = clone(input); this.live(sequence);
    if (observation.coverage.state === 'partial') throw new Error('A partial source capture remains review evidence and cannot be saved to the library.');
    const pending = await this.withJournal(journal=>journal.pending(),span); this.live(sequence);
    if (pending) throw new PendingRealFlightOperation(pending.commandId);
    const review = await this.withRepository(async ({library}) => {
      const {graph,plan} = await library.prepareReview(source,span); this.live(sequence);
      const reviewId = this.ports.uuid(); realHistoryUuid(reviewId);
      const base = {version:1 as const,reviewId,ownerId:this.ownerId,storeId:this.storeId,accountRef:observation.binding.accountRef,source};
      if (!graph.records.some(row=>row.kind === 'binding')) return {...base,state:'confirm-account' as const,sourceSha256:observation.capture.rawCaptureSha256};
      if (!plan) throw new Error('Bound source review requires an import plan.');
      return {...base,state:'ready' as const,plan};
    },undefined,span);
    this.live(sequence); this.currentReview = clone(review); return clone(review);
  }
  private selected(review: RealFlightReview) {
    this.allowed(true);
    if (this.writing || this.dispatching) throw new Error('A save command is already in progress.');
    if (!this.currentReview || canonical(review) !== canonical(this.currentReview)) throw new Error('Review changed; retrieve or review again.');
  }
  async confirmAccount(review: RealFlightReview, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<RealFlightReview> {
    this.selected(review); if (review.state !== 'confirm-account') throw new Error('Account confirmation is not pending.');
    const sequence = ++this.operation; this.dispatching = true;
    try {
      await this.withRepository(async session => {
        if (!session.writable) throw new Error('Read-only library recovery must be resolved before binding.');
        const graph = await session.library.snapshot(span); this.live(sequence);
        await this.execute({version:1,kind:'bind',ownerId:this.ownerId,storeId:this.storeId,commandId:this.ports.uuid(),
          baseGeneration:graph.generation,at:this.ports.now(),source:review.source},session,sequence,span);
      },undefined,span);
      this.live(sequence); return await this.buildReview(review.source,sequence,span);
    } finally { this.dispatching = false; }
  }
  async saveUnassigned(review: RealFlightReview, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<RealFlightResult> {
    return this.saveReviewed(review,span,async result=>result);
  }
  private async saveReviewed<T>(review: RealFlightReview, span: DiagnosticSpanStarter,
    afterSave: (result: RealFlightResult, session: RealFlightRepositorySession, sequence: number) => Promise<T>): Promise<T> {
    this.selected(review); if (review.state !== 'ready') throw new Error('Confirm the source account before saving.');
    const sequence = ++this.operation; this.dispatching = true;
    try {
      const result = await this.withRepository(async session=>{
        this.live(sequence);
        const saved = await this.execute({version:1,kind:'import-unassigned',ownerId:this.ownerId,storeId:this.storeId,
          commandId:this.ports.uuid(),baseGeneration:review.plan.baseGeneration,at:this.ports.now(),bindingId:review.plan.bindingId,
          planToken:review.plan.planToken,source:review.source},session,sequence,span);
        return afterSave(saved,session,sequence);
      },undefined,span);
      this.live(sequence); this.currentReview = null; return result;
    } finally { this.dispatching = false; }
  }
  /** Save within an explicitly requested foreground load, using a fresh context. */
  async saveVerifiedReview(review: RealFlightReview, verified: {accountNumber: string; clubLabel: string}): Promise<RealFlightResult> {
    const span=diagnosticJournal.captureSpan();
    return this.saveUnassigned(await this.verifiedReview(review,verified,span),span);
  }
  /** Local metadata checks and final fresh projection share the selected save session. No provider/user waits belong in beforeReadback. */
  async saveVerifiedReviewWithStoredReadback(review: RealFlightReview, verified: {accountNumber: string; clubLabel: string}, beforeReadback?: () => Promise<void>):
    Promise<{result: RealFlightResult; stored: OwnFlightStoredReadback}> {
    const span=diagnosticJournal.captureSpan(),ready=await this.verifiedReview(review,verified,span);
    return this.saveReviewed(ready,span,async(result,{library,writable,warning},sequence)=>{
      // Commit and journal resolution succeeded. A failed projection must not
      // make this already consumed review available for another save command.
      this.currentReview=null;
      this.live(sequence);
      await beforeReadback?.();
      this.live(sequence);
      const pending=await this.withJournal(journal=>journal.pending(),span);
      this.live(sequence);
      if(pending)throw new PendingRealFlightOperation(pending.commandId);
      const stored=await timeFlightStage('return-readback',async timing=>{
        const {graph,flights}=await library.readStored(timing);
        if (!graph.receipts.some(receipt=>receipt.command_id===result.commandId&&receipt.result_json===canonical(result))) {
          throw new Error('Saved flight receipt changed during stored readback.');
        }
        return {snapshot:this.storedSnapshot(graph,writable,warning),flights};
      },span);
      return {result,stored};
    });
  }
  private async verifiedReview(review: RealFlightReview, verified: {accountNumber: string; clubLabel: string}, span: DiagnosticSpanStarter): Promise<RealFlightReview> {
    this.selected(review);
    if (verified.accountNumber !== review.accountRef || verified.accountNumber !== review.source.contextAfter.accountNumber ||
        verified.clubLabel !== review.source.contextAfter.clubLabel) throw new Error('Fresh provider context does not match the flight review.');
    return review.state === 'confirm-account' ? this.confirmAccount(review,span) : review;
  }
  private async execute(command: RealFlightCommand, session: RealFlightRepositorySession, sequence: number, span: DiagnosticSpanStarter): Promise<RealFlightResult> {
    this.live(sequence); this.allowed(true); if (!session.writable || this.writing) throw new Error('Read-only recovery or another save blocks this command.');
    realHistoryUuid(command.commandId); this.writing = true;
    try {
      try {
        // Keep validated historical command content only for this local save.
        // No provider/user wait or caller callback runs with this journal open.
        return await this.withJournal(async journal=>{
          await timeFlightStage('command-prepare',()=>journal.prepare(command),span); this.live(sequence); this.allowed(true);
          const result = await timeFlightStage('explicit-save',nested=>session.library.commit(command,nested),span); this.allowed();
          await timeFlightStage('command-resolve',()=>journal.resolve(command.commandId,'committed'),span); this.allowed(); return result;
        },span);
      } catch (error) { throw new PendingRealFlightOperation(command.commandId,{cause:error}); }
    } finally { this.writing = false; }
  }
  async recoverPending(span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<RealFlightRecovery> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Wait for the current save before receipt recovery.');
    const command = await this.withJournal(journal=>journal.pending(),span);
    if (!command) return {status:'none'};
    return this.withRepository(async session => {
      const receipt = await session.library.recoverReceipt(command.commandId);
      if (receipt.status === 'found') {
        if (receipt.receipt.request_json !== canonical(command)) throw new Error('Recovered receipt does not match the original command.');
        await this.withJournal(journal=>journal.resolve(command.commandId,'committed'),span);
        this.currentReview = null; return {status:'committed',result:receipt.result};
      }
      if (!session.writable) return {status:'recovery-required',commandId:command.commandId,warning:session.warning};
      await this.withJournal(journal=>journal.resolve(command.commandId,'not-committed'),span);
      return {status:'not-committed',commandId:command.commandId};
    },undefined,span);
  }
  /** Fresh provider observations replace a proven-uncommitted attempt, never an uncertain branch. */
  async prepareFreshFetch(span: DiagnosticSpanStarter = diagnosticJournal.captureSpan()): Promise<RealFlightRecovery> {
    this.allowed(true);
    const result=await this.recoverPending(span);
    if(result.status==='recovery-required')throw new PendingRealFlightOperation(result.commandId);
    if(result.status==='not-committed'){
      await this.withJournal(journal=>journal.supersede(result.commandId),span);
      diagnosticJournal.record('sync','sync-previous-save-superseded');
      return {status:'none'};
    }
    if(result.status==='committed')diagnosticJournal.record('sync','sync-previous-save-resolved');
    return result;
  }
  async retryPending(): Promise<RealFlightResult> {
    this.allowed(true); if (this.dispatching || this.writing) throw new Error('A save command is already in progress.');
    const sequence = ++this.operation, span=diagnosticJournal.captureSpan(); this.dispatching = true;
    try {
      const command = await this.withJournal(journal=>journal.pending(),span); this.live(sequence);
      if (!command) throw new Error('No prepared save command to retry.');
      const result = await this.withRepository(session=>this.execute(command,session,sequence,span),undefined,span); this.live(sequence); this.currentReview = null; return result;
    } finally { this.dispatching = false; }
  }
  async snapshot(): Promise<OwnFlightStoredSnapshot> {
    return this.withRepository(async ({library,writable,warning},timing)=>{
      return this.storedSnapshot(await library.snapshot(timing),writable,warning);
    });
  }
  async readStored(initialSession?: RealFlightRepositorySession, span: DiagnosticSpanStarter = diagnosticJournal.captureSpan(), includeDetails = false): Promise<OwnFlightStoredReadback> {
    return this.withRepository(async ({library,writable,warning},timing)=>{
      const {graph,flights}=await library.readStored(timing);
      const finish=timing('stored-summary-derivation');
      try { const result={snapshot:this.storedSnapshot(graph,writable,warning),flights,...(includeDetails ? {detailSource:new RealFlightDetailSource(graph)} : {})}; finish(true); return result; } catch (error) { finish(false); throw error; }
    }, initialSession, span);
  }
  async readReviewEvidence(): Promise<SavedSourceReview> {
    return this.withRepository(async ({library}) => {
      const { graph } = await library.readStored();
      return collectSavedSourceReview(graph);
    });
  }
  /** Local-only verified binding provenance for historical identity migration. */
  async readBindingEvidence(): Promise<RealFlightGraph> {
    return this.withRepository(async ({ library }) => (await library.readStored()).graph);
  }
  private storedSnapshot(graph:RealFlightGraph,writable:boolean,warning:string|null):OwnFlightStoredSnapshot {
      if (graph.manifest.owner_id !== this.ownerId || graph.manifest.store_id !== this.storeId) throw new Error('Foreign own-flight repository graph.');
      const binding = latestRealFlightValues<StoredBinding>(graph.records,'binding')[0];
      const coverage = latestRealFlightValues<StoredCoverage>(graph.records,'coverage');
      const captures = new Map(latestRealFlightValues<StoredCapture>(graph.records,'capture').map(value => [value.source.capture.captureId,value]));
      const imports = new Map(graph.receipts.filter(row => row.kind === 'import-unassigned')
        .map(row => [(JSON.parse(row.result_json) as RealFlightResult).captureId,row]));
      const savedRetrievals = coverage.map(value => {
        const capture = captures.get(value.captureId), window = value.coverage.displayedWindow;
        const receipt = imports.get(value.captureId);
        if (!binding || value.bindingId !== binding.bindingId || capture?.bindingId !== binding.bindingId || !window || !receipt ||
          !['complete','empty'].includes(value.coverage.state)) throw new Error('Invalid committed flight coverage.');
        return {from:window.from,to:window.to,retrievedAt:capture.source.capture.retrievedAt,savedAt:receipt.committed_at};
      });
      return {version:1,ownerId:this.ownerId,storeId:this.storeId,generation:graph.generation,
        account:binding ? {provider:binding.provider,accountRef:binding.accountRef} : null,
        coverage,savedRetrievals,pending:latestRealFlightValues<StoredPending>(graph.records,'pending'),
        latestSavedResult:graph.receipts.length ? JSON.parse(graph.receipts.at(-1)!.result_json) as RealFlightResult : null,
        recovery:{readOnly:!writable,warning}};
  }
  async list(): Promise<RealFlightListItem[]> { return this.withRepository(({library})=>library.list()); }
  async detail(flightId: string): Promise<RealFlightDetail | null> { return this.withRepository(({library})=>library.detail(flightId)); }
  async exportBackup(): Promise<string> {
    this.allowed(); const pending = await this.withJournal(journal=>journal.pending());
    if (pending) throw new PendingRealFlightOperation(pending.commandId);
    return this.withRepository(({library,writable})=>{
      if (!writable) throw new Error('Resolve retained-candidate recovery before exporting a current backup.');
      return library.exportBackup();
    });
  }
}

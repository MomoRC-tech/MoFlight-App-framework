import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import { realHistoryUuid } from './real-history-contract';
import { createRealFlightSourceObservation, type RealFlightSourceInput } from './real-flight-source';
import type { RealFlightAuthorization, RealFlightLibrary, RealFlightListItem, RealFlightDetail } from './real-flight-library';
import { latestRealFlightValues, type RealFlightCommand, type RealFlightImportPlan, type RealFlightResult,
  type RealFlightGraph, type StoredBinding, type StoredCapture, type StoredCoverage, type StoredPending } from './real-flight-library-model';
import { planFlightRetrieval, type SavedFlightRetrieval } from './retrieval-policy';
import { timeFlightStage } from './flight-diagnostics';
import { diagnosticJournal } from '../diagnostics';
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
  repository(): Promise<RealFlightRepositorySession>;
  journal(): Promise<RealFlightOperationJournal>;
  retrieve(request: {from: string; to: string}, signal: AbortSignal): Promise<RealFlightSourceInput>;
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
  private async withRepository<T>(work: (session: RealFlightRepositorySession) => Promise<T>, supplied?: RealFlightRepositorySession): Promise<T> {
    if (!supplied) this.allowed();
    const session = supplied ?? await this.ports.repository();
    try { this.allowed(); const result = await work(session); this.allowed(); return result; }
    finally { await session.close(); }
  }
  private async withJournal<T>(work: (journal: RealFlightOperationJournal) => Promise<T>): Promise<T> {
    this.allowed(); const journal = await this.ports.journal();
    try { this.allowed(); const result = await work(journal); this.allowed(); return result; }
    finally { await journal.close(); }
  }
  async retrieve(request: {from: string; to: string}): Promise<RealFlightReview> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Save receipt recovery is required before retrieval.');
    const sequence = ++this.operation; this.controller?.abort(); const controller = new AbortController(); this.controller = controller;
    try {
      const pending = await this.withJournal(journal=>journal.pending()); this.live(sequence);
      if (pending) throw new PendingRealFlightOperation(pending.commandId);
      const source = await timeFlightStage('source-retrieval',()=>this.ports.retrieve({...request},controller.signal)); this.live(sequence);
      return await timeFlightStage('source-review',()=>this.buildReview(source,sequence));
    } finally { if (this.controller === controller) this.controller = null; }
  }
  async retrieveUpdate(now = new Date()): Promise<RealFlightReview> {
    await timeFlightStage('receipt-recovery',()=>this.prepareFreshFetch());
    const snapshot = await this.snapshot();
    return this.retrieve(planFlightRetrieval(snapshot.savedRetrievals, now).request);
  }
  async reviewSource(source: RealFlightSourceInput): Promise<RealFlightReview> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Save is in progress.');
    this.controller?.abort(); this.controller = null; return timeFlightStage('source-review',()=>this.buildReview(source,++this.operation));
  }
  private async buildReview(input: RealFlightSourceInput, sequence: number): Promise<RealFlightReview> {
    const observation = await createRealFlightSourceObservation(input,this.ports.hash), source = clone(input); this.live(sequence);
    if (observation.coverage.state === 'partial') throw new Error('A partial source capture remains review evidence and cannot be saved to the library.');
    const pending = await this.withJournal(journal=>journal.pending()); this.live(sequence);
    if (pending) throw new PendingRealFlightOperation(pending.commandId);
    const review = await this.withRepository(async ({library}) => {
      const graph = await library.snapshot(); this.live(sequence);
      const reviewId = this.ports.uuid(); realHistoryUuid(reviewId);
      const base = {version:1 as const,reviewId,ownerId:this.ownerId,storeId:this.storeId,accountRef:observation.binding.accountRef,source};
      if (!graph.records.some(row=>row.kind === 'binding')) return {...base,state:'confirm-account' as const,sourceSha256:observation.capture.rawCaptureSha256};
      return {...base,state:'ready' as const,plan:await library.prepareImport(source)};
    });
    this.live(sequence); this.currentReview = clone(review); return clone(review);
  }
  private selected(review: RealFlightReview) {
    this.allowed(true);
    if (this.writing || this.dispatching) throw new Error('A save command is already in progress.');
    if (!this.currentReview || canonical(review) !== canonical(this.currentReview)) throw new Error('Review changed; retrieve or review again.');
  }
  async confirmAccount(review: RealFlightReview): Promise<RealFlightReview> {
    this.selected(review); if (review.state !== 'confirm-account') throw new Error('Account confirmation is not pending.');
    const sequence = ++this.operation; this.dispatching = true;
    try {
      await this.withRepository(async session => {
        if (!session.writable) throw new Error('Read-only library recovery must be resolved before binding.');
        const graph = await session.library.snapshot(); this.live(sequence);
        await this.execute({version:1,kind:'bind',ownerId:this.ownerId,storeId:this.storeId,commandId:this.ports.uuid(),
          baseGeneration:graph.generation,at:this.ports.now(),source:review.source},session,sequence);
      });
      this.live(sequence); return await this.buildReview(review.source,sequence);
    } finally { this.dispatching = false; }
  }
  async saveUnassigned(review: RealFlightReview): Promise<RealFlightResult> {
    this.selected(review); if (review.state !== 'ready') throw new Error('Confirm the source account before saving.');
    const sequence = ++this.operation; this.dispatching = true;
    try {
      const result = await this.withRepository(session=>{
        this.live(sequence);
        return this.execute({version:1,kind:'import-unassigned',ownerId:this.ownerId,storeId:this.storeId,
          commandId:this.ports.uuid(),baseGeneration:review.plan.baseGeneration,at:this.ports.now(),bindingId:review.plan.bindingId,
          planToken:review.plan.planToken,source:review.source},session,sequence);
      });
      this.live(sequence); this.currentReview = null; return result;
    } finally { this.dispatching = false; }
  }
  /** Save within an explicitly requested foreground load, using a fresh context. */
  async saveVerifiedReview(review: RealFlightReview, verified: {accountNumber: string; clubLabel: string}): Promise<RealFlightResult> {
    this.selected(review);
    if (verified.accountNumber !== review.accountRef || verified.accountNumber !== review.source.contextAfter.accountNumber ||
        verified.clubLabel !== review.source.contextAfter.clubLabel) throw new Error('Fresh provider context does not match the flight review.');
    const ready = review.state === 'confirm-account' ? await this.confirmAccount(review) : review;
    return this.saveUnassigned(ready);
  }
  private async execute(command: RealFlightCommand, session: RealFlightRepositorySession, sequence: number): Promise<RealFlightResult> {
    this.live(sequence); this.allowed(true); if (!session.writable || this.writing) throw new Error('Read-only recovery or another save blocks this command.');
    realHistoryUuid(command.commandId); this.writing = true;
    try {
      try {
        await timeFlightStage('command-prepare',()=>this.withJournal(journal=>journal.prepare(command))); this.live(sequence); this.allowed(true);
        const result = await timeFlightStage('explicit-save',()=>session.library.commit(command)); this.allowed();
        await timeFlightStage('command-resolve',()=>this.withJournal(journal=>journal.resolve(command.commandId,'committed'))); this.allowed(); return result;
      } catch (error) { throw new PendingRealFlightOperation(command.commandId,{cause:error}); }
    } finally { this.writing = false; }
  }
  async recoverPending(): Promise<RealFlightRecovery> {
    this.allowed(); if (this.writing || this.dispatching) throw new Error('Wait for the current save before receipt recovery.');
    const command = await this.withJournal(journal=>journal.pending());
    if (!command) return {status:'none'};
    return this.withRepository(async session => {
      const receipt = await session.library.recoverReceipt(command.commandId);
      if (receipt.status === 'found') {
        if (receipt.receipt.request_json !== canonical(command)) throw new Error('Recovered receipt does not match the original command.');
        await this.withJournal(journal=>journal.resolve(command.commandId,'committed'));
        this.currentReview = null; return {status:'committed',result:receipt.result};
      }
      if (!session.writable) return {status:'recovery-required',commandId:command.commandId,warning:session.warning};
      await this.withJournal(journal=>journal.resolve(command.commandId,'not-committed'));
      return {status:'not-committed',commandId:command.commandId};
    });
  }
  /** Fresh provider observations replace a proven-uncommitted attempt, never an uncertain branch. */
  async prepareFreshFetch(): Promise<RealFlightRecovery> {
    this.allowed(true);
    const result=await this.recoverPending();
    if(result.status==='recovery-required')throw new PendingRealFlightOperation(result.commandId);
    if(result.status==='not-committed'){
      await this.withJournal(journal=>journal.supersede(result.commandId));
      diagnosticJournal.record('sync','sync-previous-save-superseded');
      return {status:'none'};
    }
    if(result.status==='committed')diagnosticJournal.record('sync','sync-previous-save-resolved');
    return result;
  }
  async retryPending(): Promise<RealFlightResult> {
    this.allowed(true); if (this.dispatching || this.writing) throw new Error('A save command is already in progress.');
    const sequence = ++this.operation; this.dispatching = true;
    try {
      const command = await this.withJournal(journal=>journal.pending()); this.live(sequence);
      if (!command) throw new Error('No prepared save command to retry.');
      const result = await this.withRepository(session=>this.execute(command,session,sequence)); this.live(sequence); this.currentReview = null; return result;
    } finally { this.dispatching = false; }
  }
  async snapshot(): Promise<OwnFlightStoredSnapshot> {
    return this.withRepository(async ({library,writable,warning})=>{
      return this.storedSnapshot(await library.snapshot(),writable,warning);
    });
  }
  async readStored(initialSession?: RealFlightRepositorySession): Promise<{snapshot: OwnFlightStoredSnapshot; flights: RealFlightListItem[]}> {
    return this.withRepository(async ({library,writable,warning})=>{
      const {graph,flights}=await library.readStored();
      return {snapshot:this.storedSnapshot(graph,writable,warning),flights};
    }, initialSession);
  }
  async readReviewEvidence(): Promise<SavedSourceReview> {
    return this.withRepository(async ({library}) => {
      const { graph } = await library.readStored();
      return collectSavedSourceReview(graph);
    });
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

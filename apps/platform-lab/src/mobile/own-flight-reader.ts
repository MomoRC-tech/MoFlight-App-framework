import { traceLocalRead } from '../local-read-diagnostics';
import type { RealFlightDetail, RealFlightListItem, RealFlightDetailSource } from '../vereinsflieger/real-flight-library';
import type { OwnFlightStoredSnapshot, RealFlightService } from '../vereinsflieger/real-flight-service';
import type { InformationCapture } from '../vereinsflieger/information';
import type { DutyRosterSnapshot } from '../vereinsflieger/duties';
import { buildFeatureInformation, type FeatureInformation } from './feature-information';
import type { ProviderScope } from '../vereinsflieger/scope-store';
import type { DiagnosticOperation, DiagnosticStage, DiagnosticSpanStarter } from '../diagnostics';

export interface OwnFlightDetailContext { ownerSelectionSeq: number; selectionIdentity: string }
/** Registry leases expire at session close; the append-only selection survives reopening. */
export function assertOwnFlightDetailOwner(context: OwnFlightDetailContext, selectionSeq: number): void {
  if (!Number.isSafeInteger(context.ownerSelectionSeq) || context.ownerSelectionSeq < 1 || context.ownerSelectionSeq !== selectionSeq) {
    throw new Error('Displayed flight owner selection changed');
  }
}
export interface OwnFlightScope { ownerId: string; storeId: string }
export interface OwnFlightReadSession extends OwnFlightScope {
  service: Pick<RealFlightService, 'readStored' | 'detail'> & Partial<Pick<RealFlightService, 'readReviewEvidence' | 'readBindingEvidence'>>;
  assertCurrent(): Promise<void>;
  detailContext?(): OwnFlightDetailContext | undefined;
  assertDetailContext?(context: OwnFlightDetailContext): Promise<void>;
  pendingCommand(): Promise<boolean>;
  readFeatureInformation?(accountRef:string):Promise<{scope:ProviderScope;captures:InformationCapture[]}|null>;
  readMedical?(accountRef:string):Promise<InformationCapture|null>;
  readDuties?(accountRef:string):Promise<{scope:ProviderScope;snapshot:DutyRosterSnapshot|null}|null>;
  close(): Promise<void>;
}
export interface OwnFlightReadPorts { open(timing?: DiagnosticSpanStarter): Promise<OwnFlightReadSession | null> }

/** Keep native read transactions apart across hook unmount/remount, not just one hook's lock. */
export function serializeOwnFlightReads(ports: OwnFlightReadPorts): OwnFlightReadPorts & { suspend(): Promise<() => void> } {
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  return { suspend: acquire, async open(timing) {
    const wait = timing?.('local-admission-wait');
    const release = await acquire(); wait?.(true);
    try {
      // Select the current owner only after admission; never retain a queued lease.
      const session = await ports.open(timing);
      if (!session) { release(); return null; }
      let closing: Promise<void> | null = null;
      return { ...session, close: () => closing ??= (async () => {
        try { await session.close(); } finally { release(); }
      })() };
    } catch (error) { release(); throw error; }
  } };
}
export type LocalSectionState = 'loading' | 'ready' | 'missing' | 'failed';
export interface OwnFlightReadProgress {
  publish(view: OwnFlightView): void;
  current(): boolean;
}
export class OwnFlightReadCancelled extends Error {}
export interface OwnFlightView {
  detailSource?: RealFlightDetailSource;
  detailContext?: OwnFlightDetailContext;
  sections?: { medical: LocalSectionState; duties: LocalSectionState; information: LocalSectionState };
  snapshot: OwnFlightStoredSnapshot; flights: RealFlightListItem[]; pendingCommand: boolean;
  featureInformation?:FeatureInformation|null; featureInformationReadFailed?:boolean;
  medical?:InformationCapture|null; medicalReadFailed?:boolean;
  duties?:{scope:ProviderScope;snapshot:DutyRosterSnapshot|null}|null; dutiesReadFailed?:boolean;
}
export class OwnFlightChangedError extends Error {
  constructor() { super('Saved flight selection changed; reload the current library.'); }
}

/** No provider, creation, migration or receipt resolution occurs on this path. */
export async function readOwnFlightView(ports: OwnFlightReadPorts, timing?: Pick<DiagnosticOperation, 'span'>, progress?: OwnFlightReadProgress): Promise<OwnFlightView | null> {
  const timed = async <T>(name: DiagnosticStage, work: () => Promise<T>): Promise<T> => {
    const finish = timing?.span(name);
    try { const value = await work(); finish?.(true); return value; }
    catch (error) { finish?.(false); throw error; }
  };
  const check = () => { if (progress && !progress.current()) throw new OwnFlightReadCancelled('Superseded local read'); };
  check();
  const session = await timed('local-session-open', () => traceLocalRead('session-open', () => ports.open(timing?.span)));
  if (!session) return null;
  try {
    check();
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    const pendingCommand = await timed('local-pending-command', () => traceLocalRead('pending-command', () => session.pendingCommand()));
    check();
    const result = await timed('local-stored-view', () => traceLocalRead('stored-view', () => session.service.readStored(undefined, timing?.span)));
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    if (result.snapshot.ownerId !== session.ownerId || result.snapshot.storeId !== session.storeId ||
      result.flights.some(flight => flight.accountRef !== result.snapshot.account?.accountRef)) {
      throw new Error('Foreign own-flight projection.');
    }
    const detailContext = result.detailSource ? session.detailContext?.() : undefined;
    const sections: NonNullable<OwnFlightView['sections']> = {
      medical: result.snapshot.account && session.readMedical ? 'loading' : 'missing',
      duties: result.snapshot.account && session.readDuties ? 'loading' : 'missing',
      information: result.snapshot.account && session.readFeatureInformation ? 'loading' : 'missing',
    };
    let medical:InformationCapture|null=null,medicalReadFailed=false;
    let duties:OwnFlightView['duties']=null,dutiesReadFailed=false;
    let featureInformation:FeatureInformation|null=null,featureInformationReadFailed=false;
    const view = (): OwnFlightView => ({ ...result, ...(detailContext ? {detailContext} : {}), pendingCommand, medical, medicalReadFailed, duties, dutiesReadFailed,
      featureInformation, featureInformationReadFailed, ...(progress ? { sections: { ...sections } } : {}) });
    const publish = () => { check(); progress?.publish(view()); };
    publish();
    check();
    if(result.snapshot.account&&session.readMedical){
      try {
        medical=await timed('local-medical-read', () => session.readMedical!(result.snapshot.account!.accountRef));
        if(medical&&(medical.owner!==session.ownerId||medical.category!=='medical'))throw new Error('Foreign Medical projection.');
      } catch { medical=null;medicalReadFailed=true; }
    }
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    sections.medical = medicalReadFailed ? 'failed' : medical ? 'ready' : 'missing';
    publish();
    check();
    if(result.snapshot.account&&session.readDuties){
      try{
        duties=await timed('local-duties-read', () => session.readDuties!(result.snapshot.account!.accountRef));
        if(duties&&(duties.scope.owner!==session.ownerId||duties.scope.context.accountNumber!==result.snapshot.account.accountRef))throw new Error('Foreign duty projection');
      }catch{duties=null;dutiesReadFailed=true;}
    }
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    sections.duties = dutiesReadFailed ? 'failed' : duties?.snapshot ? 'ready' : 'missing';
    publish();
    check();
    if(result.snapshot.account&&session.readFeatureInformation){
      try {
        const source=await timed('local-information-read', () => session.readFeatureInformation!(result.snapshot.account!.accountRef));
        if(source){
          if(source.scope.owner!==session.ownerId||source.scope.context.accountNumber!==result.snapshot.account.accountRef||source.captures.some(c=>c.owner!==session.ownerId||c.connectionId!==source.scope.connectionId))throw new Error('Foreign feature source');
          featureInformation=buildFeatureInformation(source.scope,source.captures);
        }
      } catch { featureInformation=null;featureInformationReadFailed=true; }
      await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    }
    sections.information = featureInformationReadFailed ? 'failed' : featureInformation ? 'ready' : 'missing';
    publish();
    return view();
  } finally { await timed('local-session-close', () => traceLocalRead('session-close', () => session.close())); }
}

export async function readOwnFlightDetail(ports: OwnFlightReadPorts, scope: OwnFlightScope,
  selected: RealFlightListItem, stored?: Pick<OwnFlightView, 'detailSource' | 'detailContext'>): Promise<RealFlightDetail> {
  const session = await traceLocalRead('session-open', () => ports.open());
  if (!session) throw new OwnFlightChangedError();
  try {
    await traceLocalRead('owner-check', () => session.assertCurrent());
    if (session.ownerId !== scope.ownerId || session.storeId !== scope.storeId) throw new OwnFlightChangedError();
    // Browse the same evidence as the displayed list. Fresh reads still validate the database fully.
    const source = stored?.detailSource, context = stored?.detailContext;
    if (source && (!context || !session.assertDetailContext)) throw new OwnFlightChangedError();
    if (source) await session.assertDetailContext!(context!);
    const detail = source ? source.detail(selected.flightId) : await traceLocalRead('detail', () => session.service.detail(selected.flightId));
    if (source) await session.assertDetailContext!(context!);
    await traceLocalRead('owner-check', () => session.assertCurrent());
    if (!detail || detail.flightId !== selected.flightId || detail.accountRef !== selected.accountRef ||
      detail.bindingId !== selected.bindingId || detail.sourceFlightRef !== selected.sourceFlightRef || detail.factsRevision !== selected.factsRevision) throw new OwnFlightChangedError();
    return detail;
  } finally { await traceLocalRead('session-close', () => session.close()); }
}

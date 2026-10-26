import { traceLocalRead } from '../local-read-diagnostics';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { OwnFlightStoredSnapshot, RealFlightService } from '../vereinsflieger/real-flight-service';
import type { InformationCapture } from '../vereinsflieger/information';
import type { DutyRosterSnapshot } from '../vereinsflieger/duties';
import { buildFeatureInformation, type FeatureInformation } from './feature-information';
import type { ProviderScope } from '../vereinsflieger/scope-store';
import type { DiagnosticOperation, DiagnosticStage } from '../diagnostics';

export interface OwnFlightScope { ownerId: string; storeId: string }
export interface OwnFlightReadSession extends OwnFlightScope {
  service: Pick<RealFlightService, 'readStored' | 'detail'> & Partial<Pick<RealFlightService, 'readReviewEvidence' | 'readBindingEvidence'>>;
  assertCurrent(): Promise<void>;
  pendingCommand(): Promise<boolean>;
  readFeatureInformation?(accountRef:string):Promise<{scope:ProviderScope;captures:InformationCapture[]}|null>;
  readMedical?(accountRef:string):Promise<InformationCapture|null>;
  readDuties?(accountRef:string):Promise<{scope:ProviderScope;snapshot:DutyRosterSnapshot|null}|null>;
  close(): Promise<void>;
}
export interface OwnFlightReadPorts { open(): Promise<OwnFlightReadSession | null> }

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
  return { suspend: acquire, async open() {
    const release = await acquire();
    try {
      // Select the current owner only after admission; never retain a queued lease.
      const session = await ports.open();
      if (!session) { release(); return null; }
      let closing: Promise<void> | null = null;
      return { ...session, close: () => closing ??= (async () => {
        try { await session.close(); } finally { release(); }
      })() };
    } catch (error) { release(); throw error; }
  } };
}
export interface OwnFlightView {
  snapshot: OwnFlightStoredSnapshot; flights: RealFlightListItem[]; pendingCommand: boolean;
  featureInformation?:FeatureInformation|null; featureInformationReadFailed?:boolean;
  medical?:InformationCapture|null; medicalReadFailed?:boolean;
  duties?:{scope:ProviderScope;snapshot:DutyRosterSnapshot|null}|null; dutiesReadFailed?:boolean;
}
export class OwnFlightChangedError extends Error {
  constructor() { super('Saved flight selection changed; reload the current library.'); }
}

/** No provider, creation, migration or receipt resolution occurs on this path. */
export async function readOwnFlightView(ports: OwnFlightReadPorts, timing?: Pick<DiagnosticOperation, 'span'>): Promise<OwnFlightView | null> {
  const timed = async <T>(name: DiagnosticStage, work: () => Promise<T>): Promise<T> => {
    const finish = timing?.span(name);
    try { const value = await work(); finish?.(true); return value; }
    catch (error) { finish?.(false); throw error; }
  };
  const session = await timed('local-session-open', () => traceLocalRead('session-open', () => ports.open()));
  if (!session) return null;
  try {
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    const pendingCommand = await timed('local-pending-command', () => traceLocalRead('pending-command', () => session.pendingCommand()));
    const result = await timed('local-stored-view', () => traceLocalRead('stored-view', () => session.service.readStored()));
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    if (result.snapshot.ownerId !== session.ownerId || result.snapshot.storeId !== session.storeId ||
      result.flights.some(flight => flight.accountRef !== result.snapshot.account?.accountRef)) {
      throw new Error('Foreign own-flight projection.');
    }
    let medical:InformationCapture|null=null,medicalReadFailed=false;
    if(result.snapshot.account&&session.readMedical){
      try {
        medical=await timed('local-medical-read', () => session.readMedical!(result.snapshot.account!.accountRef));
        if(medical&&(medical.owner!==session.ownerId||medical.category!=='medical'))throw new Error('Foreign Medical projection.');
      } catch { medical=null;medicalReadFailed=true; }
    }
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    let duties:OwnFlightView['duties']=null,dutiesReadFailed=false;
    if(result.snapshot.account&&session.readDuties){
      try{
        duties=await timed('local-duties-read', () => session.readDuties!(result.snapshot.account!.accountRef));
        if(duties&&(duties.scope.owner!==session.ownerId||duties.scope.context.accountNumber!==result.snapshot.account.accountRef))throw new Error('Foreign duty projection');
      }catch{duties=null;dutiesReadFailed=true;}
    }
    await timed('local-owner-check', () => traceLocalRead('owner-check', () => session.assertCurrent()));
    let featureInformation:FeatureInformation|null=null,featureInformationReadFailed=false;
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
    return { ...result, pendingCommand,medical,medicalReadFailed,duties,dutiesReadFailed,featureInformation,featureInformationReadFailed };
  } finally { await timed('local-session-close', () => traceLocalRead('session-close', () => session.close())); }
}

export async function readOwnFlightDetail(ports: OwnFlightReadPorts, scope: OwnFlightScope,
  selected: RealFlightListItem): Promise<RealFlightDetail> {
  const session = await traceLocalRead('session-open', () => ports.open());
  if (!session) throw new OwnFlightChangedError();
  try {
    await traceLocalRead('owner-check', () => session.assertCurrent());
    if (session.ownerId !== scope.ownerId || session.storeId !== scope.storeId) throw new OwnFlightChangedError();
    const detail = await traceLocalRead('detail', () => session.service.detail(selected.flightId));
    await traceLocalRead('owner-check', () => session.assertCurrent());
    if (!detail || detail.flightId !== selected.flightId || detail.accountRef !== selected.accountRef ||
      detail.bindingId !== selected.bindingId || detail.sourceFlightRef !== selected.sourceFlightRef || detail.factsRevision !== selected.factsRevision) throw new OwnFlightChangedError();
    return detail;
  } finally { await traceLocalRead('session-close', () => session.close()); }
}

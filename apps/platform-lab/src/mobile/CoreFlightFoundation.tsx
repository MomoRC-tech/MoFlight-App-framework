import {idleSyncProgress,startSyncStage,finishSyncStage,type SyncProgress,type SyncStage} from './sync-progress';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { hash } from '../storage';
import { timeFlightStage } from '../vereinsflieger/flight-diagnostics';
import { diagnosticJournal, type DiagnosticOperation, type DiagnosticAction } from '../diagnostics';
import { useAccessController } from '../vereinsflieger/use-access-controller';
import { openOwnerRegistry, openRealFlightCandidate, resumeInitialRealFlightCandidate, openRealFlightSelection,
  openRealFlightCommandJournal, RealFlightCandidateMissingError, RealFlightUninitializedStoreError,
  type RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import type { RealOwnerLease, RealOwnerRegistry } from '../vereinsflieger/real-owner-registry';
import { continueRealFlightOwnerSetup } from '../vereinsflieger/real-flight-owner-setup';
import { RealFlightService, PendingRealFlightOperation, type OwnFlightStoredSnapshot, type RealFlightReview,
  type RealFlightRecovery, type RealFlightRepositorySession } from '../vereinsflieger/real-flight-service';
import type { RealFlightLibrary, RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RealFlightSourceInput } from '../vereinsflieger/real-flight-source';
import { canCancelCoreFlightSource, mayReviewCoreFlightCapture, shouldDeferCoreFlightSourceRejection,
  type CoreFlightReviewAdmission } from './core-flight-review-policy';
import { saveRealFlightBackupToFolder, restoreRealFlightBackup, resumeRealFlightBackup,
  type RestoreRealFlightBackupResult } from '../vereinsflieger/real-flight-backup-native';
import type { RealFlightRestorePreparation } from '../vereinsflieger/real-flight-selection';
import {ConnectionSettings} from './ConnectionSettings';
import { ProviderConnection, unknownProviderStatus, type ProviderStatus } from './ProviderConnection';
import { Action, Card, Label, Section, colors } from './theme';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { dataFreshness } from './data-freshness';
import { ownFlightReadPorts } from './own-flight-reader-native';
import type { OwnFlightConnectionEvidence } from './connection-guidance';
import { retrieveOtherAccountData, runAccountRetrievalJobs, type MedicalJobStatus, type DutyJobStatus, type FeatureJobStatus } from './account-retrieval-jobs';
import { refreshDutyRoster } from '../vereinsflieger/duty-refresh-native';
import { retrievalFailureHint } from '../vereinsflieger/connection-state';
import { startSessionMonitor } from './session-monitor';
import { createActivityLedger, decodeActivityLedger, activityCheckDue, recordActivityAttempt, observeActivityLedger,
  activityLedgerChanged, type ActivityLedger, type ActivityIdentity } from './activity-ledger';
import { loadScopedActivity, saveScopedActivity } from '../vereinsflieger/scoped-storage';
import { acknowledgeActivitySync, type ActivitySyncEvidence } from './activity-sync';
import { canonical as activityCanonical } from '@moflight/flight-logbook';
import { getPendingUserBackupRestoreNative, restoreUserBackupFromPickerNative, saveUserBackupToFolder } from '../user-backup-native';
import type { UserBackupRestoreOperation } from '../user-backup-restore-journal';

export type SyncControls={cancel:()=>void;canCancel:boolean};
export type ConnectionIntent = 'connect'|'update'|'options'|'development';
export interface FlightLoadResult { ownerId?:string; storeId?:string; accountRef?:string; completedAt?:string; added: number; changed: number; pending: number; from: string; to: string;
  cleanupPending?:boolean;verifiedConnection?: OwnFlightConnectionEvidence; medicalStatus?: MedicalJobStatus; dutyStatus?:DutyJobStatus; eventsStatus?:FeatureJobStatus; documentNoticesStatus?:FeatureJobStatus; workSummaryStatus?:FeatureJobStatus; workHoursStatus?:FeatureJobStatus; tasksStatus?:FeatureJobStatus }
function featureJobResult(label:string,status:FeatureJobStatus) {
  return status==='partial'?`${label}: Quelle erfasst · Vollständigkeit ungeprüft.`:status==='failed'?`${label}: Abruf fehlgeschlagen · gespeicherte Angaben bleiben erhalten.`:`${label}: nicht abgeschlossen · gespeicherte Angaben bleiben erhalten.`;
}
export function CoreFlightFoundation({ close, startUpdate = false, intent = startUpdate?'update':'options', open = true, requestId = 0, onStatus, developmentRecoveryCheckpoints = false, providerEntryAllowed = false, dialogTop, onProgress,onControls }: {close: (result?: FlightLoadResult) => void; startUpdate?: boolean; intent?:ConnectionIntent; open?:boolean; requestId?:number; onStatus?:(status:ProviderStatus)=>void; developmentRecoveryCheckpoints?: boolean; providerEntryAllowed?:boolean; dialogTop?:number; onProgress?:(progress:SyncProgress)=>void;onControls?:(controls:SyncControls|null)=>void}) {
  const diagnosis = useRef<DiagnosticOperation | null>(null);
  const [requestedUpdate,setRequestedUpdate] = useState(intent!=='options');
  const registry = useRef<RealOwnerRegistry | null>(null), alive = useRef(true), lock = useRef(false);
  const initialRepository = useRef<RealFlightRepositorySession | null>(null);
  function takeInitialRepository() { const session=initialRepository.current;initialRepository.current=null;return session; }
  const [lease,setLease] = useState<RealOwnerLease | null>(null), [setupLease,setSetupLease] = useState<RealOwnerLease | null>(null);
  const [loading,setLoading] = useState(true), [error,setError] = useState(false);
  const setupStarted = useRef(false);
  const [admitted,setAdmitted] = useState(false);
  const [pendingUserRestore,setPendingUserRestore] = useState<UserBackupRestoreOperation|null>(null);

  useEffect(()=>{
    if(onProgress&&open&&(intent==='update'||intent==='connect')&&(!lease||loading))onProgress({state:error||pendingUserRestore?'failed':'active',last:null,current:'prepare',message:error?'Gespeicherte Daten konnten nicht sicher geöffnet werden.':pendingUserRestore?'Eine begonnene Datensicherung muss in den Einstellungen geprüft werden.':undefined});
  },[onProgress,open,intent,lease,loading,error,pendingUserRestore]);

  async function finishOwnerSetup(selected: RealOwnerLease, current: RealOwnerRegistry, createMissing: boolean) {
    const scope: RealFlightNativeScope = {
      registry: current,
      lease: selected,
      authorize: () => alive.current ? {ownerId:selected.ownerId,storeId:selected.storeId,leaseId:selected.leaseId,writable:createMissing && AppState.currentState==='active'} : null,
    };
    return continueRealFlightOwnerSetup<RealFlightLibrary>(selected, {
      openCandidate: name => openRealFlightCandidate(scope,name),
      isMissingCandidate: error => error instanceof RealFlightCandidateMissingError,
      isUninitializedStore: error => error instanceof RealFlightUninitializedStoreError,
      resumeInitialCandidate: () => resumeInitialRealFlightCandidate(scope),
      openSelection: create => openRealFlightSelection(scope,create),
      openCommandJournal: create => openRealFlightCommandJournal(scope,create),
      uuid: Crypto.randomUUID,
    }, createMissing, createMissing ? undefined : (inspected,release)=>{
      if(!alive.current||initialRepository.current)throw new Error('Initial own-flight reader unavailable.');
      initialRepository.current={library:inspected.candidate,writable:!inspected.recoveryRequired,warning:inspected.warning??null,close:release};
    });
  }

  useEffect(()=>{
    if(!open){
      setAdmitted(false);
      let current=true;
      void (async()=>{
        const opened=registry.current??await openOwnerRegistry(false);
        if(!current){if(opened!==registry.current)await opened?.close();return;}
        registry.current=opened;
        const selected=await opened?.currentOwner();
        if(current)setLease(selected??null);
      })().catch(()=>{if(current){setLease(null);onStatus?.({...unknownProviderStatus});}});
      return()=>{current=false;};
    }
    let current=true;
    setLoading(true);setAdmitted(false);setError(false);setupStarted.current=false;setRequestedUpdate(intent!=='options');
    diagnosis.current = diagnosticJournal.begin(intent==='update' ? 'update-flights' : 'open-flight-tools');
    let release:(()=>void)|null=null;
    const startup = (async()=>{
      release=await ownFlightReadPorts.suspend();
      if(!current){release();release=null;return;}
      const opened=registry.current??await timeFlightStage('owner-registry-open',()=>openOwnerRegistry(false));
      if(!current){if(opened!==registry.current)await opened?.close();return;}
      registry.current=opened;
      const selected=await timeFlightStage('owner-selection',async()=>opened?.currentOwner());
      if(!current)return;
      if(!selected||!opened){setLease(null);return;}
      const unused=takeInitialRepository();await unused?.close();
      const pending=await getPendingUserBackupRestoreNative({registry:opened,lease:selected,authorize:()=>alive.current?{...selected,writable:false}:null});
      if(!current)return;
      setPendingUserRestore(pending);
      if(pending){setSetupLease(selected);setLease(null);return;}
      let ready=false;
      try{ready=await timeFlightStage('owner-setup',()=>finishOwnerSetup(selected,opened,false));}catch{/* Preserve existing files and offer recovery. */}
      if(!current)return;
      if(ready)setLease(selected);
      else{diagnosis.current?.finish('blocked','owner-setup');setSetupLease(selected);setLease(null);setError(true);}
    })().catch(()=>{if(current){diagnosis.current?.finish('failed','owner-setup');setError(true);}})
      .finally(()=>{if(current){setLoading(false);setAdmitted(true);}});
    return()=>{
      current=false;
      void startup.then(async()=>{const unused=takeInitialRepository();try{await unused?.close();}finally{release?.();release=null;}})
        .catch(()=>console.warn('Connection read reservation cleanup could not be confirmed.'));
    };
  },[open,requestId]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;diagnosis.current?.finish('cancelled','closed');void registry.current?.close();};},[]);
  useEffect(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(!open||lease)return false;if(!lock.current&&!loading)close();return true;});return()=>subscription.remove();},[close,loading,lease,open]);
  async function resumeSelected() {
    const selected=setupLease,current=registry.current;
    if(lock.current||!selected||!current)return; lock.current=true;setLoading(true);setError(false);
    diagnosis.current=diagnosticJournal.begin('library-operation');
    try {
      if(!await finishOwnerSetup(selected,current,true))throw new Error('Selected owner setup remains incomplete.');
      if(alive.current){setLease(selected);setSetupLease(null);setError(false);}
    } catch {diagnosis.current?.finish('failed','owner-setup');if(alive.current){setSetupLease(selected);setError(true);}}
    finally {lock.current=false;if(alive.current)setLoading(false);}
  }
  async function resumeUserRestore() {
    const selected=setupLease,current=registry.current,pending=pendingUserRestore;
    if(lock.current||!selected||!current||!pending)return;
    lock.current=true;setLoading(true);setError(false);
    const scope:RealFlightNativeScope={registry:current,lease:selected,authorize:()=>alive.current?{...selected,writable:AppState.currentState==='active'}:null};
    try {
      const result=await restoreUserBackupFromPickerNative(scope,async()=>{if(!alive.current)throw new Error('Closed.');await current.assertCurrent(selected);},pending.operationId);
      if(result.state==='restored'||result.state==='already-restored'){
        if(!await finishOwnerSetup(selected,current,false))throw new Error('Restored library unavailable.');
        if(alive.current){setPendingUserRestore(null);setSetupLease(null);setLease(selected);}
      }else if(result.state==='recovery-required'&&alive.current)setError(true);
    }catch{if(alive.current)setError(true);}
    finally{lock.current=false;if(alive.current)setLoading(false);}
  }
  async function createFreshOwner() {
    if(lock.current)return; lock.current=true;setLoading(true);setError(false);
    if(!diagnosis.current?.running())diagnosis.current=diagnosticJournal.begin('update-flights');
    try {
      const current = registry.current ?? await openOwnerRegistry(true); if(!current)throw new Error('Owner registry unavailable.');registry.current=current;
      const selected=await current.createFreshOwner(new Date().toISOString());
      if(alive.current){setLease(null);setSetupLease(selected);}
      if(!await finishOwnerSetup(selected,current,true))throw new Error('New owner setup remains incomplete.');
      if(alive.current){setLease(selected);setSetupLease(null);setError(false);}
    } catch {diagnosis.current?.finish('failed','owner-setup');if(alive.current)setError(true);}
    finally {lock.current=false;if(alive.current)setLoading(false);}
  }
  useEffect(()=>{
    if(open&&admitted&&requestedUpdate&&!loading&&!lease&&!error&&!setupLease&&!setupStarted.current){setupStarted.current=true;void createFreshOwner();}
  },[open,admitted,requestedUpdate,loading,lease,error,setupLease]);
  if(lease&&registry.current)return <OwnerFlightLibrary providerEntryAllowed={providerEntryAllowed} dialogTop={dialogTop} developmentRecoveryCheckpoints={developmentRecoveryCheckpoints} key={`${lease.ownerId}:${lease.storeId}:${lease.selectionSeq}`} lease={lease} registry={registry.current} close={close} open={open&&admitted} requestId={requestId} intent={intent} onStatus={onStatus} onProgress={onProgress} onControls={onControls} startUpdate={intent==='update'} takeInitialRepository={takeInitialRepository} diagnosis={diagnosis}/>;
  if(pendingUserRestore)return <SafeAreaView edges={dialogTop===undefined?undefined:[]} style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:12,gap:10}}><View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
    <Section title="Wiederherstellung fortsetzen" icon="book"/>
    <Card><Label>Eine Datensicherung wird noch wiederhergestellt.</Label><Label muted>Wähle dieselbe Sicherungsdatei erneut. Bis alle Teile geprüft und aktiviert sind, bleibt der Zugriff auf die Bibliotheken gesperrt. Vorherige Dateien bleiben erhalten.</Label></Card>
    {error&&<Label>Die Wiederherstellung konnte noch nicht abgeschlossen werden. Bitte mit derselben Datei erneut versuchen.</Label>}
    {loading&&<ActivityIndicator color={colors.cyan}/>}
    <Action disabled={loading} onPress={()=>void resumeUserRestore()}>Sicherungsdatei auswählen und fortsetzen</Action>
    <Action secondary disabled={loading} onPress={close}>Zur App zurück</Action>
  </View></ScrollView></SafeAreaView>;
  return <SafeAreaView edges={dialogTop===undefined?undefined:[]} style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:12,gap:10}}>
    <View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title={intent==='options'?"Deine Flüge":"Vereinsflieger"} icon={intent==='options'?"flight-paper-plane":"chain"}/>
      <Action secondary disabled={loading} onPress={close}>Zur App zurück</Action>
      <Card><Label>{requestedUpdate ? 'Deine Flüge werden vorbereitet …' : 'Deine Flüge und Saisonübersicht an einem Ort.'}</Label><Label muted>Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an. Danach werden deine Flüge geladen und auf diesem Gerät gespeichert. Ein Papierflugbuch brauchst du dafür nicht.</Label></Card>
      {loading&&<ActivityIndicator color={colors.cyan}/>}
      {setupLease&&<Card><Label>Eine vorhandene Einrichtung für deine ausgewählte Bibliothek ist noch nicht vollständig.</Label><Label muted>Die ursprüngliche Datei wird geprüft. Nur tatsächlich fehlende Dateien dürfen ergänzt werden; vorhandene unlesbare Dateien bleiben erhalten.</Label></Card>}
      {error&&<Card><Label>Die Einrichtung konnte nicht bestätigt werden. Bestehende Dateien bleiben erhalten.</Label></Card>}
      {setupLease&&<Action disabled={loading} onPress={()=>void resumeSelected()}>Vorhandene Einrichtung fortsetzen</Action>}
      {!loading && (setupLease
        ? <Action secondary disabled={loading} onPress={()=>void createFreshOwner()}>Stattdessen neue lokale Bibliothek anlegen</Action>
        : error ? <Action disabled={loading} onPress={()=>{setRequestedUpdate(true);void createFreshOwner();}}>Erneut versuchen</Action> : !requestedUpdate ? <Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label> : null)}
    </View>
  </ScrollView></SafeAreaView>;
}

type WaitingSource = {request:{from:string;to:string};resolve:(source:RealFlightSourceInput)=>void;reject:(error:Error)=>void;started:boolean;checking:boolean;seenBusy:boolean;paused:boolean;resumeRequired:boolean;suppressReview:boolean;generation:number;timer:ReturnType<typeof setTimeout>|null;signal:AbortSignal;abort:()=>void};
type LoadStage = 'sign-in'|'verify'|'flights'|'save'|'medical'|'done';
function OwnerFlightLibrary({lease,registry,close,startUpdate,open=true,requestId=0,intent=startUpdate?'update':'options',onStatus,takeInitialRepository,diagnosis,developmentRecoveryCheckpoints,providerEntryAllowed=false,dialogTop,onProgress,onControls}:{developmentRecoveryCheckpoints:boolean;lease:RealOwnerLease;registry:RealOwnerRegistry;close:(result?:FlightLoadResult)=>void;startUpdate:boolean;open?:boolean;requestId?:number;intent?:ConnectionIntent;onStatus?:(status:ProviderStatus)=>void;onProgress?:(progress:SyncProgress)=>void;onControls?:(controls:SyncControls|null)=>void;takeInitialRepository:()=>RealFlightRepositorySession|null;diagnosis:React.MutableRefObject<DiagnosticOperation|null>;providerEntryAllowed?:boolean;dialogTop?:number}) {
  const c=useAccessController(true,lease.ownerId,developmentRecoveryCheckpoints), controller=useRef(c);controller.current=c;
  useEffect(()=>{
    if(open||!c.viewReady)return;
    return startSessionMonitor({active:AppState.currentState==='active',
      subscribe:changed=>{const sub=AppState.addEventListener('change',state=>changed(state==='active'));return()=>sub.remove();},
      schedule:(callback,ms)=>{const timer=setTimeout(callback,ms);return()=>clearTimeout(timer);},
      check:async current=>{
        try{await registry.assertCurrent(lease);if(current())controller.current.checkSession();}
        catch{if(current()){controller.current.dismissLogin();onStatus?.({...unknownProviderStatus});}}
      },
    });
  },[open,c.viewReady,registry,lease]);
  const alive=useRef(true),foreground=useRef(AppState.currentState==='active'),lock=useRef(false),waiting=useRef<WaitingSource|null>(null);
  const activityLedger = useRef<ActivityLedger | null>(null), activityLock = useRef(false);
  const activityLoad = useRef<{key:string;promise:Promise<ActivityLedger|null>}|null>(null);
  const activityWrites = useRef(new Set<Promise<void>>());
  const [activityChanged, setActivityChanged] = useState(false);
  const activityIdentity = (): ActivityIdentity | null => {
    const bound = controller.current.activityScope;
    return bound?.owner === lease.ownerId ? { owner: lease.ownerId, store: lease.storeId, connection: bound.connectionId,
      account: bound.context.accountNumber, club: bound.context.clubLabel } : null;
  };
  async function currentActivityLedger() {
    const bound = controller.current.activityScope, identity = activityIdentity();
    if (!bound || !identity) return null;
    if (activityLedger.current && activityCanonical(activityLedger.current.identity) === activityCanonical(identity)) return activityLedger.current;
    const key = activityCanonical(identity);
    if (activityLoad.current?.key === key) return activityLoad.current.promise;
    const promise = (async () => {
      const saved = await loadScopedActivity(bound, lease.storeId);
      if (!alive.current || activityCanonical(activityIdentity()) !== key) return null;
      activityLedger.current = saved === null ? createActivityLedger(identity) : decodeActivityLedger(saved, identity);
      setActivityChanged(activityLedgerChanged(activityLedger.current));
      return activityLedger.current;
    })();
    activityLoad.current = {key,promise};
    try { return await promise; } finally { if (activityLoad.current?.promise === promise) activityLoad.current = null; }
  }
  async function persistActivity(next: ActivityLedger) {
    const bound = controller.current.activityScope;
    const gate = () => {
      if (!alive.current || activityCanonical(activityIdentity()) !== activityCanonical(next.identity)) throw new Error('Activity scope expired.');
    };
    if (!bound) throw new Error('Activity scope unavailable.');
    gate(); await registry.assertCurrent(lease); gate();
    const write = saveScopedActivity(bound, lease.storeId, decodeActivityLedger(next, next.identity), gate);
    activityWrites.current.add(write);
    try { await write; } finally { activityWrites.current.delete(write); }
    gate();
    activityLedger.current = next; setActivityChanged(activityLedgerChanged(next));
  }
  async function acknowledgeActivity(evidence: ActivitySyncEvidence) {
    try {
      const ledger = await currentActivityLedger(); if (!ledger) return;
      const next = acknowledgeActivitySync(ledger, evidence, Date.now());
      if (activityCanonical(next) !== activityCanonical(ledger)) await persistActivity(next);
    } catch { /* Advisory failure cannot undo or misreport an already committed source sync. */ }
  }
  async function refreshDuties(account: string, active: () => boolean) {
    const captures: { marker: import('../vereinsflieger/activity-probe').ActivityProbeSource; capturedAt:number }[] = [];
    const result = await refreshDutyRoster(lease.ownerId, account, {active, readPage: async source => {
      const capture = await controller.current.retrieveDutyPage(source);
      const marker = controller.current.takeDutyActivity(capture.id);
      if (marker && !capture.coverage.truncated && marker.markers.count === capture.rows.length)
        captures.push({marker,capturedAt:Date.parse(capture.retrievedAt)});
      return capture;
    }});
    for (const {marker,capturedAt} of captures) await acknowledgeActivity({...marker,capturedAt,committedAt:Date.now()});
    return result;
  }
  useEffect(() => {
    if (!c.viewReady) return;
    let current = true;
    void currentActivityLedger().then(async ledger => {
      if (!current || !ledger || open || activityLock.current || lock.current || AppState.currentState !== 'active' ||
        c.connection.phase !== 'observed' || !c.connection.confirmed || !activityCheckDue(ledger, Date.now())) return;
      activityLock.current = true;
      try {
        await registry.assertCurrent(lease);
        if (await getPendingUserBackupRestoreNative(scope)) return;
        if (!current || panelActive.current) return;
        const result = await controller.current.checkActivity(async () => {
          if (!current || panelActive.current) throw new Error('Activity check superseded.');
          await persistActivity(recordActivityAttempt(ledger, Date.now()));
        });
        if (!current || !result || panelActive.current) return;
        const latest = activityLedger.current;
        if (latest) await persistActivity(observeActivityLedger(latest, result.sources, result.observedAt, Date.now()));
      } catch { /* Unavailable means no new signal. Existing scoped hints stay intact. */ }
      finally { activityLock.current = false; }
    }).catch(() => { /* An unreadable cache is preserved, never overwritten by an empty baseline. */ });
    return () => { current = false; };
  }, [open, c.viewReady, c.connection, lease]);
  const reviewGeneration=useRef(0),directAdmission=useRef<CoreFlightReviewAdmission|null>(null),invalidatedRetrievals=useRef(new Set<string>());
  const [syncProgress,setSyncProgress]=useState<SyncProgress>(intent==='update'||intent==='connect'?{state:'active',last:null,current:'prepare'}:idleSyncProgress);
  const reportedStage=useRef<SyncStage|null>(null);
  function startStage(stage:SyncStage){if(reportedStage.current!==stage){reportedStage.current=stage;diagnosticJournal.record('sync',`sync-${stage}`);}setSyncProgress(previous=>startSyncStage(previous,stage));}
  function finishStage(stage:SyncStage){diagnosticJournal.record('sync','sync-stage-finished');setSyncProgress(previous=>finishSyncStage(previous,stage));}
  async function syncStage<T>(stage:SyncStage,work:()=>Promise<T>):Promise<T>{startStage(stage);const end=diagnosis.current?.span(stage==='documents'?'document-notices':stage);try{const result=await work();end?.(true);finishStage(stage);return result;}catch(error){end?.(false);throw error;}}
  const [busy,setBusy]=useState(false),[providerOpen,setProviderOpen]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [review,setReview]=useState<RealFlightReview|null>(null),[flights,setFlights]=useState<RealFlightListItem[]>([]),[page,setPage]=useState(0);
  const [snapshot,setSnapshot]=useState<OwnFlightStoredSnapshot|null>(null),[detail,setDetail]=useState<RealFlightDetail|null>(null),[recovery,setRecovery]=useState<RealFlightRecovery>({status:'none'});
  const [restorePreparations,setRestorePreparations]=useState<RealFlightRestorePreparation[]>([]),[restoreReadWarning,setRestoreReadWarning]=useState<string|null>(null);
  const [userRestoreId,setUserRestoreId]=useState<string|null>(null);
  const handledCapture=useRef<string|null>(null);
  const [reviewRow,setReviewRow]=useState<number|null>(null);
  const [advanced,setAdvanced]=useState(false),[step,setStep]=useState('Gespeicherte Flüge werden geprüft …');
  const [loadStage,setLoadStage]=useState<LoadStage>('verify'),[loginPaused,setLoginPaused]=useState(false);
  const [,wakeSource]=useState(0);
  const [flightSaved,setFlightSaved]=useState<number|null>(null),[completed,setCompleted]=useState<FlightLoadResult|null>(null);
  const interruption=useRef<'background'|'cancelled'|'timeout'|null>(null);
  const jobVerification=useRef<{previous:typeof c.connection;resolve:()=>void;reject:(error:Error)=>void}|null>(null);
  const initialUpdate = useRef(false), automatic = useRef(false), returnedResult=useRef(false), stopRemainingJobs=useRef(false);
  const panelActive=useRef(open);panelActive.current=open;
  const [entryReady,setEntryReady]=useState(false);
  // Legacy connect requests share the complete sync journey; connection proof
  // is never an intermediate user destination.
  const syncEntry=intent==='update'||intent==='connect';
  useEffect(()=>{if(!onStatus)return;onStatus({activity:{storeId:lease.storeId,accountRef:c.activityScope?.context.accountNumber??null,changed:activityChanged},loginVisible:c.visible,ownerId:lease.ownerId,connection:c.connection,browserActive:c.browserActive,clearing:c.clearing,binding:c.binding,busy:c.busy,loginBusy:c.loginBusy,disconnecting:c.disconnecting,saving:c.saving,recovery:c.recovery,restoring:{current:c.restoring.current}});},[onStatus,lease.ownerId,activityChanged,c.activityScope,c.visible,c.connection,c.browserActive,c.clearing,c.binding,c.busy,c.loginBusy,c.disconnecting,c.saving,c.recovery,c.restoring.current]);
  useEffect(()=>{
    if(!open||!syncEntry)return;
    onProgress?.(syncProgress);
  },[syncProgress,onProgress,open,syncEntry]);
  const scope=useMemo<RealFlightNativeScope>(()=>({registry,lease,authorize:()=>alive.current ? {ownerId:lease.ownerId,storeId:lease.storeId,leaseId:lease.leaseId,writable:foreground.current&&panelActive.current} : null}),[registry,lease]);
  function finishSource(error?:Error,source?:RealFlightSourceInput) {
    const pending=waiting.current;if(!pending)return;waiting.current=null;if(pending.timer)clearTimeout(pending.timer);pending.signal.removeEventListener('abort',pending.abort);
    if(error)pending.reject(error);else if(source)pending.resolve(source);
  }
  const service=useMemo(()=>new RealFlightService(lease.ownerId,lease.storeId,lease.leaseId,{
    authorize:scope.authorize,hash,uuid:Crypto.randomUUID,now:()=>new Date().toISOString(),
    repository:async()=>{
      const journal=await openRealFlightSelection(scope);if(!journal)throw new Error('No selected own-flight library.');
      try {
        const selected=await journal.select();return {library:selected.candidate,writable:!selected.recoveryRequired,warning:selected.warning,
          close:async()=>{await selected.candidate.close();await journal.close();}};
      } catch(error){await journal.close();throw error;}
    },
    journal:async()=>{const journal=await openRealFlightCommandJournal(scope);if(!journal)throw new Error('Prepared-save journal unavailable.');return journal;},
    retrieve:async(request,signal)=>new Promise((resolve,reject)=>{
      if(!providerEntryAllowed||waiting.current||signal.aborted){reject(new Error('Source request unavailable.'));return;}
      let pending:WaitingSource|null=null;
      const abort=()=>{
        if(!pending)return;pending.suppressReview=true;
        const current=controller.current,state=current.retrieval.current.state;
        if(shouldDeferCoreFlightSourceRejection(state.phase,current.saving,current.restoring.current))return;
        if(state.phase==='loading')current.cancelRetrieval();
        finishSource(new Error('Source request cancelled.'));
      };
      // Interactive sign-in has no flight-response deadline. The controller's
      // bounded profile checks still time out; start the outer timer at retrieval.
      pending={request,resolve,reject,started:false,checking:false,seenBusy:false,paused:false,resumeRequired:false,suppressReview:false,generation:reviewGeneration.current,timer:null,signal,abort};
      waiting.current=pending;signal.addEventListener('abort',abort,{once:true});
      controller.current.setFrom(request.from);controller.current.setTo(request.to);setProviderOpen(true);
      wakeSource(value=>value+1);
      if(!automatic.current&&!controller.current.browserActive)controller.current.connect();
    }),
  }),[lease,scope,providerEntryAllowed]);
  function abandonSource(reason:string) {
    const verification=jobVerification.current;jobVerification.current=null;verification?.reject(new Error('Verification cancelled.'));
    diagnosis.current?.finish('cancelled','cancelled');
    controller.current.endGuidedFlightConnection();
    const pending=waiting.current,current=controller.current,state=current.retrieval.current.state;
    if(pending)pending.suppressReview=true;
    const defer=pending&&shouldDeferCoreFlightSourceRejection(state.phase,current.saving,current.restoring.current);
    service.cancelReview();
    if(pending&&waiting.current===pending&&!defer){if(state.phase==='loading')current.cancelRetrieval();finishSource(new Error(reason));}
  }
  async function refreshRestorePreparations() {
    let selection: Awaited<ReturnType<typeof openRealFlightSelection>> = null;
    try {
      selection=await openRealFlightSelection(scope,false);
      if(!selection)throw new Error('Restore journal unavailable.');
      const preparations=await selection.listRestorePreparations();
      diagnosis.current?.note('restore',preparations.some(p=>p.status!=='activated')?'pending':'ready');
      if(alive.current){setRestorePreparations(preparations);setRestoreReadWarning(null);}
    } catch {
      diagnosis.current?.note('restore','failed');
      if(alive.current)setRestoreReadWarning('Der Status vorbereiteter Wiederherstellungen konnte nicht gelesen werden. Vorherige Hinweise bleiben erhalten.');
    } finally {
      try { await selection?.close(); }
      catch { if(alive.current)setRestoreReadWarning('Der Status vorbereiteter Wiederherstellungen konnte nicht sicher geschlossen werden. Vorherige Hinweise bleiben erhalten.'); }
    }
  }
  async function refresh() {
    const initial=takeInitialRepository();
    try {
    // Keep restore recovery discoverable even when opening the selected graph fails.
    await timeFlightStage('restore-inspection',refreshRestorePreparations);
    const {snapshot:next,flights:rows}=await timeFlightStage('stored-view',()=>service.readStored(initial??undefined)),
      pending=await timeFlightStage('receipt-recovery',()=>syncEntry?service.prepareFreshFetch():service.recoverPending());
    diagnosis.current?.note('library',next.recovery.readOnly?'read-only':'ready');diagnosis.current?.note('save',pending.status==='none'?'ready':pending.status==='committed'?'receipt-confirmed':'pending');
    if(alive.current){setSnapshot(next);setFlights(rows);setRecovery(pending);setPage(current=>Math.min(current,Math.max(0,Math.ceil(rows.length/5)-1)));}
    return rows.length;
    } finally { await initial?.close(); }
  }
  async function prepareSourceReview(next:RealFlightReview) {
    const selected=controller.current.connection;
    if(next.state==='confirm-account'&&selected.confirmed&&selected.observed?.accountNumber===next.accountRef){
      // The provider panel's explicit account confirmation applies to this
      // fresh owner. Persist that binding; flights still require reviewed save.
      next=await service.confirmAccount(next);await refresh();
    }
    return next;
  }
  async function finishReview(next:RealFlightReview) {
    if(!automatic.current){setReview(await prepareSourceReview(next));return;}
    await finishAutomaticLoad(()=>saveFlightReview(next));
  }
  async function saveFlightReview(next:RealFlightReview) {
    const selected=controller.current.connection;
    const captured=controller.current.completedFlightSource;
    const verified=selected.confirmed&&selected.observed?selected.observed:
      captured&&handledCapture.current===next.source.capture.captureId&&captured.capture.captureId===next.source.capture.captureId&&selected.phase!=='mismatch'?captured.contextAfter:null;
    if(!verified||!foreground.current)throw new Error('Fresh account verification required.');
    diagnosis.current?.note('provider','account-verified');diagnosis.current?.note('save','pending');
    finishStage('flights');startStage('save');setLoadStage('save');setStep('Flüge werden gespeichert …');
    const result=await service.saveVerifiedReview(next,verified);
    diagnosis.current?.note('save','receipt-confirmed');
    const total=await timeFlightStage('return-readback',refresh);setFlightSaved(total);finishStage('save');
    if (next.source.capture.coverage === 'complete-requested-list') await acknowledgeActivity({source:'flights',capturedAt:Date.parse(next.source.capture.retrievedAt),
      committedAt:Date.now(),window:next.source.requestedWindow,participation:next.source.requestedWindow.participation});
    return {result,source:next};
  }
  async function finishAutomaticLoad(flights:()=>ReturnType<typeof saveFlightReview>) {
    const active=()=>alive.current&&foreground.current&&panelActive.current&&!stopRemainingJobs.current;
    const completed=await runAccountRetrievalJobs({flights,active,
      otherData:()=>retrieveOtherAccountData({active,medical:()=>syncStage('medical',()=>timeFlightStage('medical',()=>controller.current.retrieveMedical())),
        duties:()=>{setStep('Flüge gespeichert. Dienste werden geladen …');
          const account=controller.current.connection.observed?.accountNumber;
          if(!account)return Promise.reject(new Error('Verified duty account unavailable'));
          return syncStage('duties',()=>timeFlightStage('duties',()=>refreshDuties(account,active)));},
        events:()=>{setStep('Termine werden geladen …');return syncStage('events',()=>controller.current.retrieveFeatureInformation('events'));},
        documentNotices:()=>{setStep('Dokumenthinweise werden geladen …');return syncStage('documents',()=>controller.current.retrieveFeatureInformation('document-notices'));},
        workSummary:()=>{setStep('Arbeitsstunden · Jahresübersicht wird geladen …');return syncStage('work-summary',()=>controller.current.retrieveFeatureInformation('work-summary'));},
        workHours:()=>{setStep('Erfasste Arbeitsstunden werden geladen …');return syncStage('work-hours',()=>controller.current.retrieveFeatureInformation('work-hours'));},
        tasks:()=>{setStep('Eigene Aufgaben werden geladen …');return syncStage('tasks',()=>controller.current.retrieveFeatureInformation('tasks'));},
      }),
      stage:stage=>{if(stage==='other-data'){setLoadStage('medical');setStep('Flüge gespeichert. Medical wird geladen …');}},
    });
    const {result,source:next}=completed.flights;
    const verified=controller.current.connection;
    const optionalSourceStatuses=[completed.otherData.medical,completed.otherData.duties,completed.otherData.events,completed.otherData.documentNotices,completed.otherData.workSummary,completed.otherData.workHours,completed.otherData.tasks];
    const optionalSourceIncomplete=optionalSourceStatuses.some(status=>status==='failed'||status==='skipped');
    diagnosis.current?.finish(optionalSourceIncomplete?'partial':'success',completed.otherData.medical==='failed'?'medical-failed':completed.otherData.medical==='skipped'?'medical-skipped':completed.otherData.duties==='failed'?'duties-failed':completed.otherData.duties==='skipped'?'duties-skipped':completed.otherData.events==='failed'||completed.otherData.documentNotices==='failed'||completed.otherData.workSummary==='failed'||completed.otherData.workHours==='failed'||completed.otherData.tasks==='failed'?'operation-failed':'none');
    if(alive.current){setLoadStage('done');setStep('Fertig.');setCompleted({ownerId:lease.ownerId,storeId:lease.storeId,accountRef:next.accountRef,completedAt:new Date().toISOString(),added:result.counts.added,changed:result.counts.changed,pending:result.counts.pending,
      from:next.source.requestedWindow.from,to:next.source.requestedWindow.to,
      verifiedConnection:foreground.current&&!stopRemainingJobs.current&&verified.confirmed?{ownerId:lease.ownerId,state:verified}:undefined,medicalStatus:completed.otherData.medical,dutyStatus:completed.otherData.duties,eventsStatus:completed.otherData.events,documentNoticesStatus:completed.otherData.documentNotices,workSummaryStatus:completed.otherData.workSummary,workHoursStatus:completed.otherData.workHours,tasksStatus:completed.otherData.tasks,cleanupPending:controller.current.recovery});}
  }
  function retryOtherJob(job:'medical'|'duties') {
    if(lock.current||!foreground.current||!panelActive.current||!c.viewReady||c.recovery)return;
    setStep('Anmeldung wird vor dem erneuten Abruf geprüft …');
    void run(async()=>{
      try {
        await new Promise<void>((resolve,reject)=>{
          jobVerification.current={previous:controller.current.connection,resolve,reject};
          if(!controller.current.checkConnection('check')){jobVerification.current=null;reject(new Error('Verification unavailable.'));}
        });
        const current=controller.current;
        if(!foreground.current||!current.connection.confirmed)throw new Error('Fresh account proof required.');
        setLoadStage('medical');setStep(job==='medical'?'Medical wird erneut geladen …':'Dienste werden erneut geladen …');
        if(job==='medical'){
          const capture=await timeFlightStage('medical',()=>current.retrieveMedical());
          setCompleted(previous=>previous?{...previous,medicalStatus:capture.rows.length?'updated':'empty'}:previous);
        }else{
          const account=current.connection.observed?.accountNumber;
          if(!account)throw new Error('Verified duty account unavailable.');
          await timeFlightStage('duties',()=>refreshDuties(account,()=>alive.current&&foreground.current&&panelActive.current));
          setCompleted(previous=>previous?{...previous,dutyStatus:'partial'}:previous);
        }
        setMessage('');
      }catch{
        if(!alive.current)return;
        setCompleted(previous=>previous?{...previous,...(job==='medical'?{medicalStatus:'failed' as const}:{dutyStatus:'failed' as const})}:previous);
        diagnosis.current?.finish('partial',job==='medical'?'medical-failed':'duties-failed');
        setMessage('Erneuter Abruf nicht abgeschlossen. Gespeicherte Flüge und frühere Angaben bleiben erhalten.');
      }
    },'update-flights');
  }
  useEffect(()=>{
    const pending=jobVerification.current;
    if(!pending||c.connection===pending.previous||c.connection.phase==='checking')return;
    jobVerification.current=null;
    if(c.connection.confirmed)pending.resolve();else pending.reject(new Error('Account proof unavailable.'));
  },[c.connection]);
  function loadFlights() {
    if(!providerEntryAllowed)return;
    if(lock.current)return;
    if(!foreground.current)return;
    setSyncProgress(previous=>({state:'active',last:previous.last,current:'account'}));automatic.current=true;returnedResult.current=false;stopRemainingJobs.current=false;interruption.current=null;setCompleted(null);setFlightSaved(null);setLoginPaused(false);setLoadStage('verify');setProviderOpen(true);setStep('Anmeldung wird geprüft …');
    void run(()=>finishAutomaticLoad(async()=>saveFlightReview(await service.retrieveUpdate())),'update-flights');
  }
  async function run(work:()=>Promise<unknown>, action:DiagnosticAction='library-operation', initial=false,isCurrent:()=>boolean=()=>true) {
    if(lock.current||!alive.current)return;lock.current=true;setBusy(true);setFailed(false);setMessage('');
    if(!initial&&!diagnosis.current?.running())diagnosis.current=diagnosticJournal.begin(action);
    const operation=diagnosis.current;
    try{await work();if(isCurrent()&&(!initial||!startUpdate))operation?.finish('success');}catch(error){if(!isCurrent()){diagnosticJournal.record('sync','sync-preparation-superseded');return;}operation?.finish(error instanceof PendingRealFlightOperation?'blocked':'failed',error instanceof PendingRealFlightOperation?'recovery-required':controller.current.connection.phase==='mismatch'?'account-mismatch':'operation-failed');if(alive.current){
      setSyncProgress(previous=>({...previous,state:'failed',message:controller.current.connection.phase==='mismatch'?'Bitte mit dem bisherigen Vereinsflieger-Konto anmelden.':'Synchronisierung nicht abgeschlossen. Gespeicherte Daten bleiben verfügbar.'}));diagnosticJournal.record('sync','sync-failed');setFailed(true);setLoginPaused(false);
      setMessage(error instanceof PendingRealFlightOperation?'Der gespeicherte Auftrag muss zuerst über seinen Beleg geprüft werden. Kein neuer Auftrag wurde gestartet.':controller.current.connection.phase==='mismatch'?'Ein anderes Vereinsflieger-Konto oder ein anderer Verein ist angemeldet. Bitte melde dich mit dem bisherigen Konto an. Deine gespeicherten Flüge bleiben erhalten.':interruption.current==='background'?'Abruf unterbrochen, weil die App verlassen wurde. Bitte erneut versuchen. Gespeicherte Daten bleiben erhalten.':interruption.current==='cancelled'?'Vorgang abgebrochen. Gespeicherte Daten bleiben erhalten.':interruption.current==='timeout'?'Der Datenabruf hat zu lange gedauert. Bitte erneut versuchen. Gespeicherte Daten bleiben erhalten.':controller.current.connection.phase==='error'?'Die Anmeldung konnte nicht bestätigt werden. Bitte erneut versuchen. Gespeicherte Daten bleiben erhalten.':controller.current.result==='failed'?retrievalFailureHint(controller.current.status):'Dieser Schritt wurde nicht bestätigt. Bitte erneut versuchen. Gespeicherte Daten und Belege bleiben erhalten.');
      if(error instanceof PendingRealFlightOperation){try{await refresh();}catch{/* Keep the failure and original journal visible. */}}
    }}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;
    const subscription=AppState.addEventListener('change',state=>{
      foreground.current=state==='active';if(state!=='active'){
        setCompleted(current=>current?{...current,verifiedConnection:undefined}:null);
        const pending=waiting.current;
        if(automatic.current&&pending&&!pending.started&&!pending.seenBusy&&!controller.current.binding&&!controller.current.loginBusy&&!controller.current.informationBusy&&!controller.current.saving&&!controller.current.restoring.current){
          if(!pending.paused)pending.resumeRequired=pending.checking;
          pending.paused=true;pending.checking=false;pending.generation=++reviewGeneration.current;
          if(pending.timer)clearTimeout(pending.timer);pending.timer=null;
          setLoginPaused(true);setStep('Anmeldung pausiert. Nach der Rückkehr wird sicher fortgesetzt.');return;
        }
        if(lock.current)interruption.current='background';
        diagnosis.current?.finish('cancelled','background');
        reviewGeneration.current++;
        const retrieval=controller.current.retrieval.current.state;if(retrieval.phase!=='idle')invalidatedRetrievals.current.add(retrieval.nonce);
        directAdmission.current=null;abandonSource('App left foreground.');setReview(null);
      }else if(waiting.current?.paused){setLoginPaused(false);setStep('Anmeldung wird nach der Rückkehr geprüft …');}
    });
    return()=>{
      alive.current=false;const verification=jobVerification.current;jobVerification.current=null;verification?.reject(new Error('Owner closed.'));const pending=waiting.current;if(pending)pending.suppressReview=true;service.dispose();
      const current=controller.current,state=current.retrieval.current.state;
      if(waiting.current&& !shouldDeferCoreFlightSourceRejection(state.phase,current.saving,current.restoring.current))finishSource(new Error('Library closed.'));
      subscription.remove();
    };
  },[service]);
  const entryPreparation=useRef<{started:boolean;current:boolean;deferred:boolean}|null>(null);
  useEffect(()=>{
    const preparation={started:false,current:true,deferred:false};entryPreparation.current=preparation;
    initialUpdate.current=false;if(open&&syncEntry){startStage('prepare');controller.current.setEditingLogin?.(false);}setEntryReady(false);automatic.current=false;setCompleted(null);setFlightSaved(null);setFailed(false);setMessage('');
    setProviderOpen(providerEntryAllowed&&open&&intent!=='options');
    if(!open){if(waiting.current)abandonSource('Sync surface closed.');return;}
    return()=>{preparation.current=false;};
  },[open,requestId,service]);
  useEffect(()=>{
    const preparation=entryPreparation.current;
    if(!open||!preparation?.current||preparation.started)return;
    if(busy||lock.current){if(!preparation.deferred){preparation.deferred=true;diagnosticJournal.record('sync','sync-preparation-deferred');}return;}
    preparation.started=true;
    const current=()=>preparation.current&&entryPreparation.current===preparation;
    void run(async()=>{
      await controller.current.cancelActivity();if(!current())return;
      if(controller.current.viewReadFailed)await controller.current.refreshRecovery();
      await Promise.allSettled([...activityWrites.current]);if(!current())return;
      await refresh();if(current())setEntryReady(true);
    },'library-operation',true,current);
  },[open,requestId,service,busy]);
  useEffect(()=>{
    if(!open||!syncEntry||!c.viewReadFailed)return;
    diagnosticJournal.record('sync','sync-block-view');diagnosis.current?.note('view','failed');diagnosis.current?.finish('blocked','recovery-required');
    setSyncProgress(previous=>({...previous,state:'failed',message:'Anbieterstatus konnte nicht sicher gelesen werden. Gespeicherte Daten bleiben erhalten.'}));
  },[open,syncEntry,c.viewReadFailed]);
  useEffect(()=>{
    if(!providerEntryAllowed||!open||!entryReady||initialUpdate.current||busy||!snapshot||!c.viewReady)return;
    initialUpdate.current=true;
    if(!syncEntry)return;
    if(snapshot.recovery.readOnly||recovery.status==='recovery-required'){
      const reason=snapshot.recovery.readOnly?'sync-block-library':'sync-block-save';
      diagnosticJournal.record('sync',reason);diagnosis.current?.finish('blocked','recovery-required');
      setSyncProgress(previous=>({...previous,state:'failed',message:snapshot.recovery.readOnly?'Lokale Daten benötigen eine Prüfung in den Einstellungen. Vorhandene Daten bleiben erhalten.':'Eine begonnene Sicherung oder Speicherung muss in den Einstellungen geprüft werden.'}));return;
    }
    finishStage('prepare');
    loadFlights();
  },[open,entryReady,intent,requestId,busy,snapshot,c.viewReady,restoreReadWarning,restorePreparations,recovery]);
  useEffect(()=>{
    const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(!panelActive.current)return false;
      diagnosticJournal.record('back',providerOpen?'provider-options':'own-flight-tools');
      if(completed){close(completed);return true;}
      if(providerOpen&&waiting.current){
        if(!canCancelCoreFlightSource(controller.current.retrieval.current.state.phase,controller.current.saving,controller.current.restoring.current))return true;
        if(controller.current.visible&&controller.current.backWithinProvider())return true;
        interruption.current='cancelled';abandonSource('Source closed.');controller.current.dismissLogin();if(!automatic.current)setProviderOpen(false);return true;
      }
      if(lock.current||controller.current.busy)return true;
      if(providerOpen){
        if(controller.current.visible&&controller.current.backWithinProvider())return true;
        controller.current.dismissLogin();setProviderOpen(false);abandonSource('Source closed.');if(intent==='connect')close();return true;
      }
      if(detail){setDetail(null);return true;}
      if(review){service.cancelReview();setReview(null);return true;}
      close(completed??undefined);return true;
    });return()=>subscription.remove();
  },[service,providerOpen,detail,review,close,completed,intent]);
  useEffect(()=>{
    const pending=waiting.current;
    if(!pending){
      if(!panelActive.current)return;
      const retrieval=c.retrieval.current.state;
      if(retrieval.phase==='loading'&&foreground.current&&!invalidatedRetrievals.current.has(retrieval.nonce)){
        if(directAdmission.current?.nonce!==retrieval.nonce)directAdmission.current={nonce:retrieval.nonce,generation:reviewGeneration.current,
          previousCaptureId:c.completedFlightSource?.capture.captureId??null};
      }
      if(retrieval.phase==='idle'&&['failed','cancelled'].includes(c.result))directAdmission.current=null;
      const input=c.completedFlightSource;
      if(input&&mayReviewCoreFlightCapture({admission:directAdmission.current,generation:reviewGeneration.current,foreground:foreground.current,
        retrievalPhase:retrieval.phase,saving:c.saving,restoring:c.restoring.current,busy:c.busy,recovery:c.recovery,
        captureId:input.capture.captureId,handledCaptureId:handledCapture.current})){
        handledCapture.current=input.capture.captureId;directAdmission.current=null;
        void run(async()=>{await finishReview(await service.reviewSource(input));setReviewRow(null);setProviderOpen(false);});
      }
      return;
    }
    if(!foreground.current)return;
    if(pending.paused){
      if(!c.viewReady||c.busy||c.binding||c.loginBusy)return;
      if(pending.resumeRequired&&!c.resumeGuidedFlightConnection()){
        interruption.current='background';abandonSource('Sign-in could not resume safely.');return;
      }
      pending.paused=false;pending.checking=pending.resumeRequired;setLoginPaused(false);
      setStep(c.visible?'Bitte bei Vereinsflieger anmelden. Danach geht es automatisch weiter.':'Anmeldung wird geprüft …');
      if(pending.checking)return;
    }
    if(pending.suppressReview&&!c.busy&&!c.saving&&!c.restoring.current){finishSource(new Error('Source review cancelled.'));return;}
    if(automatic.current&&!pending.checking&&c.viewReady&&c.from===pending.request.from&&c.to===pending.request.to){
      pending.checking=true;c.beginFreshFlightConnection();return;
    }
    if(automatic.current&&pending.checking&&['error','mismatch'].includes(c.connection.phase)){
      diagnosis.current?.finish('blocked',c.connection.phase==='mismatch'?'account-mismatch':'account-verification');
      abandonSource('Provider account could not be verified.');return;
    }
    // A fresh scoped attempt handles previous provider-view evidence after matching proof.
    // beginGuidedFlightConnection clears the previous result before returning.
    // A native login-page failure can finish before retrieval ever becomes busy.
    if(automatic.current&&pending.checking&&!pending.started&&!c.busy&&!c.binding&&!c.loginBusy&&c.result==='failed'){
      diagnosis.current?.finish('failed','source-failed');abandonSource('Provider login did not complete.');return;
    }
    if(automatic.current&&!pending.started){startStage(c.visible?'sign-in':'account');setLoadStage(c.visible?'sign-in':'verify');setStep(c.visible?'Bitte bei Vereinsflieger anmelden. Danach geht es automatisch weiter.':'Anmeldung wird geprüft …');}
    if(!pending.started&&c.from===pending.request.from&&c.to===pending.request.to&&c.connection.phase==='observed'&&c.connection.confirmed&&c.viewReady&&!c.recovery&&!c.busy&&!c.visible&&!c.binding&&!c.loginBusy&&!c.saving&&!c.restoring.current){
      if(!c.checkConnection('retrieve'))return;
      finishStage(c.visible?'sign-in':'account');startStage('flights');pending.started=true;setLoadStage('flights');setStep('Flüge werden geladen …');
      pending.timer=setTimeout(()=>{interruption.current='timeout';diagnosis.current?.finish('failed','source-timeout');abandonSource('Source request timed out; saved history remains.');},180_000);
    }
    if(c.busy)pending.seenBusy=true;
    if(pending.started&&pending.seenBusy&&!c.busy&&c.completedFlightSource){
      diagnosis.current?.note('view',c.recovery?'pending':'ready');
      if(pending.suppressReview||!foreground.current||pending.generation!==reviewGeneration.current){service.cancelReview();finishSource(new Error('Source review cancelled.'));}
      else {handledCapture.current=c.completedFlightSource.capture.captureId;if(!automatic.current)setProviderOpen(false);setReviewRow(null);finishSource(undefined,c.completedFlightSource);}
    }
    else if(pending.seenBusy&&!c.busy&&['failed','cancelled'].includes(c.result)){diagnosis.current?.finish(c.result==='cancelled'?'cancelled':'failed',c.result==='cancelled'?'cancelled':'source-failed');finishSource(new Error('Source retrieval did not complete.'));}
  },[c]);
  useEffect(()=>{
    if(!automatic.current||!completed||returnedResult.current||!open||!foreground.current||busy||c.busy||c.saving||c.restoring.current||c.informationSaving)return;
    returnedResult.current=true;
    const incomplete=[completed.medicalStatus,completed.dutyStatus,completed.eventsStatus,completed.documentNoticesStatus,completed.workSummaryStatus,completed.workHoursStatus,completed.tasksStatus].some(status=>status==='failed'||status==='skipped')||completed.pending>0||c.recovery;
    setSyncProgress(incomplete?{state:'partial',last:'save',current:null,message:'Teilweise synchronisiert. Gespeicherte Daten bleiben verfügbar.'}:idleSyncProgress);
    diagnosticJournal.record('sync',incomplete?'sync-partial':'sync-success');close(completed);
  },[completed,open,busy,c.busy,c.saving,c.restoring.current,c.informationSaving,c.recovery,close]);
  function cancelSync(){
    interruption.current='cancelled';stopRemainingJobs.current=true;diagnosticJournal.record('sync','sync-cancelled');
    if(waiting.current){abandonSource('Cancelled.');controller.current.dismissLogin();}
    else if(controller.current.informationBusy&&!controller.current.informationSaving)controller.current.stopInformation();
    else if(!busy)close(completed??undefined);
  }
  useEffect(()=>{
    if(!open||!syncEntry){onControls?.(null);return;}
    onControls?.({cancel:cancelSync,canCancel:!c.saving&&!c.restoring.current&&!c.informationSaving&&loadStage!=='save'});
    return()=>onControls?.(null);
  },[open,syncEntry,onControls,c.saving,c.restoring.current,c.informationSaving,loadStage,busy,completed]);
  const gate=async()=>{if(!alive.current)throw new Error('Library closed.');await registry.assertCurrent(lease);};
  async function showRestoreResult(result:RestoreRealFlightBackupResult) {
    if(result.state==='restored'){
      service.cancelReview();setReview(null);
      try{await refresh();}catch{if(alive.current)setFailed(true);}
      if(alive.current)setMessage(result.warning??'Geprüfte Sicherung in einer neuen Datei aktiviert. Vorherige Dateien bleiben erhalten.');
      return;
    }
    if(result.state==='already-activated'){
      service.cancelReview();setReview(null);
      try{await refresh();}catch{if(alive.current)setFailed(true);}
      if(alive.current)setMessage('Diese vorbereitete Sicherung ist bereits aktiviert.');
      return;
    }
    if(result.state==='recovery-required'){
      await refreshRestorePreparations();
      if(alive.current)setMessage(result.reason==='stale-predecessor'
        ? 'Die vorbereitete Wiederherstellung hat einen veralteten Vorgänger. Dateien bleiben zur Prüfung erhalten; eine automatische Aktivierung ist gesperrt.'
        : 'Die Wiederherstellung ist vorbereitet, aber noch nicht vollständig bestätigt. Sie bleibt für eine ausdrückliche Fortsetzung erhalten.');
      return;
    }
    if(alive.current)setMessage('Dateiauswahl abgebrochen.');
  }
  const coverage=snapshot?.coverage.at(-1)?.coverage;
  const retrievalPlan=planFlightRetrieval(snapshot?.savedRetrievals??[]);
  const freshness=dataFreshness(retrievalPlan.lastSuccessfulRetrievalAt,snapshot?'ready':'loading');
  const unresolvedRestores=restorePreparations.filter(preparation=>preparation.status!=='activated');
  const restoreReadOnly=snapshot===null||snapshot.recovery.readOnly||restoreReadWarning!==null||unresolvedRestores.length>0;
  const pastLogin=['flights','save','medical','done'].includes(loadStage);
  const partial=completed&&(completed.medicalStatus==='failed'||completed.medicalStatus==='skipped'||completed.dutyStatus==='failed'||completed.dutyStatus==='skipped'||completed.eventsStatus==='failed'||completed.eventsStatus==='skipped'||completed.documentNoticesStatus==='failed'||completed.documentNoticesStatus==='skipped'||completed.workSummaryStatus==='failed'||completed.workSummaryStatus==='skipped'||completed.workHoursStatus==='failed'||completed.workHoursStatus==='skipped'||completed.tasksStatus==='failed'||completed.tasksStatus==='skipped'||completed.pending>0);
  const medicalResult=completed?.medicalStatus==='updated'?'Medical-Angaben geladen.':completed?.medicalStatus==='empty'?'Keine Medical-Angaben gefunden.':completed?.medicalStatus==='skipped'?'Medical nicht abgeschlossen. Gespeicherte Angaben bleiben erhalten.':'Medical konnte nicht geladen werden. Gespeicherte Angaben bleiben erhalten.';
  const blockedSync=entryReady&&(restoreReadOnly||c.recovery||recovery.status==='not-committed'||recovery.status==='recovery-required');
  // Stay in the sync frame while local reads and recovery checks run. The old
  // generic provider panel exposed manual verification before automatic became true.
  const preparationProgress=syncEntry?<Card>
    <Section title="Daten synchronisieren" icon="refresh"/>
    <Label>{blockedSync?'Eine Wiederherstellung muss zuerst abgeschlossen werden. Gespeicherte Daten bleiben erhalten.':failed?message:'Synchronisierung wird vorbereitet …'}</Label>
    {!blockedSync&&!failed&&<ActivityIndicator color={colors.cyan}/>}
    {blockedSync&&<Action secondary onPress={()=>setProviderOpen(false)}>Wiederherstellung ansehen</Action>}
    {failed&&!blockedSync&&<Action disabled={busy} onPress={()=>void run(async()=>{await refresh();setEntryReady(true);})}>Erneut versuchen</Action>}
  </Card>:undefined;
  const progress=automatic.current&&c.visible&&!failed?<Card><Label>{loginPaused?'Anmeldung pausiert. Nach der Rückkehr geht es weiter.':'Bitte anmelden. Danach werden alle unterstützten Daten automatisch synchronisiert.'}</Label></Card>:automatic.current?<Card>
    <Section title={completed ? partial ? 'Teilweise abgeschlossen.' : 'Fertig.' : failed ? 'Datenabruf nicht abgeschlossen' : 'Deine Daten werden geladen'} icon="chain"/>
    <View accessibilityLiveRegion="polite">
      <Label>{pastLogin?'✓ Anmeldung geprüft':loadStage==='sign-in'?'→ Anmeldung erforderlich':'→ Anmeldung prüfen'}</Label>
      <Label>{flightSaved!==null?`✓ ${flightSaved} Flüge auf diesem Gerät gespeichert`:loadStage==='save'?'→ Flüge speichern':loadStage==='flights'?'→ Flüge laden':'Flüge · ausstehend'}</Label>
      <Label>{completed?medicalResult:loadStage==='medical'?'→ Medical, Dienste und Vereinsangaben laden':'Medical, Dienste und Vereinsangaben · ausstehend'}</Label>
      {completed?.dutyStatus&&<Label>{completed.dutyStatus==='partial'?'Dienstquelle aktualisiert · Vollständigkeit ungeprüft.':completed.dutyStatus==='failed'?'Dienste konnten nicht aktualisiert werden. Gespeicherte Quelle bleibt erhalten.':'Dienste nicht abgeschlossen. Gespeicherte Quelle bleibt erhalten.'}</Label>}
      {completed?.eventsStatus&&<Label>{featureJobResult('Termine',completed.eventsStatus)}</Label>}
      {completed?.documentNoticesStatus&&<Label>{featureJobResult('Dokumenthinweise',completed.documentNoticesStatus)}</Label>}
      {completed?.workSummaryStatus&&<Label>{featureJobResult('Arbeitsstunden · Jahresübersicht',completed.workSummaryStatus)}</Label>}
      {completed?.workHoursStatus&&<Label>{featureJobResult('Erfasste Arbeitsstunden',completed.workHoursStatus)}</Label>}
      {completed?.tasksStatus&&<Label>{featureJobResult('Eigene Aufgaben',completed.tasksStatus)}</Label>}
      {!completed&&<Label muted>{failed?message:step}</Label>}
    </View>
    {busy&&!loginPaused&&loadStage!=='sign-in'&&<ActivityIndicator color={colors.cyan} accessibilityLabel={step}/>}
    {completed?<>
      <Label muted>{completed.added} neu · {completed.changed} geändert · {completed.pending} ungeklärt</Label>
      {!!message&&<Label muted>{message}</Label>}
      {['failed','skipped'].includes(completed.medicalStatus??'')&&<Action secondary disabled={busy||c.recovery} onPress={()=>retryOtherJob('medical')}>Nur Medical erneut laden</Action>}
      {['failed','skipped'].includes(completed.dutyStatus??'')&&<Action secondary disabled={busy||c.recovery} onPress={()=>retryOtherJob('duties')}>Nur Dienste erneut laden</Action>}
      <Action disabled={busy} onPress={()=>close(completed)}>{partial?'Zur Übersicht':'Fertig'}</Action>
    </>:failed?<>
      <Action disabled={busy||restoreReadOnly||c.recovery||recovery.status==='not-committed'||recovery.status==='recovery-required'} onPress={loadFlights}>Erneut versuchen</Action>
      {(restoreReadOnly||c.recovery||c.connection.phase==='mismatch'||recovery.status==='not-committed'||recovery.status==='recovery-required')&&<Action secondary disabled={busy} onPress={()=>{automatic.current=false;setProviderOpen(false);}}>Verbindung & Wiederherstellung prüfen</Action>}
    </>:<>
      {loginPaused&&<Label muted>Bitte zur App zurückkehren. Es wurde noch kein Flugabruf gestartet.</Label>}
      {busy&&c.informationBusy?<Action secondary disabled={c.informationSaving} onPress={()=>c.stopInformation()}>Diesen Abruf überspringen</Action>:waiting.current&&<Action secondary disabled={!canCancelCoreFlightSource(c.retrieval.current.state.phase,c.saving,c.restoring.current)} onPress={()=>{interruption.current='cancelled';abandonSource('Cancelled.');c.dismissLogin();}}>Abbrechen</Action>}
    </>}
  </Card>:undefined;
  return <SafeAreaView edges={dialogTop===undefined?undefined:[]} style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView style={{display:!open||providerOpen?'none':'flex'}} accessibilityElementsHidden={providerOpen} importantForAccessibility={providerOpen?'no-hide-descendants':'auto'} contentContainerStyle={{padding:12}}><View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title="Deine Flüge" icon="flight-paper-plane"/>
      {!syncEntry&&<ConnectionSettings controller={c} busy={busy}/>}
      <Action secondary disabled={busy||c.busy} onPress={()=>close(completed??undefined)}>Zur App zurück</Action>
      <Card><Label>{flights.length} gespeicherte eigene Flüge</Label><Label muted>{freshness.label}</Label>
        <Label muted>Bei Bedarf meldest du dich auf der Originalseite von Vereinsflieger an. Danach werden deine Flüge und Medical-Angaben automatisch auf diesem Gerät gespeichert und sind offline verfügbar.</Label>
        {busy ? <View accessibilityLiveRegion="polite"><Label>{step}</Label></View> : providerEntryAllowed?<Action disabled={restoreReadOnly||c.recovery||recovery.status==='not-committed'||recovery.status==='recovery-required'} onPress={loadFlights}>Daten synchronisieren</Action>:<Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label>}
        {waiting.current&&<Action secondary disabled={!canCancelCoreFlightSource(c.retrieval.current.state.phase,c.saving,c.restoring.current)} onPress={()=>{diagnosticJournal.record('action','cancel');abandonSource('Cancelled.');c.dismissLogin();setProviderOpen(false);}}>Abbrechen</Action>}
        {busy&&c.informationBusy&&<Action secondary disabled={c.informationSaving} onPress={()=>c.stopInformation()}>Diesen Abruf überspringen</Action>}
        <Action secondary disabled={busy} onPress={()=>setAdvanced(!advanced)}>{advanced ? 'Details schließen' : 'Details & weitere Optionen'}</Action>
      </Card>
      {advanced&&<><Card><Label>{flights.length} gespeicherte eigene Flüge · ohne Buchzuordnung</Label><Label muted>{snapshot?.account?'Vereinsflieger-Konto lokal verknüpft.':'Das eigene Anbieter-Konto wird nach dem ersten Abruf bestätigt.'}</Label>
        <Label muted>Originalwerte und Änderungen bleiben erhalten. Zeiten, Rollen und unbekannte Angaben werden nicht ergänzt. Keine Buchzuordnung, Statistik oder Papierfortschreibung.</Label>
        <Label muted>{coverage?.displayedWindow?`Letzter gespeicherter Zeitraum: ${coverage.displayedWindow.from} bis ${coverage.displayedWindow.to} · ${coverage.observedRecordCount} Datensätze.`:'Noch kein gespeicherter vollständiger Abrufzeitraum.'} Keine Aussage über die gesamte Fluggeschichte.</Label></Card>
      {snapshot&&<Card><Label>{freshness.label}</Label>
        <Label muted>{retrievalPlan.lastSavedAt?`In der Bibliothek gespeichert: ${new Date(retrievalPlan.lastSavedAt).toLocaleString('de-DE')}`:'Noch kein vollständiger Abruf in der Bibliothek gespeichert.'}</Label>
        {freshness.reminder&&<Label>{freshness.note}</Label>}
        {retrievalPlan.periods.map(period=><Label muted key={period.from}>Abgedeckt: {period.from} bis {period.to}</Label>)}
        {retrievalPlan.gaps.map(gap=><Label key={gap.from}>Lücke: {gap.from} bis {gap.to}</Label>)}
      </Card>}</>}
      {(busy||c.busy)&&<ActivityIndicator color={colors.cyan} accessibilityLabel="Flugbibliothek wird verarbeitet"/>}
      {failed&&snapshot===null&&<Card><Section title="Bibliothek nicht lesbar"/><Label>Die gespeicherte Auswahl konnte nicht geprüft werden. Abruf und Sicherung bleiben gesperrt. Du kannst eine geprüfte Sicherungsdatei ausdrücklich auswählen, um die Wiederherstellung zu versuchen; vorhandene Dateien bleiben erhalten.</Label></Card>}
      {c.recovery&&<Card><Section title="Anbieteransicht prüfen"/><Label>Ein früherer Abruf hat eine Wiederherstellung offen gelassen. Öffne „Daten“ in der Kopfzeile, bevor weitere Flüge geladen werden.</Label>{providerEntryAllowed&&<Action secondary disabled={busy} onPress={()=>{automatic.current=false;setProviderOpen(true);}}>Anbieteransicht prüfen</Action>}</Card>}
      {providerEntryAllowed&&failed&&c.connection.phase==='mismatch'&&<Action secondary disabled={busy} onPress={()=>{automatic.current=false;setProviderOpen(true);c.connect();}}>Mit bisherigem Konto anmelden</Action>}
      {snapshot?.recovery.readOnly&&<Card><Section title="Bibliothek nur lesbar"/><Label>Eine neuere oder abweichende gespeicherte Datei muss geprüft werden. Frühere Flüge bleiben lesbar; spätere Aufträge und Dateien werden erhalten. Neue Speicherung und Sicherung sind gesperrt.</Label></Card>}
      {(unresolvedRestores.length>0||restoreReadWarning!==null)&&<Card><Section title="Vorbereitete Wiederherstellung"/>
        {restoreReadWarning&&<Label>{restoreReadWarning}</Label>}
        {unresolvedRestores.map(preparation=><View key={preparation.operationId} style={{gap:8}}>
          <Label>{preparation.status==='pending'?'Eine Sicherungswiederherstellung wartet auf ausdrückliche Fortsetzung.':'Eine Sicherungswiederherstellung hat einen veralteten Vorgänger und bleibt zur Prüfung erhalten.'}</Label>
          <Label muted>Die Vorbereitung wird aus der ausgewählten Sicherung geprüft. Keine Aktivierung erfolgt beim Öffnen oder Aktualisieren.</Label>
          <Action secondary disabled={busy} onPress={()=>void run(async()=>{await showRestoreResult(await resumeRealFlightBackup(scope,preparation.operationId,gate));})}>
            {preparation.status==='pending'?'Vorbereitete Sicherung fortsetzen':'Veraltete Vorbereitung erneut prüfen'}
          </Action>
        </View>)}
      </Card>}
      {!!message&&<Card><Label>{message}</Label></Card>}
      {failed&&<Action secondary disabled={busy} onPress={()=>void run(refresh)}>Gespeicherte Bibliothek erneut prüfen</Action>}
      {recovery.status!=='none'&&<Card><Section title="Gespeicherten Auftrag prüfen"/><Label>{recovery.status==='committed'?'Der frühere Auftrag wurde gespeichert.':recovery.status==='not-committed'?'Für den ursprünglichen Auftrag ist noch kein gespeicherter Beleg vorhanden.':'Die Bibliothek benötigt eine Wiederherstellung. Spätere Dateien bleiben erhalten.'}</Label>
        <Action disabled={busy} onPress={()=>void run(async()=>{setRecovery(await service.recoverPending());await refresh();})}>Auftragsbeleg erneut prüfen</Action>
        {recovery.status==='not-committed'&&<Action disabled={busy} onPress={()=>void run(async()=>{await service.retryPending();await refresh();setMessage('Ursprünglicher Auftrag gespeichert.');})}>Ursprünglichen Auftrag erneut versuchen</Action>}
      </Card>}
      {providerEntryAllowed&&advanced&&<><Card><Section title="Eigene Flüge abrufen" icon="refresh"/><Label muted>Aktualisierung: {retrievalPlan.request.from} bis {retrievalPlan.request.to} einschließlich. Anmeldung und Quellenprüfung erfolgen auf der Originalseite.</Label>
        <Label muted>{retrievalPlan.firstRetrieval?'Beim ersten Abruf werden das Vorjahr und das laufende Jahr bis heute geladen.':'Die letzten sechs Monate werden erneut geprüft. Nach längerer Pause und bei bekannten Lücken wird der Zeitraum erweitert.'} Ältere Korrekturen können unentdeckt bleiben. Dafür einen eigenen Zeitraum wählen; gespeicherte ältere Flüge bleiben erhalten.</Label>
        <Action disabled={busy||restoreReadOnly||recovery.status==='not-committed'||recovery.status==='recovery-required'} onPress={()=>void run(async()=>{setReview(await prepareSourceReview(await service.retrieveUpdate()));})}>Daten aktualisieren</Action>
        <Action secondary disabled={busy||restoreReadOnly} onPress={()=>{automatic.current=false;c.setFrom(retrievalPlan.request.from);c.setTo(retrievalPlan.request.to);setProviderOpen(true);if(!c.browserActive)c.connect();}}>Anbieter und eigenen Zeitraum öffnen</Action>
        {waiting.current&&<Action secondary disabled={!canCancelCoreFlightSource(c.retrieval.current.state.phase,c.saving,c.restoring.current)}
          onPress={()=>{diagnosticJournal.record('action','cancel');abandonSource('Cancelled.');}}>Abruf abbrechen</Action>}
      </Card>
      </>}
      {review&&<Card><Section title="Abruf prüfen"/>
        <Label>{review.source.capture.rows.length} Quellzeilen · {review.source.requestedWindow.from} bis {review.source.requestedWindow.to}</Label>
        {review.source.capture.rows.length>0&&<><Action secondary disabled={busy} onPress={()=>setReviewRow(reviewRow===null?0:null)}>{reviewRow===null?'Quellzeilen vor dem Speichern prüfen':'Quellzeilen zuklappen'}</Action>
          {reviewRow!==null&&<><Label>Quellzeile {reviewRow+1} von {review.source.capture.rows.length}</Label>{review.source.capture.headers.map((header,index)=>header?<Label key={index}>{header}: {review.source.capture.rows[reviewRow]?.values[index]||'unbekannt / leer'}</Label>:null)}
            <View style={{flexDirection:'row',gap:8}}><Action secondary disabled={busy||reviewRow===0} onPress={()=>setReviewRow(reviewRow-1)}>Vorige Zeile</Action><Action secondary disabled={busy||reviewRow+1>=review.source.capture.rows.length} onPress={()=>setReviewRow(reviewRow+1)}>Nächste Zeile</Action></View>
          </>}
        </>}
        {review.state==='confirm-account'?<><Label>Ist dies dein Anbieter-Konto? Benutzernummer: {review.accountRef}</Label><Label>Vereinskontext: {review.source.contextAfter.clubLabel}</Label><Label muted>Verknüpft nur diese neue lokale Bibliothek. Alte Belege werden nicht übernommen; Flüge werden erst mit dem nächsten Speichern aufgenommen.</Label><Action disabled={busy} onPress={()=>void run(async()=>{setReview(await service.confirmAccount(review));await refresh();})}>Eigenes Konto für diese Bibliothek bestätigen</Action></>:
          <><Label>{review.plan.counts.added} neu · {review.plan.counts.changed} geändert · {review.plan.counts.unchanged} unverändert · {review.plan.counts.pending} ungeklärt</Label><Label muted>Die Aufnahme behält Quellbelege und frühere Fassungen. Ausgelassene oder leere Zeiträume löschen keine Flüge.</Label><Action disabled={busy} onPress={()=>void run(async()=>{const result=await service.saveUnassigned(review);setReview(null);await refresh();setMessage(`Gespeichert: ${result.counts.added} neu, ${result.counts.changed} geändert, ${result.counts.unchanged} unverändert.`);})}>Geprüfte Flüge ohne Buchzuordnung speichern</Action></>}
        <Action secondary disabled={busy} onPress={()=>{service.cancelReview();setReview(null);}}>Prüfung schließen</Action>
      </Card>}
      {advanced&&<><Card><Section title="Offline gespeicherte Flüge" icon="flight-paper-plane"/>
        {flights.length===0&&<Label>Noch keine eigenen Flüge gespeichert.</Label>}
        {flights.slice(page*5,page*5+5).map(flight=><Action key={flight.flightId} secondary disabled={busy} onPress={()=>void run(async()=>{setDetail(await service.detail(flight.flightId));})}>{flight.facts.assessment.date.value??'Datum unbekannt'} · Quellflug {flight.sourceFlightRef} · Fassung {flight.factsRevision}</Action>)}
        {flights.length>5&&<View style={{flexDirection:'row',gap:8}}><Action secondary disabled={busy||page===0} onPress={()=>setPage(page-1)}>Zurück</Action><Action secondary disabled={busy||(page+1)*5>=flights.length} onPress={()=>setPage(page+1)}>Weitere Flüge</Action></View>}
      </Card>
      {detail&&<Card><Section title={`Quellflug ${detail.sourceFlightRef}`}/><Label>{detail.factHistory.length} gespeicherte Fassung(en) · {detail.pending.length} ungeklärte Beobachtung(en)</Label>
        {detail.facts.assessment.observation.headers.map((header,index)=>header?<Label key={index}>{header}: {detail.facts.assessment.observation.row.values[index]||'unbekannt / leer'}</Label>:null)}
        <Action secondary onPress={()=>setDetail(null)}>Flugdetails schließen</Action>
      </Card>}</>}
      {(advanced||restoreReadOnly)&&<Card><Section title="Datensicherung" icon="book"/><Label muted>Enthält eigene Flüge und Belege, lokale Flugbücher und Profil sowie unterstützte eigene Vereinsflieger-Quellen einschließlich Medical. Unverschlüsselt. Anmeldungen, Dienstpläne mit anderen Personen und temporäre Dateien sind ausgeschlossen. Wiederherstellung nur für dieselbe lokale Kontozuordnung.</Label>
        <Action disabled={busy||restoreReadOnly||!!userRestoreId} onPress={()=>void run(async()=>{const result=await saveUserBackupToFolder(scope,service,gate);setMessage(result.state==='saved'?'Datensicherung gespeichert und zurückgelesen.':'Ordnerauswahl abgebrochen.');})}>Daten in Geräteordner sichern</Action>
        <Action secondary disabled={busy} onPress={()=>void run(async()=>{
          try {
            const result=await restoreUserBackupFromPickerNative(scope,gate,userRestoreId??undefined);
            if(result.state==='recovery-required'){setUserRestoreId(result.operationId);setSnapshot(null);setFlights([]);setMessage('Bitte dieselbe Datei erneut auswählen, um die Wiederherstellung abzuschließen.');}
            else if(result.state==='cancelled')setMessage('Dateiauswahl abgebrochen.');
            else {setUserRestoreId(null);service.cancelReview();setReview(null);await refresh();setMessage('Datensicherung geprüft und aktiviert. Vorherige Dateien bleiben erhalten.');}
          } finally {
            const pending=await getPendingUserBackupRestoreNative(scope);if(pending){setUserRestoreId(pending.operationId);setSnapshot(null);setFlights([]);}
          }
        })}>{userRestoreId?'Datensicherung fortsetzen':'Datensicherung wiederherstellen'}</Action>
      </Card>}
      {(advanced||restoreReadOnly)&&!userRestoreId&&<Card><Section title="Ältere Flugbibliothek-Sicherung" icon="book"/><Label muted>Dieses ältere Format enthält nur eigene gespeicherte Flüge, Originalbelege, Fassungen und Importbelege. Unverschlüsselt. Andere Daten sind nicht enthalten.</Label>
        <Action disabled={busy||restoreReadOnly} onPress={()=>void run(async()=>{const result=await saveRealFlightBackupToFolder(service,gate);setMessage(result.state==='saved'?'Sicherung im gewählten Ordner gespeichert und zurückgelesen.':'Ordnerauswahl abgebrochen.');})}>Flugbibliothek in Geräteordner sichern</Action>
        <Action secondary disabled={busy} onPress={()=>void run(async()=>{await showRestoreResult(await restoreRealFlightBackup(scope,gate));})}>Sicherung dieser Bibliothek wiederherstellen</Action>
      </Card>}
    </View></ScrollView>
    {/* Android's credential dialogs pause the app. Keep their original login target visible;
        foreground guards still suspend verification, retrieval and writes until return. */}
    <ProviderConnection minimal={syncEntry} dialogTop={dialogTop} developmentRecoveryCheckpoints={developmentRecoveryCheckpoints} controller={c} open={providerEntryAllowed&&open&&providerOpen} development={intent==='development'} guided={syncEntry||automatic.current} title={syncEntry?'Daten synchronisieren':undefined} progress={progress??preparationProgress} closeDisabled={automatic.current&&busy&&(loadStage==='save'||c.saving||c.restoring.current)} purpose="own-flight-library" close={()=>{
      if(automatic.current){
        if(waiting.current){interruption.current='cancelled';abandonSource('Source closed.');c.dismissLogin();return;}
        if(busy){
          if(jobVerification.current){const pending=jobVerification.current;jobVerification.current=null;pending.reject(new Error('Verification cancelled.'));c.dismissLogin();}
          else if(loadStage==='medical'){
            // Close cancels the remaining package; the explicit skip action above
            // still affects only its current source. Never interrupt a local save.
            stopRemainingJobs.current=true;
            if(c.informationBusy&&!c.informationSaving)c.stopInformation();
          }
          return;
        }
        close(completed??undefined);return;
      }
      c.endGuidedFlightConnection();setProviderOpen(false);if(waiting.current)abandonSource('Source closed.');if(intent==='connect'||intent==='development')close();
    }}/>
  </SafeAreaView>;
}

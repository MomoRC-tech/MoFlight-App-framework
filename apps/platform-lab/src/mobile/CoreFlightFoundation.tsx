import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { hash } from '../storage';
import { timeFlightStage } from '../vereinsflieger/flight-diagnostics';
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
import { ProviderConnection } from './ProviderConnection';
import { Action, Card, Label, Section, colors } from './theme';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { dataFreshness } from './data-freshness';

export function CoreFlightFoundation({ close }: {close: () => void}) {
  const registry = useRef<RealOwnerRegistry | null>(null), alive = useRef(true), lock = useRef(false);
  const initialRepository = useRef<RealFlightRepositorySession | null>(null);
  function takeInitialRepository() { const session=initialRepository.current;initialRepository.current=null;return session; }
  const [lease,setLease] = useState<RealOwnerLease | null>(null), [setupLease,setSetupLease] = useState<RealOwnerLease | null>(null);
  const [loading,setLoading] = useState(true), [error,setError] = useState(false);

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
    alive.current = true;
    void (async()=>{
      const opened = await timeFlightStage('owner-registry-open',()=>openOwnerRegistry(false));
      if (!alive.current) { await opened?.close(); return; }
      registry.current = opened; const selected = await timeFlightStage('owner-selection',async()=>opened?.currentOwner());
      if (!alive.current) return;
      if (!selected || !opened) return;
      let ready = false;
      try { ready = await timeFlightStage('owner-setup',()=>finishOwnerSetup(selected,opened,false)); } catch { /* Keep the selected owner and its files available for explicit recovery. */ }
      if (!alive.current) return;
      if (ready) setLease(selected);
      else { setSetupLease(selected); setError(true); }
    })().catch(()=>{if(alive.current)setError(true);}).finally(()=>{if(alive.current)setLoading(false);});
    return ()=>{
      alive.current=false;const unused=takeInitialRepository();
      void (async()=>{try{await unused?.close();}finally{await registry.current?.close();}})()
        .catch(()=>console.warn('Own-flight startup cleanup could not be confirmed.'));
    };
  },[]);
  useEffect(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(!lock.current&&!loading&&!lease)close();return true;});return()=>subscription.remove();},[close,loading,lease]);
  async function resumeSelected() {
    const selected=setupLease,current=registry.current;
    if(lock.current||!selected||!current)return; lock.current=true;setLoading(true);setError(false);
    try {
      if(!await finishOwnerSetup(selected,current,true))throw new Error('Selected owner setup remains incomplete.');
      if(alive.current){setLease(selected);setSetupLease(null);setError(false);}
    } catch {if(alive.current){setSetupLease(selected);setError(true);}}
    finally {lock.current=false;if(alive.current)setLoading(false);}
  }
  async function createFreshOwner() {
    if(lock.current)return; lock.current=true;setLoading(true);setError(false);
    try {
      const current = registry.current ?? await openOwnerRegistry(true); if(!current)throw new Error('Owner registry unavailable.');registry.current=current;
      const selected=await current.createFreshOwner(new Date().toISOString());
      if(alive.current){setLease(null);setSetupLease(selected);}
      if(!await finishOwnerSetup(selected,current,true))throw new Error('New owner setup remains incomplete.');
      if(alive.current){setLease(selected);setSetupLease(null);setError(false);}
    } catch {if(alive.current)setError(true);}
    finally {lock.current=false;if(alive.current)setLoading(false);}
  }
  if(lease&&registry.current)return <OwnerFlightLibrary key={lease.leaseId} lease={lease} registry={registry.current} close={close} takeInitialRepository={takeInitialRepository}/>;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:12,gap:10}}>
    <View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title="Eigene Flugbibliothek" icon="flight-paper-plane"/>
      <Action secondary disabled={loading} onPress={close}>Zur App zurück</Action>
      <Card><Label>Neue lokale Bibliothek für deine eigenen Flüge</Label><Label muted>Bestehende Belege, Testbibliotheken und Anbietersitzung bleiben getrennt erhalten. Hier werden keine alten Daten übernommen.</Label></Card>
      {loading&&<ActivityIndicator color={colors.cyan}/>}
      {setupLease&&<Card><Label>Eine vorhandene Einrichtung für deine ausgewählte Bibliothek ist noch nicht vollständig.</Label><Label muted>Die ursprüngliche Datei wird geprüft. Nur tatsächlich fehlende Dateien dürfen ergänzt werden; vorhandene unlesbare Dateien bleiben erhalten.</Label></Card>}
      {error&&<Card><Label>Die Einrichtung konnte nicht bestätigt werden. Bestehende Dateien bleiben erhalten.</Label></Card>}
      {setupLease&&<Action disabled={loading} onPress={()=>void resumeSelected()}>Vorhandene Einrichtung fortsetzen</Action>}
      {setupLease
        ? <Action secondary disabled={loading} onPress={()=>void createFreshOwner()}>Stattdessen neue lokale Bibliothek anlegen</Action>
        : <Action disabled={loading} onPress={()=>void createFreshOwner()}>Neue lokale Flugbibliothek anlegen</Action>}
    </View>
  </ScrollView></SafeAreaView>;
}

type WaitingSource = {request:{from:string;to:string};resolve:(source:RealFlightSourceInput)=>void;reject:(error:Error)=>void;started:boolean;seenBusy:boolean;suppressReview:boolean;generation:number;timer:ReturnType<typeof setTimeout>;signal:AbortSignal;abort:()=>void};
function OwnerFlightLibrary({lease,registry,close,takeInitialRepository}:{lease:RealOwnerLease;registry:RealOwnerRegistry;close:()=>void;takeInitialRepository:()=>RealFlightRepositorySession|null}) {
  const c=useAccessController(true,lease.ownerId), controller=useRef(c);controller.current=c;
  const alive=useRef(true),foreground=useRef(AppState.currentState==='active'),lock=useRef(false),waiting=useRef<WaitingSource|null>(null);
  const reviewGeneration=useRef(0),directAdmission=useRef<CoreFlightReviewAdmission|null>(null),invalidatedRetrievals=useRef(new Set<string>());
  const [busy,setBusy]=useState(false),[providerOpen,setProviderOpen]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [review,setReview]=useState<RealFlightReview|null>(null),[flights,setFlights]=useState<RealFlightListItem[]>([]),[page,setPage]=useState(0);
  const [snapshot,setSnapshot]=useState<OwnFlightStoredSnapshot|null>(null),[detail,setDetail]=useState<RealFlightDetail|null>(null),[recovery,setRecovery]=useState<RealFlightRecovery>({status:'none'});
  const [restorePreparations,setRestorePreparations]=useState<RealFlightRestorePreparation[]>([]),[restoreReadWarning,setRestoreReadWarning]=useState<string|null>(null);
  const handledCapture=useRef<string|null>(null);
  const [reviewRow,setReviewRow]=useState<number|null>(null);
  const scope=useMemo<RealFlightNativeScope>(()=>({registry,lease,authorize:()=>alive.current ? {ownerId:lease.ownerId,storeId:lease.storeId,leaseId:lease.leaseId,writable:foreground.current} : null}),[registry,lease]);
  function finishSource(error?:Error,source?:RealFlightSourceInput) {
    const pending=waiting.current;if(!pending)return;waiting.current=null;clearTimeout(pending.timer);pending.signal.removeEventListener('abort',pending.abort);
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
      if(waiting.current||signal.aborted){reject(new Error('Source request unavailable.'));return;}
      let pending:WaitingSource|null=null;
      const abort=()=>{
        if(!pending)return;pending.suppressReview=true;
        const current=controller.current,state=current.retrieval.current.state;
        if(shouldDeferCoreFlightSourceRejection(state.phase,current.saving,current.restoring.current))return;
        if(state.phase==='loading')current.cancelRetrieval();
        finishSource(new Error('Source request cancelled.'));
      };
      const timer=setTimeout(()=>abandonSource('Source request timed out; saved history remains.'),180_000);
      pending={request,resolve,reject,started:false,seenBusy:false,suppressReview:false,generation:reviewGeneration.current,timer,signal,abort};
      waiting.current=pending;signal.addEventListener('abort',abort,{once:true});
      controller.current.setFrom(request.from);controller.current.setTo(request.to);setProviderOpen(true);
      if(!controller.current.browserActive)controller.current.connect();
    }),
  }),[lease,scope]);
  function abandonSource(reason:string) {
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
      if(alive.current){setRestorePreparations(preparations);setRestoreReadWarning(null);}
    } catch {
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
      pending=await timeFlightStage('receipt-recovery',()=>service.recoverPending());
    if(alive.current){setSnapshot(next);setFlights(rows);setRecovery(pending);setPage(current=>Math.min(current,Math.max(0,Math.ceil(rows.length/5)-1)));}
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
  async function run(work:()=>Promise<void>) {
    if(lock.current||!alive.current)return;lock.current=true;setBusy(true);setFailed(false);setMessage('');
    try{await work();}catch(error){if(alive.current){setFailed(true);setMessage(error instanceof PendingRealFlightOperation?'Der gespeicherte Auftrag muss zuerst über seinen Beleg geprüft werden. Kein neuer Auftrag wurde gestartet.':'Der Vorgang konnte nicht bestätigt werden. Gespeicherte Daten und Belege bleiben erhalten.');}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;void run(refresh);
    const subscription=AppState.addEventListener('change',state=>{
      foreground.current=state==='active';if(state!=='active'){
        reviewGeneration.current++;
        const retrieval=controller.current.retrieval.current.state;if(retrieval.phase!=='idle')invalidatedRetrievals.current.add(retrieval.nonce);
        directAdmission.current=null;abandonSource('App left foreground.');setReview(null);
      }
    });
    return()=>{
      alive.current=false;const pending=waiting.current;if(pending)pending.suppressReview=true;service.dispose();
      const current=controller.current,state=current.retrieval.current.state;
      if(waiting.current&& !shouldDeferCoreFlightSourceRejection(state.phase,current.saving,current.restoring.current))finishSource(new Error('Library closed.'));
      subscription.remove();
    };
  },[service]);
  useEffect(()=>{
    const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(lock.current||controller.current.busy)return true;
      if(providerOpen){
        if(controller.current.visible&&controller.current.backWithinProvider())return true;
        controller.current.dismissLogin();setProviderOpen(false);abandonSource('Source closed.');return true;
      }
      if(detail){setDetail(null);return true;}
      if(review){service.cancelReview();setReview(null);return true;}
      close();return true;
    });return()=>subscription.remove();
  },[service,providerOpen,detail,review,close]);
  useEffect(()=>{
    const pending=waiting.current;
    if(!pending){
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
        void run(async()=>{setReview(await prepareSourceReview(await service.reviewSource(input)));setReviewRow(null);setProviderOpen(false);});
      }
      return;
    }
    if(pending.suppressReview&&!c.busy&&!c.saving&&!c.restoring.current){finishSource(new Error('Source review cancelled.'));return;}
    if(!pending.started&&c.from===pending.request.from&&c.to===pending.request.to&&c.connection.confirmed&&c.viewReady&&!c.recovery&&!c.busy&&!c.visible){pending.started=true;c.checkConnection('retrieve');}
    if(c.busy)pending.seenBusy=true;
    if(pending.started&&pending.seenBusy&&!c.busy&&!c.recovery&&c.completedFlightSource){
      if(pending.suppressReview||!foreground.current||pending.generation!==reviewGeneration.current){service.cancelReview();finishSource(new Error('Source review cancelled.'));}
      else {handledCapture.current=c.completedFlightSource.capture.captureId;setProviderOpen(false);setReviewRow(null);finishSource(undefined,c.completedFlightSource);}
    }
    else if(pending.seenBusy&&!c.busy&&['failed','cancelled'].includes(c.result))finishSource(new Error('Source retrieval did not complete.'));
  },[c]);
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
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView contentContainerStyle={{padding:12}}><View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title="Eigene Flugbibliothek" icon="flight-paper-plane"/>
      <Action secondary disabled={busy||c.busy} onPress={close}>Zur App zurück</Action>
      <Card><Label>{flights.length} gespeicherte eigene Flüge · ohne Buchzuordnung</Label><Label muted>{snapshot?.account?'Vereinsflieger-Konto lokal verknüpft.':'Das eigene Anbieter-Konto wird nach dem ersten Abruf bestätigt.'}</Label>
        <Label muted>Originalwerte und Änderungen bleiben erhalten. Zeiten, Rollen und unbekannte Angaben werden nicht ergänzt. Keine Buchzuordnung, Statistik oder Papierfortschreibung.</Label>
        <Label muted>{coverage?.displayedWindow?`Letzter gespeicherter Zeitraum: ${coverage.displayedWindow.from} bis ${coverage.displayedWindow.to} · ${coverage.observedRecordCount} Datensätze.`:'Noch kein gespeicherter vollständiger Abrufzeitraum.'} Keine Aussage über die gesamte Fluggeschichte.</Label></Card>
      {snapshot&&<Card><Label>{freshness.label}</Label>
        <Label muted>{retrievalPlan.lastSavedAt?`In der Bibliothek gespeichert: ${new Date(retrievalPlan.lastSavedAt).toLocaleString('de-DE')}`:'Noch kein vollständiger Abruf in der Bibliothek gespeichert.'}</Label>
        {freshness.reminder&&<Label>{freshness.note}</Label>}
        {retrievalPlan.periods.map(period=><Label muted key={period.from}>Abgedeckt: {period.from} bis {period.to}</Label>)}
        {retrievalPlan.gaps.map(gap=><Label key={gap.from}>Lücke: {gap.from} bis {gap.to}</Label>)}
      </Card>}
      {(busy||c.busy)&&<ActivityIndicator color={colors.cyan} accessibilityLabel="Flugbibliothek wird verarbeitet"/>}
      {failed&&snapshot===null&&<Card><Section title="Bibliothek nicht lesbar"/><Label>Die gespeicherte Auswahl konnte nicht geprüft werden. Abruf und Sicherung bleiben gesperrt. Du kannst eine geprüfte Sicherungsdatei ausdrücklich auswählen, um die Wiederherstellung zu versuchen; vorhandene Dateien bleiben erhalten.</Label></Card>}
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
      <Card><Section title="Eigene Flüge abrufen" icon="refresh"/><Label muted>Aktualisierung: {retrievalPlan.request.from} bis {retrievalPlan.request.to} einschließlich. Anmeldung und Quellenprüfung erfolgen auf der Originalseite.</Label>
        <Label muted>{retrievalPlan.firstRetrieval?'Beim ersten Abruf werden das Vorjahr und das laufende Jahr bis heute geladen.':'Die letzten sechs Monate werden erneut geprüft. Nach längerer Pause und bei bekannten Lücken wird der Zeitraum erweitert.'} Ältere Korrekturen können unentdeckt bleiben. Dafür einen eigenen Zeitraum wählen; gespeicherte ältere Flüge bleiben erhalten.</Label>
        <Action disabled={busy||restoreReadOnly||recovery.status==='not-committed'||recovery.status==='recovery-required'} onPress={()=>void run(async()=>{setReview(await prepareSourceReview(await service.retrieveUpdate()));})}>Daten aktualisieren</Action>
        <Action secondary disabled={busy||restoreReadOnly} onPress={()=>{c.setFrom(retrievalPlan.request.from);c.setTo(retrievalPlan.request.to);setProviderOpen(true);if(!c.browserActive)c.connect();}}>Anbieter und eigenen Zeitraum öffnen</Action>
        {waiting.current&&<Action secondary disabled={!canCancelCoreFlightSource(c.retrieval.current.state.phase,c.saving,c.restoring.current)}
          onPress={()=>abandonSource('Cancelled.')}>Abruf abbrechen</Action>}
      </Card>
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
      <Card><Section title="Offline gespeicherte Flüge" icon="flight-paper-plane"/>
        {flights.length===0&&<Label>Noch keine eigenen Flüge gespeichert.</Label>}
        {flights.slice(page*5,page*5+5).map(flight=><Action key={flight.flightId} secondary disabled={busy} onPress={()=>void run(async()=>{setDetail(await service.detail(flight.flightId));})}>{flight.facts.assessment.date.value??'Datum unbekannt'} · Quellflug {flight.sourceFlightRef} · Fassung {flight.factsRevision}</Action>)}
        {flights.length>5&&<View style={{flexDirection:'row',gap:8}}><Action secondary disabled={busy||page===0} onPress={()=>setPage(page-1)}>Zurück</Action><Action secondary disabled={busy||(page+1)*5>=flights.length} onPress={()=>setPage(page+1)}>Weitere Flüge</Action></View>}
      </Card>
      {detail&&<Card><Section title={`Quellflug ${detail.sourceFlightRef}`}/><Label>{detail.factHistory.length} gespeicherte Fassung(en) · {detail.pending.length} ungeklärte Beobachtung(en)</Label>
        {detail.facts.assessment.observation.headers.map((header,index)=>header?<Label key={index}>{header}: {detail.facts.assessment.observation.row.values[index]||'unbekannt / leer'}</Label>:null)}
        <Action secondary onPress={()=>setDetail(null)}>Flugdetails schließen</Action>
      </Card>}
      <Card><Section title="Sicherung dieser Flugbibliothek" icon="book"/><Label muted>Enthält eigene gespeicherte Flüge, Originalbelege, Fassungen und Importbelege. Unverschlüsselt. Alte Teststände, andere Rohbelege und Anmeldungen sind nicht enthalten.</Label>
        <Action disabled={busy||restoreReadOnly} onPress={()=>void run(async()=>{const result=await saveRealFlightBackupToFolder(service,gate);setMessage(result.state==='saved'?'Sicherung im gewählten Ordner gespeichert und zurückgelesen.':'Ordnerauswahl abgebrochen.');})}>Flugbibliothek in Geräteordner sichern</Action>
        <Action secondary disabled={busy} onPress={()=>void run(async()=>{await showRestoreResult(await restoreRealFlightBackup(scope,gate));})}>Sicherung dieser Bibliothek wiederherstellen</Action>
      </Card>
    </View></ScrollView>
    <ProviderConnection controller={c} open={providerOpen} purpose="own-flight-library" close={()=>{setProviderOpen(false);if(waiting.current)abandonSource('Source closed.');}}/>
  </SafeAreaView>;
}

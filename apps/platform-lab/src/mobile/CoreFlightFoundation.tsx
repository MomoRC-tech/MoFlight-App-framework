import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import { hash } from '../storage';
import { useAccessController } from '../vereinsflieger/use-access-controller';
import { openOwnerRegistry, createRealFlightCandidate, openRealFlightSelection, openRealFlightCommandJournal,
  type RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import type { RealOwnerLease, RealOwnerRegistry } from '../vereinsflieger/real-owner-registry';
import { RealFlightService, PendingRealFlightOperation, type OwnFlightStoredSnapshot, type RealFlightReview,
  type RealFlightRecovery } from '../vereinsflieger/real-flight-service';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { RealFlightSourceInput } from '../vereinsflieger/real-flight-source';
import { saveRealFlightBackupToFolder, restoreRealFlightBackup } from '../vereinsflieger/real-flight-backup-native';
import { ProviderConnection } from './ProviderConnection';
import { Action, Card, Label, Section, colors } from './theme';

export function CoreFlightFoundation({ close }: {close: () => void}) {
  const registry = useRef<RealOwnerRegistry | null>(null), alive = useRef(true), lock = useRef(false);
  const [lease,setLease] = useState<RealOwnerLease | null>(null), [loading,setLoading] = useState(true), [error,setError] = useState(false);
  useEffect(()=>{
    alive.current = true;
    void (async()=>{
      const opened = await openOwnerRegistry(false);
      if (!alive.current) { await opened?.close(); return; }
      registry.current = opened; const selected = await opened?.currentOwner();
      if (alive.current) setLease(selected ?? null);
    })().catch(()=>{if(alive.current)setError(true);}).finally(()=>{if(alive.current)setLoading(false);});
    return ()=>{alive.current=false;void registry.current?.close();};
  },[]);
  useEffect(()=>{const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{if(!lock.current&&!loading&&!lease)close();return true;});return()=>subscription.remove();},[close,loading,lease]);
  async function create() {
    if(lock.current)return; lock.current=true;setLoading(true);setError(false);
    try {
      const current = registry.current ?? await openOwnerRegistry(true); if(!current)throw new Error('Owner registry unavailable.');registry.current=current;
      const selected=await current.createFreshOwner(new Date().toISOString());
      const scope:RealFlightNativeScope={registry:current,lease:selected,authorize:()=>alive.current ? {ownerId:selected.ownerId,storeId:selected.storeId,leaseId:selected.leaseId,writable:true} : null};
      const candidate=await createRealFlightCandidate(scope,selected.candidateName,{singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,
        owner_id:selected.ownerId,store_id:selected.storeId,created_at:selected.createdAt});await candidate.close();
      const journal=await openRealFlightSelection(scope,true);if(!journal)throw new Error('Selection journal unavailable.');
      try {await journal.activate(Crypto.randomUUID(),selected.candidateName,null,new Date().toISOString());} finally {await journal.close();}
      const commands=await openRealFlightCommandJournal(scope,true);if(!commands)throw new Error('Command journal unavailable.');await commands.close();
      if(alive.current)setLease(selected);
    } catch {if(alive.current)setError(true);}
    finally {lock.current=false;if(alive.current)setLoading(false);}
  }
  if(lease&&registry.current)return <OwnerFlightLibrary key={lease.leaseId} lease={lease} registry={registry.current} close={close}/>;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}><ScrollView contentContainerStyle={{padding:12,gap:10}}>
    <View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title="Eigene Flugbibliothek" icon="flight-paper-plane"/>
      <Action secondary disabled={loading} onPress={close}>Zur App zurück</Action>
      <Card><Label>Neue lokale Bibliothek für deine eigenen Flüge</Label><Label muted>Bestehende Belege, Testbibliotheken und Anbietersitzung bleiben getrennt erhalten. Hier werden keine alten Daten übernommen.</Label></Card>
      {loading&&<ActivityIndicator color={colors.cyan}/>}
      {error&&<Card><Label>Die Einrichtung konnte nicht bestätigt werden. Bestehende Dateien bleiben erhalten.</Label></Card>}
      <Action disabled={loading} onPress={()=>void create()}>Neue lokale Flugbibliothek anlegen</Action>
    </View>
  </ScrollView></SafeAreaView>;
}

type WaitingSource = {request:{from:string;to:string};resolve:(source:RealFlightSourceInput)=>void;reject:(error:Error)=>void;started:boolean;seenBusy:boolean;timer:ReturnType<typeof setTimeout>;signal:AbortSignal;abort:()=>void};
function OwnerFlightLibrary({lease,registry,close}:{lease:RealOwnerLease;registry:RealOwnerRegistry;close:()=>void}) {
  const c=useAccessController(true,lease.ownerId), controller=useRef(c);controller.current=c;
  const alive=useRef(true),foreground=useRef(AppState.currentState==='active'),lock=useRef(false),waiting=useRef<WaitingSource|null>(null);
  const [busy,setBusy]=useState(false),[providerOpen,setProviderOpen]=useState(false),[message,setMessage]=useState(''),[failed,setFailed]=useState(false);
  const [review,setReview]=useState<RealFlightReview|null>(null),[flights,setFlights]=useState<RealFlightListItem[]>([]),[page,setPage]=useState(0);
  const [snapshot,setSnapshot]=useState<OwnFlightStoredSnapshot|null>(null),[detail,setDetail]=useState<RealFlightDetail|null>(null),[recovery,setRecovery]=useState<RealFlightRecovery>({status:'none'});
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
      const abort=()=>{controller.current.cancelRetrieval();finishSource(new Error('Source request cancelled.'));};
      const timer=setTimeout(()=>finishSource(new Error('Source request timed out; saved history remains.')),180_000);
      waiting.current={request,resolve,reject,started:false,seenBusy:false,timer,signal,abort};signal.addEventListener('abort',abort,{once:true});
      controller.current.setFrom(request.from);controller.current.setTo(request.to);setProviderOpen(true);
      if(!controller.current.browserActive)controller.current.connect();
    }),
  }),[lease,scope]);
  async function refresh() {
    const next=await service.snapshot(),rows=await service.list(),pending=await service.recoverPending();
    if(alive.current){setSnapshot(next);setFlights(rows);setRecovery(pending);setPage(current=>Math.min(current,Math.max(0,Math.ceil(rows.length/5)-1)));}
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
      foreground.current=state==='active';if(state!=='active'){service.cancelReview();finishSource(new Error('App left foreground.'));setReview(null);}
    });
    return()=>{alive.current=false;service.dispose();finishSource(new Error('Library closed.'));subscription.remove();};
  },[service]);
  useEffect(()=>{
    const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
      if(lock.current||controller.current.busy)return true;
      if(providerOpen){
        if(controller.current.visible&&controller.current.backWithinProvider())return true;
        controller.current.dismissLogin();setProviderOpen(false);service.cancelReview();finishSource(new Error('Source closed.'));return true;
      }
      if(detail){setDetail(null);return true;}
      if(review){service.cancelReview();setReview(null);return true;}
      close();return true;
    });return()=>subscription.remove();
  },[service,providerOpen,detail,review,close]);
  useEffect(()=>{
    const pending=waiting.current;
    if(!pending){
      if(!lock.current&&!c.busy&&!c.recovery&&c.completedFlightSource&&handledCapture.current!==c.completedFlightSource.capture.captureId){
        handledCapture.current=c.completedFlightSource.capture.captureId;
        const input=c.completedFlightSource;void run(async()=>{setReview(await prepareSourceReview(await service.reviewSource(input)));setReviewRow(null);setProviderOpen(false);});
      }
      return;
    }
    if(!pending.started&&c.from===pending.request.from&&c.to===pending.request.to&&c.connection.confirmed&&c.viewReady&&!c.recovery&&!c.busy&&!c.visible){pending.started=true;c.checkConnection('retrieve');}
    if(c.busy)pending.seenBusy=true;
    if(pending.started&&pending.seenBusy&&!c.busy&&!c.recovery&&c.completedFlightSource){handledCapture.current=c.completedFlightSource.capture.captureId;setProviderOpen(false);setReviewRow(null);finishSource(undefined,c.completedFlightSource);}
    else if(pending.seenBusy&&!c.busy&&['failed','cancelled'].includes(c.result))finishSource(new Error('Source retrieval did not complete.'));
  },[c]);
  const gate=async()=>{if(!alive.current)throw new Error('Library closed.');await registry.assertCurrent(lease);};
  const coverage=snapshot?.coverage.at(-1)?.coverage;
  return <SafeAreaView style={{flex:1,backgroundColor:colors.background}}>
    <ScrollView contentContainerStyle={{padding:12}}><View style={{width:'100%',maxWidth:520,alignSelf:'center',gap:10}}>
      <Section title="Eigene Flugbibliothek" icon="flight-paper-plane"/>
      <Action secondary disabled={busy||c.busy} onPress={close}>Zur App zurück</Action>
      <Card><Label>{flights.length} gespeicherte eigene Flüge · ohne Buchzuordnung</Label><Label muted>{snapshot?.account?'Vereinsflieger-Konto lokal verknüpft.':'Das eigene Anbieter-Konto wird nach dem ersten Abruf bestätigt.'}</Label>
        <Label muted>Originalwerte und Änderungen bleiben erhalten. Zeiten, Rollen und unbekannte Angaben werden nicht ergänzt. Keine Buchzuordnung, Statistik oder Papierfortschreibung.</Label>
        <Label muted>{coverage?.displayedWindow?`Letzter gespeicherter Zeitraum: ${coverage.displayedWindow.from} bis ${coverage.displayedWindow.to} · ${coverage.observedRecordCount} Datensätze.`:'Noch kein gespeicherter vollständiger Abrufzeitraum.'} Keine Aussage über die gesamte Fluggeschichte.</Label></Card>
      {(busy||c.busy)&&<ActivityIndicator color={colors.cyan} accessibilityLabel="Flugbibliothek wird verarbeitet"/>}
      {snapshot?.recovery.readOnly&&<Card><Section title="Bibliothek nur lesbar"/><Label>Eine neuere oder abweichende gespeicherte Datei muss geprüft werden. Frühere Flüge bleiben lesbar; spätere Aufträge und Dateien werden erhalten. Neue Speicherung und Sicherung sind gesperrt.</Label></Card>}
      {!!message&&<Card><Label>{message}</Label></Card>}
      {failed&&<Action secondary disabled={busy} onPress={()=>void run(refresh)}>Gespeicherte Bibliothek erneut prüfen</Action>}
      {recovery.status!=='none'&&<Card><Section title="Gespeicherten Auftrag prüfen"/><Label>{recovery.status==='committed'?'Der frühere Auftrag wurde gespeichert.':recovery.status==='not-committed'?'Für den ursprünglichen Auftrag ist noch kein gespeicherter Beleg vorhanden.':'Die Bibliothek benötigt eine Wiederherstellung. Spätere Dateien bleiben erhalten.'}</Label>
        <Action disabled={busy} onPress={()=>void run(async()=>{setRecovery(await service.recoverPending());await refresh();})}>Auftragsbeleg erneut prüfen</Action>
        {recovery.status==='not-committed'&&<Action disabled={busy} onPress={()=>void run(async()=>{await service.retryPending();await refresh();setMessage('Ursprünglicher Auftrag gespeichert.');})}>Ursprünglichen Auftrag erneut versuchen</Action>}
      </Card>}
      <Card><Section title="Eigene Flüge abrufen" icon="refresh"/><Label muted>Zeitraum: {c.from} bis {c.to} einschließlich. Anmeldung und Quellenprüfung erfolgen auf der Originalseite.</Label>
        <Action disabled={busy||snapshot?.recovery.readOnly||recovery.status==='not-committed'||recovery.status==='recovery-required'} onPress={()=>void run(async()=>{setReview(await prepareSourceReview(await service.retrieve({from:c.from,to:c.to})));})}>Eigene Flüge jetzt abrufen</Action>
        <Action secondary disabled={busy} onPress={()=>{setProviderOpen(true);if(!c.browserActive)c.connect();}}>Anbieter und Zeitraum öffnen</Action>
        {waiting.current&&<Action secondary onPress={()=>{service.cancelReview();controller.current.cancelRetrieval();finishSource(new Error('Cancelled.'));}}>Abruf abbrechen</Action>}
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
        <Action disabled={busy||snapshot?.recovery.readOnly} onPress={()=>void run(async()=>{const result=await saveRealFlightBackupToFolder(service,gate);setMessage(result.state==='saved'?'Sicherung im gewählten Ordner gespeichert und zurückgelesen.':'Ordnerauswahl abgebrochen.');})}>Flugbibliothek in Geräteordner sichern</Action>
        <Action secondary disabled={busy} onPress={()=>void run(async()=>{const result=await restoreRealFlightBackup(scope,gate);if(result.state==='restored'){service.cancelReview();setReview(null);await refresh();setMessage('Geprüfte Sicherung in einer neuen Datei aktiviert. Vorherige Dateien bleiben erhalten.');}else setMessage('Dateiauswahl abgebrochen.');})}>Sicherung dieser Bibliothek wiederherstellen</Action>
      </Card>
    </View></ScrollView>
    <ProviderConnection controller={c} open={providerOpen} purpose="own-flight-library" close={()=>{setProviderOpen(false);if(waiting.current){service.cancelReview();finishSource(new Error('Source closed.'));}}}/>
  </SafeAreaView>;
}

import {dataFreshness,dataUpdateStatus,type CaptureReadState} from './data-freshness';
import type {SyncEstimateState} from './sync-estimate';

export type IdleSyncNotice={kind:'read-error'|'advice'|'never'|'unknown';caption:string;description:string};
/** Advice uses committed receipt evidence and never starts work or changes its age. */
export function idleSyncNotice({receivedAt,readState,now,activityChanged=false}:{receivedAt:string|null;readState:CaptureReadState;now:number;activityChanged?:boolean}):IdleSyncNotice|null{
  if(readState==='loading')return null;
  if(readState==='failed')return {kind:'read-error',caption:'Gespeicherte Daten nicht lesbar',description:'Gespeicherte Daten konnten nicht erneut gelesen werden. Frühere Daten bleiben erhalten. Details öffnen die lokale Wiederherstellung.'};
  if(receivedAt===null)return {kind:'never',caption:'Noch keine Flugdaten',description:'Noch keine Flugdaten empfangen. Über die Synchronisierung im Kopfbereich kannst du Flugdaten abrufen.'};
  if(dataUpdateStatus(receivedAt,readState,now).state==='unknown')return {kind:'unknown',caption:'Datenstand unklar',description:'Der Zeitpunkt des letzten gespeicherten Flugdatenabrufs ist unklar.'};
  const older=dataFreshness(receivedAt,readState,now).reminder;
  if(!older&&!activityChanged)return null;
  return {kind:'advice',caption:activityChanged?'Änderungen möglich':'Aktualisierung empfohlen',description:[activityChanged?'Eine beobachtete Anzahl hat sich geändert. Neue Flüge sind damit nicht bestätigt.':'',older?'Der letzte gespeicherte Flugdatenabruf liegt mehr als drei Tage zurück.':''].filter(Boolean).join(' ')};
}

export const syncStages=['prepare','account','sign-in','flights','review','save','medical','duties','events','documents','work-summary','work-hours','tasks'] as const;
export type SyncStage=typeof syncStages[number];
export type SyncCount={done:number;total:number|null;unit:'flights'|'requests'|'steps'};
export type SyncProgress={state:'idle'|'active'|'waiting'|'failed'|'partial';last:SyncStage|null;current:SyncStage|null;message?:string;count?:SyncCount;lastCount?:SyncCount;estimate?:SyncEstimateState};
export const idleSyncProgress:SyncProgress={state:'idle',last:null,current:null};
export const syncLabels:Record<SyncStage,{active:string;done:string}>={
  prepare:{active:'Synchronisierung wird vorbereitet …',done:'Vorbereitung abgeschlossen.'},
  account:{active:'Anmeldung wird geprüft …',done:'Anmeldung bestätigt.'},
  'sign-in':{active:'Anmeldung erforderlich …',done:'Anmeldung bestätigt.'},
  flights:{active:'Flüge werden abgerufen …',done:'Flüge abgerufen.'},
  review:{active:'Flüge werden geprüft …',done:'Flüge geprüft.'},
  save:{active:'Flüge werden gespeichert …',done:'Flüge gespeichert.'},
  medical:{active:'Medical wird abgerufen …',done:'Medical verarbeitet.'},
  duties:{active:'Dienste werden abgerufen …',done:'Dienste verarbeitet.'},
  events:{active:'Termine werden abgerufen …',done:'Termine verarbeitet.'},
  documents:{active:'Dokumenthinweise werden abgerufen …',done:'Dokumenthinweise verarbeitet.'},
  'work-summary':{active:'Arbeitsstunden werden abgerufen …',done:'Jahresübersicht verarbeitet.'},
  'work-hours':{active:'Arbeitseinträge werden abgerufen …',done:'Arbeitseinträge verarbeitet.'},
  tasks:{active:'Eigene Aufgaben werden abgerufen …',done:'Eigene Aufgaben verarbeitet.'},
};
export function startSyncStage(previous:SyncProgress,current:SyncStage):SyncProgress{
  const state=current==='sign-in'?'waiting':'active';
  return previous.current===current&&previous.state===state?previous:{state,last:previous.last,lastCount:previous.lastCount,current};
}
export function defaultSyncCount(stage:SyncStage):SyncCount{
  return stage==='flights'||stage==='save'?{done:0,total:null,unit:'flights'}:
    {done:0,total:stage==='duties'?2:1,unit:['prepare','account','sign-in','review'].includes(stage)?'steps':'requests'};
}
/** Late, cancelled and invalid updates cannot advance another stage. */
export function updateSyncCount(previous:SyncProgress,stage:SyncStage,count:SyncCount):SyncProgress{
  if(previous.state!=='active'||previous.current!==stage||!Number.isSafeInteger(count.done)||count.done<0||
    count.total!==null&&(!Number.isSafeInteger(count.total)||count.total<count.done))return previous;
  const old=previous.count;
  if(old&&(old.unit!==count.unit||count.done<old.done||old.total!==null&&count.total!==old.total))return previous;
  if(old&&old.done===count.done&&old.total===count.total)return previous;
  return {...previous,count:{...count}};
}
export function syncStageText(stage:SyncStage,done:boolean,count?:SyncCount):string{
  const value=count??defaultSyncCount(stage);
  if(value.total===1)return syncLabels[stage][done?'done':'active'].replace(/[. …]+$/u,'');
  const units=value.unit==='flights'?'':value.unit==='steps'?' Schritt':' Anfragen';
  return `${syncLabels[stage][done?'done':'active'].replace(/[. …]+$/u,'')} (${done&&!count?(value.total??'?'):value.done}/${value.total??'?'}${units})`;
}
export function finishSyncStage(previous:SyncProgress,stage:SyncStage):SyncProgress{
  if(previous.current!==stage||!['active','waiting'].includes(previous.state))return previous;
  const count=previous.count??defaultSyncCount(stage);
  return {...previous,last:stage,current:null,count:undefined,lastCount:{...count,done:count.total??count.done}};
}

type CompletedSync={pending:number;cleanupPending?:boolean;medicalStatus?:string;dutyStatus?:string;eventsStatus?:string;documentNoticesStatus?:string;workSummaryStatus?:string;workHoursStatus?:string;tasksStatus?:string};
/** A visible-page capture is usable; failed/skipped jobs remain named and actionable. */
export function completedSyncProgress(result:CompletedSync):SyncProgress{
  const labels={medicalStatus:'Medical',dutyStatus:'Dienste',eventsStatus:'Termine',documentNoticesStatus:'Dokumenthinweise',workSummaryStatus:'Arbeitsstundenübersicht',workHoursStatus:'Arbeitsstunden',tasksStatus:'Aufgaben'} as const;
  const missing=Object.entries(labels).filter(([key])=>['failed','skipped'].includes(result[key as keyof typeof labels]??'')).map(([,label])=>label);
  const messages=[];
  if(missing.length)messages.push(`Nicht aktualisiert: ${missing.join(', ')}.`);
  if(result.pending>0)messages.push('Einige Flüge benötigen eine Prüfung.');
  if(result.cleanupPending)messages.push('Die Anbieteransicht benötigt eine Prüfung in den Einstellungen.');
  return messages.length?{state:'partial',last:'save',current:null,message:messages.join(' ')}:idleSyncProgress;
}

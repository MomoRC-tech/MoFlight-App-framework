export const syncStages=['prepare','account','sign-in','flights','save','medical','duties','events','documents','work-summary','work-hours','tasks'] as const;
export type SyncStage=typeof syncStages[number];
export type SyncProgress={state:'idle'|'active'|'waiting'|'failed'|'partial';last:SyncStage|null;current:SyncStage|null;message?:string};
export const idleSyncProgress:SyncProgress={state:'idle',last:null,current:null};
export const syncLabels:Record<SyncStage,{active:string;done:string}>={
  prepare:{active:'Synchronisierung wird vorbereitet …',done:'Vorbereitung abgeschlossen.'},
  account:{active:'Anmeldung wird geprüft …',done:'Anmeldung bestätigt.'},
  'sign-in':{active:'Anmeldung erforderlich …',done:'Anmeldung bestätigt.'},
  flights:{active:'Flüge werden abgerufen …',done:'Flüge abgerufen.'},
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
  return previous.current===current&&previous.state===state?previous:{state,last:previous.last,current};
}
export function finishSyncStage(previous:SyncProgress,stage:SyncStage):SyncProgress{
  return previous.current!==stage?previous:{...previous,last:stage,current:null};
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

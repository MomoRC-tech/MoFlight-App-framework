import React, { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import type { FinancialCaptureState } from '../vereinsflieger/expense-capture-request';
import type { FinancialObservationReceipt } from '../vereinsflieger/expense-observation-store';
import { Action, Card, Label, Section } from './theme';

export function FinancialRetrievalPanel({capture,retrySave,cancel,openProvider,state,saveUncertain,ready,blocked,onBusyChange,onDone}:{capture:()=>Promise<FinancialObservationReceipt>;retrySave:()=>Promise<FinancialObservationReceipt>;cancel:()=>boolean;openProvider:()=>void;state:FinancialCaptureState;saveUncertain:boolean;ready:boolean;blocked:boolean;onBusyChange:(busy:boolean)=>void;onDone:()=>void}) {
  const [message,setMessage]=useState(''),[finished,setFinished]=useState(false),[running,setRunning]=useState(false);
  const alive=useRef(false),started=useRef(false),locked=useRef(false),latest=useRef({cancel,onBusyChange});latest.current={cancel,onBusyChange};
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;latest.current.cancel();latest.current.onBusyChange(false);};},[]);
  const run=async(reconcile=false)=>{if(locked.current||blocked||!ready||AppState.currentState!=='active')return;locked.current=true;setRunning(true);setMessage('');onBusyChange(true);
    try{await(reconcile?retrySave():capture());if(alive.current){setFinished(true);setMessage('Finanzbelege gespeichert. Deine Kosten werden beim Zurückkehren lokal geprüft.');}}
    catch{if(alive.current)setMessage('Abruf nicht abgeschlossen. Gespeicherte Belege bleiben erhalten.');}
    finally{locked.current=false;if(alive.current){setRunning(false);latest.current.onBusyChange(false);}}
  };
  useEffect(()=>{if(ready&&!blocked&&!started.current&&!saveUncertain){started.current=true;void run();}},[ready,blocked,saveUncertain]);
  return <Card><Section title="Finanzbelege abrufen"/><Label muted>Prüft die Abrechnungen deiner lokal gespeicherten eigenen Flüge sowie die aktuell sichtbaren eigenen Rechnungs- und Kontozeilen. Die Auswahl wird vor dem Abruf lokal protokolliert. Anbieterfilter bleiben erhalten.</Label>
    {state.phase==='reading'&&<><Label>{state.progress?`${state.progress.processed} von ${state.progress.total} Quellflügen geprüft · ${state.progress.billed} abgerechnet`:'Eigenes Konto und Quellen werden geprüft …'}</Label><Action secondary onPress={cancel}>Abruf abbrechen</Action></>}
    {state.phase==='saving'&&<Label>Belege werden auf diesem Gerät gespeichert und zurückgelesen …</Label>}
    {saveUncertain&&<><Label>Die Speicherbestätigung fehlt. Derselbe Auftrag muss lokal abgeglichen werden; der Anbieter wird dafür nicht erneut abgerufen.</Label><Action disabled={running||blocked||!ready} onPress={()=>void run(true)}>Speicherung abgleichen</Action></>}
    {state.phase==='idle'&&state.failure&&<Label>{state.failure==='cancelled'?'Abruf abgebrochen.':state.failure==='timeout'?'Zeitlimit erreicht. Erneut versuchen.':state.failure==='sign-in-required'?'Anmeldung erforderlich. Beim Anbieter anmelden und erneut abrufen.':state.failure==='account-changed'?'Kontokontext geändert. Die gespeicherte Kontoverbindung prüfen; neue Belege wurden nicht übernommen.':'Quelle oder Zugriff konnte nicht bestätigt werden.'}</Label>}
    {message&&<Label>{message}</Label>}
    {!running&&!finished&&!saveUncertain&&<><Action disabled={blocked||!ready} onPress={()=>void run()}>Erneut abrufen</Action><Action secondary disabled={blocked||!ready} onPress={openProvider}>Beim Anbieter anmelden</Action></>}
    {finished&&<Action onPress={onDone}>Kosten ansehen</Action>}
    <Label muted>HTML-Belege werden lokal gespeichert. PDFs und fremde Rechnungen sind ausgeschlossen. Fehlende oder widersprüchliche Werte bleiben offen.</Label>
  </Card>;
}

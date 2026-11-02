import React, { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { Card, Label, Section } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { readFinancialAnalysisNative } from '../vereinsflieger/expense-analysis-native';
import { projectExpenses } from '../expenses/expense-projection';
import { expenseMoney } from './financial-analysis-model';

/** Read the same owner-scoped source as Costs; never fetch provider data on Start. */
export function HomeCosts({view,active,reload,year,onOpen}:{view:OwnFlightView|null;active:boolean;reload:number;year:number;onOpen:()=>void}) {
  const owner=view?.snapshot.ownerId,store=view?.snapshot.storeId,account=view?.snapshot.account?.accountRef;
  const key=JSON.stringify([owner,store,account,year,reload]);
  const [result,setResult]=useState<{key:string;amount:string;note:string}|null>(null);
  useEffect(()=>{
    if(!active||!owner||!store||!account)return;
    let mounted=true,generation=0;
    const read=()=>{
      const id=++generation;
      setResult(null);
      const gate=()=>{if(!mounted||id!==generation||AppState.currentState!=='active')throw Error('Home no longer active');};
      void readFinancialAnalysisNative({ownerId:owner,storeId:store,accountRef:account},gate).then(data=>{
        gate();
        if(!data){setResult({key,amount:'—',note:'Noch keine geprüften Finanzbelege gespeichert.'});return;}
        const p=projectExpenses(data.snapshot,data.snapshot.scope,{mode:'year',year});
        setResult({key,amount:expenseMoney(p.flying.knownMinor),note:p.state==='conflict'?'Widersprüchliche Belege · Details prüfen':p.flying.knownMinor===null?'Flugkosten noch unbekannt':'Bekannter Teilbetrag · nach Buchungsdatum, kein vollständiger Zeitraum'});
      }).catch(()=>{if(mounted&&id===generation)setResult({key,amount:'—',note:'Belege lokal nicht lesbar. In Kosten erneut prüfen.'});});
    };
    if(AppState.currentState==='active')read();
    const sub=AppState.addEventListener('change',state=>{generation++;setResult(null);if(state==='active')read();});
    return()=>{mounted=false;generation++;sub.remove();};
  },[active,owner,store,account,year,reload,key]);
  const shown=result?.key===key?result:null;
  return <Card><Section title={`Kosten ${year}`} action="Öffnen" onPress={onOpen}/><Label style={{fontSize:30,lineHeight:40,fontWeight:'600',fontVariant:['tabular-nums']}}>{shown?.amount??'—'}</Label><Label muted>{shown?.note??(account?'Gespeicherte Belege werden beim Öffnen geprüft.':'Noch kein eigenes Konto zugeordnet.')}</Label><Label muted style={{fontSize:12,lineHeight:19}}>Abgerechnete Flugpreise · keine Aussage über bezahlte Beträge</Label></Card>;
}

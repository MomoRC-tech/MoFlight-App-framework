import React, { useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import { Card, Label, colors } from './theme';
import { SymbolIcon } from './SymbolIcon';
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
        if(!data){setResult({key,amount:'—',note:'Noch keine Belege'});return;}
        const p=projectExpenses(data.snapshot,data.snapshot.scope,{mode:'year',year});
        setResult({key,amount:expenseMoney(p.flying.knownMinor),note:p.state==='conflict'?'Belegkonflikt · prüfen':p.flying.knownMinor===null?'Betrag unbekannt':'Teilbetrag · Buchungsdatum'});
      }).catch(()=>{if(mounted&&id===generation)setResult({key,amount:'—',note:'Belege nicht lesbar · erneut prüfen'});});
    };
    if(AppState.currentState==='active')read();
    const sub=AppState.addEventListener('change',state=>{generation++;setResult(null);if(state==='active')read();});
    return()=>{mounted=false;generation++;sub.remove();};
  },[active,owner,store,account,year,reload,key]);
  const shown=result?.key===key?result:null;
  return <Card onPress={onOpen} label={`Kosten ${year} öffnen`} style={{gap:6,paddingVertical:14}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12}}><View style={{flex:1,gap:4}}><Label style={{fontSize:12,lineHeight:18,letterSpacing:1.2,color:colors.muted}}>KOSTEN {year}</Label><Label style={{fontSize:26,lineHeight:34,fontWeight:'600',fontVariant:['tabular-nums']}}>{shown?.amount??'—'}</Label></View><SymbolIcon name="right" size={20}/></View>
    <Label muted style={{fontSize:12,lineHeight:19}}>{shown?.note??(account?'Belegstand wird geprüft':'Konto noch nicht zugeordnet')}</Label>
  </Card>;
}

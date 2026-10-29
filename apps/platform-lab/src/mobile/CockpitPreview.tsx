import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppHeader } from './AppHeader';
import { Dashboard } from './Dashboard';
import { OverviewTiles } from './OverviewTiles';
import { DutyRoster } from './DutyRoster';
import { Action, Label, colors, startSurfaces, ui } from './theme';
import { createDesignPreviewData, DESIGN_PREVIEW_NOW } from './design-preview-data';
import { DataUpdateIndicator } from './DataUpdateIndicator';
import { SymbolIcon } from './SymbolIcon';
import { SyncProgress } from './SyncProgress';
import type { SyncProgress as Progress } from './sync-progress';
import type { InformationCapture } from '../vereinsflieger/information';
import type { ChartKind, ChartContributors } from './statistics-charts-model';
import type { StatisticsSection } from './statistics-overlay-model';

/** Existing Development preview: fictional facts only; no provider calls or user-record writes. */
export function CockpitPreview({onClose,onFlights,onStatistics}: {onClose:()=>void;onFlights:()=>void;onStatistics:(year:number,section?:StatisticsSection,chart?:ChartKind,contributors?:ChartContributors)=>void}) {
  const [scenario,setScenario]=useState<'default'|'undated'|'same-day'>('default');
  const fixture=useMemo(()=>createDesignPreviewData(scenario),[scenario]),{width,fontScale}=useWindowDimensions();
  const [mode,setMode]=useState<'ready'|'missing'|'loading'|'failed'>('ready');
  const [configured,setConfigured]=useState(false),[medical,setMedical]=useState(false),[paper,setPaper]=useState(false);
  const [knownMedical,setKnownMedical]=useState(true);
  const demoMedical:InformationCapture={version:1,id:'synthetic-medical',owner:'synthetic-owner',connectionId:'synthetic-connection',retrievedAt:'2026-10-22T10:00:00.000Z',sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis',index:1}],rows:[{position:0,values:['LAPL','10.08.2027']},{position:1,values:['Klasse 2','22.04.2027']},{position:2,values:['Klasse 1','21.10.2026']},{position:3,values:['Demo','']}],filters:[],empty:false,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};
  const [sync,setSync]=useState<Progress>({state:'idle',last:null,current:null});
  const [page,setPage]=useState<'home'|'club'|'ai'>('home');
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <AppHeader title="Übersicht · Demo" profile={<Pressable accessibilityRole="button" accessibilityLabel="Cockpit-Vorschau schließen" onPress={onClose} style={ui.headerAction}><SymbolIcon name="profile" size={28}/></Pressable>}><DataUpdateIndicator incomplete={sync.state==='failed'||sync.state==='partial'} now={DESIGN_PREVIEW_NOW} receivedAt="2026-10-22T10:00:00.000Z" readState="ready" syncing={sync.state==='active'} onPress={()=>setSync({state:'active',last:'account',current:'flights'})}/></AppHeader>
    <SyncProgress progress={sync} retry={()=>setSync({state:'active',last:'account',current:'flights'})} details={()=>setSync({state:'failed',last:'account',current:null,message:'Synthetischer Fehler. Keine Quelle wurde abgerufen.'})}/>
    <ScrollView contentContainerStyle={{padding:12,gap:10,alignSelf:'center',width:'100%',maxWidth:520}}>
      {page==='ai'?<View style={{gap:12}}><Label>MoFlight AI · Demo</Label><Label muted>Der AI-Dienst ist nicht verbunden.</Label><Action secondary onPress={()=>setPage('home')}>Zur Übersicht</Action></View>:page==='club'?<DutyRoster overview={fixture.dutyOverview} expanded/>:<>
      <Dashboard persistDutyTarget={false} ownFlights={mode==='ready'?fixture.view:null} ownFlightPhase={mode} pending={null} width={width} fontScale={fontScale} now={DESIGN_PREVIEW_NOW} onFlights={onFlights} onFlight={onFlights} onStatistics={onStatistics} onPaper={()=>setPaper(!paper)}/>
      <OverviewTiles medical={knownMedical?demoMedical:null} now={DESIGN_PREVIEW_NOW} onMedical={()=>setMedical(!medical)} onPaper={()=>setPaper(!paper)} bookName={configured?'Demo Flugbuch':null} pending={configured?3:null}/>
      {medical&&<Label>{knownMedical?'Erfasste Demo-Ablaufdaten':'Medical unbekannt'} · synthetische Vorschau, keine Flugtauglichkeitsbestätigung.</Label>}
      {paper&&<Label>{configured?'Demo Flugbuch · 3 Flüge offen':'Einrichtung in Vorbereitung · keine Datenänderung'}</Label>}
      <DutyRoster overview={fixture.dutyOverview} onOpen={()=>setPage('club')}/>
      </>}
      <Label muted>Synthetische Vorschau · keine echten Daten</Label>
      <Action secondary onPress={()=>setScenario(scenario==='undated'?'default':'undated')}>Vorschau: Flüge ohne Datum</Action>
      <Action secondary onPress={()=>setScenario(scenario==='same-day'?'default':'same-day')}>Vorschau: Unklare Reihenfolge</Action>
      <Action secondary onPress={()=>setConfigured(!configured)}>Vorschau: Papierstand wechseln</Action>
      <Action secondary onPress={()=>setKnownMedical(!knownMedical)}>Vorschau: Medical wechseln</Action>
      <Action secondary onPress={()=>setMode(mode==='loading'?'ready':'loading')}>Vorschau: Laden</Action>
      <Action secondary onPress={()=>setMode(mode==='missing'?'ready':'missing')}>Vorschau: Unbekannt</Action>
      <Action secondary onPress={()=>setMode(mode==='failed'?'ready':'failed')}>Vorschau: Lesefehler</Action>
      <Action secondary onPress={()=>setSync({state:'failed',last:'account',current:null,message:'Synthetischer Fehler'})}>Vorschau: Sync-Fehler</Action>
      <Action secondary onPress={()=>setSync({state:'idle',last:null,current:null})}>Vorschau: Sync fertig</Action>
    </ScrollView>
    <View accessibilityRole="tablist" style={{flexDirection:'row',borderTopWidth:1,borderColor:colors.border,padding:6,flexWrap:fontScale>1.3?'wrap':'nowrap',justifyContent:'center'}}>{([
      ['home','Übersicht','home',()=>setPage('home')],['flights','Flüge','flight-paper-plane',onFlights],['logbook','Flugbuch','book',()=>{setPage('home');setPaper(!paper);}],['club','Verein','club',()=>setPage('club')],['ai','AI','sparkle',()=>setPage('ai')],
    ] as const).map(([id,title,icon,onPress])=><Pressable key={id} accessibilityRole="tab" accessibilityLabel={`Vorschau ${title}`} accessibilityState={{selected:page===id}} onPress={onPress} style={{flex:fontScale>1.3?0:1,width:fontScale>1.3?'32%':undefined,minWidth:0,minHeight:60,alignItems:'center',justifyContent:'center',gap:4,borderRadius:14,backgroundColor:page===id?startSurfaces.raised:undefined}}><SymbolIcon name={icon} size={26} tone={page===id?'default':'muted'}/><Label style={{fontSize:11,lineHeight:17,textAlign:'center',color:page===id?colors.cyan:colors.muted}}>{title}</Label></Pressable>)}</View>
  </View>;
}

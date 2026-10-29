import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, ScrollView, StyleSheet, View } from 'react-native';
import { FlightCard } from './FlightCard';
import { FlightDetails } from './FlightDetails';
import { AppHeader } from './AppHeader';
import { ownFlightCard } from './own-flight-model';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { Action, Card, Empty, Label, colors } from './theme';
import type { useOwnFlights } from './use-own-flights';
import { selectStatisticsFlights, statisticsPeriodBounds, type StatisticsPeriod, type StatisticsSection } from './statistics-overlay-model';
import { StatisticsExplorer } from './StatisticsExplorer';
import type { ChartKind, ChartContributors } from './statistics-charts-model';

type FlightData = ReturnType<typeof useOwnFlights>;
type Route = { kind:'section'; key:string } | { kind:'flights'; title:string; ids:string[]; scope:StatisticsPeriod; key:string } | { kind:'detail'; flightId:string; title:string; key:string };
export function StatisticsOverlay({ data, today, fontScale, onBackHandler, onClose, headerActions, feedback, helpEnabled=true, onHelp, initialYear, initialSection='overview', initialChart, initialContributors }: {
  data:FlightData; today:string; fontScale:number; onBackHandler:(handler:()=>boolean)=>void; onClose:()=>void;
  headerActions?:React.ReactNode; feedback?:React.ReactNode; helpEnabled?:boolean; onHelp?:(entryId:string)=>void;
  initialYear?:number; initialSection?:StatisticsSection; initialChart?:ChartKind; initialContributors?:ChartContributors;
}) {
  const [period,setPeriod]=useState<StatisticsPeriod>({kind:'year',year:initialYear??Number(today.slice(0,4))});
  const [routes,setRoutes]=useState<Route[]>([{kind:'section',key:'charts'},...(initialContributors?[{kind:'flights' as const,key:'initial-flights',title:initialContributors.title,ids:[...new Set(initialContributors.ids)],scope:initialContributors.scope}]:[])]);
  const [rawFlightId,setRawFlightId]=useState<string|null>(null),[rawPage,setRawPage]=useState(0),[picHelpOpen,setPicHelpOpen]=useState(false);
  const sequence=useRef(0),scrollOffsets=useRef<Record<string,number>>({}),scroll=useRef<ScrollView>(null),explorerBack=useRef<()=>boolean>(()=>false);
  const route=routes[routes.length-1]!;
  const flights=data.view?.flights??[],saved=data.view?.snapshot.savedRetrievals??[];
  const allUnique=useMemo(()=>selectStatisticsFlights(flights,{kind:'all'},today).flights,[flights,today]);
  const back=()=>{
    Keyboard.dismiss();
    if(route.kind==='section') return explorerBack.current();
    if(route.kind==='detail'){if(picHelpOpen){setPicHelpOpen(false);return true;}if(rawFlightId){setRawFlightId(null);return true;}data.clearDetail();}
    setRoutes(previous=>previous.slice(0,-1));return true;
  };
  onBackHandler(back);
  const openFlights=(title:string,ids:readonly string[],scope:StatisticsPeriod=period)=>{
    const known=new Set(selectStatisticsFlights(allUnique,scope,today).flights.map(f=>f.flightId));
    const filtered=[...new Set(ids)].filter(id=>known.has(id));if(!filtered.length)return;
    Keyboard.dismiss();setRoutes(previous=>[...previous,{kind:'flights',title,ids:filtered,scope,key:`flights-${++sequence.current}`}]);
  };
  const openFlight=(flight:RealFlightListItem)=>{
    setRawPage(0);setRawFlightId(null);setPicHelpOpen(false);Keyboard.dismiss();
    const card=ownFlightCard(flight),title=[card.date,card.registration].filter(Boolean).join(' · ')||'Flugdetails';
    setRoutes(previous=>[...previous,{kind:'detail',flightId:flight.flightId,title,key:`detail-${++sequence.current}`}]);void data.openDetail(flight);
  };
  const detail=data.detail?.flightId===(route.kind==='detail'?route.flightId:null)?data.detail:null;
  const items=route.kind==='flights'?selectStatisticsFlights(allUnique,route.scope,today).flights.filter(f=>route.ids.includes(f.flightId))
    .sort((a,b)=>(b.facts.assessment.date.value??'').localeCompare(a.facts.assessment.date.value??'')||a.flightId.localeCompare(b.flightId)):[];
  const scopeLabel=route.kind==='flights'?(()=>{const b=statisticsPeriodBounds(route.scope,today);return b?`${b.from} bis ${b.to}`:'gesamter gespeicherter Bestand';})():'';
  const defaultChart:ChartKind=initialChart??({overview:'monthly',aircraft:'aircraft',duration:'duration',launch:'launch',roles:'roles'} as const)[initialSection];
  return <View style={styles.content}>
    <AppHeader variant="page" back={()=>{if(!back())onClose();}} title={route.kind==='section'?'Flugstatistik':route.title}>{headerActions}</AppHeader>
    {feedback}
    <ScrollView ref={scroll} contentOffset={{x:0,y:scrollOffsets.current[route.key]??0}}
      onScroll={event=>{scrollOffsets.current[route.key]=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={32}
      onContentSizeChange={()=>scroll.current?.scrollTo({y:scrollOffsets.current[route.key]??0,animated:false})}
      keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[styles.canvas,fontScale>1.3&&{paddingHorizontal:10}]}>
      <View style={route.kind==='section'?undefined:{display:'none'}} accessibilityElementsHidden={route.kind!=='section'} importantForAccessibility={route.kind==='section'?'auto':'no-hide-descendants'}>
        {data.phase==='loading'&&<Card><ActivityIndicator color={colors.cyan}/><Label>Gespeicherte Flugstatistik wird geprüft.</Label></Card>}
        {data.phase==='failed'&&<Card><Empty title="Statistik nicht lesbar">Die gespeicherte Auswahl konnte nicht geprüft werden.</Empty><Action secondary onPress={()=>void data.reload()}>Gespeicherte Flüge erneut prüfen</Action></Card>}
        {data.phase!=='loading'&&data.phase!=='failed'&&!data.view?.snapshot.account&&<Empty title="Noch keine eigenen Flüge">Neue Daten erreichst du über Sync in der Kopfzeile.</Empty>}
        {data.phase==='ready'&&data.view?.snapshot.account&&<StatisticsExplorer flights={flights} saved={saved} today={today} period={period} onPeriod={setPeriod} initialChart={defaultChart} onFlights={openFlights} onBackHandler={handler=>{explorerBack.current=handler;}}/>}
        {data.phase==='ready'&&!!(data.view?.pendingCommand||data.view?.snapshot.recovery?.readOnly)&&<Label muted>Speicherung oder Wiederherstellung prüfen. Letzter geprüfter lokaler Stand.</Label>}
      </View>
      {route.kind==='flights'&&<><Label muted>{items.length} gespeicherte Flugbelege · {scopeLabel}</Label>{!items.length&&<Empty title="Keine passenden Flüge">Die gespeicherten Belege haben sich geändert. Zurück zur Statistik.</Empty>}<View style={{gap:5}}>{items.map(flight=><FlightCard key={`${flight.flightId}:${flight.factsRevision}`} flight={flight} onPress={()=>openFlight(flight)}/>)}</View></>}
      {route.kind==='detail'&&<StatisticsFlightDetails detail={detail} loading={data.detailBusy||data.phase==='loading'} error={!data.detailBusy&&!detail?data.detailError:null} rawPage={rawPage} onRawPage={setRawPage} rawExpanded={!!detail&&rawFlightId===detail.flightId} onToggleRaw={()=>{if(detail)setRawFlightId(current=>current===detail.flightId?null:detail.flightId);}} picHelpOpen={helpEnabled&&picHelpOpen} onTogglePicHelp={helpEnabled?()=>setPicHelpOpen(value=>!value):undefined} onMorePicHelp={helpEnabled&&onHelp?()=>{setPicHelpOpen(false);onHelp('pic');}:undefined} onRetry={()=>{const current=allUnique.find(f=>f.flightId===route.flightId);if(data.phase==='ready'&&current)void data.openDetail(current);else void data.reload();}} retryLabel={data.phase==='ready'&&allUnique.some(f=>f.flightId===route.flightId)?'Flugdetails erneut prüfen':'Gespeicherte Flüge erneut prüfen'}/>}
    </ScrollView>
  </View>;
}

function StatisticsFlightDetails({ detail, loading, error,rawPage,onRawPage,rawExpanded,onToggleRaw,picHelpOpen,onTogglePicHelp,onMorePicHelp,onRetry,retryLabel }: { detail: RealFlightDetail | null; loading: boolean; error: string | null;rawPage:number;onRawPage:(page:number)=>void;rawExpanded:boolean;onToggleRaw:()=>void;picHelpOpen:boolean;onTogglePicHelp?:()=>void;onMorePicHelp?:()=>void;onRetry:()=>void;retryLabel:string }) {
  if (loading) return <Card><ActivityIndicator color={colors.cyan} accessibilityLabel="Gespeicherte Flugdetails werden geprüft" /><Label muted>Flugdetails werden lokal geprüft.</Label></Card>;
  if (!detail) return <Card><Empty title="Flugdetails nicht verfügbar">{error ?? 'Die aktuelle gespeicherte Auswahl konnte nicht bestätigt werden. Kehre zur Statistik zurück und öffne den Flug erneut.'}</Empty><Action secondary onPress={onRetry}>{retryLabel}</Action></Card>;
  return <FlightDetails detail={detail} rawPage={rawPage} onRawPage={onRawPage} rawExpanded={rawExpanded} onToggleRaw={onToggleRaw} picHelpOpen={picHelpOpen} onTogglePicHelp={onTogglePicHelp} onMorePicHelp={onMorePicHelp}/>;
}

const styles=StyleSheet.create({content:{flex:1,minHeight:0,width:'100%'},canvas:{width:'100%',maxWidth:600,alignSelf:'center',padding:12,paddingBottom:26,gap:12}});

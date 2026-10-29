import React, { useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Action, Card, Chip, Label, colors, ui } from './theme';
import { SymbolIcon } from './SymbolIcon';
import { StatisticsCharts } from './StatisticsCharts';
import { chartDataset, emptyChartFilters, flightModel, type ChartFilters, type ChartKind } from './statistics-charts-model';
import { aircraftCategoryLabels, launchMethodLabels } from './flight-classification';
import { annualStatisticsComparison, flightRoleMetricLabels, statisticsYears, statisticsCoverageComplete, statisticsPeriodBounds, validStatisticsRange, type StatisticsPeriod } from './statistics-overlay-model';
import { formatReportedMinutes } from './real-flight-statistics';

export function StatisticsExplorer({ flights, saved, today, period, onPeriod, initialChart, onFlights, onBackHandler }: {
  flights: readonly RealFlightListItem[]; saved: readonly SavedFlightRetrieval[]; today: string; period: StatisticsPeriod;
  onPeriod: (period: StatisticsPeriod) => void; initialChart: ChartKind;
  onFlights: (title: string, ids: readonly string[], scope?: StatisticsPeriod) => void;
  onBackHandler: (handler: () => boolean) => void;
}) {
  const [filters, setFilters] = useState<ChartFilters>(emptyChartFilters), [draftFilters, setDraftFilters] = useState<ChartFilters>(emptyChartFilters);
  const [draftPeriod, setDraftPeriod] = useState<StatisticsPeriod>(period), [open, setOpen] = useState(false), [info, setInfo] = useState(false);
  const [chart, setChart] = useState<ChartKind>(initialChart);
  const [from, setFrom] = useState(`${today.slice(0,4)}-01-01`), [to, setTo] = useState(today);
  const toInput=useRef<TextInput>(null), chartBack=useRef<()=>boolean>(()=>false);
  const data=useMemo(()=>chartDataset(flights,period,today,filters),[flights,period,today,filters]);
  const years=useMemo(()=>statisticsYears(flights,saved,today),[flights,saved,today]);
  const models=useMemo(()=>[...new Set(flights.map(flightModel).filter(Boolean))].sort(),[flights]);
  const bounds=statisticsPeriodBounds(period,today), filterCount=Object.values(filters).filter(Boolean).length;
  const annual=useMemo(()=>info&&period.kind==='year'&&!filterCount?annualStatisticsComparison(flights,saved,today,period.year):null,[info,period,filterCount,flights,saved,today]);
  const change=(percent:number|null)=>percent===null?'nicht vergleichbar':`${percent>0?'+':''}${percent.toLocaleString('de-DE',{maximumFractionDigits:1})} %`;
  const filterLabels=[filters.category?aircraftCategoryLabels[filters.category as keyof typeof aircraftCategoryLabels]:null,filters.model,
    filters.launch?launchMethodLabels[filters.launch as keyof typeof launchMethodLabels]:null,
    filters.role?flightRoleMetricLabels[filters.role as keyof typeof flightRoleMetricLabels]:null].filter(Boolean);
  const close=()=>{Keyboard.dismiss();setOpen(false);};
  onBackHandler(()=>{if(open){close();return true;}if(chartBack.current())return true;if(info){setInfo(false);return true;}return false;});
  const openFilters=()=>{setDraftPeriod(period);setDraftFilters({...filters});if(period.kind==='custom'){setFrom(period.from);setTo(period.to);}Keyboard.dismiss();setOpen(true);};
  const optionGroup=(label:string,key:keyof ChartFilters,options:Record<string,string>)=><View style={{gap:6}}><Label style={{fontWeight:'600'}}>{label}</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}><Chip title="Alle" selected={!draftFilters[key]} onPress={()=>setDraftFilters({...draftFilters,[key]:''})}/>{Object.entries(options).map(([value,title])=><Chip key={value} title={title} selected={draftFilters[key]===value} onPress={()=>setDraftFilters({...draftFilters,[key]:value})}/>)}</View></View>;
  return <View style={{gap:10}}>
    <View style={[ui.row,{flexWrap:'wrap',gap:6}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Statistikzeitraum auswählen" onPress={openFilters} style={{minHeight:48,justifyContent:'center',paddingHorizontal:12,backgroundColor:colors.raised,borderRadius:12}}><Label>{period.kind==='year'?String(period.year):period.kind==='all'?'Alle Jahre':'Eigener Zeitraum'} ▾</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Statistikfilter öffnen" onPress={openFilters} style={[ui.row,{minHeight:48,paddingHorizontal:12,gap:6}]}><SymbolIcon name="filter" size={20}/><Label>Filter{filterCount?` · ${filterCount}`:''}</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Statistikdatenstand" accessibilityState={{expanded:info}} onPress={()=>setInfo(!info)} style={{marginLeft:'auto',minHeight:48,minWidth:44,alignItems:'center',justifyContent:'center'}}><SymbolIcon name="info" size={20}/></Pressable>
    </View>
    {filterLabels.length>0&&<Label muted>{filterLabels.join(' · ')}</Label>}
    <View style={[ui.row,{flexWrap:'wrap',gap:16}]}><Pressable accessibilityRole="button" accessibilityLabel="Alle gefilterten Flüge ansehen" disabled={!data.summary.count} onPress={()=>onFlights('Flüge der Auswahl',data.summary.supportingIds)} style={{minHeight:44,justifyContent:'center'}}><Label style={{fontSize:20,fontWeight:'700'}}>{data.summary.count} Flüge ›</Label></Pressable><Label>{data.summary.knownDurationCount?`${formatReportedMinutes(data.summary.knownMinutes)} h`:data.summary.count?'Zeit unbekannt':'—'} · {data.flyingDays} Flugtage</Label></View>
    {data.summary.count===0&&<Label muted>Keine gespeicherten Flüge für diese Auswahl. Zeitraum oder Filter ändern.</Label>}
    {bounds&&!statisticsCoverageComplete(saved,bounds.from,bounds.to)&&<Label muted style={{fontSize:12}}>Abdeckung lückenhaft ⓘ</Label>}
    {info&&<Card><Label>{bounds?`${bounds.from} – ${bounds.to}`:'Gesamter gespeicherter Bestand; keine bestätigte vollständige Fluggeschichte.'}</Label><Label>{data.summary.knownDurationCount} von {data.summary.count} Flügen mit bekannter Dauer. {data.unknownDateCount} ohne Datum; {data.conflictingIds.length} widersprüchliche Identitäten ausgeschlossen. Nullwerte und unbekannte Angaben bleiben getrennt. Nur gespeicherte Daten; kein Abruf beim Filtern.</Label>
      {annual&&<><Label>Vorjahr bis {annual.previous?.through??'—'}: {annual.previous?.count??'—'} Flüge · {annual.previous?.knownMinutes===null||!annual.previous?'Zeit unbekannt':`${formatReportedMinutes(annual.previous.knownMinutes)} h bekannt`}</Label><Label>Änderung Flüge: {change(annual.countChange.percent)} · bekannte Zeit: {change(annual.knownMinutesChange.percent)}</Label>{(annual.countChange.percent===null||annual.knownMinutesChange.percent===null)&&<Label muted>Fehlende/strittige Daten, lückenhafte Abdeckung oder ein Vorjahreswert von null können den Vergleich ausschließen.</Label>}{!!annual.previous?.supportingIds.length&&<Action secondary onPress={()=>onFlights('Vorjahresflüge',annual.previous!.supportingIds,{kind:'custom',from:annual.previous!.from,to:annual.previous!.through})}>Vorjahresflüge ansehen</Action>}</>}
      <Action secondary onPress={()=>setInfo(false)}>Datenstand schließen</Action></Card>}
    <StatisticsCharts key={JSON.stringify([period,filters])} flights={flights} saved={saved} today={today} period={period} filters={filters} initialChart={chart} onChartChange={setChart} onFlights={onFlights} onBackHandler={handler=>{chartBack.current=handler;}}/>
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,justifyContent:'flex-end',backgroundColor:'#000712bd'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Statistikfilter abbrechen" onPress={close} style={{flex:1,minHeight:20}}/>
        <View accessibilityViewIsModal style={{maxHeight:'88%',width:'100%',maxWidth:600,alignSelf:'center',backgroundColor:colors.card,borderTopLeftRadius:22,borderTopRightRadius:22,padding:16,gap:8}}>
          <View style={ui.row}><Label style={{flex:1,fontSize:20,fontWeight:'700'}}>Zeitraum & Filter</Label><Action secondary onPress={close}>Abbrechen</Action></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:18,paddingBottom:12}}>
            <View style={{gap:6}}><Label>Zeitraum</Label><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{years.map(year=><Chip key={year} title={String(year)} selected={draftPeriod.kind==='year'&&draftPeriod.year===year} onPress={()=>setDraftPeriod({kind:'year',year})}/>)}<Chip title="Alle Jahre" selected={draftPeriod.kind==='all'} onPress={()=>setDraftPeriod({kind:'all'})}/><Chip title="Eigener Zeitraum" selected={draftPeriod.kind==='custom'} onPress={()=>setDraftPeriod({kind:'custom',from,to})}/></View></View>
            {draftPeriod.kind==='custom'&&<View style={{gap:8}}><Label>Von · JJJJ-MM-TT</Label><TextInput accessibilityLabel="Zeitraum von" accessibilityHint="Datum im Format JJJJ-MM-TT" value={from} onChangeText={setFrom} returnKeyType="next" submitBehavior="submit" onSubmitEditing={()=>toInput.current?.focus()} autoCapitalize="none" autoCorrect={false} style={{minHeight:48,color:colors.text,borderWidth:1,borderColor:colors.muted,borderRadius:10,padding:10}}/><Label>Bis · JJJJ-MM-TT</Label><TextInput ref={toInput} accessibilityLabel="Zeitraum bis" accessibilityHint="Datum im Format JJJJ-MM-TT" value={to} onChangeText={setTo} onSubmitEditing={Keyboard.dismiss} returnKeyType="done" autoCapitalize="none" autoCorrect={false} style={{minHeight:48,color:colors.text,borderWidth:1,borderColor:colors.muted,borderRadius:10,padding:10}}/>{!validStatisticsRange(from,to)&&<View accessibilityLiveRegion="polite"><Label>Bitte gültige Kalendertage in aufsteigender Reihenfolge eingeben.</Label></View>}</View>}
            {optionGroup('Luftfahrzeugart','category',aircraftCategoryLabels)}
            {optionGroup('Muster','model',Object.fromEntries(models.map(model=>[model,model])))}
            {optionGroup('Startart','launch',launchMethodLabels)}
            {optionGroup('Flugrolle','role',flightRoleMetricLabels)}
            <Action secondary onPress={()=>{setDraftPeriod({kind:'year',year:Number(today.slice(0,4))});setDraftFilters({...emptyChartFilters});}}>Auswahl zurücksetzen</Action>
          </ScrollView>
          <Action disabled={draftPeriod.kind==='custom'&&!validStatisticsRange(from,to)} onPress={()=>{const next=draftPeriod.kind==='custom'?{kind:'custom' as const,from,to}:draftPeriod;if(next.kind==='custom'&&!validStatisticsRange(from,to))return;setFilters({...draftFilters});onPeriod(next);close();}}>Filter anwenden</Action>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}

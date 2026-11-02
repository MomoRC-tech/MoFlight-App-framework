import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Label, colors, ui } from './theme';
import { MonthlyBars, priorYearColor } from './MonthlyBars';
import { formatReportedMinutes } from './real-flight-statistics';
import { readChartPreference, saveChartPreference, defaultChartPreference, type ChartPreference } from './statistics-chart-preferences-native';
import { monthlyChartGroups, monthlyChartValue, emptyChartFilters } from './statistics-charts-model';

export function StartSeasonCharts({scope,flights,saved,year,today,onStatistics,persistent=true}: {
  scope:string; flights:readonly RealFlightListItem[]; saved:readonly SavedFlightRetrieval[]; year:number;today:string;
  onStatistics:()=>void; persistent?:boolean;
}) {
  const [preference,setPreference]=useState<ChartPreference>(defaultChartPreference),[error,setError]=useState(false);
  const [measure,setMeasure]=useState<'time'|'count'>('time');
  const revision=useRef(0);
  useEffect(()=>{let live=true;const start=revision.current;if(persistent)void readChartPreference(scope).then(value=>{if(live&&revision.current===start)setPreference({...value,chart:'monthly'});},()=>{if(live)setError(true);});return()=>{live=false;};},[scope,persistent]);
  const update=()=>{revision.current++;const next={chart:'monthly' as const,expanded:!preference.expanded};setPreference(next);if(persistent)void saveChartPreference(scope,next).then(()=>setError(false),()=>setError(true));};
  const monthly=useMemo(()=>monthlyChartGroups(flights,saved,year,today,emptyChartFilters),[flights,saved,year,today]);
  const current=monthly.map(pair=>pair[0]!),prior=monthly.map(pair=>pair[1]!);
  const incomplete=current.some(group=>!group.future&&(!group.covered||measure==='time'&&group.unknownDurationCount>0))||prior.some(group=>!group.future&&(!group.covered||!group.validComparison||measure==='time'&&group.unknownDurationCount>0));
  const format=(value:number)=>measure==='time'?`${formatReportedMinutes(value)} h`:`${value} Flüge`;
  return <View style={{gap:2,paddingBottom:4}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',columnGap:4}}>
      <View style={ui.segmented}>{(['time','count'] as const).map(key=><Pressable key={key} accessibilityRole="button" accessibilityLabel={key==='time'?'Flugzeit im Diagramm':'Fluganzahl im Diagramm'} accessibilityState={{selected:measure===key}} onPress={()=>setMeasure(key)} style={ui.segmentTouch}><View style={[ui.segmentFace,measure===key&&ui.segmentSelected]}><Label style={[ui.segmentText,measure===key&&ui.segmentTextSelected]}>{key==='time'?'Flugzeit':'Flüge'}</Label></View></Pressable>)}</View>
      <Pressable accessibilityRole="button" accessibilityLabel="Saisondiagramme" accessibilityHint="Monatsvergleich ein- oder ausblenden" accessibilityState={{expanded:preference.expanded}} onPress={update} style={{minHeight:48,minWidth:48,flexDirection:'row',alignItems:'center',gap:8}}>{[[year,colors.cyan],[year-1,priorYearColor]].map(([label,color])=><View key={label} style={{flexDirection:'row',alignItems:'center',gap:4}}><View style={{width:5,height:10,borderRadius:2,backgroundColor:String(color)}}/><Label muted style={{fontSize:11,lineHeight:16}}>{label}</Label></View>)}<Label muted style={{fontSize:16}}>{preference.expanded?'−':'+'}</Label></Pressable>
    </View>
    {preference.expanded&&<>
      <MonthlyBars values={current.map(group=>monthlyChartValue(group,measure))} prior={prior.map(group=>monthlyChartValue(group,measure,true))} uncertain={current.map(group=>!group.covered||measure==='time'&&group.unknownDurationCount>0)} priorUncertain={prior.map(group=>!group.covered||measure==='time'&&group.unknownDurationCount>0)} future={current.map(group=>group.future)} formatValue={format} onOpen={onStatistics} accessibilityLabel={`Monatsvergleich ${year} und ${year-1}, ${measure==='time'?'bekannte Flugzeit':'Flüge'}, bis zum gleichen Kalendertag. Statistik öffnen`}/>
      {incomplete&&<Label muted style={{fontSize:10,lineHeight:16}}>Unvollständig erfasst</Label>}
    </>}
    {error&&<Label muted>Diagrammauswahl konnte nicht gespeichert oder gelesen werden; gilt vorerst nur hier.</Label>}
  </View>;
}

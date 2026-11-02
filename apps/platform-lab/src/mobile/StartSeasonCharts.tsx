import React, { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Label, ui } from './theme';
import { MonthlyBars } from './MonthlyBars';
import { formatReportedMinutes } from './real-flight-statistics';
import { monthlyChartGroups, monthlyChartValue, emptyChartFilters } from './statistics-charts-model';

export function StartSeasonCharts({flights,saved,year,today,onStatistics,children}: {
  flights:readonly RealFlightListItem[]; saved:readonly SavedFlightRetrieval[]; year:number;today:string;
  onStatistics:()=>void; children?:React.ReactNode;
}) {
  const [measure,setMeasure]=useState<'time'|'count'>('time');
  const monthly=useMemo(()=>monthlyChartGroups(flights,saved,year,today,emptyChartFilters),[flights,saved,year,today]);
  const current=monthly.map(pair=>pair[0]!),prior=monthly.map(pair=>pair[1]!);
  const format=(value:number)=>measure==='time'?`${formatReportedMinutes(value)} h`:`${value} Flüge`;
  return <View style={{gap:0,paddingBottom:4}}>
    <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',columnGap:4}}>
      <View style={ui.segmented}>{(['time','count'] as const).map(key=><Pressable key={key} accessibilityRole="button" accessibilityLabel={key==='time'?'Flugzeit im Diagramm':'Fluganzahl im Diagramm'} accessibilityState={{selected:measure===key}} onPress={()=>setMeasure(key)} style={ui.segmentTouch}><View style={[ui.segmentFace,measure===key&&ui.segmentSelected]}><Label style={[ui.segmentText,measure===key&&ui.segmentTextSelected]}>{key==='time'?'Flugzeit':'Flüge'}</Label></View></Pressable>)}</View>
      {children}
    </View>
    <MonthlyBars year={year} values={current.map(group=>monthlyChartValue(group,measure))} prior={prior.map(group=>monthlyChartValue(group,measure,true))} uncertain={current.map(group=>!group.covered||measure==='time'&&group.unknownDurationCount>0)} priorUncertain={prior.map(group=>!group.covered||measure==='time'&&group.unknownDurationCount>0)} future={current.map(group=>group.future)} formatValue={format} onOpen={onStatistics} accessibilityLabel={`Monatsvergleich ${year} und ${year-1}, ${measure==='time'?'bekannte Flugzeit':'Flüge'}, bis zum gleichen Kalendertag. Lücken bleiben unbekannt, gestrichelte Balken sind unvollständig. Statistik öffnen`}/>
  </View>;
}

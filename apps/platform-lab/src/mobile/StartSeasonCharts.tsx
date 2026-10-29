import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Label, colors } from './theme';
import { StatisticsCharts } from './StatisticsCharts';
import { readChartPreference, saveChartPreference, defaultChartPreference, type ChartPreference } from './statistics-chart-preferences-native';
import type { ChartKind } from './statistics-charts-model';
import type { StatisticsPeriod } from './statistics-overlay-model';

export function StartSeasonCharts({scope,flights,saved,year,today,onFlights,onChartChange,onBackHandler,persistent=true}: {
  scope:string; flights:readonly RealFlightListItem[]; saved:readonly SavedFlightRetrieval[]; year:number;today:string;
  onFlights:(title:string,ids:readonly string[],period?:StatisticsPeriod)=>void; onChartChange:(chart:ChartKind)=>void;
  onBackHandler?:(handler:()=>boolean)=>void; persistent?:boolean;
}) {
  const [preference,setPreference]=useState<ChartPreference>(defaultChartPreference),[error,setError]=useState(false);
  const period=useMemo(()=>({kind:'year' as const,year}),[year]);
  const revision=useRef(0),back=useRef<()=>boolean>(()=>false);
  useEffect(()=>{let live=true;const start=revision.current;if(persistent)void readChartPreference(scope).then(value=>{if(live&&revision.current===start){setPreference(value);onChartChange(value.chart);}},()=>{if(live)setError(true);});return()=>{live=false;};},[scope,persistent]);
  const update=(value:ChartPreference)=>{revision.current++;setPreference(value);onChartChange(value.chart);if(persistent)void saveChartPreference(scope,value).then(()=>setError(false),()=>setError(true));};
  onBackHandler?.(()=>preference.expanded&&back.current());
  return <View style={{paddingVertical:4,gap:4}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Saisondiagramme" accessibilityState={{expanded:preference.expanded}} onPress={()=>update({...preference,expanded:!preference.expanded})} style={{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><Label style={{fontWeight:'600'}}>Diagramme</Label><Label style={{color:colors.cyan}}>{preference.expanded?'Einklappen ▴':'Anzeigen ▾'}</Label></Pressable>
    {preference.expanded&&<StatisticsCharts key={`${year}:${preference.chart}`} compact flights={flights} saved={saved} today={today} period={period} initialChart={preference.chart} onChartChange={chart=>update({...preference,chart})} onFlights={onFlights} onBackHandler={handler=>{back.current=handler;}}/>}
    {error&&<Label muted>Diagrammauswahl konnte nicht gespeichert oder gelesen werden; gilt vorerst nur hier.</Label>}
  </View>;
}

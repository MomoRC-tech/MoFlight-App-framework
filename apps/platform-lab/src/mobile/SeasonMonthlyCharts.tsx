import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Label, Section, colors } from './theme';
import { formatReportedMinutes } from './real-flight-statistics';
import type { SeasonMonth } from './season-dashboard-model';
const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export function SeasonMonthlyCharts({ series, fontScale = 1 }: { series: SeasonMonth[][]; fontScale?: number }) {
  const [metric, setMetric] = useState<'count'|'knownMinutes'>('count');
  const max = Math.max(1, ...series.flat().map(m => m[metric] ?? 0));
  const describe = (m: SeasonMonth) => `${m.year}: ${m.count === null ? 'Flugzahl unbekannt' : `${m.count} Flüge`}, ${m.knownMinutes === null ? 'Zeit unbekannt' : `${formatReportedMinutes(m.knownMinutes)} h bekannt`}, ${m.covered ? 'abgedeckt' : 'Abdeckung unvollständig'}, ${m.unknownDurationCount} Zeiten unbekannt/strittig`;
  return <View style={s.group}>
    <View style={s.header}><Section title="Monatsübersicht" /><View style={s.controls}><Chip title="Flüge" selected={metric==='count'} onPress={()=>setMetric('count')} /><Chip title="Flugstunden" selected={metric==='knownMinutes'} onPress={()=>setMetric('knownMinutes')} /></View></View>
    <Label key={`${metric}:${max}`} muted style={s.small}>{`0 – ${metric==='count'?`${max} Flüge`:`${formatReportedMinutes(max)} h bekannt`}`}</Label>
      <View style={s.chart}>{months.map((name,i)=>{
        const first=series[0]?.[i];
        return <View key={name} accessible accessibilityLabel={`${name}: ${first?.future?'zukünftig':series.map(y=>describe(y[i]!)).join('; ')}`} style={[s.month,{width:fontScale>1.3?'33.333333%':'16.666666%'}]}>
          <View style={s.pair}>{series.map(year=>{const m=year[i]!,value=m[metric];return <View key={m.year} style={s.slot}><View style={[s.bar,{height:value===null?0:Math.max(value>0?2:0,value/max*64),backgroundColor:year===series[0]?colors.cyan:'#7194be'},!m.covered&&s.partial]} />{!m.future&&(value===null||!m.covered)&&<Label muted style={s.marker}>{value===null?'?':'·'}</Label>}</View>;})}</View><Label muted style={s.monthLabel}>{name}</Label>
        </View>;
      })}</View>
    <View style={s.legend}>{series.map((year,index)=><View key={year[0]?.year ?? index} style={s.legendItem}><View style={[s.key,{backgroundColor:index===0?colors.cyan:'#7194be'}]} /><Label muted>{year[0]?.year}</Label></View>)}</View>
    <Label muted style={s.small}>Aktueller Monat in beiden Jahren bis zum gleichen Kalendertag. Zukünftige Monate bleiben leer. ? unbekannt · Abdeckung unvollständig.</Label>
  </View>;
}
const s=StyleSheet.create({group:{gap:8},header:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:4},controls:{flexDirection:'row',flexWrap:'wrap',gap:5},small:{fontSize:12,lineHeight:18},chart:{flexDirection:'row',flexWrap:'wrap',width:'100%',alignItems:'flex-end',paddingHorizontal:2},month:{minHeight:100,alignItems:'center'},pair:{flexDirection:'row',height:80,width:'100%'},slot:{flex:1,height:80,justifyContent:'flex-end',alignItems:'center'},bar:{width:'72%',minWidth:2},partial:{opacity:.5},marker:{fontSize:10,lineHeight:12,position:'absolute',top:0},monthLabel:{fontSize:12,lineHeight:18},legend:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:16},legendItem:{flexDirection:'row',alignItems:'center',gap:6},key:{width:8,height:8,borderRadius:4}});

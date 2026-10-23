import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Chip, Label, colors } from './theme';
import { formatReportedMinutes } from './real-flight-statistics';
import type { SeasonMonth } from './season-dashboard-model';
const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export function SeasonMonthlyCharts({ series }: { series: SeasonMonth[][]; fontScale?: number }) {
  const [metric, setMetric] = useState<'count'|'knownMinutes'>('count');
  const max = Math.max(1, ...series.flat().map(m => m[metric] ?? 0));
  const describe = (m: SeasonMonth) => `${m.year}: ${m.count === null ? 'Flugzahl unbekannt' : `${m.count} Flüge`}, ${m.knownMinutes === null ? 'Zeit unbekannt' : `${formatReportedMinutes(m.knownMinutes)} h bekannt`}, ${m.covered ? 'abgedeckt' : 'Abdeckung unvollständig'}, ${m.unknownDurationCount} Zeiten unbekannt/strittig`;
  return <View style={s.group}>
    <View style={s.controls}><Chip title="Flüge" selected={metric==='count'} onPress={()=>setMetric('count')} /><Chip title="Flugstunden" selected={metric==='knownMinutes'} onPress={()=>setMetric('knownMinutes')} /></View>
    <Label key={`${metric}:${max}`} muted style={s.small}>{`0 – ${metric==='count'?`${max} Flüge`:`${formatReportedMinutes(max)} h bekannt`}`}</Label>
      <View style={s.chart}>{months.map((name,i)=>{
        const first=series[0]?.[i];
        return <View key={name} accessible accessibilityLabel={`${name}: ${first?.future?'zukünftig':series.map(y=>describe(y[i]!)).join('; ')}`} style={s.month}>
          <View style={s.pair}>{series.map(year=>{
            const m=year[i]!,value=m[metric];
            const height=m.future||value===null?0:Math.max(value>0?2:0,value/max*64);
            const caption=value===null?'?':metric==='count'?String(value):formatReportedMinutes(value);
            return <View key={m.year} style={s.slot}>
              <View style={[s.bar,{height,backgroundColor:year===series[0]?colors.cyan:'#7194be'},!m.covered&&s.partial]} />
              {!m.future&&value!==0&&<Text maxFontSizeMultiplier={1} style={[s.barValue,{bottom:height+19}]}>{caption}{value!==null&&!m.covered?'·':''}</Text>}
            </View>;
          })}</View><Text maxFontSizeMultiplier={1} style={s.monthLabel}>{name}</Text>

        </View>;
      })}</View>
    <View style={s.legend}>{series.map((year,index)=><View key={year[0]?.year ?? index} style={s.legendItem}><View style={[s.key,{backgroundColor:index===0?colors.cyan:'#7194be'}]} /><Label muted>{year[0]?.year}</Label></View>)}</View>
    <Label muted style={s.small}>{metric==='knownMinutes'?'Werte: Stunden:Minuten. ':''}Dieser Monat: gleicher Kalendertag.{"\n"}? unbekannt · lückenhafte Quelle</Label>
  </View>;
}
const s=StyleSheet.create({group:{gap:8},controls:{flexDirection:'row',flexWrap:'wrap',gap:5},small:{fontSize:12,lineHeight:18},chart:{flexDirection:'row',flexWrap:'nowrap',width:'100%',alignItems:'flex-end',paddingHorizontal:0},month:{flex:1,minWidth:0,minHeight:124,alignItems:'center'},pair:{flexDirection:'row',height:108,width:'100%'},slot:{flex:1,height:108,justifyContent:'flex-end',alignItems:'center'},bar:{width:'62%',minWidth:2,borderTopLeftRadius:3,borderTopRightRadius:3},partial:{opacity:.5},barValue:{color:colors.text,fontSize:9,lineHeight:10,position:'absolute',width:42,textAlign:'left',transform:[{rotate:'-90deg'}]},monthLabel:{color:colors.muted,fontSize:10,lineHeight:16},legend:{flexDirection:'row',flexWrap:'wrap',justifyContent:'center',gap:16},legendItem:{flexDirection:'row',alignItems:'center',gap:6},key:{width:8,height:8,borderRadius:4}});

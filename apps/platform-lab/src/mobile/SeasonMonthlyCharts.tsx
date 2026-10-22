import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Action, Label, colors } from './theme';
import { formatReportedMinutes } from './real-flight-statistics';
import type { SeasonMonth } from './season-dashboard-model';
import type { OwnFlightRequest } from './own-flight-model';
const months = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
export function SeasonMonthlyCharts({ series, onFlights, selectionScope }: { series: SeasonMonth[][]; selectionScope: string | null; onFlights: (year?:number, request?:OwnFlightRequest)=>void }) {
  const [choice, select] = useState<{month:number;year:number;scope:string|null}|null>(null);
  const currentYear = series[0]?.[0]?.year;
  const selected = choice?.scope === selectionScope && choice?.year === currentYear && !series[0]?.[choice.month]?.future ? choice.month : null;
  const items = selected === null ? [] : series.map(year=>year[selected]!);
  return <View style={s.group}>
    <Label muted>{series[0]?.[0]?.year} (hell) · {series[1]?.[0]?.year} (blau)</Label>
    <ScrollView horizontal contentContainerStyle={s.scroll} showsHorizontalScrollIndicator>
      <View style={s.plots}>{(['count','knownMinutes'] as const).map(metric=>{
        const max=Math.max(1,...series.flat().map(m=>m[metric]??0));
        return <View key={metric} style={s.group}><Label>{metric==='count'?'Flüge pro Monat':'Gemeldete bekannte Stunden pro Monat'}</Label><Label muted style={s.small}>0 – {metric==='count'?max:`${formatReportedMinutes(max)} h`}</Label>
          <View style={s.chart}>{months.map((name,i)=>{
            const first=series[0]![i]!;
            const describe=(m:SeasonMonth)=>`${m.year}: ${m.count===null?'Flugzahl unbekannt':`${m.count} Flüge`}, ${m.knownMinutes===null?'Zeit unbekannt':`${formatReportedMinutes(m.knownMinutes)} h bekannt`}, ${m.covered?'abgedeckt':'Abdeckung unvollständig'}, ${m.unknownDurationCount} Zeiten unbekannt/strittig`;
            return <Pressable key={name} disabled={first.future} accessibilityRole="button" accessibilityLabel={`${name}: ${first.future?'zukünftig':series.map(y=>describe(y[i]!)).join('; ')}. Monatswerte auswählen.`} accessibilityState={{disabled:first.future,selected:selected===i}} onPress={()=>select({month:i,year:first.year,scope:selectionScope})} style={[s.target,selected===i&&s.selected]}>
              <View style={s.pair}>{series.map((year,j)=>{const m=year[i]!,value=m[metric];return <View key={m.year} style={s.slot}><View style={[s.bar,{height:value===null?0:Math.max(value>0?2:0,value/max*64),backgroundColor:j===0?colors.cyan:colors.blue},!m.covered&&s.partial]} />{!m.future&&(value===null||!m.covered)&&<Label muted style={s.marker}>{value===null?'?':'·'}</Label>}</View>;})}</View><Label muted style={s.monthLabel}>{name}</Label>
            </Pressable>;
          })}</View></View>;
      })}</View>
    </ScrollView>
    <Label muted style={s.small}>Monate horizontal verschieben. Aktueller Monat in beiden Jahren bis zum gleichen Kalendertag. Zukünftige Monate bleiben leer. ? unbekannt · Abdeckung unvollständig.</Label>
    {items.map(item=><View key={item.year} style={s.selection}><Label>{months[item.month-1]} {item.year} · {item.from} – {item.to}</Label><Label>{item.count===null?'Flugzahl unbekannt':`${item.count} gespeicherte Flüge`} · {item.knownMinutes===null?'Zeit unbekannt':`${formatReportedMinutes(item.knownMinutes)} h bekannt`}</Label><Label muted>{item.covered?'Zeitraum abgedeckt':'Abdeckung unvollständig – gespeicherte Teilmenge'} · {item.unknownDurationCount} Zeiten unbekannt/strittig</Label><Action secondary onPress={()=>onFlights(item.year,{year:item.year,dateRange:{from:item.from,to:item.to}})}>Flüge {months[item.month-1]} {item.year} ansehen</Action></View>)}
  </View>;
}
const s=StyleSheet.create({group:{gap:5},small:{fontSize:11,lineHeight:16},scroll:{paddingBottom:5},plots:{width:576,gap:10},chart:{flexDirection:'row',width:'100%',alignItems:'flex-end'},target:{width:48,minHeight:96,alignItems:'center',borderBottomWidth:2,borderColor:'transparent'},selected:{borderColor:colors.cyan},pair:{flexDirection:'row',height:80,width:'100%'},slot:{flex:1,height:80,justifyContent:'flex-end',alignItems:'center'},bar:{width:'72%',minWidth:2},partial:{opacity:.5},marker:{fontSize:10,lineHeight:12,position:'absolute',top:0},monthLabel:{fontSize:11,lineHeight:16},selection:{borderTopWidth:1,borderColor:colors.border,paddingTop:8,gap:5}});

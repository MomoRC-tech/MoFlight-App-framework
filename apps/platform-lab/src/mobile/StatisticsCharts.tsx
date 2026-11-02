import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Card, Label, Action, Chip, colors, ui } from './theme';
import { MetricOrbit } from './SeasonRing';
import { TrendChart } from './TrendChart';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { formatReportedMinutes } from './real-flight-statistics';
import { type StatisticsPeriod, statisticsPeriodBounds } from './statistics-overlay-model';
import { classifyAircraft } from './flight-classification';
import { classifyFlightRoleMetric, flightRoleShortLabels } from './flight-role-metric';
import {
  chartNames, chartOrder, chartDataset, monthlyChartGroups, monthlyChartValue, groupChartFlights, calendarChartDays,
  quantile, nearestChartPoints, emptyChartFilters,
  type ChartKind, type ChartFilters, type AircraftGrouping, type ChartGroup,
} from './statistics-charts-model';

const secondColor = colors.blue, medianColor = '#efc37a';
const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const icons: Record<ChartKind, SymbolName> = { monthly: 'chart', timeline: 'glider', aircraft: 'flight-paper-plane', launch: 'arrow', launchDuration: 'clock', duration: 'clock', roles: 'club', days: 'calendar-neutral' };
const explanations: Record<ChartKind, string> = {
  monthly: 'Flugzeit oder Fluganzahl teilen sich eine Monatsachse. Die geglättete Linie ist nur Darstellung zwischen beobachteten Monatswerten, kein zusätzlicher Messwert. Flächen enden an Lücken; offene Punkte bleiben unverbunden. Die Linien zeigen bekannte Flugzeit für das ausgewählte Jahr und das Vorjahr bis zum gleichen Kalendertag. Eine Linie verbindet nur aufeinanderfolgende Monate mit vollständiger Abdeckung und bekannten Zeiten; Punkte bei lückenhafter Abdeckung bleiben einzeln. Die Auswahl Flüge zeigt die gespeicherte Fluganzahl. Zukünftige Monate bleiben leer; offene Punkte kennzeichnen unvollständige Werte. Tippe ins Diagramm oder öffne Werte & Flüge für Monat, Werte und genaue Flüge.',
  timeline: 'Ein Punkt je Flug mit bekanntem Datum und bekannter Dauer. Goldene Abschnitte zeigen den Median des Monats, ohne Monate zu verbinden. Der Median teilt die bekannten Dauern in zwei gleich große Gruppen. Tippe auf einen Punkt; gleiche Werte bleiben gemeinsam erreichbar. Längere Flüge belegen keinen Ausbildungsfortschritt.',
  aircraft: 'Je Gruppe siehst du die Anzahl Flüge und die bekannte gemeldete Flugzeit. Beide Balken beginnen bei null und haben jeweils eine gemeinsame Skala über alle Gruppen. Die Skalen haben unterschiedliche Einheiten; Balkenlängen nur innerhalb derselben Kennzahl vergleichen. Fehlende Dauern sind keine Nullzeiten.',
  launch: 'Nur ausdrücklich als Segelflugzeug erfasste Flüge. Jede Startart zeigt Anzahl und bekannte gemeldete Flugzeit auf getrennten, über alle Gruppen gleichen Skalen. Fehlende Dauer bleibt unbekannt. Startart wird nicht aus dem Flugzeug abgeleitet. Die Detailansicht zeigt Dauer und Streuung; sie erklärt keine Ursache.',
  launchDuration: 'Nur Segelflug. Punkte: einzelne bekannte Flugdauern. Band: mittlere 50 % (25.–75. Perzentil), Strich: Median. Quantile werden linear interpoliert. Alle Gruppen teilen dieselbe Dauerskala. Kleine Stichproben bleiben als solche sichtbar; keine geschätzte Dichtekurve.',
  duration: 'Anzahl Flüge je gemeldeter Dauergruppe. Bekannte Null bleibt Null; fehlende oder widersprüchliche Dauer wird separat gezählt. Keine Berechnung aus Start- und Landeuhrzeiten.',
  roles: 'Exklusive Quellengruppen: Solo = Pilot als PIC ohne Begleiter. Dual = Pilot als SIC, Begleiter als PIC und positive Dual-Zeit. PIC+ = Pilot als PIC mit Begleitperson(en), ohne SIC oder Dual-Zeit. Unklare Rollen bleiben sichtbar. Begleitperson bedeutet nicht automatisch Passagier; keine rechtliche Anrechnung.',
  days: 'Ein Flugtag ist ein gespeicherter Kalendertag mit mindestens einem passenden Flug. Im Kalender: – = nicht vollständig abgedeckt; / = zukünftig. Helle Zellen enthalten mehr Flüge. Lücken sind nur bei vollständiger Quellenabdeckung als flugfrei belegt.',
};
interface Selection { title: string; lines: string[]; ids: string[]; scope?: StatisticsPeriod; additional?: { label: string; title: string; ids: string[]; scope: StatisticsPeriod }[] }
export interface StatisticsChartsProps {
  flights: readonly RealFlightListItem[]; saved: readonly SavedFlightRetrieval[]; today: string; period: StatisticsPeriod;
  dataset?: ReturnType<typeof chartDataset>; filters?: ChartFilters; initialChart?: ChartKind; compact?: boolean; onChartChange?: (chart: ChartKind) => void;
  onFlights: (title: string, ids: readonly string[], scope?: StatisticsPeriod) => void;
  onBackHandler?: (handler: () => boolean) => void;
}
const time = (minutes: number) => `${formatReportedMinutes(minutes)} h`;
const durationText = (g: ChartGroup) => g.knownDurationCount ? time(g.knownMinutes) : g.count ? 'Zeit unbekannt' : '0:00 h';

/** Only the active chart is mounted. All values come from the saved, reconciled selection. */
export function StatisticsCharts({ flights, saved, today, period, dataset: providedDataset, filters = emptyChartFilters, initialChart = 'monthly', compact = false, onChartChange, onFlights, onBackHandler }: StatisticsChartsProps) {
  const {fontScale}=useWindowDimensions();
  const [chart, setChart] = useState<ChartKind>(initialChart === 'monthly' && period.kind !== 'year' ? 'timeline' : initialChart);
  const [picker, setPicker] = useState(false), [info, setInfo] = useState(false), [values, setValues] = useState(false);
  const [grouping, setGrouping] = useState<AircraftGrouping>('category'), [calendar, setCalendar] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null), [width, setWidth] = useState(280);
  const [measure,setMeasure]=useState<'time'|'count'>('time'),[monthFocus,setMonthFocus]=useState<number|null>(null);
  useEffect(()=>{setSelection(null);setMonthFocus(null);},[flights,period,filters]);
  const dataset = useMemo(() => providedDataset ?? chartDataset(flights, period, today, filters), [providedDataset, flights, period, today, filters]);
  const bounds = statisticsPeriodBounds(period, today);
  const monthly = useMemo(() => chart === 'monthly' && period.kind === 'year' ? monthlyChartGroups(flights, saved, period.year, today, filters) : [], [chart, flights, saved, period, today, filters]);
  const launchRows = useMemo(() => chart === 'launch' || chart === 'launchDuration' ? dataset.rows.filter(f => classifyAircraft(f.facts.assessment).key === 'glider') : [], [chart, dataset]);
  const groups = useMemo(() => chart === 'aircraft' ? groupChartFlights(dataset.rows, grouping)
    : chart === 'roles' ? groupChartFlights(dataset.rows, 'roles')
    : chart === 'launch' || chart === 'launchDuration' ? groupChartFlights(launchRows, 'launch') : [], [chart, grouping, dataset, launchRows]);
  const days = useMemo(() => chart === 'days' && period.kind === 'year' ? calendarChartDays(flights, saved, period.year, today, filters) : [], [chart, period, flights, saved, today, filters]);
  const changeChart = (next: ChartKind) => { setChart(next); setSelection(null); setMonthFocus(null); setPicker(false); setInfo(false); setValues(false); onChartChange?.(next); };
  onBackHandler?.(() => { if (selection) { setSelection(null); setMonthFocus(null); return true; } if (info || values || picker) { setInfo(false); setValues(false); setPicker(false); return true; } if (calendar) { setCalendar(false); return true; } return false; });
  const selectGroup = (g: ChartGroup) => setSelection({ title: g.label, lines: [`${g.count} Flüge · ${durationText(g)}`, ...(chart==='launchDuration'?[`n=${g.minutes.length} · Median ${g.median===null?'—':`${g.median.toLocaleString('de-DE')} min`}`,`Mittlere 50 %: ${g.q1===null?'—':g.q1.toLocaleString('de-DE')}–${g.q3===null?'—':g.q3.toLocaleString('de-DE')} min`]:[]), ...(g.unknownDurationCount ? [`${g.unknownDurationCount} Dauern unbekannt`] : [])], ids: g.supportingIds });
  const visibleGroups = compact && !values ? groups.slice(0, 4) : groups;
  const supervisedSolo=useMemo(()=>chart==='roles'?dataset.rows.filter(f=>classifyFlightRoleMetric(f.facts.assessment).soloWithPermission):[],[chart,dataset]);
  const summary = dataset.summary;
  const height = compact ? 144 : 185;
  const plotWidth = Math.max(180, width - 38);
  const monthAxis=()=>{
    const ticks=width/fontScale>=420?monthNames.map((_,i)=>i):width/fontScale>=240?[0,2,4,6,8,11]:[0,4,8,11];
    const labelWidth=Math.max(40,30*fontScale);
    return <View accessibilityLabel="Monatsachse Januar bis Dezember" style={{height:20*fontScale,position:'relative'}}>{ticks.map(i=><View key={i} style={{position:'absolute',left:Math.max(0,Math.min(width-labelWidth,(i+.5)/12*width-labelWidth/2)),width:labelWidth}}><Label muted style={[s.tick,{textAlign:'center'}]}>{monthNames[i]}</Label></View>)}</View>;
  };
  const dot = (x: number, y: number, color: string, key: string, size = 7) => <View key={key} style={{ position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
  const guide = (x: number, y: number, w: number, color = colors.border) => <View style={{ position: 'absolute', left: x, top: y, width: Math.max(1, w), height: 1, backgroundColor: color }} />;
  const axes = (max: number, unit: string, content: React.ReactNode, labels: string[], onTouch?: (x: number, y: number) => void) => <View>
    <Label muted style={s.small}>{unit}</Label>
    <View style={{ height: height + 12, marginTop: 8 }}>
      {[0, .5, 1].map(v => <View key={v} style={{ position: 'absolute', top: 5 + height * (1-v), width: '100%' }}><Label muted style={[s.tick, { position:'absolute', left:0, top:-8 }]}>{(v*max).toLocaleString('de-DE', {maximumFractionDigits:1})}</Label><View style={{ marginLeft:38, height:1, backgroundColor:colors.border }}/></View>)}
      <View style={{ position:'absolute', left:38, right:0, top:0, height:height+12 }} pointerEvents="none">{content}</View>
      {onTouch && <Pressable accessibilityRole="button" accessibilityLabel="Diagrammpunkt auswählen. Alternativ Werte und Flüge öffnen." onPress={e=>onTouch(e.nativeEvent.locationX,e.nativeEvent.locationY)} style={{position:'absolute',left:38,right:0,top:0,height:height+12}}/>}
    </View>
    <View style={{marginLeft:38,flexDirection:'row',justifyContent:'space-between',gap:4}}>{labels.map((label,i)=><Label key={i} muted style={s.tick}>{label}</Label>)}</View>
  </View>;
  let content: React.ReactNode;
  if (chart === 'monthly') {
    if (period.kind !== 'year') content = <Label muted>Für den Monatsvergleich bitte ein Jahr im Filter auswählen.</Label>;
    else {
      const current=monthly.map(pair=>pair[0]!),previous=monthly.map(pair=>pair[1]!);
      const value=(g:typeof current[number],prior=false)=>monthlyChartValue(g,measure,prior);
      const format=(n:number)=>measure==='time'?time(n):`${n} Flüge`;
      const focused=monthFocus===null?null:current[monthFocus],focusedPrior=monthFocus===null?null:previous[monthFocus];
      const selectMonth=(index:number)=>{
        const now=current[index]!,prior=previous[index]!;if(now.future)return;
        setMonthFocus(index);
        const fact=(g:typeof now)=>`${g.key.slice(0,4)}: ${g.count} Flüge · ${durationText(g)} · ${g.covered?'abgedeckt':'Abdeckung lückenhaft'}${g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten unbekannt`:''}${!g.validComparison?' · kein gleicher Kalendertag im Vorjahr':''}`;
        const scope=(g:typeof now):StatisticsPeriod=>({kind:'custom',from:g.from,to:g.to});
        setSelection({title:`${monthNames[index]} · ${period.year}`,lines:[fact(now),fact(prior)],ids:now.supportingIds,scope:scope(now),additional:prior.supportingIds.length?[{label:`Vorjahresflüge ansehen · ${prior.supportingIds.length}`,title:`${monthNames[index]} · ${period.year-1}`,ids:prior.supportingIds,scope:scope(prior)}]:undefined});
      };
      content=<View style={{gap:8}}>
        <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:8}}>
          <View style={ui.segmented}>{(['time','count'] as const).map(key=><Pressable key={key} accessibilityRole="button" accessibilityLabel={key==='time'?'Flugzeit im Diagramm':'Fluganzahl im Diagramm'} accessibilityState={{selected:measure===key}} onPress={()=>setMeasure(key)} style={ui.segmentTouch}><View style={[ui.segmentFace,measure===key&&ui.segmentSelected]}><Label style={[ui.segmentText,measure===key&&ui.segmentTextSelected]}>{key==='time'?'Flugzeit':'Flüge'}</Label></View></Pressable>)}</View>
          <View style={{flexDirection:'row',gap:12,alignItems:'center'}}><Label style={{fontSize:11,color:colors.cyan}}>● {period.year}</Label><View style={{flexDirection:"row",alignItems:"center",gap:4}}><View style={{width:12,borderTopWidth:1.5,borderColor:colors.orange,borderStyle:"dashed"}}/><Label style={{fontSize:11,color:colors.orange}}>{period.year-1}</Label></View></View>
        </View>
        {focused&&<View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'baseline',gap:8,flexWrap:'wrap'}}><View><Label muted style={s.small}>{monthNames[monthFocus!]} {period.year}</Label><Label style={{fontSize:28,lineHeight:36,fontWeight:'600',fontVariant:['tabular-nums']}}>{value(focused)===null?'—':format(value(focused)!)}</Label></View><Label muted style={s.small}>{period.year-1} · {focusedPrior&&value(focusedPrior,true)!==null?format(value(focusedPrior,true)!):'—'}</Label></View>}
        <TrendChart values={current.map(g=>value(g))} prior={previous.map(g=>value(g,true))} uncertain={current.map(g=>!g.covered||measure==='time'&&g.unknownDurationCount>0)} priorUncertain={previous.map(g=>!g.covered||measure==='time'&&g.unknownDurationCount>0)} labels={monthNames} selectedIndex={monthFocus} onSelect={selectMonth} height={compact?150:190} color={colors.cyan} formatValue={format} accessibilityLabel={measure==='time'?'Monat im Flugzeitdiagramm auswählen':'Monat im Fluganzahldiagramm auswählen'}/>
        {(current.some(g=>!g.future&&(!g.covered||g.unknownDurationCount>0)))&&<Label muted style={s.small}>Lücken / offene Punkte · unvollständig</Label>}
      </View>;
    }
  } else if (chart === 'timeline') {
    const points=dataset.points, from=period.kind==='year'?`${period.year}-01-01`:bounds?.from??points.map(p=>p.date).sort()[0]??today;
    const to=period.kind==='year'?`${period.year}-12-31`:bounds?.to??points.map(p=>p.date).sort().at(-1)??today;
    const span=Math.max(86400000,Date.parse(to)-Date.parse(from)), max=Math.max(60,...points.map(p=>p.minutes))*1.06;
    const px=(date:string)=>5+(Date.parse(date)-Date.parse(from))/span*(plotWidth-10), py=(m:number)=>5+height-m/max*height;
    const months=[...new Set(points.map(p=>p.date.slice(0,7)))];
    content=<View style={{gap:8}}>{axes(max/60,'Dauer · h',<>{points.map(p=>dot(px(p.date),py(p.minutes),colors.cyan,p.id))}{months.map(month=>{
      const values=points.filter(p=>p.date.startsWith(month)),median=quantile(values.map(p=>p.minutes),.5)!;
      const date=`${month}-15`;return <React.Fragment key={month}>{guide(Math.max(0,px(date)-8),py(median),16,medianColor)}</React.Fragment>;
    })}</>,period.kind==='year'?['Jan','Apr','Jul','Okt','Dez']:[from,to],(x,y)=>{
      const nearest=points.reduce<typeof points[number]|null>((best,p)=>!best||Math.hypot(px(p.date)-x,py(p.minutes)-y)<Math.hypot(px(best.date)-x,py(best.minutes)-y)?p:best,null);
      const medianMonth=months.find(month=>Math.abs(px(`${month}-15`)-x)<=12&&Math.abs(py(quantile(points.filter(p=>p.date.startsWith(month)).map(p=>p.minutes),.5)!)-y)<=10);
      if(medianMonth&&(!nearest||Math.hypot(px(nearest.date)-x,py(nearest.minutes)-y)>8)){
        const rows=points.filter(p=>p.date.startsWith(medianMonth)),median=quantile(rows.map(p=>p.minutes),.5)!;
        setSelection({title:`Median ${medianMonth}`,lines:[`${median.toLocaleString('de-DE')} min · n=${rows.length}`],ids:rows.map(p=>p.id)});return;
      }
      if(nearest&&Math.hypot(px(nearest.date)-x,py(nearest.minutes)-y)<32){const matches=nearestChartPoints(points,nearest.date,nearest.minutes);setSelection({title:nearest.date,lines:[`${time(nearest.minutes)} · ${matches.length} ${matches.length===1?'Flug':'Flüge'}`,nearest.model||'Muster unbekannt'],ids:matches.map(p=>p.id)});}
    })}<Label muted style={s.small}>● Einzelne Flüge · goldene Abschnitte: Monatsmedian</Label>{!points.length&&<Label muted>Keine Flüge mit bekanntem Datum und bekannter Dauer.</Label>}</View>;
  } else if (chart === 'duration') {
    const max=Math.max(1,...dataset.durations.bands.map(b=>b.count));
    content=<View style={{gap:8}}>{dataset.durations.bands.map(b=>{
      const label=b.through===null?`${b.from}+ min`:`${b.from}–${b.through} min`;
      return <Pressable key={b.id} accessibilityRole="button" accessibilityLabel={`${label}, ${b.count} Flüge`} onPress={()=>setSelection({title:label,lines:[`${b.count} Flüge`],ids:b.supportingIds})} style={s.barRow}><View style={ui.row}><Label style={{flex:1}}>{label}</Label><Label>{b.count}</Label></View><View style={s.track}><View style={[s.fill,{width:`${b.count/max*100}%`}]}/></View></Pressable>;
    })}{dataset.durations.unknownIds.length>0&&<Action secondary onPress={()=>onFlights('Flugzeit unbekannt',dataset.durations.unknownIds)}>Unbekannte Dauer · {dataset.durations.unknownIds.length}</Action>}</View>;
  } else if (chart === 'days') {
    if(period.kind!=='year') content=<Label>{dataset.flyingDays} gespeicherte Flugtage im gewählten Zeitraum. Für den Jahreskalender ein Jahr auswählen.</Label>;
    else if(calendar){
      const offset=(new Date(`${period.year}-01-01T12:00:00Z`).getUTCDay()+6)%7;
      content=<View style={{gap:8}}><Label>{dataset.flyingDays} Flugtage · {period.year}</Label><ScrollView horizontal showsHorizontalScrollIndicator accessibilityLabel="Jahreskalender, horizontal blättern"><View style={{flexDirection:'row',gap:3}}>{Array.from({length:Math.ceil((days.length+offset)/7)},(_,week)=><View key={week} style={{gap:3}}>{<Label muted style={{fontSize:11,height:20}}>{days[week*7-offset]?.date.slice(8)==='01'||days[(week+1)*7-offset-1]?.date.slice(5,7)!==days[week*7-offset]?.date.slice(5,7)?monthNames[Number((days[(week+1)*7-offset-1]??days[week*7-offset])?.date.slice(5,7)??1)-1]:''}</Label>}{Array.from({length:7},(_,weekday)=>{
        const day=days[week*7+weekday-offset];return day?<Pressable key={weekday} accessibilityRole="button" accessibilityLabel={`${day.date}, ${day.count} Flüge, ${day.future?'zukünftig':day.covered?'abgedeckt':'Abdeckung lückenhaft'}`} disabled={day.future} onPress={()=>setSelection({title:day.date,lines:[`${day.count} Flüge · ${durationText(day)}`,day.covered?'Abgedeckt':'Abdeckung lückenhaft'],ids:day.supportingIds})} style={[s.day,{backgroundColor:day.count?colors.cyan:colors.raised,opacity:day.count?Math.min(1,.4+day.count*.15):1}]}><Label style={{fontSize:12,color:day.count?colors.background:colors.muted}}>{day.future?'/':!day.covered?'-':''}</Label></Pressable>:<View key={weekday} style={s.day}/>;
      })}</View>)}</View></ScrollView><View style={s.wrap}>{[1,2,3,4].map(count=><View key={count} style={[ui.row,{gap:4}]}><View style={{width:12,height:12,backgroundColor:colors.cyan,opacity:Math.min(1,.4+count*.15)}}/><Label muted style={s.small}>{count===4?'4+':count} Flüge</Label></View>)}</View><Label muted style={s.small}>Spalten: Wochen · Zeilen: Mo–So · / zukünftig · – lückenhaft</Label></View>;
    } else {
      const groups=monthNames.map((name,i)=>{const month=String(i+1).padStart(2,'0'),selected=days.filter(d=>d.date.slice(5,7)===month),active=selected.filter(d=>d.count>0);return{name,count:active.length,ids:active.flatMap(d=>d.supportingIds),future:selected.every(d=>d.future),partial:selected.some(d=>!d.future&&!d.covered)};});
      const max=Math.max(1,...groups.map(g=>g.count));content=<View style={{gap:8}}><Label>{dataset.flyingDays} Flugtage · {period.year}</Label><View style={{height:126,flexDirection:'row',gap:2}}>{groups.map((g,i)=><Pressable key={i} disabled={g.future} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.count} Flugtage${g.partial?', lückenhafte Quelle':''}`} onPress={()=>setSelection({title:g.name,lines:[`${g.count} Flugtage`,g.partial?'Abdeckung lückenhaft':'Abgedeckt'],ids:g.ids})} style={s.monthSlot}><View style={{height:100,justifyContent:'flex-end',alignItems:'center',width:'100%'}}><View style={{height:g.count/max*90,width:'65%',backgroundColor:colors.cyan}}/>{g.partial&&<Label muted style={s.tick}>·</Label>}</View></Pressable>)}</View>{monthAxis()}<Action secondary onPress={()=>setCalendar(true)}>Jahreskalender öffnen</Action></View>;
    }
  } else if (chart === 'launchDuration') {
    const max=Math.max(60,...groups.flatMap(g=>g.minutes));
    content=<View style={{gap:14}}><Label muted style={s.small}>Segelflug · gemeinsame Skala 0–{time(max)}</Label>{visibleGroups.map(g=><Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${g.minutes.length} bekannte Dauern, Median ${g.median===null?'unbekannt':g.median+' Minuten'}`} onPress={()=>selectGroup(g)} style={{gap:4,minHeight:76}}><Label>{g.label} · n={g.minutes.length}</Label><View style={{height:32,marginHorizontal:6}}>{g.q1!==null&&g.q3!==null&&<View style={{position:'absolute',left:`${g.q1/max*100}%`,width:`${(g.q3-g.q1)/max*100}%`,height:18,top:7,backgroundColor:colors.border}}/>}{g.minutes.map((m,i)=><View key={i} style={{position:'absolute',left:`${m/max*100}%`,top:5+(i%3)*7,width:5,height:5,borderRadius:3,backgroundColor:colors.cyan}}/>)}{g.median!==null&&<View style={{position:'absolute',left:`${g.median/max*100}%`,height:28,width:2,backgroundColor:colors.text}}/>}</View><Label muted style={s.small}>Median {g.median===null?'—':`${g.median.toLocaleString('de-DE')} min`}{g.minutes.length<5?' · kleine Stichprobe':''}{g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten unbekannt`:''}</Label></Pressable>)}{!groups.length&&<Label muted>Keine passenden gespeicherten Segelflüge.</Label>}</View>;
  } else {
    const total=groups.reduce((n,g)=>n+g.knownMinutes,0),count=groups.reduce((n,g)=>n+g.count,0);
    const maxCount=Math.max(1,...groups.map(g=>g.count)),maxMinutes=Math.max(1,...groups.map(g=>g.knownMinutes));
    content=<View style={{gap:10}}>{chart==='aircraft'&&<View style={s.wrap}>{(['category','model','registration'] as const).map(key=><Chip key={key} title={{category:'Art',model:'Muster',registration:'Kennzeichen'}[key]} selected={grouping===key} onPress={()=>{setGrouping(key);setSelection(null);}}/>)}</View>}
      {(chart==='launch')&&<Label muted style={s.small}>Nur Segelflug · {count} Flüge · {time(total)} bekannt</Label>}
      {chart!=='roles'&&groups.length>0&&<Label muted style={s.small}>Getrennte Skalen · Flüge: 0–{maxCount} · bekannte Zeit: {groups.some(g=>g.knownDurationCount>0)?`0–${time(Math.max(0,...groups.map(g=>g.knownMinutes)))}`:'unbekannt'}</Label>}
      {chart==='roles'&&groups.length>0&&<View style={{flexDirection:fontScale>1.3?'column':'row',alignItems:'center',gap:16,paddingVertical:12}}><MetricOrbit size={148} total={count} parts={groups.map(g=>({value:g.count,color:({solo:colors.cyan,dualInstruction:colors.green,picWithCompanion:colors.orange} as Record<string,string>)[g.key]??colors.muted}))}><Label style={{fontSize:30,lineHeight:36,fontWeight:'600'}}>{count}</Label><Label muted style={s.small}>Flüge</Label></MetricOrbit><View style={{flex:1,alignSelf:'stretch',justifyContent:'center',gap:4}}>{groups.map(g=><Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${g.count} Flüge, ${durationText(g)}${g.unknownDurationCount?`, ${g.unknownDurationCount} unbekannte Dauern`:''}`} onPress={()=>selectGroup(g)} style={{minHeight:48,flexDirection:'row',alignItems:'center',gap:8}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:({solo:colors.cyan,dualInstruction:colors.green,picWithCompanion:colors.orange} as Record<string,string>)[g.key]??colors.muted}}/><Label style={{flex:1,fontSize:13}}>{flightRoleShortLabels[g.key as keyof typeof flightRoleShortLabels]??'Ungeklärt'}</Label><View style={{alignItems:'flex-end'}}><Label style={{fontSize:13,fontWeight:'600',fontVariant:['tabular-nums']}}>{g.count}</Label><Label muted style={{fontSize:11}}>{durationText(g)}</Label></View><Label muted>›</Label></Pressable>)}</View></View>}
      {(chart==='roles'?[]:visibleGroups).map(g=><Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${g.count} Flüge, ${durationText(g)}${g.unknownDurationCount?`, ${g.unknownDurationCount} unbekannte Dauern`:''}`} onPress={()=>selectGroup(g)} style={[s.barRow,chart!=='roles'&&s.comparisonRow]}>
        <View style={ui.row}><Label style={{flex:1,fontWeight:'600'}}>{g.label}</Label><Label muted>›</Label></View>
        <>
          <View style={s.measure}><View style={s.measureLabel}><Label muted style={s.small}>Flüge</Label><Label style={s.number}>{g.count}</Label></View><View style={s.track}><View style={[s.fill,{backgroundColor:secondColor,width:`${g.count/maxCount*100}%`}]}/></View></View>
          <View style={s.measure}><View style={s.measureLabel}><Label muted style={s.small}>Bekannte Flugzeit</Label><Label style={s.number}>{durationText(g)}</Label></View><View style={s.track}>{g.knownDurationCount>0&&<View style={[s.fill,{width:`${g.knownMinutes/maxMinutes*100}%`}]}/>}</View></View>
        </>
        {g.unknownDurationCount>0&&<Label muted style={s.small}>{g.unknownDurationCount} Zeiten unbekannt</Label>}
      </Pressable>)}
      {chart==='roles'&&supervisedSolo.length>0&&<Action secondary onPress={()=>onFlights('Solo mit Fluggenehmigung',supervisedSolo.map(f=>f.flightId))}>Davon Solo mit Fluggenehmigung · {supervisedSolo.length}</Action>}
      {chart==='launch'&&<Action secondary onPress={()=>changeChart('launchDuration')}>Dauer nach Startart vergleichen</Action>}
      {!groups.length&&<Label muted>Keine passenden gespeicherten Flüge.</Label>}
    </View>;
  }
  return <View style={s.viewer} onLayout={e=>{const next=e.nativeEvent.layout.width;if(next>0&&Math.abs(next-width)>1)setWidth(next);}}>
    <View style={s.heading}>
      <SymbolIcon name={icons[chart]} size={24}/>
      <Pressable accessibilityRole="button" accessibilityLabel="Diagramm auswählen" accessibilityState={{expanded:picker}} onPress={()=>{setPicker(!picker);setSelection(null);}} style={s.title}><Label style={{fontWeight:'700'}}>{chartNames[chart]} ▾</Label></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Information zu ${chartNames[chart]}`} accessibilityState={{expanded:info}} onPress={()=>setInfo(!info)} style={s.control}><SymbolIcon name="info" size={20}/></Pressable>
    </View>
    {picker&&<View style={s.wrap}>{chartOrder.map(kind=><Chip key={kind} title={chartNames[kind]} selected={chart===kind} onPress={()=>changeChart(kind)}/>)}</View>}
    {info&&<View accessibilityLiveRegion="polite" style={s.information}><Label>{explanations[chart]}</Label><Action secondary onPress={()=>setInfo(false)}>Information schließen</Action></View>}
    {content}
    <View style={s.footer}><Pressable accessibilityRole="button" accessibilityLabel="Werte und Flüge anzeigen" accessibilityState={{expanded:values}} onPress={()=>setValues(!values)} style={{minHeight:48,justifyContent:'center'}}><Label style={{color:colors.cyan}}>{values?'Werte einklappen ▴':'Werte & Flüge ▾'}</Label></Pressable></View>
    <Label muted style={s.small}>{bounds?`${bounds.from} – ${bounds.to}`:'Gesamter gespeicherter Bestand'}{summary.unknownDurationCount?` · ${summary.unknownDurationCount} Zeiten unbekannt`:''}{dataset.unknownDateCount?` · ${dataset.unknownDateCount} ohne Datum`:''}{dataset.conflictingIds.length?` · ${dataset.conflictingIds.length} Konflikte ausgeschlossen`:''}</Label>
    {selection&&<Card style={s.callout}><View style={ui.row}><Label style={{flex:1,fontWeight:'700'}}>{selection.title}</Label><Pressable accessibilityRole="button" accessibilityLabel="Auswahl schließen" onPress={()=>{setSelection(null);setMonthFocus(null);}} style={s.control}><SymbolIcon name="close" size={18}/></Pressable></View>{selection.lines.map((line,i)=><Label key={i}>{line}</Label>)}{selection.ids.length>0&&<Action secondary onPress={()=>onFlights(selection.title,selection.ids,selection.scope)}>Flüge ansehen · {selection.ids.length}</Action>}{selection.additional?.map(item=><Action key={item.title} secondary onPress={()=>onFlights(item.title,item.ids,item.scope)}>{item.label}</Action>)}</Card>}
    {values&&<View style={{gap:4}}>
      {chart==='monthly'?monthly.flat().filter(g=>!g.future).map(g=><Action key={g.key} secondary onPress={()=>setSelection({title:g.label,lines:[`${g.count} Flüge · ${durationText(g)}`,g.covered?'Abgedeckt':'Abdeckung lückenhaft',...(g.unknownDurationCount?[`${g.unknownDurationCount} Zeiten unbekannt`]:[]),...(!g.validComparison?['Kein gleicher Kalendertag im Vorjahr']:[])],ids:g.supportingIds,scope:{kind:'custom',from:g.from,to:g.to}})}>{g.label} · {g.count} Flüge · {durationText(g)} · {g.covered?'abgedeckt':'lückenhaft'}{g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten ?`:''}{!g.validComparison?' · kein Vergleich':''}</Action>)
        :chart==='timeline'?dataset.points.map(p=><Action key={p.id} secondary onPress={()=>onFlights(p.date,[p.id])}>{p.date} · {time(p.minutes)} · {p.model||'Muster unbekannt'}</Action>)
        :chart==='days'?<Action secondary onPress={()=>onFlights('Flugtage',dataset.dated.map(f=>f.flightId))}>Flüge an {dataset.flyingDays} Tagen ansehen</Action>
        :chart==='duration'?null:groups.map(g=><Action key={g.key} secondary onPress={()=>selectGroup(g)}>{g.label} · {g.count} Flüge · {durationText(g)}</Action>)}
    </View>}
    {compact&&groups.length>4&&!values&&<Action secondary onPress={()=>setValues(true)}>Alle {groups.length} Gruppen anzeigen</Action>}
  </View>;
}
const s=StyleSheet.create({
  viewer:{gap:8,minWidth:0,width:'100%'},heading:{flexDirection:'row',alignItems:'center',gap:8},title:{flex:1,minHeight:48,justifyContent:'center'},control:{minHeight:48,minWidth:48,alignItems:'center',justifyContent:'center'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:6},small:{fontSize:12,lineHeight:18},tick:{fontSize:11,lineHeight:16},monthPlot:{flexDirection:'row',alignItems:'flex-end',borderBottomWidth:1,borderColor:colors.border},monthSlot:{flex:1,alignItems:'center',justifyContent:'flex-end',minWidth:0,minHeight:48},barRow:{minHeight:48,paddingVertical:4,gap:3},comparisonRow:{paddingVertical:10,gap:8,borderBottomWidth:1,borderBottomColor:colors.border},measure:{gap:4},measureLabel:{flexDirection:'row',flexWrap:'wrap',alignItems:'baseline',justifyContent:'space-between',gap:8},number:{fontVariant:['tabular-nums'],fontWeight:'600'},track:{height:8,backgroundColor:colors.raised,borderRadius:3},fill:{height:8,backgroundColor:colors.cyan,borderRadius:3},footer:{flexDirection:'row',alignItems:'center',gap:3},information:{backgroundColor:colors.raised,padding:12,borderRadius:12,gap:6},callout:{gap:6},day:{width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:3},
});

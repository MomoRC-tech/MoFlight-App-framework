import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { Card, Label, Action, Chip, colors, ui } from './theme';
import { SymbolIcon, type SymbolName } from './SymbolIcon';
import { formatReportedMinutes } from './real-flight-statistics';
import { type StatisticsPeriod, statisticsPeriodBounds } from './statistics-overlay-model';
import { classifyAircraft } from './flight-classification';
import {
  chartNames, chartOrder, chartDataset, monthlyChartGroups, groupChartFlights, calendarChartDays,
  quantile, nearestChartPoints, emptyChartFilters,
  type ChartKind, type ChartFilters, type AircraftGrouping, type ChartGroup,
} from './statistics-charts-model';

const priorColor = '#8da1bb', secondColor = '#b7a3ed', medianColor = '#efc37a';
const monthNames = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
const icons: Record<ChartKind, SymbolName> = { monthly: 'chart', timeline: 'glider', aircraft: 'flight-paper-plane', launch: 'arrow', launchDuration: 'clock', duration: 'clock', roles: 'club', days: 'calendar-neutral' };
const explanations: Record<ChartKind, string> = {
  monthly: 'Oben: bekannte Flugzeit. Unten: Anzahl Flüge. Balken zeigen die Saison, Punkte das Vorjahr bis zum gleichen Kalendertag. Fehlende Abdeckung ist kein belegter Nullwert. Für andere Zeiträume wähle eine andere Diagrammart.',
  timeline: 'Ein Punkt je Flug mit bekanntem Datum und bekannter Dauer. Goldene Abschnitte zeigen den Median des Monats, ohne Monate zu verbinden. Der Median teilt die bekannten Dauern in zwei gleich große Gruppen. Tippe auf einen Punkt; gleiche Werte bleiben gemeinsam erreichbar. Längere Flüge belegen keinen Ausbildungsfortschritt.',
  aircraft: 'Verbundene Punkte vergleichen den Anteil an bekannter Flugzeit (gefüllter Punkt) und an allen Flügen (Raute). Die Bezugsmenge bleibt die ganze gefilterte Auswahl, auch bei Muster- oder Kennzeichengruppierung. Fehlende Dauern können unterschiedliche Bezugszahlen verursachen.',
  launch: 'Nur ausdrücklich als Segelflugzeug erfasste Flüge. Fluganteil und Anteil bekannter Flugzeit werden auf derselben Skala verglichen. Startart wird nicht aus dem Flugzeug abgeleitet. Die Detailansicht zeigt Dauer und Streuung; sie erklärt keine Ursache.',
  launchDuration: 'Nur Segelflug. Punkte: einzelne bekannte Flugdauern. Band: mittlere 50 % (25.–75. Perzentil), Strich: Median. Quantile werden linear interpoliert. Alle Gruppen teilen dieselbe Dauerskala. Kleine Stichproben bleiben als solche sichtbar; keine geschätzte Dichtekurve.',
  duration: 'Anzahl Flüge je gemeldeter Dauergruppe. Bekannte Null bleibt Null; fehlende oder widersprüchliche Dauer wird separat gezählt. Keine Berechnung aus Start- und Landeuhrzeiten.',
  roles: 'Exklusive Quellengruppen: Solo = Pilot als PIC ohne Begleiter. Dual = Pilot als SIC, Begleiter als PIC und positive Dual-Zeit. PIC+ = Pilot als PIC mit Begleitperson(en), ohne SIC oder Dual-Zeit. Unklare Rollen bleiben sichtbar. Begleitperson bedeutet nicht automatisch Passagier; keine rechtliche Anrechnung.',
  days: 'Ein Flugtag ist ein gespeicherter Kalendertag mit mindestens einem passenden Flug. Im Kalender: – = nicht vollständig abgedeckt; / = zukünftig. Helle Zellen enthalten mehr Flüge. Lücken sind nur bei vollständiger Quellenabdeckung als flugfrei belegt.',
};
interface Selection { title: string; lines: string[]; ids: string[]; scope?: StatisticsPeriod }
export interface StatisticsChartsProps {
  flights: readonly RealFlightListItem[]; saved: readonly SavedFlightRetrieval[]; today: string; period: StatisticsPeriod;
  filters?: ChartFilters; initialChart?: ChartKind; compact?: boolean; onChartChange?: (chart: ChartKind) => void;
  onFlights: (title: string, ids: readonly string[], scope?: StatisticsPeriod) => void;
  onBackHandler?: (handler: () => boolean) => void;
}
const time = (minutes: number) => `${formatReportedMinutes(minutes)} h`;
const durationText = (g: ChartGroup) => g.knownDurationCount ? time(g.knownMinutes) : g.count ? 'Zeit unbekannt' : '0:00 h';
const percent = (v: number) => `${v.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;

/** Only the active chart is mounted. All values come from the saved, reconciled selection. */
export function StatisticsCharts({ flights, saved, today, period, filters = emptyChartFilters, initialChart = 'monthly', compact = false, onChartChange, onFlights, onBackHandler }: StatisticsChartsProps) {
  const {fontScale}=useWindowDimensions();
  const [chart, setChart] = useState<ChartKind>(initialChart);
  const [picker, setPicker] = useState(false), [info, setInfo] = useState(false), [values, setValues] = useState(false);
  const [grouping, setGrouping] = useState<AircraftGrouping>('category'), [calendar, setCalendar] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null), [width, setWidth] = useState(280);
  useEffect(()=>{setSelection(null);},[flights,period,filters]);
  const dataset = useMemo(() => chartDataset(flights, period, today, filters), [flights, period, today, filters]);
  const bounds = statisticsPeriodBounds(period, today);
  const monthly = useMemo(() => chart === 'monthly' && period.kind === 'year' ? monthlyChartGroups(flights, saved, period.year, today, filters) : [], [chart, flights, saved, period, today, filters]);
  const launchRows = useMemo(() => chart === 'launch' || chart === 'launchDuration' ? dataset.rows.filter(f => classifyAircraft(f.facts.assessment).key === 'glider') : [], [chart, dataset]);
  const groups = useMemo(() => chart === 'aircraft' ? groupChartFlights(dataset.rows, grouping)
    : chart === 'roles' ? groupChartFlights(dataset.rows, 'roles')
    : chart === 'launch' || chart === 'launchDuration' ? groupChartFlights(launchRows, 'launch') : [], [chart, grouping, dataset, launchRows]);
  const days = useMemo(() => chart === 'days' && period.kind === 'year' ? calendarChartDays(flights, saved, period.year, today, filters) : [], [chart, period, flights, saved, today, filters]);
  const changeChart = (next: ChartKind) => { setChart(next); setSelection(null); setPicker(false); setInfo(false); setValues(false); onChartChange?.(next); };
  onBackHandler?.(() => { if (selection) { setSelection(null); return true; } if (info || values || picker) { setInfo(false); setValues(false); setPicker(false); return true; } if (calendar) { setCalendar(false); return true; } return false; });
  const selectGroup = (g: ChartGroup) => setSelection({ title: g.label, lines: [`${g.count} Flüge · ${durationText(g)}`, ...(chart==='launchDuration'?[`n=${g.minutes.length} · Median ${g.median===null?'—':`${g.median.toLocaleString('de-DE')} min`}`,`Mittlere 50 %: ${g.q1===null?'—':g.q1.toLocaleString('de-DE')}–${g.q3===null?'—':g.q3.toLocaleString('de-DE')} min`]:[]), ...(g.unknownDurationCount ? [`${g.unknownDurationCount} Dauern unbekannt`] : [])], ids: g.supportingIds });
  const visibleGroups = compact && !values ? groups.slice(0, 4) : groups;
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
      const panel = (measure: 'knownMinutes' | 'count') => {
        const max = Math.max(1, ...monthly.flat().map(g=>g[measure])), unit=measure==='knownMinutes'?'Flugzeit · h':'Flüge';
        return <View style={s.monthPanel}><Label muted style={s.small}>{unit} · 0–{measure==='knownMinutes'?(max/60).toLocaleString('de-DE',{maximumFractionDigits:1}):max}</Label>
          <View style={[s.monthPlot,{height:measure==='knownMinutes'?92:52}]}>{monthly.map((pair,i)=>{
            const current=pair[0]!,previous=pair[1]!,ph=measure==='knownMinutes'?80:40;
            return <Pressable key={i} accessibilityRole="button" accessibilityLabel={`${monthNames[i]}: ${pair.map(g=>`${g.key.slice(0,4)} ${g.count} Flüge, ${durationText(g)}, ${g.covered?'abgedeckt':'Abdeckung lückenhaft'}`).join('; ')}${current.future?', zukünftig':''}`} disabled={current.future} onPress={()=>setSelection({title:`${monthNames[i]} · ${period.year}`,lines:pair.map(g=>`${g.key.slice(0,4)}: ${g.count} Flüge · ${durationText(g)}${!g.covered?' · lückenhaft':''}${g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten unbekannt`:''}`),ids:current.supportingIds})} style={s.monthSlot}>
              <View style={{height:ph,width:'100%',justifyContent:'flex-end',alignItems:'center'}}>
                {!current.future && <View style={{width:'54%',height:current[measure]/max*ph,backgroundColor:measure==='count'?secondColor:colors.cyan,opacity:current.covered?1:.55,borderTopLeftRadius:3,borderTopRightRadius:3}}/>}
                {!previous.future&&previous.validComparison&&(previous.count>0||previous.covered)&&(measure==='count'||previous.knownDurationCount>0||!previous.count&&previous.covered)&&<View style={{position:'absolute',bottom:previous[measure]/max*ph-3,width:6,height:6,borderRadius:3,backgroundColor:priorColor}}/>}
                {!current.future&&(!current.covered&&!current.count||measure==='knownMinutes'&&current.count>0&&!current.knownDurationCount)&&<Label muted style={s.tick}>?</Label>}
              </View>
            </Pressable>;
          })}</View>
        </View>;
      };
      content=<View style={{gap:10}}>{panel('knownMinutes')}{panel('count')}{monthAxis()}<Label muted style={s.small}>Balken {period.year} · Punkte {period.year-1} · gleicher Stichtag</Label>{monthly.some(pair=>!pair[1]!.future&&!pair[1]!.validComparison)&&<Label muted style={s.small}>Für den Schalttag ist kein Vorjahresvergleich verfügbar.</Label>}</View>;
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
      })}</View>)}</View></ScrollView><Label muted style={s.small}>Spalten: Wochen · Zeilen: Mo–So · / zukünftig · – lückenhaft</Label></View>;
    } else {
      const groups=monthNames.map((name,i)=>{const month=String(i+1).padStart(2,'0'),selected=days.filter(d=>d.date.slice(5,7)===month),active=selected.filter(d=>d.count>0);return{name,count:active.length,ids:active.flatMap(d=>d.supportingIds),future:selected.every(d=>d.future),partial:selected.some(d=>!d.future&&!d.covered)};});
      const max=Math.max(1,...groups.map(g=>g.count));content=<View style={{gap:8}}><Label>{dataset.flyingDays} Flugtage · {period.year}</Label><View style={{height:126,flexDirection:'row',gap:2}}>{groups.map((g,i)=><Pressable key={i} disabled={g.future} accessibilityRole="button" accessibilityLabel={`${g.name}, ${g.count} Flugtage${g.partial?', lückenhafte Quelle':''}`} onPress={()=>setSelection({title:g.name,lines:[`${g.count} Flugtage`,g.partial?'Abdeckung lückenhaft':'Abgedeckt'],ids:g.ids})} style={s.monthSlot}><View style={{height:100,justifyContent:'flex-end',alignItems:'center',width:'100%'}}><View style={{height:g.count/max*90,width:'65%',backgroundColor:colors.cyan}}/>{g.partial&&<Label muted style={s.tick}>·</Label>}</View></Pressable>)}</View>{monthAxis()}<Action secondary onPress={()=>setCalendar(true)}>Jahreskalender öffnen</Action></View>;
    }
  } else if (chart === 'launchDuration') {
    const max=Math.max(60,...groups.flatMap(g=>g.minutes));
    content=<View style={{gap:14}}><Label muted style={s.small}>Segelflug · gemeinsame Skala 0–{time(max)}</Label>{visibleGroups.map(g=><Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${g.minutes.length} bekannte Dauern, Median ${g.median===null?'unbekannt':g.median+' Minuten'}`} onPress={()=>selectGroup(g)} style={{gap:4,minHeight:76}}><Label>{g.label} · n={g.minutes.length}</Label><View style={{height:32,marginHorizontal:6}}>{g.q1!==null&&g.q3!==null&&<View style={{position:'absolute',left:`${g.q1/max*100}%`,width:`${(g.q3-g.q1)/max*100}%`,height:18,top:7,backgroundColor:colors.border}}/>}{g.minutes.map((m,i)=><View key={i} style={{position:'absolute',left:`${m/max*100}%`,top:5+(i%3)*7,width:5,height:5,borderRadius:3,backgroundColor:colors.cyan}}/>)}{g.median!==null&&<View style={{position:'absolute',left:`${g.median/max*100}%`,height:28,width:2,backgroundColor:colors.text}}/>}</View><Label muted style={s.small}>Median {g.median===null?'—':`${g.median.toLocaleString('de-DE')} min`}{g.minutes.length<5?' · kleine Stichprobe':''}{g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten unbekannt`:''}</Label></Pressable>)}{!groups.length&&<Label muted>Keine passenden gespeicherten Segelflüge.</Label>}</View>;
  } else {
    const total=groups.reduce((n,g)=>n+g.knownMinutes,0),count=groups.reduce((n,g)=>n+g.count,0);
    content=<View style={{gap:10}}>{chart==='aircraft'&&<View style={s.wrap}>{(['category','model','registration'] as const).map(key=><Chip key={key} title={{category:'Art',model:'Muster',registration:'Kennzeichen'}[key]} selected={grouping===key} onPress={()=>{setGrouping(key);setSelection(null);}}/>)}</View>}
      {(chart==='launch')&&<Label muted style={s.small}>Nur Segelflug · {count} Flüge · {time(total)} bekannt</Label>}
      {visibleGroups.map(g=>{
        const t=total?g.knownMinutes/total:0,c=count?g.count/count:0;
        return <Pressable key={g.key} accessibilityRole="button" accessibilityLabel={`${g.label}, ${g.count} Flüge, ${durationText(g)}${g.unknownDurationCount?`, ${g.unknownDurationCount} unbekannte Dauern`:''}`} onPress={()=>selectGroup(g)} style={s.barRow}><Label>{g.label}</Label>
          {chart==='roles'?<View style={s.track}><View style={[s.fill,{width:`${c*100}%`}]}/></View>:<View style={{height:22,marginHorizontal:6}}><View style={{position:'absolute',top:10,left:`${Math.min(t,c)*100}%`,width:`${Math.abs(t-c)*100}%`,height:1,backgroundColor:colors.muted}}/>{total>0&&<View style={{position:'absolute',left:`${t*100}%`,top:6,width:8,height:8,borderRadius:4,backgroundColor:colors.cyan,marginLeft:-4}}/>}<View style={{position:'absolute',left:`${c*100}%`,top:6,width:8,height:8,backgroundColor:secondColor,transform:[{rotate:'45deg'}],marginLeft:-4}}/></View>}
          <Label muted style={s.small}>{g.count} Flüge · {durationText(g)}{chart!=='roles'?` · ${percent(c*100)} Flüge / ${total?percent(t*100):'—'} Zeit`:''}{g.unknownDurationCount?` · ${g.unknownDurationCount} Zeiten unbekannt`:''}</Label></Pressable>;
      })}
      {chart!=='roles'&&<Label muted style={s.small}>0–100 % · ● bekannte Flugzeit · ◆ Flüge</Label>}
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
    <View style={s.footer}><Pressable accessibilityRole="button" accessibilityLabel="Vorheriges Diagramm" onPress={()=>changeChart(chartOrder[(chartOrder.indexOf(chart)+chartOrder.length-1)%chartOrder.length]!)} style={s.control}><Label>‹</Label></Pressable><Label muted style={s.small}>{chartOrder.indexOf(chart)+1} / {chartOrder.length}</Label><Pressable accessibilityRole="button" accessibilityLabel="Nächstes Diagramm" onPress={()=>changeChart(chartOrder[(chartOrder.indexOf(chart)+1)%chartOrder.length]!)} style={s.control}><Label>›</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Werte und Flüge anzeigen" accessibilityState={{expanded:values}} onPress={()=>setValues(!values)} style={{minHeight:48,justifyContent:'center',marginLeft:'auto'}}><Label style={{color:colors.cyan}}>Werte & Flüge</Label></Pressable></View>
    <Label muted style={s.small}>{bounds?`${bounds.from} – ${bounds.to}`:'Gesamter gespeicherter Bestand'}{summary.unknownDurationCount?` · ${summary.unknownDurationCount} Zeiten unbekannt`:''}{dataset.unknownDateCount?` · ${dataset.unknownDateCount} ohne Datum`:''}{dataset.conflictingIds.length?` · ${dataset.conflictingIds.length} Konflikte ausgeschlossen`:''}</Label>
    {selection&&<Card style={s.callout}><View style={ui.row}><Label style={{flex:1,fontWeight:'700'}}>{selection.title}</Label><Pressable accessibilityRole="button" accessibilityLabel="Auswahl schließen" onPress={()=>setSelection(null)} style={s.control}><SymbolIcon name="close" size={18}/></Pressable></View>{selection.lines.map((line,i)=><Label key={i}>{line}</Label>)}{selection.ids.length>0&&<Action secondary onPress={()=>onFlights(selection.title,selection.ids,selection.scope)}>Flüge ansehen · {selection.ids.length}</Action>}</Card>}
    {values&&<View style={{gap:4}}>
      {chart==='monthly'?monthly.flat().filter(g=>!g.future).map(g=><Action key={g.key} secondary onPress={()=>setSelection({title:g.label,lines:[`${g.count} Flüge · ${durationText(g)}`,g.covered?'Abgedeckt':'Abdeckung lückenhaft'],ids:g.supportingIds,scope:{kind:'custom',from:g.from,to:g.to}})}>{g.label} · {g.count} Flüge · {durationText(g)}</Action>)
        :chart==='timeline'?dataset.points.map(p=><Action key={p.id} secondary onPress={()=>onFlights(p.date,[p.id])}>{p.date} · {time(p.minutes)} · {p.model||'Muster unbekannt'}</Action>)
        :chart==='days'?<Action secondary onPress={()=>onFlights('Flugtage',dataset.dated.map(f=>f.flightId))}>Flüge an {dataset.flyingDays} Tagen ansehen</Action>
        :chart==='duration'?null:groups.map(g=><Action key={g.key} secondary onPress={()=>selectGroup(g)}>{g.label} · {g.count} Flüge · {durationText(g)}</Action>)}
    </View>}
    {compact&&groups.length>4&&!values&&<Action secondary onPress={()=>setValues(true)}>Alle {groups.length} Gruppen anzeigen</Action>}
  </View>;
}
const s=StyleSheet.create({
  viewer:{gap:8,minWidth:0,width:'100%'},heading:{flexDirection:'row',alignItems:'center',gap:8},title:{flex:1,minHeight:48,justifyContent:'center'},control:{minHeight:48,minWidth:44,alignItems:'center',justifyContent:'center'},wrap:{flexDirection:'row',flexWrap:'wrap',gap:6},small:{fontSize:12,lineHeight:18},tick:{fontSize:11,lineHeight:16},monthPanel:{gap:6},monthPlot:{flexDirection:'row',alignItems:'flex-end',borderBottomWidth:1,borderColor:colors.border},monthSlot:{flex:1,alignItems:'center',justifyContent:'flex-end',minWidth:0,minHeight:48},barRow:{minHeight:48,paddingVertical:4,gap:3},track:{height:8,backgroundColor:colors.raised,borderRadius:3},fill:{height:8,backgroundColor:colors.cyan,borderRadius:3},footer:{flexDirection:'row',alignItems:'center',gap:3},information:{backgroundColor:colors.raised,padding:12,borderRadius:12,gap:6},callout:{gap:6},day:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:3},
});

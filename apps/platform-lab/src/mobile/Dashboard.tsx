import { startRenderSpan } from '../start-timing';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Label, colors as contentColors, startTileSurfaces, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes } from './real-flight-statistics';
import { SymbolIcon } from './SymbolIcon';
import { flightRoleShortLabels } from './flight-role-metric';
import type { StatisticsSection } from './statistics-overlay-model';
import { flightStartGuidance } from './flight-start-guidance';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { createProcessedSelector } from './processed-result';
import { startFlightDashboard, startDashboardValues, type StartPreview } from './start-preview';
import { DutyTargetEditor, useDutyTarget } from './DutyTarget';
import { StartSeasonCharts } from './StartSeasonCharts';
import type { ChartKind, ChartContributors } from './statistics-charts-model';
const colors = { ...contentColors, ...startTileSurfaces };
interface Props {
  preview?: StartPreview | null; ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onFlights: () => void; onFlight?: (flightId: string) => void; onStatistics?: (year: number, section?: StatisticsSection, chart?: ChartKind, contributors?: ChartContributors) => void; now?: number; persistDutyTarget?: boolean; onBackHandler?:(handler:()=>boolean)=>void;
}
export function Dashboard({ preview, ownFlights, ownFlightPhase, onFlights, onFlight, onStatistics, fontScale, now = Date.now(), persistDutyTarget = true,onBackHandler }: Props) {
  const clock = new Date(now), currentYear = clock.getFullYear();
  const today = `${currentYear}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const scope = ownFlights?.snapshot.account ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef])
    : preview?.day.slice(0,4)===String(currentYear) ? JSON.stringify([preview.ownerId,preview.storeId,preview.accountRef]) : null;
  const [selection,setSelection] = useState<{scope:string|null;year:number}|null>(null);
  const year = selection?.scope === scope ? selection.year : currentYear;
  const [yearOpen,setYearOpen] = useState(false), [targetOpen,setTargetOpen] = useState(false);
  const [chartSelection,setChartSelection]=useState<{scope:string|null;chart:ChartKind}|null>(null);
  const chartBack=useRef<()=>boolean>(()=>false);
  const selectedChart=chartSelection?.scope===scope?chartSelection.chart:'monthly';
  const target = useDutyTarget(scope,year,persistDutyTarget,ownFlightPhase==='ready'&&!ownFlights?.pendingCommand&&!ownFlights?.snapshot.recovery?.readOnly?ownFlights?.featureInformation?.workSummary:undefined);
  onBackHandler?.(()=>{
    if(targetOpen){if(!target.busy)setTargetOpen(false);return true;}
    if(chartBack.current())return true;
    if(yearOpen){setYearOpen(false);return true;}
    return false;
  });
  const years=[...new Set([currentYear,...(ownFlights?.flights??[]).map(f=>Number(f.facts.assessment.date.value?.slice(0,4))).filter(y=>Number.isInteger(y)&&y>=1901&&y<=currentYear)])].sort((a,b)=>b-a);
  const processFlights=useMemo(()=>createProcessedSelector(({flights,year,today}:{flights:OwnFlightView['flights'];year:number;today:string})=>startFlightDashboard(flights,year,today)),[]);
  const finishDerive=startRenderSpan(ownFlights,'start-dashboard-derive');
  let processed:ReturnType<typeof processFlights>;
  try { processed=processFlights(scope,ownFlights?{flights:ownFlights.flights,year,today}:null); finishDerive?.(true); }
  catch(error){finishDerive?.(false);throw error;}
  const savedPreview=preview?.day.slice(0,4)===today.slice(0,4)&&year===currentYear?preview:null;
  const cached=!ownFlights?savedPreview:null;
  const display=processed&&ownFlights?startDashboardValues(processed,ownFlights.snapshot.savedRetrievals,year,today,ownFlights.featureInformation?.workSummary):cached?.dashboard;
  const blank={time:'—',starts:'—',unknownDurationCount:0,unknownDateCount:0};
  const saved=ownFlights?.snapshot.savedRetrievals??[];
  const facts={current:display?.current??blank,prior:display?.prior??blank,latest:display?.latest};
  const workHours=ownFlights?.sections?.information==='loading'&&savedPreview?savedPreview.dashboard.workHours:display?.workHours;
  const ready=(ownFlightPhase!=='failed'&&!!ownFlights?.snapshot.account)||!!cached;
  const startGuidance=flightStartGuidance({phase:ownFlightPhase,accountAssociated:!!ownFlights?.snapshot.account,
    successfulRetrieval:!!planFlightRetrieval(saved).lastSuccessfulRetrievalAt,savedFlights:ownFlights?.flights.length??0});
  const latest=facts.latest;
  return <Card surface="start" style={styles.season}>
    <ImageBackground source={require('../../assets/aviation/ask21-flight-header-v2.png')} resizeMode="cover" imageStyle={ui.cockpitImage} style={styles.photo}>
      <View style={[ui.cockpitShade,styles.shade]}>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Saison ${year} auswählen`} accessibilityState={{expanded:yearOpen}} disabled={!ownFlights} onPress={()=>setYearOpen(!yearOpen)} style={styles.seasonTitle}><View style={ui.row}><Label style={[styles.title,{flexShrink:1}]}>Meine Saison · {year}</Label><SymbolIcon name="down" size={16}/></View></Pressable>
          {onStatistics&&<Pressable accessibilityRole="button" accessibilityLabel="Statistik" onPress={()=>onStatistics(year,undefined,selectedChart)} style={[styles.statistics,fontScale>1.3&&{maxWidth:'45%'}]}><Label style={[styles.statisticsText,{flexShrink:1}]}>Statistik</Label><View style={{transform:[{rotate:'-45deg'}]}}><SymbolIcon name="arrow" size={16}/></View></Pressable>}
        </View>
        {yearOpen&&<View><ScrollView horizontal contentContainerStyle={{gap:6}}>{years.map(y=><Pressable key={y} accessibilityRole="button" accessibilityLabel={`Saison ${y}`} accessibilityState={{selected:year===y}} onPress={()=>{setSelection({scope,year:y});setYearOpen(false);}} style={[styles.yearButton,year===y&&{backgroundColor:colors.raised,borderRadius:10}]}><Label>{y}</Label></Pressable>)}</ScrollView><View style={styles.yearControls}><Pressable accessibilityRole="button" accessibilityLabel="Vorherige Saison" disabled={year<=1901} onPress={()=>setSelection({scope,year:Math.max(1901,year-1)})} style={styles.yearButton}><Label>‹ {Math.max(1901,year-1)}</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Nächste Saison" disabled={year>=currentYear} onPress={()=>setSelection({scope,year:year+1})} style={[styles.yearButton,year>=currentYear&&{opacity:.4}]}><Label>{year+1} ›</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Saisonauswahl schließen" onPress={()=>setYearOpen(false)} style={styles.yearButton}><SymbolIcon name="close" size={18}/></Pressable></View></View>}
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.metrics,fontScale>1.3&&{minWidth:330*fontScale}]}>
          <View style={styles.metric} accessible accessibilityLabel={`Flugzeit ${year}: ${ready?facts.current.time:'unbekannt'} Stunden und Minuten. ${year-1}: ${ready?facts.prior.time:'unbekannt'}.`}>
            <Label style={styles.value}>{ready?facts.current.time:'—'}</Label><Label muted style={styles.metricLabel}>Flugzeit · h:min</Label><Label muted style={styles.prior}>{year-1}: {ready?facts.prior.time:'—'}</Label>
          </View>
          <View style={[styles.metric,styles.divider]} accessible accessibilityLabel={`Flüge ${year}: ${ready?facts.current.starts:'unbekannt'}. ${year-1}: ${ready?facts.prior.starts:'unbekannt'}.`}>
            <Label style={styles.value}>{ready?facts.current.starts:'—'}</Label><Label muted style={styles.metricLabel}>Flüge</Label><Label muted style={styles.prior}>{year-1}: {ready?facts.prior.starts:'—'}</Label>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Arbeitsstunden ${year}: ${ready?(ownFlights?.sections?.information==='loading'?'wird geladen':workHours??'unbekannt'):'unbekannt'} geleistet. Lokale Sollstunden ${target.hours}. Sollstunden bearbeiten`} accessibilityState={{expanded:targetOpen}} disabled={!ownFlights} onPress={()=>setTargetOpen(!targetOpen)} style={[styles.metric,styles.divider,styles.workMetric]}>
            <Label style={[styles.value,styles.workValue]}>{ready?(workHours??'—'):'—'} h</Label><Label muted style={styles.metricLabel}>Arbeitsstunden · Ist</Label><View style={styles.workTarget}><Label style={styles.prior}>Soll {String(target.hours).replace('.',',')} h</Label><Label style={styles.editCue}>✎</Label></View>
          </Pressable>
          {(['solo','dualInstruction','picWithCompanion'] as const).map(key=>{
            const group=display?.roles.find(item=>item.key===key),label=flightRoleShortLabels[key];
            const groupCount=group?.count??0,known=ready&&!!group?.knownDurationCount;
            const confirmedZero=ready&&groupCount===0&&facts.current.starts!=='—';
            const time=known?formatReportedMinutes(group!.knownMinutes):confirmedZero?'0:00':'—';
            const count=ready&&(groupCount>0||facts.current.starts!=='—')?String(groupCount):'—';
            const flightWord=groupCount===1?'Flug':'Flüge';
            return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label} ${year}: ${count} ${flightWord} gespeichert, ${known?`${time} Stunden und Minuten bekannte Flugzeit`:confirmedZero?'0:00 Stunden und Minuten gespeicherte Flugzeit':'Flugzeit unbekannt'}${group?.unknownDurationCount?`, ${group.unknownDurationCount} ohne bekannte Dauer`:''}. Statistik öffnen`} onPress={()=>onStatistics?.(year,'roles')} style={[styles.metric,styles.divider]}>
              <Label style={[styles.value,styles.roleValue]}>{ready?time:'—'}</Label><Label muted style={styles.metricLabel}>{label} · h:min</Label><Label muted style={styles.prior}>{ready?count:'—'} {flightWord}</Label>
            </Pressable>;
          })}
        </ScrollView>
        <Label muted style={{fontSize:11,lineHeight:16,textAlign:'right'}}>Kennzahlen seitlich wischen</Label>
      </View>
    </ImageBackground>
    {targetOpen&&<View style={styles.inset}>{scope?<DutyTargetEditor key={`${scope}:${year}`} target={target} onClose={()=>setTargetOpen(false)}/>:<Label muted>Ein lokales Soll lässt sich nach Auswahl eines Kontos speichern.</Label>}</View>}
    {!targetOpen&&target.error&&<Label muted style={styles.inset}>{target.error}</Label>}
    <View style={styles.body}>
      {(savedPreview||ownFlightPhase==='loading')&&<View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan}/><Label style={{flex:1}}>{savedPreview?`Letzter gespeicherter Stand: ${new Date(savedPreview.savedAt).toLocaleString('de-DE')} (wird geprüft)`:'Gespeicherte Flugdaten werden vorbereitet …'}</Label></View>}
      {!ready?<Label muted>{ownFlightPhase==='failed'?'Gespeicherte Flugdaten konnten nicht geprüft werden. Bitte die lokale Liste erneut prüfen.':startGuidance?.message}</Label>:latest?<Pressable accessibilityRole="button" accessibilityLabel={`Letzten Flug vom ${latest.date} ansehen${latest?.orderUnknown?'. Reihenfolge am selben Tag unbekannt.':''}`} onPress={()=>onFlight?onFlight(latest.flightId):onFlights()} style={({pressed})=>[styles.latest,pressed&&ui.pressed]}>
        <Label muted style={{flex:1}}>Letzter Flug · {latest.date}{latest.orderUnknown?' · Reihenfolge offen':''}</Label><SymbolIcon name="right" size={18}/>
      </Pressable>:<Label muted>{startGuidance?.message ?? 'Noch keine datierten gespeicherten Flüge.'}</Label>}
      {ready&&ownFlights&&scope&&<StartSeasonCharts key={scope} scope={scope} persistent={persistDutyTarget} flights={ownFlights.flights} saved={saved} year={year} today={today} onChartChange={chart=>setChartSelection({scope,chart})} onBackHandler={handler=>{chartBack.current=handler;}} onFlights={(title,ids,period)=>onStatistics?.(year,undefined,selectedChart,{title,ids,scope:period??{kind:'year',year}})}/>}
      {ready&&facts.current.unknownDurationCount>0&&<Label muted style={styles.small}>{facts.current.unknownDurationCount} Saisonzeiten unbekannt · bekannte Flugzeit</Label>}
      {ready&&facts.prior.unknownDurationCount>0&&<Label muted style={styles.small}>{year-1}: {facts.prior.unknownDurationCount} Zeiten unbekannt · bekannte Flugzeit</Label>}
      {ready&&facts.current.unknownDateCount>0&&<Label muted style={styles.small}>{facts.current.unknownDateCount} Flüge ohne zugeordnetes Datum.</Label>}
      <Pressable accessibilityRole="button" onPress={onFlights} style={styles.allFlights}><Label style={{color:colors.cyan,fontWeight:'600'}}>Alle Flüge</Label><SymbolIcon name="right" size={24}/></Pressable>
    </View>
  </Card>;
}
const styles=StyleSheet.create({
  season:{width:'100%',maxWidth:520,alignSelf:'center',padding:0,gap:0},
  photo:{width:'100%'},shade:{paddingHorizontal:12,paddingBottom:12,gap:8},
  heading:{flexDirection:'row',alignItems:'center',gap:6},seasonTitle:{flex:1,minWidth:0,minHeight:48,justifyContent:'center'},title:{fontSize:18,lineHeight:25,fontWeight:'700'},
  statistics:{backgroundColor:colors.raised,borderRadius:12,minHeight:48,justifyContent:'center',alignItems:'center',flexDirection:'row',gap:5,paddingHorizontal:10,maxWidth:'35%'},statisticsText:{color:colors.cyan,fontSize:14,lineHeight:20},
  metrics:{flexGrow:1,flexDirection:'row',paddingTop:4},metric:{flex:1,minWidth:90,alignItems:'center',justifyContent:'flex-start',gap:3,paddingHorizontal:5},divider:{borderLeftWidth:1,borderColor:colors.border},
  value:{fontSize:27,lineHeight:34,fontWeight:'700',textAlign:'center',fontVariant:['tabular-nums']},workValue:{fontSize:22,lineHeight:34},roleValue:{fontSize:22},metricLabel:{fontSize:12,lineHeight:18,textAlign:'center'},prior:{fontSize:11,lineHeight:17,textAlign:'center'},
  workMetric:{minWidth:116,minHeight:72},workTarget:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4},editCue:{fontSize:15,lineHeight:18,color:colors.cyan},
  body:{paddingHorizontal:12},inset:{padding:12},latest:{flexDirection:'row',alignItems:'center',gap:6,minHeight:48,paddingVertical:4,borderTopWidth:1,borderColor:colors.border},
  flightRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},date:{fontSize:16,lineHeight:22,fontWeight:'700',flexGrow:1},duration:{backgroundColor:colors.raised,borderWidth:1,borderColor:colors.border,borderRadius:18,paddingHorizontal:10,paddingVertical:3},durationText:{color:colors.cyan,fontSize:14,lineHeight:20,fontWeight:'600'},small:{fontSize:12,lineHeight:18},
  allFlights:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderColor:colors.border},
  yearControls:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'},yearButton:{minHeight:48,minWidth:48,justifyContent:'center',paddingHorizontal:8},
});

import { startRenderSpan } from '../start-timing';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import { MetricOrbit } from './SeasonRing';
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
  const roleColors=[colors.cyan,colors.green,colors.orange];
  const roleKeys=['solo','dualInstruction','picWithCompanion'] as const;
  const count=ready&&/^\d+$/.test(facts.current.starts)?Number(facts.current.starts):null;
  const orbitParts=roleKeys.map((key,i)=>({value:display?.roles.find(role=>role.key===key)?.count??0,color:roleColors[i]!}));
  const unresolved=count===null?0:Math.max(0,count-orbitParts.reduce((n,part)=>n+part.value,0));
  return <Card surface="start" style={styles.season}>
    <View style={styles.photo}>
      <View style={[ui.cockpitShade,styles.shade]}>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Saison ${year} auswählen`} accessibilityState={{expanded:yearOpen}} disabled={!ownFlights} onPress={()=>setYearOpen(!yearOpen)} style={styles.seasonTitle}><View style={ui.row}><Label style={[styles.title,{flexShrink:1}]}>Saison {year}</Label><SymbolIcon name="down" size={16}/></View></Pressable>
          {onStatistics&&<Pressable accessibilityRole="button" accessibilityLabel="Statistik" onPress={()=>onStatistics(year,undefined,selectedChart)} style={[styles.statistics,fontScale>1.3&&{maxWidth:'45%'}]}><Label style={[styles.statisticsText,{flexShrink:1}]}>Statistik</Label><View style={{transform:[{rotate:'-45deg'}]}}><SymbolIcon name="arrow" size={16}/></View></Pressable>}
        </View>
        {yearOpen&&<View><ScrollView horizontal contentContainerStyle={{gap:6}}>{years.map(y=><Pressable key={y} accessibilityRole="button" accessibilityLabel={`Saison ${y}`} accessibilityState={{selected:year===y}} onPress={()=>{setSelection({scope,year:y});setYearOpen(false);}} style={[styles.yearButton,year===y&&{backgroundColor:colors.raised,borderRadius:10}]}><Label>{y}</Label></Pressable>)}</ScrollView><View style={styles.yearControls}><Pressable accessibilityRole="button" accessibilityLabel="Vorherige Saison" disabled={year<=1901} onPress={()=>setSelection({scope,year:Math.max(1901,year-1)})} style={styles.yearButton}><Label>‹ {Math.max(1901,year-1)}</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Nächste Saison" disabled={year>=currentYear} onPress={()=>setSelection({scope,year:year+1})} style={[styles.yearButton,year>=currentYear&&{opacity:.4}]}><Label>{year+1} ›</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Saisonauswahl schließen" onPress={()=>setYearOpen(false)} style={styles.yearButton}><SymbolIcon name="close" size={18}/></Pressable></View></View>}
        <View style={[styles.instrument,fontScale>1.3&&{flexDirection:'column'}]}>
          <Pressable testID="start-count-statistics" accessibilityRole="button" accessibilityLabel={`Flüge ${year}: ${ready?facts.current.starts:'unbekannt'}. Ring: Rollen nach Anzahl, neutrale Anteile ungeklärt. Monatsvergleich öffnen`} onPress={()=>onStatistics?.(year,'overview','monthly')} style={styles.dial}>
            <MetricOrbit size={fontScale>1.3?180:140} total={count} parts={orbitParts}><Label style={styles.orbitValue}>{ready?facts.current.starts:'—'}</Label><Label muted style={styles.metricLabel}>Flüge</Label></MetricOrbit>
          </Pressable>
          <View style={styles.instrumentCopy}>
            <Pressable testID="start-time-statistics" accessibilityRole="button" accessibilityLabel={`Flugzeit ${year}: ${ready?facts.current.time:'unbekannt'} Stunden und Minuten. ${year-1}: ${ready?facts.prior.time:'unbekannt'}. Monatsvergleich öffnen`} onPress={()=>onStatistics?.(year,'overview','monthly')} style={styles.timeMetric}>
              <Label muted style={styles.eyebrow}>{facts.current.unknownDurationCount?'BEKANNTE FLUGZEIT':'FLUGZEIT'}</Label><View style={{flexDirection:'row',alignItems:'baseline',gap:5,flexWrap:'wrap'}}><Label style={styles.value}>{ready?facts.current.time:'—'}</Label><Label muted style={styles.metricLabel}>h:min ↗</Label></View>
              <Label muted style={styles.prior}>{year-1} · {ready?facts.prior.time:'—'} h:min · {ready?facts.prior.starts:'—'} Flüge</Label>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={`Arbeitsstunden ${year}: ${ready?(ownFlights?.sections?.information==='loading'?'wird geladen':workHours??'unbekannt'):'unbekannt'} geleistet. Lokale Sollstunden ${target.hours}. Sollstunden bearbeiten`} accessibilityState={{expanded:targetOpen}} disabled={!ownFlights} onPress={()=>setTargetOpen(!targetOpen)} style={styles.workMetric}>
              <Label muted style={styles.metricLabel}>Arbeit</Label><Label style={{fontWeight:'600'}}>{ready?(workHours??'—'):'—'} h</Label><Label muted style={styles.prior}>/ {String(target.hours).replace('.',',')} h</Label><Label style={styles.editCue}>✎</Label>
            </Pressable>
          </View>
        </View>
        <View style={styles.roleGrid}>
          {roleKeys.map((key,i)=>{
            const group=display?.roles.find(item=>item.key===key),label=flightRoleShortLabels[key];
            const groupCount=group?.count??0,known=ready&&!!group?.knownDurationCount;
            const confirmedZero=ready&&groupCount===0&&facts.current.starts!=='—';
            const time=known?formatReportedMinutes(group!.knownMinutes):confirmedZero?'0:00':'—';
            const count=ready&&(groupCount>0||facts.current.starts!=='—')?String(groupCount):'—';
            const flightWord=groupCount===1?'Flug':'Flüge';
            return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${label} ${year}: ${count} ${flightWord} gespeichert, ${known?`${time} Stunden und Minuten bekannte Flugzeit`:confirmedZero?'0:00 Stunden und Minuten gespeicherte Flugzeit':'Flugzeit unbekannt'}${group?.unknownDurationCount?`, ${group.unknownDurationCount} ohne bekannte Dauer`:''}. Statistik öffnen`} onPress={()=>onStatistics?.(year,'roles')} style={styles.roleMetric}>
              <View style={{width:6,height:6,borderRadius:3,backgroundColor:roleColors[i]}}/><Label style={styles.metricLabel}>{label}</Label><Label style={styles.roleTime}>{ready?time:'—'}</Label>
            </Pressable>;
          })}
        </View>
        {unresolved>0&&<Label muted style={styles.small}>{unresolved} Rollen ungeklärt</Label>}
      </View>
    </View>
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
  instrument:{flexDirection:'row',alignItems:'center',gap:12,paddingBottom:4},dial:{minHeight:140,alignItems:'center',justifyContent:'center'},orbitValue:{fontSize:34,lineHeight:40,fontWeight:'600',letterSpacing:-1,fontVariant:['tabular-nums']},instrumentCopy:{flex:1,minWidth:0,alignSelf:'stretch',justifyContent:'center'},timeMetric:{minHeight:88,justifyContent:'center',gap:1},eyebrow:{fontSize:10,lineHeight:16,letterSpacing:1.8},roleGrid:{flexDirection:'row',flexWrap:'wrap',gap:4},roleMetric:{minHeight:48,flexGrow:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:7,borderRadius:10,backgroundColor:colors.raised},roleTime:{fontSize:12,lineHeight:18,fontWeight:'600',fontVariant:['tabular-nums']},

  season:{width:'100%',maxWidth:520,alignSelf:'center',padding:0,gap:0,borderColor:colors.border,experimental_backgroundImage:'linear-gradient(145deg, #29263e66, #1c1f3000)'},
  photo:{width:'100%'},shade:{paddingHorizontal:14,paddingBottom:10,gap:4,backgroundColor:'transparent'},
  heading:{flexDirection:'row',alignItems:'center',gap:6},seasonTitle:{flex:1,minWidth:0,minHeight:48,justifyContent:'center'},title:{fontSize:16,lineHeight:22,fontWeight:'600'},
  statistics:{backgroundColor:'transparent',borderRadius:10,minHeight:48,justifyContent:'center',alignItems:'center',flexDirection:'row',gap:5,paddingHorizontal:10,maxWidth:'35%'},statisticsText:{color:colors.cyan,fontSize:14,lineHeight:20},
  value:{fontSize:36,lineHeight:43,fontWeight:'600',letterSpacing:-1.5,fontVariant:['tabular-nums']},metricLabel:{fontSize:12,lineHeight:18,textAlign:'center'},prior:{fontSize:11,lineHeight:17},
  workMetric:{minHeight:48,flexDirection:'row',alignItems:'center',flexWrap:'wrap',gap:5,borderTopWidth:1,borderTopColor:colors.border},editCue:{fontSize:15,lineHeight:18,color:colors.cyan},
  body:{paddingHorizontal:12},inset:{padding:12},latest:{flexDirection:'row',alignItems:'center',gap:6,minHeight:48,paddingVertical:4,borderTopWidth:1,borderColor:colors.border},
  small:{fontSize:12,lineHeight:18},
  allFlights:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderColor:colors.border},
  yearControls:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'},yearButton:{minHeight:48,minWidth:48,justifyContent:'center',paddingHorizontal:8},
});

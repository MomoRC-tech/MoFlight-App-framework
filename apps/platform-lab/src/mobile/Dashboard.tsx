import React, { useMemo, useState } from 'react';
import { ActivityIndicator, ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Label, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SymbolIcon } from './SymbolIcon';
import { latestSavedFlights, abbreviatedCrew } from './season-dashboard-model';
import { seasonWorkHours } from './season-work-hours';
import { cockpitSeasonValues } from './cockpit-season';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { DutyTargetEditor, useDutyTarget } from './DutyTarget';
interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onFlights: () => void; onFlight?: (flightId: string) => void; onStatistics?: (year: number) => void; now?: number;
}
export function Dashboard({ ownFlights, ownFlightPhase, onFlights, onFlight, onStatistics, fontScale, now = Date.now() }: Props) {
  const clock = new Date(now), currentYear = clock.getFullYear();
  const today = `${currentYear}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const scope = ownFlights?.snapshot.account ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const [selection,setSelection] = useState<{scope:string|null;year:number}|null>(null);
  const year = selection?.scope === scope ? selection.year : currentYear;
  const [yearOpen,setYearOpen] = useState(false), [targetOpen,setTargetOpen] = useState(false);
  const target = useDutyTarget(scope,year);
  const processFlights=useMemo(()=>createProcessedSelector(({flights,year}:{flights:RealFlightListItem[];year:number})=>({current:summarizeRealFlights(flights,year),prior:summarizeRealFlights(flights,year-1),latest:latestSavedFlights(flights)[0]})),[]);
  const processed=processFlights(scope,ownFlights?{flights:ownFlights.flights,year}:null);
  const empty=useMemo(()=>summarizeRealFlights([]),[]),saved=ownFlights?.snapshot.savedRetrievals??[];
  const facts={current:cockpitSeasonValues(processed?.current??empty,saved,year,today),prior:cockpitSeasonValues(processed?.prior??empty,saved,year-1,today),latest:processed?.latest};
  const workHours=seasonWorkHours(ownFlights?.featureInformation?.workSummary,year);
  const ready=ownFlightPhase==='ready'&&!!ownFlights?.snapshot.account;
  const latest=facts.latest, a=latest?.facts.assessment;
  const raw=(field:'registration'|'model')=>a?.fields[field].state==='value'?a.fields[field].raw:'—';
  return <Card style={styles.season}>
    <ImageBackground source={require('../../assets/aviation/ask21-flight-header-v2.png')} resizeMode="cover" imageStyle={{opacity:.44}} style={styles.photo}>
      <View style={styles.shade}>
        <View style={styles.heading}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Saison ${year} auswählen`} accessibilityState={{expanded:yearOpen}} onPress={()=>setYearOpen(!yearOpen)} style={styles.seasonTitle}><Label style={styles.title}>Meine Saison · {year}</Label></Pressable>
          {onStatistics&&<Pressable accessibilityRole="button" accessibilityLabel="Statistik" onPress={()=>onStatistics(year)} style={styles.statistics}><Label style={[styles.statisticsText,{flexShrink:1}]}>Statistik</Label><View style={{transform:[{rotate:'-45deg'}]}}><SymbolIcon name="arrow" size={16}/></View></Pressable>}
        </View>
        {yearOpen&&<View style={styles.yearControls}><Pressable accessibilityRole="button" accessibilityLabel="Vorherige Saison" onPress={()=>setSelection({scope,year:Math.max(1901,year-1)})} style={styles.yearButton}><Label>‹ {year-1}</Label></Pressable><Label muted>Saison wählen</Label><Pressable accessibilityRole="button" accessibilityLabel="Nächste Saison" disabled={year>=currentYear} onPress={()=>setSelection({scope,year:year+1})} style={[styles.yearButton,year>=currentYear&&{opacity:.4}]}><Label>{year+1} ›</Label></Pressable></View>}
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={[styles.metrics,fontScale>1.3&&{minWidth:330*fontScale}]}>
          <View style={styles.metric} accessible accessibilityLabel={`Flugzeit ${year}: ${ready?facts.current.time:'unbekannt'} Stunden und Minuten. ${year-1}: ${ready?facts.prior.time:'unbekannt'}.`}>
            <Label style={styles.value}>{ready?facts.current.time:'—'}</Label><Label muted style={styles.metricLabel}>Flugzeit · h:min</Label><Label muted style={styles.prior}>{year-1}: {ready?facts.prior.time:'—'}</Label>
          </View>
          <View style={[styles.metric,styles.divider]} accessible accessibilityLabel={`Starts ${year}: ${ready?facts.current.starts:'unbekannt'}. ${year-1}: ${ready?facts.prior.starts:'unbekannt'}.`}>
            <Label style={styles.value}>{ready?facts.current.starts:'—'}</Label><Label muted style={styles.metricLabel}>Starts</Label><Label muted style={styles.prior}>{year-1}: {ready?facts.prior.starts:'—'}</Label>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel={`Arbeitsstunden ${year}: ${ready?(workHours??'unbekannt'):'unbekannt'} geleistet. Soll vorläufig ${target.hours} Stunden. Soll anpassen`} onPress={()=>setTargetOpen(!targetOpen)} style={[styles.metric,styles.divider]}>
            <Label style={[styles.value,styles.workValue]}>{ready?(workHours??'—'):'—'} / {String(target.hours).replace('.',',')} h</Label><Label muted style={styles.metricLabel}>Arbeitsstunden</Label><Label muted style={styles.prior}>Soll vorläufig</Label>
          </Pressable>
        </ScrollView>
      </View>
    </ImageBackground>
    {targetOpen&&<View style={styles.inset}>{scope?<DutyTargetEditor key={`${scope}:${year}`} target={target} onClose={()=>setTargetOpen(false)}/>:<Label muted>Ein lokales Soll lässt sich nach Auswahl eines Kontos speichern.</Label>}</View>}
    {!targetOpen&&target.error&&<Label muted style={styles.inset}>{target.error}</Label>}
    <View style={styles.body}>
      {ownFlightPhase==='loading'?<View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan}/><Label style={{flex:1}}>Gespeicherte Flugdaten werden vorbereitet …</Label></View>:!ready?<Label muted>{ownFlightPhase==='failed'?'Gespeicherte Flugdaten konnten nicht geprüft werden.':'Deine Saison erscheint, sobald eigene Flüge gespeichert sind.'} Über Sync oben kannst du deine Flüge laden.</Label>:latest&&a?<Pressable accessibilityRole="button" accessibilityLabel={`Letzten Flug vom ${a.date.value?.split('-').reverse().join('.')} ansehen`} onPress={()=>onFlight?onFlight(latest.flightId):onFlights()} style={({pressed})=>[styles.latest,pressed&&ui.pressed]}>
        <SymbolIcon name="logbook" size={22} tone="muted"/>
        <View style={{flex:1,minWidth:0,gap:3}}><Label muted style={styles.small}>Letzter Flug</Label><View style={styles.flightRow}><Label style={styles.date}>{a.date.value?.split('-').reverse().join('.')??'Datum unbekannt'}</Label><View style={styles.duration}><Label style={styles.durationText}>{a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'— h'}</Label></View></View><Label muted style={styles.small}>{raw('model')} · {raw('registration')} · PIC {abbreviatedCrew(a.fields.pic)}</Label></View><SymbolIcon name="right" size={18}/>
      </Pressable>:<Label muted>Noch keine datierten gespeicherten Flüge.</Label>}
      {ready&&facts.current.season.unknownDurationCount>0&&<Label muted style={styles.small}>{facts.current.season.unknownDurationCount} Saisonzeiten unbekannt · bekannte Flugzeit</Label>}
      {ready&&facts.prior.season.unknownDurationCount>0&&<Label muted style={styles.small}>{year-1}: {facts.prior.season.unknownDurationCount} Zeiten unbekannt · bekannte Flugzeit</Label>}
      {ready&&facts.current.unknownDateCount>0&&<Label muted style={styles.small}>{facts.current.unknownDateCount} Flüge ohne zugeordnetes Datum.</Label>}
      <Pressable accessibilityRole="button" onPress={onFlights} style={styles.allFlights}><Label style={{color:colors.cyan,fontWeight:'600'}}>Alle Flüge</Label><SymbolIcon name="right" size={24}/></Pressable>
    </View>
  </Card>;
}
const styles=StyleSheet.create({
  season:{width:'100%',maxWidth:520,alignSelf:'center',padding:0,gap:0},
  photo:{width:'100%'},shade:{backgroundColor:'#001b2955',paddingHorizontal:12,paddingBottom:12,gap:8},
  heading:{flexDirection:'row',alignItems:'center',gap:6},seasonTitle:{flex:1,minWidth:0,minHeight:48,justifyContent:'center'},title:{fontSize:18,lineHeight:25,fontWeight:'700'},
  statistics:{minHeight:48,justifyContent:'center',alignItems:'center',flexDirection:'row',gap:3,paddingHorizontal:2,maxWidth:'35%'},statisticsText:{color:colors.cyan,fontSize:14,lineHeight:20},
  metrics:{flexGrow:1,flexDirection:'row',paddingTop:4},metric:{flex:1,minWidth:90,alignItems:'center',justifyContent:'flex-start',gap:3,paddingHorizontal:5},divider:{borderLeftWidth:1,borderColor:colors.border},
  value:{fontSize:27,lineHeight:34,fontWeight:'700',textAlign:'center',fontVariant:['tabular-nums']},workValue:{fontSize:22,lineHeight:34},metricLabel:{fontSize:12,lineHeight:18,textAlign:'center'},prior:{fontSize:11,lineHeight:17,textAlign:'center'},
  body:{paddingHorizontal:12},inset:{padding:12},latest:{flexDirection:'row',alignItems:'center',gap:9,minHeight:80,paddingVertical:10,borderTopWidth:1,borderColor:colors.border},
  flightRow:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},date:{fontSize:16,lineHeight:22,fontWeight:'700',flexGrow:1},duration:{backgroundColor:colors.raised,borderWidth:1,borderColor:colors.border,borderRadius:18,paddingHorizontal:10,paddingVertical:3},durationText:{color:colors.cyan,fontSize:14,lineHeight:20,fontWeight:'600'},small:{fontSize:12,lineHeight:18},
  allFlights:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderTopWidth:1,borderColor:colors.border},
  yearControls:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',alignItems:'center'},yearButton:{minHeight:48,minWidth:48,justifyContent:'center',paddingHorizontal:8},
});

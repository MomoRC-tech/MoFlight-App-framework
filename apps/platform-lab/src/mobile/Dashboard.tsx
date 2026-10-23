import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Label, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SymbolIcon } from './SymbolIcon';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { latestSavedFlights, abbreviatedCrew, flightRelativeAge } from './season-dashboard-model';
import { FlightScene } from './FlightScene';
import { SeasonRing } from './SeasonRing';
import { seasonRingSlices, seasonDifference } from './season-model';
import { seasonWorkHours } from './season-work-hours';
const emptyStatistics = summarizeRealFlights([]);
interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onFlights: () => void; onFlight?: (flightId: string) => void; onStatistics?: () => void; now?: number;
}
export function Dashboard({ ownFlights, ownFlightPhase, pending, width, fontScale, onPaper, onFlights, onFlight, onStatistics, now = Date.now() }: Props) {
  const clock = new Date(now), year = clock.getFullYear();
  const today = `${year}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const scope = ownFlights ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const processFlights = useMemo(() => createProcessedSelector(({ flights, year }: { flights: RealFlightListItem[]; year: number }) => {
    const statistics = summarizeRealFlights(flights, year);
    return { statistics, prior:summarizeRealFlights(flights, year-1).season, latest:latestSavedFlights(flights) };
  }), []);
  const processed = processFlights(scope, ownFlights ? { flights:ownFlights.flights, year } : null);
  const season = (processed?.statistics ?? emptyStatistics).season;
  const latest = processed?.latest[0];
  const seasons = [season, processed?.prior ?? emptyStatistics.season];
  const [metricsWidth, setMetricsWidth] = useState(0);
  const rowWidth = Math.max(metricsWidth || Math.min(490, width - 64), 3 * 88 * Math.max(1, fontScale) + 16);
  const workHours = seasonWorkHours(ownFlights?.featureInformation?.workSummary, year);
  if (ownFlightPhase === 'loading') return <Card style={styles.dashboard}><View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan} /><Label style={{flex:1}}>Gespeicherte Flugdaten werden vorbereitet …</Label></View><Label muted>Deine Saisonübersicht erscheint gleich.</Label>{onStatistics&&<StatisticsEntry onPress={onStatistics}/>}</Card>;
  if (ownFlightPhase !== 'ready' || !ownFlights?.snapshot.account) return <Card style={styles.dashboard}><View style={styles.emptyHeading}><Section title="Meine Saison" />{onStatistics&&<StatisticsEntry onPress={onStatistics}/>}</View><Label muted>{ownFlightPhase==='failed'?'Gespeicherte Flugdaten konnten nicht geprüft werden.':'Deine Saison erscheint, sobald eigene Flüge gespeichert sind.'}</Label><Label muted style={styles.small}>Über die Verbindung oben kannst du deine Flüge laden.</Label></Card>;
  return <View style={styles.dashboard}><Card style={styles.season}>
    <View style={styles.heading}><FlightScene compact /><View style={[styles.headingRow,fontScale>1.3&&styles.headingStack]}><View style={styles.headingText}><Section title="Meine Saison" /><Label muted style={styles.small}>{year} · Vergleich mit {year-1}</Label></View>{onStatistics&&<StatisticsEntry onPress={onStatistics}/>}</View></View>
    {latest ? (()=>{const a=latest.facts.assessment;const raw=(field:keyof typeof a.fields)=>{const value=a.fields[field];return value.state==='value'&&value.raw.trim()?value.raw:'unbekannt';};const day=a.date.value;
      return <Pressable accessibilityRole="button" accessibilityLabel={`Flug ${day?.split('-').reverse().join('.')} · ${raw('registration')} ansehen`} onPress={()=>onFlight?onFlight(latest.flightId):onFlights()} style={({pressed})=>[styles.latestFlight,pressed&&ui.pressed]}>
        <View style={styles.flightHeading}><Label style={styles.flightDate}>Letzter Flug · {day?.split('-').reverse().join('.')} · {flightRelativeAge(day,today)}</Label><Label style={styles.flightDuration}>{a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'Zeit unbekannt/strittig'}</Label></View>
        <View style={styles.flightHeading}><Label style={styles.flightAircraft}>{raw('registration')} · {raw('model')} · PIC: {abbreviatedCrew(a.fields.pic)}</Label><SymbolIcon name="right" size={16} tone="muted" /></View>
        {ownFlights.flights.some(f=>f.facts.assessment.date.value===day&&f.facts.assessment.clocks.start.state!=='parsed')&&<Label muted style={styles.small}>Reihenfolge am selben Tag unbekannt.</Label>}
      </Pressable>;
    })():<Label muted>Noch keine datierten gespeicherten Flüge.</Label>}
    <ScrollView horizontal showsHorizontalScrollIndicator onLayout={event => setMetricsWidth(event.nativeEvent.layout.width)} contentContainerStyle={[styles.rings,{width:rowWidth}]}>
      <SeasonRing label="Flugzeit · h bekannt" difference={seasonDifference(
        season.knownDurationCount && !season.unknownDurationCount ? season.knownMinutes : null,
        seasons[1]!.knownDurationCount && !seasons[1]!.unknownDurationCount ? seasons[1]!.knownMinutes : null, 'minutes',
      )} layers={seasons.map((item,index)=>({
        year:year-index, slices:seasonRingSlices(item.aircraft,'knownMinutes'), value:item.knownDurationCount?formatReportedMinutes(item.knownMinutes):'—',
        description:`${year-index}: ${item.knownDurationCount?formatReportedMinutes(item.knownMinutes)+' Stunden bekannt':'Flugzeit unbekannt'}, ${item.unknownDurationCount} Zeiten unbekannt/strittig. Flugzeit nach Flugzeug: ${item.aircraft.map(a=>`${a.aircraft}: ${a.knownMinutes===null?'unbekannt':formatReportedMinutes(a.knownMinutes)+' h'}`).join(', ')}`,
      }))} />
      <SeasonRing label="Starts" difference={seasonDifference(season.count, seasons[1]!.count, 'starts')} layers={seasons.map((item,index)=>({
        year:year-index, slices:seasonRingSlices(item.aircraft,'count'), value:String(item.count),
        description:`${year-index}: ${item.count} Starts nach Flugzeug: ${item.aircraft.map(a=>`${a.aircraft}: ${a.count}`).join(', ')}`,
      }))} />
      <View accessible accessibilityLabel={`Arbeitsstunden ${year}: ${workHours === null ? 'geleistete Stunden unbekannt' : workHours + ' Stunden geleistet'}. Notwendige Stunden unbekannt.`} style={styles.workMetric}>
        <Label muted style={[styles.metricLabel,{minHeight:36*Math.max(1,fontScale)}]}>Arbeitsstunden</Label>
        <View style={[styles.workSymbol,{height:88*Math.max(1,fontScale)}]}><SymbolIcon name="duty" size={38}/></View>
        <Label style={styles.workValue}>{workHours ?? '—'} h</Label>
        <Label muted style={styles.metricLabel}>geleistet</Label>
        <Label style={styles.workValue}>— h</Label>
        <Label muted style={styles.metricLabel}>notwendig</Label>
      </View>
    </ScrollView>
    {seasons[1]!.unknownDurationCount>0&&<Label muted style={styles.small}>{year-1}: {seasons[1]!.unknownDurationCount} Zeiten unbekannt/strittig</Label>}
    {season.unknownDurationCount>0&&<Label muted style={styles.small}>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>}
    {(processed?.statistics.unknownDateCount??0)>0&&<Label muted style={styles.small}>{processed?.statistics.unknownDateCount} Flüge mit unbekanntem Datum nicht zugeordnet.</Label>}
    <View style={styles.legend}>{[...new Map(seasons.flatMap(s=>s.aircraft).map(a=>[a.aircraft,a])).values()].map(a=><View key={a.aircraft} style={styles.aircraftBadge}><View style={[styles.aircraftKey,{backgroundColor:a.color}]}/><Label muted style={styles.small}>{a.aircraft}</Label></View>)}</View>
    <Pressable accessibilityRole="button" onPress={onFlights} style={styles.allFlights}><Label style={{color:colors.cyan}}>Alle Flüge ansehen</Label><SymbolIcon name="right" size={16}/></Pressable>
  </Card><Pressable accessibilityRole="button" accessibilityLabel={pending===null?'Informationen zum Papierflugbuch ansehen':'Papierstand ansehen'} onPress={onPaper} style={styles.paperLink}>
    <SymbolIcon name="logbook" size={20} tone="paper" /><Label muted style={{flex:1}}>{pending===null?'Papierflugbuch später einrichten':`Papierstand · ${pending} Flüge offen`}</Label><SymbolIcon name="right" size={16} tone="muted" />
  </Pressable></View>;
}
function StatisticsEntry({onPress}:{onPress:()=>void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel="Statistik" onPress={onPress} style={({pressed})=>[styles.statisticsEntry,pressed&&ui.pressed]}>
    <SymbolIcon name="chart" size={22}/><Label style={styles.statisticsLabel}>Statistik</Label>
  </Pressable>;
}
const styles=StyleSheet.create({
  dashboard:{width:'100%',maxWidth:520,alignSelf:'center',gap:12},
  emptyHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:6},
  headingRow:{flexDirection:'row',alignItems:'center',gap:6},headingStack:{flexDirection:'column',alignItems:'flex-start'},
  statisticsEntry:{minHeight:48,minWidth:94,paddingHorizontal:10,borderRadius:14,backgroundColor:colors.raised,borderWidth:1,borderColor:colors.border,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},
  statisticsLabel:{color:colors.cyan,fontSize:14,lineHeight:20,fontWeight:'600'},
  paperLink:{minHeight:48,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},
  small:{fontSize:12,lineHeight:18},season:{minWidth:0,gap:10,padding:14,borderColor:'#67533c',overflow:'hidden'},
  heading:{minHeight:88,marginHorizontal:-14,marginTop:-14,overflow:'hidden',justifyContent:'center'},headingText:{flex:1,minWidth:0,paddingHorizontal:14,paddingVertical:14},
  rings:{flexDirection:'row',gap:8},
  workMetric:{flex:1,minWidth:0,gap:4},workSymbol:{alignItems:'center',justifyContent:'center'},
  metricLabel:{fontSize:12,lineHeight:18,fontWeight:'600'},workValue:{fontSize:14,lineHeight:19,fontWeight:'600',color:colors.cyan},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:10},allFlights:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  aircraftBadge:{flexDirection:'row',alignItems:'center',gap:5},aircraftKey:{width:7,height:7,borderRadius:4},
  latestFlight:{gap:4,paddingBottom:10,borderBottomWidth:1,borderColor:colors.border},
  flightHeading:{flexDirection:'row',alignItems:'center',gap:7},flightDate:{flex:1,fontSize:12,lineHeight:18,color:colors.muted},
  flightDuration:{color:colors.cyan,fontWeight:'600',fontSize:13,flexShrink:1},flightAircraft:{flex:1,fontSize:12,lineHeight:18,fontWeight:'600'},
});

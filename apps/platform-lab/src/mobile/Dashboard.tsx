import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SeasonRing } from './SeasonRing';
import { seasonRingSlices } from './season-model';
import { SymbolIcon } from './SymbolIcon';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { latestSavedFlights, abbreviatedCrew, monthlySeasonForCoverage } from './season-dashboard-model';
import { SeasonMonthlyCharts } from './SeasonMonthlyCharts';
import { planFlightRetrieval, type FlightRetrievalWindow, type SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
const emptyStatistics = summarizeRealFlights([]);
const emptySlices: ReturnType<typeof seasonRingSlices> = [];
interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; now?: number;
}
export function Dashboard({ ownFlights, ownFlightPhase, pending, fontScale, onPaper, now = Date.now() }: Props) {
  const clock = new Date(now), year = clock.getFullYear();
  const today = `${year}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const scope = ownFlights ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const processFlights = useMemo(() => createProcessedSelector(({ flights, year }: { flights: RealFlightListItem[]; year: number }) => {
    const statistics = summarizeRealFlights(flights, year);
    return { statistics, latest:latestSavedFlights(flights), countSlices:seasonRingSlices(statistics.season.aircraft,'count'),timeSlices:seasonRingSlices(statistics.season.aircraft,'knownMinutes') };
  }), []);
  const processed = processFlights(scope, ownFlights ? { flights:ownFlights.flights, year } : null);
  const processCoverage=useMemo(()=>createProcessedSelector(({saved,today}:{saved:SavedFlightRetrieval[];today:string})=>planFlightRetrieval(saved,new Date(today+'T12:00:00')).periods),[]);
  const coverage=processCoverage(scope,ownFlights?{saved:ownFlights.snapshot.savedRetrievals,today}:null);
  const processMonths = useMemo(() => createProcessedSelector(({flights,coverage,today}:{flights:RealFlightListItem[];coverage:FlightRetrievalWindow[];today:string})=>monthlySeasonForCoverage(flights,coverage,today)), []);
  const monthly = processMonths(scope,ownFlights&&coverage?{flights:ownFlights.flights,coverage,today}:null);
  const season = (processed?.statistics ?? emptyStatistics).season;
  const time = season.knownDurationCount ? formatReportedMinutes(season.knownMinutes) : '—';
  const showRings = fontScale <= 1.3 && String(season.count).length <= 5 && time.length <= 5;
  const latest = processed?.latest ?? [];
  if (ownFlightPhase === 'loading') return <Card style={styles.dashboard}><View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan} /><Label style={{flex:1}}>Gespeicherte Flugdaten werden vorbereitet …</Label></View><Label muted>Deine Saisonübersicht erscheint gleich.</Label></Card>;
  if (ownFlightPhase !== 'ready' || !ownFlights?.snapshot.account) return null;
  return <View style={styles.dashboard}><Card style={styles.season}>
    <View style={ui.section}><Section title="Meine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
    {showRings ? <View style={styles.rings}>
      <SeasonRing slices={processed?.countSlices ?? emptySlices} value={String(season.count)} label="Flüge" description={`${season.count} gespeicherte Flüge ${year}, Anteile nach Kennzeichen.`} />
      <SeasonRing slices={processed?.timeSlices ?? emptySlices} value={time} label="Std." description={`${time} bekannte gemeldete Stunden ${year}; ${season.unknownDurationCount} Zeiten unbekannt oder strittig.`} />
    </View> : <View style={styles.seasonMetrics}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge {year}</Label></View><View style={styles.metric}><Text style={styles.value}>{time}</Text><Label muted>gemeldete Std.</Label></View></View>}
    <Label muted style={styles.small}>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>
    {season.aircraft.map(item=><View key={item.aircraft} style={ui.row}><View style={[styles.aircraftKey,{backgroundColor:item.color}]} /><Label muted style={[styles.small,{flex:1}]}>{item.aircraft}: {item.count} Flüge · {item.knownMinutes===null?'Zeit unbekannt':`${formatReportedMinutes(item.knownMinutes)} h bekannt`}{item.unknownDurationCount?` · ${item.unknownDurationCount} Zeiten unbekannt/strittig`:''}</Label></View>)}
    <View style={styles.latest}><Section title={latest.length>1?'Deine letzten zwei Flüge':'Dein letzter Flug'} />
      {latest.length>1 && ownFlights.flights.some(f=>latest.some(item=>item.facts.assessment.date.value===f.facts.assessment.date.value)&&f.facts.assessment.clocks.start.state!=='parsed') && <Label muted style={styles.small}>Auswahl nach Flugdatum. Reihenfolge am selben Tag unbekannt.</Label>}
      {latest.map(flight=>{const a=flight.facts.assessment;const raw=(field:keyof typeof a.fields)=>{const value=a.fields[field];return value.state==='value'?value.raw:'unbekannt';};const day=a.date.value;
        return <View key={flight.flightId} style={styles.latestFlight}>
          <View style={styles.flightHeading}><View style={{flex:1,gap:3}}><Label style={styles.flightDate}>{day?.split('-').reverse().join('.')}</Label><Label muted style={styles.small}>{a.clocks.start.state==='parsed'?a.clocks.start.value:'Startzeit unbekannt'}</Label></View><Label style={styles.flightDuration}>{a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'Zeit unbekannt/strittig'}</Label></View>
          <Label style={styles.flightAircraft}>{raw('registration')} · {raw('model')}</Label>
          <Label muted>Pilot: {abbreviatedCrew(a.fields.pic)}</Label>
          <Label muted>Begleitung: {abbreviatedCrew(a.fields.companion)}</Label>
        </View>;
      })}
      {!latest.length&&<Label muted>Noch keine datierten gespeicherten Flüge.</Label>}
    </View>
    {monthly && <SeasonMonthlyCharts series={monthly} />}
    <Label muted style={styles.small}>Gespeicherte Vereinsflieger-Daten</Label>
  </Card><Pressable accessibilityRole="button" accessibilityLabel={pending===null?'Informationen zum Papierflugbuch ansehen':'Papierstand ansehen'} onPress={onPaper} style={styles.paperLink}>
    <SymbolIcon name="logbook" size={20} tone="paper" /><Label muted style={{flex:1}}>{pending===null?'Papierflugbuch später einrichten':`Papierstand · ${pending} Flüge offen`}</Label><SymbolIcon name="right" size={16} tone="muted" />
  </Pressable></View>;
}
const styles=StyleSheet.create({dashboard:{width:'100%',maxWidth:430,alignSelf:'center',gap:8},paperLink:{minHeight:48,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},small:{fontSize:11,lineHeight:16},season:{minWidth:0,gap:5},yearBadge:{paddingHorizontal:7,borderRadius:12,backgroundColor:'#1b4269'},seasonMetrics:{flexDirection:'row',gap:5,justifyContent:'space-between'},metric:{flexShrink:1},value:{color:colors.text,fontSize:24,lineHeight:29,fontWeight:'700'},aircraftKey:{width:7,height:7,borderRadius:4},rings:{flexDirection:'row',justifyContent:'space-between',gap:6,flexWrap:'wrap',marginTop:2},latest:{gap:8,marginTop:4},latestFlight:{gap:5,padding:11,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:colors.raised},flightHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',gap:8},flightDate:{fontSize:15,lineHeight:21,fontWeight:'700'},flightDuration:{color:colors.cyan,fontWeight:'700',flexShrink:1},flightAircraft:{fontWeight:'600'}});

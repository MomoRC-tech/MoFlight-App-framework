import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Card, Label, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SymbolIcon } from './SymbolIcon';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { latestSavedFlights, abbreviatedCrew, monthlySeasonForCoverage, flightRelativeAge } from './season-dashboard-model';
import { FlightScene } from './FlightScene';
import { SeasonRing } from './SeasonRing';
import { seasonRingSlices } from './season-model';
import { SeasonMonthlyCharts } from './SeasonMonthlyCharts';
import { planFlightRetrieval, type FlightRetrievalWindow, type SavedFlightRetrieval } from '../vereinsflieger/retrieval-policy';
const emptyStatistics = summarizeRealFlights([]);
interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onFlights: () => void; onFlight?: (flightId: string) => void; now?: number;
}
export function Dashboard({ ownFlights, ownFlightPhase, pending, fontScale, onPaper, onFlights, onFlight, now = Date.now() }: Props) {
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const clock = new Date(now), year = clock.getFullYear();
  const today = `${year}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const scope = ownFlights ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const processFlights = useMemo(() => createProcessedSelector(({ flights, year }: { flights: RealFlightListItem[]; year: number }) => {
    const statistics = summarizeRealFlights(flights, year);
    return { statistics, prior:summarizeRealFlights(flights, year-1).season, latest:latestSavedFlights(flights) };
  }), []);
  const processed = processFlights(scope, ownFlights ? { flights:ownFlights.flights, year } : null);
  const processCoverage=useMemo(()=>createProcessedSelector(({saved,today}:{saved:SavedFlightRetrieval[];today:string})=>planFlightRetrieval(saved,new Date(today+'T12:00:00')).periods),[]);
  const coverage=processCoverage(scope,ownFlights?{saved:ownFlights.snapshot.savedRetrievals,today}:null);
  const processMonths = useMemo(() => createProcessedSelector(({flights,coverage,today}:{flights:RealFlightListItem[];coverage:FlightRetrievalWindow[];today:string})=>monthlySeasonForCoverage(flights,coverage,today)), []);
  const monthly = processMonths(scope,ownFlights&&coverage?{flights:ownFlights.flights,coverage,today}:null);
  const season = (processed?.statistics ?? emptyStatistics).season;
  const latest = processed?.latest[0];
  const seasons = [season, processed?.prior ?? emptyStatistics.season];
  if (ownFlightPhase === 'loading') return <Card style={styles.dashboard}><View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan} /><Label style={{flex:1}}>Gespeicherte Flugdaten werden vorbereitet …</Label></View><Label muted>Deine Saisonübersicht erscheint gleich.</Label></Card>;
  if (ownFlightPhase !== 'ready' || !ownFlights?.snapshot.account) return <Card style={styles.dashboard}><Section title="Meine Saison" /><Label muted>{ownFlightPhase==='failed'?'Gespeicherte Flugdaten konnten nicht geprüft werden.':'Deine Saison erscheint, sobald eigene Flüge gespeichert sind.'}</Label><Label muted style={styles.small}>Über „Daten“ oben kannst du deine Flüge laden.</Label></Card>;
  return <View style={styles.dashboard}><Card style={styles.season}>
    <View style={styles.heading}><View style={{flex:1}}><Section title="Meine Saison" /><Label muted style={styles.small}>{year} · Vergleich mit {year-1}</Label></View><View style={styles.scene}><FlightScene compact /></View></View>
    {latest ? (()=>{const a=latest.facts.assessment;const raw=(field:keyof typeof a.fields)=>{const value=a.fields[field];return value.state==='value'&&value.raw.trim()?value.raw:'unbekannt';};const day=a.date.value;
      return <Pressable accessibilityRole="button" accessibilityLabel={`Flug ${day?.split('-').reverse().join('.')} · ${raw('registration')} ansehen`} onPress={()=>onFlight?onFlight(latest.flightId):onFlights()} style={({pressed})=>[styles.latestFlight,pressed&&ui.pressed]}>
        <View style={styles.flightHeading}><View style={styles.age}><SymbolIcon name="clock" size={20}/><Label style={styles.ageText}>{flightRelativeAge(day,today)}</Label></View><Label muted style={styles.small}>Letzter Flug · {day?.split('-').reverse().join('.')}</Label></View>
        <Label style={styles.flightAircraft}>{raw('registration')} · {raw('model')}</Label>
        <View style={styles.flightHeading}><Label muted style={{flex:1}}>PIC: {abbreviatedCrew(a.fields.pic)}</Label><Label style={styles.flightDuration}>{a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'Zeit unbekannt/strittig'}</Label><SymbolIcon name="right" size={16} tone="muted" /></View>
        {ownFlights.flights.some(f=>f.facts.assessment.date.value===day&&f.facts.assessment.clocks.start.state!=='parsed')&&<Label muted style={styles.small}>Reihenfolge am selben Tag unbekannt.</Label>}
      </Pressable>;
    })():<Label muted>Noch keine datierten gespeicherten Flüge.</Label>}
    <View style={styles.comparison}>{seasons.map((item,index)=><View key={year-index} style={styles.yearRow}>
      <View style={{width:37*fontScale}}><Label muted style={styles.year}>{year-index}</Label></View><View style={[styles.rings,fontScale>1.3&&{flexDirection:'column'}]}>
        <SeasonRing slices={seasonRingSlices(item.aircraft,'knownMinutes')} value={item.knownDurationCount?formatReportedMinutes(item.knownMinutes):'—'} label="h bekannt" description={`${year-index}: ${item.knownDurationCount?formatReportedMinutes(item.knownMinutes)+' Stunden bekannt':'Flugzeit unbekannt'}, ${item.unknownDurationCount} Zeiten unbekannt/strittig. Flugzeit nach Flugzeug: ${item.aircraft.map(a=>`${a.aircraft}: ${a.knownMinutes===null?'unbekannt':formatReportedMinutes(a.knownMinutes)+' h'}`).join(', ')}`} />
        <SeasonRing slices={seasonRingSlices(item.aircraft,'count')} value={String(item.count)} label="Starts" description={`${year-index}: ${item.count} Starts nach Flugzeug: ${item.aircraft.map(a=>`${a.aircraft}: ${a.count}`).join(', ')}`} />
      </View>
    </View>)}</View>
    {seasons[1]!.unknownDurationCount>0&&<Label muted style={styles.small}>{year-1}: {seasons[1]!.unknownDurationCount} Zeiten unbekannt/strittig</Label>}
    {season.unknownDurationCount>0&&<Label muted style={styles.small}>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>}
    {(processed?.statistics.unknownDateCount??0)>0&&<Label muted style={styles.small}>{processed?.statistics.unknownDateCount} Flüge mit unbekanntem Datum nicht zugeordnet.</Label>}
    <View style={styles.legend}>{[...new Map(seasons.flatMap(s=>s.aircraft).map(a=>[a.aircraft,a])).values()].map(a=><View key={a.aircraft} style={styles.aircraftBadge}><View style={[styles.aircraftKey,{backgroundColor:a.color}]}/><Label muted style={styles.small}>{a.aircraft}</Label></View>)}</View>
    <Pressable accessibilityRole="button" onPress={onFlights} style={styles.allFlights}><Label style={{color:colors.cyan}}>Alle Flüge ansehen</Label><SymbolIcon name="right" size={16}/></Pressable>
  </Card><Card><Pressable accessibilityRole="button" accessibilityLabel="Saison im Detail" accessibilityState={{expanded:statisticsOpen}} onPress={()=>setStatisticsOpen(!statisticsOpen)} style={styles.disclosure}><SymbolIcon name="info" size={24}/><View style={{flex:1}}><Label style={{fontWeight:'600'}}>Saison im Detail</Label><Label muted>Flugzeuge & Monatsvergleich</Label></View><Label>{statisticsOpen?'−':'+'}</Label></Pressable>
    {statisticsOpen&&<>{monthly && <SeasonMonthlyCharts series={monthly} fontScale={fontScale} />}</>}
  </Card><Pressable accessibilityRole="button" accessibilityLabel={pending===null?'Informationen zum Papierflugbuch ansehen':'Papierstand ansehen'} onPress={onPaper} style={styles.paperLink}>
    <SymbolIcon name="logbook" size={20} tone="paper" /><Label muted style={{flex:1}}>{pending===null?'Papierflugbuch später einrichten':`Papierstand · ${pending} Flüge offen`}</Label><SymbolIcon name="right" size={16} tone="muted" />
  </Pressable></View>;
}
const styles=StyleSheet.create({
  dashboard:{width:'100%',maxWidth:520,alignSelf:'center',gap:12},
  disclosure:{minHeight:52,flexDirection:'row',alignItems:'center',gap:12},
  paperLink:{minHeight:48,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},
  small:{fontSize:12,lineHeight:18},season:{minWidth:0,gap:10,padding:14,borderColor:'#426759'},
  heading:{flexDirection:'row',alignItems:'center',gap:8},scene:{width:88,height:44,borderRadius:12,overflow:'hidden'},
  comparison:{gap:8},yearRow:{flexDirection:'row',alignItems:'center',gap:8},year:{fontSize:12},rings:{flex:1,flexDirection:'row',gap:10},
  legend:{flexDirection:'row',flexWrap:'wrap',gap:10},allFlights:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  aircraftBadge:{flexDirection:'row',alignItems:'center',gap:5},aircraftKey:{width:7,height:7,borderRadius:4},
  latestFlight:{gap:5,paddingVertical:10,borderTopWidth:1,borderBottomWidth:1,borderColor:colors.border},
  flightHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:7},age:{flexDirection:'row',alignItems:'center',gap:5},ageText:{fontWeight:'700',color:colors.cyan},
  flightDuration:{color:colors.cyan,fontWeight:'600',fontSize:13,flexShrink:1},flightAircraft:{fontWeight:'600'},
});

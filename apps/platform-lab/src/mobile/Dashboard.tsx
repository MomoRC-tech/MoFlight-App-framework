import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, Label, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SymbolIcon } from './SymbolIcon';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { latestSavedFlights, abbreviatedCrew, monthlySeasonForCoverage } from './season-dashboard-model';
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
    return { statistics, latest:latestSavedFlights(flights) };
  }), []);
  const processed = processFlights(scope, ownFlights ? { flights:ownFlights.flights, year } : null);
  const processCoverage=useMemo(()=>createProcessedSelector(({saved,today}:{saved:SavedFlightRetrieval[];today:string})=>planFlightRetrieval(saved,new Date(today+'T12:00:00')).periods),[]);
  const coverage=processCoverage(scope,ownFlights?{saved:ownFlights.snapshot.savedRetrievals,today}:null);
  const processMonths = useMemo(() => createProcessedSelector(({flights,coverage,today}:{flights:RealFlightListItem[];coverage:FlightRetrievalWindow[];today:string})=>monthlySeasonForCoverage(flights,coverage,today)), []);
  const monthly = processMonths(scope,ownFlights&&coverage?{flights:ownFlights.flights,coverage,today}:null);
  const season = (processed?.statistics ?? emptyStatistics).season;
  const time = season.knownDurationCount ? formatReportedMinutes(season.knownMinutes) : '—';
  const latest = processed?.latest ?? [];
  if (ownFlightPhase === 'loading') return <Card style={styles.dashboard}><View accessibilityLiveRegion="polite" accessibilityState={{busy:true}} style={ui.row}><ActivityIndicator color={colors.cyan} /><Label style={{flex:1}}>Gespeicherte Flugdaten werden vorbereitet …</Label></View><Label muted>Deine Saisonübersicht erscheint gleich.</Label></Card>;
  if (ownFlightPhase !== 'ready' || !ownFlights?.snapshot.account) return null;
  return <View style={styles.dashboard}><Card style={styles.season}>
    <View style={ui.section}><Section title="Meine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
    <View style={[styles.seasonMetrics,fontScale>1.3&&{flexDirection:'column'}]}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge</Label></View><View style={styles.metric}><Text style={styles.value}>{time} <Text style={styles.unit}>h</Text></Text><Label muted>Flugzeit · bekannt</Label></View></View>
    {season.unknownDurationCount>0&&<Label muted>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>}
    <Label muted style={styles.small}>Deine gespeicherten Flüge im Kalenderjahr {year}</Label>
  </Card><Card style={styles.latest}><Section title="Letzte Flüge" action="Alle ansehen" onPress={onFlights} />
      {latest.length>1 && ownFlights.flights.some(f=>latest.some(item=>item.facts.assessment.date.value===f.facts.assessment.date.value)&&f.facts.assessment.clocks.start.state!=='parsed') && <Label muted style={styles.small}>Auswahl nach Flugdatum. Reihenfolge am selben Tag unbekannt.</Label>}
      {latest.map(flight=>{const a=flight.facts.assessment;const raw=(field:keyof typeof a.fields)=>{const value=a.fields[field];return value.state==='value'?value.raw:'unbekannt';};const day=a.date.value;
        return <Pressable key={flight.flightId} accessibilityRole="button" accessibilityLabel={`Flug ${day?.split('-').reverse().join('.')} · ${raw('registration')} ansehen`} onPress={()=>onFlight?onFlight(flight.flightId):onFlights()} style={({pressed})=>[styles.latestFlight,pressed&&ui.pressed]}>
          <View style={styles.flightHeading}><Label muted style={{flex:1}}>{day?.split('-').reverse().join('.')} · {a.clocks.start.state==='parsed'?a.clocks.start.value:'Startzeit unbekannt'}</Label><Label style={styles.flightDuration}>{a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'Zeit unbekannt/strittig'}</Label></View>
          <Label style={styles.flightAircraft}>{raw('registration')} · {raw('model')} · <Text style={{color:colors.muted,fontWeight:'400'}}>Pilot: {abbreviatedCrew(a.fields.pic)}</Text></Label>
          {a.fields.companion.state==='value'&&a.fields.companion.raw.trim()&&<Label muted>Begleitung: {abbreviatedCrew(a.fields.companion)}</Label>}
          <View style={ui.row}><Label muted style={{flex:1}}>{raw('departure')} → {raw('arrival')}</Label><SymbolIcon name="right" size={18} tone="muted" /></View>
        </Pressable>;
      })}
      {!latest.length&&<Label muted>Noch keine datierten gespeicherten Flüge.</Label>}
  </Card><Card><Pressable accessibilityRole="button" accessibilityLabel="Saison im Detail" accessibilityState={{expanded:statisticsOpen}} onPress={()=>setStatisticsOpen(!statisticsOpen)} style={styles.disclosure}><SymbolIcon name="info" size={24}/><View style={{flex:1}}><Label style={{fontWeight:'600'}}>Saison im Detail</Label><Label muted>Flugzeuge & Monatsvergleich</Label></View><Label>{statisticsOpen?'−':'+'}</Label></Pressable>
    {statisticsOpen&&<><View style={styles.aircraft}>{season.aircraft.map(item=><View key={item.aircraft} style={styles.aircraftBadge}><View style={[styles.aircraftKey,{backgroundColor:item.color}]} /><Label muted style={{flexShrink:1}}>{item.aircraft}: {item.count} Flüge · {item.knownMinutes===null?'Zeit unbekannt':`${formatReportedMinutes(item.knownMinutes)} h bekannt`}{item.unknownDurationCount?` · ${item.unknownDurationCount} Zeiten unbekannt/strittig`:''}</Label></View>)}</View>{monthly && <SeasonMonthlyCharts series={monthly} fontScale={fontScale} />}<Label muted style={styles.small}>Gespeicherte Vereinsflieger-Daten · Abdeckung kann unvollständig sein.</Label></>}
  </Card><Pressable accessibilityRole="button" accessibilityLabel={pending===null?'Informationen zum Papierflugbuch ansehen':'Papierstand ansehen'} onPress={onPaper} style={styles.paperLink}>
    <SymbolIcon name="logbook" size={20} tone="paper" /><Label muted style={{flex:1}}>{pending===null?'Papierflugbuch später einrichten':`Papierstand · ${pending} Flüge offen`}</Label><SymbolIcon name="right" size={16} tone="muted" />
  </Pressable></View>;
}
const styles=StyleSheet.create({
  dashboard:{width:'100%',maxWidth:520,alignSelf:'center',gap:16},
  disclosure:{minHeight:52,flexDirection:'row',alignItems:'center',gap:12},
  paperLink:{minHeight:48,paddingHorizontal:11,flexDirection:'row',alignItems:'center',gap:8},
  small:{fontSize:13,lineHeight:20},season:{minWidth:0,gap:16,borderColor:'#426759'},
  yearBadge:{paddingHorizontal:8,borderRadius:12,backgroundColor:colors.raised},
  seasonMetrics:{flexDirection:'row',gap:18},metric:{flex:1,minWidth:0,paddingVertical:8,gap:4},
  value:{color:colors.text,fontSize:36,lineHeight:44,fontWeight:'700',letterSpacing:-1,flexShrink:1},unit:{fontSize:16,fontWeight:'400',color:colors.muted},
  aircraft:{gap:6},aircraftBadge:{flexDirection:'row',alignItems:'center',gap:7,paddingVertical:4},aircraftKey:{width:7,height:7,borderRadius:4},
  latest:{gap:12},latestFlight:{gap:7,paddingVertical:14,borderTopWidth:1,borderTopColor:colors.border},
  flightHeading:{flexDirection:'row',flexWrap:'wrap',alignItems:'flex-start',gap:8},
  flightDuration:{color:colors.cyan,fontWeight:'700',flexShrink:1},flightAircraft:{fontWeight:'600'},
});

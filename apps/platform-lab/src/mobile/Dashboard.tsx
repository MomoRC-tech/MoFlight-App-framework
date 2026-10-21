import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, IconLabel, Label, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SeasonRing } from './SeasonRing';
import { seasonRingSlices } from './season-model';
import { SymbolIcon } from './SymbolIcon';
import { createProcessedSelector } from './processed-result';
import type { RealFlightListItem } from '../vereinsflieger/real-flight-library';

const emptyStatistics = summarizeRealFlights([]);
const emptySlices: ReturnType<typeof seasonRingSlices> = [];

interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onFlights: (year?: number) => void;
}
export function Dashboard({ ownFlights, ownFlightPhase, pending, width, fontScale, onPaper, onFlights }: Props) {
  const year = new Date().getFullYear();
  const scope = ownFlights ? JSON.stringify([ownFlights.snapshot.ownerId, ownFlights.snapshot.storeId, ownFlights.snapshot.account?.accountRef]) : null;
  const processFlights = useMemo(() => createProcessedSelector(({ flights, year }: { flights: RealFlightListItem[]; year: number }) => {
    const statistics = summarizeRealFlights(flights, year);
    const latest = [...flights].filter(f => f.facts.assessment.date.state === 'parsed').sort((a,b) => (b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''))[0];
    return { statistics, latest, countSlices: seasonRingSlices(statistics.season.aircraft, 'count'), timeSlices: seasonRingSlices(statistics.season.aircraft, 'knownMinutes') };
  }), []);
  const processed = processFlights(scope, ownFlights ? { flights: ownFlights.flights, year } : null);
  const statistics = processed?.statistics ?? emptyStatistics;
  const season = statistics.season;
  const time = season.knownDurationCount ? formatReportedMinutes(season.knownMinutes) : '—';
  const showRings = fontScale <= 1.3 && String(season.count).length <= 5 && time.length <= 5;
  const latest = processed?.latest;
  const countSlices = processed?.countSlices ?? emptySlices;
  const timeSlices = processed?.timeSlices ?? emptySlices;
  const largeText = fontScale > 1.3;
  const multiColumn = width >= 840 && !largeText;
  const hero = <Pressable accessibilityRole="button" accessibilityLabel={pending === null ? 'Informationen zum Papierflugbuch ansehen' : 'Papierstand ansehen'} onPress={onPaper} style={styles.paperLink}>
    <SymbolIcon name="logbook" size={20} tone="paper" /><Label muted style={{ flex: 1 }}>{pending === null ? 'Papierflugbuch später einrichten' : `Papierstand · ${pending} Flüge offen`}</Label><SymbolIcon name="right" size={16} tone="muted" />
  </Pressable>;
  const seasonCards = <View style={styles.group}>
      <Card style={styles.season} onPress={() => onFlights(year)} label={`Eigene gespeicherte Flüge. ${season.count} im Jahr ${year}; ${season.unknownDurationCount} unbekannte oder strittige Flugzeiten. Saisonflüge ansehen.`}>
        <View style={ui.section}><Section title="Deine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
        {ownFlightPhase === 'ready' ? <>
          {showRings ? <View style={styles.rings}>
            <SeasonRing slices={countSlices} value={String(season.count)} label="Flüge" description={`${season.count} gespeicherte Flüge ${year}, Anteile nach Kennzeichen.`} />
            <SeasonRing slices={timeSlices} value={time} label="Std." description={`${time} bekannte gemeldete Stunden ${year}, Anteile nach Kennzeichen; ${season.unknownDurationCount} Zeiten unbekannt oder strittig.`} />
          </View> : <View style={styles.seasonMetrics}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge {year}</Label></View><View style={styles.metric}><Text style={styles.value}>{time}</Text><Label muted>gemeldete Std.</Label></View></View>}
          <Label muted style={styles.small}>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>
          {season.aircraft.map(item => <View key={item.aircraft} style={ui.row}><View style={[styles.aircraftKey, { backgroundColor: item.color }]} /><Label muted style={[styles.small, { flex: 1 }]}>{item.aircraft}: {item.count} Flüge · {item.knownMinutes === null ? 'Zeit unbekannt' : `${formatReportedMinutes(item.knownMinutes)} h bekannt`}{item.unknownDurationCount ? ` · ${item.unknownDurationCount} Zeiten unbekannt/strittig` : ''}</Label></View>)}
          <Label muted style={styles.small}>Saisonflüge ansehen →</Label>
        </> : <Label muted>{ownFlightPhase === 'failed' ? 'Eigene Flüge nicht lesbar. Gespeicherte Daten bleiben erhalten.' : ownFlightPhase === 'missing' ? 'Eigene Flugbibliothek noch nicht eingerichtet.' : 'Eigene gespeicherte Flüge werden geladen …'}</Label>}
        <Label muted style={styles.small}>Gespeicherte Vereinsflieger-Daten</Label>
      </Card>
    </View>;
  const flightCards = <View style={styles.group}>
      <Card style={styles.flight} onPress={() => onFlights()} label="Gespeicherte Flüge öffnen">
        <Section title="Zuletzt datiert" />
        {latest ? <><Label muted style={styles.small}>{latest.facts.assessment.date.value}</Label><Label>{latest.facts.assessment.fields.registration.state === 'value' ? latest.facts.assessment.fields.registration.raw : 'Kennzeichen unbekannt'}</Label><IconLabel name="clock" size={16} style={styles.small}>{latest.facts.assessment.durations.flight.state === 'known' ? `${formatReportedMinutes(latest.facts.assessment.durations.flight.minutes)} h` : 'Flugzeit unbekannt'}</IconLabel></> : <Label muted>{ownFlightPhase === 'ready' ? 'Noch keine datierten gespeicherten Flüge.' : 'Kein gespeicherter Flug ausgewählt.'}</Label>}
      </Card>
    </View>;
  if (ownFlightPhase !== 'ready' || !ownFlights?.snapshot.account) return null;
  if (multiColumn) return <View style={[styles.dashboard, styles.dashboardWide]}><View style={styles.tabletColumn}>{seasonCards}</View><View style={styles.tabletColumn}>{flightCards}{hero}</View></View>;
  return <View style={styles.dashboard}>{seasonCards}{flightCards}{hero}</View>;

}
const styles = StyleSheet.create({
  dashboard: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 8 }, dashboardWide: { maxWidth: 920, flexDirection: 'row', alignItems: 'flex-start' }, tabletColumn: { flex: 1, minWidth: 0, gap: 8 },
  group: { width: '100%' }, paperLink: { minHeight: 48, paddingHorizontal: 11, flexDirection: 'row', alignItems: 'center', gap: 8 },
  small: { fontSize: 11, lineHeight: 16 },
  season: { minWidth: 0, minHeight: 194, gap: 5 }, yearBadge: { paddingHorizontal: 7, borderRadius: 12, backgroundColor: '#1b4269' },
  seasonMetrics: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' }, metric: { flexShrink: 1 }, value: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  aircraftKey: { width: 7, height: 7, borderRadius: 4 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  flight: { minWidth: 0, gap: 5 },
});

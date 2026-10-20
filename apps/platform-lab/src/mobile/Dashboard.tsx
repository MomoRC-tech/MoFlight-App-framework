import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Card, GliderMark, IconLabel, Label, Photo, Section, colors, ui } from './theme';
import type { OwnFlightView } from './own-flight-reader';
import { dataFreshness } from './data-freshness';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { formatReportedMinutes, summarizeRealFlights } from './real-flight-statistics';
import { SeasonRing } from './SeasonRing';
import { seasonRingSlices } from './season-model';
import { SymbolIcon } from './SymbolIcon';

const sunset = require('../../assets/aviation/gliding-sunset.jpg');
const windsock = require('../../assets/aviation/windsock.jpg');
interface Props {
  ownFlights: OwnFlightView | null; ownFlightPhase: 'loading' | 'ready' | 'missing' | 'failed'; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onAi: () => void; onFlights: (year?: number) => void;
  onClub: () => void; onStatus: () => void;
}
export function Dashboard({ ownFlights, ownFlightPhase, pending, width, fontScale, onPaper, onAi, onFlights, onClub, onStatus }: Props) {
  const year = new Date().getFullYear();
  const real = ownFlights?.flights ?? [];
  const statistics = summarizeRealFlights(real, year);
  const season = statistics.season;
  const time = season.knownDurationCount ? formatReportedMinutes(season.knownMinutes) : '—';
  const showRings = fontScale <= 1.3 && String(season.count).length <= 5 && time.length <= 5;
  const retrieval = ownFlights ? planFlightRetrieval(ownFlights.snapshot.savedRetrievals) : null;
  const freshness = dataFreshness(retrieval?.lastSuccessfulRetrievalAt ?? null, ownFlightPhase === 'ready' ? 'ready' : ownFlightPhase === 'failed' ? 'failed' : 'loading');
  const latest = [...real].filter(f => f.facts.assessment.date.state === 'parsed').sort((a,b) => (b.facts.assessment.date.value ?? '').localeCompare(a.facts.assessment.date.value ?? ''))[0];
  const largeText = fontScale > 1.3;
  const multiColumn = width >= 840 && !largeText;
  const pairWidth = multiColumn ? (Math.min(width - 20, 920) - 8) / 2 : Math.min(width - 20, 430);
  // All bento rows share the same outer column edges, independent of each card's padding.
  const leftWidth = (pairWidth - 8) * (190 / 328);
  const rightWidth = pairWidth - 8 - leftWidth;
  const pairStyle = largeText ? styles.stack : ui.grid;
  const groupStyle = styles.group;
  const hero = <Card style={[styles.hero, !largeText && { height: 154 }]} onPress={onPaper} label="Papierstand ansehen">
      <Photo source={sunset} tint="#913e1266" style={styles.heroImage}>
        <View style={[ui.row, { alignItems: 'flex-start' }]}><View style={styles.paperIcon}><SymbolIcon name="logbook" size={28} tone="paper" /></View><View style={ui.column}><Label style={styles.eyebrow}>PAPIERFLUGBUCH</Label><Label style={styles.pending}>{pending === null ? 'Flugbuch auswählen' : `${pending} Flüge offen`}</Label><Label style={styles.small}>Gespeicherte Nachweise ansehen.</Label></View></View>
        <View style={styles.orangeButton}><IconLabel name="arrow" size={18} tone="contrast" style={{ color: '#281004', fontWeight: '700' }}>Papierstand ansehen</IconLabel></View>
      </Photo>
    </Card>;
  const seasonCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.season, { width: leftWidth }, largeText && styles.noFlex]} onPress={() => onFlights(year)} label={`Eigene gespeicherte Flüge. ${statistics.count} insgesamt; ${statistics.unknownDurationCount} unbekannte oder strittige Flugzeiten. Abdeckung und Datenstand.`}>
        <View style={ui.section}><Section title="Deine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
        {ownFlightPhase === 'ready' ? <>
          {showRings ? <View style={styles.rings}>
            <SeasonRing slices={seasonRingSlices(season.aircraft, 'count')} value={String(season.count)} label="Flüge" description={`${season.count} gespeicherte Flüge ${year}, Anteile nach Kennzeichen.`} />
            <SeasonRing slices={seasonRingSlices(season.aircraft, 'knownMinutes')} value={time} label="Std." description={`${time} bekannte gemeldete Stunden ${year}, Anteile nach Kennzeichen; ${season.unknownDurationCount} Zeiten unbekannt oder strittig.`} />
          </View> : <View style={styles.seasonMetrics}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge {year}</Label></View><View style={styles.metric}><Text style={styles.value}>{time}</Text><Label muted>gemeldete Std.</Label></View></View>}
          <Label muted style={styles.small}>{season.unknownDurationCount} Saisonzeiten unbekannt/strittig</Label>
          {season.aircraft.map(item => <View key={item.aircraft} style={ui.row}><View style={[styles.aircraftKey, { backgroundColor: item.color }]} /><Label muted style={[styles.small, { flex: 1 }]}>{item.aircraft}: {item.count} Flüge · {item.knownMinutes === null ? 'Zeit unbekannt' : `${formatReportedMinutes(item.knownMinutes)} h bekannt`}{item.unknownDurationCount ? ` · ${item.unknownDurationCount} Zeiten unbekannt/strittig` : ''}</Label></View>)}
          <Label muted style={styles.small}>Bibliothek: {statistics.count} Flüge · {statistics.unknownDurationCount} Zeiten unbekannt/strittig</Label>
          <Label muted style={styles.small}>Gesamt: {formatReportedMinutes(statistics.knownMinutes)} bekannte gemeldete Flugzeit</Label>
          {statistics.years.map(item => <Label key={item.year} muted style={styles.small}>{item.year}: {item.flights} Flüge</Label>)}
          {statistics.unknownDateCount > 0 && <Label muted style={styles.small}>{statistics.unknownDateCount} Flüge ohne gültiges Quelldatum</Label>}
          {statistics.aircraft.map(item => <Label key={item.registration} muted style={styles.small}>{item.registration}: {item.flights} Flüge</Label>)}
          <Label muted style={styles.small}>{freshness.label}</Label>
          {retrieval?.periods.map(p => <Label key={p.from} muted style={styles.small}>Abgedeckt: {p.from} bis {p.to}</Label>)}
          {retrieval && retrieval.periods.length === 0 && <Label muted style={styles.small}>Noch keine gespeicherte Abrufabdeckung.</Label>}
          {retrieval?.gaps.map(p => <Label key={p.from} style={styles.small}>Lücke: {p.from} bis {p.to}</Label>)}
          {freshness.reminder && <Label muted style={styles.small}>{freshness.note}</Label>}
        </> : <Label muted>{ownFlightPhase === 'failed' ? 'Eigene Flüge nicht lesbar. Gespeicherte Daten bleiben erhalten.' : ownFlightPhase === 'missing' ? 'Eigene Flugbibliothek noch nicht eingerichtet.' : 'Eigene gespeicherte Flüge werden geladen …'}</Label>}
        <Label muted style={styles.small}>Nur aktuell gespeicherte Anbieterwerte; keine Buchzuordnung.</Label>
      </Card>
      <Card style={[styles.ai, { width: rightWidth }, largeText && styles.noFlex]} onPress={onAi} label="MoFlight AI öffnen">
        <View style={[ui.row, { gap: 5, flexWrap: 'wrap' }]}><SymbolIcon name="sparkle" size={27} tone="assistant" /><Label style={{ fontWeight: '600' }}>MoFlight AI</Label></View>
        <View style={styles.aiQuestion}><Label style={{ fontSize: 12, lineHeight: 17 }}>Welches Flugzeug fliege ich am häufigsten?</Label></View>
        <View style={ui.row}><View style={styles.arrow}><SymbolIcon name="arrow" size={22} /></View><Label muted style={styles.small}>Lokal</Label></View>
      </Card>
    </View>;
  const flightCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, { width: leftWidth }, largeText && styles.noFlex]} onPress={() => onFlights()} label="Gespeicherte Flüge öffnen">
        <Section title="Zuletzt datiert" />
        {latest ? <><Label muted style={styles.small}>{latest.facts.assessment.date.value}</Label><Label>{latest.facts.assessment.fields.registration.state === 'value' ? latest.facts.assessment.fields.registration.raw : 'Kennzeichen unbekannt'}</Label><IconLabel name="clock" size={16} style={styles.small}>{latest.facts.assessment.durations.flight.state === 'known' ? `${formatReportedMinutes(latest.facts.assessment.durations.flight.minutes)} h` : 'Flugzeit unbekannt'}</IconLabel></> : <Label muted>{ownFlightPhase === 'ready' ? 'Noch keine datierten gespeicherten Flüge.' : 'Kein gespeicherter Flug ausgewählt.'}</Label>}
        <View style={styles.track}><GliderMark color="#598596" /><Label muted style={styles.small}>Kein gespeicherter Track</Label></View>
      </Card>
      <Card style={[styles.club, { width: rightWidth }, largeText && styles.noFlex]} onPress={onClub} label="Vereinsdienste öffnen"><Photo source={windsock} tint="#00112688" style={{ flex: 1 }}><Section title="Verein" /><View style={{ flex: 1 }} /><Label>Nächster Dienst</Label><Label style={{ fontWeight: '600' }}>Nicht verfügbar</Label><Label muted style={styles.small}>Vereinsquelle fehlt</Label><IconLabel name="location" size={16}>Startplatz —</IconLabel></Photo></Card>
    </View>;
  const weatherCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, { width: leftWidth }, largeText && styles.noFlex]} onPress={onStatus} label="Wetterstatus ansehen"><Section title="Wetter & Platz" /><Label muted>Kein Wetterbericht</Label><View style={[ui.row, { paddingVertical: 4 }]}><SymbolIcon name="weather" size={28} /><Text style={styles.value}>—</Text></View><Label muted style={styles.small}>Keine datierte Quelle verbunden</Label></Card>
      <Card style={[styles.upcoming, { width: rightWidth }, largeText && styles.noFlex]}><Section title="Als Nächstes" />{pending !== null && pending > 0 ? <Pressable accessibilityRole="button" onPress={onPaper} style={[ui.smallAction, ui.row]}><View style={styles.smallPaperIcon}><SymbolIcon name="logbook" size={20} tone="paper" /></View><Label style={{ flex: 1, fontSize: 11 }}>{pending} Papiereinträge prüfen</Label></Pressable> : <Label muted>Keine belegten Aktionen</Label>}<Pressable accessibilityRole="button" onPress={onClub} style={ui.smallAction}><IconLabel name="right" size={14} muted style={styles.small}>Vereinsdaten ansehen</IconLabel></Pressable></Card>
    </View>;
  if (multiColumn) return <View style={[styles.dashboard, styles.dashboardWide]}><View style={styles.tabletColumn}>{hero}{flightCards}</View><View style={styles.tabletColumn}>{seasonCards}{weatherCards}</View></View>;
  return <View style={styles.dashboard}>{hero}{seasonCards}{flightCards}{weatherCards}</View>;

}
const styles = StyleSheet.create({
  dashboard: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 8 }, dashboardWide: { maxWidth: 920, flexDirection: 'row', alignItems: 'flex-start' }, tabletColumn: { flex: 1, minWidth: 0, gap: 8 },
  group: { width: '100%' }, half: { width: '49.5%' }, stack: { gap: 8 }, noFlex: { flex: 0, width: '100%' },
  hero: { padding: 0, borderColor: '#995f3c', minHeight: 144 }, heroImage: { flex: 1, minHeight: 144 },
  paperIcon: { width: 38, height: 38, borderRadius: 15, backgroundColor: '#ffb76c33', borderWidth: 1, borderColor: '#ffc38f66', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '600' }, pending: { fontSize: 16, lineHeight: 22, fontWeight: '600' }, small: { fontSize: 11, lineHeight: 16 },
  orangeButton: { backgroundColor: '#ff762b', experimental_backgroundImage: 'linear-gradient(180deg, #ff963e, #ff621f)', minHeight: 36, paddingVertical: 7, borderRadius: 15, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 18, marginTop: 2 },
  season: { minWidth: 0, minHeight: 194, gap: 5 }, yearBadge: { paddingHorizontal: 7, borderRadius: 12, backgroundColor: '#1b4269' },
  seasonMetrics: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' }, metric: { flexShrink: 1 }, value: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  aircraftKey: { width: 7, height: 7, borderRadius: 4 },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  ai: { minWidth: 0, minHeight: 194, backgroundColor: '#181854', experimental_backgroundImage: 'linear-gradient(145deg, #292276, #101c45, #53165e)', borderColor: '#6853b5', justifyContent: 'space-between' },
  sparkle: { fontSize: 27, lineHeight: 32, color: '#d59bff' }, aiQuestion: { backgroundColor: '#181c5988', borderColor: '#3c4492', borderWidth: 1, borderRadius: 12, padding: 8 }, arrow: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#426cbe', backgroundColor: '#173a7a', alignItems: 'center', justifyContent: 'center' },
  flight: { minWidth: 0, minHeight: 166, gap: 3 }, club: { minWidth: 0, padding: 0, minHeight: 166 },
  track: { minHeight: 48, marginTop: 4, borderRadius: 9, backgroundColor: '#102c35', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  upcoming: { minWidth: 0, minHeight: 140, gap: 3 }, smallPaperIcon: { width: 25, height: 25, backgroundColor: '#ffb76c33', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

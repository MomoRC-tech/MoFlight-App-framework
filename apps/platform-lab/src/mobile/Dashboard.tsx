import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Flight } from '@moflight/flight-logbook';
import { Card, GliderMark, Label, Photo, Section, colors, ui } from './theme';
import { formatDuration, selectFlights, summarizeFlights } from './flight-model';
import { aircraftSeasonShares, seasonRingSlices } from './season-model';
import { SeasonRing } from './SeasonRing';

const sunset = require('../../assets/aviation/gliding-sunset.jpg');
const windsock = require('../../assets/aviation/windsock.jpg');
interface Props {
  flights: Flight[]; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onAi: () => void; onFlights: (year?: number) => void;
  onDetail: (flight: Flight) => void; onClub: () => void; onStatus: () => void;
}
export function Dashboard({ flights, pending, width, fontScale, onPaper, onAi, onFlights, onDetail, onClub, onStatus }: Props) {
  const year = new Date().getFullYear();
  const seasonFlights = selectFlights(flights, { year, search: '', category: 'all' });
  const season = summarizeFlights(seasonFlights);
  const aircraft = aircraftSeasonShares(seasonFlights);
  const countDescription = `${season.count} gespeicherte Flüge ${year}. Verteilung nach Kennzeichen: ${aircraft.map(share => `${share.aircraft}: ${share.count}`).join(', ') || 'keine Flüge'}. Saisonflüge öffnen.`;
  const timeDescription = `${formatDuration(season.knownMinutes)} bekannte Flugstunden ${year}. Verteilung nach Kennzeichen: ${aircraft.map(share => `${share.aircraft}: ${formatDuration(share.knownMinutes)} Stunden${share.unknownDurationCount ? `, ${share.unknownDurationCount} Zeiten unbekannt` : ''}`).join(', ') || 'keine Flüge'}. Saisonflüge öffnen.`;
  const ordered = selectFlights(flights, { year: null, search: '', category: 'all' });
  const latest = ordered.find(f => f.date !== null);
  const day = latest ? ordered.filter(f => f.date === latest.date) : [];
  const latestKnown = day.length === 1 || day.every(f => f.start !== null && f.time_basis === 'UTC') && new Set(day.map(f => f.start)).size === day.length;
  const largeText = fontScale > 1.3;
  const multiColumn = width >= 840 && !largeText;
  const pairWidth = multiColumn ? (Math.min(width - 20, 920) - 8) / 2 : Math.min(width - 20, 430);
  // All bento rows share the same outer column edges, independent of each card's padding.
  const leftWidth = (pairWidth - 8) * (190 / 328);
  const rightWidth = pairWidth - 8 - leftWidth;
  const pairStyle = largeText ? styles.stack : ui.grid;
  const groupStyle = styles.group;
  const hero = <Card style={[styles.hero, !largeText && { height: 154 }]} onPress={onPaper} label="Papierflugbuch aktualisieren">
      <Photo source={sunset} tint="#913e1266" style={styles.heroImage}>
        <View style={[ui.row, { alignItems: 'flex-start' }]}><View style={styles.paperIcon}><Text style={{ color: 'white', fontSize: 25 }}>▱</Text></View><View style={ui.column}><Label style={styles.eyebrow}>PAPIERFLUGBUCH AKTUALISIEREN</Label><Label style={styles.pending}>{pending === null ? 'Flugbuch auswählen' : `${pending} Flüge offen`}</Label><Label style={styles.small}>Jetzt abgleichen und digitalisieren.</Label></View></View>
        <View style={styles.orangeButton}><Label style={{ color: '#281004', fontWeight: '700' }}>Flüge jetzt erfassen  →</Label></View>
      </Photo>
    </Card>;
  const seasonCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.season, { width: leftWidth }, largeText && styles.noFlex]} onPress={() => onFlights(year)} label={`Deine Saison ${year}. ${countDescription} ${timeDescription}`}>
        <View style={ui.section}><Section title="Deine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
        <View style={styles.seasonMetrics}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge</Label></View><View style={styles.metric}><Text style={styles.value}>{formatDuration(season.knownMinutes)}</Text><Label muted>bekannte Std.</Label></View></View>
        <Label muted style={styles.small}>Gespeicherte Saison · Vergleich offen</Label>
        {!largeText && season.count < 1000 && formatDuration(season.knownMinutes).length <= 5 && <View style={styles.rings}><SeasonRing slices={seasonRingSlices(aircraft, 'count')} value={String(season.count)} label="Flüge" description={countDescription} /><SeasonRing slices={seasonRingSlices(aircraft, 'knownMinutes')} value={formatDuration(season.knownMinutes)} label="bekannte h" description={timeDescription} /></View>}
        {season.unknownDurationCount > 0 && <Label muted style={styles.small}>{season.unknownDurationCount} Zeiten unbekannt</Label>}
      </Card>
      <Card style={[styles.ai, { width: rightWidth }, largeText && styles.noFlex]} onPress={onAi} label="MoFlight AI öffnen">
        <View style={[ui.row, { gap: 5, flexWrap: 'wrap' }]}><Text style={styles.sparkle}>✦</Text><Label style={{ fontWeight: '600' }}>MoFlight AI</Label></View>
        <View style={styles.aiQuestion}><Label style={{ fontSize: 12, lineHeight: 17 }}>Welches Flugzeug fliege ich am häufigsten?</Label></View>
        <View style={ui.row}><View style={styles.arrow}><Label style={{ fontSize: 22 }}>→</Label></View><Label muted style={styles.small}>Lokal</Label></View>
      </Card>
    </View>;
  const flightCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, { width: leftWidth }, largeText && styles.noFlex]} onPress={latest ? () => onDetail(latest) : () => onFlights()} label="Zuletzt datierten Flug öffnen">
        <Section title={latestKnown ? 'Letzter Flug' : 'Zuletzt datiert'} />
        {latest ? <><Label muted style={styles.small}>{latest.date ? new Date(latest.date + 'T12:00:00Z').toLocaleDateString('de-DE', { timeZone: 'UTC' }) : 'Datum unbekannt'}</Label><Label>{latest.registration ?? 'Kennzeichen unbekannt'} · {latest.aircraft_model ?? 'Typ unbekannt'}</Label><Label>{latest.start_place ?? '—'} → {latest.landing_place ?? '—'}</Label><Label style={styles.small}>◷ {formatDuration(latest.minutes)} h{!latestKnown ? ' · Reihenfolge offen' : ''}</Label></> : <Label muted>Noch keine gespeicherten Flüge.</Label>}
        <View style={styles.track}><GliderMark color="#598596" /><Label muted style={styles.small}>Kein gespeicherter Track</Label></View>
      </Card>
      <Card style={[styles.club, { width: rightWidth }, largeText && styles.noFlex]} onPress={onClub} label="Vereinsdienste öffnen"><Photo source={windsock} tint="#00112688" style={{ flex: 1 }}><Section title="Verein" /><View style={{ flex: 1 }} /><Label>Nächster Dienst</Label><Label style={{ fontWeight: '600' }}>Nicht verfügbar</Label><Label muted style={styles.small}>Vereinsquelle fehlt</Label><Label>⌖  Startplatz —</Label></Photo></Card>
    </View>;
  const weatherCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, { width: leftWidth }, largeText && styles.noFlex]} onPress={onStatus} label="Wetterstatus ansehen"><Section title="Wetter & Platz" /><Label muted>Kein Wetterbericht</Label><View style={[ui.row, { paddingVertical: 4 }]}><Text style={{ fontSize: 28, color: colors.cyan }}>☁</Text><Text style={styles.value}>—</Text></View><Label muted style={styles.small}>Keine datierte Quelle verbunden</Label></Card>
      <Card style={[styles.upcoming, { width: rightWidth }, largeText && styles.noFlex]}><Section title="Als Nächstes" />{pending !== null && pending > 0 ? <Pressable accessibilityRole="button" onPress={onPaper} style={[ui.smallAction, ui.row]}><View style={styles.smallPaperIcon}><Label>▱</Label></View><Label style={{ flex: 1, fontSize: 11 }}>{pending} Papiereinträge prüfen</Label></Pressable> : <Label muted>Keine belegten Aktionen</Label>}<Pressable accessibilityRole="button" onPress={onClub} style={ui.smallAction}><Label muted style={styles.small}>Vereinsdaten ansehen  ›</Label></Pressable></Card>
    </View>;
  if (multiColumn) return <View style={[styles.dashboard, styles.dashboardWide]}><View style={styles.tabletColumn}>{hero}{flightCards}</View><View style={styles.tabletColumn}>{seasonCards}{weatherCards}</View></View>;
  return <View style={styles.dashboard}>{hero}{seasonCards}{flightCards}{weatherCards}</View>;

}
const styles = StyleSheet.create({
  dashboard: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 8 }, dashboardWide: { maxWidth: 920, flexDirection: 'row', alignItems: 'flex-start' }, tabletColumn: { flex: 1, minWidth: 0, gap: 8 },
  group: { width: '100%' }, half: { width: '49.5%' }, stack: { gap: 8 }, noFlex: { flex: 0, width: '100%' },
  hero: { padding: 0, borderColor: '#995f3c', minHeight: 144 }, heroImage: { flex: 1, minHeight: 144 },
  paperIcon: { width: 38, height: 38, borderRadius: 15, backgroundColor: '#ff7929', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 11, lineHeight: 16, fontWeight: '600' }, pending: { fontSize: 16, lineHeight: 22, fontWeight: '600' }, small: { fontSize: 11, lineHeight: 16 },
  orangeButton: { backgroundColor: '#ff762b', experimental_backgroundImage: 'linear-gradient(180deg, #ff963e, #ff621f)', minHeight: 36, paddingVertical: 7, borderRadius: 15, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 18, marginTop: 2 },
  season: { minWidth: 0, minHeight: 194, gap: 5 }, yearBadge: { paddingHorizontal: 7, borderRadius: 12, backgroundColor: '#1b4269' },
  seasonMetrics: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' }, metric: { flexShrink: 1 }, value: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  ai: { minWidth: 0, minHeight: 194, backgroundColor: '#181854', experimental_backgroundImage: 'linear-gradient(145deg, #292276, #101c45, #53165e)', borderColor: '#6853b5', justifyContent: 'space-between' },
  sparkle: { fontSize: 27, lineHeight: 32, color: '#d59bff' }, aiQuestion: { backgroundColor: '#181c5988', borderColor: '#3c4492', borderWidth: 1, borderRadius: 12, padding: 8 }, arrow: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#426cbe', backgroundColor: '#173a7a', alignItems: 'center', justifyContent: 'center' },
  flight: { minWidth: 0, minHeight: 166, gap: 3 }, club: { minWidth: 0, padding: 0, minHeight: 166 },
  track: { minHeight: 48, marginTop: 4, borderRadius: 9, backgroundColor: '#102c35', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  upcoming: { minWidth: 0, minHeight: 140, gap: 3 }, smallPaperIcon: { width: 25, height: 25, backgroundColor: '#f97425', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

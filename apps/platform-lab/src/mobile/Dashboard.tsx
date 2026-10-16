import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Flight } from '@moflight/flight-logbook';
import { Card, GliderMark, Label, Photo, Section, colors, ui } from './theme';
import { formatDuration, selectFlights, summarizeFlights } from './flight-model';

const sunset = require('../../assets/aviation/gliding-sunset.jpg');
const windsock = require('../../assets/aviation/windsock.jpg');
interface Props {
  flights: Flight[]; pending: number | null; width: number; fontScale: number;
  onPaper: () => void; onAi: () => void; onFlights: (year?: number) => void;
  onDetail: (flight: Flight) => void; onClub: () => void; onStatus: () => void;
}
export function Dashboard({ flights, pending, width, fontScale, onPaper, onAi, onFlights, onDetail, onClub, onStatus }: Props) {
  const year = new Date().getFullYear();
  const season = summarizeFlights(selectFlights(flights, { year, search: '', category: 'all' }));
  const ordered = selectFlights(flights, { year: null, search: '', category: 'all' });
  const latest = ordered.find(f => f.date !== null);
  const day = latest ? ordered.filter(f => f.date === latest.date) : [];
  const latestKnown = day.length === 1 || day.every(f => f.start !== null && f.time_basis === 'UTC') && new Set(day.map(f => f.start)).size === day.length;
  const largeText = fontScale > 1.3;
  const multiColumn = width >= 840 && !largeText;
  const pairStyle = largeText ? styles.stack : ui.grid;
  const groupStyle = styles.group;
  const hero = <Card style={[styles.hero, !largeText && { height: 162 }]} onPress={onPaper} label="Papierflugbuch aktualisieren">
      <Photo source={sunset} tint="#913e1266" style={styles.heroImage}>
        <View style={[ui.row, { alignItems: 'flex-start' }]}><View style={styles.paperIcon}><Text style={{ color: 'white', fontSize: 25 }}>▱</Text></View><View style={ui.column}><Label style={styles.eyebrow}>PAPIERFLUGBUCH AKTUALISIEREN</Label><Label style={styles.pending}>{pending === null ? 'Flugbuch auswählen' : `${pending} Flüge offen`}</Label><Label style={styles.small}>Gespeicherte Einträge ohne Papiernachweis.</Label></View></View>
        <View style={styles.orangeButton}><Label style={{ color: '#281004', fontWeight: '700' }}>Flüge jetzt erfassen  →</Label></View>
        <Label style={styles.small}>Jetzt abgleichen und digitalisieren.</Label>
      </Photo>
    </Card>;
  const seasonCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.season, largeText && styles.noFlex]} onPress={() => onFlights(year)} label={`Deine Saison ${year}, Flüge öffnen`}>
        <View style={ui.section}><Section title="Deine Saison" /><View style={styles.yearBadge}><Label style={styles.small}>{year}</Label></View></View>
        <View style={styles.seasonMetrics}><View style={styles.metric}><Text style={styles.value}>{season.count}</Text><Label muted>Flüge</Label></View><View style={styles.metric}><Text style={styles.value}>{formatDuration(season.knownMinutes)}</Text><Label muted>bekannte Std.</Label></View></View>
        <Label muted style={styles.small}>Gespeicherte Saison · Vergleich offen</Label>
        {!largeText && season.count < 1000 && formatDuration(season.knownMinutes).length <= 5 && <View style={styles.rings}><View style={styles.ring}><Label style={styles.ringValue}>{season.count}</Label><Label style={styles.ringLabel}>Flüge</Label></View><View style={[styles.ring, { borderColor: colors.green }]}><Label style={styles.ringValue}>{formatDuration(season.knownMinutes)}</Label><Label style={styles.ringLabel}>bekannte h</Label></View></View>}
        {season.unknownDurationCount > 0 && <Label muted style={styles.small}>{season.unknownDurationCount} Zeiten unbekannt</Label>}
      </Card>
      <Card style={[styles.ai, largeText && styles.noFlex]} onPress={onAi} label="MoFlight AI öffnen">
        <View style={[ui.row, { gap: 5, flexWrap: 'wrap' }]}><Text style={styles.sparkle}>✦</Text><Label style={{ fontWeight: '600' }}>MoFlight AI</Label></View>
        <View style={styles.aiQuestion}><Label>Welches Flugzeug fliege ich am häufigsten?</Label></View>
        <View style={styles.arrow}><Label style={{ fontSize: 22 }}>→</Label></View><Label muted style={styles.small}>Lokale Auswertung</Label>
      </Card>
    </View>;
  const flightCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, largeText && styles.noFlex]} onPress={latest ? () => onDetail(latest) : () => onFlights()} label="Zuletzt datierten Flug öffnen">
        <Section title={latestKnown ? 'Letzter Flug' : 'Zuletzt datiert'} />
        {latest ? <><Label muted style={styles.small}>{latest.date ? new Date(latest.date + 'T12:00:00Z').toLocaleDateString('de-DE', { timeZone: 'UTC' }) : 'Datum unbekannt'}</Label><Label>{latest.registration ?? 'Kennzeichen unbekannt'} · {latest.aircraft_model ?? 'Typ unbekannt'}</Label><Label>{latest.start_place ?? '—'} → {latest.landing_place ?? '—'}</Label><Label style={styles.small}>◷ {formatDuration(latest.minutes)} h{!latestKnown ? ' · Reihenfolge offen' : ''}</Label></> : <Label muted>Noch keine gespeicherten Flüge.</Label>}
        <View style={styles.track}><GliderMark color="#598596" /><Label muted style={styles.small}>Kein gespeicherter Track</Label></View>
      </Card>
      <Card style={[styles.club, largeText && styles.noFlex]} onPress={onClub} label="Vereinsdienste öffnen"><Photo source={windsock} tint="#00112688" style={{ flex: 1 }}><Section title="Verein" /><View style={{ flex: 1 }} /><Label>Nächster Dienst</Label><Label style={{ fontWeight: '600' }}>Nicht verfügbar</Label><Label muted style={styles.small}>Vereinsquelle fehlt</Label><Label>⌖  Startplatz —</Label></Photo></Card>
    </View>;
  const weatherCards = <View style={[groupStyle, pairStyle]}>
      <Card style={[styles.flight, largeText && styles.noFlex]} onPress={onStatus} label="Wetterstatus ansehen"><Section title="Wetter & Platz" /><Label muted>Kein Wetterbericht</Label><View style={[ui.row, { paddingVertical: 4 }]}><Text style={{ fontSize: 28, color: colors.cyan }}>☁</Text><Text style={styles.value}>—</Text></View><Label muted style={styles.small}>Keine datierte Quelle verbunden</Label></Card>
      <Card style={[styles.upcoming, largeText && styles.noFlex]}><Section title="Als Nächstes" />{pending !== null && pending > 0 ? <Pressable accessibilityRole="button" onPress={onPaper} style={[ui.smallAction, ui.row]}><View style={styles.smallPaperIcon}><Label>▱</Label></View><Label style={{ flex: 1, fontSize: 11 }}>{pending} Papiereinträge prüfen</Label></Pressable> : <Label muted>Keine belegten Aktionen</Label>}<Pressable accessibilityRole="button" onPress={onClub} style={ui.smallAction}><Label muted style={styles.small}>Vereinsdaten ansehen  ›</Label></Pressable></Card>
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
  season: { flex: 1.38, minWidth: 0, minHeight: 194, gap: 5 }, yearBadge: { paddingHorizontal: 7, borderRadius: 12, backgroundColor: '#1b4269' },
  seasonMetrics: { flexDirection: 'row', gap: 5, justifyContent: 'space-between' }, metric: { flexShrink: 1 }, value: { color: colors.text, fontSize: 24, lineHeight: 29, fontWeight: '700' },
  rings: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap', marginTop: 2 }, ring: { width: 62, height: 62, borderRadius: 31, borderWidth: 6, borderColor: colors.cyan, alignItems: 'center', justifyContent: 'center', backgroundColor: '#061626' }, ringValue: { fontSize: 15, lineHeight: 19, fontWeight: '700' }, ringLabel: { fontSize: 9, lineHeight: 12 },
  ai: { flex: 1, minWidth: 0, minHeight: 194, backgroundColor: '#181854', experimental_backgroundImage: 'linear-gradient(145deg, #292276, #101c45, #53165e)', borderColor: '#6853b5', justifyContent: 'space-between' },
  sparkle: { fontSize: 27, lineHeight: 32, color: '#d59bff' }, aiQuestion: { backgroundColor: '#181c5988', borderColor: '#3c4492', borderWidth: 1, borderRadius: 12, padding: 8 }, arrow: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#426cbe', backgroundColor: '#173a7a', alignItems: 'center', justifyContent: 'center' },
  flight: { flex: 1.38, minWidth: 0, minHeight: 166, gap: 3 }, club: { flex: 1, minWidth: 0, padding: 0, minHeight: 166 },
  track: { minHeight: 48, marginTop: 4, borderRadius: 9, backgroundColor: '#102c35', alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 },
  upcoming: { flex: 1, minWidth: 0, minHeight: 140, gap: 3 }, smallPaperIcon: { width: 25, height: 25, backgroundColor: '#f97425', borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

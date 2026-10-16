import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Flight } from '@moflight/flight-logbook';
import LabApp from '../App';
import { BookLab } from '../BookLab';
import { Action, Card, Chip, Empty, Label, Photo, Section, colors, ui } from './theme';
import { useLibrary } from './use-library';
import { flightYears, selectFlights, summarizeFlights, formatDuration } from './flight-model';
import { localQuestions, localInsight } from './local-insights';

const mountain = require('../../assets/aviation/gliding-mountains.jpg');
const sunset = require('../../assets/aviation/gliding-sunset.jpg');
const windsock = require('../../assets/aviation/windsock.jpg');
const clubAirfield = require('../../assets/aviation/club-airfield.jpg');
const tabs = [{ id: 'home', title: 'Übersicht', icon: '⌂' }, { id: 'flights', title: 'Flüge', icon: '✈' }, { id: 'club', title: 'Verein', icon: '♧' }, { id: 'ai', title: 'AI', icon: '✧' }] as const;
type Tab = typeof tabs[number]['id'];
type ClubSection = 'Übersicht' | 'Termine' | 'Dienste' | 'Mitteilungen';
type Sheet = 'books' | 'tools' | 'selectBook' | 'filters' | 'unsupported' | 'credits' | null;
const dateText = (date: string | null) => date ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Datum unbekannt';

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Label muted style={s.metricLabel}>{label}</Label></View>;
}
function FlightRow({ flight, onPress }: { flight: Flight; onPress: () => void }) {
  return <Card onPress={onPress} label={`${dateText(flight.date)}, ${flight.registration ?? 'Flugzeug unbekannt'}, Details öffnen`} style={s.flightRow}>
    <Label style={s.flightDate}>{dateText(flight.date)}</Label>
    <View style={ui.row}>
      <View style={s.noTrack}><Text style={s.aircraftIcon}>✈</Text><Label muted style={{ fontSize: 10, textAlign: 'center' }}>Kein Track</Label></View>
      <View style={ui.column}><View style={{ gap: 1 }}><Label style={{ fontWeight: '600', flexShrink: 1 }}>{flight.registration ?? 'Kennzeichen unbekannt'}</Label><Label muted>{flight.aircraft_model ?? 'Typ unbekannt'}</Label></View>
        <Label muted>{flight.start_place ?? '—'}  →  {flight.landing_place ?? '—'}</Label>
        <View style={ui.row}><Label>◷ {formatDuration(flight.minutes)} h</Label>{flight.pilot_role && <View style={s.badge}><Label style={{ color: colors.cyan, fontSize: 11 }}>{flight.pilot_role === 'Dual' ? 'Schulung' : flight.pilot_role}</Label></View>}</View>
      </View><Label muted>›</Label>
    </View>
  </Card>;
}

export default function MobileApp() { return <SafeAreaProvider><Shell /></SafeAreaProvider>; }
function Shell() {
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detail, setDetail] = useState<Flight | null>(null);
  const [clubSection, setClubSection] = useState<ClubSection>('Übersicht');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [training, setTraining] = useState(false);
  const [draft, setDraft] = useState('');
  const [aiError, setAiError] = useState(false);
  const [sending, setSending] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);
  const toolsOpen = sheet === 'books' || sheet === 'tools';
  const library = useLibrary(toolsOpen);
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 350 || fontScale > 1.3;
  const years = flightYears(library.flights);
  const selectedYear = year;
  const displayedYears = year !== null && !years.includes(year) ? [year, ...years].sort((a, b) => b - a) : years;
  const flights = selectFlights(library.flights, { year: selectedYear, search, category: training ? 'training' : 'all' });
  const summary = summarizeFlights(flights);
  const currentYear = new Date().getFullYear();
  const season = summarizeFlights(selectFlights(library.flights, { year: currentYear, search: '', category: 'all' }));
  const latest = selectFlights(library.flights, { year: null, search: '', category: 'all' }).find(f => f.date !== null);
  const latestCandidates = latest ? library.flights.filter(f => f.date === latest.date) : [];
  const unambiguousLatest = latestCandidates.length === 1 || latestCandidates.every(f => f.start !== null && f.time_basis === 'UTC') && new Set(latestCandidates.map(f => f.start)).size === latestCandidates.length;
  const book = library.books.find(b => b.id === library.bookId);
  useEffect(() => { setDetail(null); setLocalAnswer(null); }, [library.bookId, library.flights]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (detail) { setDetail(null); return true; }
      if (sheet) { setSheet(null); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    }); return () => listener.remove();
  }, [detail, sheet, tab]);
  const openBooks = () => setSheet('books');
  const ask = (question: string) => { setDraft(question); setAiError(false); setTab('ai'); };
  const quickQuestions = localQuestions;
  const localQuery = (index: number) => {
    setDraft(quickQuestions[index]!); setAiError(false);
    setLocalAnswer(localInsight(library.flights, index, currentYear));
  };
  const send = () => {
    if (!draft.trim() || sending) return;
    // No gateway exists: report a real unavailable state; never manufacture a response.
    setSending(true); setAiError(true); setSending(false);
  };
  const stateBanner = <View style={s.stateBanner}>
    <Label style={s.provenance}>ENTWICKLUNG · SYNTHETISCHE LOKALE BIBLIOTHEK</Label>
    <View style={ui.row}><Pressable accessibilityRole="button" accessibilityLabel="Flugbuch auswählen" disabled={library.busy} onPress={() => setSheet('selectBook')} style={[ui.smallAction, { flex: 1 }]}><Label muted>{book?.name ?? 'Noch kein Flugbuch'}  ⌄</Label></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Lokale Daten aktualisieren" disabled={library.busy} onPress={() => void library.reload()} style={ui.smallAction}><Label style={{ color: colors.cyan }}>↻ Aktualisieren</Label></Pressable></View>
    {library.busy && <ActivityIndicator color={colors.cyan} accessibilityLabel="Lokale Flüge laden" />}
    {library.error && <View accessibilityLiveRegion="polite"><Label style={{ color: '#ffbd9b' }}>{library.error}</Label><Action secondary onPress={() => void library.reload()}>Erneut versuchen</Action></View>}
  </View>;
  const heading = (title: string, image = mountain, subtitle?: string, tint?: string) => <Photo source={image} style={s.header} tint={tint}>
    <View style={s.headerTop}><Text accessibilityRole="header" style={ui.title}>{title}</Text><Pressable accessibilityRole="button" accessibilityLabel="Entwicklungswerkzeuge öffnen" onPress={() => setSheet('tools')} style={s.toolButton}><Label style={{ fontSize: 20 }}>⚙</Label></Pressable></View>
    {subtitle && <Label>{subtitle}</Label>}
  </Photo>;
  const flightHeader = <View style={{ gap: 10 }}>
    {heading('Flüge')}
    <View style={ui.row}><View style={s.searchBox}><Label muted>⌕</Label><TextInput accessibilityLabel="Flüge durchsuchen" placeholder="Flüge durchsuchen …" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={s.search} autoCorrect={false} returnKeyType="search" /></View><Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" onPress={() => setSheet('filters')} style={s.filterButton}><Label>☷</Label></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip title="Alle Jahre" selected={selectedYear === null} onPress={() => setYear(null)} />{displayedYears.map(y => <Chip key={y} title={String(y)} selected={selectedYear === y} onPress={() => setYear(y)} />)}</ScrollView>
    <Card style={[s.statsStrip, compact && { flexDirection: 'column' }]}><Metric value={String(summary.count)} label="Flüge" /><Metric value={formatDuration(summary.knownMinutes)} label="bekannte Std." /><Metric value="—" label="Kilometer" /><Metric value={formatDuration(summary.averageMinutes)} label="Ø pro Flug" /></Card>
    {summary.unknownDurationCount > 0 && <Label muted>{summary.unknownDurationCount} Flugzeiten unbekannt · kein vollständiger Durchschnitt.</Label>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip title="Alle" selected={!training} onPress={() => setTraining(false)} /><Chip title="Strecke ⓘ" onPress={() => setSheet('unsupported')} /><Chip title="Platzrunden ⓘ" onPress={() => setSheet('unsupported')} /><Chip title="Schulung" selected={training} onPress={() => setTraining(true)} /></ScrollView>
    {stateBanner}
  </View>;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={s.root}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    <View style={s.content}>
      <View style={[s.page, tab !== 'home' && s.hidden]} accessibilityElementsHidden={tab !== 'home'} importantForAccessibility={tab === 'home' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {heading('MoFlight ─✈', mountain, 'Guten Tag! Bereit für neue Horizonte?')}
          <Card style={s.paper} onPress={openBooks} label="Papierflugbuch aktualisieren">
            <Photo source={sunset} style={s.paperPhoto} tint="#7a330a77"><Label style={s.eyebrow}>▱  PAPIERFLUGBUCH AKTUALISIEREN</Label><Label style={{ fontSize: 20, fontWeight: '700' }}>{library.pending === null ? 'Flugbuch auswählen' : `${library.pending} Einträge ohne Papiernachweis`}</Label><Label>Jetzt abgleichen und digitalisieren.</Label><View style={s.orangeButton}><Label style={{ color: '#211007', fontWeight: '700' }}>Flüge jetzt erfassen  →</Label></View></Photo>
          </Card>
          <View style={compact ? s.stacked : ui.grid}>
            <Card style={{ flex: 1.4 }} onPress={() => { setYear(currentYear); setTab('flights'); }} label={`Deine Saison ${currentYear}, Flüge öffnen`}>
              <Section title="Deine Saison" /><Label muted>{currentYear} · gespeicherte Flüge</Label>
              <View style={ui.grid}><Metric value={String(season.count)} label="Flüge" /><Metric value={formatDuration(season.knownMinutes)} label="bekannte Std." /></View>
              <Label muted style={{ fontSize: 12 }}>Abdeckung unbestätigt · kein Vorjahresvergleich</Label>
              {!compact && season.count < 1000 && formatDuration(season.knownMinutes).length <= 5 && <View style={s.rings}><View style={s.ring}><Label style={{ fontSize: 19, fontWeight: '700' }}>{season.count}</Label><Label muted style={{ fontSize: 10 }}>Flüge</Label></View><View style={[s.ring, { borderColor: colors.green }]}><Label style={{ fontSize: 17, fontWeight: '700' }}>{formatDuration(season.knownMinutes)}</Label><Label muted style={{ fontSize: 10 }}>bekannte h</Label></View></View>}
              {season.unknownDurationCount > 0 && <Label muted>{season.unknownDurationCount} Zeiten unbekannt</Label>}
            </Card>
            <Card style={s.aiTeaser} onPress={() => ask('Mit welchem Flugzeug bin ich am häufigsten geflogen?')} label="MoFlight AI öffnen"><Text style={s.sparkle}>✦</Text><Section title="MoFlight AI" /><Label>Deine Flugdaten. Deine Fragen.</Label><Label muted>Assistent noch nicht verbunden.</Label><Text style={s.circleArrow}>→</Text></Card>
          </View>
          <View style={compact ? s.stacked : ui.grid}>
            <Card style={{ flex: 1.4 }} onPress={latest ? () => setDetail(latest) : () => setTab('flights')} label="Zuletzt datierten Flug öffnen">
              <Section title={unambiguousLatest ? 'Letzter Flug' : 'Zuletzt datierte Flüge'} />
              {latest ? <><Label muted>{dateText(latest.date)}</Label><Label>{latest.registration ?? 'Kennzeichen unbekannt'} · {latest.aircraft_model ?? 'Typ unbekannt'}</Label><Label>{latest.start_place ?? '—'} → {latest.landing_place ?? '—'}</Label><Label>◷ {formatDuration(latest.minutes)} h</Label>{!unambiguousLatest && <Label muted>Reihenfolge am selben Tag unbekannt.</Label>}<View style={s.trackEmpty}><Label muted>Track nicht verfügbar</Label></View></> : <Empty title="Noch keine Flüge">Gespeicherte Flüge erscheinen hier.</Empty>}
            </Card>
            <Card style={{ flex: 1, padding: 0 }} onPress={() => { setClubSection('Dienste'); setTab('club'); }} label="Vereinsdienste öffnen"><Photo source={windsock} style={{ flex: 1, minHeight: 200 }}><Section title="Verein" /><Label>Nächster Dienst</Label><Label style={{ fontWeight: '600' }}>Keine Dienstdaten</Label><Label muted>Vereinsquelle noch nicht verbunden.</Label></Photo></Card>
          </View>
          <View style={compact ? s.stacked : ui.grid}><Card style={ui.column}><Section title="Wetter & Platz" /><Empty title="Wetter nicht verfügbar">Keine aktuelle, datierte Wetterquelle verbunden.</Empty></Card><Card style={ui.column}><Section title="Als Nächstes" />{library.pending !== null && library.pending > 0 ? <Pressable accessibilityRole="button" onPress={openBooks} style={ui.smallAction}><Label>▱ {library.pending} Papiereinträge prüfen  ›</Label></Pressable> : <Label muted>Keine belegten offenen Aktionen.</Label>}</Card></View>
          {stateBanner}
          <Pressable accessibilityRole="button" onPress={() => setSheet('credits')} style={ui.smallAction}><Label muted>Bildnachweise & Lizenzen</Label></Pressable>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'flights' && s.hidden]} accessibilityElementsHidden={tab !== 'flights'} importantForAccessibility={tab === 'flights' ? 'auto' : 'no-hide-descendants'}>
        <FlatList data={flights} keyExtractor={f => f.id} renderItem={({ item }) => <FlightRow flight={item} onPress={() => setDetail(item)} />} ListHeaderComponent={flightHeader} ListHeaderComponentStyle={{ marginBottom: 8 }} contentContainerStyle={s.flightCanvas} ItemSeparatorComponent={() => <View style={{ height: 7 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Card><Empty title={search || training || selectedYear !== null ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{search || training || selectedYear !== null ? 'Suchbegriff oder Filter ändern.' : 'Flugquellen und lokale Werkzeuge über + öffnen. Live-Import ist noch nicht verbunden.'}</Empty></Card>} />
        <Pressable accessibilityRole="button" accessibilityLabel="Flugworkflow öffnen" onPress={() => setSheet('tools')} style={({ pressed }) => [s.fab, pressed && ui.pressed]}><Text style={{ color: 'white', fontSize: 36, lineHeight: 42 }}>+</Text></Pressable>
      </View>
      <View style={[s.page, tab !== 'club' && s.hidden]} accessibilityElementsHidden={tab !== 'club'} importantForAccessibility={tab === 'club' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas}>
          {heading('Verein', clubAirfield)}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{(['Übersicht', 'Termine', 'Dienste', 'Mitteilungen'] as const).map(section => <Chip key={section} title={section} selected={clubSection === section} onPress={() => setClubSection(section)} />)}</ScrollView>
          {(clubSection === 'Übersicht' || clubSection === 'Dienste') && <Card style={{ padding: 0 }}><Photo source={windsock} style={{ minHeight: 205 }}><Section title="▣  Nächster Dienst" /><Empty title="Keine Dienste verfügbar">Eine berechtigte Vereinsquelle ist noch nicht verbunden. Datum, Uhrzeit und Startplatz sind unbekannt.</Empty><Action onPress={() => setSheet('tools')}>Verbindung ansehen  →</Action></Photo></Card>}
          {(clubSection === 'Übersicht' || clubSection === 'Termine') && <Card><Section title={clubSection === 'Termine' ? 'Termine' : '♧  Kommende Termine'} action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Termine')} /><Empty title="Keine Termine verfügbar">Vereinskalender noch nicht verbunden. Es werden keine Beispieltermine angezeigt.</Empty></Card>}
          {(clubSection === 'Übersicht' || clubSection === 'Mitteilungen') && <Card><Section title="▧  Aktuelle Mitteilungen" action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Mitteilungen')} /><Empty title="Keine Mitteilungen verfügbar">Nachrichten und Dokumente benötigen eine berechtigte Vereinsquelle.</Empty></Card>}
          <Label muted>Vereinsflieger-Zugang und MoFlight-Identität bleiben getrennt. Bestehende Rohdaten-Aufnahmen sind in den Entwicklungswerkzeugen verfügbar.</Label>
        </ScrollView>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[s.page, tab !== 'ai' && s.hidden]} accessibilityElementsHidden={tab !== 'ai'} importantForAccessibility={tab === 'ai' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {heading('✦ MoFlight AI', mountain, 'Dein persönlicher Segelflug-Assistent', '#21144a77')}
          <Card style={s.welcome}><View style={ui.row}><View style={s.aiBadge}><Text style={{ fontSize: 20, color: '#062d39' }}>✧</Text></View><Section title="Hallo!" /></View><Label>Deine Fragen zu Flugdaten und Auswertungen an einem Ort.</Label><Label muted>Der sichere AI-Dienst ist noch nicht verbunden. Gespeicherte Flüge kannst du bereits im Flugbuch durchsuchen und auswerten.</Label><Action secondary onPress={() => setTab('flights')}>Gespeicherte Flüge ansehen  →</Action></Card>
          <Section title="Beispiel-Fragen" /><Label muted>Lokale Auswertung · ohne AI-Dienst</Label>
          <View style={s.questionGrid}>{quickQuestions.map((question, index) => <Pressable key={question} accessibilityRole="button" accessibilityLabel={`${question} Lokal auswerten`} onPress={() => localQuery(index)} style={({ pressed }) => [s.question, compact && { width: '100%' }, pressed && ui.pressed]}><Label style={{ fontSize: 13 }}>{question}</Label><Label style={{ color: colors.cyan, fontSize: 11 }}>Lokal auswerten  ›</Label></Pressable>)}</View>
          {localAnswer && <Card><Section title="Lokale Auswertung" /><Label>{localAnswer}</Label><Label muted>Deterministisch berechnet · keine generierte AI-Antwort · nur ausgewähltes synthetisches Flugbuch.</Label><Action secondary onPress={() => setTab('flights')}>Flugbuch öffnen</Action></Card>}
          <View style={s.composer}><TextInput accessibilityLabel="Nachricht an MoFlight AI" value={draft} onChangeText={value => { setDraft(value); setAiError(false); }} placeholder="Frage mich etwas …" placeholderTextColor={colors.muted} multiline maxLength={4000} style={s.messageInput} /><Pressable accessibilityRole="button" accessibilityLabel="Nachricht senden" accessibilityState={{ disabled: !draft.trim() || sending }} disabled={!draft.trim() || sending} onPress={send} style={[s.send, !draft.trim() && { opacity: .45 }]}><Text style={{ color: 'white', fontSize: 24 }}>➤</Text></Pressable></View>
          {aiError && <Card><View accessibilityLiveRegion="polite"><Label>Der AI-Dienst ist noch nicht verbunden. Deine Frage wurde nicht gesendet und bleibt im Eingabefeld.</Label></View><Action secondary onPress={send}>Erneut versuchen</Action></Card>}
          <Card><Section title="Letzte Anfragen" /><Empty title="Noch keine gespeicherten Anfragen">Ein Gesprächsverlauf wird derzeit nicht gespeichert.</Empty></Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    <Label style={{ textAlign: 'center', color: '#8ba4bc', fontSize: 10, lineHeight: 16 }}>Entwicklung · synthetische lokale Bibliothek</Label>
    <View style={s.nav} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={({ pressed }) => [s.navItem, pressed && ui.pressed]}><Text style={[s.navIcon, tab === item.id && s.active]}>{item.icon}</Text><Text style={[s.navLabel, tab === item.id && s.active]}>{item.title}</Text>{tab === item.id && <View style={s.activeLine} />}</Pressable>)}</View>
    <Modal visible={sheet !== null || detail !== null} animationType="slide" onRequestClose={() => { setDetail(null); setSheet(null); }}>
      <SafeAreaView style={s.modal}><StatusBar barStyle="light-content" /><View style={s.modalBar}><Action secondary onPress={() => { setDetail(null); setSheet(null); }}>‹ Zurück</Action><Label style={{ flex: 1, fontWeight: '600' }}>{detail ? 'Flugdetails' : sheet === 'books' ? 'Papierflugbuch' : sheet === 'tools' ? 'Entwicklungswerkzeuge' : 'MoFlight'}</Label></View>
        {sheet === 'tools' ? <LabApp /> : sheet === 'books' ? <View style={{ flex: 1, backgroundColor: '#f5f7fb' }}><BookLab close={() => setSheet(null)} /></View> : <ScrollView contentContainerStyle={s.canvas}>
          {detail && <><Section title={detail.registration ?? 'Flugzeug unbekannt'} />{[['Datum', dateText(detail.date)], ['Flugzeugtyp', detail.aircraft_model], ['Abflug', detail.start_place], ['Ankunft', detail.landing_place], ['Start', detail.start], ['Landung', detail.landing], ['Zeitbasis', detail.time_basis], ['Dauer', detail.minutes === null ? null : `${formatDuration(detail.minutes)} h`], ['Rolle', detail.pilot_role], ['Startart', detail.launch], ['Landungen', detail.landings?.toString()], ['Bemerkungen', detail.remarks]].map(([label, value]) => <Card key={label}><Label muted>{label}</Label><Label selectable>{value ?? 'Unbekannt'}</Label></Card>)}<Label muted>Quelle: gespeicherte synthetische Bibliothek · {book?.name}. Distanz und Flugtrack sind nicht verfügbar.</Label></>}
          {sheet === 'selectBook' && <><Section title="Flugbuch auswählen" />{library.books.map(b => <Action key={b.id} secondary onPress={() => { setSheet(null); void library.selectBook(b.id); }}>{b.id === library.bookId ? '✓ ' : ''}{b.name}</Action>)}{!library.books.length && <Empty title="Noch kein Flugbuch">Bestehende lokale Flugbuchwerkzeuge öffnen, um die Bibliothek einzusehen.</Empty>}<Action onPress={openBooks}>Flugbuchwerkzeuge öffnen</Action></>}
          {sheet === 'filters' && <><Section title="Flugfilter" /><Label muted>Jahr, Suche und Schulungsrolle werden gemeinsam auf die gespeicherten Flüge angewendet.</Label><Chip title="Alle Rollen" selected={!training} onPress={() => setTraining(false)} /><Chip title="Schulung · Dual / FI" selected={training} onPress={() => setTraining(true)} /><Action onPress={() => { setSearch(''); setTraining(false); setYear(null); setSheet(null); }}>Filter zurücksetzen</Action></>}
          {sheet === 'unsupported' && <Empty title="Klassifikation nicht verfügbar">Der gespeicherte Flugvertrag enthält keine Strecken- oder Platzrundenkennzeichnung. Flugzeit, Start-/Zielfeld und Rolle werden dafür nicht als Ersatz interpretiert. Der aktive Filter bleibt erhalten.</Empty>}
          {sheet === 'credits' && <><Section title="Bildnachweise" /><Label muted>Dekorative Bilder, keine Flug-, Wetter- oder Vereinsdaten. Darstellung mit Ausschnitt und dunkler Farbüberlagerung. Bildlizenzen gelten unabhängig vom Anwendungscode.</Label>{[
            ['Sebastian Kawa, Tomasz Kawa · GrandPrixGlidingChile.JPG', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:GrandPrixGlidingChile.JPG', 'https://creativecommons.org/licenses/by-sa/3.0/'],
            ['Dg-505 · Sunset', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Sunset_-_panoramio_(312).jpg', 'https://creativecommons.org/licenses/by/3.0/'],
            ['Partonez · Windsock at Bolt Head Airfield', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Windsock_at_Bolt_Head_Airfield.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'],
            ['Anne Burgess · Clubhouse at Dusk · Geograph, via Wikimedia Commons', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Clubhouse_at_Dusk_-_geograph.org.uk_-_6960024.jpg', 'https://creativecommons.org/licenses/by-sa/2.0/'],
          ].map(([author, license, source, licenseUrl]) => <Card key={author}><Label>{author}</Label><Action secondary onPress={() => { void Linking.openURL(source!); }}>Original & Urheber</Action><Action secondary onPress={() => { void Linking.openURL(licenseUrl!); }}>{license}</Action></Card>)}</>}
        </ScrollView>}
      </SafeAreaView>
    </Modal>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 720 },
  page: { flex: 1 }, hidden: { display: 'none' }, canvas: { padding: 12, gap: 10, paddingBottom: 24 }, flightCanvas: { padding: 12, paddingBottom: 100 },
  header: { minHeight: 122 }, headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, toolButton: { minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#07172599', borderRadius: 16 },
  stateBanner: { gap: 3, padding: 4 }, provenance: { fontSize: 10, lineHeight: 16, color: '#8ba4bc', letterSpacing: .6 },
  paper: { padding: 0, borderColor: '#b76a38', backgroundColor: '#5a3420' }, paperPhoto: { minHeight: 165 }, eyebrow: { fontSize: 12, lineHeight: 18, fontWeight: '600' }, orangeButton: { backgroundColor: colors.orange, minHeight: 48, borderRadius: 18, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 18, marginTop: 4 },
  stacked: { gap: 8 }, aiTeaser: { flex: 1, backgroundColor: '#201c5c', experimental_backgroundImage: 'linear-gradient(145deg, #282274, #141b41, #50205e)', borderColor: '#6552af' }, sparkle: { fontSize: 32, color: '#c98dff' }, circleArrow: { fontSize: 26, color: '#cce6ff', marginTop: 8 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 2 }, metricValue: { color: colors.cyan, fontSize: 21, fontWeight: '600' }, metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 17 },
  rings: { flexDirection: 'row', justifyContent: 'space-around', gap: 5, flexWrap: 'wrap' }, ring: { width: 72, height: 72, borderRadius: 36, borderWidth: 6, borderColor: colors.cyan, alignItems: 'center', justifyContent: 'center', backgroundColor: '#061626' },
  trackEmpty: { backgroundColor: '#122b35', borderRadius: 10, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 6, paddingVertical: 2 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.raised, paddingHorizontal: 14, gap: 8 }, search: { flex: 1, minHeight: 48, color: colors.text, fontSize: 14 }, filterButton: { width: 48, minHeight: 48, backgroundColor: colors.raised, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1 },
  statsStrip: { flexDirection: 'row', paddingHorizontal: 6, gap: 3 }, flightRow: { padding: 8, borderRadius: 13, gap: 4 }, flightDate: { fontSize: 12, fontWeight: '600' }, noTrack: { width: 66, minHeight: 66, backgroundColor: '#122c35', borderRadius: 10, justifyContent: 'center', alignItems: 'center' }, aircraftIcon: { color: '#6f9fb0', fontSize: 26 }, badge: { borderRadius: 12, borderWidth: 1, borderColor: '#227f87', paddingHorizontal: 8, backgroundColor: '#064240' },
  fab: { position: 'absolute', right: 18, bottom: 18, width: 60, height: 60, borderRadius: 30, backgroundColor: '#315fff', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#285bff', shadowOpacity: .5, shadowRadius: 14 },
  welcome: { backgroundColor: '#10233d', borderColor: '#354d74' }, aiBadge: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78efdc' },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, question: { width: '48%', minHeight: 98, borderWidth: 1, borderColor: colors.border, borderRadius: 13, padding: 12, backgroundColor: colors.card, justifyContent: 'space-between', gap: 8 },
  composer: { borderWidth: 1, borderColor: '#3a5a8b', backgroundColor: '#10263e', borderRadius: 22, padding: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }, messageInput: { flex: 1, minHeight: 48, maxHeight: 150, color: colors.text, fontSize: 14, paddingHorizontal: 8 }, send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1c3449', backgroundColor: '#020e17', alignSelf: 'center', width: '100%', maxWidth: 720 }, navItem: { flex: 1, minHeight: 65, justifyContent: 'center', alignItems: 'center', paddingVertical: 5, gap: 1 }, navIcon: { fontSize: 26, lineHeight: 30, color: colors.muted }, navLabel: { fontSize: 12, lineHeight: 18, color: colors.muted }, active: { color: '#00c8ff' }, activeLine: { height: 2, width: 24, backgroundColor: colors.cyan, position: 'absolute', top: 0, borderRadius: 2 },
  modal: { flex: 1, backgroundColor: colors.background }, modalBar: { padding: 12, flexDirection: 'row', gap: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
});

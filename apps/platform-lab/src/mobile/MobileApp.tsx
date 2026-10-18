import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { Flight } from '@moflight/flight-logbook';
import LabApp from '../App';
import { BookLab } from '../BookLab';
import { Action, Card, Chip, ClubMark, Empty, GliderMark, Label, Photo, Section, colors, ui } from './theme';
import { useLibrary } from './use-library';
import { flightYears, selectFlights, summarizeFlights, formatDuration } from './flight-model';
import { localQuestions, localInsight } from './local-insights';
import { Dashboard } from './Dashboard';
import { PlaneIcon, ProfileIcon, BookIcon } from './ShellIcons';
import { ProfileSettings } from './ProfileSettings';
import { PILOT } from '../book-storage';
import { useAccessController } from '../vereinsflieger/use-access-controller';
import { ProviderConnection, ConnectionIndicator } from './ProviderConnection';
import { AppHeader } from './AppHeader';

const mountain = require('../../assets/aviation/mountain-header-v2.jpg');
const windsock = require('../../assets/aviation/windsock.jpg');
const clubAirfield = require('../../assets/aviation/club-airfield.jpg');
const tabs = [{ id: 'home', title: 'Übersicht', icon: '⌂' }, { id: 'flights', title: 'Flüge', icon: '✈' }, { id: 'logbook', title: 'Flugbuch', icon: '▤' }, { id: 'club', title: 'Verein', icon: '♧' }, { id: 'ai', title: 'AI', icon: '✧' }] as const;
type Tab = typeof tabs[number]['id'];
type ClubSection = 'Übersicht' | 'Termine' | 'Dienste' | 'Mitteilungen';
type Sheet = 'books' | 'tools' | 'selectBook' | 'filters' | 'unsupported' | 'credits' | 'status' | 'profile' | null;
const dateText = (date: string | null) => date ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Datum unbekannt';

function Metric({ value, label }: { value: string; label: string }) {
  return <View style={s.metric}><Text style={s.metricValue}>{value}</Text><Label muted style={s.metricLabel}>{label}</Label></View>;
}
function FlightRow({ flight, onPress, tablet }: { flight: Flight; onPress: () => void; tablet?: boolean }) {
  return <Card onPress={onPress} label={`${dateText(flight.date)}, ${flight.registration ?? 'Flugzeug unbekannt'}, Details öffnen`} style={[s.flightRow, tablet && { flex: 1, maxWidth: '50%' }]}>
    <Label style={s.flightDate}>{dateText(flight.date)}</Label>
    <View style={ui.row}>
      <View style={[s.noTrack, !tablet && { width: 80, minHeight: 68 }]}><GliderMark color="#7299ab" /><Label muted style={{ fontSize: 10, textAlign: 'center', width: '100%' }}>Kein Track</Label></View>
      <View style={ui.column}><View style={[ui.row, { flexWrap: 'wrap', gap: 6 }]}><Label style={{ fontWeight: '600', flexShrink: 1 }}>{flight.registration ?? 'Kennzeichen unbekannt'}</Label><Label muted style={{ flexShrink: 1 }}>{flight.aircraft_model ?? 'Typ unbekannt'}</Label></View>
        <Label muted>{flight.start_place ?? '—'}  →  {flight.landing_place ?? '—'}</Label>
        <View style={ui.row}><Label>◷ {formatDuration(flight.minutes)} h</Label>{flight.pilot_role && <View style={s.badge}><Label style={{ color: colors.cyan, fontSize: 11 }}>{flight.pilot_role === 'Dual' ? 'Schulung' : flight.pilot_role}</Label></View>}</View>
      </View><Label muted>›</Label>
    </View>
  </Card>;
}

export default function MobileApp() { return <SafeAreaProvider><Shell /></SafeAreaProvider>; }
function Shell() {
  const connection = useAccessController(true, PILOT);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detail, setDetail] = useState<Flight | null>(null);
  const overlayHistory = useRef<{ sheet: Sheet; detail: Flight | null }[]>([]);
  const overlayOpen = sheet !== null || detail !== null;
  const openHeaderSheet = (next: Sheet) => {
    if (sheet === next && !detail) return;
    if (overlayOpen) overlayHistory.current.push({ sheet, detail });
    setDetail(null); setSheet(next);
  };
  const closeOverlay = () => {
    const previous = overlayHistory.current.pop();
    setDetail(previous?.detail ?? null); setSheet(previous?.sheet ?? null);
  };
  const [clubSection, setClubSection] = useState<ClubSection>('Übersicht');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [training, setTraining] = useState(false);
  const [draft, setDraft] = useState('');
  const [aiError, setAiError] = useState(false);
  const [sending, setSending] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const aiScroll = useRef<ScrollView>(null);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const toolsOpen = sheet === 'books' || sheet === 'tools';
  const previouslyToolsOpen = useRef(false);
  useEffect(() => {
    if (previouslyToolsOpen.current && !toolsOpen) void connection.refreshRecovery();
    previouslyToolsOpen.current = toolsOpen;
  }, [toolsOpen]);
  const library = useLibrary(toolsOpen);
  const { width, height, fontScale } = useWindowDimensions();
  const aiKeyboard = tab === 'ai' && !overlayOpen && !connectionOpen && keyboardTop !== null;
  const keyboardOverlap = Platform.OS === 'android' && aiKeyboard ? Math.max(0, height - keyboardTop!) : 0;
  const compact = fontScale > 1.3;
  const tablet = width >= 600 && !compact;
  const wide = width >= 840 && !compact;
  const years = flightYears(library.flights);
  const selectedYear = year;
  const displayedYears = year !== null && !years.includes(year) ? [year, ...years].sort((a, b) => b - a) : years;
  const flights = selectFlights(library.flights, { year: selectedYear, search, category: training ? 'training' : 'all' });
  const summary = summarizeFlights(flights);
  const currentYear = new Date().getFullYear();
  const book = library.books.find(b => b.id === library.bookId);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardTop(event.endCoordinates.screenY);
      if (activeTab.current === 'ai') timer = setTimeout(() => aiScroll.current?.scrollToEnd({ animated: true }), 120);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { setKeyboardTop(null); clearTimeout(timer); });
    return () => { show.remove(); hide.remove(); clearTimeout(timer); };
  }, []);
  useEffect(() => { Keyboard.dismiss(); }, [tab]);
  useEffect(() => { overlayHistory.current = []; setDetail(null); setLocalAnswer(null); }, [library.bookId, library.flights]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (connectionOpen) {
        if (connection.visible && connection.backWithinProvider()) return true;
        if (connection.visible || connection.connection.phase === 'checking') connection.dismissLogin();
        setConnectionOpen(false); return true;
      }
      if (detail || sheet) { closeOverlay(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    }); return () => listener.remove();
  }, [detail, sheet, tab, connectionOpen, connection]);
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
  const pageTitle = tabs.find(item => item.id === tab)!.title;
  const statusControls = <>
    <ConnectionIndicator controller={connection} onPress={() => setConnectionOpen(true)} />
    <Pressable accessibilityRole="button" accessibilityLabel="Profil & Einstellungen öffnen" onPress={() => openHeaderSheet('profile')} style={s.profileButton}><ProfileIcon /></Pressable>
  </>;
  const header = <AppHeader source={tab === 'club' ? clubAirfield : mountain} title={tab === 'ai' ? 'MoFlight AI' : pageTitle}
    subtitle={tab === 'home' ? (library.displayName ? `Hallo, ${library.displayName}!` : 'Guten Tag!') : tab === 'ai' ? 'Dein Segelflug-Assistent' : 'MoFlight'}>{statusControls}</AppHeader>;
  const flightHeader = <View style={{ gap: 3 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Flugbuch auswählen" onPress={() => setSheet('selectBook')} style={s.headerBook}><Label muted>{book?.name ?? 'Flugbuch auswählen'} ⌄</Label></Pressable>
    <View style={ui.row}><View style={s.searchBox}><Label muted>⌕</Label><TextInput accessibilityLabel="Flüge durchsuchen" hitSlop={4} placeholder="Flüge durchsuchen …" placeholderTextColor={colors.muted} value={search} onChangeText={setSearch} style={s.search} autoCorrect={false} returnKeyType="search" /></View><Pressable accessibilityRole="button" accessibilityLabel="Flugfilter öffnen" hitSlop={4} onPress={() => setSheet('filters')} style={s.filterButton}><Label>☷</Label></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip title="Alle Jahre" selected={selectedYear === null} onPress={() => setYear(null)} />{displayedYears.map(y => <Chip key={y} title={String(y)} selected={selectedYear === y} onPress={() => setYear(y)} />)}</ScrollView>
    <Card style={[s.statsStrip, compact && { flexDirection: 'column' }]}><Metric value={String(summary.count)} label="Flüge" /><Metric value={formatDuration(summary.knownMinutes)} label="bekannte Std." /><Metric value="—" label="Kilometer" /><Metric value={formatDuration(summary.averageMinutes)} label="Ø pro Flug" /></Card>
    {summary.unknownDurationCount > 0 && <Label muted>{summary.unknownDurationCount} Flugzeiten unbekannt · kein vollständiger Durchschnitt.</Label>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}><Chip title="Alle" selected={!training} onPress={() => setTraining(false)} /><Chip title="Strecke ⓘ" onPress={() => setSheet('unsupported')} /><Chip title="Platzrunden ⓘ" onPress={() => setSheet('unsupported')} /><Chip title="Schulung" selected={training} onPress={() => setTraining(true)} /></ScrollView>
  </View>;

  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[s.root, keyboardOverlap > 0 && { paddingBottom: keyboardOverlap }]}>
    <View collapsable={false} style={[{ flex: 1 }, connectionOpen && s.hidden]} aria-hidden={connectionOpen} accessibilityElementsHidden={connectionOpen} importantForAccessibility={connectionOpen ? 'no-hide-descendants' : 'auto'}>
    <View collapsable={false} style={[{ flex: 1 }, overlayOpen && s.hidden]} aria-hidden={overlayOpen} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    {header}
    <View style={[s.content, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }]}>
      <View style={[s.page, tab !== 'home' && s.hidden]} accessibilityElementsHidden={tab !== 'home'} importantForAccessibility={tab === 'home' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          <Dashboard flights={library.flights} pending={library.pending} width={width} fontScale={fontScale} onPaper={openBooks} onAi={() => ask('Mit welchem Flugzeug bin ich am häufigsten geflogen?')} onFlights={value => { setYear(value ?? null); setTab('flights'); }} onDetail={setDetail} onClub={() => { setClubSection('Dienste'); setTab('club'); }} onStatus={() => setSheet('status')} />
          {stateBanner}
          <Pressable accessibilityRole="button" onPress={() => setSheet('credits')} style={ui.smallAction}><Label muted>Bildnachweise & Lizenzen</Label></Pressable>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'flights' && s.hidden]} accessibilityElementsHidden={tab !== 'flights'} importantForAccessibility={tab === 'flights' ? 'auto' : 'no-hide-descendants'}>
        <FlatList key={tablet ? 'tablet' : 'phone'} numColumns={tablet ? 2 : 1} columnWrapperStyle={tablet ? { gap: 8 } : undefined} data={flights} keyExtractor={f => f.id} renderItem={({ item }) => <FlightRow tablet={tablet} flight={item} onPress={() => setDetail(item)} />} ListHeaderComponent={flightHeader} ListHeaderComponentStyle={{ marginBottom: 5 }} ListFooterComponent={stateBanner} contentContainerStyle={s.flightCanvas} ItemSeparatorComponent={() => <View style={{ height: 7 }} />} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={7} keyboardShouldPersistTaps="handled" ListEmptyComponent={<Card><Empty title={search || training || selectedYear !== null ? 'Keine passenden Flüge' : 'Noch keine gespeicherten Flüge'}>{search || training || selectedYear !== null ? 'Suchbegriff oder Filter ändern.' : 'Flugquellen und lokale Werkzeuge über + öffnen. Live-Import ist noch nicht verbunden.'}</Empty></Card>} />
        <Pressable accessibilityRole="button" accessibilityLabel="Flugworkflow öffnen" onPress={() => setSheet('tools')} style={({ pressed }) => [s.fab, pressed && ui.pressed]}><Text style={{ color: 'white', fontSize: 36, lineHeight: 42 }}>+</Text></Pressable>
      </View>
      <View style={[s.page, tab !== 'logbook' && s.hidden]} accessibilityElementsHidden={tab !== 'logbook'} importantForAccessibility={tab === 'logbook' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={[s.canvas, { paddingTop: 10 }]}>
          <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10 }}>
            <Card><Section title="Mein Flugbuch" /><Label style={{ fontSize: 18, fontWeight: '600' }}>{book?.name ?? 'Noch kein Flugbuch ausgewählt'}</Label><Label muted>{book ? `${library.flights.length} gespeicherte Flüge · eigenes Papierprotokoll` : 'Ein bestehendes lokales Flugbuch auswählen.'}</Label><Action secondary onPress={() => setSheet('selectBook')}>Flugbuch auswählen</Action></Card>
            <Card><Section title="Papierflugbuch" /><Label>{library.pending === null ? 'Papierstand unbekannt' : `${library.pending} Flüge ohne gespeicherten Papiernachweis`}</Label><Label muted>Einträge abgleichen, Entscheidungen prüfen und die bestehende Schreibvorlage öffnen.</Label><Action onPress={openBooks}>Papierabgleich öffnen</Action></Card>
            <Card><Section title="Schreibvorlage & Buchverwaltung" /><Label muted>Verwende die vorhandenen lokalen Flugbuchwerkzeuge. Papiernachweise und Schreibstände bleiben dem ausgewählten Buch zugeordnet.</Label><Action secondary onPress={openBooks}>Flugbuchwerkzeuge öffnen</Action></Card>
            <Action secondary onPress={() => setTab('flights')}>Gespeicherte Flüge ansehen</Action>
            {stateBanner}
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'club' && s.hidden]} accessibilityElementsHidden={tab !== 'club'} importantForAccessibility={tab === 'club' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{(['Übersicht', 'Termine', 'Dienste', 'Mitteilungen'] as const).map(section => <Chip key={section} title={section} selected={clubSection === section} onPress={() => setClubSection(section)} />)}</ScrollView>
          <View style={[s.clubBody, tablet && s.clubBodyWide]}>
          {(clubSection === 'Übersicht' || clubSection === 'Dienste') && <Card style={[s.duty, tablet && s.clubHalf]}><Photo source={windsock} style={{ minHeight: 174 }}><Section title="▣  Nächster Dienst" /><Label muted>Nächste Zuweisung</Label><Label style={{ fontSize: 20, fontWeight: '600' }}>Keine Dienste verfügbar</Label><Label>◷  Zeit —</Label><Label>⌖  Startplatz —</Label><Pressable accessibilityRole="button" onPress={() => setSheet('status')} style={s.dutyAction}><View style={s.dutyActionFace}><Label style={{ color: '#031326', fontWeight: '600' }}>Details anzeigen  →</Label></View></Pressable></Photo></Card>}
          {(clubSection === 'Übersicht' || clubSection === 'Termine') && <Card style={[s.clubSectionCard, tablet && s.clubHalf]}><Section title={clubSection === 'Termine' ? 'Termine' : '♧  Kommende Termine'} action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Termine')} /><Empty title="Keine Termine verfügbar">Vereinskalender noch nicht verbunden.</Empty></Card>}
          {(clubSection === 'Übersicht' || clubSection === 'Mitteilungen') && <Card style={[s.clubSectionCard, tablet && { width: '100%' }]}><Section title="▧  Aktuelle Mitteilungen" action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Mitteilungen')} /><Empty title="Keine Mitteilungen verfügbar">Keine Nachrichten- oder Dokumentenquelle verbunden.</Empty></Card>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSheet('status')} style={ui.smallAction}><Label muted>Verbindung & Datenstatus  ›</Label></Pressable>
        </ScrollView>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.page, tab !== 'ai' && s.hidden]} accessibilityElementsHidden={tab !== 'ai'} importantForAccessibility={tab === 'ai' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView ref={aiScroll} contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (aiKeyboard) aiScroll.current?.scrollToEnd({ animated: false }); }}>
          <View style={[s.aiBody, tablet && { maxWidth: 720 }]}>
          <Card style={s.welcome}><View style={ui.row}><View style={s.aiBadge}><Text style={{ fontSize: 20, color: '#062d39' }}>✧</Text></View><Section title="Hallo!" /></View><Label>Fragen zu deinen Flugdaten, Auswertungen und Planungen – an einem Ort.</Label><Label muted>Lokale Fragen sind verfügbar. Der AI-Dienst ist noch nicht verbunden.</Label></Card>
          <View style={ui.section}><Section title="Beispiel-Fragen" /><Label muted style={{ fontSize: 10 }}>Lokal · ohne AI-Dienst</Label></View>
          <View style={s.questionGrid}>{quickQuestions.map((question, index) => <Pressable key={question} accessibilityRole="button" accessibilityLabel={`${question} Lokal auswerten`} onPress={() => localQuery(index)} style={({ pressed }) => [s.question, { width: compact ? '100%' : tablet ? '32%' : '49%' }, pressed && ui.pressed]}><Label style={{ fontSize: 13 }}>{question}</Label><Text style={s.questionArrow}>›</Text></Pressable>)}</View>
          {localAnswer && <Card><Section title="Lokale Auswertung" /><Label>{localAnswer}</Label><Label muted>Deterministisch berechnet · keine generierte AI-Antwort · nur ausgewähltes synthetisches Flugbuch.</Label><Action secondary onPress={() => setTab('flights')}>Flugbuch öffnen</Action></Card>}
          <View style={s.composer}><TextInput accessibilityLabel="Nachricht an MoFlight AI" value={draft} onChangeText={value => { setDraft(value); setAiError(false); }} placeholder="Frage mich etwas …" placeholderTextColor={colors.muted} multiline maxLength={4000} style={s.messageInput} /><Pressable accessibilityRole="button" accessibilityLabel="Nachricht senden" hitSlop={3} accessibilityState={{ disabled: !draft.trim() || sending }} disabled={!draft.trim() || sending} onPress={send} style={[s.send, !draft.trim() && { opacity: .45 }]}><Text style={{ color: 'white', fontSize: 24 }}>➤</Text></Pressable></View>
          {aiError && <Card><View accessibilityLiveRegion="polite"><Label>Der AI-Dienst ist noch nicht verbunden. Deine Frage wurde nicht gesendet und bleibt im Eingabefeld.</Label></View><Action secondary onPress={send}>Erneut versuchen</Action></Card>}
          <View style={s.recent}><Section title="Letzte Anfragen" /><Label muted>Noch keine gespeicherten Anfragen.</Label><Label muted style={{ fontSize: 11 }}>Ein Gesprächsverlauf wird derzeit nicht gespeichert.</Label></View>
          <Pressable accessibilityRole="button" onPress={() => setTab('flights')} style={ui.smallAction}><Label style={{ color: colors.cyan }}>Gespeicherte Flüge ansehen  →</Label></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    {!aiKeyboard && <Label style={{ width: '100%', textAlign: 'center', color: '#8ba4bc', fontSize: 10, lineHeight: 16 }}>Entwicklung · synthetische lokale Bibliothek</Label>}
    <View style={[s.nav, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }, aiKeyboard && s.hidden]} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: tab === item.id }} onPress={() => setTab(item.id)} style={({ pressed }) => [s.navItem, pressed && ui.pressed]}>{item.id === 'flights' ? <PlaneIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'logbook' ? <BookIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'club' ? <ClubMark color={tab === item.id ? '#00c8ff' : colors.muted} /> : <Text style={[s.navIcon, tab === item.id && s.active]}>{item.icon}</Text>}<Text style={[s.navLabel, tab === item.id && s.active]}>{item.title}</Text></Pressable>)}</View>
    </View>
    {overlayOpen && <View style={[StyleSheet.absoluteFill, s.modal]} accessibilityViewIsModal>
      <AppHeader source={mountain} back={closeOverlay} title={detail ? 'Flugdetails' : sheet === 'books' ? 'Papierflugbuch' : sheet === 'tools' ? 'Entwicklungswerkzeuge' : sheet === 'profile' ? 'Profil & Einstellungen' : 'MoFlight'}>{statusControls}</AppHeader>
        {sheet === 'tools' ? <LabApp providerOwned={true} /> : sheet === 'books' ? <View style={{ flex: 1, backgroundColor: '#f5f7fb' }}><BookLab close={closeOverlay} /></View> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {sheet === 'profile' && <ProfileSettings onConnections={() => setConnectionOpen(true)} onTools={() => openHeaderSheet('tools')} onStatus={() => openHeaderSheet('status')} onCredits={() => openHeaderSheet('credits')} onBooks={() => openHeaderSheet('selectBook')} displayName={library.displayName} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />}
          {detail && <><Section title={detail.registration ?? 'Flugzeug unbekannt'} />{[['Datum', dateText(detail.date)], ['Flugzeugtyp', detail.aircraft_model], ['Abflug', detail.start_place], ['Ankunft', detail.landing_place], ['Start', detail.start], ['Landung', detail.landing], ['Zeitbasis', detail.time_basis], ['Dauer', detail.minutes === null ? null : `${formatDuration(detail.minutes)} h`], ['Rolle', detail.pilot_role], ['Startart', detail.launch], ['Landungen', detail.landings?.toString()], ['Bemerkungen', detail.remarks]].map(([label, value]) => <Card key={label}><Label muted>{label}</Label><Label selectable>{value ?? 'Unbekannt'}</Label></Card>)}<Label muted>Quelle: gespeicherte synthetische Bibliothek · {book?.name}. Distanz und Flugtrack sind nicht verfügbar.</Label></>}
          {sheet === 'selectBook' && <><Section title="Flugbuch auswählen" />{library.books.map(b => <Action key={b.id} secondary onPress={() => { overlayHistory.current = []; setDetail(null); setSheet(null); void library.selectBook(b.id); }}>{b.id === library.bookId ? '✓ ' : ''}{b.name}</Action>)}{!library.books.length && <Empty title="Noch kein Flugbuch">Bestehende lokale Flugbuchwerkzeuge öffnen, um die Bibliothek einzusehen.</Empty>}<Action onPress={openBooks}>Flugbuchwerkzeuge öffnen</Action></>}
          {sheet === 'filters' && <><Section title="Flugfilter" /><Label muted>Jahr, Suche und Schulungsrolle werden gemeinsam auf die gespeicherten Flüge angewendet.</Label><Chip title="Alle Rollen" selected={!training} onPress={() => setTraining(false)} /><Chip title="Schulung · Dual / FI" selected={training} onPress={() => setTraining(true)} /><Action onPress={() => { setSearch(''); setTraining(false); setYear(null); setSheet(null); }}>Filter zurücksetzen</Action></>}
          {sheet === 'unsupported' && <Empty title="Klassifikation nicht verfügbar">Der gespeicherte Flugvertrag enthält keine Strecken- oder Platzrundenkennzeichnung. Flugzeit, Start-/Zielfeld und Rolle werden dafür nicht als Ersatz interpretiert. Der aktive Filter bleibt erhalten.</Empty>}
          {sheet === 'status' && <><Section title="Verbindung & Datenstatus" /><Label>Die lokale Bibliothek enthält ausdrücklich synthetische, gespeicherte Daten. Der Papierstand zählt nur Einträge ohne gespeicherten Papiernachweis.</Label><Label muted>Wetter, Vereinskalender, Dienste, Mitteilungen und der authentifizierte AI-Dienst sind noch nicht verbunden. Flugtracks und Distanzen sind im gespeicherten Vertrag nicht vorhanden. Die vollständige Saisonabdeckung und damit ein belastbarer Vorjahresvergleich sind nicht belegt.</Label><Action secondary onPress={() => setSheet('tools')}>Bestehende Verbindungswerkzeuge</Action></>}
          {sheet === 'credits' && <><Section title="Bildnachweise" /><Label muted>Dekorative Bilder, keine Flug-, Wetter- oder Vereinsdaten. Darstellung mit Ausschnitt und dunkler Farbüberlagerung. Bildlizenzen gelten unabhängig vom Anwendungscode.</Label>{[
            ['Sebastian Kawa, Tomasz Kawa · GrandPrixGlidingChile.JPG', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:GrandPrixGlidingChile.JPG', 'https://creativecommons.org/licenses/by-sa/3.0/'],
            ['Dg-505 · Sunset', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Sunset_-_panoramio_(312).jpg', 'https://creativecommons.org/licenses/by/3.0/'],
            ['Partonez · Windsock at Bolt Head Airfield', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Windsock_at_Bolt_Head_Airfield.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'],
            ['L293D · Glider (sailplane).jpg · Wikimedia Commons · resized and recompressed', 'CC0 1.0', 'https://commons.wikimedia.org/wiki/File:Glider_(sailplane).jpg', 'https://creativecommons.org/publicdomain/zero/1.0/'],
            ['Anne Burgess · Clubhouse at Dusk · Geograph, via Wikimedia Commons', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Clubhouse_at_Dusk_-_geograph.org.uk_-_6960024.jpg', 'https://creativecommons.org/licenses/by-sa/2.0/'],
          ].map(([author, license, source, licenseUrl]) => <Card key={author}><Label>{author}</Label><Action secondary onPress={() => { void Linking.openURL(source!); }}>Original & Urheber</Action><Action secondary onPress={() => { void Linking.openURL(licenseUrl!); }}>{license}</Action></Card>)}</>}
        </ScrollView></KeyboardAvoidingView>}
    </View>}
    </View>
    <ProviderConnection controller={connection} open={connectionOpen} close={() => setConnectionOpen(false)} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 599 },
  page: { flex: 1 }, hidden: { display: 'none' }, canvas: { padding: 10, paddingTop: 10, gap: 8, paddingBottom: 20 }, flightCanvas: { padding: 10, paddingTop: 0, paddingBottom: 80 },
  profileButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 24, backgroundColor: '#102d47aa' },
  headerBook: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  stateBanner: { gap: 3, padding: 4, marginTop: 8 }, provenance: { fontSize: 10, lineHeight: 16, color: '#8ba4bc', letterSpacing: .6 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 }, metricValue: { color: colors.cyan, fontSize: 20, lineHeight: 25, fontWeight: '600' }, metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  chips: { gap: 5 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#11263a', paddingHorizontal: 12, gap: 7 }, search: { flex: 1, minHeight: 40, color: colors.text, fontSize: 13, paddingVertical: 4 }, filterButton: { width: 42, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statsStrip: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 10, gap: 3, minHeight: 66 }, flightRow: { padding: 7, borderRadius: 13, gap: 3 }, flightDate: { fontSize: 12, lineHeight: 17, fontWeight: '600' }, noTrack: { width: 64, minHeight: 64, backgroundColor: '#10282d', borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, badge: { borderRadius: 12, borderWidth: 1, borderColor: '#227f87', paddingHorizontal: 7, backgroundColor: '#064240' },
  fab: { position: 'absolute', right: 16, bottom: 16, width: 58, height: 58, borderRadius: 29, backgroundColor: '#315fff', alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#285bff', shadowOpacity: .5, shadowRadius: 14 },
  clubBody: { gap: 8 }, clubBodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }, clubHalf: { width: '49.2%' }, duty: { padding: 0 }, clubSectionCard: { width: '100%', backgroundColor: colors.background, experimental_backgroundImage: 'none', borderColor: '#152d42' }, dutyAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, dutyActionFace: { minHeight: 34, borderRadius: 17, backgroundColor: colors.blue, justifyContent: 'center', paddingHorizontal: 16 },
  aiBody: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 10 }, welcome: { backgroundColor: '#10233d', borderColor: '#354d74', minHeight: 126, gap: 7 }, aiBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78efdc' },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, question: { minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, paddingRight: 23, backgroundColor: colors.card, justifyContent: 'center' }, questionArrow: { position: 'absolute', right: 8, top: '40%', color: colors.muted, fontSize: 23 },
  composer: { borderWidth: 1, borderColor: '#3a5a8b', backgroundColor: '#10263e', borderRadius: 20, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }, messageInput: { flex: 1, minHeight: 40, maxHeight: 150, color: colors.text, fontSize: 13, paddingHorizontal: 8 }, send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, recent: { borderTopWidth: 1, borderTopColor: '#1b344a', paddingTop: 10, gap: 8 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1c3449', backgroundColor: '#020e17', alignSelf: 'center', width: '100%', maxWidth: 599 }, navItem: { flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 4, gap: 1 }, navIcon: { fontSize: 25, lineHeight: 29, color: colors.muted }, navLabel: { fontSize: 11, textAlign: 'center', width: '100%', lineHeight: 16, color: colors.muted }, active: { color: '#00c8ff' }, activeLine: { height: 2, width: 24, backgroundColor: colors.cyan, position: 'absolute', top: 0, borderRadius: 2 },
  modal: { backgroundColor: colors.background },
});

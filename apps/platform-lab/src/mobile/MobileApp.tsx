import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { canonical, type Flight } from '@moflight/flight-logbook';
import LabApp from '../App';
import { BookLab } from '../BookLab';
import { Action, Card, Chip, ClubMark, Empty, IconLabel, Label, Photo, Section, colors, ui } from './theme';
import { useLibrary } from './use-library';
import { formatDuration } from './flight-model';
import { localQuestions, localInsight } from './local-insights';
import { Dashboard } from './Dashboard';
import { PlaneIcon, ProfileIcon, BookIcon } from './ShellIcons';
import { SymbolIcon } from './SymbolIcon';
import { ProfileSettings, SyntheticProfileSettings } from './ProfileSettings';
import { Diagnostics } from './Diagnostics';
import { initializeDiagnostics } from './diagnostics-native';
import { diagnosticJournal } from '../diagnostics';
import { PILOT } from '../book-storage';
import { useAccessController } from '../vereinsflieger/use-access-controller';
import { ProviderConnection, ConnectionIndicator } from './ProviderConnection';
import { AppHeader } from './AppHeader';
import { MedicalDetails, MedicalIndicator } from './MedicalStatus';
import { DevelopmentHub, DevelopmentNotice } from './DevelopmentHub';
import { LibraryBackup } from './LibraryBackup';
import { PaperStatus } from './PaperStatus';
import { ImportPreview } from './ImportPreview';
import type { PreviewSession } from '../import-preview';
import { CoreFlightFoundation, type FlightLoadResult } from './CoreFlightFoundation';
import { ConnectionSummary } from './ConnectionSummary';
import { OwnFlights, type OwnFlightHeader } from './OwnFlights';
import { useOwnFlights } from './use-own-flights';
import { ownFlightReadPorts } from './own-flight-reader-native';
import { ownFlightConnectionState, type OwnFlightConnectionEvidence } from './connection-guidance';
import { buildDutyOverview, dutySnapshotExpiresAt } from '../vereinsflieger/duties';
import { DutyRoster } from './DutyRoster';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { useReminderSnooze, useStartClock } from './use-start-clock';

const mountain = require('../../assets/aviation/mountain-header-v2.jpg');
const clubAirfield = require('../../assets/aviation/club-airfield.jpg');
const tabs = [{ id: 'home', title: 'Übersicht' }, { id: 'flights', title: 'Flüge' }, { id: 'logbook', title: 'Flugbuch' }, { id: 'club', title: 'Verein' }, { id: 'ai', title: 'AI' }] as const;
type Tab = typeof tabs[number]['id'];
type ClubSection = 'Übersicht' | 'Termine' | 'Dienste' | 'Mitteilungen';
type Sheet = 'diagnostics' | 'paper' | 'paperInfo' | 'development' | 'importPreview' | 'flightLab' | 'bookLab' | 'backup' | 'selectBook' | 'unsupported' | 'credits' | 'status' | 'profile' | 'medical' | null;
const dateText = (date: string | null) => date ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Datum unbekannt';

export default function MobileApp() {
  useEffect(initializeDiagnostics, []);
  const [coreFlights,setCoreFlights]=useState<{startUpdate:boolean;developmentRecoveryCheckpoints:boolean}|null>(null);
  const [lastLoad,setLastLoad]=useState<FlightLoadResult|null>(null);
  const [flightReload,setFlightReload]=useState(0);
  return <SafeAreaProvider><View style={{flex:1}}>
    <View style={{flex:1,display:coreFlights?'none':'flex'}} accessibilityElementsHidden={!!coreFlights} importantForAccessibility={coreFlights?'no-hide-descendants':'auto'}><Shell coreFlightsOpen={!!coreFlights} flightReload={flightReload} lastLoad={lastLoad} onCoreFlights={(startUpdate=false,developmentRecoveryCheckpoints=false)=>{setLastLoad(null);setCoreFlights({startUpdate,developmentRecoveryCheckpoints});}}/></View>
    {coreFlights&&<CoreFlightFoundation developmentRecoveryCheckpoints={coreFlights.developmentRecoveryCheckpoints} startUpdate={coreFlights.startUpdate} close={result=>{setCoreFlights(null);if(result)setLastLoad(result);setFlightReload(value=>value+1);}}/>}
  </View></SafeAreaProvider>;
}
function Shell({onCoreFlights=()=>{},coreFlightsOpen=false,flightReload=0,lastLoad=null}:{onCoreFlights?:(startUpdate?:boolean,developmentRecoveryCheckpoints?:boolean)=>void;coreFlightsOpen?:boolean;flightReload?:number;lastLoad?:FlightLoadResult|null}={}) {
  const connection = useAccessController(true, PILOT);
  const [recentConnection,setRecentConnection]=useState<OwnFlightConnectionEvidence|null>(null);
  useEffect(()=>{
    setRecentConnection(lastLoad?.verifiedConnection??null);
    const listener=AppState.addEventListener('change',state=>{if(state!=='active')setRecentConnection(null);});
    return()=>listener.remove();
  },[lastLoad]);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionDevelopment, setConnectionDevelopment] = useState(false);
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detail, setDetail] = useState<Flight | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [importPreview, setImportPreview] = useState<PreviewSession | null>(null);
  const overlayHistory = useRef<{ sheet: Sheet; detail: Flight | null }[]>([]);
  const overlayOffsets = useRef<Record<string, number>>({});
  const overlayScroll = useRef<ScrollView>(null);
  const overlayKey = detail ? `detail:${detail.id}` : sheet ?? 'none';
  const overlayOpen = sheet !== null || detail !== null;
  const openHeaderSheet = (next: Sheet) => {
    if (screenBusy) return;
    if (sheet === next && !detail) return;
    Keyboard.dismiss();
    if (next) diagnosticJournal.record('action',next);
    if (overlayOpen) overlayHistory.current.push({ sheet, detail });
    setDetail(null); setSheet(next);
  };
  const closeOverlay = () => {
    if (screenBusy) return;
    diagnosticJournal.record('back', detail ? 'flight-detail' : sheet ?? 'close');
    Keyboard.dismiss();
    const previous = overlayHistory.current.pop();
    setDetail(previous?.detail ?? null); setSheet(previous?.sheet ?? null);
  };
  const [clubSection, setClubSection] = useState<ClubSection>('Übersicht');
  const [flightHeader, setFlightHeader] = useState<OwnFlightHeader>({title:'Flüge'});
  const [draft, setDraft] = useState('');
  const [aiError, setAiError] = useState(false);
  const [sending, setSending] = useState(false);
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const aiScroll = useRef<ScrollView>(null);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const toolsOpen = sheet === 'bookLab' || sheet === 'flightLab';
  const previouslyToolsOpen = useRef(false);
  useEffect(() => {
    if (previouslyToolsOpen.current && !toolsOpen) void connection.refreshRecovery();
    previouslyToolsOpen.current = toolsOpen;
  }, [toolsOpen]);
  const library = useLibrary(toolsOpen || sheet === 'backup');
  const ownFlights = useOwnFlights(ownFlightReadPorts, !connectionOpen && !coreFlightsOpen, flightReload);
  const medical=ownFlights.view?.medical??null;
  const selected=ownFlights.view;
  const reminderScopeKey=selected?.snapshot.account?JSON.stringify([selected.snapshot.ownerId,selected.snapshot.storeId,selected.snapshot.account.accountRef]):null;
  const reminder=useReminderSnooze(reminderScopeKey);
  const retrievalPlan=useMemo(()=>planFlightRetrieval(selected?.snapshot.savedRetrievals??[]),[selected?.snapshot.savedRetrievals]);
  const rosterExpiry=selected?.duties?.snapshot?dutySnapshotExpiresAt(selected.duties.snapshot):NaN;
  const now=useStartClock([Date.parse(retrievalPlan.lastSuccessfulRetrievalAt??'')+72*60*60*1000+1,Date.parse(reminder.snooze?.until??''),rosterExpiry]);
  const clock=new Date(now),today=`${clock.getFullYear()}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const rosterExpired=Number.isFinite(rosterExpiry)&&now>=rosterExpiry;
  const dutyOverview=useMemo(()=>selected?.duties?buildDutyOverview(selected.duties.scope,selected.duties.snapshot,today,now):null,[selected?.duties,today,rosterExpired]);
  const openDuties=()=>{setClubSection('Dienste');setTab('club');};
  const dutyContent=(expanded=false)=>dutyOverview?<DutyRoster overview={dutyOverview} expanded={expanded} onOpen={openDuties}/>:<Card style={{width:'100%',maxWidth:430,alignSelf:'center'}}><Section title="Verein" icon="duty"/><Label muted>{selected?.dutiesReadFailed?'Gespeicherte Dienstquelle konnte nicht gelesen werden.':'Dienstplan noch nicht verfügbar.'}</Label><Label muted>Daten aktualisieren lädt unterstützte Dienstquellen. Vollständigkeit bleibt bis zur Quellenprüfung unbekannt.</Label>{!expanded&&<Action secondary onPress={openDuties}>Alle Dienste ansehen</Action>}</Card>;
  // Presentation only. The legacy provider controller must never gain the real
  // owner's authorization or pretend its synthetic-owner observation is current.
  const flightStatusController={...connection,connection:ownFlightConnectionState(recentConnection,
    ownFlights.view?.snapshot.ownerId,ownFlights.view?.snapshot.account?.accountRef)};
  const libraryRevision = canonical([library.bookId, library.flights]);
  useEffect(() => { setProfileNameDraft(library.displayName); }, [library.displayName]);
  const { width, height, fontScale } = useWindowDimensions();
  const aiKeyboard = tab === 'ai' && !overlayOpen && !connectionOpen && keyboardTop !== null;
  const keyboardOverlap = Platform.OS === 'android' && aiKeyboard ? Math.max(0, height - keyboardTop!) : 0;
  const compact = fontScale > 1.3;
  const wrapTabs = width < 600 && compact;
  const tablet = width >= 600 && !compact;
  const wide = width >= 840 && !compact;
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
  useEffect(() => {
    // A reload with identical saved facts must not erase the return path. When
    // facts/book do change, discard stale details but retain named tool/settings paths.
    overlayHistory.current = overlayHistory.current.filter(previous => !previous.detail);
    setDetail(null); setLocalAnswer(null);
  }, [libraryRevision]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (connectionOpen) {
        if (connection.visible && connection.backWithinProvider()) return true;
        if (connection.visible || connection.connection.phase === 'checking') connection.dismissLogin();
        setConnectionOpen(false); return true;
      }
      if (detail || sheet) { closeOverlay(); return true; }
      if (tab === 'flights' && flightHeader.back) { flightHeader.back(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    }); return () => listener.remove();
  }, [detail, sheet, tab, connectionOpen, connection, screenBusy, flightHeader]);
  useEffect(()=>{if(lastLoad){overlayHistory.current=[];setDetail(null);setSheet(null);setTab('flights');}},[lastLoad]);
  const openFlightFlow = (startUpdate=false) => { diagnosticJournal.record('action',startUpdate?'update-flights':'open-flight-tools'); if(!connection.suspendBrowserForOwnerSwitch()){diagnosticJournal.begin(startUpdate?'update-flights':'open-flight-tools').finish('blocked','provider-handoff');return false;} onCoreFlights(startUpdate); return true; };
  useEffect(() => { diagnosticJournal.record('screen', coreFlightsOpen ? 'own-flight-tools' : connectionOpen ? 'provider-options' : detail ? 'flight-detail' : sheet ?? tab); }, [tab,sheet,detail,connectionOpen,coreFlightsOpen]);
  useEffect(() => { const listener=AppState.addEventListener('change',state=>{if(state==='active'||state==='background'||state==='inactive')diagnosticJournal.record('lifecycle',state);});return()=>listener.remove(); }, []);
  const openBooks = () => openHeaderSheet('paper');
  const openConnection = (development = false) => { setConnectionDevelopment(development); setConnectionOpen(true); };
  const quickQuestions = localQuestions;
  const localQuery = (index: number) => {
    diagnosticJournal.record('action','local-query');
    setDraft(quickQuestions[index]!); setAiError(false);
    setLocalAnswer(localInsight(library.flights, index, currentYear));
  };
  const send = () => {
    diagnosticJournal.record('action','send-query');
    if (!draft.trim() || sending) return;
    // No gateway exists: report a real unavailable state; never manufacture a response.
    setSending(true); setAiError(true); setSending(false);
  };
  const pageTitle = tabs.find(item => item.id === tab)!.title;
  const statusControls = <>
    <ConnectionIndicator controller={flightStatusController} onPress={() => openFlightFlow()} />
    <MedicalIndicator capture={medical} now={now} active={sheet === 'medical'} disabled={screenBusy} onPress={() => openHeaderSheet('medical')} />
    <Pressable accessibilityRole="button" accessibilityLabel="Profil & Einstellungen öffnen" accessibilityState={{ disabled: screenBusy }} disabled={screenBusy} onPress={() => openHeaderSheet('profile')} style={s.profileButton}><ProfileIcon /></Pressable>
  </>;
  const header = <AppHeader source={tab === 'club' ? clubAirfield : mountain} title={tab === 'ai' ? 'MoFlight AI' : tab === 'flights' ? flightHeader.title : pageTitle} back={tab === 'flights' ? flightHeader.back : undefined}
    subtitle={tab === 'home' ? 'Guten Tag!' : tab === 'ai' ? 'Dein Segelflug-Assistent' : 'MoFlight'}>{statusControls}</AppHeader>;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[s.root, keyboardOverlap > 0 && { paddingBottom: keyboardOverlap }]}>
    <View collapsable={false} style={[{ flex: 1 }, connectionOpen && s.hidden]} aria-hidden={connectionOpen} accessibilityElementsHidden={connectionOpen} importantForAccessibility={connectionOpen ? 'no-hide-descendants' : 'auto'}>
    <View collapsable={false} style={[{ flex: 1 }, overlayOpen && s.hidden]} aria-hidden={overlayOpen} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    {header}
    <View style={[s.content, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }]}>
      <View style={[s.page, tab !== 'home' && s.hidden]} accessibilityElementsHidden={tab !== 'home'} importantForAccessibility={tab === 'home' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          <ConnectionSummary compact now={now} reminderSnooze={reminder.snooze} onSnoozeReminder={reminder.save} controller={flightStatusController} ownFlights={ownFlights.view} phase={ownFlights.phase} onUpdate={() => openFlightFlow(true)} onOpen={() => openFlightFlow()} />
          {reminder.error&&<Label muted>Erinnerungseinstellung konnte nicht gelesen oder gespeichert werden.</Label>}
          <View style={{width:'100%',maxWidth:wide?920:480,alignSelf:'center',flexDirection:wide?'row':'column',alignItems:'flex-start',gap:10}}>
          <View style={{width:'100%',flex:wide?1:undefined}}><Dashboard now={now} ownFlights={ownFlights.view} ownFlightPhase={ownFlights.phase} pending={null} width={width} fontScale={fontScale} onPaper={() => openHeaderSheet('paperInfo')} onFlights={() => { overlayHistory.current=[]; setDetail(null); setSheet(null); setTab('flights'); }} /></View>
          {ownFlights.phase==='ready'&&!!selected?.snapshot.account&&<View style={{width:'100%',flex:wide?1:undefined}}>{dutyContent()}</View>}
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'flights' && s.hidden]} accessibilityElementsHidden={tab !== 'flights'} importantForAccessibility={tab === 'flights' ? 'auto' : 'no-hide-descendants'}>
        {lastLoad&&<Card><View accessibilityLiveRegion="polite"><Label>{lastLoad.added} neue · {lastLoad.changed} aktualisierte Flüge gespeichert{lastLoad.pending ? ` · ${lastLoad.pending} ungeklärte Beobachtungen` : ''}</Label><Label muted>Zeitraum: {lastLoad.from} bis {lastLoad.to}</Label>
          {lastLoad.medicalStatus==='failed'&&<Label>Flüge gespeichert. Medical konnte nicht aktualisiert werden; frühere Quellenangaben bleiben erhalten.</Label>}
          {lastLoad.medicalStatus==='empty'&&<Label>Keine Medical-Angaben im geprüften Profil gefunden. Status bleibt unbekannt.</Label>}
          {lastLoad.dutyStatus&&<Label>{lastLoad.dutyStatus==='partial'?'Dienstquelle gespeichert · Dienstplan unvollständig geprüft.':'Dienste nicht aktualisiert. Vorhandene Quellen bleiben erhalten.'}</Label>}
        </View></Card>}
        <OwnFlights active={tab === 'flights' && !coreFlightsOpen} data={ownFlights} onHeaderChange={setFlightHeader}
          onUpdate={()=>openFlightFlow(true)} />
      </View>
      <View style={[s.page, tab !== 'logbook' && s.hidden]} accessibilityElementsHidden={tab !== 'logbook'} importantForAccessibility={tab === 'logbook' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={[s.canvas, { paddingTop: 10 }]}>
          <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10 }}>
            <Card><Section title="Papierflugbuch später einrichten" /><Label>Das Einrichten deines Papierflugbuchs und die Zuordnung deiner Flüge werden noch vorbereitet.</Label><Label muted>Du kannst deine eigenen Flüge bereits laden, offline ansehen und auswerten. Dafür brauchst du kein Flugbuch.</Label><Action testID="paper-flights-entry" onPress={() => setTab('flights')}>Flüge ansehen</Action></Card>
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'club' && s.hidden]} accessibilityElementsHidden={tab !== 'club'} importantForAccessibility={tab === 'club' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{(['Übersicht', 'Termine', 'Dienste', 'Mitteilungen'] as const).map(section => <Chip key={section} title={section} selected={clubSection === section} onPress={() => {diagnosticJournal.record('filter','club-section');setClubSection(section);}} />)}</ScrollView>
          <View style={[s.clubBody, tablet && s.clubBodyWide]}>
          {(clubSection === 'Übersicht' || clubSection === 'Dienste') && dutyContent(true)}
          {(clubSection === 'Übersicht' || clubSection === 'Termine') && <Card style={[s.clubSectionCard, tablet && s.clubHalf]}><Section icon="calendar-neutral" title={clubSection === 'Termine' ? 'Termine' : 'Kommende Termine'} action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Termine')} /><Empty title="Keine Termine verfügbar">Vereinskalender noch nicht verbunden.</Empty></Card>}
          {(clubSection === 'Übersicht' || clubSection === 'Mitteilungen') && <Card style={[s.clubSectionCard, tablet && { width: '100%' }]}><Section title="Aktuelle Mitteilungen" icon="messages" action={clubSection === 'Übersicht' ? 'Alle anzeigen' : undefined} onPress={() => setClubSection('Mitteilungen')} /><Empty title="Keine Mitteilungen verfügbar">Keine Nachrichten- oder Dokumentenquelle verbunden.</Empty></Card>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSheet('status')} style={ui.smallAction}><IconLabel name="right" size={16} muted>Verbindung & Datenstatus</IconLabel></Pressable>
        </ScrollView>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.page, tab !== 'ai' && s.hidden]} accessibilityElementsHidden={tab !== 'ai'} importantForAccessibility={tab === 'ai' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView ref={aiScroll} contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (aiKeyboard) aiScroll.current?.scrollToEnd({ animated: false }); }}>
          <View style={[s.aiBody, tablet && { maxWidth: 720 }]}>
          <Card style={s.welcome}><View style={ui.row}><View style={s.aiBadge}><SymbolIcon name="sparkle" size={24} tone="contrast" /></View><Section title="Hallo!" /></View><Label>Fragen zu deinen Flugdaten, Auswertungen und Planungen – an einem Ort.</Label><Label muted>Lokale Fragen sind verfügbar. Der AI-Dienst ist noch nicht verbunden.</Label></Card>
          <View style={ui.section}><Section title="Beispiel-Fragen" /><Label muted style={{ fontSize: 10 }}>Lokal · ohne AI-Dienst</Label></View>
          <View style={s.questionGrid}>{quickQuestions.map((question, index) => <Pressable key={question} accessibilityRole="button" accessibilityLabel={`${question} Lokal auswerten`} onPress={() => localQuery(index)} style={({ pressed }) => [s.question, { width: compact ? '100%' : tablet ? '32%' : '49%' }, pressed && ui.pressed]}><Label style={{ fontSize: 13 }}>{question}</Label><SymbolIcon name="right" size={20} /></Pressable>)}</View>
          {localAnswer && <Card><Section title="Lokale Auswertung" /><Label>{localAnswer}</Label><Label muted>Deterministisch berechnet · keine generierte AI-Antwort · nur ausgewähltes synthetisches Flugbuch.</Label><Action secondary onPress={() => setTab('logbook')}>Flugbuch öffnen</Action></Card>}
          <View style={s.composer}><TextInput accessibilityLabel="Nachricht an MoFlight AI" value={draft} onChangeText={value => { setDraft(value); setAiError(false); }} placeholder="Frage mich etwas …" placeholderTextColor={colors.muted} multiline maxLength={4000} style={s.messageInput} /><Pressable accessibilityRole="button" accessibilityLabel="Nachricht senden" hitSlop={3} accessibilityState={{ disabled: !draft.trim() || sending }} disabled={!draft.trim() || sending} onPress={send} style={[s.send, !draft.trim() && { opacity: .45 }]}><SymbolIcon name="send" size={24} tone="contrast" /></Pressable></View>
          {aiError && <Card><View accessibilityLiveRegion="polite"><Label>Der AI-Dienst ist noch nicht verbunden. Deine Frage wurde nicht gesendet und bleibt im Eingabefeld.</Label></View><Action secondary onPress={send}>Erneut versuchen</Action></Card>}
          <View style={s.recent}><Section title="Letzte Anfragen" /><Label muted>Noch keine gespeicherten Anfragen.</Label><Label muted style={{ fontSize: 11 }}>Ein Gesprächsverlauf wird derzeit nicht gespeichert.</Label></View>
          <Pressable accessibilityRole="button" onPress={() => setTab('flights')} style={ui.smallAction}><IconLabel name="arrow" size={16} style={{ color: colors.cyan }}>Gespeicherte Flüge ansehen</IconLabel></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
    {!aiKeyboard && <Label style={{ width: '100%', textAlign: 'center', color: '#8ba4bc', fontSize: 10, lineHeight: 16 }}>Entwicklungsversion</Label>}
    <View style={[s.nav, wrapTabs && s.navWrap, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }, aiKeyboard && s.hidden]} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} testID={`tab-${item.id}`} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: tab === item.id }} onPress={() => { diagnosticJournal.record('action',item.id);setTab(item.id); }} style={({ pressed }) => [s.navItem, wrapTabs && s.navItemWrap, pressed && ui.pressed]}>{item.id === 'flights' ? <PlaneIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'logbook' ? <BookIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'club' ? <ClubMark color={tab === item.id ? '#00c8ff' : colors.muted} /> : <SymbolIcon name={item.id === 'home' ? 'home' : 'sparkle'} size={28} tone={tab === item.id ? 'default' : 'muted'} tile />}<Text style={[s.navLabel, tab === item.id && s.active]}>{item.title}</Text></Pressable>)}</View>
    </View>
    {overlayOpen && <View style={[StyleSheet.absoluteFill, s.modal]} accessibilityViewIsModal>
      <AppHeader source={mountain} back={closeOverlay} backDisabled={screenBusy} title={detail ? 'Flugdetails' : sheet === 'paper' || sheet === 'paperInfo' ? 'Papierflugbuch' : sheet === 'development' ? 'Entwicklung' : sheet === 'importPreview' ? 'Importvorschau' : sheet === 'flightLab' ? 'Datensatztest' : sheet === 'bookLab' ? 'Flugbuchtest' : sheet === 'backup' ? 'Sicherung' : sheet === 'diagnostics' ? 'Diagnose' : sheet === 'profile' ? 'Profil & Einstellungen' : sheet === 'medical' ? 'Medical' : 'MoFlight'}>{statusControls}</AppHeader>
        {sheet === 'flightLab' ? <><DevelopmentNotice /><LabApp providerOwned={true} embedded onBusyChange={setScreenBusy} /></> : sheet === 'bookLab' ? <><DevelopmentNotice /><BookLab close={closeOverlay} onBusyChange={setScreenBusy} /></> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView ref={overlayScroll} key={overlayKey} contentOffset={{ x: 0, y: overlayOffsets.current[overlayKey] ?? 0 }} onScroll={event => { overlayOffsets.current[overlayKey] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {sheet === 'profile' && <ProfileSettings connectionSummary={<ConnectionSummary controller={flightStatusController} ownFlights={ownFlights.view} phase={ownFlights.phase} onUpdate={() => openFlightFlow(true)} onOpen={() => openFlightFlow()} />} onConnections={() => openFlightFlow()} onTools={() => openHeaderSheet('development')} onBackup={() => openFlightFlow()} onDiagnostics={() => openHeaderSheet('diagnostics')} onStatus={() => openHeaderSheet('status')} onCredits={() => openHeaderSheet('credits')} onBooks={() => openHeaderSheet('selectBook')} displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />}
          {sheet === 'development' && <DevelopmentHub onPaper={openBooks} profileTools={<SyntheticProfileSettings displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />} onSelectBook={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => openHeaderSheet('flightLab')} onBooks={() => openHeaderSheet('bookLab')} onProvider={() => openConnection(true)} onImportPreview={() => openHeaderSheet('importPreview')} onCoreFlights={()=>{if(connection.suspendBrowserForOwnerSwitch())onCoreFlights(false,true);}} />}
          {sheet === 'importPreview' && <ImportPreview session={importPreview} onChange={setImportPreview} onNavigate={() => { overlayOffsets.current.importPreview = 0; overlayScroll.current?.scrollTo({ y: 0, animated: false }); }} />}
          {sheet === 'diagnostics' && <Diagnostics />}
          {sheet === 'backup' && <LibraryBackup onBusyChange={setScreenBusy} />}
          {sheet === 'paperInfo' && <Card><Section title="Papierflugbuch später einrichten" /><Label>Das Einrichten deines Papierflugbuchs und die Zuordnung deiner Flüge werden noch vorbereitet.</Label><Label muted>Du kannst deine eigenen Flüge bereits laden, offline ansehen und auswerten. Dafür brauchst du kein Flugbuch.</Label><Action onPress={() => { overlayHistory.current=[];setSheet(null);setTab('flights'); }}>Flüge ansehen</Action></Card>}
          {sheet === 'paper' && <PaperStatus bookName={book?.name ?? null} pending={library.pending} onBooks={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => { overlayHistory.current = []; setDetail(null); setSheet(null); setTab('flights'); }} />}
          {sheet === 'medical' && <MedicalDetails now={now} capture={medical} loading={ownFlights.phase==='loading'} needsReload={ownFlights.view?.medicalReadFailed} refreshFailed={lastLoad?.medicalStatus==='failed'} />}
          {detail && <><Section title={detail.registration ?? 'Flugzeug unbekannt'} />{[['Datum', dateText(detail.date)], ['Flugzeugtyp', detail.aircraft_model], ['Abflug', detail.start_place], ['Ankunft', detail.landing_place], ['Start', detail.start], ['Landung', detail.landing], ['Zeitbasis', detail.time_basis], ['Dauer', detail.minutes === null ? null : `${formatDuration(detail.minutes)} h`], ['Rolle', detail.pilot_role], ['Startart', detail.launch], ['Landungen', detail.landings?.toString()], ['Bemerkungen', detail.remarks]].map(([label, value]) => <Card key={label}><Label muted>{label}</Label><Label selectable>{value ?? 'Unbekannt'}</Label></Card>)}<Label muted>Quelle: gespeicherte synthetische Bibliothek · {book?.name}. Distanz und Flugtrack sind nicht verfügbar.</Label></>}
          {sheet === 'selectBook' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}><Section title="Flugbuch auswählen" />{library.books.map(b => <Action key={b.id} secondary icon={b.id === library.bookId ? 'check' : undefined} onPress={() => { overlayHistory.current = []; setDetail(null); setSheet(null); void library.selectBook(b.id); }}>{b.name}</Action>)}{!library.books.length && <Empty title="Noch kein Flugbuch">Eine vorhandene Sicherung kann in einer neuen lokalen Bibliothek geöffnet werden. Live-Import und neue Produkt-Flugbücher sind noch nicht verfügbar.</Empty>}<Label muted>Gespeicherte synthetische Bibliothek · keine automatische Zuordnung.</Label><Action secondary onPress={() => openHeaderSheet('backup')}>Sicherung & Wiederherstellung</Action></View>}
          {sheet === 'unsupported' && <Empty title="Klassifikation nicht verfügbar">Der gespeicherte Flugvertrag enthält keine Strecken- oder Platzrundenkennzeichnung. Flugzeit, Start-/Zielfeld und Rolle werden dafür nicht als Ersatz interpretiert. Der aktive Filter bleibt erhalten.</Empty>}
          {sheet === 'status' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}><Section title="Verbindung & Datenstatus" /><Label>Die lokale Bibliothek enthält ausdrücklich synthetische, gespeicherte Daten. Der Papierstand zählt nur Einträge ohne gespeicherten Papiernachweis.</Label><Label muted>Wetter, Vereinskalender, Dienste, Mitteilungen und der authentifizierte AI-Dienst sind noch nicht verbunden. Flugtracks und Distanzen sind im gespeicherten Vertrag nicht vorhanden. Die vollständige Saisonabdeckung und damit ein belastbarer Vorjahresvergleich sind nicht belegt.</Label><Action secondary icon="chain" onPress={() => openConnection()}>Vereinsflieger öffnen</Action><Action secondary icon="book" onPress={() => openHeaderSheet('backup')}>Sicherung & Wiederherstellung</Action></View>}
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
    <ProviderConnection controller={connection} open={connectionOpen} development={connectionDevelopment} close={() => setConnectionOpen(false)} />
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 599 },
  page: { flex: 1 }, hidden: { display: 'none' }, canvas: { padding: 10, paddingTop: 10, gap: 8, paddingBottom: 20 }, flightCanvas: { padding: 10, paddingTop: 0, paddingBottom: 20 },
  profileButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#102d47aa' },
  headerBook: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  stateBanner: { gap: 3, padding: 4, marginTop: 8 }, provenance: { fontSize: 10, lineHeight: 16, color: '#8ba4bc', letterSpacing: .6 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 }, metricValue: { color: colors.cyan, fontSize: 20, lineHeight: 25, fontWeight: '600' }, metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  chips: { gap: 5 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#11263a', paddingHorizontal: 12, gap: 7 }, search: { flex: 1, minHeight: 40, color: colors.text, fontSize: 13, paddingVertical: 4 }, filterButton: { width: 42, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statsStrip: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 10, gap: 3, minHeight: 66 }, flightRow: { padding: 7, borderRadius: 13, gap: 3 }, flightDate: { fontSize: 12, lineHeight: 17, fontWeight: '600' }, noTrack: { width: 64, minHeight: 64, backgroundColor: '#10282d', borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, badge: { borderRadius: 12, borderWidth: 1, borderColor: '#227f87', paddingHorizontal: 7, backgroundColor: '#064240' },
  clubBody: { gap: 8 }, clubBodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }, clubHalf: { width: '49.2%' }, duty: { padding: 0 }, clubSectionCard: { width: '100%', backgroundColor: colors.background, experimental_backgroundImage: 'none', borderColor: '#152d42' }, dutyAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, dutyActionFace: { minHeight: 34, borderRadius: 17, backgroundColor: colors.blue, justifyContent: 'center', paddingHorizontal: 16 },
  aiBody: { width: '100%', maxWidth: 430, alignSelf: 'center', gap: 10 }, welcome: { backgroundColor: '#10233d', borderColor: '#354d74', minHeight: 126, gap: 7 }, aiBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78efdc' },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, question: { minHeight: 70, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, paddingRight: 23, backgroundColor: colors.card, justifyContent: 'center' }, questionArrow: { position: 'absolute', right: 8, top: '40%', color: colors.muted, fontSize: 23 },
  composer: { borderWidth: 1, borderColor: '#3a5a8b', backgroundColor: '#10263e', borderRadius: 20, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }, messageInput: { flex: 1, minHeight: 40, maxHeight: 150, color: colors.text, fontSize: 13, paddingHorizontal: 8 }, send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, recent: { borderTopWidth: 1, borderTopColor: '#1b344a', paddingTop: 10, gap: 8 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#1c3449', backgroundColor: '#020e17', alignSelf: 'center', width: '100%', maxWidth: 599 }, navWrap: { flexWrap: 'wrap', justifyContent: 'center' }, navItemWrap: { flex: 0, width: '33.333333%' }, navItem: { flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 4, gap: 1 }, navIcon: { fontSize: 25, lineHeight: 29, color: colors.muted }, navLabel: { fontSize: 11, textAlign: 'center', width: '100%', lineHeight: 16, color: colors.muted }, active: { color: '#00c8ff' }, activeLine: { height: 2, width: 24, backgroundColor: colors.cyan, position: 'absolute', top: 0, borderRadius: 2 },
  modal: { backgroundColor: colors.background },
});

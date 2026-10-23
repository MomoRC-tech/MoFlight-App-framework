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
import { DesignPreview } from './DesignPreview';
import { Diagnostics } from './Diagnostics';
import { initializeDiagnostics } from './diagnostics-native';
import { diagnosticJournal } from '../diagnostics';
import { unknownProviderStatus, type ProviderStatus } from './ProviderConnection';
import { DataUpdateIndicator } from './DataUpdateIndicator';
import { UpdateDialog } from './UpdateDialog';
import { DATA_UPDATE_FRESH_MS } from './data-freshness';
import { AppHeader } from './AppHeader';
import { MedicalDetails, MedicalIndicator } from './MedicalStatus';
import { DevelopmentHub, DevelopmentNotice } from './DevelopmentHub';
import { LibraryBackup } from './LibraryBackup';
import { PaperStatus } from './PaperStatus';
import { ImportPreview } from './ImportPreview';
import type { PreviewSession } from '../import-preview';
import { CoreFlightFoundation, type FlightLoadResult, type ConnectionIntent } from './CoreFlightFoundation';
import { UpdateResult } from './UpdateResult';
import { ClubEvents, ClubDocumentNotices, ClubWorkSummary, ClubOwnTasks } from './ClubInformation';
import { ConnectionSummary } from './ConnectionSummary';
import { OwnFlights, type OwnFlightHeader } from './OwnFlights';
import type { OwnFlightRequest } from './own-flight-model';
import { useOwnFlights } from './use-own-flights';
import { StatisticsOverlay } from './StatisticsOverlay';
import { ownFlightReadPorts } from './own-flight-reader-native';
import { buildDutyOverview, dutySnapshotExpiresAt } from '../vereinsflieger/duties';
import { DutyRoster } from './DutyRoster';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { useStartClock } from './use-start-clock';

const mountain = require('../../assets/aviation/mountain-header-v2.jpg');
const clubAirfield = require('../../assets/aviation/club-airfield.jpg');
const tabs = [{ id: 'home', title: 'Übersicht' }, { id: 'flights', title: 'Flüge' }, { id: 'logbook', title: 'Flugbuch' }, { id: 'club', title: 'Verein' }, { id: 'ai', title: 'AI' }] as const;
type Tab = typeof tabs[number]['id'];
type ClubSection = 'Übersicht' | 'Termine' | 'Dienste' | 'Dokumente' | 'Arbeitsstunden' | 'Aufgaben';
type Sheet = 'designPreview' | 'diagnostics' | 'paper' | 'paperInfo' | 'development' | 'importPreview' | 'flightLab' | 'bookLab' | 'backup' | 'selectBook' | 'unsupported' | 'credits' | 'status' | 'profile' | 'medical' | 'statistics' | null;
const dateText = (date: string | null) => date ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Datum unbekannt';

export default function MobileApp() {
  useEffect(initializeDiagnostics, []);
  const [entry,setEntry] = useState<{intent:ConnectionIntent;requestId:number;open:boolean;development:boolean}|null>({intent:'options',requestId:0,open:false,development:false});
  const [lastLoad,setLastLoad] = useState<FlightLoadResult|null>(null);
  const [flightReload,setFlightReload] = useState(0);
  const [providerStatus,setProviderStatus] = useState<ProviderStatus>(unknownProviderStatus);
  return <SafeAreaProvider><View style={{flex:1}}>
    <View style={{flex:1}} pointerEvents={entry?.open?'none':'auto'} aria-hidden={!!entry?.open} accessibilityElementsHidden={!!entry?.open} importantForAccessibility={entry?.open?'no-hide-descendants':'auto'}><Shell coreFlightsOpen={!!entry?.open} flightReload={flightReload} lastLoad={lastLoad} providerStatus={providerStatus} onCoreFlights={(intent='options',development=false)=>{setLastLoad(null);setEntry(previous=>({intent:intent==='update'?'update':'options',development,open:true,requestId:(previous?.requestId??0)+1}));}}/></View>
    {entry&&<UpdateDialog open={entry.open} expanded={entry.intent==='update'&&!!providerStatus.loginVisible}>{windowTop=><CoreFlightFoundation dialogTop={windowTop} providerEntryAllowed={entry.intent==='update'} open={entry.open} requestId={entry.requestId} intent={entry.intent} onStatus={setProviderStatus} developmentRecoveryCheckpoints={entry.development} close={result=>{setEntry(previous=>previous?{...previous,open:false}:null);if(result)setLastLoad(result);setFlightReload(value=>value+1);}}/>}</UpdateDialog>}
  </View></SafeAreaProvider>;
}
function Shell({onCoreFlights=()=>{},coreFlightsOpen=false,flightReload=0,lastLoad=null,providerStatus=unknownProviderStatus}:{onCoreFlights?:(intent?:ConnectionIntent,developmentRecoveryCheckpoints?:boolean)=>void;coreFlightsOpen?:boolean;flightReload?:number;lastLoad?:FlightLoadResult|null;providerStatus?:ProviderStatus}={}) {
  const [tab, setTab] = useState<Tab>('home');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detail, setDetail] = useState<Flight | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [importPreview, setImportPreview] = useState<PreviewSession | null>(null);
  const overlayHistory = useRef<{ sheet: Sheet; detail: Flight | null }[]>([]);
  const statisticsBack = useRef<() => boolean>(() => false);
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
    if (sheet === 'statistics' && statisticsBack.current()) return;
    diagnosticJournal.record('back', detail ? 'flight-detail' : sheet ?? 'close');
    Keyboard.dismiss();
    if (sheet === 'statistics') ownFlights.clearDetail();
    const previous = overlayHistory.current.pop();
    setDetail(previous?.detail ?? null); setSheet(previous?.sheet ?? null);
  };
  const [clubSection, setClubSection] = useState<ClubSection>('Übersicht');
  const [flightRequest, setFlightRequest] = useState<OwnFlightRequest | null>(null);
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
  const library = useLibrary(coreFlightsOpen || toolsOpen || sheet === 'backup');
  const ownFlights = useOwnFlights(ownFlightReadPorts, !coreFlightsOpen, flightReload);
  const [dismissedUpdate, setDismissedUpdate] = useState<FlightLoadResult|null>(null);
  const updateForOwner=(lastLoad?.ownerId??lastLoad?.verifiedConnection?.ownerId)===ownFlights.view?.snapshot.ownerId && !!ownFlights.view?.snapshot.ownerId ? lastLoad : null;
  const medical=ownFlights.view?.medical??null;
  const selected=ownFlights.view;
  const statisticsScopeKey = canonical([selected?.snapshot.ownerId ?? null, selected?.snapshot.storeId ?? null, selected?.snapshot.account?.accountRef ?? null]);
  const retrievalPlan=useMemo(()=>planFlightRetrieval(selected?.snapshot.savedRetrievals??[]),[selected?.snapshot.savedRetrievals]);
  const rosterExpiry=selected?.duties?.snapshot?dutySnapshotExpiresAt(selected.duties.snapshot):NaN;
  const receivedAt=retrievalPlan.lastSuccessfulRetrievalAt;
  const receivedTime=Date.parse(receivedAt??'');
  const now=useStartClock([rosterExpiry,Date.parse(providerStatus.connection.lastCheckedAt??'')+90_000,
    receivedTime+DATA_UPDATE_FRESH_MS,Number.isFinite(receivedTime)?Math.floor(Date.now()/60_000)*60_000+60_000:NaN]);
  const clock=new Date(now),today=`${clock.getFullYear()}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const rosterExpired=Number.isFinite(rosterExpiry)&&now>=rosterExpiry;
  const dutyOverview=useMemo(()=>selected?.duties?buildDutyOverview(selected.duties.scope,selected.duties.snapshot,today,now):null,[selected?.duties,today,rosterExpired]);
  const openDuties=()=>{setClubSection('Dienste');setTab('club');};
  const dutyContent=(expanded=false)=>dutyOverview?<DutyRoster overview={dutyOverview} expanded={expanded} onOpen={openDuties}/>:<Card style={{width:'100%',maxWidth:520,alignSelf:'center'}}><Section title="Verein" icon="duty"/><Label muted>{selected?.dutiesReadFailed?'Gespeicherte Dienstquelle konnte nicht gelesen werden.':'Dienstplan noch nicht verfügbar.'}</Label><Label muted>Daten aktualisieren lädt unterstützte Dienstquellen. Vollständigkeit bleibt bis zur Quellenprüfung unbekannt.</Label>{!expanded&&<Action secondary onPress={openDuties}>Alle Dienste ansehen</Action>}</Card>;
  const sameProviderOwner=providerStatus.ownerId===selected?.snapshot.ownerId&&!!providerStatus.ownerId;
  const sameProviderAccount=!selected?.snapshot.account||providerStatus.connection.observed?.accountNumber===selected.snapshot.account.accountRef;
  const flightStatusController=sameProviderOwner&&sameProviderAccount?providerStatus:unknownProviderStatus;
  useEffect(() => {
    if (!lastLoad) return;
    overlayHistory.current = [];
    setDetail(null); setSheet(null); setTab('home');
  }, [lastLoad]);
  const libraryRevision = canonical([library.bookId, library.flights]);
  useEffect(() => { setProfileNameDraft(library.displayName); }, [library.displayName]);
  const { width, height, fontScale } = useWindowDimensions();
  const aiKeyboard = tab === 'ai' && !overlayOpen && keyboardTop !== null;
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
      if (detail || sheet) { closeOverlay(); return true; }
      if (tab === 'flights' && flightHeader.back) { flightHeader.back(); return true; }
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    }); return () => listener.remove();
  }, [detail, sheet, tab, screenBusy, flightHeader]);
  const openFlightFlow = (intent:ConnectionIntent='options') => { diagnosticJournal.record('action',intent==='update'?'update-flights':'open-flight-tools'); onCoreFlights(intent); return true; };
  useEffect(() => { diagnosticJournal.record('screen', coreFlightsOpen ? 'provider-options' : detail ? 'flight-detail' : sheet ?? tab); }, [tab,sheet,detail,coreFlightsOpen]);
  useEffect(() => { const listener=AppState.addEventListener('change',state=>{if(state==='active'||state==='background'||state==='inactive')diagnosticJournal.record('lifecycle',state);});return()=>listener.remove(); }, []);
  const openBooks = () => openHeaderSheet('paper');
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
    <DataUpdateIndicator connection={flightStatusController.connection} receivedAt={receivedAt} readState={ownFlights.phase==='failed'?'failed':ownFlights.phase==='loading'?'loading':'ready'}
      now={now} disabled={screenBusy} onPress={() => openFlightFlow('update')} />
    <MedicalIndicator capture={medical} now={now} active={sheet === 'medical'} disabled={screenBusy} onPress={() => openHeaderSheet('medical')} />

  </>;
  const profileControl = <Pressable accessibilityRole="button" accessibilityLabel="Profil & Einstellungen öffnen" accessibilityState={{ disabled: screenBusy }} disabled={screenBusy} onPress={() => openHeaderSheet('profile')} style={s.profileButton}><ProfileIcon /></Pressable>;
  const header = <AppHeader profile={profileControl} source={tab === 'club' ? clubAirfield : mountain} title={tab === 'ai' ? 'MoFlight AI' : tab === 'flights' ? flightHeader.title : pageTitle} back={tab === 'flights' ? flightHeader.back : undefined}
    subtitle={tab === 'home' ? 'Guten Tag!' : tab === 'ai' ? 'Dein Segelflug-Assistent' : 'MoFlight'}>{statusControls}</AppHeader>;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[s.root, keyboardOverlap > 0 && { paddingBottom: keyboardOverlap }]}>
    <View collapsable={false} style={{ flex: 1 }}>
    <View collapsable={false} style={[{ flex: 1 }, overlayOpen && sheet !== 'statistics' && s.hidden, sheet === 'statistics' && s.dimmed]} pointerEvents={overlayOpen ? 'none' : 'auto'} aria-hidden={overlayOpen} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    {header}
    <View style={[s.content, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }]}>
      <View style={[s.page, tab !== 'home' && s.hidden]} accessibilityElementsHidden={tab !== 'home'} importantForAccessibility={tab === 'home' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {updateForOwner && dismissedUpdate !== updateForOwner && <UpdateResult result={updateForOwner} onDetails={() => openHeaderSheet('status')} onDismiss={() => setDismissedUpdate(updateForOwner)} />}
          <View style={{width:'100%',maxWidth:wide?920:520,alignSelf:'center',flexDirection:wide?'row':'column',alignItems:'flex-start',gap:18}}>
          <View style={{width:'100%',flex:wide?1:undefined}}><Dashboard now={now} ownFlights={ownFlights.view} ownFlightPhase={ownFlights.phase} pending={null} width={width} fontScale={fontScale} onFlight={flightId=>{setFlightRequest({year:null,flightId});setTab('flights');}} onPaper={() => openHeaderSheet('paperInfo')} onStatistics={() => { ownFlights.clearDetail(); openHeaderSheet('statistics'); }} onFlights={() => { overlayHistory.current=[]; setDetail(null); setSheet(null); setFlightRequest({year:null}); setTab('flights'); }} /></View>
          {ownFlights.phase==='ready'&&!!selected?.snapshot.account&&<View style={{width:'100%',flex:wide?1:undefined}}>{dutyContent()}</View>}
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'flights' && s.hidden]} accessibilityElementsHidden={tab !== 'flights'} importantForAccessibility={tab === 'flights' ? 'auto' : 'no-hide-descendants'}>
        <OwnFlights active={tab === 'flights' && !coreFlightsOpen} data={ownFlights} filterRequest={flightRequest} onHeaderChange={setFlightHeader}
          />
      </View>
      <View style={[s.page, tab !== 'logbook' && s.hidden]} accessibilityElementsHidden={tab !== 'logbook'} importantForAccessibility={tab === 'logbook' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={[s.canvas, { paddingTop: 10 }]}>
          <View style={{ width: '100%', maxWidth: 480, alignSelf: 'center', gap: 10 }}>
            <Card><SymbolIcon name="book" size={40} tone="paper"/><Section title="Dein Papierflugbuch" /><Label style={{color:colors.cyan}}>In Vorbereitung</Label><Label>Das Einrichten deines Papierflugbuchs und die Zuordnung deiner Flüge werden noch vorbereitet.</Label><Label muted>Du kannst deine eigenen Flüge bereits laden, offline ansehen und auswerten. Dafür brauchst du kein Flugbuch.</Label><Action testID="paper-flights-entry" onPress={() => setTab('flights')}>Flüge ansehen</Action></Card>
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'club' && s.hidden]} accessibilityElementsHidden={tab !== 'club'} importantForAccessibility={tab === 'club' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{(['Übersicht', 'Termine', 'Dienste', 'Dokumente', 'Arbeitsstunden', 'Aufgaben'] as const).map(section => <Chip key={section} title={section} selected={clubSection === section} onPress={() => {diagnosticJournal.record('filter','club-section');setClubSection(section);}} />)}</ScrollView>
          <View style={[s.clubBody, tablet && s.clubBodyWide]}>
          {(clubSection === 'Übersicht' || clubSection === 'Dienste') && dutyContent(true)}
          {(clubSection === 'Übersicht' || clubSection === 'Termine') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubEvents information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => setClubSection('Termine')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Dokumente') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubDocumentNotices information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => setClubSection('Dokumente')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Arbeitsstunden') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubWorkSummary information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => setClubSection('Arbeitsstunden')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Aufgaben') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubOwnTasks information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => setClubSection('Aufgaben')} /></View>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => setSheet('status')} style={ui.smallAction}><IconLabel name="right" size={16} muted>Verbindung & Datenstatus</IconLabel></Pressable>
        </ScrollView>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.page, tab !== 'ai' && s.hidden]} accessibilityElementsHidden={tab !== 'ai'} importantForAccessibility={tab === 'ai' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView ref={aiScroll} contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled" onContentSizeChange={() => { if (aiKeyboard) aiScroll.current?.scrollToEnd({ animated: false }); }}>
          <View style={[s.aiBody, tablet && { maxWidth: 720 }]}>
          <Card style={s.welcome}><View style={ui.row}><View style={s.aiBadge}><SymbolIcon name="sparkle" size={24} tone="contrast" /></View><Section title="Dein Assistent" /></View><Label>Fragen zu deinen Flugdaten, Auswertungen und Planungen – an einem Ort.</Label><Label muted>Die Beispiele verwenden ein synthetisches Testflugbuch. Deine echten Flüge findest du unter Flüge. Der AI-Dienst ist noch nicht verbunden.</Label></Card>
          <View style={ui.section}><Section title="Beispiel-Fragen" /><Label muted style={{ fontSize: 10 }}>Lokal · ohne AI-Dienst</Label></View>
          <View style={s.questionGrid}>{quickQuestions.map((question, index) => <Pressable key={question} accessibilityRole="button" accessibilityLabel={`${question} Lokal auswerten`} onPress={() => localQuery(index)} style={({ pressed }) => [s.question, { width: compact ? '100%' : tablet ? '32%' : '48.5%' }, pressed && ui.pressed]}><Label style={{ fontSize: 13 }}>{question}</Label><SymbolIcon name="right" size={20} /></Pressable>)}</View>
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
    <View style={[s.nav, wrapTabs && s.navWrap, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }, aiKeyboard && s.hidden]} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} testID={`tab-${item.id}`} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: tab === item.id }} onPress={() => { diagnosticJournal.record('action',item.id);setTab(item.id); }} style={({ pressed }) => [s.navItem, tab === item.id && s.navSelected, wrapTabs && s.navItemWrap, pressed && ui.pressed]}>{item.id === 'flights' ? <PlaneIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'logbook' ? <BookIcon color={tab === item.id ? '#00c8ff' : colors.muted} /> : item.id === 'club' ? <ClubMark color={tab === item.id ? '#00c8ff' : colors.muted} /> : <SymbolIcon name={item.id === 'home' ? 'home' : 'sparkle'} size={28} tone={tab === item.id ? 'default' : 'muted'} tile />}<Text style={[s.navLabel, tab === item.id && s.active]}>{item.title}</Text></Pressable>)}</View>
    </View>
    {overlayOpen && <View style={[StyleSheet.absoluteFill, s.modal, sheet === 'statistics' && s.statisticsScrim]} accessibilityViewIsModal>
      {sheet === 'statistics' ? <View style={[s.statisticsFrame, { width: Math.max(0, Math.min(width - 24, 720)) }]}>
        <AppHeader back={closeOverlay} backDisabled={screenBusy} title="Flugstatistik" subtitle="Meine Saison">{null}</AppHeader>
        <KeyboardAvoidingView style={{ flex: 1, minHeight: 0 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <StatisticsOverlay key={statisticsScopeKey} data={ownFlights} today={today} fontScale={fontScale} onBackHandler={handler => { statisticsBack.current = handler; }} />
        </KeyboardAvoidingView>
      </View> : <>
      <AppHeader profile={profileControl} source={mountain} back={closeOverlay} backDisabled={screenBusy} title={detail ? 'Flugdetails' : sheet === 'paper' || sheet === 'paperInfo' ? 'Papierflugbuch' : sheet === 'development' ? 'Entwicklung' : sheet === 'importPreview' ? 'Importvorschau' : sheet === 'flightLab' ? 'Datensatztest' : sheet === 'bookLab' ? 'Flugbuchtest' : sheet === 'backup' ? 'Sicherung' : sheet === 'designPreview' ? 'Designvorschau' : sheet === 'diagnostics' ? 'Diagnose' : sheet === 'profile' ? 'Profil & Einstellungen' : sheet === 'medical' ? 'Medical' : 'MoFlight'}>{statusControls}</AppHeader>
        {sheet === 'designPreview' ? <DesignPreview/> : sheet === 'flightLab' ? <><DevelopmentNotice /><LabApp providerOwned={true} embedded onBusyChange={setScreenBusy} /></> : sheet === 'bookLab' ? <><DevelopmentNotice /><BookLab close={closeOverlay} onBusyChange={setScreenBusy} /></> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView ref={overlayScroll} key={overlayKey} contentOffset={{ x: 0, y: overlayOffsets.current[overlayKey] ?? 0 }} onScroll={event => { overlayOffsets.current[overlayKey] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          {sheet === 'profile' && <ProfileSettings connectionSummary={<ConnectionSummary controller={flightStatusController} ownFlights={ownFlights.view} phase={ownFlights.phase} />} onTools={() => openHeaderSheet('development')} onBackup={() => openFlightFlow('options')} onDiagnostics={() => openHeaderSheet('diagnostics')} onStatus={() => openHeaderSheet('status')} onCredits={() => openHeaderSheet('credits')} onBooks={() => openHeaderSheet('selectBook')} displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />}
          {sheet === 'development' && <DevelopmentHub onDesignPreview={()=>openHeaderSheet('designPreview')} onPaper={openBooks} profileTools={<SyntheticProfileSettings displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />} onSelectBook={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => openHeaderSheet('flightLab')} onBooks={() => openHeaderSheet('bookLab')} onImportPreview={() => openHeaderSheet('importPreview')} onCoreFlights={()=>onCoreFlights('options',true)} />}
          {sheet === 'importPreview' && <ImportPreview session={importPreview} onChange={setImportPreview} onNavigate={() => { overlayOffsets.current.importPreview = 0; overlayScroll.current?.scrollTo({ y: 0, animated: false }); }} />}
          {sheet === 'diagnostics' && <Diagnostics />}
          {sheet === 'backup' && <LibraryBackup onBusyChange={setScreenBusy} />}
          {sheet === 'paperInfo' && <Card><SymbolIcon name="book" size={40} tone="paper"/><Section title="Dein Papierflugbuch" /><Label style={{color:colors.cyan}}>In Vorbereitung</Label><Label>Das Einrichten deines Papierflugbuchs und die Zuordnung deiner Flüge werden noch vorbereitet.</Label><Label muted>Du kannst deine eigenen Flüge bereits laden, offline ansehen und auswerten. Dafür brauchst du kein Flugbuch.</Label><Action onPress={() => { overlayHistory.current=[];setSheet(null);setTab('flights'); }}>Flüge ansehen</Action></Card>}
          {sheet === 'paper' && <PaperStatus bookName={book?.name ?? null} pending={library.pending} onBooks={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => { overlayHistory.current = []; setDetail(null); setSheet(null); setTab('flights'); }} />}
          {sheet === 'medical' && <MedicalDetails now={now} capture={medical} loading={ownFlights.phase==='loading'} needsReload={ownFlights.view?.medicalReadFailed} refreshFailed={lastLoad?.medicalStatus==='failed'} />}
          {detail && <><Section title={detail.registration ?? 'Flugzeug unbekannt'} />{[['Datum', dateText(detail.date)], ['Flugzeugtyp', detail.aircraft_model], ['Abflug', detail.start_place], ['Ankunft', detail.landing_place], ['Start', detail.start], ['Landung', detail.landing], ['Zeitbasis', detail.time_basis], ['Dauer', detail.minutes === null ? null : `${formatDuration(detail.minutes)} h`], ['Rolle', detail.pilot_role], ['Startart', detail.launch], ['Landungen', detail.landings?.toString()], ['Bemerkungen', detail.remarks]].map(([label, value]) => <Card key={label}><Label muted>{label}</Label><Label selectable>{value ?? 'Unbekannt'}</Label></Card>)}<Label muted>Quelle: gespeicherte synthetische Bibliothek · {book?.name}. Distanz und Flugtrack sind nicht verfügbar.</Label></>}
          {sheet === 'selectBook' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}><Section title="Flugbuch auswählen" />{library.books.map(b => <Action key={b.id} secondary icon={b.id === library.bookId ? 'check' : undefined} onPress={() => { overlayHistory.current = []; setDetail(null); setSheet(null); void library.selectBook(b.id); }}>{b.name}</Action>)}{!library.books.length && <Empty title="Noch kein Flugbuch">Eine vorhandene Sicherung kann in einer neuen lokalen Bibliothek geöffnet werden. Live-Import und neue Produkt-Flugbücher sind noch nicht verfügbar.</Empty>}<Label muted>Gespeicherte synthetische Bibliothek · keine automatische Zuordnung.</Label><Action secondary onPress={() => openHeaderSheet('backup')}>Sicherung & Wiederherstellung</Action></View>}
          {sheet === 'unsupported' && <Empty title="Klassifikation nicht verfügbar">Der gespeicherte Flugvertrag enthält keine Strecken- oder Platzrundenkennzeichnung. Flugzeit, Start-/Zielfeld und Rolle werden dafür nicht als Ersatz interpretiert. Der aktive Filter bleibt erhalten.</Empty>}
          {sheet === 'status' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}><Section title="Verbindung & Datenstatus" />{updateForOwner && <UpdateResult result={updateForOwner} detail />}<ConnectionSummary ownFlights={ownFlights.view} phase={ownFlights.phase}/><Label muted>Eigene Flüge, Medical, unterstützte Dienste, Arbeitsstunden, eigene Aufgaben, sichtbare Termine und Dokumenthinweise werden getrennt gespeichert. Vereinsauszüge zeigen nur erfasste Quellenausschnitte; ihre Vollständigkeit ist ungeprüft. Vereinsnachrichten und AI-Dienst sind noch nicht verbunden. Flugtracks und Distanzen sind nicht verifiziert. Testflugbuch und Papierwerkzeuge bleiben unter Entwicklung getrennt.</Label><Label muted>Neue Daten und Anmeldung erreichst du über die Verbindung oben in der Kopfzeile.</Label><Action secondary icon="book" onPress={() => openHeaderSheet('backup')}>Sicherung & Wiederherstellung</Action></View>}
          {sheet === 'credits' && <><Section title="Bildnachweise" /><Label muted>Dekorative Bilder, keine Flug-, Wetter- oder Vereinsdaten. Darstellung mit Ausschnitt und dunkler Farbüberlagerung. Bildlizenzen gelten unabhängig vom Anwendungscode.</Label>{[
            ['Sebastian Kawa, Tomasz Kawa · GrandPrixGlidingChile.JPG', 'CC BY-SA 3.0', 'https://commons.wikimedia.org/wiki/File:GrandPrixGlidingChile.JPG', 'https://creativecommons.org/licenses/by-sa/3.0/'],
            ['Dg-505 · Sunset', 'CC BY 3.0', 'https://commons.wikimedia.org/wiki/File:Sunset_-_panoramio_(312).jpg', 'https://creativecommons.org/licenses/by/3.0/'],
            ['Partonez · Windsock at Bolt Head Airfield', 'CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Windsock_at_Bolt_Head_Airfield.jpg', 'https://creativecommons.org/licenses/by-sa/4.0/'],
            ['L293D · Glider (sailplane).jpg · Wikimedia Commons · resized and recompressed', 'CC0 1.0', 'https://commons.wikimedia.org/wiki/File:Glider_(sailplane).jpg', 'https://creativecommons.org/publicdomain/zero/1.0/'],
            ['Anne Burgess · Clubhouse at Dusk · Geograph, via Wikimedia Commons', 'CC BY-SA 2.0', 'https://commons.wikimedia.org/wiki/File:Clubhouse_at_Dusk_-_geograph.org.uk_-_6960024.jpg', 'https://creativecommons.org/licenses/by-sa/2.0/'],
          ].map(([author, license, source, licenseUrl]) => <Card key={author}><Label>{author}</Label><Action secondary onPress={() => { void Linking.openURL(source!); }}>Original & Urheber</Action><Action secondary onPress={() => { void Linking.openURL(licenseUrl!); }}>{license}</Action></Card>)}</>}
        </ScrollView></KeyboardAvoidingView>}
      </>}
    </View>}
    </View>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 599 },
  page: { flex: 1 }, hidden: { display: 'none' }, canvas: { padding: 18, paddingTop: 8, gap: 18, paddingBottom: 28 }, flightCanvas: { padding: 10, paddingTop: 0, paddingBottom: 20 },
  profileButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.card },
  headerBook: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  stateBanner: { gap: 3, padding: 4, marginTop: 8 }, provenance: { fontSize: 10, lineHeight: 16, color: '#8ba4bc', letterSpacing: .6 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 }, metricValue: { color: colors.cyan, fontSize: 20, lineHeight: 25, fontWeight: '600' }, metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  chips: { gap: 5 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#11263a', paddingHorizontal: 12, gap: 7 }, search: { flex: 1, minHeight: 40, color: colors.text, fontSize: 13, paddingVertical: 4 }, filterButton: { width: 42, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statsStrip: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 10, gap: 3, minHeight: 66 }, flightRow: { padding: 7, borderRadius: 13, gap: 3 }, flightDate: { fontSize: 12, lineHeight: 17, fontWeight: '600' }, noTrack: { width: 64, minHeight: 64, backgroundColor: '#10282d', borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, badge: { borderRadius: 12, borderWidth: 1, borderColor: '#227f87', paddingHorizontal: 7, backgroundColor: '#064240' },
  clubBody: { gap: 8 }, clubBodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }, clubHalf: { width: '49.2%' }, duty: { padding: 0 }, clubSectionCard: { width: '100%', backgroundColor: colors.background, experimental_backgroundImage: 'none', borderColor: '#152d42' }, dutyAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, dutyActionFace: { minHeight: 34, borderRadius: 17, backgroundColor: colors.blue, justifyContent: 'center', paddingHorizontal: 16 },
  aiBody: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 18 }, welcome: { backgroundColor: colors.card, borderColor: colors.border, minHeight: 126, gap: 7 }, aiBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78efdc' },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, question: { minHeight: 86, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, paddingRight: 18, backgroundColor: colors.card, justifyContent: 'center' }, questionArrow: { position: 'absolute', right: 8, top: '40%', color: colors.muted, fontSize: 23 },
  composer: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }, messageInput: { flex: 1, minHeight: 52, maxHeight: 150, color: colors.text, fontSize: 16, paddingHorizontal: 8 }, send: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, recent: { borderTopWidth: 1, borderTopColor: '#1b344a', paddingTop: 10, gap: 8 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, padding: 6, gap: 2, alignSelf: 'center', width: '100%', maxWidth: 599 }, navWrap: { flexWrap: 'wrap', justifyContent: 'center' }, navItemWrap: { flex: 0, width: '32%' }, navItem: { flex: 1, minHeight: 68, justifyContent: 'center', alignItems: 'center', paddingVertical: 8, gap: 4, borderRadius: 16 }, navIcon: { fontSize: 25, lineHeight: 29, color: colors.muted }, navSelected: {backgroundColor: colors.raised}, navLabel: { fontSize: 12, textAlign: 'center', width: '100%', lineHeight: 18, color: colors.muted }, active: { color: colors.cyan, fontWeight: '700' }, activeLine: { height: 2, width: 24, backgroundColor: colors.cyan, position: 'absolute', top: 0, borderRadius: 2 },
  modal: { backgroundColor: colors.background }, dimmed: { opacity: .8 }, statisticsScrim: { backgroundColor: '#000712bd', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 10 },
  statisticsFrame: { flex: 1, minHeight: 0, alignSelf: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.background, overflow: 'hidden' },
});

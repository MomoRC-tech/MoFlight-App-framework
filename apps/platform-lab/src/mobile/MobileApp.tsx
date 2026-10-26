import { startTiming } from '../start-timing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, Keyboard, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { canonical, type Flight } from '@moflight/flight-logbook';
import LabApp from '../App';
import { BookLab } from '../BookLab';
import { Action, Card, Chip, ClubMark, Empty, IconLabel, Label, Photo, Section, colors, ui } from './theme';
import { useLibrary } from './use-library';
import { formatDuration } from './flight-model';
import { AiChatRoute } from './AiChatRoute';
import { openAiWorkspaceNative } from '../ai/workspace-native';
import { aiAnswerFlightIds } from '../ai/answer-navigation';
import { Dashboard } from './Dashboard';
import { PlaneIcon, ProfileIcon, BookIcon } from './ShellIcons';
import { SymbolIcon } from './SymbolIcon';
import { ProfileSettings, SyntheticProfileSettings } from './ProfileSettings';
import { HelpScreen } from './HelpScreen';
import { readContextHelpEnabled, saveContextHelpEnabled } from './help-preferences-native';
import type { HelpCategory } from './help-catalog';
import { DesignPreview } from './DesignPreview';
import { Diagnostics } from './Diagnostics';
import { initializeDiagnostics } from './diagnostics-native';
import { diagnosticJournal } from '../diagnostics';
import { unknownProviderStatus, type ProviderStatus } from './ProviderConnection';
import { DataUpdateIndicator } from './DataUpdateIndicator';
import {SyncProgress} from './SyncProgress';
import {SyncKeepAwake} from './SyncKeepAwake';
import {SyncStatusDetails} from './SyncStatusDetails';
import {idleSyncProgress,idleSyncNotice,completedSyncProgress,type SyncProgress as SyncProgressState} from './sync-progress';
import { UpdateDialog } from './UpdateDialog';
import { DATA_FRESHNESS_REMINDER_MS, DATA_UPDATE_FRESH_MS } from './data-freshness';
import { SESSION_DISPLAY_FRESH_MS, createSessionPresentation } from './data-update-presentation';
import { StatusBadge } from './StatusBadge';
import { syncStatus } from './sync-status';
import { createSyncConfirmation } from './sync-confirmation';
import { SyncConfirmationDialog } from './SyncConfirmationDialog';
import { AppHeader } from './AppHeader';
import { MedicalDetails } from './MedicalStatus';
import { OverviewTiles } from './OverviewTiles';
import { DevelopmentHub, DevelopmentNotice } from './DevelopmentHub';
import { LibraryBackup } from './LibraryBackup';
import { PaperStatus } from './PaperStatus';
import { ImportPreview } from './ImportPreview';
import type { PreviewSession } from '../import-preview';
import { CoreFlightFoundation, type FlightLoadResult, type ConnectionIntent,type OptionsDestination,type SyncControls } from './CoreFlightFoundation';
import { UpdateResult } from './UpdateResult';
import { ClubEvents, ClubDocumentNotices, ClubWorkSummary, ClubOwnTasks } from './ClubInformation';
import { ConnectionSummary } from './ConnectionSummary';
import { OwnFlights, type OwnFlightHeader } from './OwnFlights';
import type { OwnFlightRequest } from './own-flight-model';
import { useOwnFlights } from './use-own-flights';
import { StatisticsOverlay } from './StatisticsOverlay';
import type { StatisticsSection } from './statistics-overlay-model';
import { ownFlightReadPorts } from './own-flight-reader-native';
import { buildDutyOverview, dutySnapshotExpiresAt } from '../vereinsflieger/duties';
import { DutyRoster } from './DutyRoster';
import { ClubHeading } from './ClubHeading';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { useStartClock } from './use-start-clock';

const mountain = require('../../assets/aviation/mountain-header-v2.jpg');
const clubAirfield = require('../../assets/aviation/club-airfield.jpg');
const tabs = [{ id: 'home', title: 'Übersicht' }, { id: 'flights', title: 'Flüge' }, { id: 'logbook', title: 'Flugbuch' }, { id: 'club', title: 'Verein' }, { id: 'ai', title: 'AI' }] as const;
type Tab = typeof tabs[number]['id'];
type ClubSection = 'Übersicht' | 'Termine' | 'Dienste' | 'Dokumente' | 'Arbeitsstunden' | 'Aufgaben';
type Sheet = 'designPreview' | 'diagnostics' | 'paper' | 'development' | 'importPreview' | 'flightLab' | 'bookLab' | 'backup' | 'selectBook' | 'unsupported' | 'credits' | 'status' | 'profile' | 'medical' | 'statistics' | 'help' | null;
const dateText = (date: string | null) => date ? new Date(date + 'T12:00:00Z').toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'Datum unbekannt';

export default function MobileApp() {
  useEffect(() => { const finish = startTiming.initialization(); try { initializeDiagnostics(); finish(true); } catch { finish(false); } startTiming.shell(); }, []);
  const [entry,setEntry] = useState<{intent:ConnectionIntent;requestId:number;open:boolean;development:boolean;destination:OptionsDestination}|null>({intent:'options',requestId:0,open:false,development:false,destination:'settings'});
  const activeEntry=useRef(entry);activeEntry.current=entry;
  const [lastLoad,setLastLoad] = useState<FlightLoadResult|null>(null);
  const [flightReload,setFlightReload] = useState(0);
  const [providerStatus,setProviderStatus] = useState<ProviderStatus>(unknownProviderStatus);
  const [syncProgress,setSyncProgress]=useState<SyncProgressState>(idleSyncProgress);
  const syncLock=useRef(false);
  const [syncControls,setSyncControls]=useState<SyncControls|null>(null);
  const syncRunning=!!entry?.open&&entry.intent==='update';
  const modalOpen=!!entry?.open&&(entry.intent!=='update'||!!providerStatus.loginVisible||syncProgress.state==='waiting');
  const maintenancePage=entry?.intent==='options'&&(entry.destination==='backup'||entry.destination==='settings'&&!providerStatus.loginVisible);
  const maintenancePageOpen=modalOpen&&maintenancePage;
  useEffect(()=>{
    if(syncProgress.state==='failed'||syncProgress.state==='partial')syncLock.current=false;
    if(syncProgress.state==='failed'){
      // Keep the actionable header result, but release the finished job's read reservation.
      setEntry(previous=>previous?.open&&previous.intent==='update'?{...previous,open:false}:previous);
      setFlightReload(value=>value+1);
    }
  },[syncProgress.state]);
  useEffect(()=>{diagnosticJournal.record('sync',modalOpen?'sync-popup-open':'sync-popup-hidden');},[modalOpen]);
  return <SafeAreaProvider><SyncKeepAwake active={syncProgress.state==='active'||syncProgress.state==='waiting'}/><View style={{flex:1}}>
    <View style={[{flex:1},maintenancePageOpen&&{display:'none'}]} pointerEvents={modalOpen?'none':'auto'} aria-hidden={modalOpen} accessibilityElementsHidden={modalOpen} importantForAccessibility={modalOpen?'no-hide-descendants':'auto'}><Shell syncControls={syncControls} syncRunning={syncRunning} syncProgress={syncProgress} coreFlightsOpen={!!entry?.open} flightReload={flightReload} lastLoad={lastLoad} providerStatus={providerStatus} onCoreFlights={(intent='options',development=false,destination='settings')=>{
      if(syncLock.current){diagnosticJournal.record('sync','sync-duplicate-ignored');return;}
      syncLock.current=intent==='update';if(intent==='update'){diagnosticJournal.record('sync','sync-requested');setSyncProgress({...idleSyncProgress,state:'active',current:'prepare'});}if(intent==='update')setLastLoad(null);setEntry(previous=>({intent:intent==='update'?'update':'options',development,destination,open:true,requestId:(previous?.requestId??0)+1}));}}/></View>
    {entry&&<UpdateDialog open={modalOpen} expanded={entry.intent!=='update'||!!providerStatus.loginVisible} fullPage={maintenancePage}>{windowTop=><CoreFlightFoundation destination={entry.destination} dialogTop={windowTop} providerEntryAllowed={entry.intent==='update'} open={entry.open} requestId={entry.requestId} intent={entry.intent} onProgress={setSyncProgress} onControls={setSyncControls} onStatus={setProviderStatus} developmentRecoveryCheckpoints={entry.development} onRequestSync={()=>{
      const current=activeEntry.current;
      if(!current?.open||current.intent!=='options'||!['backup','settings'].includes(current.destination)||current.destination!==entry.destination||current.requestId!==entry.requestId||syncLock.current)return;
      diagnosticJournal.record('sync','sync-requested');diagnosticJournal.record('action','update-flights');
      syncLock.current=true;setSyncProgress({...idleSyncProgress,state:'active',current:'prepare'});setLastLoad(null);
      setEntry({...current,intent:'update',destination:'settings',requestId:current.requestId+1});
    }} close={result=>{syncLock.current=false;
      if(result){
        setSyncProgress(completedSyncProgress(result));
      }else if(syncRunning)setSyncProgress(previous=>previous.state==='failed'?previous:{...previous,state:'failed',message:'Synchronisierung abgebrochen. Gespeicherte Daten bleiben verfügbar.'});
      setEntry(previous=>previous?{...previous,open:false}:null);if(result)setLastLoad(result);setFlightReload(value=>value+1);}}/>}</UpdateDialog>}
  </View></SafeAreaProvider>;
}
function Shell({onCoreFlights=()=>{},coreFlightsOpen=false,flightReload=0,lastLoad=null,providerStatus=unknownProviderStatus,syncRunning=false,syncControls=null,syncProgress=idleSyncProgress}:{onCoreFlights?:(intent?:ConnectionIntent,developmentRecoveryCheckpoints?:boolean,destination?:OptionsDestination)=>void;coreFlightsOpen?:boolean;flightReload?:number;lastLoad?:FlightLoadResult|null;providerStatus?:ProviderStatus;syncRunning?:boolean;syncControls?:SyncControls|null;syncProgress?:SyncProgressState}={}) {
  const [tab, setTab] = useState<Tab>('home');
  const [statisticsYear,setStatisticsYear]=useState<number|undefined>(undefined);
  const [statisticsSection,setStatisticsSection]=useState<StatisticsSection>('overview');
  const [sheet, setSheet] = useState<Sheet>(null);
  const [detail, setDetail] = useState<Flight | null>(null);
  const [screenBusy, setScreenBusy] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState('');
  const [helpEntryId, setHelpEntryId] = useState<string | null>(null);
  const [helpQuery, setHelpQuery] = useState('');
  const [helpCategory, setHelpCategory] = useState<HelpCategory | null>(null);
  const [helpReturnLabel, setHelpReturnLabel] = useState('Zurück zum Profil');
  const [replayHintToken, setReplayHintToken] = useState(0);
  const [helpEnabled, setHelpEnabled] = useState<boolean | null>(null);
  const [helpSaving, setHelpSaving] = useState(false);
  const [helpPreferenceError, setHelpPreferenceError] = useState(false);
  const helpSaveLock = useRef(false);
  const syncConfirmation = useRef(createSyncConfirmation()).current;
  const [syncPrompt, setSyncPrompt] = useState<{ cancel: () => void; confirm: () => void } | null>(null);
  const syncAdmission = useRef({scope:'',allowed:false});
  useEffect(()=>()=>syncConfirmation.invalidate(),[syncConfirmation]);
  useEffect(() => { let mounted = true; void readContextHelpEnabled().then(enabled => { if (mounted) setHelpEnabled(enabled); }); return () => { mounted = false; }; }, []);
  const toggleHelp = async () => {
    if (helpEnabled === null || helpSaveLock.current) return;
    helpSaveLock.current = true; setHelpSaving(true); setHelpPreferenceError(false);
    const next = !helpEnabled;
    const saved = await saveContextHelpEnabled(next);
    if (saved) setHelpEnabled(next);
    else setHelpPreferenceError(true);
    helpSaveLock.current = false; setHelpSaving(false);
  };
  const [importPreview, setImportPreview] = useState<PreviewSession | null>(null);
  const overlayHistory = useRef<{ sheet: Sheet; detail: Flight | null }[]>([]);
  const statisticsBack = useRef<() => boolean>(() => false);
  const overlayOffsets = useRef<Record<string, number>>({});
  const overlayScroll = useRef<ScrollView>(null);
  const overlayKey = detail ? `detail:${detail.id}` : sheet === 'help' ? `help:${helpEntryId ?? 'home'}` : sheet ?? 'none';
  const overlayOpen = sheet !== null || detail !== null;
  const statisticsPageOpen = sheet === 'statistics' || overlayHistory.current.some(previous => previous.sheet === 'statistics');
  const openHeaderSheet = (next: Sheet) => {
    if (screenBusy) return;
    if (sheet === next && !detail) return;
    Keyboard.dismiss();
    if (next) diagnosticJournal.record('action',next);
    if (overlayOpen) overlayHistory.current.push({ sheet, detail });
    setDetail(null); setSheet(next);
  };
  const popOverlay = () => {
    if (screenBusy) return;
    if (sheet === 'statistics' && statisticsBack.current()) return;
    diagnosticJournal.record('back', detail ? 'flight-detail' : sheet ?? 'close');
    Keyboard.dismiss();
    if (sheet === 'statistics') ownFlights.clearDetail();
    const previous = overlayHistory.current.pop();
    setDetail(previous?.detail ?? null); setSheet(previous?.sheet ?? null);
  };
  const closeOverlay = () => {
    if (sheet === 'help' && helpEntryId) { setHelpEntryId(null); Keyboard.dismiss(); return; }
    popOverlay();
  };
  const openHelp = (entryId: string | null, fromFlight: boolean) => {
    setHelpEntryId(entryId); setHelpQuery(''); setHelpCategory(null);
    setHelpReturnLabel(fromFlight ? (ownFlights.detail ? 'Zurück zum Flug' : 'Zurück zu Flüge') : 'Zurück zum Profil');
    overlayOffsets.current[`help:${entryId ?? 'home'}`] = 0;
    openHeaderSheet('help');
  };
  const leaveHelp = () => { setHelpEntryId(null); popOverlay(); };
  const [clubSection, setClubSection] = useState<ClubSection>('Übersicht');
  const clubOffsets=useRef<Partial<Record<ClubSection,number>>>({});
  const openClubSection=(section:ClubSection)=>{Keyboard.dismiss();setClubSection(section);};
  const dashboardBack=useRef<()=>boolean>(()=>false);
  const [flightRequest, setFlightRequest] = useState<OwnFlightRequest | null>(null);
  const [flightHeader, setFlightHeader] = useState<OwnFlightHeader>({title:'Flüge'});
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const activeTab = useRef(tab);
  activeTab.current = tab;
  const toolsOpen = sheet === 'bookLab' || sheet === 'flightLab';
  const library = useLibrary(coreFlightsOpen || toolsOpen || sheet === 'backup');
  const ownFlights = useOwnFlights(ownFlightReadPorts, !coreFlightsOpen, flightReload,syncRunning,tab==='home'&&sheet===null&&!coreFlightsOpen);
  const updateForOwner=(lastLoad?.ownerId??lastLoad?.verifiedConnection?.ownerId)===ownFlights.view?.snapshot.ownerId && !!ownFlights.view?.snapshot.ownerId &&
    (!lastLoad?.storeId || lastLoad.storeId===ownFlights.view?.snapshot.storeId) &&
    (!lastLoad?.accountRef || lastLoad.accountRef===ownFlights.view?.snapshot.account?.accountRef) ? lastLoad : null;
  const medical=ownFlights.view?.medical??null;
  const medicalLoading=ownFlights.phase==='loading'||ownFlights.view?.sections?.medical==='loading';
  const informationLoading=ownFlights.phase==='loading'||ownFlights.view?.sections?.information==='loading';
  const dutiesLoading=ownFlights.phase==='loading'||ownFlights.view?.sections?.duties==='loading';
  const selected=ownFlights.view;
  const statisticsScopeKey = canonical([selected?.snapshot.ownerId ?? null, selected?.snapshot.storeId ?? null, selected?.snapshot.account?.accountRef ?? null]);
  syncAdmission.current={scope:statisticsScopeKey,allowed:!screenBusy&&!coreFlightsOpen&&!syncRunning&&syncProgress.state!=='active'&&syncProgress.state!=='waiting'};
  useEffect(()=>{syncConfirmation.invalidate();},[statisticsScopeKey,syncConfirmation]);
  const retrievalPlan=useMemo(()=>planFlightRetrieval(selected?.snapshot.savedRetrievals??[]),[selected?.snapshot.savedRetrievals]);
  const rosterExpiry=selected?.duties?.snapshot?dutySnapshotExpiresAt(selected.duties.snapshot):NaN;
  const receivedAt=retrievalPlan.lastSuccessfulRetrievalAt;
  const receivedTime=Date.parse(receivedAt??'');
  const now=useStartClock([rosterExpiry,Date.parse(providerStatus.connection.lastCheckedAt??'')+SESSION_DISPLAY_FRESH_MS,
    receivedTime+DATA_UPDATE_FRESH_MS,receivedTime+DATA_FRESHNESS_REMINDER_MS+1,
    Number.isFinite(receivedTime)?Math.floor(Date.now()/60_000)*60_000+60_000:NaN]);
  const clock=new Date(now),today=`${clock.getFullYear()}-${String(clock.getMonth()+1).padStart(2,'0')}-${String(clock.getDate()).padStart(2,'0')}`;
  const rosterExpired=Number.isFinite(rosterExpiry)&&now>=rosterExpiry;
  const dutyOverview=useMemo(()=>selected?.duties?buildDutyOverview(selected.duties.scope,selected.duties.snapshot,today,now):null,[selected?.duties,today,rosterExpired]);
  const openDuties=()=>{openClubSection('Dienste');setTab('club');};
  const dutyContent=(expanded=false)=>dutyOverview?<DutyRoster overview={dutyOverview} expanded={expanded} onOpen={openDuties}/>:<Card style={{width:'100%',maxWidth:520,alignSelf:'center'}}><ClubHeading clubLabel={selected?.duties?.scope.context.clubLabel} onOpen={openDuties}/><Label muted>{dutiesLoading?'Gespeicherte Dienste werden geladen…':selected?.dutiesReadFailed?'Gespeicherte Dienste konnten nicht gelesen werden.':'Dienstplan noch nicht verfügbar.'}</Label>{!expanded&&<Action secondary onPress={openDuties}>Alle Dienste ansehen</Action>}</Card>;
  const sameProviderOwner=providerStatus.ownerId===selected?.snapshot.ownerId&&!!providerStatus.ownerId;
  const sameProviderAccount=!!selected?.snapshot.account?.accountRef&&(!providerStatus.connection.observed||providerStatus.connection.observed.accountNumber===selected.snapshot.account.accountRef);
  const flightStatusController=sameProviderOwner&&sameProviderAccount?providerStatus:unknownProviderStatus;
  const activityChanged=!!flightStatusController.activity?.changed&&flightStatusController.activity.storeId===selected?.snapshot.storeId&&flightStatusController.activity.accountRef===selected?.snapshot.account?.accountRef;
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
    const show = Keyboard.addListener('keyboardDidShow', event => {
      setKeyboardTop(event.endCoordinates.screenY);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => { setKeyboardTop(null); });
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { Keyboard.dismiss(); }, [tab]);
  useEffect(() => {
    // A reload with identical saved facts must not erase the return path. When
    // facts/book do change, discard stale details but retain named tool/settings paths.
    overlayHistory.current = overlayHistory.current.filter(previous => !previous.detail);
    setDetail(null);
  }, [libraryRevision]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (coreFlightsOpen) return false;
      if (detail || sheet) { closeOverlay(); return true; }
      if (tab === 'flights' && flightHeader.back) { flightHeader.back(); return true; }
      if (tab === 'club' && clubSection !== 'Übersicht') { openClubSection('Übersicht'); return true; }
      if (tab === 'home' && dashboardBack.current()) return true;
      if (tab !== 'home') { setTab('home'); return true; }
      return false;
    }); return () => listener.remove();
  }, [detail, sheet, helpEntryId, tab, screenBusy, flightHeader,clubSection,coreFlightsOpen]);
  const openFlightFlow = (intent:ConnectionIntent='options',destination:OptionsDestination='settings') => {
    if(intent!=='update'){diagnosticJournal.record('action','open-flight-tools');onCoreFlights(intent,false,destination);return true;}
    const ticket=syncConfirmation.request(syncAdmission.current.scope,syncAdmission.current.allowed);
    if(!ticket)return false;
    diagnosticJournal.record('sync','sync-confirmation-open');
    setSyncPrompt({
      cancel:()=>{ticket.cancel();setSyncPrompt(null);diagnosticJournal.record('sync','sync-confirmation-cancelled');},
      confirm:()=>{
        setSyncPrompt(null);
        if(!ticket.confirm(syncAdmission.current.scope,syncAdmission.current.allowed))return;
        syncAdmission.current.allowed=false;
        diagnosticJournal.record('sync','sync-confirmation-accepted');
        diagnosticJournal.record('action','update-flights');onCoreFlights('update',false,destination);
      },
    });
    return true;
  };
  useEffect(() => { diagnosticJournal.record('screen', coreFlightsOpen ? 'provider-options' : detail ? 'flight-detail' : sheet ?? tab); }, [tab,sheet,detail,coreFlightsOpen]);
  useEffect(() => { const listener=AppState.addEventListener('change',state=>{if(state!=='active'){syncConfirmation.invalidate();setSyncPrompt(null);}if(state==='active'||state==='background'||state==='inactive')diagnosticJournal.record('lifecycle',state);});return()=>listener.remove(); }, []);
  const openBooks = () => openHeaderSheet('paper');
  const pageTitle = tabs.find(item => item.id === tab)!.title;
  const readState=ownFlights.phase==='failed'?'failed':ownFlights.phase==='loading'?'loading':'ready';
  const notice=idleSyncNotice({receivedAt,readState,now,activityChanged});
  const completed=!!updateForOwner&&completedSyncProgress(updateForOwner).state==='idle';
  const indicatorStatus=syncStatus({receivedAt,readState,now,activityChanged,completed,progress:syncProgress});
  useEffect(()=>{diagnosticJournal.record('sync',`sync-status-${indicatorStatus.reason}`);},[indicatorStatus.reason]);
  const presentSession=useMemo(createSessionPresentation,[]);
  const loginStatus=presentSession(selected?.snapshot.account?.accountRef?statisticsScopeKey:null,flightStatusController.connection,now);
  const statusDetails=<SyncStatusDetails status={indicatorStatus} scopeKey={selected?.snapshot.account?.accountRef?statisticsScopeKey:null} connection={flightStatusController.connection} receivedAt={receivedAt} readState={readState} now={now} activityChanged={activityChanged}/>;
  const settingsSummary=<>{statusDetails}{ownFlights.phase !== 'failed' && !!(ownFlights.view?.pendingCommand || ownFlights.view?.snapshot.recovery?.readOnly) && <Label>Eine Speicherung oder Wiederherstellung muss geprüft werden. Der letzte geprüfte Stand bleibt lesbar.</Label>}</>;
  const statusControls = <>
    <DataUpdateIndicator progress={syncProgress} completed={completed} incomplete={syncProgress.state==='failed'||syncProgress.state==='partial'} activityChanged={activityChanged} scopeKey={selected?.snapshot.account?.accountRef?statisticsScopeKey:null} connection={flightStatusController.connection} receivedAt={receivedAt} readState={ownFlights.phase==='failed'?'failed':ownFlights.phase==='loading'?'loading':'ready'}
      now={now} syncing={syncProgress.state==='active'||syncProgress.state==='waiting'} disabled={screenBusy} onPress={() => openFlightFlow('update')} />

  </>;
  const profileControl = <Pressable accessibilityRole="button" accessibilityLabel="Profil & Einstellungen öffnen" accessibilityValue={{text:loginStatus.description}} accessibilityState={{ disabled: screenBusy }} disabled={screenBusy} onPress={() => openHeaderSheet('profile')} style={ui.headerAction}><ProfileIcon /><StatusBadge testID="login-status-badge" mark={loginStatus.mark} tone={loginStatus.state==='connected'?'success':loginStatus.state==='login-required'?'advice':loginStatus.mark==='!'?'error':'neutral'}/></Pressable>;
  const header = <AppHeader profile={profileControl} source={tab === 'club' ? clubAirfield : mountain} title={tab === 'ai' ? 'MoFlight AI' : tab === 'flights' ? flightHeader.title : tab==='club'&&clubSection!=='Übersicht'?`Verein · ${clubSection}`:pageTitle} back={tab === 'flights' ? flightHeader.back : tab==='club'&&clubSection!=='Übersicht'?()=>openClubSection('Übersicht'):undefined}
    subtitle={tab === 'home' ? 'Guten Tag!' : tab === 'ai' ? 'Dein Segelflug-Assistent' : 'MoFlight'}>{statusControls}</AppHeader>;
  return <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[s.root, keyboardOverlap > 0 && { paddingBottom: keyboardOverlap }]}>
    <View collapsable={false} style={{ flex: 1 }}>
    <View collapsable={false} style={[{ flex: 1 }, overlayOpen && s.hidden]} pointerEvents={overlayOpen ? 'none' : 'auto'} aria-hidden={overlayOpen} accessibilityElementsHidden={overlayOpen} importantForAccessibility={overlayOpen ? 'no-hide-descendants' : 'auto'}>
    <StatusBar barStyle="light-content" backgroundColor={colors.background} />
    {header}
    <SyncProgress notice={notice} cancel={syncControls?.cancel} canCancel={syncControls?.canCancel} progress={syncProgress} retry={()=>openFlightFlow('update')} details={()=>openHeaderSheet('status')}/>
    <View style={[s.content, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }]}>
      <View style={[s.page, tab !== 'home' && s.hidden]} accessibilityElementsHidden={tab !== 'home'} importantForAccessibility={tab === 'home' ? 'auto' : 'no-hide-descendants'}>
        <ScrollView contentContainerStyle={s.canvas} keyboardShouldPersistTaps="handled">
          <View style={{width:'100%',maxWidth:wide?920:520,alignSelf:'center',flexDirection:wide?'row':'column',alignItems:'flex-start',gap:12}}>
          <View style={{width:'100%',flex:wide?1:undefined,gap:10}}><Dashboard onBackHandler={handler=>{dashboardBack.current=handler;}} now={now} ownFlights={ownFlights.view} ownFlightPhase={ownFlights.phase} pending={null} width={width} fontScale={fontScale} onFlight={flightId=>{setFlightRequest({year:null,flightId});setTab('flights');}} onPaper={() => setTab('logbook')} onStatistics={(year,section='overview') => { setStatisticsYear(year);setStatisticsSection(section);ownFlights.clearDetail(); openHeaderSheet('statistics'); }} onFlights={() => { overlayHistory.current=[]; setDetail(null); setSheet(null); setFlightRequest({year:null}); setTab('flights'); }} /><OverviewTiles medicalLoading={medicalLoading} medical={medical} now={now} onMedical={()=>openHeaderSheet('medical')} onPaper={()=>setTab('logbook')}/></View>
          {<View style={{width:'100%',flex:wide?1:undefined}}>{dutyContent()}</View>}
          </View>
        </ScrollView>
      </View>
      <View style={[s.page, tab !== 'flights' && s.hidden]} accessibilityElementsHidden={tab !== 'flights'} importantForAccessibility={tab === 'flights' ? 'auto' : 'no-hide-descendants'}>
        <OwnFlights active={tab === 'flights'} data={ownFlights} filterRequest={flightRequest} onHeaderChange={setFlightHeader} onHelp={entryId=>openHelp(entryId,true)} replayHintToken={replayHintToken} helpEnabled={helpEnabled === true}
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
        <ScrollView key={clubSection} contentOffset={{x:0,y:clubOffsets.current[clubSection]??0}} onScroll={event=>{clubOffsets.current[clubSection]=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={32} contentContainerStyle={s.canvas}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>{(['Übersicht', 'Termine', 'Dienste', 'Dokumente', 'Arbeitsstunden', 'Aufgaben'] as const).map(section => <Chip key={section} title={section} selected={clubSection === section} onPress={() => {diagnosticJournal.record('filter','club-section');openClubSection(section);}} />)}</ScrollView>
          <View style={[s.clubBody, tablet && s.clubBodyWide]}>
          {(clubSection === 'Übersicht' || clubSection === 'Dienste') && dutyContent(true)}
          {(clubSection === 'Übersicht' || clubSection === 'Termine') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubEvents information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => openClubSection('Termine')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Dokumente') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubDocumentNotices information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => openClubSection('Dokumente')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Arbeitsstunden') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubWorkSummary information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => openClubSection('Arbeitsstunden')} /></View>}
          {(clubSection === 'Übersicht' || clubSection === 'Aufgaben') && <View style={[s.clubSectionCard, tablet && s.clubHalf]}><ClubOwnTasks information={selected?.featureInformation} readFailed={selected?.featureInformationReadFailed} compact={clubSection === 'Übersicht'} onOpen={() => openClubSection('Aufgaben')} /></View>}
          </View>
          <Pressable accessibilityRole="button" onPress={() => openHeaderSheet('status')} style={ui.smallAction}><IconLabel name="right" size={16} muted>Verbindung & Datenstatus</IconLabel></Pressable>
        </ScrollView>
      </View>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.page, tab !== 'ai' && s.hidden]} accessibilityElementsHidden={tab !== 'ai'} importantForAccessibility={tab === 'ai' ? 'auto' : 'no-hide-descendants'}>
        <View style={{flex:1,minHeight:0}}>
          <AiChatRoute active={tab==='ai'&&!overlayOpen&&!coreFlightsOpen} reload={flightReload+':'+statisticsScopeKey} onEvidence={async(message,referenceIds)=>{
            const w=await openAiWorkspaceNative(async()=>{if(activeTab.current!=='ai'||AppState.currentState!=='active')throw new Error('AI navigation inactive');});if(!w)throw new Error('AI owner unavailable');
            try {const identity=await w.identity();if(!identity)throw new Error('AI identity unavailable');const tools=await w.tools(identity,1);
              try {await tools.assertCurrent();const ids=aiAnswerFlightIds(message,referenceIds,tools.context,tools.references);setFlightRequest({year:null,flightId:ids.length===1?ids[0]:undefined,flightIds:ids});setTab('flights');}
              finally{tools.dispose();}
            }finally{await w.close();}
          }}/>
        </View>
      </KeyboardAvoidingView>
    </View>
    {!aiKeyboard && <Label style={{ width: '100%', textAlign: 'center', color: '#8ba4bc', fontSize: 10, lineHeight: 16 }}>Entwicklungsversion</Label>}
    <View style={[s.nav, wrapTabs && s.navWrap, wide && { maxWidth: 960 }, tablet && !wide && { maxWidth: 600 }, aiKeyboard && s.hidden]} accessibilityRole="tablist">{tabs.map(item => <Pressable key={item.id} testID={`tab-${item.id}`} accessibilityRole="tab" accessibilityLabel={item.title} accessibilityState={{ selected: tab === item.id }} onPress={() => { diagnosticJournal.record('action',item.id);setTab(item.id); }} style={({ pressed }) => [s.navItem, tab === item.id && s.navSelected, wrapTabs && s.navItemWrap, pressed && ui.pressed]}>{item.id === 'flights' ? <PlaneIcon color={tab === item.id ? colors.cyan : colors.muted} /> : item.id === 'logbook' ? <BookIcon color={tab === item.id ? colors.cyan : colors.muted} /> : item.id === 'club' ? <ClubMark color={tab === item.id ? colors.cyan : colors.muted} /> : <SymbolIcon name={item.id === 'home' ? 'home' : 'sparkle'} size={28} tone={tab === item.id ? 'default' : 'muted'} />}<Text style={[s.navLabel, tab === item.id && s.active]}>{item.title}</Text></Pressable>)}</View>
    </View>
    {overlayOpen && <View style={[StyleSheet.absoluteFill, s.modal]} accessibilityViewIsModal>
      {statisticsPageOpen && <KeyboardAvoidingView style={[{ flex: 1, minHeight: 0 }, sheet !== 'statistics' && s.hidden]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} accessibilityElementsHidden={sheet !== 'statistics'} importantForAccessibility={sheet === 'statistics' ? 'auto' : 'no-hide-descendants'}>
        <StatisticsOverlay initialYear={statisticsYear} initialSection={statisticsSection} key={statisticsScopeKey} data={ownFlights} today={today} fontScale={fontScale} onBackHandler={handler => { statisticsBack.current = handler; }} onClose={closeOverlay} headerActions={statusControls} feedback={<SyncProgress notice={notice} cancel={syncControls?.cancel} canCancel={syncControls?.canCancel} progress={syncProgress} retry={()=>openFlightFlow('update')} details={()=>openHeaderSheet('status')}/>} />
      </KeyboardAvoidingView>}
      {sheet !== 'statistics' && <>
      {sheet !== 'designPreview'&&<AppHeader variant={['profile','help','medical','status'].includes(sheet ?? '')?'page':'branded'} profile={['profile','help','medical','status'].includes(sheet ?? '')?undefined:profileControl} source={mountain} back={closeOverlay} backDisabled={screenBusy} title={detail ? 'Flugdetails' : sheet === 'paper' ? 'Papierflugbuch' : sheet === 'development' ? 'Entwicklung' : sheet === 'importPreview' ? 'Importvorschau' : sheet === 'flightLab' ? 'Datensatztest' : sheet === 'bookLab' ? 'Flugbuchtest' : sheet === 'backup' ? 'Synthetische Sicherung' : sheet === 'diagnostics' ? 'Diagnose' : sheet === 'profile' ? 'Profil & Einstellungen' : sheet === 'help' ? 'Hilfe & Einführung' : sheet === 'medical' ? 'Medical' : sheet==='status'?'Verbindung & Datenstatus':sheet==='selectBook'?'Synthetisches Flugbuch':sheet==='credits'?'Bildnachweise & Lizenzen':'MoFlight'}>{statusControls}</AppHeader>}
        {sheet !== 'designPreview' && <SyncProgress notice={notice} cancel={syncControls?.cancel} canCancel={syncControls?.canCancel} progress={syncProgress} retry={()=>openFlightFlow('update')} details={()=>openHeaderSheet('status')}/>}
        {sheet === 'designPreview' ? <DesignPreview onClose={closeOverlay}/> : sheet === 'flightLab' ? <><DevelopmentNotice /><LabApp providerOwned={true} embedded onBusyChange={setScreenBusy} /></> : sheet === 'bookLab' ? <><DevelopmentNotice /><BookLab close={closeOverlay} onBusyChange={setScreenBusy} /></> : <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView ref={overlayScroll} key={overlayKey} contentOffset={{ x: 0, y: overlayOffsets.current[overlayKey] ?? 0 }} onScroll={event => { overlayOffsets.current[overlayKey] = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={32} contentContainerStyle={[s.canvas,{width:'100%',maxWidth:600,alignSelf:'center'}]} keyboardShouldPersistTaps="handled">
          {sheet === 'profile' && <ProfileSettings connectionSummary={settingsSummary} onTools={() => openHeaderSheet('development')} onConnections={()=>openFlightFlow('options')} onBackup={() => openFlightFlow('options','backup')} onDiagnostics={() => openHeaderSheet('diagnostics')} onHelp={id => openHelp(id??null,false)} helpEnabled={helpEnabled} helpSaving={helpSaving} helpError={helpPreferenceError} onToggleHelp={()=>void toggleHelp()} onStatus={() => openHeaderSheet('status')} onCredits={() => openHeaderSheet('credits')} onBooks={() => openHeaderSheet('selectBook')} displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />}
          {sheet === 'help' && <HelpScreen entryId={helpEntryId} query={helpQuery} category={helpCategory} onQuery={setHelpQuery} onCategory={setHelpCategory} onEntry={id=>{overlayOffsets.current[`help:${id ?? 'home'}`]=0;setHelpEntryId(id);Keyboard.dismiss();}} onReturn={leaveHelp} onReplay={()=>{if(helpEnabled !== true)return;Keyboard.dismiss();overlayHistory.current=[];setHelpEntryId(null);setDetail(null);setSheet(null);ownFlights.clearDetail();setFlightRequest(null);setTab('flights');setReplayHintToken(value=>value+1);}} onStatus={()=>openHeaderSheet('status')} returnLabel={helpReturnLabel} helpEnabled={helpEnabled === true} />}
          {sheet === 'development' && <DevelopmentHub onBusyChange={setScreenBusy} onDesignPreview={()=>openHeaderSheet('designPreview')} onPaper={openBooks} profileTools={<SyntheticProfileSettings displayName={library.displayName} nameDraft={profileNameDraft} onNameDraftChange={setProfileNameDraft} busy={library.busy} error={library.error} onSaveName={library.saveDisplayName} onRetry={() => void library.reload()} />} onSelectBook={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => openHeaderSheet('flightLab')} onBooks={() => openHeaderSheet('bookLab')} onImportPreview={() => openHeaderSheet('importPreview')} onCoreFlights={()=>onCoreFlights('options',true,'sources')} />}
          {sheet === 'importPreview' && <ImportPreview session={importPreview} onChange={setImportPreview} onNavigate={() => { overlayOffsets.current.importPreview = 0; overlayScroll.current?.scrollTo({ y: 0, animated: false }); }} />}
          {sheet === 'diagnostics' && <Diagnostics />}
          {sheet === 'backup' && <LibraryBackup onBusyChange={setScreenBusy} />}
          {sheet === 'paper' && <PaperStatus bookName={book?.name ?? null} pending={library.pending} onBooks={() => openHeaderSheet('selectBook')} onBackup={() => openHeaderSheet('backup')} onFlights={() => { overlayHistory.current = []; setDetail(null); setSheet(null); setTab('flights'); }} />}
          {sheet === 'medical' && <MedicalDetails now={now} capture={medical} loading={medicalLoading} needsReload={ownFlights.view?.medicalReadFailed} refreshFailed={lastLoad?.medicalStatus==='failed'} />}
          {detail && <><Section title={detail.registration ?? 'Flugzeug unbekannt'} />{[['Datum', dateText(detail.date)], ['Flugzeugtyp', detail.aircraft_model], ['Abflug', detail.start_place], ['Ankunft', detail.landing_place], ['Start', detail.start], ['Landung', detail.landing], ['Zeitbasis', detail.time_basis], ['Dauer', detail.minutes === null ? null : `${formatDuration(detail.minutes)} h`], ['Rolle', detail.pilot_role], ['Startart', detail.launch], ['Landungen', detail.landings?.toString()], ['Bemerkungen', detail.remarks]].map(([label, value]) => <Card key={label}><Label muted>{label}</Label><Label selectable>{value ?? 'Unbekannt'}</Label></Card>)}<Label muted>Quelle: gespeicherte synthetische Bibliothek · {book?.name}. Distanz und Flugtrack sind nicht verfügbar.</Label></>}
          {sheet === 'selectBook' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 8 }}><Section title="Flugbuch auswählen" />{library.books.map(b => <Action key={b.id} secondary icon={b.id === library.bookId ? 'check' : undefined} onPress={() => { overlayHistory.current = []; setDetail(null); setSheet(null); void library.selectBook(b.id); }}>{b.name}</Action>)}{!library.books.length && <Empty title="Noch kein Flugbuch">Eine vorhandene Sicherung kann in einer neuen lokalen Bibliothek geöffnet werden. Live-Import und neue Produkt-Flugbücher sind noch nicht verfügbar.</Empty>}<Label muted>Gespeicherte synthetische Bibliothek · keine automatische Zuordnung.</Label><Action secondary onPress={() => openHeaderSheet('backup')}>Sicherung & Wiederherstellung</Action></View>}
          {sheet === 'unsupported' && <Empty title="Klassifikation nicht verfügbar">Der gespeicherte Flugvertrag enthält keine Strecken- oder Platzrundenkennzeichnung. Flugzeit, Start-/Zielfeld und Rolle werden dafür nicht als Ersatz interpretiert. Der aktive Filter bleibt erhalten.</Empty>}
          {sheet === 'status' && <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 }}>
            <Card><Section title="Aktueller Stand" />{statusDetails}
              {notice&&<Label>{notice.description}</Label>}
              {ownFlights.phase==='failed'&&<Action secondary disabled={syncRunning||coreFlightsOpen} onPress={()=>void ownFlights.reload()}>Gespeicherte Daten erneut lesen</Action>}
              {syncProgress.message&&<Label>{syncProgress.message}</Label>}
            </Card>
            {updateForOwner && <View style={{ gap: 8 }}><Section title="Letzte Aktualisierung" /><UpdateResult result={updateForOwner} detail /></View>}
            <View style={{ gap: 8 }}><Section title="Gespeicherte Flugdaten" /><ConnectionSummary ownFlights={ownFlights.view} phase={ownFlights.phase}/></View>
            <Card><Section title="Quellen & Grenzen" />
              <Label muted>Eigene Flüge, Medical, unterstützte Dienste, Arbeitsstunden, eigene Aufgaben, sichtbare Termine und Dokumenthinweise werden getrennt gespeichert.</Label>
              <Label muted>Vereinsauszüge zeigen nur erfasste Quellenausschnitte; ihre Vollständigkeit ist ungeprüft. Vereinsnachrichten und AI-Dienst sind noch nicht verbunden. Flugtracks und Distanzen sind nicht verifiziert.</Label>
              <Label muted>Testflugbuch und Papierwerkzeuge bleiben unter Entwicklung getrennt.</Label>
            </Card>
            <Label muted>Neue Daten und Anmeldung erreichst du über Sync in der Kopfzeile.</Label>
            <Action secondary icon="book" onPress={() => openFlightFlow('options','backup')}>Daten sichern & wiederherstellen</Action>
          </View>}
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
    {syncPrompt && <SyncConfirmationDialog onCancel={syncPrompt.cancel} onConfirm={syncPrompt.confirm} />}
  </SafeAreaView>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background }, content: { flex: 1, alignSelf: 'center', width: '100%', maxWidth: 599 },
  page: { flex: 1 }, hidden: { display: 'none' }, canvas: { padding: 12, paddingTop: 6, gap: 12, paddingBottom: 28 }, flightCanvas: { padding: 10, paddingTop: 0, paddingBottom: 20 },
  headerBook: { minHeight: 36, justifyContent: 'center', alignSelf: 'flex-start' },
  stateBanner: { gap: 3, padding: 4, marginTop: 8 }, provenance: { fontSize: 10, lineHeight: 16, color: '#8ba4bc', letterSpacing: .6 },
  metric: { flex: 1, minWidth: 0, alignItems: 'center', gap: 1 }, metricValue: { color: colors.cyan, fontSize: 20, lineHeight: 25, fontWeight: '600' }, metricLabel: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  chips: { gap: 5 }, searchBox: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: '#11263a', paddingHorizontal: 12, gap: 7 }, search: { flex: 1, minHeight: 40, color: colors.text, fontSize: 13, paddingVertical: 4 }, filterButton: { width: 42, minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  statsStrip: { flexDirection: 'row', paddingHorizontal: 6, paddingVertical: 10, gap: 3, minHeight: 66 }, flightRow: { padding: 7, borderRadius: 13, gap: 3 }, flightDate: { fontSize: 12, lineHeight: 17, fontWeight: '600' }, noTrack: { width: 64, minHeight: 64, backgroundColor: '#10282d', borderRadius: 9, justifyContent: 'center', alignItems: 'center' }, badge: { borderRadius: 12, borderWidth: 1, borderColor: '#227f87', paddingHorizontal: 7, backgroundColor: '#064240' },
  clubBody: { gap: 8 }, clubBodyWide: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' }, clubHalf: { width: '49.2%' }, duty: { padding: 0 }, clubSectionCard: { width: '100%', backgroundColor: colors.background, experimental_backgroundImage: 'none', borderColor: '#152d42' }, dutyAction: { minHeight: 48, justifyContent: 'center', alignSelf: 'flex-start' }, dutyActionFace: { minHeight: 34, borderRadius: 17, backgroundColor: colors.blue, justifyContent: 'center', paddingHorizontal: 16 },
  aiBody: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 18 }, welcome: { backgroundColor: colors.card, borderColor: colors.border, minHeight: 126, gap: 7 }, aiBadge: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: '#78efdc' },
  questionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, question: { minHeight: 86, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 16, paddingRight: 18, backgroundColor: colors.card, justifyContent: 'center' }, questionArrow: { position: 'absolute', right: 8, top: '40%', color: colors.muted, fontSize: 23 },
  composer: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, borderRadius: 20, padding: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }, messageInput: { flex: 1, minHeight: 52, maxHeight: 150, color: colors.text, fontSize: 16, paddingHorizontal: 8 }, send: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.blue }, recent: { borderTopWidth: 1, borderTopColor: '#1b344a', paddingTop: 10, gap: 8 },
  nav: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background, padding: 6, gap: 2, alignSelf: 'center', width: '100%', maxWidth: 599 }, navWrap: { flexWrap: 'wrap', justifyContent: 'center' }, navItemWrap: { flex: 0, width: '32%' }, navItem: { flex: 1, minHeight: 60, justifyContent: 'center', alignItems: 'center', paddingVertical: 8, gap: 4, borderRadius: 16 }, navIcon: { fontSize: 25, lineHeight: 29, color: colors.muted }, navSelected: {backgroundColor: colors.raised,borderWidth:1,borderColor:colors.border}, navLabel: { fontSize: 12, textAlign: 'center', width: '100%', lineHeight: 18, color: colors.muted }, active: { color: colors.cyan, fontWeight: '700' }, activeLine: { height: 2, width: 24, backgroundColor: colors.cyan, position: 'absolute', top: 0, borderRadius: 2 },
  modal: { backgroundColor: colors.background },
});

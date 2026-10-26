import * as startTiming from '../../apps/platform-lab/src/start-timing.ts';
import { syncStatus } from '../../apps/platform-lab/src/mobile/sync-status.ts';
import { createSyncConfirmation } from '../../apps/platform-lab/src/mobile/sync-confirmation.ts';
import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import * as syncProgress from '../../apps/platform-lab/src/mobile/sync-progress.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { medicalSource } from '../../apps/platform-lab/src/mobile/medical-source.ts';
import { ownFlightConnectionState } from '../../apps/platform-lab/src/mobile/connection-guidance.ts';
import * as dutyModel from '../../apps/platform-lab/src/vereinsflieger/duties';
const unknownProviderStatus={connection:{phase:'unknown',confirmed:false,observed:null,lastCheckedAt:null},browserActive:false};
import { dataUpdateStatus, DATA_FRESHNESS_REMINDER_MS, DATA_UPDATE_FRESH_MS } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { SESSION_DISPLAY_FRESH_MS, createSessionPresentation } from '../../apps/platform-lab/src/mobile/data-update-presentation.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy';

interface Element { type: unknown; props: Record<string, any>; children: unknown[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/MobileApp.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

// Real shell state and handlers, with native leaves and the independent data /
// provider services replaced. These checks make no native-layout claim.
function fixture(width = 390, fontScale = 1, root = false) {
  let index = 0;
  const hooks: any[] = [], effects: (() => void)[] = [];
  const react = {
    createElement: (type: unknown, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity).map(child=>type==='UpdateDialog'&&typeof child==='function'?child(40):child) }),
    useRef(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useState(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = typeof initial==='function'?(initial as ()=>unknown)():initial; return [hooks[i], (value: unknown) => { hooks[i] = typeof value==='function'?(value as (old:unknown)=>unknown)(hooks[i]):value; }]; },
    useMemo(make:()=>unknown,deps:unknown[]) { const i=index++,previous=hooks[i];if(!previous||deps.some((v,n)=>v!==previous.deps[n]))hooks[i]={deps,value:make()};return hooks[i].value; },
    useEffect(effect: () => void, deps: unknown[]) {
      const i = index++, previous = hooks[i];
      if (!previous || deps.some((v, n) => v !== previous[n])) { hooks[i] = deps; effects.push(effect); }
    },
  };
  const flight = { id: 'synthetic-flight', registration: 'D-SYN', date: '2026-10-18', minutes: 30 };
  const library = { flights: [flight], books: [{ id: 'synthetic-book', name: 'Synthetic book' }], bookId: 'synthetic-book', pending: 0, displayName: 'Synthetic pilot' };
  const controller = { visible: false, informationCaptures: [], connection: { phase: 'unknown' }, refreshRecovery: () => calls.push('refresh-recovery'), dismissLogin() {}, backWithinProvider: () => false, suspendBrowserForOwnerSwitch: () => true };
  const calls: string[] = [];
  const dialogs:any[]=[];
  const coreRoutes: {intent:string;developmentRecoveryCheckpoints:boolean}[] = [];
  const destinations:string[]=[];
  const readEnabled:boolean[]=[];
  let persistedHelp = true, failHelpSave = false;
  let suspended = false;
  let clockNow=Date.UTC(2026,9,22,12),clockDeadlines:readonly number[]=[];
  let providerStatus:any=unknownProviderStatus, lastLoad:any=null, ownView:any=null, appStateListener:((state:string)=>void)|undefined;
  Object.assign(controller, { connect: () => calls.push('connect'), checkConnection: () => calls.push('check'), retrieve: () => calls.push('retrieve') });
  let hardwareBack: () => boolean;
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = { '../start-timing': startTiming,
    react: { default: react, ...react },
    'react-native': { ...leaves(['ActivityIndicator', 'FlatList', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'StatusBar', 'Text', 'TextInput', 'View']),
      Alert: {alert:(title:string,message:string,buttons:any[],options:any)=>dialogs.push({title,message,buttons,options})},
      Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
      AppState: { addEventListener: (_:string,handler:(state:string)=>void) => {appStateListener=handler;return {remove(){}};} },
      BackHandler: { addEventListener: (_: string, handler: () => boolean) => { hardwareBack = handler; return { remove() {} }; } },
      Linking: {}, Platform: { OS: 'android' }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
      useWindowDimensions: () => ({ width, height: 900, fontScale }),
    },
    'react-native-safe-area-context': leaves(['SafeAreaProvider', 'SafeAreaView']),
    '../App': { default: 'LabApp' }, '../BookLab': { BookLab: 'BookLab' },
    '@moflight/flight-logbook': { canonical },
    './SyncStatusDetails':{SyncStatusDetails:'SyncStatusDetails'},'./sync-progress':syncProgress,'./SyncProgress':{SyncProgress:'SyncProgress'},
    './theme': { ...leaves(['Action', 'Card', 'Chip', 'ClubMark', 'Empty', 'GliderMark', 'IconLabel', 'Label', 'Photo', 'Section']), colors: {}, ui: {} },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
    './use-library': { useLibrary: (value: boolean) => { suspended = value; return library; } },
    './flight-model': { flightYears: () => [2026], selectFlights: () => library.flights, summarizeFlights: () => ({ count: 1, knownMinutes: 30 }), formatDuration: () => '0:30' },
    './local-insights': { localQuestions: [], localInsight: () => '' },
    './Dashboard': { Dashboard: 'Dashboard' }, './StatisticsOverlay': { StatisticsOverlay: 'StatisticsOverlay' }, './ShellIcons': leaves(['PlaneIcon', 'ProfileIcon', 'BookIcon']),
    './AiChatRoute':leaves(['AiChatRoute']), '../ai/workspace-native':{openAiWorkspaceNative:async()=>null}, '../ai/answer-navigation':{aiAnswerFlightIds:()=>[]},
    './DesignPreview':leaves(['DesignPreview']),'./Diagnostics': leaves(['Diagnostics']), './diagnostics-native': {initializeDiagnostics() {}}, '../diagnostics': diagnostics,
    './ProfileSettings': { ProfileSettings: 'ProfileSettings', SyntheticProfileSettings:'SyntheticProfileSettings' }, '../book-storage': { PILOT: 'synthetic-pilot' },
    './HelpScreen': { HelpScreen: 'HelpScreen' },
    './help-preferences-native': { readContextHelpEnabled: async () => persistedHelp, saveContextHelpEnabled: async (enabled:boolean) => { if (failHelpSave) return false; persistedHelp=enabled; return true; } },
    '../vereinsflieger/use-access-controller': { useAccessController: () => controller },
    './ProviderConnection': {...leaves(['ProviderConnection', 'ConnectionIndicator']),unknownProviderStatus}, './DataUpdateIndicator':leaves(['DataUpdateIndicator']), './UpdateDialog':leaves(['UpdateDialog']), './data-freshness':{DATA_FRESHNESS_REMINDER_MS,DATA_UPDATE_FRESH_MS,dataUpdateStatus}, './AppHeader': { AppHeader: 'AppHeader' },
    './MedicalStatus': leaves(['MedicalIndicator', 'MedicalDetails']), './OverviewTiles':leaves(['OverviewTiles']),
    './DevelopmentHub': leaves(['DevelopmentHub', 'DevelopmentNotice']),
    './LibraryBackup': leaves(['LibraryBackup']), './PaperStatus': leaves(['PaperStatus']),
    './ImportPreview': leaves(['ImportPreview']),
    './CoreFlightFoundation': leaves(['CoreFlightFoundation']),
    './OwnFlights': leaves(['OwnFlights']),
    './use-own-flights': { useOwnFlights: (_ports:unknown,active:boolean) => {readEnabled.push(active);return { view: ownView, phase: ownView?'ready':'missing', detail:null, detailBusy:false, detailError:null, openDetail:async()=>{}, clearDetail:()=>calls.push('clear-own-flight-detail'), reload:async()=>{} };} },
    './own-flight-reader-native': { ownFlightReadPorts: {} },
    './UpdateResult':leaves(['UpdateResult']), './ClubInformation':leaves(['ClubEvents','ClubDocumentNotices']),
    './ConnectionSummary': leaves(['ConnectionSummary']), './medical-source': { medicalSource },
    './connection-guidance': { ownFlightConnectionState },
    './data-update-presentation': { SESSION_DISPLAY_FRESH_MS, createSessionPresentation },
    './StatusBadge':leaves(['StatusBadge']),'./sync-status':{syncStatus},'./sync-confirmation':{createSyncConfirmation},
    '../vereinsflieger/duties': dutyModel, './DutyRoster':leaves(['DutyRoster']), './ClubHeading':leaves(['ClubHeading']),
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},
    './use-start-clock':{useStartClock:(deadlines:readonly number[])=>{clockDeadlines=deadlines;return clockNow;},useReminderSnooze:()=>({snooze:null,error:false,save:()=>{}})},
  };
  const exports = {} as { Shell: () => Element };
  runInNewContext(source + '\nexports.Shell = Shell;', { exports, require: (name: string) => {
    if (name.startsWith('../../assets/')) return name;
    assert.ok(name in modules, name); return modules[name];
  } });
  let tree: Element;
  function render() { index = 0; tree = root?(exports as any).default():(exports.Shell as (props:unknown)=>Element)({lastLoad,providerStatus,onCoreFlights:(intent='connect',developmentRecoveryCheckpoints=false,destination='settings')=>{destinations.push(destination);coreRoutes.push({intent,developmentRecoveryCheckpoints});calls.push(intent==='update'?'core-load':intent==='development'?'core-development-route':intent==='options'?'core-library-route':'core-connect');}}); effects.splice(0).forEach(effect => effect()); return tree; }
  function nodes() {
    const found: Element[] = [];
    const visit = (value: unknown) => { if (value && typeof value === 'object' && 'children' in value) { const node = value as Element; found.push(node); node.children.forEach(visit); if (node.type === 'AppHeader') visit(node.props.profile); if (node.type === 'FlatList') visit(node.props.ListHeaderComponent); } };
    visit(tree); return found;
  }
  function find(type: string, label?: string) {
    const node = nodes().find(n => n.type === type && (!label || n.props.accessibilityLabel === label)); assert.ok(node, `${type}: ${label}`); return node;
  }
  function headers() { return nodes().filter(n => n.type === 'AppHeader'); }
  function parent(node: Element) { return nodes().find(n => n.children.includes(node))!; }
  function press(type: string, label?: string) { find(type, label).props.onPress(); render(); }
  function openOwnDetail() {
    find('OwnFlights').props.onHeaderChange({ title: 'Flugdetails', back: () => {
      find('OwnFlights').props.onHeaderChange({ title: 'Flüge' });
    } });
    render();
  }
  render(); render();
  return { dialogs, confirm:()=>{dialogs.at(-1).buttons.find((b:any)=>b.text==='Starten').onPress();render();}, render, nodes, find, resize:(nextWidth:number,nextFontScale:number)=>{width=nextWidth;fontScale=nextFontScale;render();}, headers, parent, press, openOwnDetail, flight, library, controller, calls, coreRoutes,destinations, readEnabled, suspended: () => suspended, hardwareBack: () => hardwareBack!(),
    helpPreference:()=>persistedHelp, failHelpSaving:(value:boolean)=>{failHelpSave=value;},
    showLoad:(result:any,view:any)=>{providerStatus=result?.verifiedConnection?{...unknownProviderStatus,ownerId:result.verifiedConnection.ownerId,connection:result.verifiedConnection.state}:unknownProviderStatus;lastLoad=result;ownView=view;render();render();},
    setProviderStatus:(status:any)=>{providerStatus=status;render();render();},
    setTime:(time:number)=>{clockNow=time;render();}, clockDeadlines:()=>clockDeadlines,
    appState:(state:string)=>{if(state!=='active')providerStatus=unknownProviderStatus;appStateListener?.(state);render();} };
}

test('Profile switch gates contextual Help while retaining manual Help and handles save failure', async () => {
  const f=fixture();await Promise.resolve();f.render();
  f.press('Pressable','Profil & Einstellungen öffnen');
  assert.equal(f.find('ProfileSettings').props.helpEnabled,true);
  f.find('ProfileSettings').props.onToggleHelp();await new Promise(resolve=>{ setImmediate(resolve); });f.render();
  assert.equal(f.helpPreference(),false);
  assert.equal(f.find('ProfileSettings').props.helpEnabled,false);
  assert.equal(f.find('OwnFlights').props.helpEnabled,false);
  f.find('ProfileSettings').props.onHelp();f.render();
  assert.equal(f.find('HelpScreen').props.helpEnabled,false);
  f.find('HelpScreen').props.onReturn();f.render();
  f.failHelpSaving(true);f.find('ProfileSettings').props.onToggleHelp();await new Promise(resolve=>{ setImmediate(resolve); });f.render();
  assert.equal(f.find('ProfileSettings').props.helpEnabled,false);
  assert.equal(f.find('ProfileSettings').props.helpError,true);
  f.failHelpSaving(false);f.find('ProfileSettings').props.onToggleHelp();await new Promise(resolve=>{ setImmediate(resolve); });f.render();
  assert.equal(f.helpPreference(),true);
  assert.equal(f.find('OwnFlights').props.helpEnabled,true);
});

test('offline Help nests under Profile and flight routes; Back restores prior state without provider work',()=>{
  const f=fixture();
  f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Unsaved profile draft');f.render();
  f.find('ProfileSettings').props.onHelp();f.render();
  assert.equal(f.headers().at(-1)!.props.title,'Hilfe & Einführung');
  assert.equal(f.find('HelpScreen').props.entryId,null);
  assert.deepEqual(f.coreRoutes,[]);
  f.find('HelpScreen').props.onEntry('pic');f.render();
  assert.equal(f.find('HelpScreen').props.entryId,'pic');
  f.hardwareBack();f.render();assert.equal(f.find('HelpScreen').props.entryId,null);
  f.find('HelpScreen').props.onEntry('empty-flights');f.render();
  f.find('HelpScreen').props.onStatus();f.render();
  assert.equal(f.headers().at(-1)!.props.title,'Verbindung & Datenstatus');
  f.hardwareBack();f.render();assert.equal(f.find('HelpScreen').props.entryId,'empty-flights');
  f.find('HelpScreen').props.onReturn();f.render();
  assert.equal(f.find('ProfileSettings').props.nameDraft,'Unsaved profile draft');
  assert.deepEqual(f.coreRoutes,[]);
  f.headers().at(-1)!.props.back();f.render();
  f.press('Pressable','Flüge');
  f.find('OwnFlights').props.onHelp('pic');f.render();
  assert.equal(f.find('HelpScreen').props.returnLabel,'Zurück zu Flüge');
  f.find('HelpScreen').props.onReturn();f.render();
  assert.equal(f.find('OwnFlights').props.active,true);
  assert.deepEqual(f.coreRoutes,[]);
});

test('header age comes from the selected saved retrieval independently of provider session and failed updates',()=>{
  const f=fixture();
  const now=Date.UTC(2026,9,22,12),at=new Date(now-20*60_000).toISOString();
  const state={phase:'observed',confirmed:true,lastCheckedAt:new Date(now).toISOString(),observed:{accountNumber:'101',clubLabel:'Synthetic',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
  const result={added:0,changed:0,pending:0,verifiedConnection:{ownerId:'real-owner',state}};
  const view={snapshot:{ownerId:'real-owner',account:{accountRef:'101'},savedRetrievals:[{from:'2026-01-01',to:'2026-10-22',retrievedAt:at,savedAt:at}]}};
  const status=()=>dataUpdateStatus(f.find('DataUpdateIndicator').props.receivedAt,'ready',f.find('DataUpdateIndicator').props.now);
  f.showLoad(result,view);
  assert.equal(status().state,'fresh');assert.equal(status().caption,'vor 20 Min.');
  assert.ok(f.clockDeadlines().includes(Date.parse(at)+DATA_UPDATE_FRESH_MS),'The existing local clock schedules the exact one-hour transition');
  assert.ok(f.clockDeadlines().includes(Date.parse(at)+DATA_FRESHNESS_REMINDER_MS+1),'Advice starts strictly after the 72-hour boundary');
  assert.ok(f.clockDeadlines().includes(now+SESSION_DISPLAY_FRESH_MS),'A pending check cannot display proof indefinitely');
  assert.ok(f.find('DataUpdateIndicator').props.scopeKey.includes('real-owner'));
  f.setTime(now+40*60_000);assert.equal(status().state,'older');f.setTime(now);
  f.press('Pressable','Profil & Einstellungen öffnen');
  const summary=f.find('ProfileSettings').props.connectionSummary;
  assert.equal(summary.children.find((n:Element)=>n.type==='SyncStatusDetails').props.connection.lastCheckedAt,state.lastCheckedAt);
  assert.equal(summary.children.find((n:Element)=>n.type==='ConnectionSummary').props.controller.connection.lastCheckedAt,state.lastCheckedAt);
  f.headers().at(-1)!.props.back();f.render();
  assert.deepEqual(f.calls,[]);
  f.appState('background');f.appState('active');
  assert.equal(status().state,'fresh','Losing live provider proof does not age saved data');
  f.showLoad(null,view);
  assert.equal(f.find('DataUpdateIndicator').props.receivedAt,at,'Failed or cancelled updates cannot renew the saved timestamp');
  const older='2026-10-20T12:00:00.000Z';
  f.showLoad(result,{snapshot:{ownerId:'other-owner',account:{accountRef:'102'},savedRetrievals:[{from:'2026-01-01',to:'2026-10-20',retrievedAt:older,savedAt:older}]}});
  assert.equal(status().state,'older');assert.equal(status().caption,'vor 2 Tg.','Owner/account switch uses its own saved record');
  f.showLoad(result,{snapshot:{ownerId:'new-owner',account:{accountRef:'103'}}});
  assert.equal(status().state,'unknown','Login proof alone cannot make data fresh');
  f.showLoad(null,null);assert.equal(status().state,'unknown');
});

test('Medical header and details use the real selected library projection rather than legacy information',()=>{
  const f=fixture();
  const medical={id:'real-medical',owner:'real-owner',rows:[{values:['Klasse 2','31.12.2027']}]};
  Object.assign(f.controller,{informationCaptures:[{id:'legacy-medical',owner:'synthetic-pilot',category:'medical'}]});
  f.showLoad(null,{snapshot:{ownerId:'real-owner',account:{accountRef:'101'}},medical});
  assert.equal(f.find('OverviewTiles').props.medical,medical);
  f.find('OverviewTiles').props.onMedical();f.render();assert.equal(f.find('MedicalDetails').props.capture,medical);
  f.showLoad(null,null);assert.equal(f.find('OverviewTiles').props.medical,null);
});

test('app headers retain Data and Medical with a separate profile action on every tab', () => {
  const f = fixture();
  for (const title of ['Übersicht', 'Flüge', 'Flugbuch', 'Verein', 'AI']) {
    f.press('Pressable', title);
    const controls = f.nodes().filter(n => n.type === 'DataUpdateIndicator' || n.type === 'MedicalIndicator' || n.props.accessibilityLabel === 'Profil & Einstellungen öffnen');
    assert.deepEqual(controls.map(n => n.type), ['DataUpdateIndicator', 'Pressable']);
    assert.equal(f.headers()[0]!.props.profile, controls[1], 'Profile stays in the header’s dedicated upper-right slot');
  }
  assert.deepEqual(f.calls, []);
});

test('only the header starts update/login; other pages retain guidance and offline backup', () => {
  const f=fixture();
  assert.equal(f.nodes().some(n=>n.type==='ConnectionSummary'),false,'Start has no permanent connection introduction');
  assert.equal(f.find('OwnFlights').props.onUpdate,undefined);
  f.press('Pressable','Profil & Einstellungen öffnen');
  assert.equal(typeof f.find('ProfileSettings').props.onConnections,'function');
  const summary=f.find('ProfileSettings').props.connectionSummary as Element;
  assert.equal(summary.props.onUpdate,undefined);assert.equal(summary.props.onOpen,undefined);
  f.find('ProfileSettings').props.onTools();f.render();
  assert.equal(f.find('DevelopmentHub').props.onProvider,undefined);
  assert.deepEqual(f.calls,[]);
  f.press('DataUpdateIndicator');f.confirm();assert.deepEqual(f.calls,['core-load']);
});

test('synthetic import preview opens without seeding or provider work, retains its session and returns to the same detail', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.openOwnDetail();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onTools(); f.render();
  f.find('DevelopmentHub').props.onImportPreview(); f.render();
  assert.equal(f.find('ImportPreview').props.session, null);
  assert.equal(f.suspended(), false);
  assert.equal(f.headers().at(-1)!.props.title, 'Importvorschau');
  const session = { synthetic: 'confirmed preview only' };
  f.find('ImportPreview').props.onChange(session); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  f.find('DevelopmentHub').props.onImportPreview(); f.render();
  assert.deepEqual(f.find('ImportPreview').props.session, session);
  f.headers().at(-1)!.props.back(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  assert.deepEqual(f.calls, []);
});

test('Start paper tile uses the existing product tab without duplicate sheet or synthetic progress',()=>{
  const f=fixture();f.find('Dashboard').props.onPaper();f.render();
  assert.equal(f.nodes().some(n=>n.type==='PaperStatus'),false);
  assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Dein Papierflugbuch'));
  assert.equal(f.headers().at(-1)!.props.title,'Flugbuch');assert.deepEqual(f.calls,[]);
  f.hardwareBack();f.render();assert.equal(f.headers().at(-1)!.props.title,'Übersicht');
});

test('Medical opens without provider work and returns through nested overlays', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.find('OwnFlights').props.onHeaderChange({title:'Flugfilter',back:()=>{}}); f.render();
  f.find('OverviewTiles').props.onMedical();f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  assert.ok(f.find('MedicalDetails'));
  assert.ok(f.find('MedicalDetails'));
  f.press('DataUpdateIndicator');f.confirm();
  f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers()[0]!.props.title, 'Flugfilter');
  assert.deepEqual(f.calls, ['core-load']);
});

test('details and sheets retain one active header; profile Back restores details and tab state', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.openOwnDetail();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  assert.equal(f.headers().length, 1);
  assert.equal(f.parent(f.headers()[0]!).props.accessibilityElementsHidden, false);
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  assert.equal(f.headers().at(-1)!.props.title, 'Profil & Einstellungen');
  assert.equal(f.parent(f.headers()[0]!).props.accessibilityElementsHidden, true);
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().length, 1);
  assert.equal(f.headers()[0]!.props.title, 'Flüge');
  assert.equal(f.parent(f.headers()[0]!).props.accessibilityElementsHidden, false);
});

test('header data update opens the combined flow after confirmation and preserves the invoking sheet', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Retained draft');f.render();
  f.press('DataUpdateIndicator');f.confirm();
  assert.deepEqual(f.coreRoutes,[{intent:'update',developmentRecoveryCheckpoints:false}]);
  assert.equal(f.find('ProfileSettings').props.nameDraft,'Retained draft');
  assert.equal(f.nodes().some(n=>n.type==='ProviderConnection'),false,'The shell cannot create a competing browser');
});

test('synthetic book changes preserve independent own-flight details through profile Back', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.openOwnDetail();
  const ownFlights = f.find('OwnFlights');
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.library.bookId = 'different-synthetic-book'; f.render(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().length, 1);
  assert.equal(f.headers()[0]!.props.title, 'Flugdetails');
  assert.equal(f.find('OwnFlights').props.reloadKey, ownFlights.props.reloadKey);
  assert.equal(f.find('OwnFlights').props.active, true);
  f.headers()[0]!.props.back(); f.render();
  assert.equal(f.headers()[0]!.props.title, 'Flüge');
});

test('shell Back remains contextual after requesting the shared connection', () => {
  const f=fixture();f.press('Pressable','Flüge');f.openOwnDetail();
  f.press('Pressable','Profil & Einstellungen öffnen');f.press('DataUpdateIndicator');f.confirm();
  assert.equal(f.headers().at(-1)!.props.title,'Profil & Einstellungen');
  f.hardwareBack();f.render();assert.equal(f.headers().at(-1)!.props.title,'Flugdetails');
});

test('ordinary paper is deferred while Development retains synthetic paper and backup without launching experiments', () => {
  const f = fixture();
  assert.equal(f.nodes().some(n => n.props.accessibilityLabel === 'Flugworkflow öffnen'), false);
  f.press('Pressable','Flugbuch');assert.ok(f.nodes().some(n=>n.props.testID==='paper-flights-entry'));
  assert.equal(f.nodes().some(n=>n.props.testID==='paper-assistant-entry'),false);
  f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onTools();f.render();f.find('DevelopmentHub').props.onPaper();f.render();
  assert.ok(f.find('PaperStatus'));
  assert.equal(f.nodes().some(n => n.type === 'BookLab' || n.type === 'LabApp'), false);
  f.find('PaperStatus').props.onBackup(); f.render();
  assert.ok(f.find('LibraryBackup')); assert.equal(f.suspended(), true);
  f.headers().at(-1)!.props.back(); f.render();
  assert.ok(f.find('PaperStatus')); assert.equal(f.suspended(), false);
  f.headers().at(-1)!.props.back(); f.render();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onBooks(); f.render();
  assert.equal(f.nodes().some(n => n.type === 'BookLab' || n.type === 'LabApp'), false);
  assert.deepEqual(f.calls, []);
});

test('Development is read-only on entry; proof work guards Back and a reload preserves prior details/filter', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  const ownFlights = f.find('OwnFlights');
  f.openOwnDetail();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onTools(); f.render();
  assert.ok(f.find('DevelopmentHub')); assert.equal(f.suspended(), false);
  assert.equal(f.nodes().some(n => n.type === 'LabApp' || n.type === 'BookLab'), false);
  assert.deepEqual(f.calls, []);
  f.find('DevelopmentHub').props.onFlights(); f.render();
  const lab = f.find('LabApp');
  assert.equal(lab.props.providerOwned, true); assert.equal(lab.props.embedded, true);
  assert.equal(f.suspended(), true);
  lab.props.onBusyChange(true); f.render();
  assert.equal(f.headers().at(-1)!.props.backDisabled, true);
  assert.equal(f.hardwareBack(), true); f.render();
  assert.ok(f.find('LabApp'));
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  assert.ok(f.find('LabApp'));
  lab.props.onBusyChange(false); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.ok(f.find('DevelopmentHub')); assert.deepEqual(f.calls, []);
  f.library.flights = [...f.library.flights]; f.render(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.ok(f.find('ProfileSettings'));
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.find('OwnFlights').type, ownFlights.type);
});

test('Development has offline library tools while update/login remains on the header', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onTools();f.render();
  assert.equal(f.find('DevelopmentHub').props.onProvider,undefined);
  f.find('DevelopmentHub').props.onCoreFlights();f.render();f.press('DataUpdateIndicator');f.confirm();
  assert.deepEqual(f.coreRoutes,[{intent:'options',developmentRecoveryCheckpoints:true},{intent:'update',developmentRecoveryCheckpoints:false}]);
});

test('ordinary backup cannot request a provider entry', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onBackup();
  assert.deepEqual(f.coreRoutes,[{intent:'options',developmentRecoveryCheckpoints:false}]);
  f.find('ProfileSettings').props.onConnections();assert.equal(f.coreRoutes.at(-1)!.intent,'options');
});

test('advanced library tools retain the Profile draft without a browser handoff', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Retained draft');f.render();f.find('ProfileSettings').props.onTools();f.render();
  f.find('DevelopmentHub').props.onCoreFlights();
  assert.deepEqual(f.coreRoutes,[{intent:'options',developmentRecoveryCheckpoints:true}]);
  f.headers().at(-1)!.props.back();f.render();assert.equal(f.find('ProfileSettings').props.nameDraft,'Retained draft');
});

test('nested settings preserve the unsaved profile draft and each sheet scroll offset', () => {
  const f = fixture();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Unsaved synthetic draft'); f.render();
  const scroll = () => f.nodes().filter(n => n.type === 'ScrollView' && n.props.onScroll).at(-1)!;
  scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 320 } } });
  f.find('ProfileSettings').props.onTools(); f.render();
  assert.equal(scroll().props.contentOffset.y, 0);
  scroll().props.onScroll({ nativeEvent: { contentOffset: { y: 80 } } });
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(scroll().props.contentOffset.y, 320);
  assert.equal(f.find('ProfileSettings').props.nameDraft, 'Unsaved synthetic draft');
  assert.equal(f.library.displayName, 'Synthetic pilot');
  f.find('ProfileSettings').props.onTools(); f.render();
  assert.equal(scroll().props.contentOffset.y, 80);
  assert.deepEqual(f.calls, []);
});

 test('ordinary flights shares the shell reader, routes explicit updates safely and handles nested Back', () => {
  const f=fixture();f.press('Pressable','Flüge');
  assert.equal(f.find('OwnFlights').props.active,true);
  assert.ok(f.nodes().some(n=>n.type==='Label' && n.children.some((child:any)=>typeof child==='string'&&child.includes('Entwicklungsversion'))));
  assert.equal(f.nodes().some(n=>n.type==='Label' && n.children.includes('Entwicklung · synthetische lokale Bibliothek')),false);
  assert.equal(f.nodes().some(n=>n.type==='FlatList'),false);

  assert.equal(f.find('OwnFlights').props.onUpdate,undefined);f.press('DataUpdateIndicator');f.confirm();assert.deepEqual(f.calls,['core-load']);
  let back=0;f.find('OwnFlights').props.onHeaderChange({title:'Flugdetails',back:()=>back++});f.render();
  assert.equal(f.headers()[0]!.props.title,'Flugdetails');f.hardwareBack();assert.equal(back,1);
  f.press('Pressable','Verein');assert.equal(f.find('OwnFlights').props.active,false);
 });

test('Start offers the general Flüge route without provider work', () => {
  const f=fixture();
  f.find('Dashboard').props.onFlights();f.render();assert.equal(f.find('OwnFlights').props.active,true);
  f.press('Pressable','Flüge');
  assert.equal(f.find('OwnFlights').props.active,true);
  assert.deepEqual(f.calls,[]);
  assert.ok(f.readEnabled.every(Boolean), 'Tab changes must not suspend or restart the reader');
});

test('Meine Saison opens a framed local statistics overlay whose Back first restores its internal route',()=>{
 const f=fixture(390);f.find('Dashboard').props.onStatistics();f.render();
 const overlay=f.find('StatisticsOverlay');
 assert.equal(f.headers().at(-1)!.props.title,'Flugstatistik');
 assert.equal(overlay.props.data.phase,'missing');assert.equal(typeof overlay.props.onBackHandler,'function');
 assert.equal(f.parent(overlay).type,'KeyboardAvoidingView');
 const shell=f.nodes().find(n=>n.type==='View'&&n.props['aria-hidden']===true)!;
 assert.equal(shell.props.pointerEvents,'none');assert.equal(shell.props.style.some((item:any)=>item?.opacity===.8),true,'Underlying Start remains mounted and lightly dimmed beneath the C08 scrim');
 overlay.props.onBackHandler(()=>true);f.headers().at(-1)!.props.back();f.render();assert.ok(f.find('StatisticsOverlay'),'Inner detail/filter route remains open after contextual Back');
 f.find('StatisticsOverlay').props.onBackHandler(()=>false);f.headers().at(-1)!.props.back();f.render();
 assert.equal(f.nodes().some(n=>n.type==='StatisticsOverlay'),false);assert.ok(f.calls.includes('clear-own-flight-detail'));
 assert.deepEqual(f.coreRoutes,[]);
});

test('tab round trips retain the same shell flight projection for Start and flights',()=>{
  const f=fixture();const view={snapshot:{ownerId:'owner-a',account:{accountRef:'account-a'}},flights:[]};
  f.showLoad(null,view);
  for(let i=0;i<3;i++){
    const list=f.find('OwnFlights');assert.equal(list.props.data.view,view);
    assert.equal(f.find('Dashboard').props.ownFlights,view);
    f.press('Pressable','Flüge');f.render();
    assert.equal(f.find('OwnFlights').props.data.view,view);
    assert.equal(f.hardwareBack(),true);f.render();
    assert.equal(f.find('Dashboard').props.ownFlights,view);
  }
  assert.deepEqual(f.calls,[]);
  assert.ok(f.readEnabled.every(Boolean), 'Tab changes must not suspend or restart the reader');
});


test('Settings exposes a separate Diagnostics screen and contextual Back preserves profile draft',()=>{
  const f=fixture(); f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Unsaved private name'); f.render();
  f.find('ProfileSettings').props.onDiagnostics(); f.render();
  assert.ok(f.find('Diagnostics')); assert.equal(f.headers().at(-1)!.props.title,'Diagnose');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.find('ProfileSettings').props.nameDraft,'Unsaved private name');
  assert.ok(!diagnostics.diagnosticJournal.export().includes('Unsaved private name'));
});


test('actual nested Settings routes preserve the observed action and Back path without storing a draft',()=>{
 diagnostics.diagnosticJournal.clear();const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onNameDraftChange('Secret private name');f.render();
 f.find('ProfileSettings').props.onDiagnostics();f.render();f.headers().at(-1)!.props.back();f.render();
 const events=diagnostics.diagnosticJournal.journey();assert.ok(events.some(e=>e.kind==='screen'&&e.target==='profile'));assert.ok(events.some(e=>e.kind==='screen'&&e.target==='diagnostics'));assert.ok(events.some(e=>e.kind==='back'&&e.target==='diagnostics'));assert.ok(!diagnostics.diagnosticJournal.export().includes('Secret private name'));
});

test('ordinary backup opens real-flight options and Development retains synthetic profile drafts and separate backup',()=>{
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onBackup();assert.deepEqual(f.calls,['core-library-route']);
  f.find('ProfileSettings').props.onTools();f.render();
  let profile=f.find('DevelopmentHub').props.profileTools as Element;
  assert.equal(profile.type,'SyntheticProfileSettings');profile.props.onNameDraftChange('Development draft');f.render();
  f.find('DevelopmentHub').props.onBackup();f.render();assert.ok(f.find('LibraryBackup'));
  f.headers().at(-1)!.props.back();f.render();
  profile=f.find('DevelopmentHub').props.profileTools as Element;assert.equal(profile.props.nameDraft,'Development draft');
  f.headers().at(-1)!.props.back();f.render();f.find('ProfileSettings').props.onTools();f.render();
  assert.equal((f.find('DevelopmentHub').props.profileTools as Element).props.nameDraft,'Development draft');
  assert.equal(f.library.displayName,'Synthetic pilot');
});

test('font and width changes preserve every navigation destination, selected state and truthful version provenance',()=>{
  const f=fixture();f.press('Pressable','Flugbuch');
  const tabs=()=>f.nodes().filter(n=>n.props.accessibilityRole==='tab');
  for(const [width,fontScale] of [[360,1.6],[390,1.6],[412,1.6],[390,1],[600,1.6],[840,1]] as const){
    f.resize(width,fontScale);
    const items=tabs();assert.deepEqual(items.map(n=>n.props.accessibilityLabel),['Übersicht','Flüge','Flugbuch','Verein','AI']);
    assert.equal(items.filter(n=>n.props.accessibilityState.selected).length,1);
    assert.equal(items.find(n=>n.props.accessibilityState.selected)!.props.accessibilityLabel,'Flugbuch');
    for(const item of items){
      const label=item.children.find((n:any)=>n?.type==='Text') as Element;
      assert.equal(label.children[0],item.props.accessibilityLabel);assert.notEqual(label.props.allowFontScaling,false);assert.equal(label.props.numberOfLines,undefined);
    }
    f.press('Pressable','Flüge');
    assert.equal(f.find('OwnFlights').props.active,true);
    assert.equal(tabs().find(n=>n.props.accessibilityState.selected)!.props.accessibilityLabel,'Flüge');
    f.press('Pressable','Flugbuch');
  }
  assert.ok(f.nodes().some(n=>n.type==='Label'&&n.children.some((child:any)=>typeof child==='string'&&child.includes('Entwicklungsversion'))));
  assert.equal(f.nodes().some(n=>n.type==='Label'&&n.children.includes('Entwicklung · synthetische lokale Bibliothek')),false);
});


test('app root retains the provider host across close/tab entry and hides covered shell layout',()=>{
  const f=fixture(390,1,true);
  const shell=()=>f.nodes().find(n=>typeof n.type==='function'&&(n.type as Function).name==='Shell')!;
  assert.equal(f.find('CoreFlightFoundation').props.open,false,'Startup keeps session observation hidden');
  assert.equal(f.find('CoreFlightFoundation').props.providerEntryAllowed,false,'Startup cannot start retrieval or interactive login');
  shell().props.onCoreFlights('update');f.render();
  const first=f.find('CoreFlightFoundation');assert.equal(first.props.intent,'update');assert.equal(first.props.providerEntryAllowed,true);assert.equal(first.props.open,true);
  assert.equal(f.parent(shell()).props.pointerEvents,'auto');assert.equal(f.find('UpdateDialog').props.open,false,'Retained session work has no popup');
  first.props.onStatus({...unknownProviderStatus,loginVisible:true});f.render();
  assert.equal(f.find('UpdateDialog').props.open,true);assert.equal(f.parent(shell()).props.pointerEvents,'none');
  first.props.onStatus({...unknownProviderStatus,loginVisible:false});f.render();
  assert.equal(f.find('UpdateDialog').props.open,false);assert.equal(f.find('CoreFlightFoundation').props.open,true,'Auto-hide retains the admitted job');
  first.props.onProgress({state:'waiting',last:'prepare',current:null,message:'Saved Sync can continue'});f.render();
  assert.equal(f.find('UpdateDialog').props.open,true,'An interrupted Sync must show its Continue action');
  first.props.onProgress({state:'active',last:'prepare',current:'flights'});f.render();
  assert.equal(f.find('UpdateDialog').props.open,false,'Retrieval returns to the compact header state');
  first.props.close();f.render();
  const retained=f.find('CoreFlightFoundation');assert.equal(retained.props.open,false);assert.equal(retained.props.requestId,first.props.requestId);
  assert.equal(f.parent(shell()).props.pointerEvents,'auto');
  shell().props.onCoreFlights('update');f.render();
  const reopened=f.find('CoreFlightFoundation');assert.equal(reopened.type,retained.type);assert.equal(reopened.props.open,true);
  assert.equal(reopened.props.requestId,first.props.requestId+1);assert.equal(reopened.props.intent,'update');
});

test('non-header legacy connection intents are normalized to offline administration without provider admission',()=>{
  const f=fixture(390,1,true);
  const shell=f.nodes().find(n=>typeof n.type==='function'&&(n.type as Function).name==='Shell')!;
  shell.props.onCoreFlights('connect');f.render();
  assert.equal(f.find('CoreFlightFoundation').props.intent,'options');
  assert.equal(f.find('CoreFlightFoundation').props.providerEntryAllowed,false);
});

test('a failed attempt keeps its header result but releases the database reservation before the next one-tap retry',()=>{
  const f=fixture(390,1,true),shell=()=>f.nodes().find(n=>typeof n.type==='function'&&(n.type as Function).name==='Shell')!;
  shell().props.onCoreFlights('update');f.render();const first=f.find('CoreFlightFoundation');
  first.props.onProgress({state:'failed',last:'account',current:'flights',message:'Retry'});f.render();f.render();
  assert.equal(f.find('CoreFlightFoundation').props.open,false);
  assert.equal(shell().props.coreFlightsOpen,false);
  assert.equal(shell().props.syncProgress.state,'failed');
  shell().props.onCoreFlights('update');f.render();
  assert.equal(f.find('CoreFlightFoundation').props.open,true);
  assert.equal(f.find('CoreFlightFoundation').props.requestId,first.props.requestId+1);
});

test('the retained root preserves the failed calendar name when a saved-flight result closes',()=>{
  const f=fixture(390,1,true),shell=()=>f.nodes().find(n=>typeof n.type==='function'&&(n.type as Function).name==='Shell')!;
  shell().props.onCoreFlights('update');f.render();
  f.find('CoreFlightFoundation').props.close({pending:0,medicalStatus:'updated',dutyStatus:'partial',eventsStatus:'failed',documentNoticesStatus:'partial'});f.render();f.render();
  assert.equal(shell().props.syncProgress.message,'Nicht aktualisiert: Termine.');
  assert.equal(shell().props.syncProgress.last,'save');assert.equal(f.find('CoreFlightFoundation').props.open,false);
});


test('recent-flight entry carries exact identity into the ordinary list and does not open provider UI',()=>{
 const f=fixture();f.find('Dashboard').props.onFlight('saved-flight-123');f.render();
 assert.equal(f.find('OwnFlights').props.active,true);
 assert.equal(f.find('OwnFlights').props.filterRequest.flightId,'saved-flight-123');
 assert.equal(f.find('OwnFlights').props.filterRequest.year,null);assert.equal(f.coreRoutes.length,0);
});


test('all recent flights replaces the previous detail request with a fresh unfiltered list request',()=>{
 const f=fixture();f.find('Dashboard').props.onFlight('saved-flight-123');f.render();const previous=f.find('OwnFlights').props.filterRequest;
 f.press('Pressable','Übersicht');f.find('Dashboard').props.onFlights();f.render();
 const request=f.find('OwnFlights').props.filterRequest;assert.notEqual(request,previous);assert.equal(request.flightId,undefined);assert.equal(request.year,null);assert.equal(f.find('OwnFlights').props.active,true);
});


test('design preview is an explicit Development route and Back restores settings without provider work',()=>{
 const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onTools();f.render();
 assert.ok(!f.nodes().some(n=>n.type==='DesignPreview'));f.find('DevelopmentHub').props.onDesignPreview();f.render();
 assert.equal(f.nodes().filter(n=>n.type==='SyncProgress').length,1,'Only the covered main page retains real account progress; the preview overlay is isolated');
 assert.equal(typeof f.find('DesignPreview').props.onClose,'function');assert.ok(f.nodes().some(n=>n.type==='DesignPreview'));assert.deepEqual(f.coreRoutes,[]);
 f.find('DesignPreview').props.onClose();f.render();assert.ok(f.nodes().some(n=>n.type==='DevelopmentHub'));
});


test('completion preserves the current tab and source results live only in scoped Details',()=>{
 const f=fixture();f.press('Pressable','Flüge');
 const result={ownerId:'owner-a',storeId:'store-a',accountRef:'101',added:1,changed:0,pending:0,from:'2026-01-01',to:'2026-10-22',eventsStatus:'failed'};
 const view={snapshot:{ownerId:'owner-a',storeId:'store-a',account:{accountRef:'101'}}};
 f.showLoad(result,view);
 assert.equal(f.find('OwnFlights').props.active,true);
 assert.equal(f.nodes().some(n=>n.type==='UpdateResult'),false,'No completion acknowledgement');
 f.find('SyncProgress').props.details();f.render();
 assert.equal(f.find('UpdateResult').props.detail,true);assert.equal(f.find('UpdateResult').props.result.eventsStatus,'failed');
 f.showLoad(result,{snapshot:{ownerId:'owner-b',storeId:'store-a',account:{accountRef:'102'}}});
 assert.equal(f.nodes().some(n=>n.type==='UpdateResult'),false);
});

test('Details never exposes results across a same-owner store or account switch',()=>{
 const f=fixture(),result={ownerId:'owner',storeId:'store-a',accountRef:'101',added:0,changed:0,pending:0};
 f.showLoad(result,{snapshot:{ownerId:'owner',storeId:'store-a',account:{accountRef:'101'}}});
 f.find('SyncProgress').props.details();f.render();assert.ok(f.nodes().some(n=>n.type==='UpdateResult'));
 f.showLoad(result,{snapshot:{ownerId:'owner',storeId:'store-b',account:{accountRef:'101'}}});
 assert.equal(f.nodes().some(n=>n.type==='UpdateResult'),false);
 f.showLoad(result,{snapshot:{ownerId:'owner',storeId:'store-a',account:{accountRef:'102'}}});
 assert.equal(f.nodes().some(n=>n.type==='UpdateResult'),false);
});

test('Verein uses selected account sources in overview and detail routes',()=>{
 const f=fixture();const information={events:{status:'partial',items:[]},documentNotices:{status:'unavailable',items:[]}};
 f.showLoad(null,{snapshot:{ownerId:'owner-a',account:{accountRef:'101'}},featureInformation:information,featureInformationReadFailed:true});f.press('Pressable','Verein');
 assert.equal(f.find('ClubEvents').props.information,information);assert.equal(f.find('ClubEvents').props.readFailed,true);
 f.find('ClubEvents').props.onOpen();f.render();assert.equal(f.find('ClubEvents').props.compact,false);
 assert.equal(f.nodes().some(n=>n.type==='ClubDocumentNotices'),false);
});

test('compact toolbar preserves brand, sync/profile order, growing destination text and contextual Back',()=>{
 const headerSource=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/AppHeader.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:false}}).outputText;
 const react={createElement:(type:unknown,props:any,...children:any[])=>({type,props:props??{},children:children.flat(Infinity)})};
 const modules:any={react:{default:react},'react-native':{Image:'Image',Pressable:'Pressable',Text:'Text',View:'View',StyleSheet:{create:(s:any)=>s}},'./theme':{colors:{}},'./SymbolIcon':{SymbolIcon:'SymbolIcon'}};
 const exports:any={};runInNewContext(headerSource,{exports,require:(name:string)=>name.startsWith('../../assets/')?name:modules[name]});
 const controls=react.createElement('Sync',{}),profile=react.createElement('Profile',{});let calls=0;
 for(const hasBack of [false,true]){
  const back=()=>calls++;
  const tree=exports.AppHeader({title:'Profil & Einstellungen',children:controls,profile,back:hasBack?back:undefined,backDisabled:hasBack});
  const row=tree.children[0];const [brand,body,actions]=row.children;
  assert.deepEqual(actions.children,[controls,profile]);
  const title=body.children[1];assert.equal(title.props.accessibilityRole,'header');assert.equal(title.props.numberOfLines,undefined);assert.notEqual(title.props.allowFontScaling,false);
  if(hasBack){assert.equal(brand.props.disabled,true);assert.equal(brand.props.onPress,back);}else{assert.equal(brand.props.accessibilityLabel,'MoFlight Thermik Logo');assert.ok(brand.props.source.endsWith('moflight-ai-logo-dark.png'));}
 }
 assert.equal(calls,0);
});


test('activity advice is shown only for the selected owner library and provider account',()=>{
  const f=fixture();
  f.showLoad(null,{snapshot:{ownerId:'real-owner',storeId:'library-a',account:{accountRef:'101'}}});
  const activity={storeId:'library-a',accountRef:'101',changed:true};
  const status={...unknownProviderStatus,ownerId:'real-owner',activity};
  f.setProviderStatus(status);assert.equal(f.find('DataUpdateIndicator').props.activityChanged,true);
  for(const foreign of [{...status,ownerId:'foreign-owner'},{...status,activity:{...activity,storeId:'library-b'}},{...status,activity:{...activity,accountRef:'102'}}]){
    f.setProviderStatus(foreign);assert.equal(f.find('DataUpdateIndicator').props.activityChanged,false);
  }
  f.setProviderStatus({...status,activity:{...activity,changed:false}});
  assert.equal(f.find('DataUpdateIndicator').props.activityChanged,false);
});


test('overview-selected year opens Statistics in that same season',()=>{
 const f=fixture();f.find('Dashboard').props.onStatistics(2025,'roles');f.render();assert.equal(f.find('StatisticsOverlay').props.initialYear,2025);assert.equal(f.find('StatisticsOverlay').props.initialSection,'roles');assert.deepEqual(f.coreRoutes,[]);
});


test('visible sync advice is scoped and Details opens status without provider work',()=>{
 const f=fixture();const at='2026-10-22T12:00:00.000Z';
 f.showLoad(null,{snapshot:{ownerId:'owner',storeId:'store',account:{accountRef:'101'},savedRetrievals:[{from:'2026-01-01',to:'2026-10-22',retrievedAt:at,savedAt:at}]}});
 for(const activity of [{changed:true,storeId:'foreign',accountRef:'101'},{changed:true,storeId:'store',accountRef:'102'}]){
  f.setProviderStatus({...unknownProviderStatus,ownerId:'owner',activity});assert.equal(f.find('SyncProgress').props.notice,null);
 }
 f.setProviderStatus({...unknownProviderStatus,ownerId:'owner',activity:{changed:true,storeId:'store',accountRef:'101'}});
 assert.equal(f.find('SyncProgress').props.notice.caption,'Änderungen möglich');
 f.find('SyncProgress').props.details();f.render();assert.equal(f.headers().at(-1)!.props.title,'Verbindung & Datenstatus');
 assert.equal(f.find('SyncStatusDetails').props.activityChanged,true);assert.deepEqual(f.coreRoutes,[]);
});


test('Profile and ordinary Status share the direct whole-user backup destination',()=>{
 const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
 f.find('ProfileSettings').props.onBackup();assert.deepEqual(f.destinations,['backup']);
 f.find('ProfileSettings').props.onStatus();f.render();
 assert.equal(f.headers().at(-1)!.props.title,'Verbindung & Datenstatus');
 const backup=f.nodes().find(n=>n.type==='Action'&&n.children.includes('Daten sichern & wiederherstellen'))!;
 backup.props.onPress();assert.deepEqual(f.destinations,['backup','backup']);
 assert.ok(!f.nodes().some(n=>n.type==='LibraryBackup'));
});
test('club expansion restores overview scroll on both toolbar and Android Back',()=>{
 const f=fixture();f.press('Pressable','Verein');
 const scroll=()=>f.nodes().find(n=>n.type==='ScrollView'&&n.props.onScroll&&n.props.key==='Übersicht')!;
 scroll().props.onScroll({nativeEvent:{contentOffset:{y:240}}});
 f.find('ClubEvents').props.onOpen();f.render();
 assert.equal(f.headers()[0]!.props.title,'Verein · Termine');
 f.hardwareBack();f.render();assert.equal(f.headers()[0]!.props.title,'Verein');
 assert.equal(scroll().props.contentOffset.y,240);
 f.find('ClubEvents').props.onOpen();f.render();f.headers()[0]!.props.back();f.render();
 assert.equal(scroll().props.contentOffset.y,240);
});


test('header and retry require confirmation; cancel, dismiss and background cannot start provider work',()=>{
 for(const trigger of ['header','retry'])for(const cancel of ['button','dismiss','background']){
  const f=fixture();
  const start=()=>trigger==='header'?f.press('DataUpdateIndicator'):f.find('SyncProgress').props.retry();
  start();start();assert.equal(f.dialogs.length,1);assert.deepEqual(f.calls,[]);
  const dialog=f.dialogs[0];assert.equal(dialog.title,'Daten synchronisieren?');
  if(cancel==='button')dialog.buttons[0].onPress();
  if(cancel==='dismiss')dialog.options.onDismiss();
  if(cancel==='background')f.appState('background');
  dialog.buttons[1].onPress();assert.deepEqual(f.calls,[]);
  f.appState('active');start();f.confirm();f.confirm();assert.deepEqual(f.calls,['core-load']);
 }
});

test('account change rejects a pending sync confirmation',()=>{
 const f=fixture();f.press('DataUpdateIndicator');
 f.showLoad(null,{snapshot:{ownerId:'other',storeId:'other-store',account:{accountRef:'other-account'},savedRetrievals:[]},flights:[]});
 f.confirm();assert.deepEqual(f.calls,[]);
});

import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
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
import { dataUpdateStatus, DATA_UPDATE_FRESH_MS } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
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
  const coreRoutes: {intent:string;developmentRecoveryCheckpoints:boolean}[] = [];
  const readEnabled:boolean[]=[];
  let suspended = false;
  let clockNow=Date.UTC(2026,9,22,12),clockDeadlines:readonly number[]=[];
  let providerStatus:any=unknownProviderStatus, lastLoad:any=null, ownView:any=null, appStateListener:((state:string)=>void)|undefined;
  Object.assign(controller, { connect: () => calls.push('connect'), checkConnection: () => calls.push('check'), retrieve: () => calls.push('retrieve') });
  let hardwareBack: () => boolean;
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...leaves(['ActivityIndicator', 'FlatList', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'StatusBar', 'Text', 'TextInput', 'View']),
      Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
      AppState: { addEventListener: (_:string,handler:(state:string)=>void) => {appStateListener=handler;return {remove(){}};} },
      BackHandler: { addEventListener: (_: string, handler: () => boolean) => { hardwareBack = handler; return { remove() {} }; } },
      Linking: {}, Platform: { OS: 'android' }, StyleSheet: { create: (s: unknown) => s, absoluteFill: {} },
      useWindowDimensions: () => ({ width, height: 900, fontScale }),
    },
    'react-native-safe-area-context': leaves(['SafeAreaProvider', 'SafeAreaView']),
    '../App': { default: 'LabApp' }, '../BookLab': { BookLab: 'BookLab' },
    '@moflight/flight-logbook': { canonical },
    './theme': { ...leaves(['Action', 'Card', 'Chip', 'ClubMark', 'Empty', 'GliderMark', 'IconLabel', 'Label', 'Photo', 'Section']), colors: {}, ui: {} },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
    './use-library': { useLibrary: (value: boolean) => { suspended = value; return library; } },
    './flight-model': { flightYears: () => [2026], selectFlights: () => library.flights, summarizeFlights: () => ({ count: 1, knownMinutes: 30 }), formatDuration: () => '0:30' },
    './local-insights': { localQuestions: [], localInsight: () => '' },
    './Dashboard': { Dashboard: 'Dashboard' }, './ShellIcons': leaves(['PlaneIcon', 'ProfileIcon', 'BookIcon']),
    './Diagnostics': leaves(['Diagnostics']), './diagnostics-native': {initializeDiagnostics() {}}, '../diagnostics': diagnostics,
    './ProfileSettings': { ProfileSettings: 'ProfileSettings', SyntheticProfileSettings:'SyntheticProfileSettings' }, '../book-storage': { PILOT: 'synthetic-pilot' },
    '../vereinsflieger/use-access-controller': { useAccessController: () => controller },
    './ProviderConnection': {...leaves(['ProviderConnection', 'ConnectionIndicator']),unknownProviderStatus}, './DataUpdateIndicator':leaves(['DataUpdateIndicator']), './UpdateDialog':leaves(['UpdateDialog']), './data-freshness':{DATA_UPDATE_FRESH_MS}, './AppHeader': { AppHeader: 'AppHeader' },
    './MedicalStatus': leaves(['MedicalIndicator', 'MedicalDetails']),
    './DevelopmentHub': leaves(['DevelopmentHub', 'DevelopmentNotice']),
    './LibraryBackup': leaves(['LibraryBackup']), './PaperStatus': leaves(['PaperStatus']),
    './ImportPreview': leaves(['ImportPreview']),
    './CoreFlightFoundation': leaves(['CoreFlightFoundation']),
    './OwnFlights': leaves(['OwnFlights']),
    './use-own-flights': { useOwnFlights: (_ports:unknown,active:boolean) => {readEnabled.push(active);return { view: ownView, phase: ownView?'ready':'missing' };} },
    './own-flight-reader-native': { ownFlightReadPorts: {} },
    './ConnectionSummary': leaves(['ConnectionSummary']), './medical-source': { medicalSource },
    './connection-guidance': { ownFlightConnectionState },
    '../vereinsflieger/duties': dutyModel, './DutyRoster':leaves(['DutyRoster']),
    '../vereinsflieger/retrieval-policy':{planFlightRetrieval},
    './use-start-clock':{useStartClock:(deadlines:readonly number[])=>{clockDeadlines=deadlines;return clockNow;},useReminderSnooze:()=>({snooze:null,error:false,save:()=>{}})},
  };
  const exports = {} as { Shell: () => Element };
  runInNewContext(source + '\nexports.Shell = Shell;', { exports, require: (name: string) => {
    if (name.startsWith('../../assets/')) return name;
    assert.ok(name in modules, name); return modules[name];
  } });
  let tree: Element;
  function render() { index = 0; tree = root?(exports as any).default():(exports.Shell as (props:unknown)=>Element)({lastLoad,providerStatus,onCoreFlights:(intent='connect',developmentRecoveryCheckpoints=false)=>{coreRoutes.push({intent,developmentRecoveryCheckpoints});calls.push(intent==='update'?'core-load':intent==='development'?'core-development-route':intent==='options'?'core-library-route':'core-connect');}}); effects.splice(0).forEach(effect => effect()); return tree; }
  function nodes() {
    const found: Element[] = [];
    const visit = (value: unknown) => { if (value && typeof value === 'object' && 'children' in value) { const node = value as Element; found.push(node); node.children.forEach(visit); if (node.type === 'FlatList') visit(node.props.ListHeaderComponent); } };
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
  return { render, nodes, find, resize:(nextWidth:number,nextFontScale:number)=>{width=nextWidth;fontScale=nextFontScale;render();}, headers, parent, press, openOwnDetail, flight, library, controller, calls, coreRoutes, readEnabled, suspended: () => suspended, hardwareBack: () => hardwareBack!(),
    showLoad:(result:any,view:any)=>{providerStatus=result?.verifiedConnection?{...unknownProviderStatus,ownerId:result.verifiedConnection.ownerId,connection:result.verifiedConnection.state}:unknownProviderStatus;lastLoad=result;ownView=view;render();render();},
    setTime:(time:number)=>{clockNow=time;render();}, clockDeadlines:()=>clockDeadlines,
    appState:(state:string)=>{if(state!=='active')providerStatus=unknownProviderStatus;appStateListener?.(state);render();} };
}

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
  f.setTime(now+40*60_000);assert.equal(status().state,'older');f.setTime(now);
  assert.equal(f.find('ConnectionSummary').props.controller.connection.lastCheckedAt,state.lastCheckedAt);
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
  assert.equal(f.find('MedicalIndicator').props.capture,medical);
  f.press('MedicalIndicator');assert.equal(f.find('MedicalDetails').props.capture,medical);
  f.showLoad(null,null);assert.equal(f.find('MedicalIndicator').props.capture,null);
});

test('app headers order connection, Medical and profile on every tab', () => {
  const f = fixture();
  for (const title of ['Übersicht', 'Flüge', 'Flugbuch', 'Verein', 'AI']) {
    f.press('Pressable', title);
    const controls = f.nodes().filter(n => n.type === 'DataUpdateIndicator' || n.type === 'MedicalIndicator' || n.props.accessibilityLabel === 'Profil & Einstellungen öffnen');
    assert.deepEqual(controls.map(n => n.type), ['DataUpdateIndicator', 'MedicalIndicator', 'Pressable']);
  }
  assert.deepEqual(f.calls, []);
});

test('only the header starts update/login; other pages retain guidance and offline backup', () => {
  const f=fixture();
  assert.equal(f.find('ConnectionSummary').props.onUpdate,undefined);
  assert.equal(f.find('ConnectionSummary').props.onOpen,undefined);
  assert.equal(f.find('OwnFlights').props.onUpdate,undefined);
  f.press('Pressable','Profil & Einstellungen öffnen');
  assert.equal(f.find('ProfileSettings').props.onConnections,undefined);
  const summary=f.find('ProfileSettings').props.connectionSummary as Element;
  assert.equal(summary.props.onUpdate,undefined);assert.equal(summary.props.onOpen,undefined);
  f.find('ProfileSettings').props.onTools();f.render();
  assert.equal(f.find('DevelopmentHub').props.onProvider,undefined);
  assert.deepEqual(f.calls,[]);
  f.press('DataUpdateIndicator');assert.deepEqual(f.calls,['core-load']);
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

test('Start paper information explains deferred setup without showing synthetic book progress',()=>{
  const f=fixture();f.find('Dashboard').props.onPaper();f.render();
  assert.equal(f.nodes().some(n=>n.type==='PaperStatus'),false);
  assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Dein Papierflugbuch'));
  assert.equal(f.headers().at(-1)!.props.title,'Papierflugbuch');assert.deepEqual(f.calls,[]);
  f.headers().at(-1)!.props.back();f.render();assert.equal(f.headers().at(-1)!.props.title,'Übersicht');
});

test('Medical opens without provider work and returns through nested overlays', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.find('OwnFlights').props.onHeaderChange({title:'Flugfilter',back:()=>{}}); f.render();
  f.press('MedicalIndicator');
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  assert.ok(f.find('MedicalDetails'));
  assert.equal(f.nodes().filter(n => n.type === 'MedicalIndicator').at(-1)!.props.active, true);
  f.press('DataUpdateIndicator');
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

test('header data update opens the combined flow directly and preserves the invoking sheet', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Retained draft');f.render();
  f.press('DataUpdateIndicator');
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
  f.press('Pressable','Profil & Einstellungen öffnen');f.press('DataUpdateIndicator');
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
  f.find('DevelopmentHub').props.onCoreFlights();f.render();f.press('DataUpdateIndicator');
  assert.deepEqual(f.coreRoutes,[{intent:'options',developmentRecoveryCheckpoints:true},{intent:'update',developmentRecoveryCheckpoints:false}]);
});

test('ordinary backup cannot request a provider entry', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');f.find('ProfileSettings').props.onBackup();
  assert.deepEqual(f.coreRoutes,[{intent:'options',developmentRecoveryCheckpoints:false}]);
  assert.equal(f.find('ProfileSettings').props.onConnections,undefined);
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
  const scroll = () => f.nodes().find(n => n.type === 'ScrollView' && n.props.onScroll)!;
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

  assert.equal(f.find('OwnFlights').props.onUpdate,undefined);f.press('DataUpdateIndicator');assert.deepEqual(f.calls,['core-load']);
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
  assert.equal(f.nodes().some(n=>n.type==='CoreFlightFoundation'),false,'Startup creates no provider host');
  shell().props.onCoreFlights('update');f.render();
  const first=f.find('CoreFlightFoundation');assert.equal(first.props.intent,'update');assert.equal(first.props.providerEntryAllowed,true);assert.equal(first.props.open,true);
  assert.equal(f.parent(shell()).props.pointerEvents,'none');assert.equal(f.parent(shell()).props.accessibilityElementsHidden,true);assert.ok(f.find('UpdateDialog'));
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


test('recent-flight entry carries exact identity into the ordinary list and does not open provider UI',()=>{
 const f=fixture();f.find('Dashboard').props.onFlight('saved-flight-123');f.render();
 assert.equal(f.find('OwnFlights').props.active,true);
 assert.equal(f.find('OwnFlights').props.filterRequest.flightId,'saved-flight-123');
 assert.equal(f.find('OwnFlights').props.filterRequest.year,null);assert.equal(f.coreRoutes.length,0);
});

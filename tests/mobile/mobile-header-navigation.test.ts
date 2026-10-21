import * as diagnostics from '../../apps/platform-lab/src/diagnostics';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { medicalSource } from '../../apps/platform-lab/src/mobile/medical-source.ts';
import { ownFlightConnectionState, connectionSymbol } from '../../apps/platform-lab/src/mobile/connection-guidance.ts';

interface Element { type: unknown; props: Record<string, any>; children: unknown[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/MobileApp.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

// Real shell state and handlers, with native leaves and the independent data /
// provider services replaced. These checks make no native-layout claim.
function fixture() {
  let index = 0;
  const hooks: any[] = [], effects: (() => void)[] = [];
  const react = {
    createElement: (type: unknown, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useRef(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
    useState(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value: unknown) => { hooks[i] = value; }]; },
    useEffect(effect: () => void, deps: unknown[]) {
      const i = index++, previous = hooks[i];
      if (!previous || deps.some((v, n) => v !== previous[n])) { hooks[i] = deps; effects.push(effect); }
    },
  };
  const flight = { id: 'synthetic-flight', registration: 'D-SYN', date: '2026-10-18', minutes: 30 };
  const library = { flights: [flight], books: [{ id: 'synthetic-book', name: 'Synthetic book' }], bookId: 'synthetic-book', pending: 0, displayName: 'Synthetic pilot' };
  const controller = { visible: false, informationCaptures: [], connection: { phase: 'unknown' }, refreshRecovery: () => calls.push('refresh-recovery'), dismissLogin() {}, backWithinProvider: () => false, suspendBrowserForOwnerSwitch: () => true };
  const calls: string[] = [];
  const readEnabled:boolean[]=[];
  let suspended = false;
  let lastLoad:any=null, ownView:any=null, appStateListener:((state:string)=>void)|undefined;
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
      useWindowDimensions: () => ({ width: 390, height: 900, fontScale: 1 }),
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
    './ProfileSettings': { ProfileSettings: 'ProfileSettings' }, '../book-storage': { PILOT: 'synthetic-pilot' },
    '../vereinsflieger/use-access-controller': { useAccessController: () => controller },
    './ProviderConnection': leaves(['ProviderConnection', 'ConnectionIndicator']), './AppHeader': { AppHeader: 'AppHeader' },
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
  };
  const exports = {} as { Shell: () => Element };
  runInNewContext(source + '\nexports.Shell = Shell;', { exports, require: (name: string) => {
    if (name.startsWith('../../assets/')) return name;
    assert.ok(name in modules, name); return modules[name];
  } });
  let tree: Element;
  function render() { index = 0; tree = (exports.Shell as (props:unknown)=>Element)({lastLoad,onCoreFlights:(startUpdate:boolean)=>calls.push(startUpdate?'core-load':'core-library-route')}); effects.splice(0).forEach(effect => effect()); return tree; }
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
  return { render, nodes, find, headers, parent, press, openOwnDetail, flight, library, controller, calls, readEnabled, suspended: () => suspended, hardwareBack: () => hardwareBack!(),
    showLoad:(result:any,view:any)=>{lastLoad=result;ownView=view;render();render();},
    appState:(state:string)=>{appStateListener?.(state);render();} };
}

test('real-flight verification updates both shell summaries without authorizing the legacy controller and expires on background',()=>{
  const f=fixture();
  const state={phase:'observed',confirmed:true,lastCheckedAt:'2026-10-21T07:00:00.000Z',observed:{accountNumber:'101',clubLabel:'Synthetic',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
  const result={added:2,changed:0,pending:0,verifiedConnection:{ownerId:'real-owner',state}};
  const view={snapshot:{ownerId:'real-owner',account:{accountRef:'101'}}};
  f.showLoad(result,view);
  assert.equal(connectionSymbol(f.find('ConnectionIndicator').props.controller.connection).mark,'✓');
  assert.equal(f.find('ConnectionSummary').props.controller.connection.lastCheckedAt,state.lastCheckedAt);
  assert.equal(f.controller.connection.phase,'unknown');assert.deepEqual(f.calls,[]);
  f.appState('background');f.appState('active');
  assert.equal(connectionSymbol(f.find('ConnectionIndicator').props.controller.connection).mark,'?');
  for(const foreign of [{snapshot:{ownerId:'other',account:{accountRef:'101'}}},{snapshot:{ownerId:'real-owner',account:{accountRef:'102'}}}]){
    f.showLoad({...result},foreign);assert.equal(connectionSymbol(f.find('ConnectionIndicator').props.controller.connection).mark,'?');
  }
  f.showLoad(null,view);assert.equal(connectionSymbol(f.find('ConnectionIndicator').props.controller.connection).mark,'?');
  f.showLoad({...result,verifiedConnection:{ownerId:'real-owner',state:{...state,confirmed:false}}},view);
  assert.equal(connectionSymbol(f.find('ConnectionIndicator').props.controller.connection).mark,'?');
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
    const controls = f.nodes().filter(n => n.type === 'ConnectionIndicator' || n.type === 'MedicalIndicator' || n.props.accessibilityLabel === 'Profil & Einstellungen öffnen');
    assert.deepEqual(controls.map(n => n.type), ['ConnectionIndicator', 'MedicalIndicator', 'Pressable']);
  }
  assert.deepEqual(f.calls, []);
});

test('Start, profile and flight updates use the combined flow only after an explicit action', () => {
  const f = fixture();
  assert.equal(f.find('Dashboard').props.pending,null,'Synthetic book tasks cannot appear as real account-flight setup/progress');
  assert.deepEqual(f.calls, []);
  f.find('ConnectionSummary').props.onUpdate(); f.render();
  assert.deepEqual(f.calls, ['core-load']);
  assert.equal(f.find('ProviderConnection').props.open, false);
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  const summary = f.find('ProfileSettings').props.connectionSummary as Element;
  summary.props.onOpen(); f.render();
  assert.deepEqual(f.calls, ['core-load','core-library-route']);
  summary.props.onUpdate(); f.render();
  f.find('OwnFlights').props.onUpdate(); f.render();
  assert.deepEqual(f.calls, ['core-load','core-library-route','core-load','core-load']);
  f.controller.suspendBrowserForOwnerSwitch=()=>false;
  assert.equal(f.find('OwnFlights').props.onUpdate(),false);
  assert.equal(f.calls.length,4);
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
  assert.ok(f.nodes().some(n=>n.type==='Section'&&n.props.title==='Papierflugbuch später einrichten'));
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
  f.press('ConnectionIndicator');
  f.find('ProviderConnection').props.close(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers()[0]!.props.title, 'Flugfilter');
  assert.deepEqual(f.calls, ['core-library-route']);
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

test('connection overlay preserves the underlying sheet and browser layer parent', () => {
  const f = fixture();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  const providerParent = f.parent(f.find('ProviderConnection'));
  f.find('ProfileSettings').props.onTools(); f.render();
  f.find('DevelopmentHub').props.onProvider(); f.render();
  assert.equal(f.find('ProviderConnection').props.open, true);
  assert.equal(f.parent(f.parent(f.headers()[0]!)).props.accessibilityElementsHidden, true);
  assert.equal(f.parent(f.find('ProviderConnection')).type, providerParent.type);
  f.find('ProviderConnection').props.close(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Entwicklung');
  assert.equal(f.find('ProviderConnection').props.open, false);
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

test('hardware Back prefers guarded provider history and then returns to the same sheet', () => {
  const f = fixture();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onTools(); f.render();
  f.find('DevelopmentHub').props.onProvider(); f.render();
  f.controller.visible = true; f.controller.backWithinProvider = () => true; f.render();
  assert.equal(f.hardwareBack(), true); f.render();
  assert.equal(f.find('ProviderConnection').props.open, true);
  f.controller.backWithinProvider = () => false;
  assert.equal(f.hardwareBack(), true); f.render();
  assert.equal(f.find('ProviderConnection').props.open, false);
  assert.equal(f.headers().at(-1)!.props.title, 'Entwicklung');
});

test('normal paper, backup and book/status paths expose no synthetic experiment launcher', () => {
  const f = fixture();
  assert.equal(f.nodes().some(n => n.props.accessibilityLabel === 'Flugworkflow öffnen'), false);
  f.press('Pressable','Flugbuch');f.nodes().find(n=>n.props.testID==='paper-assistant-entry')!.props.onPress();f.render();
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
  assert.ok(f.find('DevelopmentHub')); assert.deepEqual(f.calls, ['refresh-recovery']);
  f.library.flights = [...f.library.flights]; f.render(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.ok(f.find('ProfileSettings'));
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.find('OwnFlights').type, ownFlights.type);
});

test('provider diagnostics reuses the retained controller and normal entry removes test controls', () => {
  const f = fixture();
  const controller = f.find('ProviderConnection').props.controller;
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onTools(); f.render();
  f.find('DevelopmentHub').props.onProvider(); f.render();
  assert.equal(f.find('ProviderConnection').props.controller, controller);
  assert.equal(f.find('ProviderConnection').props.development, true);
  assert.equal(f.find('ProviderConnection').props.open, true);
  f.find('ProviderConnection').props.close(); f.render();
  assert.ok(f.find('DevelopmentHub'));
  f.press('ConnectionIndicator');
  assert.equal(f.find('ProviderConnection').props.open, false);
  assert.equal(f.nodes().filter(n => n.type === 'ProviderConnection').length, 1);
  assert.deepEqual(f.calls, ['core-library-route']);
});

test('core-library route requires safe browser suspension and keeps the main profile draft in its shell', () => {
  const f=fixture();f.press('Pressable','Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onNameDraftChange('Retained draft');f.render();f.find('ProfileSettings').props.onTools();f.render();
  f.controller.suspendBrowserForOwnerSwitch=()=>false;f.find('DevelopmentHub').props.onCoreFlights();assert.deepEqual(f.calls,[]);
  f.controller.suspendBrowserForOwnerSwitch=()=>true;f.find('DevelopmentHub').props.onCoreFlights();assert.deepEqual(f.calls,['core-library-route']);
  f.render();f.headers().at(-1)!.props.back();f.render();assert.equal(f.find('ProfileSettings').props.nameDraft,'Retained draft');
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
  assert.ok(f.nodes().some(n=>n.type==='Label' && n.children.includes('Entwicklung · eigene gespeicherte Flüge')));
  assert.equal(f.nodes().some(n=>n.type==='Label' && n.children.includes('Entwicklung · synthetische lokale Bibliothek')),false);
  assert.equal(f.nodes().some(n=>n.type==='FlatList'),false);
  f.controller.suspendBrowserForOwnerSwitch=()=>false;
  assert.equal(f.find('OwnFlights').props.onUpdate(),false);assert.deepEqual(f.calls,[]);
  f.controller.suspendBrowserForOwnerSwitch=()=>true;
  assert.equal(f.find('OwnFlights').props.onUpdate(),true);assert.deepEqual(f.calls,['core-load']);
  let back=0;f.find('OwnFlights').props.onHeaderChange({title:'Flugdetails',back:()=>back++});f.render();
  assert.equal(f.headers()[0]!.props.title,'Flugdetails');f.hardwareBack();assert.equal(back,1);
  f.press('Pressable','Verein');assert.equal(f.find('OwnFlights').props.active,false);
 });

test('dashboard year reaches ordinary Flüge as a fresh request without provider work', () => {
  const f=fixture();
  f.find('Dashboard').props.onFlights(2026); f.render();
  const first=f.find('OwnFlights').props.filterRequest;
  assert.equal(first.year,2026);assert.equal(f.find('OwnFlights').props.active,true);
  f.press('Pressable','Übersicht');f.find('Dashboard').props.onFlights(2026);f.render();
  assert.notEqual(f.find('OwnFlights').props.filterRequest,first);
  f.find('Dashboard').props.onFlights();f.render();
  assert.equal(f.find('OwnFlights').props.filterRequest.year,null);
  assert.deepEqual(f.calls,[]);
  assert.ok(f.readEnabled.every(Boolean), 'Tab changes must not suspend or restart the reader');
});

test('tab round trips retain the same shell flight projection for Start and flights',()=>{
  const f=fixture();const view={snapshot:{ownerId:'owner-a',account:{accountRef:'account-a'}},flights:[]};
  f.showLoad(null,view);
  for(let i=0;i<3;i++){
    const list=f.find('OwnFlights');assert.equal(list.props.data.view,view);
    assert.equal(f.find('Dashboard').props.ownFlights,view);
    f.find('Dashboard').props.onFlights();f.render();
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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';

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
  const controller = { visible: false, connection: { phase: 'unknown' }, refreshRecovery: () => calls.push('refresh-recovery'), dismissLogin() {}, backWithinProvider: () => false };
  const calls: string[] = [];
  let suspended = false;
  Object.assign(controller, { connect: () => calls.push('connect'), checkConnection: () => calls.push('check'), retrieve: () => calls.push('retrieve') });
  let hardwareBack: () => boolean;
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...leaves(['ActivityIndicator', 'FlatList', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'StatusBar', 'Text', 'TextInput', 'View']),
      Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
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
    './ProfileSettings': { ProfileSettings: 'ProfileSettings' }, '../book-storage': { PILOT: 'synthetic-pilot' },
    '../vereinsflieger/use-access-controller': { useAccessController: () => controller },
    './ProviderConnection': leaves(['ProviderConnection', 'ConnectionIndicator']), './AppHeader': { AppHeader: 'AppHeader' },
    './MedicalStatus': leaves(['MedicalIndicator', 'MedicalDetails']),
    './DevelopmentHub': leaves(['DevelopmentHub', 'DevelopmentNotice']),
    './LibraryBackup': leaves(['LibraryBackup']), './PaperStatus': leaves(['PaperStatus']),
  };
  const exports = {} as { Shell: () => Element };
  runInNewContext(source + '\nexports.Shell = Shell;', { exports, require: (name: string) => {
    if (name.startsWith('../../assets/')) return name;
    assert.ok(name in modules, name); return modules[name];
  } });
  let tree: Element;
  function render() { index = 0; tree = exports.Shell(); effects.splice(0).forEach(effect => effect()); return tree; }
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
  render(); render();
  return { render, nodes, find, headers, parent, press, flight, library, controller, calls, suspended: () => suspended, hardwareBack: () => hardwareBack!() };
}

test('app headers order connection, Medical and profile on every tab', () => {
  const f = fixture();
  for (const title of ['Übersicht', 'Flüge', 'Flugbuch', 'Verein', 'AI']) {
    f.press('Pressable', title);
    const controls = f.nodes().filter(n => n.type === 'ConnectionIndicator' || n.type === 'MedicalIndicator' || n.props.accessibilityLabel === 'Profil & Einstellungen öffnen');
    assert.deepEqual(controls.map(n => n.type), ['ConnectionIndicator', 'MedicalIndicator', 'Pressable']);
  }
  assert.deepEqual(f.calls, []);
});

test('Medical opens without provider work and returns through nested overlays', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.press('Pressable', 'Flugfilter öffnen');
  f.press('MedicalIndicator');
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  assert.ok(f.find('MedicalDetails'));
  assert.equal(f.nodes().filter(n => n.type === 'MedicalIndicator').at(-1)!.props.active, true);
  f.press('ConnectionIndicator');
  f.find('ProviderConnection').props.close(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Medical');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'MoFlight');
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers()[0]!.props.title, 'Flüge');
  assert.deepEqual(f.calls, []);
});

test('details and sheets retain one active header; profile Back restores details and tab state', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.find('FlatList').props.renderItem({ item: f.flight }).props.onPress(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Flugdetails');
  assert.equal(f.parent(f.headers()[0]!).props.accessibilityElementsHidden, true);
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  assert.equal(f.headers().at(-1)!.props.title, 'Profil & Einstellungen');
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
  f.press('ConnectionIndicator');
  assert.equal(f.find('ProviderConnection').props.open, true);
  assert.equal(f.parent(f.parent(f.headers()[0]!)).props.accessibilityElementsHidden, true);
  assert.equal(f.parent(f.find('ProviderConnection')).type, providerParent.type);
  f.find('ProviderConnection').props.close(); f.render();
  assert.equal(f.headers().at(-1)!.props.title, 'Profil & Einstellungen');
  assert.equal(f.find('ProviderConnection').props.open, false);
});

test('book changes discard nested flight history before a later Back', () => {
  const f = fixture();
  f.press('Pressable', 'Flüge');
  f.find('FlatList').props.renderItem({ item: f.flight }).props.onPress(); f.render();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.library.bookId = 'different-synthetic-book'; f.render(); f.render();
  f.headers().at(-1)!.props.back(); f.render();
  assert.equal(f.headers().length, 1);
  assert.equal(f.headers()[0]!.props.title, 'Flüge');
});

test('hardware Back prefers guarded provider history and then returns to the same sheet', () => {
  const f = fixture();
  f.press('Pressable', 'Profil & Einstellungen öffnen');
  f.find('ProfileSettings').props.onConnections(); f.render();
  f.controller.visible = true; f.controller.backWithinProvider = () => true; f.render();
  assert.equal(f.hardwareBack(), true); f.render();
  assert.equal(f.find('ProviderConnection').props.open, true);
  f.controller.backWithinProvider = () => false;
  assert.equal(f.hardwareBack(), true); f.render();
  assert.equal(f.find('ProviderConnection').props.open, false);
  assert.equal(f.headers().at(-1)!.props.title, 'Profil & Einstellungen');
});

test('normal paper, backup and book/status paths expose no synthetic experiment launcher', () => {
  const f = fixture();
  assert.equal(f.nodes().some(n => n.props.accessibilityLabel === 'Flugworkflow öffnen'), false);
  f.find('Dashboard').props.onPaper(); f.render();
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
  f.find('TextInput', 'Flüge durchsuchen').props.onChangeText('ASK'); f.render();
  f.find('FlatList').props.renderItem({ item: f.flight }).props.onPress(); f.render();
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
  assert.equal(f.find('TextInput', 'Flüge durchsuchen').props.value, 'ASK');
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
  assert.equal(f.find('ProviderConnection').props.development, false);
  assert.equal(f.nodes().filter(n => n.type === 'ProviderConnection').length, 1);
  assert.deepEqual(f.calls, []);
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

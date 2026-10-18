import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

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
  const library = { flights: [flight], books: [{ id: 'synthetic-book', name: 'Synthetic book' }], bookId: 'synthetic-book', pending: 0 };
  const controller = { visible: false, connection: { phase: 'unknown' }, refreshRecovery() {}, dismissLogin() {}, backWithinProvider: () => false };
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
    './theme': { ...leaves(['Action', 'Card', 'Chip', 'ClubMark', 'Empty', 'GliderMark', 'Label', 'Photo', 'Section']), colors: {}, ui: {} },
    './use-library': { useLibrary: () => library },
    './flight-model': { flightYears: () => [2026], selectFlights: () => library.flights, summarizeFlights: () => ({ count: 1, knownMinutes: 30 }), formatDuration: () => '0:30' },
    './local-insights': { localQuestions: [], localInsight: () => '' },
    './Dashboard': { Dashboard: 'Dashboard' }, './ShellIcons': leaves(['PlaneIcon', 'ProfileIcon', 'BookIcon']),
    './ProfileSettings': { ProfileSettings: 'ProfileSettings' }, '../book-storage': { PILOT: 'synthetic-pilot' },
    '../vereinsflieger/use-access-controller': { useAccessController: () => controller },
    './ProviderConnection': leaves(['ProviderConnection', 'ConnectionIndicator']), './AppHeader': { AppHeader: 'AppHeader' },
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
    const visit = (value: unknown) => { if (value && typeof value === 'object' && 'children' in value) { const node = value as Element; found.push(node); node.children.forEach(visit); } };
    visit(tree); return found;
  }
  function find(type: string, label?: string) {
    const node = nodes().find(n => n.type === type && (!label || n.props.accessibilityLabel === label)); assert.ok(node, `${type}: ${label}`); return node;
  }
  function headers() { return nodes().filter(n => n.type === 'AppHeader'); }
  function parent(node: Element) { return nodes().find(n => n.children.includes(node))!; }
  function press(type: string, label?: string) { find(type, label).props.onPress(); render(); }
  render(); render();
  return { render, nodes, find, headers, parent, press, flight, library, controller, hardwareBack: () => hardwareBack!() };
}

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

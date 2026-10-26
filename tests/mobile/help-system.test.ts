import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as catalog from '../../apps/platform-lab/src/mobile/help-catalog.ts';

test('bundled help search is offline, accent-tolerant and scoped by category', () => {
  assert.equal(catalog.HELP_CONTENT_VERSION, 1);
  assert.deepEqual(catalog.searchHelpEntries('PIC').map(entry => entry.id), ['pic']);
  assert.deepEqual(catalog.searchHelpEntries('pilot in command').map(entry => entry.id), ['pic']);
  assert.deepEqual(catalog.searchHelpEntries('warum sehe ich keine flüge', 'Flüge & Daten').map(entry => entry.id), ['empty-flights']);
  assert.deepEqual(catalog.searchHelpEntries('warum sehe ich keine fluge', 'Flüge & Daten').map(entry => entry.id), ['empty-flights']);
  assert.deepEqual(catalog.searchHelpEntries('papier', 'Flugbuch').map(entry => entry.id), ['paper-book']);
  assert.deepEqual(catalog.searchHelpEntries('nichts-dazu').map(entry => entry.id), []);
  assert.equal(catalog.helpEntry('missing'), null);
  const pic = catalog.helpEntry('pic')!;
  assert.match(pic.sourceUrl!, /^https:\/\/www\.easa\.europa\.eu\//);
  assert.match(pic.boundary!, /keine automatische Anrechnung/);
  assert.match(catalog.helpEntry('backup')!.boundary!, /Foto- und Anhangdateien werden nicht mitgesichert/);
});

interface Element { type: string; props: Record<string, any>; children: any[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/HelpScreen.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;
function fixture(entryId: string | null, helpEnabled = true, query = '', category: catalog.HelpCategory | null = null) {
  const calls: string[] = [], links: string[] = [];
  const react = { createElement: (type: string, props: Record<string, any>, ...children: any[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...leaves(['Pressable', 'ScrollView', 'Text', 'TextInput', 'View']), Linking: { openURL: async (url: string) => { links.push(url); } }, StyleSheet: { create: (value: unknown) => value } },
    './theme': { ...leaves(['Action', 'Card', 'Chip', 'Label', 'Section']), colors: { cyan: '#27d3d2', muted: '#a9bed3', text: '#f4f8fc', raised: '#0c3041', card: '#062331', border: '#183d50' }, ui: {} },
    './help-catalog': catalog,
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
  };
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const props = { entryId, query, category, onQuery: (value: string) => calls.push(`query:${value}`), onCategory: (value: string) => calls.push(`category:${value}`), onEntry: (value: string | null) => calls.push(`entry:${value}`), onReturn: () => calls.push('return'), onReplay: () => calls.push('replay'), onStatus: () => calls.push('status'), returnLabel: 'Zurück zum Flug', helpEnabled };
  const tree: Element = exports.HelpScreen(props);
  const nodes: Element[] = [];
  const visit = (node: any) => { if (node?.children) { nodes.push(node); node.children.forEach(visit); } };
  visit(tree);
  const text = (node: any): string => node?.children ? node.children.map(text).join(' ') : typeof node === 'string' ? node : '';
  return { tree, nodes, text, calls, links };
}

test('Help home exposes search, categories and replay without triggering external work', () => {
  const f = fixture(null);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.links, []);
  f.nodes.find(node => node.props.testID === 'help-search')!.props.onChangeText('PIC');
  f.nodes.find(node => node.type === 'Chip' && node.props.title === 'Begriffe')!.props.onPress();
  f.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Was bedeutet PIC?')!.props.onPress();
  f.nodes.find(node => node.type === 'Action' && f.text(node).includes('Hinweis zu Flüge ansehen'))!.props.onPress();
  assert.deepEqual(f.calls, ['query:PIC', 'category:Begriffe', 'entry:pic', 'replay']);
  assert.deepEqual(f.links, []);
});

test('PIC answer displays source and credit boundary; external source opens only on explicit tap', async () => {
  const f = fixture('pic'), text = f.text(f.tree);
  assert.match(text, /HILFE · OFFLINE/); assert.match(text, /keine automatische Anrechnung/);
  assert.match(text, /EASA/); assert.deepEqual(f.links, []);
  assert.equal(f.nodes.filter(node => node.type === 'Section' && node.props.title === catalog.helpEntry('pic')!.title).length, 1);
  assert.equal(f.nodes.some(node => node.type === 'Label' && f.text(node) === catalog.helpEntry('pic')!.title), false);
  assert.match(text, /Internet erforderlich/);
  const sourceLink = f.nodes.find(node => node.type === 'Pressable' && node.props.accessibilityRole === 'link')!;
  sourceLink.props.onPress(); await Promise.resolve();
  assert.deepEqual(f.links, [catalog.helpEntry('pic')!.sourceUrl]);
  f.nodes.find(node => node.type === 'Action' && f.text(node).includes('Zurück zum Flug'))!.props.onPress();
  assert.deepEqual(f.calls, ['return']);
});

test('Help list renders the active search/category and preserves their controlled state on entry selection', () => {
  const f = fixture(null, true, 'papier', 'Flugbuch');
  assert.equal(f.nodes.find(node => node.props.testID === 'help-search')!.props.value, 'papier');
  assert.equal(f.nodes.find(node => node.type === 'Chip' && node.props.title === 'Flugbuch')!.props.selected, true);
  const topics = f.nodes.filter(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button');
  assert.deepEqual(topics.map(node => node.props.accessibilityLabel), ['Was kann ich im Flugbuch schon tun?']);
  topics[0]!.props.onPress();
  assert.deepEqual(f.calls, ['entry:paper-book']);
  assert.deepEqual(f.links, []);
  const empty = fixture(null, true, 'PIC', 'Flugbuch');
  assert.match(empty.text(empty.tree), /Keine geprüfte Hilfe gefunden/);
  assert.equal(empty.nodes.some(node => node.type === 'Pressable' && node.props.accessibilityRole === 'button'), false);
  empty.nodes.find(node => node.type === 'Chip' && node.props.title === 'Alle')!.props.onPress();
  assert.deepEqual(empty.calls, ['category:null']);
});

test('answer routes back to topics or the caller and opens status only for relevant data answers', () => {
  for (const id of ['empty-flights', 'partial-update']) {
    const f = fixture(id, false, 'daten', 'Flüge & Daten');
    f.nodes.find(node => node.type === 'Action' && f.text(node) === 'Datenstatus öffnen')!.props.onPress();
    f.nodes.find(node => node.type === 'Action' && f.text(node) === 'Alle Hilfethemen')!.props.onPress();
    f.nodes.find(node => node.type === 'Action' && f.text(node) === 'Zurück zum Flug')!.props.onPress();
    assert.deepEqual(f.calls, ['status', 'entry:null', 'return']);
    assert.deepEqual(f.links, []);
    assert.match(f.text(f.tree), new RegExp(catalog.helpEntry(id)!.updatedAt));
  }
  const pic = fixture('pic');
  assert.equal(pic.nodes.some(node => node.type === 'Action' && pic.text(node) === 'Datenstatus öffnen'), false);
});

test('unknown entry fails closed with an explicit no-answer state', () => {
  const f = fixture('not-in-catalog');
  assert.match(f.text(f.tree), /keine geprüfte Hilfe/);
  assert.equal(f.nodes.some(node => node.props.accessibilityRole === 'link'), false);
  assert.deepEqual(f.calls, []);
});

test('disabled contextual help keeps the offline library searchable but hides hint replay', () => {
  const f = fixture(null, false);
  assert.match(f.text(f.tree), /Kontexthilfe ist ausgeschaltet/);
  assert.ok(f.nodes.some(node => node.props.testID === 'help-search'));
  assert.ok(f.nodes.some(node => node.props.accessibilityLabel === 'Was bedeutet PIC?'));
  assert.equal(f.nodes.some(node => node.type === 'Action' && f.text(node).includes('Hinweis zu Flüge ansehen')), false);
});

test('global contextual Help preference persists independently of content-versioned hint dismissal', async () => {
  const preferenceSource = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/help-preferences-native.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
  }).outputText;
  const saved = new Map<string, string>();
  const secureStore = { getItemAsync: async (key: string) => saved.get(key) ?? null, setItemAsync: async (key: string, value: string) => { saved.set(key, value); } };
  const exports: Record<string, any> = {};
  runInNewContext(preferenceSource, { exports, require: (name: string) => name === 'expo-secure-store' ? secureStore : catalog });
  assert.equal(await exports.readContextHelpEnabled(), true);
  assert.equal(await exports.saveContextHelpEnabled(false), true);
  assert.equal(await exports.readContextHelpEnabled(), false);
  await exports.markFlightHelpHintSeen();
  assert.equal(await exports.hasSeenFlightHelpHint(), true);
  assert.equal(saved.get('moflight-context-help-enabled'), 'off');
  assert.equal(await exports.saveContextHelpEnabled(true), true);
  assert.equal(await exports.readContextHelpEnabled(), true);
  assert.equal(await exports.hasSeenFlightHelpHint(), true);
});

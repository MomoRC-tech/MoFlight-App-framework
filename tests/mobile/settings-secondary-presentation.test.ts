import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element { type: string; props: Record<string, any>; children: any[] }
function fixture(file: string, component: string, props: Record<string, any> = {}) {
  const state: any[] = [], links: string[] = [];
  let cursor = 0, failLinks = false, tree: Element;
  const react = {
    createElement: (type: any, props: any, ...children: any[]): Element => typeof type === 'function' ? type({ ...props, children: children.flat(Infinity) }) : ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial: unknown) { const i = cursor++; if (!(i in state)) state[i] = initial; return [state[i], (next: any) => { state[i] = typeof next === 'function' ? next(state[i]) : next; }]; },
    useRef: (value: unknown) => ({ current: value }),
    useEffect() {},
  };
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, any> = {
    react: { default: react, ...react },
    'react-native': { ...leaves(['View', 'Text', 'Pressable']), AppState: { currentState: 'active' }, StyleSheet: { create: (value: unknown) => value }, Linking: { openURL: async (url: string) => { if (failLinks) throw new Error('Private native failure'); links.push(url); } } },
    './theme': { ...leaves(['Action', 'Card', 'Label']), colors: {} },
  };
  function load(name: string) {
    const exports: any = {};
    const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/' + name + '.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false } }).outputText;
    runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  }
  modules['./settings-secondary-content'] = load('settings-secondary-content');
  const exports = load(file);
  const nodes = () => { const result: Element[] = []; const visit = (n: any) => { if (n?.children) { result.push(n); n.children.forEach(visit); } }; visit(tree); return result; };
  const text = (n: any): string => n?.children ? n.children.map(text).join(' ') : typeof n === 'string' ? n : '';
  const render = () => { cursor = 0; tree = exports[component](props); };
  return { render, nodes, text: () => text(tree), links, failLinks: () => { failLinks = true; }, pressTitle: (title: string) => nodes().find(n => n.type === 'Pressable' && text(n).startsWith(title))!.props.onPress() };
}

test('credits preserve all five author, source and license records behind explicit disclosures', async () => {
  const f = fixture('AboutCredits', 'AboutCredits'); f.render();
  assert.equal(f.links.length, 0); assert.match(f.text(), /Bildlizenzen gelten unabhängig/);
  const authors = ['Sebastian Kawa, Tomasz Kawa', 'Dg-505', 'Partonez', 'L293D', 'Anne Burgess'];
  for (const author of authors) { f.pressTitle(author); f.render(); }
  assert.equal(f.nodes().filter(n => n.props.selectable).length, 10);
  const actions = f.nodes().filter(n => n.type === 'Pressable' && n.props.accessibilityState.expanded === undefined);
  for (const action of actions) await action.props.onPress();
  await new Promise<void>(done => { setImmediate(done); });
  assert.equal(f.links.length, 10);
  for (const path of ['GrandPrixGlidingChile.JPG', 'Sunset_-_panoramio_(312).jpg', 'Windsock_at_Bolt_Head_Airfield.jpg', 'Glider_(sailplane).jpg', 'Clubhouse_at_Dusk_-_geograph.org.uk_-_6960024.jpg', '/by-sa/3.0/', '/by/3.0/', '/by-sa/4.0/', '/zero/1.0/', '/by-sa/2.0/']) assert.ok(f.links.some(link => link.includes(path)), path);
  f.failLinks(); actions[0]!.props.onPress(); await new Promise<void>(done => { setImmediate(done); }); f.render();
  assert.match(f.text(), /Adresse im Bildnachweis markieren und kopieren/); assert.ok(!f.text().includes('Private native failure'));
});

test('Development preserves every destination and does no work when opening or disclosing tools', () => {
  const calls: string[] = [];
  const props = Object.fromEntries(['onFlights', 'onBooks', 'onImportPreview', 'onCoreFlights', 'onSelectBook', 'onBackup', 'onPaper', 'onDesignPreview'].map(name => [name, () => calls.push(name)]));
  const f = fixture('DevelopmentHub', 'DevelopmentHub', props); f.render();
  assert.deepEqual(calls, []); assert.match(f.text(), /keine Fixtures/); assert.match(f.text(), /keine Zugriffssperre/);
  for (const title of ['Designvorschau', 'Eigene Flugbibliothek', 'Synthetische Importvorschau', 'Datensätze & Flugworkflow', 'Synthetischen Papierstand', 'Synthetisches Flugbuch', 'Sichern & wiederherstellen', 'Flugbücher & Papierexperimente']) f.pressTitle(title);
  assert.deepEqual(calls, ['onDesignPreview', 'onCoreFlights', 'onImportPreview', 'onFlights', 'onPaper', 'onSelectBook', 'onBackup', 'onBooks']);
  f.pressTitle('Sollstunden-Dateinachweis'); f.render(); assert.equal(calls.length, 8);
  f.pressTitle('Finanzdatei-Nachweis'); f.render(); assert.equal(calls.length, 8);
  assert.match(f.text(), /Finanzdatei-Nachweis starten/); assert.match(f.text(), /Finanznachweis offline wieder öffnen/);
  assert.match(f.text(), /Bestehende Konten, Belege und Anmeldungen bleiben unverändert/);
  assert.match(f.text(), /stellt deren vorherigen Inhalt wieder her/); assert.match(f.text(), /keine eigenen Vereinsflieger-Flüge oder Medical-Angaben/);
});

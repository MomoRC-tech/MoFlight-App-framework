import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as planner from '../../apps/platform-lab/src/import-preview.ts';
import { syntheticImportPreview } from '../../apps/platform-lab/src/import-preview-fixture.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ImportPreview.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

// Actual component handlers and planner; only native rendering is replaced.
function fixture() {
  const hooks: unknown[] = []; let index = 0, navigations = 0, writes = 0;
  let session: planner.PreviewSession | null = null;
  const react = {
    createElement(type: string | ((props: Element['props']) => Element), props: Element['props'], ...children: unknown[]): Element {
      if (typeof type === 'function') return type(props);
      return { type, props: props ?? {}, children: children.flat(Infinity) };
    },
    useState(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value: unknown) => { hooks[i] = value; }]; },
  };
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react }, 'react-native': leaves(['View']), './theme': leaves(['Action', 'Card', 'Chip', 'Label', 'Section']),
    '../import-preview': planner, '../import-preview-fixture': { syntheticImportPreview },
  };
  const component = {} as { ImportPreview: (p: { session: planner.PreviewSession | null; onChange: (s: planner.PreviewSession) => void; onNavigate: () => void }) => Element };
  runInNewContext(source, { exports: component, require: (name: string) => { assert.ok(name in modules, `Unexpected service dependency: ${name}`); return modules[name]; } });
  let tree: Element;
  function render() { index = 0; tree = component.ImportPreview({ session, onChange: s => { session = s; writes++; }, onNavigate: () => navigations++ }); }
  function nodes() {
    const result: Element[] = [];
    const visit = (v: unknown) => { if (v && typeof v === 'object' && 'children' in v) { const n = v as Element; result.push(n); n.children.forEach(visit); } };
    visit(tree); return result;
  }
  function text() { return nodes().map(n => n.children.filter(c => typeof c === 'string' || typeof c === 'number').join('')).join(' '); }
  function find(label: string) { const node = nodes().find(n => ['Action', 'Chip'].includes(n.type) && (n.props.label === label || n.props.title === label || n.children.join('') === label)); assert.ok(node, label); return node; }
  function press(label: string) { const node = find(label); assert.ok(!node.props.disabled, label); node.props.onPress(); render(); }
  render(); return { render, text, find, press, session: () => session!, writes: () => writes, navigations: () => navigations };
}

test('opening the preview is inert; explicit start, correction, deferral and acceptance call real rules', () => {
  const f = fixture(); assert.equal(f.writes(), 0); assert.equal(f.session(), null);
  assert.match(f.text(), /Neustart der App verworfen/);
  f.press('Synthetischen Vergleich starten');
  assert.equal(f.writes(), 1);
  assert.equal(f.find('Teststand übernehmen').props.disabled, true);
  f.press('Flug 1002 prüfen'); assert.match(f.text(), /Flugminuten: 12 → 14/);
  f.press('Test-Segelflugbuch A'); f.press('Auswahl im Test bestätigen');
  f.press('Flug 1003 prüfen'); assert.equal(f.find('Auswahl im Test bestätigen').props.disabled, true);
  f.press('Variante 2 wählen'); f.press('Später zuordnen'); f.press('Auswahl im Test bestätigen');
  f.press('Teststand übernehmen');
  assert.equal(f.session().workspace.records.find(r => r.sourceFlightId === '1003')!.flight.minutes, 25);
  assert.equal(f.session().workspace.choices.find(c => c.id.endsWith(',"1003"]'))!.bookId, null);
  assert.match(f.text(), /0 neu · 0 geändert · 7 unverändert · 1 widersprüchlich/);
  assert.ok(f.navigations() >= 5);
});

test('failed comparison/retry and cancelled edits preserve confirmed choices and usable evidence', () => {
  const f = fixture(); f.press('Synthetischen Vergleich starten');
  const before = structuredClone(f.session()), writes = f.writes();
  f.press('Unvollständigen Testabruf prüfen');
  assert.match(f.text(), /Unvollständigen Testabruf abgewiesen/); assert.deepEqual(f.session(), before);
  f.press('Vergleich erneut prüfen'); assert.deepEqual(f.session(), before);
  f.press('Flug 1002 prüfen'); f.press('Test-Segelflugbuch A'); f.press('Bearbeitung verwerfen');
  assert.deepEqual(f.session(), before); assert.equal(f.writes(), writes);
  f.press('Flug 1002 prüfen'); assert.equal(f.find('Test-Segelflugbuch B').props.selected, true);
  f.press('Bearbeitung verwerfen');
  f.press('Flug 1007 prüfen');
  assert.match(f.text(), /Flugminuten: unbekannt · Rolle: unbekannt/);
  f.press('Später zuordnen'); f.press('Auswahl im Test bestätigen');
  assert.equal(f.session().workspace.records.length, 4);
});

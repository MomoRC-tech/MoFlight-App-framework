import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as review from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import * as assessment from '../../apps/platform-lab/src/vereinsflieger/source-assessment.ts';
import type { CapturedFlights } from '../../apps/platform-lab/src/mobile/CapturedFlights.tsx';
import { captureFixture } from './capture-review-fixture.ts';

interface Element { type: unknown; props: Record<string, any>; children: unknown[] }
type Props = Parameters<typeof CapturedFlights>[0];
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/CapturedFlights.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

function fixture(props: Props) {
  const hooks: any[] = []; let index = 0;
  const react = {
    createElement(type: unknown, props: Element['props'], ...children: unknown[]): Element {
      if (typeof type === 'function') return type(props ?? {});
      return { type, props: props ?? {}, children: children.flat(Infinity) };
    },
    useState(initial: unknown) { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (next: unknown) => { hooks[i] = next; }]; },
    useMemo(callback: () => unknown, dependencies: unknown[]) {
      const i = index++, prior = hooks[i];
      if (!prior || dependencies.some((d, n) => d !== prior.dependencies[n])) hooks[i] = { dependencies, result: callback() };
      return hooks[i].result;
    },
  };
  const modules: Record<string, unknown> = {
    react: { default: react, ...react }, 'react-native': { View: 'View' },
    './theme': { ...Object.fromEntries(['Action', 'Card', 'Label', 'Section'].map(name => [name, name])) },
    '../vereinsflieger/capture-review': review, '../vereinsflieger/source-assessment': assessment,
  };
  const exports = {} as { CapturedFlights: typeof CapturedFlights };
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  let tree: Element;
  function render() { index = 0; tree = exports.CapturedFlights(props) as unknown as Element; }
  function nodes(value: unknown = tree): Element[] {
    if (!value || typeof value !== 'object' || !('children' in value)) return [];
    const node = value as Element; return [node, ...node.children.flatMap(v => nodes(v))];
  }
  function text(value: unknown = tree): string {
    if (value && typeof value === 'object' && 'children' in value) return (value as Element).children.map(text).join('');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
  function button(label: string) { const node = nodes().find(n => n.type === 'Action' && text(n) === label); assert.ok(node, label); return node; }
  function press(label: string) { const node = button(label); assert.ok(!node.props.disabled); node.props.onPress(); render(); }
  render(); return { props, render, text, nodes, button, press };
}

test('empty/loading/read-failed states expose no provider operation or invented records', () => {
  for (const [loadState, expected] of [['loading', /werden geöffnet/], ['ready', /Noch kein Flugbeleg/], ['failed', /konnten nicht geöffnet/]] as const) {
    const f = fixture({ snapshot: null, loadState }); assert.match(f.text(), expected);
    assert.equal(f.nodes().filter(n => n.type === 'Action').length, 0);
  }
});

test('offline review opens readable rows/details, pages every raw field without truncation, and keeps separate crew facts', () => {
  const snapshot = captureFixture(6); const long = 'Synthetic-long-note-'.repeat(50);
  snapshot.rows[0]!.values[10] = long;
  const before = structuredClone(snapshot), f = fixture({ snapshot, loadState: 'ready' });
  assert.doesNotMatch(f.text(), /D-T000|Synthetic A/);
  assert.match(f.text(), /Offline lesbar/); assert.match(f.text(), /2026-10-01 bis 2026-10-18/);
  f.press('Erfasste Flüge ansehen');
  assert.match(f.text(), /12 min \(gemeldet\)/); assert.match(f.text(), /Uhrzeitbasis und Landetag sind ungeprüft/);
  assert.doesNotMatch(f.text(), /D-T005/);
  f.press('Weitere Flugbelege'); assert.match(f.text(), /D-T005/); assert.doesNotMatch(f.text(), /D-T000/);
  assert.equal(f.button('Weitere Flugbelege').props.disabled, true);
  f.press('Vorherige Flugbelege'); f.press('Flugbeleg 1 ansehen');
  assert.match(f.text(), /Pilot: Synthetic A/); assert.match(f.text(), /PIC: Synthetic B/); assert.match(f.text(), /Begleiter\/FI: Synthetic C/);
  assert.match(f.text(), /SIC: Nicht erfasst/); assert.match(f.text(), /Quellreferenz \(ungeprüft\): 1000/);
  f.press('Weitere Anbieterfelder'); assert.ok(f.text().includes(long)); assert.match(f.text(), /Felder 9–11 von 11/);
  assert.equal(f.button('Weitere Anbieterfelder').props.disabled, true);
  f.press('Zur erfassten Liste'); assert.match(f.text(), /Datensätze 1–5 von 6/);
  f.press('Flugbelege schließen'); assert.doesNotMatch(f.text(), /D-T000|Synthetic A/);
  assert.deepEqual(snapshot, before);
});

test('zero-row capture, unknown/invalid/conflicting values and unsupported snapshots remain truthful', () => {
  const empty = fixture({ snapshot: captureFixture(0), loadState: 'ready' });
  empty.press('Erfasste Flüge ansehen'); assert.match(empty.text(), /Keine Flüge im erfassten Zeitraum/);
  const snapshot = captureFixture(); snapshot.rows[0]!.values[4] = '0'; snapshot.rows[0]!.values[9] = '00:00';
  snapshot.rows[0]!.values[2] = '25:00';
  const zero = fixture({ snapshot, loadState: 'ready' }); zero.press('Erfasste Flüge ansehen');
  assert.match(zero.text(), /0 min \(gemeldet\)/); assert.match(zero.text(), /Ungültig: 25:00/);
  const conflict = structuredClone(snapshot); conflict.rows[0]!.values[9] = '00:12';
  const c = fixture({ snapshot: conflict, loadState: 'ready' }); c.press('Erfasste Flüge ansehen');
  assert.match(c.text(), /Widersprüchliche Anbieterwerte/); assert.doesNotMatch(c.text(), /0 min \(gemeldet\)/);
  const bad = fixture({ snapshot: { ...snapshot, headers: ['PRIVATE-invalid-shape'] }, loadState: 'ready' });
  assert.match(bad.text(), /nicht sicher angezeigt/); assert.doesNotMatch(bad.text(), /PRIVATE-invalid-shape|D-T000/);
});

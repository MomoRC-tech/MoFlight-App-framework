import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as information from '../../apps/platform-lab/src/vereinsflieger/information.ts';

interface Element { type: unknown; props: Record<string, any>; children: any[] }
const capture = (category: information.InformationCategory, text: string): information.InformationCapture => ({ version: 1, id: 'synthetic-' + category, owner: 'synthetic-owner', connectionId: 'synthetic-scope', retrievedAt: '2026-10-19T12:00:00.000Z', sourceIdentity: 'provisional-observed-profile', category, path: '/member/overview/overview', columns: [{ key: 'notice', label: 'Hinweis · Originaltext', index: 0 }], rows: [{ position: 0, values: [text] }], filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } });
function fixture() {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/InformationReview.tsx', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const hooks: unknown[] = []; let index = 0;
  const react = { createElement: (type: unknown, props: Element['props'], ...children: any[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }), useState: (initial: unknown) => { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (v: unknown) => { hooks[i] = v; }]; } };
  const modules = { react: { default: react, ...react }, 'react-native': { View: 'View' }, './theme': Object.fromEntries(['Action', 'Card', 'Label', 'Section'].map(x => [x, x])), '../vereinsflieger/information': information };
  const exported = {} as { InformationReview: (props: any) => Element };
  runInNewContext(source, { exports: exported, require: (name: keyof typeof modules) => modules[name] });
  const latest = capture('document-notices', 'Synthetic complete title 16.10.2026');
  const older = { ...capture('document-notices', ' - 16.10.2026'), id: 'synthetic-older', retrievedAt: '2026-10-18T12:00:00.000Z' };
  const props = { captures: [latest], notice: '', onOpen() {}, disabled: false, history: null as information.InformationHistory | null, historyBusy: false, historyNotice: '', onHistory: (_c: information.InformationCategory, i: number) => { props.history = { category: 'document-notices', index: i, total: 2, capture: i ? older : latest }; } };
  const nodes = (value: any): Element[] => !value || typeof value !== 'object' ? [] : [value, ...value.children.flatMap(nodes)];
  const text = (value: any): string => typeof value === 'string' || typeof value === 'number' ? String(value) : value?.children?.map(text).join('') ?? '';
  const render = () => { index = 0; return exported.InformationReview(props); };
  const button = (label: string) => { const n = nodes(render()).find(n => n.type === 'Action' && text(n) === label); assert.ok(n, label); return n; };
  return { props, render, text, button };
}
test('source review opens old partial notice evidence and returns to latest without changing category counts', () => {
  const f = fixture(); f.button('Ansehen: Dokumentenhinweise · 1 Zeilen').props.onPress();
  assert.match(f.text(f.render()), /Synthetic complete title/);
  f.props.disabled = true; assert.equal(f.button('Weitere Informationen erfassen').props.disabled, true);
  assert.equal(f.button('Älteren Quellenbeleg ansehen').props.disabled, false);
  f.button('Älteren Quellenbeleg ansehen').props.onPress();
  const older = f.text(f.render()); assert.match(older, /Datumstext ohne bestätigten Dokumenttitel/); assert.ok(!older.includes('Synthetic complete title'));
  assert.match(older, /2 von 2/);
  f.button('Neueren Quellenbeleg ansehen').props.onPress(); assert.match(f.text(f.render()), /Synthetic complete title/);
  f.props.captures = []; f.props.history = null; assert.ok(!f.text(f.render()).includes('Synthetic complete title'));
});
test('blank extracted text stays unknown while explicit zero remains visible', () => {
  const f = fixture();
  const work = information.validateInformationCapture({ ...capture('work-hours', ''), path: '/member/profile/synthetic-hours', columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'activity', label: 'Tätigkeit', index: 1 }, { key: 'hours', label: 'Stunden', index: 2 }, { key: 'status', label: 'Status', index: 3 }], rows: [{ position: 0, values: ['01.10.2026', 'Synthetic activity', '0.00', ''] }], filters: ['2026'] });
  f.props.captures = [work]; f.props.onHistory = (category, index) => { f.props.history = { category, index, total: 1, capture: work }; };
  f.button('Ansehen: Arbeitsstunden · 1 Zeilen').props.onPress();
  assert.match(f.text(f.render()), /Kein unterstützter Textwert erfasst/); assert.match(f.text(f.render()), /Stunden: 0.00/);
});
test('truncation labels follow the selected snapshot rather than applying a new limit to older evidence', () => {
  const f = fixture();
  const latest = information.validateInformationCapture({ ...capture('practical', ''), path: '/member/profile/usereducation/editelidp', columns: [{ key: 'number', label: 'No', index: 0 }, { key: 'status', label: 'Status', index: 1 }, { key: 'objective', label: 'Lernziel', index: 2 }, { key: 'landings', label: 'Landungen', index: 3 }, { key: 'block', label: 'Blockzeit', index: 4 }], rows: Array.from({ length: 100 }, (_, i) => ({ position: i, values: [String(i), '', 'Synthetic objective', '0', '0:00'] })), coverage: { kind: 'visible-page', truncated: true, pagination: 'unverified' } });
  const older = { ...latest, id: 'older-practical', rows: latest.rows.slice(0, 20) };
  f.props.captures = [latest]; f.props.onHistory = (category, index) => { f.props.history = { category, index, total: 2, capture: index ? older : latest }; };
  f.button('Ansehen: Praktische Ausbildung · 100 Zeilen').props.onPress();
  assert.match(f.text(f.render()), /auf 100 Zeilen begrenzt/);
  f.button('Älteren Quellenbeleg ansehen').props.onPress();
  assert.match(f.text(f.render()), /auf 20 Zeilen begrenzt/); assert.ok(!f.text(f.render()).includes('auf 100 Zeilen begrenzt'));
  assert.ok(f.button('Ansehen: Praktische Ausbildung · 100 Zeilen'));
});

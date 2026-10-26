import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { medicalExpiry, medicalExpiryStatusText } from '../../apps/platform-lab/src/mobile/medical-expiry.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const react = { createElement: (type: string, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
let fontScale = 1;
const modules: Record<string, unknown> = {
  react: { default: react },
  'react-native': { Pressable: 'Pressable', View: 'View', Text: 'Text', StyleSheet: { create: (s: unknown) => s }, useWindowDimensions: () => ({fontScale}) },
  './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
  './theme': { Label: 'Label', colors: { text: '#f4f8fc' }, ui: {} },
  './medical-expiry': { medicalExpiry, medicalExpiryStatusText },
};
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/OverviewTiles.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;
const component = {} as { OverviewTiles: (p: {medical?: InformationCapture; now: number; onMedical: () => void; onPaper: () => void}) => Element };
runInNewContext(source, { exports: component, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
function nodes(tree: Element): Element[] {
  return [tree, ...tree.children.flatMap(child => child && typeof child === 'object' && 'children' in child ? nodes(child as Element) : [])];
}
function text(tree: Element) { return nodes(tree).flatMap(node => node.children.filter(child => typeof child === 'string')).join(''); }
function capture(values: string[][]): InformationCapture {
  return { version:1, id:'synthetic-medical', owner:'synthetic-owner', connectionId:'synthetic-connection', retrievedAt:'2026-10-01T12:00:00Z',
    sourceIdentity:'provisional-observed-profile', category:'medical', path:'/member/profile/viewprofile',
    columns:[{key:'expiry',label:'Expiry',index:7},{key:'kind',label:'Kind',index:2}],
    rows:values.map((values,position)=>({position,values})), filters:[], empty:!values.length,
    coverage:{kind:'visible-page',truncated:false,pagination:'unverified'} };
}
const now = new Date(2026,9,26,12).getTime();
function render(medical?: InformationCapture, onMedical = () => {}) {
  return component.OverviewTiles({medical,now,onMedical,onPaper(){}});
}

test('Start lists every Medical with its own parsed date and color, preserving details navigation', () => {
  const medical = capture([['Gültig bis 31.12.2027 - DE-0000000-0','LAPL'],['25.10.2026','Klasse 2'],['26.04.2027','Klasse 1']]);
  const original = structuredClone(medical);
  let opened = 0;
  const tile = render(medical,()=>opened++).children[0] as Element;
  const rows = nodes(tile).filter(node => node.type === 'View' && node.children.length === 2 && node.children.every(child => (child as Element)?.type === 'Text'));
  assert.deepEqual(rows.map(text), ['LAPL31.12.2027','Klasse 225.10.2026','Klasse 126.04.2027']);
  assert.deepEqual(rows.map(row => (row.children[1] as Element).props.style[2].color), ['#f4f8fc','#ff7777','#f9b65b']);
  assert.doesNotMatch(text(tile), /Erfasst bis| bis /);
  for (const row of rows) {
    for (const child of row.children as Element[]) {
      assert.equal(child.props.numberOfLines,1);
      assert.ok(tile.props.accessibilityLabel.includes(text(child)));
    }
  }
  assert.match(tile.props.accessibilityLabel, /Datum liegt in der Vergangenheit/);
  assert.equal(opened,0); tile.props.onPress(); assert.equal(opened,1);
  assert.deepEqual(medical,original);
});

test('Start retains every unknown/invalid Medical and partial-source warnings without inventing dates', () => {
  const medical = capture([['','LAPL'],['31.02.2027','Klasse 2'],['30.06.2028','']]);
  medical.coverage.truncated = true;
  const tile = render(medical).children[0] as Element;
  assert.match(text(tile), /LAPLunbekannt\*/);
  assert.match(text(tile), /Klasse 2unbekannt\*/);
  assert.match(text(tile), /Medical-Art unbekannt30.06.2028\*/);
  assert.match(tile.props.accessibilityLabel,/Quellenangaben teilweise unbekannt oder uneindeutig/);
  assert.doesNotMatch(text(tile),/31.02.2027/);
  assert.match(text(render()), /Status unbekannt/);
  assert.match(text(render(capture([]))), /Status unbekannt/);
});

test('enlarged text keeps stacked tiles and complete Medical content', () => {
  fontScale = 1.5;
  try {
    const tree = render(capture([['31.12.2027','Synthetic long Medical name']]));
    assert.equal(tree.props.style[1].flexDirection,'column');
    const tile = tree.children[0] as Element;
    assert.equal(tile.props.style({pressed:false})[1].width,'100%');
    assert.match(text(tile),/Synthetic long Medical name31.12.2027/);
    assert.match(tile.props.accessibilityLabel,/Synthetic long Medical name bis 31.12.2027/);
    assert.equal(nodes(tile).find(node => node.type === 'Text')?.props.ellipsizeMode, 'tail');
    assert.ok(nodes(tile).filter(node => node.type === 'Text').every(node => node.props.numberOfLines === 1));
  } finally { fontScale = 1; }
});

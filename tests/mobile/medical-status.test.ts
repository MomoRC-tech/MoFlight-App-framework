import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { medicalExpiry, medicalExpiryStatusText } from '../../apps/platform-lab/src/mobile/medical-expiry.ts';

interface Element { type: string; props: Record<string, any>; children: unknown[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/MedicalStatus.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;
const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
const react = { createElement: (type: string, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }) };
const modules: Record<string, unknown> = {
  react: { default: react },
  'react-native': { ...leaves(['Pressable', 'Text', 'View']), StyleSheet: { create: (s: unknown) => s } },
  './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
  './theme': { ...leaves(['Card', 'Label', 'Section']), colors: { muted: '#adbed5', text: '#f5f7ff' } },
  './medical-expiry': { medicalExpiry, medicalExpiryStatusText },
};
const component = {} as { MedicalIndicator: (p: { onPress: () => void; active?: boolean; disabled?: boolean; capture?: InformationCapture; now?: number }) => Element; MedicalDetails: (p?: {capture?: InformationCapture; needsReload?: boolean; now?: number}) => Element };
runInNewContext(source, { exports: component, require: (name: string) => { assert.ok(name in modules, `Unexpected data/service dependency: ${name}`); return modules[name]; } });
function nodes(tree: Element): Element[] {
  const result: Element[] = [];
  const visit = (v: unknown) => { if (v && typeof v === 'object' && 'children' in v) { const n = v as Element; result.push(n); n.children.forEach(visit); } };
  visit(tree); return result;
}
function text(tree: Element) { return nodes(tree).flatMap(n => n.children.filter(c => typeof c === 'string')).join(' '); }

test('Medical control is honestly unknown and only opens details on explicit tap', () => {
  let opened = 0;
  const control = component.MedicalIndicator({ onPress: () => opened++ });
  assert.equal(opened, 0);
  assert.match(control.props.accessibilityLabel, /Medical-Ablaufdatum unbekannt/);
  assert.equal(control.props.accessibilityState.selected, false);
  assert.match(text(control), /Med unbekannt/);
  control.props.onPress(); assert.equal(opened, 1);
  assert.equal(component.MedicalIndicator({ onPress() {}, active: true }).props.accessibilityState.selected, true);
  const disabled = component.MedicalIndicator({ onPress: () => opened++, disabled: true });
  assert.equal(disabled.props.disabled, true);
  assert.equal(disabled.props.accessibilityState.disabled, true);
  assert.match(text(disabled), /Med unbekannt/, 'Busy controls retain their source status');
});

test('Medical details explain missing evidence without input, save or provider actions', () => {
  const details = component.MedicalDetails();
  assert.match(text(details), /Status unbekannt/);
  assert.match(text(details), /keine Medical-Quellenangaben/);
  assert.equal(nodes(details).some(n => ['TextInput', 'Action', 'Pressable'].includes(n.type)), false);
});

test('saved Medical shows the earliest source date, raw fields and explicit unknown warning without a fitness claim', () => {
  const capture: InformationCapture = {version:1,id:'synthetic-medical',owner:'synthetic-owner',connectionId:'synthetic-connection',retrievedAt:'2026-10-01T12:00:00.000Z',
    sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],
    rows:[{position:0,values:['Synthetic class','31.12.2027 · source reference']},{position:1,values:['Synthetic second class','']}],filters:[],empty:false,
    coverage:{kind:'visible-page',truncated:true,pagination:'unverified'}};
  const control = component.MedicalIndicator({capture,onPress(){}});
  assert.match(control.props.accessibilityLabel, /Erfasstes frühestes Ablaufdatum: 31\.12\.2027/);
  assert.match(control.props.accessibilityLabel, /Datum liegt mehr als sechs Kalendermonate in der Zukunft/);
  assert.match(text(control), /31\.12\.2027\*/);
  const details = component.MedicalDetails({capture,needsReload:true});
  assert.match(text(details), /31.12.2027 · source reference/);
  assert.match(text(details), /Unbekannt \/ leer/);
  assert.match(text(details), /Ablaufdatum für Synthetic second class ist leer/);
  assert.match(text(details), /unvollständig/);
  assert.match(text(details), /erneut geladen/);
  assert.match(text(details), /Quelle: Vereinsflieger/);
  assert.equal(nodes(details).some(n => ['TextInput', 'Action', 'Pressable'].includes(n.type)), false);
  assert.match(text(component.MedicalIndicator({capture:{...capture,rows:[],empty:true},onPress(){}})), /unbekannt/);
});

test('medical header date receives expired, near-term and quiet text colors from the supplied local date', () => {
  const now = new Date(2026, 9, 22, 12).getTime();
  const base: InformationCapture = {version:1,id:'synthetic-medical',owner:'synthetic-owner',connectionId:'synthetic-connection',retrievedAt:'2026-10-01T12:00:00.000Z',
    sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],
    rows:[{position:0,values:['Synthetic class','21.10.2026']}],filters:[],empty:false,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};
  const status = (expiry: string) => {
    const control = component.MedicalIndicator({capture:{...base,rows:[{position:0,values:['Synthetic class',expiry]}]},onPress(){},now});
    return nodes(control).find(node => node.type === 'Text' && Array.isArray(node.props.style))!;
  };
  assert.equal(status('21.10.2026').props.style[1].color, '#ff7777');
  assert.equal(status('22.04.2027').props.style[1].color, '#f9b65b');
  assert.equal(status('23.04.2027').props.style[1].color, '#adbed5');
  const assessLabel = (expiry: string) => component.MedicalIndicator({capture:{...base,rows:[{position:0,values:['Synthetic class',expiry]}]},onPress(){},now}).props.accessibilityLabel;
  assert.match(assessLabel('21.10.2026'), /Datum liegt in der Vergangenheit/);
  assert.match(assessLabel('22.04.2027'), /Datum liegt innerhalb der nächsten sechs Kalendermonate/);
  assert.match(assessLabel('23.04.2027'), /Datum liegt mehr als sechs Kalendermonate in der Zukunft/);
  const detailText = (expiry: string) => text(component.MedicalDetails({capture:{...base,rows:[{position:0,values:['Synthetic class',expiry]}]},now}));
  assert.match(detailText('21.10.2026'), /Datum liegt in der Vergangenheit/);
  assert.match(detailText('22.04.2027'), /Datum liegt innerhalb der nächsten sechs Kalendermonate/);
  assert.match(detailText('23.04.2027'), /Datum liegt mehr als sechs Kalendermonate in der Zukunft/);
});

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
const component = {} as { MedicalIndicator: (p: { onPress: () => void; active?: boolean; disabled?: boolean; capture?: InformationCapture; now?: number }) => Element; MedicalDetails: (p?: {capture?: InformationCapture; loading?: boolean; needsReload?: boolean; refreshFailed?: boolean; now?: number}) => Element };
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

test('space-separated certificate source displays the recorded expiry while retaining the complete original value', () => {
  const raw = 'Gültig bis 31.12.2028 - DE 0000000-0';
  const capture: InformationCapture = {version:1,id:'synthetic-space-medical',owner:'synthetic-owner',connectionId:'synthetic-connection',retrievedAt:'2026-10-01T12:00:00.000Z',
    sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],
    rows:[{position:0,values:['Klasse 2',raw]}],filters:[],empty:false,
    coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};
  const now = new Date(2026, 9, 27, 12).getTime();
  const details = text(component.MedicalDetails({capture, now}));
  assert.match(details, /^31\.12\.2028 /);
  assert.ok(details.includes(raw));
  assert.doesNotMatch(details, /kein unterstütztes Datumsformat|Einordnung unbekannt/);
  assert.match(component.MedicalIndicator({capture,now,onPress(){}}).props.accessibilityLabel, /31\.12\.2028/);
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
  assert.match(text(details), /keine Bestätigung der Flugtauglichkeit oder einer Flugberechtigung/);
  assert.equal(nodes(details).some(n => n.type === 'Section' && n.props.title === 'Medical'), false, 'The parent page owns the Medical title');
  const sourceCards = nodes(details).filter(n => n.type === 'Card' && nodes(n).some(child => child.type === 'Section' && /^Quelleneintrag /.test(child.props.title)));
  assert.equal(sourceCards.length, 2, 'Each preserved source record remains a distinct group');
  assert.match(text(sourceCards[0]!), /Medical-Art Synthetic class Gültig bis · Originaltext 31.12.2027 · source reference/);
  assert.doesNotMatch(text(sourceCards[0]!), /Synthetic second class/);
  assert.match(text(sourceCards[1]!), /Medical-Art Synthetic second class Gültig bis · Originaltext Unbekannt \/ leer in der Quelle/);
  assert.deepEqual(sourceCards.map(card => nodes(card).filter(n => n.type === 'Label' && n.props.selectable).length), [2, 2]);
  assert.equal(nodes(details).some(n => ['TextInput', 'Action', 'Pressable'].includes(n.type)), false);
  assert.match(text(component.MedicalIndicator({capture:{...capture,rows:[],empty:true},onPress(){}})), /unbekannt/);
});

test('Medical details retain loading, stale-source and failed-refresh explanations alongside saved facts', () => {
  const loadingTree = component.MedicalDetails({loading:true,needsReload:true,refreshFailed:true});
  assert.ok(nodes(loadingTree).some(node => node.props.accessibilityState?.busy === true));
  assert.ok(nodes(loadingTree).some(node => node.props.accessibilityLiveRegion === 'polite'));
  const loading = text(loadingTree);
  assert.match(loading, /Gespeicherte Angaben werden geladen/);
  assert.match(loading, /erneut geladen/);
  assert.match(loading, /beim letzten Abruf nicht aktualisiert/);
  assert.doesNotMatch(loading, /Status unbekannt|noch keine Medical-Quellenangaben/);
  assert.match(loading, /keine Bestätigung der Flugtauglichkeit/);
  const capture: InformationCapture = {version:1,id:'synthetic-medical',owner:'synthetic-owner',connectionId:'synthetic-connection',retrievedAt:'2026-10-01T12:00:00.000Z',
    sourceIdentity:'provisional-observed-profile',category:'medical',path:'/member/profile/viewprofile',
    columns:[{key:'expiry',label:'Originaldatum',index:7},{key:'kind',label:'Originalart',index:2}],
    rows:[{position:4,values:['31.02.2027','Synthetic class']}],filters:[],empty:false,
    coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}};
  const original = structuredClone(capture);
  const details = component.MedicalDetails({capture,loading:true,needsReload:true,refreshFailed:true});
  assert.match(text(details), /Kein eindeutig lesbares Datum · Einordnung unbekannt/);
  assert.match(text(details), /Originaldatum 31.02.2027 Originalart Synthetic class/);
  assert.match(text(details), /kein unterstütztes Datumsformat/);
  assert.match(text(details), /werden geladen/);
  assert.match(text(details), /erneut geladen/);
  assert.match(text(details), /beim letzten Abruf nicht aktualisiert/);
  assert.match(text(details), /Vollständigkeit und Gültigkeit sind nicht bestätigt/);
  assert.deepEqual(capture, original);
  const empty = text(component.MedicalDetails({capture:{...capture,rows:[],empty:true}}));
  assert.match(empty, /keine Medical-Angaben gefunden. Der Status bleibt unbekannt/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DutyItem, DutyOverview } from '../../apps/platform-lab/src/vereinsflieger/duties';
import { createDesignPreviewData } from '../../apps/platform-lab/src/mobile/design-preview-data';

type Element = { type: unknown; props: Record<string, any>; children: any[] };
function fixture() {
  let expanded = false;
  const react = { useState: () => [expanded, (value:boolean) => { expanded=value; }], Fragment: 'Fragment', createElement: (type: any, props: any, ...children: any[]): Element => typeof type === 'function'
    ? type({ ...props, children }) : { type, props: props ?? {}, children: children.flat(Infinity) } };
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { Pressable:'Pressable', View: 'View', Text: 'Text', ImageBackground: 'ImageBackground', StyleSheet: { create: (value: unknown) => value, absoluteFill: { position: 'absolute' }, absoluteFillObject: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } },
    './theme': { Card: 'Card', Label: 'Label', Section: 'Section', Action: 'Action', ui:{cockpitImage:{},cockpitShade:{}}, colors: { text: 'text', raised: 'raised', border: 'border' } },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
    '../../assets/aviation/club-heading-airfield-v2.png': 'decorative-airfield',
  };
  function load(name: string) {
    const source = ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${name}.tsx`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;
    const exports: Record<string, (props: any) => any> = {};
    runInNewContext(source, { exports, require: (id: string) => { assert.ok(id in modules, id); return modules[id]; } });
    return exports;
  }
  const heading = load('ClubHeading');
  modules['./ClubHeading'] = heading;
  const roster = load('DutyRoster');
  const nodes = (node: any): Element[] => !node || typeof node !== 'object' ? [] : [node, ...(node.children ?? []).flatMap(nodes)];
  const text = (node: any): string => (typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children ?? []).map(text).join(' ')).replace(/\s+/g, ' ').trim();
  return { heading, roster, nodes, text };
}

const item = (key: string, overrides: Partial<DutyItem> = {}): DutyItem => ({
  key, duty: `Synthetic ${key}`, period: '24.10.2026 09:00 - 24.10.2026 17:00', start: '2026-10-24', end: '2026-10-24',
  people: ['Merlin E.', 'Anna Maria S.'], ownState: 'own', coAssignees: [], sourcePath: '/synthetic', identity: 'source-row-only', periodBasis: 'displayed-calendar-days', ...overrides,
});
function overview(): DutyOverview {
  const own = item('own'), club = item('club', { ownState: 'unknown', people: [] });
  return { status: 'partial', window: { start: '2026-10-23', end: '2026-11-01' }, items: [own, club], ownItems: [own],
    laterOwn: [item('later', { start: '2026-11-08', end: '2026-11-08', period: '08.11.2026 09:00 - 08.11.2026 17:00' })],
    unplaced: [item('unplaced', { duty: '', start: null, end: null, period: '', people: [], periodBasis: 'unknown' })],
    clubLabel: 'Synthetic soaring club', retrievedAt: '2026-10-23T10:00:00.000Z', coverageMessage: 'Erfasster Seitenausschnitt · Vollständigkeit und Partner ungeprüft.' };
}

test('club heading uses the saved full name and allows long names to wrap without hiding their suffix', () => {
  const f = fixture(), name = 'Synthetic Segelflugverein mit einem langen Namen und wesentlichem Ortszusatz';
  for (const clubLabel of ['Synthetic soaring club', name]) {
    const view = f.heading.ClubHeading!({ clubLabel });
    const title = f.nodes(view).find(node => node.props.accessibilityRole === 'header')!;
    assert.equal(f.text(title), clubLabel);
    assert.equal(title.props.numberOfLines, undefined);
    assert.equal(title.props.allowFontScaling, undefined);
    assert.equal(title.props.adjustsFontSizeToFit, undefined);
    const photo=f.nodes(view).find(node=>node.type==='ImageBackground')!;assert.equal(photo.props.accessible,false);
    assert.doesNotMatch(f.text(view),/Ort unbekannt/);
  }
});

test('unknown club names use an honest qualifier without inventing a club or location', () => {
  const f = fixture();
  for (const clubLabel of [undefined, null, '', '  ']) {
    const view = f.heading.ClubHeading!({ clubLabel });
    assert.equal(f.text(f.nodes(view).find(node => node.props.accessibilityRole === 'header')), 'Vereinsname unbekannt');
    assert.match(f.text(view), /Vereinsname unbekannt/);
    assert.doesNotMatch(f.text(view), /Ort unbekannt/);
  }
});

test('compact duties show grouped facts and names with technical source notes confined to details', () => {
  const f = fixture(); let opened = 0;
  const view = f.roster.DutyRoster!({ overview: overview(), onOpen: () => opened++ });
  const text = f.text(view);
  for (const expected of ['Synthetic soaring club', 'Eigene Dienste', 'Weitere Vereinsdienste', 'Synthetic own', 'Synthetic club',
    '24.10.2026', 'Merlin E. · Anna Maria S.', 'Personen unbekannt']) assert.ok(text.includes(expected), expected);
  assert.doesNotMatch(text, /\d{2}:\d{2}/);
  const duty = f.nodes(view).find(node => node.type === 'View' && node.children.length === 2 && f.text(node.children[0]) === 'Synthetic own 24.10.2026')!;
  assert.ok(duty, 'entry has a title/date row followed by its people row');
  assert.equal(f.text(duty.children[1]), 'Merlin E. · Anna Maria S.');
  for (const label of f.nodes(duty).filter(node => node.type === 'Label')) assert.equal(label.props.numberOfLines, undefined, 'large fonts remain readable');
  assert.doesNotMatch(text, /Personen laut Quellzeile|Zuordnung|Teilansicht|Quellenstand|Quellzeilen|Partner ungeprüft|Verein laut Quelle/);
  assert.doesNotMatch(text, /Synthetic later/);
  const action = f.nodes(view).find(node => node.type === 'Action')!;
  assert.equal(f.text(action), 'Alle Dienste ansehen'); action.props.onPress(); assert.equal(opened, 1);
});

test('expanded duties retain later and unplaced evidence while unavailable data never claims an empty roster', () => {
  const f = fixture(), data = overview();
  const view = f.roster.DutyRoster!({ overview: data, expanded: true });
  assert.equal(f.nodes(view).find(node => node.type === 'Section')!.props.title, 'Dienstübersicht');
  const text = f.text(view);
  for (const expected of ['Verein laut Quelle: Synthetic soaring club', 'Dienste im Zeitraum', 'Spätere eigene Dienste · bis zu drei aus dem Ausschnitt',
    'Synthetic later', 'Zeitraum ungeklärt', 'Dienstname unbekannt', 'Zeitraum unbekannt', data.coverageMessage]) assert.ok(text.includes(expected), expected);
  assert.equal(f.nodes(view).some(node => node.type === 'Action'), false);
  const unavailable = f.text(f.roster.DutyRoster!({ overview: { ...data, status: 'unavailable', clubLabel: '', items: [], ownItems: [], laterOwn: [], unplaced: [], retrievedAt: null } }));
  assert.match(unavailable, /Dienstplan unbekannt/);
  assert.match(unavailable, /Eigene Dienste im Zeitraum unbekannt/);
  assert.match(unavailable, /Weitere Vereinsdienste unbekannt/);
  assert.match(unavailable, /Vereinsname unbekannt/);
  assert.doesNotMatch(unavailable, /Keine Dienste/);
});

test('duty dates omit clocks, retain full intervals and show unknown rather than parsing raw evidence again', () => {
  const f = fixture();
  for (const [start, end, expected] of [
    ['2026-10-24', '2026-10-24', '24.10.2026'],
    ['2026-10-24', '2026-10-25', '24.–25.10.2026'],
    ['2026-10-31', '2026-11-01', '31.10.–01.11.2026'],
    ['2026-12-31', '2027-01-01', '31.12.2026–01.01.2027'],
    [null, null, 'Zeitraum unbekannt'], ['2026-10-24', null, 'Zeitraum unbekannt'],
  ]) assert.equal(f.roster.dutyDates!({ start, end }), expected);
});

test('native preview feeds raw fictional capture names through the real projection into both roster views', () => {
  const f=fixture(),data=createDesignPreviewData().dutyOverview;
  assert.deepEqual(data.ownItems[0]!.people,['Merlin E.']);
  assert.deepEqual(data.items[1]!.people,['Anna Maria S.','Emil E.']);
  for(const expanded of [false,true]) {
    const text=f.text(f.roster.DutyRoster!({overview:data,expanded}));
    assert.ok(text.includes('Merlin E.'));
    assert.ok(text.includes('Anna Maria S. · Emil E.'));
    assert.doesNotMatch(text,/Example,|Synthetic,|Demo Pilot [AB]\./);
  }
});


test('club-only roster keeps full evidence and disclosure semantics without changing the Start default',()=>{
 const f=fixture(),data=overview();
 assert.deepEqual(f.roster.DutyRoster!({overview:data}),f.roster.DutyRoster!({overview:data,presentation:'start'}));
 let opened=0;
 const compact=f.roster.DutyRoster!({overview:data,presentation:'club',onOpen:()=>opened++});
 assert.ok(f.nodes(compact).some(n=>n.type==='Section'&&n.props.title==='Dienste'));
 f.nodes(compact).find(n=>n.type==='Section')!.props.onPress();assert.equal(opened,1);
 assert.doesNotMatch(f.text(compact),/Synthetic later|Synthetic unplaced/);
 let full=f.roster.DutyRoster!({overview:data,presentation:'club',expanded:true});
 for(const text of ['Synthetic later','Zeitraum ungeklärt','Zeitraum unbekannt',data.coverageMessage]) assert.ok(f.text(full).includes(text));
 assert.doesNotMatch(f.text(full),/Zuordnung vorläufig|Quellenstand/);
 const disclosure=f.nodes(full).find(n=>n.props.accessibilityLabel==='Quellendetails Dienste')!;
 assert.equal(disclosure.props.accessibilityState.expanded,false);disclosure.props.onPress();
 full=f.roster.DutyRoster!({overview:data,presentation:'club',expanded:true});
 assert.match(f.text(full),/Verein laut Quelle: Synthetic soaring club/);assert.match(f.text(full),/Zuordnung vorläufig/);assert.match(f.text(full),/Quellenstand/);
 assert.equal(f.nodes(full).find(n=>n.props.accessibilityLabel==='Quellendetails Dienste')!.props.accessibilityState.expanded,true);
 const missing=f.text(f.roster.DutyRoster!({overview:{...data,status:'unavailable',items:[],laterOwn:[],unplaced:[]},presentation:'club',expanded:true}));
 assert.match(missing,/Dienstplan unbekannt/);assert.match(missing,/Dienste im Zeitraum unbekannt/);assert.doesNotMatch(missing,/Keine zeitlich passenden/);
});

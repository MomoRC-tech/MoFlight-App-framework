import { loadFlightPresentation } from './flight-presentation-fixture';
import * as ownFlightModel from '../../apps/platform-lab/src/mobile/own-flight-model';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as statisticsModel from '../../apps/platform-lab/src/mobile/statistics-overlay-model.ts';
import { monthlySeasonForCoverage } from '../../apps/platform-lab/src/mobile/season-dashboard-model.ts';
import { formatReportedMinutes } from '../../apps/platform-lab/src/mobile/real-flight-statistics.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';
import * as captureReview from '../../apps/platform-lab/src/vereinsflieger/capture-review.ts';
import { ownFlightFixture } from './own-flight-fixture.ts';
import * as helpCatalog from '../../apps/platform-lab/src/mobile/help-catalog.ts';

interface Element { type: unknown; props: Record<string, any>; children: any[] }
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/StatisticsOverlay.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

function fixture(initialSection: statisticsModel.StatisticsSection = 'overview') {
  let index = 0, fontScale=1;const keyboardEvents:string[]=[];
  const hooks: any[] = [];
  const react = {
    createElement: (type: unknown, props: Record<string, any>, ...children: unknown[]): Element => {if(type==='TextInput'&&props?.ref)props.ref.current={focus:()=>keyboardEvents.push('focus:'+props.accessibilityLabel)};return typeof type==='function'?type({...props,children}):({ type, props: props ?? {}, children: children.flat(Infinity) });},
    useMemo: (make: () => unknown) => { index++; return make(); },
    useState: (initial: unknown) => { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value: unknown) => { hooks[i] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks[i]) : value; }]; },
    useRef: (initial: unknown) => { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
  };
  const colors = { cyan: '#00c8ff', border: '#254255', text: '#eef7ff', muted: '#91a9bc', raised: '#1d3242', background: '#0b141c', card: '#14232f', blue: '#1682c4' };
  const leaf = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...leaf(['ActivityIndicator', 'ImageBackground', 'Pressable', 'ScrollView', 'TextInput', 'View']), Keyboard: {dismiss(){keyboardEvents.push('keyboard-dismiss');}}, StyleSheet: { create: (value: unknown) => value, absoluteFillObject: { position: 'absolute' } } },
    './theme': { ...leaf(['Action', 'Card', 'Chip', 'Empty', 'Label', 'Section']), colors, ui: { pressed: { opacity: .72 } } },
    './real-flight-statistics': { formatReportedMinutes }, './SeasonMonthlyCharts': leaf(['SeasonMonthlyCharts']),
    '../vereinsflieger/capture-review': captureReview,
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
    './AppHeader': leaf(['AppHeader']),
    './help-catalog': helpCatalog,
    './season-dashboard-model': { monthlySeasonForCoverage }, '../vereinsflieger/retrieval-policy': { planFlightRetrieval },
    './statistics-overlay-model': statisticsModel,
  };
  modules['./own-flight-model']=ownFlightModel;
  Object.assign(modules,loadFlightPresentation(modules));
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (name: string) => {
    if (name.startsWith('../../assets/')) return name;
    assert.ok(name in modules, `Unexpected dependency ${name}`); return modules[name];
  } });
  const { flights: fixtureFlights } = ownFlightFixture();
  const flights = structuredClone(fixtureFlights.slice(0, 2));
  flights[0]!.facts.assessment.date = { ...flights[0]!.facts.assessment.date, state: 'parsed', value: '2026-06-18' };
  flights[1]!.facts.assessment.date = { ...flights[1]!.facts.assessment.date, state: 'parsed', value: '2025-06-18' };
  flights[0]!.facts.assessment.durations.flight = { state: 'known', minutes: 90, evidence: [] };
  flights[1]!.facts.assessment.durations.flight = { state: 'known', minutes: 60, evidence: [] };
  const savedRetrievals = [
    { from: '2025-01-01', to: '2025-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
    { from: '2026-01-01', to: '2026-10-22', retrievedAt: '2026-10-22T10:00:00.000Z', savedAt: '2026-10-22T10:00:00.000Z' },
  ];
  const opened: string[] = [];
  const events: string[] = [];
  let helpEnabled=true;
  const headerActions: Element = { type: 'HeaderActions', props: {}, children: [] };
  const feedback: Element = { type: 'SyncFeedback', props: {}, children: [] };
  const data: any = {
    view: { flights, snapshot: { ownerId: 'owner', storeId: 'store', account: { accountRef: 'account' }, savedRetrievals } },
    phase: 'ready', detail: null, detailBusy: false, detailError: null,
    openDetail: async (flight: { flightId: string }) => { opened.push(flight.flightId); },
    clearDetail() { events.push('clear-detail'); }, reload: async () => {events.push('reload');},
  };
  let back = () => false;
  const render = () => { index = 0; const tree = exports.StatisticsOverlay({ data, helpEnabled, onHelp:(id:string)=>events.push('help:'+id), today: '2026-10-22', fontScale, initialSection, onClose: () => events.push('close'), headerActions, feedback, onBackHandler: (handler: () => boolean) => { back = handler; } }); return tree as Element; };
  const nodes = (tree: Element) => {
    const found: Element[] = [];
    const visit = (value: any) => { if (!value || typeof value !== 'object' || !('children' in value)) return; found.push(value); value.children.forEach(visit); };
    visit(tree); return found;
  };
  return { setFontScale:(value:number)=>{fontScale=value;}, keyboardEvents, setHelpEnabled:(enabled:boolean)=>{helpEnabled=enabled;}, data, flights, opened, events, headerActions, feedback, render, nodes: () => nodes(render()), back: () => back() };
}

test('Start role metrics enter the role section for the selected year',()=>{
  const f=fixture('roles');
  const sections=f.nodes().filter(node=>node.type==='Section').map(node=>node.props.title);
  assert.ok(sections.includes('Ausbildung & Besatzung'));
  assert.ok(!sections.includes('Jahresvergleich'));
  assert.ok(f.nodes().some(node=>node.type==='Chip'&&node.props.title==='Flugrollen'&&node.props.selected));
});

test('previous-year drilldown keeps its same-date scope, restores Back, and rejects facts moved outside that scope', () => {
  const f = fixture();
  const annual = f.nodes().find(node => node.type === 'Section' && String(node.props.title).startsWith('Jahresvergleich'));
  assert.ok(annual, 'the annual comparison is rendered for the selected current year');
  const previous = f.nodes().find(node => node.type === 'Action' && node.children.includes('Vorjahresflüge ansehen'))!;
  assert.ok(previous);
  previous.props.onPress();
  let nodes = f.nodes();
  assert.equal(nodes.find(node => node.type === 'AppHeader')!.props.title, 'Flüge 2025');
  assert.ok(nodes.some(node => node.type === 'Label' && node.children.join('').includes('gefiltert nach 2025-01-01 bis 2025-10-22')));
  const flightCard = nodes.find(node => node.type === 'Card' && typeof node.props.onPress === 'function')!;
  flightCard.props.onPress();
  assert.deepEqual(f.opened, ['flight-1']);
  assert.equal(f.back(), true, 'contextual Back returns from saved detail to the contributor list');
  f.render();
  f.flights[1]!.facts.assessment.date = { ...f.flights[1]!.facts.assessment.date, state: 'parsed', value: '2026-05-01' };
  nodes = f.nodes();
  assert.ok(nodes.some(node => node.type === 'Empty' && node.props.title === 'Keine passenden Flüge'));
  assert.ok(!nodes.some(node => node.type === 'Card' && typeof node.props.onPress === 'function'), 'a refreshed flight outside the captured prior-year range cannot remain in the drilldown');
});

test('statistics coverage detail explains incomplete saved season periods', () => {
  const f = fixture();
  let nodes = f.nodes();
  nodes.find(node=>node.props.accessibilityLabel==='Statistikdatenstand')!.props.onPress();
  nodes=f.nodes();
  assert.ok(nodes.some(node => node.type === 'Label' && node.children.join('').includes('die Abdeckung kann je Jahr abweichen oder unvollständig sein.')));
  assert.ok(nodes.some(node => node.type === 'Label' && node.children.join('').includes('Aktuell bis 2026-10-22; Vorjahr bis gleicher Kalendertag. Angaben beruhen auf den gespeicherten Zeiträumen.')));

  f.data.view.snapshot.savedRetrievals = f.data.view.snapshot.savedRetrievals.slice(1);
  nodes = f.nodes();
  assert.ok(nodes.some(node => node.type === 'Label' && node.children.join('').includes('Vergleich nicht berechnet: gespeicherte Abrufe decken beide Zeiträume nicht vollständig ab.')));
});


test('launch and category groups navigate only to their exact period-scoped contributors',()=>{
  const f=fixture();
  for(const flight of f.flights){
    flight.facts.assessment.observation.headers.push('Luftfahrzeugart','S-Art');
    flight.facts.assessment.observation.row.values.push('Segelflugzeug','W');
  }
  const openTab=(title:string)=>f.nodes().find(n=>n.type==='Chip'&&n.props.title===title)!.props.onPress();
  for(const [tab,label] of [['Startarten','Winde'],['Flugzeuge','Segelflugzeug']]){
    openTab(tab!);
    const group=f.nodes().find(n=>n.type==='Card'&&n.props.label===`${label} · 1 Flüge ansehen`);
    assert.ok(group);group.props.onPress();
    const rows=f.nodes().filter(n=>n.type==='Card'&&n.props.onPress);
    assert.equal(rows.length,1);rows[0]!.props.onPress();
    assert.equal(f.opened.at(-1),f.flights[0]!.flightId);
    f.back();f.render();f.back();f.render();
  }
});


test('an all-unknown classification group never labels its missing time as known',()=>{
  const f=fixture();f.flights[0]!.facts.assessment.durations.flight={state:'unknown',minutes:null,evidence:[]};
  f.nodes().find(n=>n.type==='Chip'&&n.props.title==='Startarten')!.props.onPress();
  const labels=f.nodes().filter(n=>n.type==='Label').flatMap(n=>n.children).filter(value=>typeof value==='string');
  assert.ok(labels.includes('1× Zeit unbekannt'));
  assert.ok(!labels.some(label=>label.includes('unbekannt bekannt')));
});


test('Statistics owns its child-page header, local section navigation and sync feedback',()=>{
 const f=fixture();
 let nodes=f.nodes();
 const header=nodes.find(node=>node.type==='AppHeader')!;
 assert.equal(header.props.variant,'page');
 assert.equal(header.props.title,'Flugstatistik');
 assert.equal(header.props.profile,undefined);
 assert.ok(header.children.includes(f.headerActions));
 assert.ok(nodes.includes(f.feedback));
 const tabs=nodes.find(node=>node.props.accessibilityRole==='tablist')!;
 assert.equal(tabs.type,'ScrollView');assert.equal(tabs.props.horizontal,true);
 assert.deepEqual(tabs.children.map((node:Element)=>node.props.title),['Überblick','Flugzeuge','Flugdauer','Startarten','Flugrollen']);
 tabs.children.at(-1)!.props.onPress();nodes=f.nodes();
 assert.ok(nodes.some(node=>node.type==='Chip'&&node.props.title==='Flugrollen'&&node.props.selected));
 assert.equal(nodes.find(node=>node.type==='AppHeader')!.props.title,'Flugstatistik');
 assert.equal(f.back(),false,'A section has no hidden intermediate route');
 nodes.find(node=>node.type==='AppHeader')!.props.back();
 assert.deepEqual(f.events,['close'],'Toolbar Back closes Statistics at its root');
});

test('Statistics contributor and detail headers restore the exact route and saved scroll position',()=>{
 const f=fixture();
 const content=()=>f.nodes().find(node=>node.type==='ScrollView'&&node.props.onScroll)!;
 const header=()=>f.nodes().find(node=>node.type==='AppHeader')!;
 content().props.onScroll({nativeEvent:{contentOffset:{y:216}}});
 f.nodes().find(node=>node.type==='Action'&&node.children.includes('Vorjahresflüge ansehen'))!.props.onPress();
 assert.equal(header().props.title,'Flüge 2025');
 content().props.onScroll({nativeEvent:{contentOffset:{y:84}}});
 f.nodes().find(node=>node.type==='Card'&&typeof node.props.onPress==='function')!.props.onPress();
 assert.equal(header().props.title,'18.06.25 · D-T001');
 assert.equal(f.back(),true,'Android Back leaves detail before closing its contributor route');
 assert.equal(header().props.title,'Flüge 2025');assert.equal(content().props.contentOffset.y,84);
 assert.deepEqual(f.events,['clear-detail']);
 header().props.back();
 assert.equal(header().props.title,'Flugstatistik');assert.equal(content().props.contentOffset.y,216);
 assert.deepEqual(f.events,['clear-detail'],'Toolbar Back returns to the section without closing Statistics');
 header().props.back();assert.deepEqual(f.events,['clear-detail','close']);
});


test('switching Statistics sections restores each section scroll offset',()=>{
 const f=fixture();
 const content=()=>f.nodes().find(node=>node.type==='ScrollView'&&node.props.onScroll)!;
 const section=(title:string)=>f.nodes().find(node=>node.type==='Chip'&&node.props.title===title)!.props.onPress();
 content().props.onScroll({nativeEvent:{contentOffset:{y:312}}});
 section('Flugzeuge');assert.equal(content().props.contentOffset.y,0);
 content().props.onScroll({nativeEvent:{contentOffset:{y:96}}});
 section('Überblick');assert.equal(content().props.contentOffset.y,312);
 section('Flugzeuge');assert.equal(content().props.contentOffset.y,96);
 assert.deepEqual(f.events,[]);
});


test('Statistics detail shares source disclosure and reopening from contributors resets it',()=>{
  const f=fixture();
  f.nodes().find(n=>n.type==='Action'&&n.children.includes('Vorjahresflüge ansehen'))!.props.onPress();
  const open=()=>f.nodes().find(n=>n.type==='Card'&&typeof n.props.onPress==='function')!.props.onPress();
  open();const item=f.flights[1]!;f.data.detail={...item,factHistory:[item.facts],pending:[]};
  const disclosure=()=>f.nodes().find(n=>n.props.accessibilityLabel==='Originale Anbieterfelder')!;
  assert.ok(disclosure());assert.equal(disclosure().props.accessibilityState.expanded,false);
  disclosure().props.onPress();assert.equal(disclosure().props.accessibilityState.expanded,true);
  assert.equal(f.back(),true);f.render();open();assert.equal(disclosure().props.accessibilityState.expanded,false);
  assert.ok(f.opened.every(id=>id===item.flightId));
});


test('custom period cancel and Back retain the applied period; apply closes only the editor',()=>{
  const f=fixture();
  const custom=()=>f.nodes().find(n=>n.type==='Chip'&&n.props.title==='Eigener Zeitraum')!;
  const input=(label:string)=>f.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label)!;
  const action=(label:string)=>f.nodes().find(n=>n.type==='Action'&&n.children.includes(label))!;
  custom().props.onPress();input('Zeitraum von').props.onChangeText('2025-01-01');input('Zeitraum bis').props.onChangeText('2025-12-31');
  action('Abbrechen').props.onPress();assert.ok(!f.nodes().some(n=>n.type==='TextInput'));
  assert.equal(custom().props.selected,false);
  custom().props.onPress();assert.equal(input('Zeitraum von').props.value,'2025-01-01');
  assert.equal(f.back(),true);assert.equal(custom().props.selected,false);assert.deepEqual(f.events,[]);
  custom().props.onPress();action('Zeitraum übernehmen').props.onPress();
  assert.equal(custom().props.selected,true);assert.ok(!f.nodes().some(n=>n.type==='TextInput'));
  assert.ok(f.nodes().some(n=>n.type==='Label'&&n.children.includes('2025-01-01 – 2025-12-31')));
});

test('Statistics failure is not first use, and an empty period disables its contributor action',()=>{
  const f=fixture();f.data.phase='failed';f.data.view=null;
  assert.deepEqual(f.nodes().filter(n=>n.type==='Empty').map(n=>n.props.title),['Statistik nicht lesbar']);
  const g=fixture();g.flights.splice(0);
  assert.equal(g.nodes().filter(n=>n.type==='Empty'&&n.props.title==='Noch keine gespeicherten Flüge').length,1);
  assert.equal(g.nodes().find(n=>n.type==='Action'&&n.children.includes('Beitragende Flüge ansehen'))!.props.disabled,true);
});

test('Statistics detail can retry the current local flight and offers preference-controlled PIC help',()=>{
  const f=fixture();f.nodes().find(n=>n.type==='Action'&&n.children.includes('Vorjahresflüge ansehen'))!.props.onPress();
  f.nodes().find(n=>n.type==='Card'&&typeof n.props.onPress==='function')!.props.onPress();
  f.data.detailError='Local read failed';
  f.nodes().find(n=>n.type==='Action'&&n.children.includes('Flugdetails erneut prüfen'))!.props.onPress();assert.deepEqual(f.opened,['flight-1','flight-1']);
  const item=f.flights[1]!;f.data.detail={...item,factHistory:[item.facts],pending:[]};
  const help=f.nodes().find(n=>n.props.accessibilityLabel==='Info zu PIC');
  assert.ok(help);help.props.onPress();
  f.nodes().find(n=>n.type==='Action'&&n.children.includes('Mehr erfahren'))!.props.onPress();assert.ok(f.events.includes('help:pic'));
  f.setHelpEnabled(false);assert.ok(!f.nodes().some(n=>n.props.accessibilityLabel==='Info zu PIC'));
});


test('enlarged Statistics sections retain navigation and date submit moves focus without applying drafts',()=>{
 const f=fixture();f.setFontScale(1.6);
 const tabs=f.nodes().find(n=>n.props.accessibilityRole==='tablist')!;assert.equal(tabs.type,'View');
 tabs.children.find((n:Element)=>n.props.title==='Flugrollen')!.props.onPress();
 assert.ok(f.nodes().some(n=>n.type==='Chip'&&n.props.title==='Flugrollen'&&n.props.selected));
 f.nodes().find(n=>n.type==='Chip'&&n.props.title==='Eigener Zeitraum')!.props.onPress();
 const input=(label:string)=>f.nodes().find(n=>n.type==='TextInput'&&n.props.accessibilityLabel===label)!;
 input('Zeitraum von').props.onChangeText('2025-01-01');input('Zeitraum von').props.onSubmitEditing();
 assert.equal(f.keyboardEvents.at(-1),'focus:Zeitraum bis');
 input('Zeitraum bis').props.onSubmitEditing();assert.equal(f.keyboardEvents.at(-1),'keyboard-dismiss');
 assert.equal(f.nodes().find(n=>n.type==='Chip'&&n.props.title==='Eigener Zeitraum')!.props.selected,false);
 assert.equal(input('Zeitraum von').props.value,'2025-01-01');
});

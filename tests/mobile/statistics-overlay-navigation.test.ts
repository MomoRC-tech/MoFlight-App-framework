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
    './AppHeader': leaf(['AppHeader']), './StatisticsExplorer':leaf(['StatisticsExplorer']),
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

const explorer=(f:ReturnType<typeof fixture>)=>f.nodes().find(n=>n.type==='StatisticsExplorer')!;
const previousScope={kind:'custom' as const,from:'2025-01-01',to:'2025-10-22'};
const openPrevious=(f:ReturnType<typeof fixture>)=>explorer(f).props.onFlights('Vorjahresflüge',['flight-1','foreign'],previousScope);
const openDetail=(f:ReturnType<typeof fixture>)=>f.nodes().find(n=>n.type==='Card'&&typeof n.props.onPress==='function')!.props.onPress();
test('Statistics keeps contextual header, feedback, year and initial role chart',()=>{
  const f=fixture('roles');assert.equal(explorer(f).props.initialChart,'roles');assert.equal(explorer(f).props.period.year,2026);
  const header=f.nodes().find(n=>n.type==='AppHeader')!;assert.equal(header.props.title,'Flugstatistik');assert.ok(header.children.includes(f.headerActions));assert.ok(f.nodes().includes(f.feedback));
});
test('previous-year contributors retain exact IDs and scope; moved records disappear',()=>{
  const f=fixture();openPrevious(f);assert.match(JSON.stringify(f.render()),/2025-01-01 bis 2025-10-22/);
  assert.equal(f.nodes().filter(n=>n.type==='Card'&&typeof n.props.onPress==='function').length,1);
  f.flights[1]!.facts.assessment.date={...f.flights[1]!.facts.assessment.date,state:'parsed',value:'2024-01-01'};
  assert.ok(f.nodes().some(n=>n.type==='Empty'&&n.props.title==='Keine passenden Flüge'));
  assert.equal(f.back(),true);assert.equal(explorer(f).props.period.year,2026);
});
test('Back first dismisses chart-local UI and then closes the statistics page',()=>{
  const f=fixture();let dismiss=true;explorer(f).props.onBackHandler(()=>{const handled=dismiss;dismiss=false;return handled;});
  const header=()=>f.nodes().find(n=>n.type==='AppHeader')!;
  header().props.back();assert.deepEqual(f.events,[]);header().props.back();assert.deepEqual(f.events,['close']);
});
test('detail and contributor Back preserve exact caller and remembered chart scroll',()=>{
  const f=fixture();const scroll=()=>f.nodes().find(n=>n.type==='ScrollView')!;
  scroll().props.onScroll({nativeEvent:{contentOffset:{y:97}}});openPrevious(f);scroll().props.onScroll({nativeEvent:{contentOffset:{y:45}}});
  openDetail(f);assert.deepEqual(f.opened,['flight-1']);assert.equal(f.back(),true);assert.equal(scroll().props.contentOffset.y,45);
  assert.equal(f.back(),true);assert.equal(scroll().props.contentOffset.y,97);assert.equal(explorer(f).props.initialChart,'monthly');
});
test('source disclosure consumes Back and reopening resets source state',()=>{
  const f=fixture();openPrevious(f);openDetail(f);const item=f.flights[1]!;f.data.detail={...item,factHistory:[item.facts],pending:[]};
  const disclosure=()=>f.nodes().find(n=>n.props.accessibilityLabel==='Originale Anbieterfelder')!;
  disclosure().props.onPress();assert.equal(disclosure().props.accessibilityState.expanded,true);
  assert.equal(f.back(),true);assert.equal(disclosure().props.accessibilityState.expanded,false);
  assert.equal(f.back(),true);f.render();openDetail(f);assert.equal(disclosure().props.accessibilityState.expanded,false);
});
test('local detail retry and preference-controlled PIC help remain available',()=>{
  const f=fixture();openPrevious(f);openDetail(f);f.data.detailError='Local read failed';
  f.nodes().find(n=>n.type==='Action'&&n.children.includes('Flugdetails erneut prüfen'))!.props.onPress();assert.deepEqual(f.opened,['flight-1','flight-1']);
  const item=f.flights[1]!;f.data.detail={...item,factHistory:[item.facts],pending:[]};
  f.nodes().find(n=>n.props.accessibilityLabel==='Info zu PIC')!.props.onPress();f.nodes().find(n=>n.type==='Action'&&n.children.includes('Mehr erfahren'))!.props.onPress();assert.ok(f.events.includes('help:pic'));
  f.setHelpEnabled(false);assert.equal(f.nodes().some(n=>n.props.accessibilityLabel==='Info zu PIC'),false);
});
test('read failures offer local retry without claiming first-use or starting provider work',()=>{
  const f=fixture();f.data.phase='failed';f.data.view=null;
  assert.deepEqual(f.nodes().filter(n=>n.type==='Empty').map(n=>n.props.title),['Statistik nicht lesbar']);
  f.nodes().find(n=>n.type==='Action'&&n.children.includes('Gespeicherte Flüge erneut prüfen'))!.props.onPress();assert.deepEqual(f.events,['reload']);
});

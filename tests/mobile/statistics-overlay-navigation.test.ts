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

function fixture() {
  let index = 0;
  const hooks: any[] = [];
  const react = {
    createElement: (type: unknown, props: Record<string, any>, ...children: unknown[]): Element => typeof type==='function'?type({...props,children}):({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useMemo: (make: () => unknown) => { index++; return make(); },
    useState: (initial: unknown) => { const i = index++; if (!(i in hooks)) hooks[i] = initial; return [hooks[i], (value: unknown) => { hooks[i] = typeof value === 'function' ? (value as (previous: unknown) => unknown)(hooks[i]) : value; }]; },
    useRef: (initial: unknown) => { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i]; },
  };
  const colors = { cyan: '#00c8ff', border: '#254255', text: '#eef7ff', muted: '#91a9bc', raised: '#1d3242', background: '#0b141c', card: '#14232f', blue: '#1682c4' };
  const leaf = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...leaf(['ActivityIndicator', 'ImageBackground', 'Pressable', 'ScrollView', 'TextInput', 'View']), StyleSheet: { create: (value: unknown) => value, absoluteFillObject: { position: 'absolute' } } },
    './theme': { ...leaf(['Action', 'Card', 'Chip', 'Empty', 'Label', 'Section']), colors, ui: { pressed: { opacity: .72 } } },
    './real-flight-statistics': { formatReportedMinutes }, './SeasonMonthlyCharts': leaf(['SeasonMonthlyCharts']),
    '../vereinsflieger/capture-review': captureReview,
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
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
  const data: any = {
    view: { flights, snapshot: { ownerId: 'owner', storeId: 'store', account: { accountRef: 'account' }, savedRetrievals } },
    phase: 'ready', detail: null, detailBusy: false, detailError: null,
    openDetail: async (flight: { flightId: string }) => { opened.push(flight.flightId); },
    clearDetail() {}, reload: async () => {},
  };
  let back = () => false;
  const render = () => { index = 0; const tree = exports.StatisticsOverlay({ data, today: '2026-10-22', fontScale: 1, onBackHandler: (handler: () => boolean) => { back = handler; } }); return tree as Element; };
  const nodes = (tree: Element) => {
    const found: Element[] = [];
    const visit = (value: any) => { if (!value || typeof value !== 'object' || !('children' in value)) return; found.push(value); value.children.forEach(visit); };
    visit(tree); return found;
  };
  return { data, flights, opened, render, nodes: () => nodes(render()), back: () => back() };
}

test('previous-year drilldown keeps its same-date scope, restores Back, and rejects facts moved outside that scope', () => {
  const f = fixture();
  const annual = f.nodes().find(node => node.type === 'Section' && String(node.props.title).startsWith('Jahresvergleich'));
  assert.ok(annual, 'the annual comparison is rendered for the selected current year');
  const previous = f.nodes().find(node => node.type === 'Action' && node.children.includes('Vorjahresflüge ansehen'))!;
  assert.ok(previous);
  previous.props.onPress();
  let nodes = f.nodes();
  assert.ok(nodes.some(node => node.type === 'Section' && node.props.title === 'Flüge 2025'));
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

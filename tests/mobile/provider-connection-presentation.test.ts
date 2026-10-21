import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { ConnectionSession } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import { retrievalFailureHint } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import { connectionGuidance, connectionSymbol } from '../../apps/platform-lab/src/mobile/connection-guidance.ts';
import { providerUrl } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import type { useAccessController } from '../../apps/platform-lab/src/vereinsflieger/use-access-controller.tsx';
import { captureFixture } from './capture-review-fixture.ts';
import { INFORMATION_TYPES } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';

type Controller = ReturnType<typeof useAccessController>;
interface Element { type: unknown; props: Record<string, any>; children: unknown[] }
const observed = { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const at = '2026-10-18T07:00:00.000Z';
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ProviderConnection.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

// Run the real component/handlers; native rendering and leaf controls are the
// only replacements. Disclosure tests make no provider/storage implementation.
function fixture(overrides: Partial<Controller> = {}, development = false, purpose: 'existing-captures'|'own-flight-library' = 'existing-captures', guided = false, progress?: Element) {
  let index = 0;
  const hooks: unknown[] = [], effects: (() => void)[] = [], calls: string[] = [];
  const react = {
    createElement: (type: unknown, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial: unknown) {
      const i = index++;
      if (!(i in hooks)) hooks[i] = initial;
      return [hooks[i], (value: unknown) => { hooks[i] = value; }];
    },
    useEffect(effect: () => void, dependencies: unknown[]) {
      const i = index++, previous = hooks[i] as unknown[] | undefined;
      if (!previous || dependencies.some((value, n) => value !== previous[n])) { hooks[i] = dependencies; effects.push(effect); }
    },
  };
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { ...Object.fromEntries(['ActivityIndicator', 'KeyboardAvoidingView', 'Pressable', 'ScrollView', 'TextInput', 'View'].map(name => [name, name])),
      Platform: { OS: 'android' }, StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } },
    './theme': { ...Object.fromEntries(['Action', 'Card', 'IconLabel', 'Label', 'Section'].map(name => [name, name])), colors: {}, ui: { text: {} } },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
    './connection-guidance': { connectionGuidance, connectionSymbol }, '../vereinsflieger/connection-state': { retrievalFailureHint },
    './data-freshness': { dataFreshness },
    '../vereinsflieger/probe': { providerUrl },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './LegacyRecoveryReview': { LegacyRecoveryReview: 'LegacyRecoveryReview' }, './RawCaptureReview': { RawCaptureReview: 'RawCaptureReview' },
    './CapturedFlights': { CapturedFlights: 'CapturedFlights' },
    './InformationReview': { InformationReview: 'InformationReview' }, '../vereinsflieger/information': { INFORMATION_TYPES },
  };
  const exports: { ProviderConnection?: (props: unknown) => Element } = {};
  runInNewContext(source, { exports, URL, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const browser: Element = { type: 'retained-browser', props: {}, children: [] };
  const controller = {
    connection: new ConnectionSession().state, browser, browserActive: false, viewReady: true, recovery: false,
    informationCategory: 'work-hours', informationCaptures: [], informationNotice: '', informationBusy: false, informationSaving: false,
    nextInformationCategory: () => calls.push('information-category'), startInformation: () => calls.push('information-start'), stopInformation: () => calls.push('information-stop'),
    retryInformation: () => calls.push('information-retry'), reloadInformation: async () => { calls.push('information-reload'); },
    informationRetryReady: false, informationNeedsReload: false, informationCanReload: true, informationLoading: false,
    setVisible: () => calls.push('provider-visible'),
    original: { current: null }, restoring: { current: false }, result: 'none', loginNotice: 'none',
    disconnectNotice: 'none', clearNotice: 'none', credentialNotice: 'none', proofNotice: 'none',
    connect: () => calls.push('connect'), checkConnection: (action = 'check') => calls.push(action),
    dismissLogin: () => calls.push('dismiss'), useLogin: () => calls.push('saved-login'),
    backWithinProvider: () => calls.push('provider-back'), canGoBack: false,
    confirmConnection: () => calls.push('confirm'), clearLocalSession: (proof?: boolean) => calls.push(proof ? 'proof' : 'clear'),
    startDisconnect: () => calls.push('logout'), forgetLogin: () => calls.push('forget'),
    requestLegacyRecovery: () => calls.push('legacy'), cancelRetrieval: () => calls.push('cancel'),
    ...overrides,
  } as unknown as Controller;
  let tree: Element;
  function render(open = true) {
    index = 0;
    tree = exports.ProviderConnection!({ controller, open, development, purpose, guided, progress, closeDisabled:controller.informationSaving, close: () => calls.push('close') });
    while (effects.length) effects.shift()!();
    return tree;
  }
  function nodes(): Element[] {
    const result: Element[] = [];
    function visit(value: unknown) {
      if (value && typeof value === 'object' && 'children' in value) {
        const node = value as Element; result.push(node); node.children.forEach(visit);
      }
    }
    visit(tree); return result;
  }
  function content(value: unknown): string {
    if (value && typeof value === 'object' && 'children' in value) return (value as Element).children.map(content).join('');
    return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  }
  function text(value: unknown = tree): string { return content(value); }
  function button(label: string) { const node = nodes().find(n => n.type === 'Action' && text(n) === label || n.type === 'Pressable' && n.props.accessibilityLabel === label); assert.ok(node, label); return node; }
  render();
  return { controller, calls, browser, render, nodes, text, button };
}

test('the same guided progress and native browser parents survive login, retrieval and completion',()=>{
  const progress:Element={type:'progress-card',props:{},children:['Anmeldung · Flüge · Medical']};
  const f=fixture({visible:true,loaded:true,url:'https://www.vereinsflieger.de/'},false,'own-flight-library',true,progress);
  const browserParent=f.nodes().find(n=>n.children.includes(f.browser))!;
  const progressParent=f.nodes().find(n=>n.children.includes(progress))!;
  for(const state of [{visible:false,busy:true},{visible:false,busy:false}]){
    Object.assign(f.controller,state);f.render();
    assert.equal(f.nodes().find(n=>n.children.includes(f.browser))!.type,browserParent.type);
    assert.equal(f.nodes().find(n=>n.children.includes(progress))!.type,progressParent.type);
    assert.equal(f.nodes().filter(n=>n===f.browser).length,1);assert.match(f.text(),/Anmeldung · Flüge · Medical/);
  }
  f.controller.informationSaving=true;f.render();assert.equal(f.button('Schließen').props.disabled,true);
  f.button('Schließen').props.onPress();assert.deepEqual(f.calls,[]);
});

test('information page capture is explicit, respects recovery/loading and cannot cancel an atomic save', () => {
  const f = fixture({ visible: true, loaded: true, browserActive: true });
  f.button('Informationsimport').props.onPress(); f.render();
  assert.deepEqual(f.calls, []); assert.equal(f.button('Informationen dieser Seite speichern').props.disabled, false);
  f.button('Informationen dieser Seite speichern').props.onPress(); assert.deepEqual(f.calls, ['information-start']);
  for (const overrides of [{ recovery: true }, { loaded: false }, { busy: true }]) {
    const blocked = fixture({ visible: true, loaded: true, browserActive: true });
    blocked.button('Informationsimport').props.onPress(); Object.assign(blocked.controller, overrides); blocked.render();
    assert.equal(blocked.button('Informationen dieser Seite speichern').props.disabled, true);
  }
  const active = fixture({ visible: true, loaded: true, informationBusy: true, busy: true });
  assert.equal(active.button('Informationsabruf abbrechen').props.disabled, false);
  active.button('Informationsabruf abbrechen').props.onPress(); assert.deepEqual(active.calls, ['information-stop']);
  assert.equal(fixture({ visible: true, loaded: true, informationBusy: true, informationSaving: true, busy: true }).button('Informationsabruf abbrechen').props.disabled, true);
  const failed = fixture({ visible: true, loaded: true, informationNotice: 'Erfassung nicht bestätigt. Quelle nicht unterstützt.' });
  failed.button('Informationsimport').props.onPress(); failed.render(); assert.match(failed.text(), /Erfassung nicht bestätigt/);
  const saved = fixture({ browserActive: true });
  saved.nodes().find(n => n.type === 'InformationReview')!.props.onOpen(); assert.deepEqual(saved.calls, ['provider-visible']);
});

test('a recent session check does not hide an old successful flight capture or automatically refresh it', () => {
  const session = new ConnectionSession(); session.start('fresh-check');
  session.observe('fresh-check', observed, at); session.confirm();
  const snapshot = {...captureFixture(),retrievedAt:'2000-01-01T00:00:00.000Z'};
  const f = fixture({connection:session.state, snapshot, captureLoadState:'failed'});
  assert.match(f.text(), /Letzter Flugdatenabruf:/);
  assert.match(f.text(), /2000/);
  assert.match(f.text(), /Frühere Daten bleiben erhalten/);
  assert.deepEqual(f.calls, []);
});

test('fresh-library account confirmation names its real scope and performs no flight save', () => {
  const session=new ConnectionSession();session.start('confirm-source');session.observe('confirm-source',observed,at);
  const f=fixture({connection:session.state},false,'own-flight-library');
  assert.match(f.text(),/neue lokale Flugbibliothek/);assert.match(f.text(),/erst durch ausdrückliches Speichern/);
  assert.doesNotMatch(f.text(),/lokalen Demoprofil/);assert.deepEqual(f.calls,[]);
  f.button('Eigenes Anbieter-Konto bestätigen').props.onPress();assert.deepEqual(f.calls,['confirm']);
});

test('summary guidance and failure recovery distinguish repeating the source from reloading an uncertain local save', () => {
  const f = fixture({ visible: true, loaded: true, browserActive: true, informationCategory: 'training-summary', informationRetryReady: true });
  f.button('Informationsimport').props.onPress(); f.render();
  assert.match(f.text(), /eigene Ausbildung.*Auge.*Übersicht/);
  assert.deepEqual(f.calls, []); assert.equal(f.button('Ausgewählte Quelle erneut abrufen').props.disabled, false);
  f.button('Ausgewählte Quelle erneut abrufen').props.onPress(); assert.deepEqual(f.calls, ['information-retry']);
  assert.equal(f.nodes().some(n => n.type === 'Action' && f.text(n) === 'Informationen dieser Seite speichern'), false);
  Object.assign(f.controller, { informationNeedsReload: true, informationRetryReady: false }); f.render();
  assert.equal(f.nodes().some(n => n.type === 'Action' && f.text(n) === 'Ausgewählte Quelle erneut abrufen'), false);
  f.button('Gespeicherte Informationen neu laden').props.onPress(); assert.deepEqual(f.calls, ['information-retry', 'information-reload']);
  for (const overrides of [{ informationLoading: true }, { informationLoading: false, informationCanReload: false }, { informationCanReload: true, busy: true }]) {
    Object.assign(f.controller, overrides); f.render(); assert.equal(f.button('Gespeicherte Informationen neu laden').props.disabled, true);
  }
  assert.equal(f.nodes().filter(n => n.type === 'retained-browser').length, 1);
});

test('retained-source retry stays available after native document failure while ordinary capture still requires loading', () => {
  const f = fixture({ visible: true, loaded: false, browserActive: true, informationRetryReady: true });
  f.button('Informationsimport').props.onPress(); f.render();
  assert.equal(f.button('Ausgewählte Quelle erneut abrufen').props.disabled, false);
  f.button('Ausgewählte Quelle erneut abrufen').props.onPress(); assert.deepEqual(f.calls, ['information-retry']);
  for (const overrides of [{ recovery: true }, { recovery: false, busy: true }]) {
    Object.assign(f.controller, overrides); f.render();
    assert.equal(f.button('Ausgewählte Quelle erneut abrufen').props.disabled, true);
  }
  Object.assign(f.controller, { recovery: false, busy: false, informationRetryReady: false }); f.render();
  assert.equal(f.button('Informationen dieser Seite speichern').props.disabled, true);
});

test('initial and invalidated observations never promise logout or a currently valid session', () => {
  const session = new ConnectionSession();
  assert.equal(connectionGuidance(session.state, false).action, 'connect');
  assert.equal(connectionGuidance(session.state, true).action, 'check');
  session.start('a'); session.observe('a', observed, at); session.confirm();
  assert.match(connectionGuidance(session.state, true).title, /Zuletzt bestätigt:/);
  session.invalidate();
  assert.equal(connectionGuidance(session.state, true).title, 'Sitzung ungeprüft');
  const f = fixture({ connection: session.state, disconnectedAt: at, clearNotice: 'cleared' });
  assert.match(f.text(), /Sitzung ungeprüft/);
  assert.doesNotMatch(f.text(), /Abmeldung bestätigt|Browserdaten gelöscht/);
});

test('saved review stays available without a confirmed provider session, during recovery and after failed/cancelled retrieval', () => {
  const snapshot = captureFixture();
  const f = fixture({ snapshot, captureLoadState: 'ready', recovery: true, viewReady: false, status: '' });
  for (const result of ['none', 'failed', 'cancelled'] as const) {
    f.controller.result = result; f.render();
    const review = f.nodes().find(n => n.type === 'CapturedFlights'); assert.ok(review);
    assert.equal(review.props.snapshot, snapshot); assert.equal(review.props.loadState, 'ready');
    assert.equal(f.button('Flugdaten jetzt abrufen').props.disabled, true);
    assert.equal(f.nodes().filter(n => n.type === 'retained-browser').length, 1);
  }
  assert.deepEqual(f.calls, []);
  f.render(false); assert.equal(f.nodes().some(n => n.type === 'CapturedFlights'), false);
});

test('disclosures start no work, retain the browser parent and reset when the panel closes', () => {
  const f = fixture();
  const parent = () => f.nodes().find(n => n.children.includes(f.browser))!;
  assert.equal(parent().type, 'View');
  assert.equal(f.nodes().some(n => n.type === 'TextInput'), false);
  f.button('Sitzungsdetails und weitere Optionen').props.onPress(); f.render();
  f.button('Rohbelege und begrenzter Abruf').props.onPress(); f.render();
  assert.deepEqual(f.calls, []);
  assert.equal(parent().type, 'View');
  assert.equal(f.nodes().filter(n => n.type === 'retained-browser').length, 1);
  assert.ok(f.button('Gespeicherte Anmeldung verwenden'));
  assert.equal(f.button('Rohdaten abrufen').props.disabled, true);
  f.render(false); f.render();
  assert.equal(f.button('Sitzungsdetails und weitere Optionen').props.accessibilityState.expanded, false);
  assert.equal(f.nodes().some(n => n.type === 'TextInput'), false);
  assert.deepEqual(f.calls, []);
});

test('synthetic store proof requires the explicit Development route and retains busy/recovery guards', () => {
  const normal = fixture({ sessionProofAvailable: true, proofNotice: 'passed' });
  normal.button('Rohbelege und begrenzter Abruf').props.onPress(); normal.render();
  assert.doesNotMatch(normal.text(), /Synthetischer Browserstore-Test|Synthetischer Store-Test bestanden/);
  assert.deepEqual(normal.calls, []);
  const dev = fixture({ sessionProofAvailable: true, busy: true }, true);
  assert.equal(dev.button('Synthetischer Browserstore-Test').props.disabled, true);
  assert.deepEqual(dev.calls, []);
  dev.controller.busy = false; dev.controller.recovery = true; dev.render();
  assert.equal(dev.button('Synthetischer Browserstore-Test').props.disabled, true);
  dev.controller.recovery = false; dev.render();
  assert.equal(dev.button('Synthetischer Browserstore-Test').props.disabled, false);
  dev.button('Synthetischer Browserstore-Test').props.onPress();
  assert.deepEqual(dev.calls, ['proof']);
  assert.equal(dev.nodes().filter(n => n.type === 'retained-browser').length, 1);
});

test('unconfirmed account and recovery decisions remain outside optional details', () => {
  const session = new ConnectionSession(); session.start('a'); session.observe('a', observed, at);
  const f = fixture({ connection: session.state, recovery: true, legacyRecovery: true, legacyRecoveryAvailable: true });
  assert.match(f.text(), /Benutzernummer: 123/);
  assert.equal(f.nodes().filter(n => n.type === 'LegacyRecoveryReview').length, 1);
  assert.equal(f.button('Anbieteransicht wiederherstellen').props.disabled, true);
  f.button('Konto für diesen Test bestätigen').props.onPress();
  assert.deepEqual(f.calls, ['confirm']);
});

test('foreign account guidance cannot offer confirmation or expose provider values', () => {
  const session = new ConnectionSession(); session.start('a'); session.observe('a', observed, at); session.confirm();
  session.start('b'); session.observe('b', { ...observed, accountNumber: '999', clubLabel: 'FOREIGN PRIVATE LABEL' }, at);
  const f = fixture({ connection: session.state, browserActive: true });
  assert.match(f.text(), /Abruf bleibt gesperrt/);
  assert.doesNotMatch(f.text(), /999|FOREIGN PRIVATE LABEL/);
  assert.equal(f.nodes().some(n => n.type === 'Action' && f.text(n) === 'Konto für diesen Test bestätigen'), false);
  f.button('Bei Vereinsflieger anmelden').props.onPress();
  assert.deepEqual(f.calls, ['connect']);
});

test('optional controls retain busy and recovery guards; progress and cancellation stay visible', () => {
  const f = fixture({ busy: true, saving: true, browserActive: true, recovery: true, sessionClearingAvailable: true });
  assert.equal(f.button('Abruf abbrechen').props.disabled, true);
  assert.match(f.text(), /Belege werden lokal gesichert/);
  f.button('Sitzungsdetails und weitere Optionen').props.onPress(); f.render();
  for (const label of ['Gespeicherte Anmeldung verwenden', 'Bei Vereinsflieger abmelden', 'Lokale Anbietersitzung löschen', 'Gespeicherte Zugangsdaten vergessen']) assert.equal(f.button(label).props.disabled, true, label);
  f.controller.saving = false; f.controller.restoring.current = true; f.render();
  assert.equal(f.button('Abruf abbrechen').props.disabled, true);
  f.controller.restoring.current = false; f.render();
  assert.equal(f.button('Abruf abbrechen').props.disabled, false);
  assert.deepEqual(f.calls, []);
});

test('original-page provenance and loading guard survive login presentation and dismissal', () => {
  const f = fixture({ visible: true, loaded: false, url: 'https://www.vereinsflieger.de/' });
  assert.match(f.text(), /https:\/\/www.vereinsflieger.de/);
  assert.match(f.text(), /Zugangsdaten nur auf der Originalseite eingeben/);
  assert.equal(f.button('Anmeldung prüfen').props.disabled, true);
  f.controller.loaded = true; f.render(); f.button('Anmeldung prüfen').props.onPress();
  f.button('Schließen').props.onPress();
  assert.deepEqual(f.calls, ['check', 'dismiss', 'close']);
  const failed = fixture({ result: 'failed', status: 'Provider page failed to load. Previous captures preserved.' });
  assert.match(failed.text(), /Die Anbieterseite konnte nicht geladen werden/);
  assert.doesNotMatch(failed.text(), /Abruf nicht abgeschlossen/);
});

test('provider history and app close are separate; history stays disabled during owned operations', () => {
  const f = fixture({ visible: true, loaded: true, url: 'https://www.vereinsflieger.de/' });
  assert.equal(f.button('Anbieterseite zurück').props.disabled, true);
  f.controller.canGoBack = true; f.render();
  f.button('Anbieterseite zurück').props.onPress();
  assert.deepEqual(f.calls, ['provider-back']);
  for (const field of ['busy', 'saving', 'clearing', 'binding', 'loginBusy', 'disconnecting'] as const) {
    f.controller[field] = true; f.render();
    assert.equal(f.button('Anbieterseite zurück').props.disabled, true, field);
    f.controller[field] = false;
  }
  f.controller.connection = { ...f.controller.connection, phase: 'checking' }; f.render();
  assert.equal(f.button('Anbieterseite zurück').props.disabled, true);
  assert.equal(f.nodes().filter(n => n.type === 'retained-browser').length, 1);
});

test('connection marks distinguish unknown, login, unconfirmed, verified and mismatched evidence', () => {
  const session = new ConnectionSession();
  assert.equal(connectionSymbol(session.state).mark, '?');
  session.start('a'); session.fail('a', 'login-required');
  assert.equal(connectionSymbol(session.state).mark, '→');
  session.start('b'); session.observe('b', observed, at);
  assert.equal(connectionSymbol(session.state).mark, '!');
  session.confirm(); assert.equal(connectionSymbol(session.state).mark, '✓');
  session.invalidate(); assert.equal(connectionSymbol(session.state).mark, '?');
  session.start('c'); session.observe('c', { ...observed, accountNumber: '999' }, at);
  assert.equal(connectionSymbol(session.state).mark, '!');
});


test('guided provider keeps the browser parent and shows progress without import menus',()=>{
  const f=fixture({},false,'own-flight-library',true);
  assert.match(f.text(),/automatisch weiter/);
  assert.equal(f.nodes().some(n=>n.type==='InformationReview'||n.type==='CapturedFlights'),false);
  const parent=()=>f.nodes().find(n=>n.children.includes(f.browser));
  const type=parent()!.type;
  Object.assign(f.controller,{visible:true,loaded:true,browserActive:true});f.render();
  assert.equal(parent()!.type,type);
  assert.equal(f.text().includes('Informationsimport'),false);
  f.button('Anmeldung erneut prüfen').props.onPress();assert.deepEqual(f.calls,['check']);
  Object.assign(f.controller,{visible:false,saving:true,restoring:{current:false}});f.render();
  assert.equal(f.button('Abbrechen').props.disabled,true);
});

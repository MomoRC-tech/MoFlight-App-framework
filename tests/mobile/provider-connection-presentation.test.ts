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

type Controller = ReturnType<typeof useAccessController>;
interface Element { type: unknown; props: Record<string, any>; children: unknown[] }
const observed = { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const at = '2026-10-18T07:00:00.000Z';
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ProviderConnection.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;

// Run the real component/handlers; native rendering and leaf controls are the
// only replacements. Disclosure tests make no provider/storage implementation.
function fixture(overrides: Partial<Controller> = {}, development = false) {
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
    '../vereinsflieger/probe': { providerUrl },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    './LegacyRecoveryReview': { LegacyRecoveryReview: 'LegacyRecoveryReview' }, './RawCaptureReview': { RawCaptureReview: 'RawCaptureReview' },
  };
  const exports: { ProviderConnection?: (props: unknown) => Element } = {};
  runInNewContext(source, { exports, URL, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const browser: Element = { type: 'retained-browser', props: {}, children: [] };
  const controller = {
    connection: new ConnectionSession().state, browser, browserActive: false, viewReady: true,
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
    tree = exports.ProviderConnection!({ controller, open, development, close: () => calls.push('close') });
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

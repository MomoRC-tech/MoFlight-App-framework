import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { Retrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval.ts';
import * as probe from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import * as view from '../../apps/platform-lab/src/vereinsflieger/view.ts';
import * as exporter from '../../apps/platform-lab/src/vereinsflieger/export.ts';
import * as context from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import * as login from '../../apps/platform-lab/src/vereinsflieger/login.ts';
import * as legacyStore from '../../apps/platform-lab/src/vereinsflieger/legacy-recovery-store.ts';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { ConnectionSession } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import type { useAccessController } from '../../apps/platform-lab/src/vereinsflieger/use-access-controller.tsx';
import type { ViewPreferences } from '../../apps/platform-lab/src/vereinsflieger/view.ts';
const { FLIGHT_URL } = probe;

const original: ViewPreferences = {
  version: 2, accountLabel: 'Synthetic account', preset: 'Synthetic original', columns: ['1'],
  filters: [{ name: 'col1', type: 'text', value: '', checked: false }],
  sort: [], role: 'Pilot', period: 'Das letzte Jahr', reset: false,
};
const titles = ['Open bounded capture and resume', 'Open dated-window capture'] as const;
interface Element { type: unknown; props: Record<string, unknown>; children: unknown[] }
type Effect = { dependencies: unknown[] | undefined; cleanup?: () => void };

// Exercise the real component and its handlers with deferred storage. The small
// hook host replaces native rendering only; it does not implement recovery gates.
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/AccessProbe.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;
const controllerSource = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/use-access-controller.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
}).outputText;
function fixture(options: { noNativeRecovery?: boolean; failLegacyRead?: boolean; failSafety?: boolean; deferSafety?: boolean; failReceipt?: boolean; deferClear?: boolean; failClear?: boolean; persistedScope?: ProviderScope; scopedView?: ViewPreferences; deferBinding?: boolean; failBinding?: boolean; priorCapture?: probe.ProbeSnapshot; deferJournalSave?: boolean; deferCaptureSave?: boolean; product?: boolean; deferLoginRead?: boolean; failLoginRead?: boolean; savedLogin?: { username: string; password: string } | null; failLoginForget?: boolean; deferLoginForget?: boolean } = {}) {
  let resolveJournal!: (view: ViewPreferences | null) => void, rejectJournal!: (error: Error) => void;
  const journal = new Promise<ViewPreferences | null>((resolve, reject) => { resolveJournal = resolve; rejectJournal = reject; });
  const hooks: unknown[] = [], effects: (() => void)[] = [];
  let index = 0, nextId = 0, timerId = 0, pending: ViewPreferences | null = null;
  const issuedNonces: string[] = [];
  let savedCapture = options.priorCapture ?? null;
  const writes: string[] = [], injections: string[] = [], timers = new Map<number, () => void>();
  let appStateListener: ((state: string) => void) | undefined;
  let finishJournalSave!: () => void, finishCaptureSave!: () => void;
  let clearCalls = 0;
  let currentFingerprint = 'ab'.repeat(32);
  let finishSafety!: () => void;
  const safetyWrite = new Promise<void>(resolve => { finishSafety = resolve; });
  let finishClear!: () => void;
  const clearWrite = new Promise<void>(resolve => { finishClear = resolve; });
  let scopeWrites = 0;
  let finishBinding!: () => void;
  const bindingWrite = new Promise<void>(resolve => { finishBinding = resolve; });
  let savedLoginReads = 0, savedLoginForgets = 0;
  let finishLoginRead!: (login: { username: string; password: string } | null) => void;
  let finishLoginForget!: () => void;
  const loginRead = new Promise<{ username: string; password: string } | null>(resolve => { finishLoginRead = resolve; });
  const loginForget = new Promise<void>(resolve => { finishLoginForget = resolve; });
  const journalSave = new Promise<void>(resolve => { finishJournalSave = resolve; });
  const captureSave = new Promise<void>(resolve => { finishCaptureSave = resolve; });
  const nativeWeb = { injectJavaScript: (script: string) => injections.push(script), stopLoading() {} };
  const react = {
    createElement: (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]): Element => {
      if (type === 'WebView' && props?.ref) (props.ref as { current: unknown }).current = nativeWeb;
      return { type, props: props ?? {}, children };
    },
    useRef<T>(initial: T) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i] as { current: T }; },
    useState<T>(initial: T | (() => T)): [T, (next: T | ((old: T) => T)) => void] {
      const i = index++;
      if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks[i] as T, next => { hooks[i] = typeof next === 'function' ? (next as (old: T) => T)(hooks[i] as T) : next; }];
    },
    useEffect(callback: () => void | (() => void), dependencies?: unknown[]) {
      const i = index++, previous = hooks[i] as Effect | undefined;
      if (!previous || !dependencies || !previous.dependencies || dependencies.some((value, n) => !Object.is(value, previous.dependencies![n]))) {
        const state: Effect = { dependencies }; hooks[i] = state;
        effects.push(() => { previous?.cleanup?.(); const cleanup = callback(); if (cleanup) state.cleanup = cleanup; });
      }
    },
  };
  function CaptureRun() {}
  function WindowCapture() {}
  const modules: Record<string, unknown> = {
    '@moflight/flight-logbook': { canonical }, './legacy-recovery-store': legacyStore,
    react: { default: react, ...react },
    'react-native': { AppState: { currentState: 'active', addEventListener: (_: string, listener: (state: string) => void) => { appStateListener = listener; return { remove() { appStateListener = undefined; } }; } }, StyleSheet: { create: (value: unknown) => value }, View: 'View', Text: 'Text', FlatList: 'FlatList' },
    'react-native-webview': { WebView: 'WebView' }, 'expo-crypto': { randomUUID: () => { const nonce = `fixture-${++nextId}`; issuedNonces.push(nonce); return nonce; } },
    './probe': probe,
    './storage': {
      readOriginalView: () => journal, latestCapture: async () => savedCapture,
      async saveOriginalView(value: ViewPreferences) {
        writes.push('journal-start'); if (options.deferJournalSave) await journalSave;
        pending = value; writes.push('journal-saved');
      },
      async clearOriginalView(value: ViewPreferences) {
        assert.deepEqual(value, pending); writes.push('journal-cleared'); pending = null;
      },
      async saveCapture(value: probe.ProbeSnapshot) {
        writes.push('capture-start'); if (options.deferCaptureSave) await captureSave;
        savedCapture = value; writes.push('capture-saved');
      },
    },
    './session-store': { legacyRecoveryAvailable: !options.noNativeRecovery, legacyRecoveryFingerprint: async () => { assert.equal(options.noNativeRecovery, undefined); return await journal ? currentFingerprint : null; },
      readReviewedRecovery: async () => { writes.push('legacy-read'); if (options.failLegacyRead) throw new Error('Synthetic legacy mismatch'); return original; },
      sessionClearingAvailable: true, sessionProofAvailable: false, clearProviderStore: async () => { clearCalls++; if (options.deferClear) await clearWrite; if (options.failClear) throw new Error('Synthetic clear failure'); }, proveSyntheticStore: async () => false },
    './scoped-storage': {
      legacyQuarantined: async (_: unknown, fingerprint: string | null) => !!fingerprint && !writes.includes('legacy-receipt'),
      prepareScopedLegacy: async (scope: ProviderScope, fingerprint: string, target: ViewPreferences) => { writes.push('legacy-copy'); return { version: 1, scope, fingerprint, target, decision: 'explicit-recovery-only-v1' }; },
      saveLegacySafety: async () => { writes.push('legacy-safety-start'); if (options.deferSafety) await safetyWrite; if (options.failSafety) throw new Error('Synthetic failed safety'); writes.push('legacy-safety'); },
      finishScopedLegacy: async () => { if (options.failReceipt) throw new Error('Synthetic failed receipt'); writes.push('legacy-receipt'); },
      loadProviderScope: async () => options.persistedScope ?? null,
      confirmProviderScope: async (owner: string, context: unknown) => { scopeWrites++; if (options.deferBinding) await bindingWrite; if (options.failBinding) throw new Error('Synthetic binding failure'); return { version: 1, owner, connectionId: 'synthetic-connection', context }; },
      loadScopedView: async () => options.scopedView ?? null, loadScopedCapture: async () => savedCapture,
      saveScopedView: (value: unknown, v: ViewPreferences) => (modules['./storage'] as any).saveOriginalView(v),
      clearScopedView: (value: unknown, v: ViewPreferences) => (modules['./storage'] as any).clearOriginalView(v),
      saveScopedCapture: (value: unknown, v: probe.ProbeSnapshot) => (modules['./storage'] as any).saveCapture(v),
    },
    './login-storage': {
      readSavedLogin: async () => { savedLoginReads++; if (options.deferLoginRead) return loginRead; if (options.failLoginRead) throw new Error('Synthetic protected-storage read failure'); return options.savedLogin ?? null; },
      writeSavedLogin: async () => {},
      forgetSavedLogin: async () => { savedLoginForgets++; if (options.deferLoginForget) await loginForget; if (options.failLoginForget) throw new Error('Synthetic protected-storage deletion failure'); },
    },
    './export': { ...exporter, calendarYearRequest: () => ({ from: '2026-01-01', to: '2026-12-31' }) },
    './retrieval': { Retrieval }, './CaptureRun': { CaptureRun }, './WindowCapture': { WindowCapture },
    './login': login, './view': view, './context': context, './connection-state': { ConnectionSession },
  };
  const runtime = { require: (name: string) => {
    assert.ok(name in modules, `Unexpected component dependency: ${name}`); return modules[name];
  }, setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout: (id: number) => timers.delete(id), URL };
  const controllerExports = {} as { useAccessController: typeof useAccessController };
  runInNewContext(controllerSource, { exports: controllerExports, ...runtime });
  modules['./use-access-controller'] = controllerExports;
  const exported = {} as { AccessProbe: (props: { close: () => void }) => Element };
  runInNewContext(source, { exports: exported, ...runtime });
  let localOwner = 'synthetic-pilot';
  let controller: ReturnType<typeof useAccessController>;
  function render() {
    index = 0;
    const tree = options.product ? (() => { controller = controllerExports.useAccessController(true, localOwner); return { type: 'Host', props: {}, children: [controller.browser] }; })() : exported.AccessProbe({ close() {} });
    effects.splice(0).forEach(effect => effect()); return tree;
  }
  function find(tree: Element, predicate: (element: Element) => boolean): Element | undefined {
    const walk = (node: unknown): Element | undefined => {
      if (Array.isArray(node)) { for (const child of node) { const found = walk(child); if (found) return found; } }
      else if (node && typeof node === 'object') {
        const element = node as Element;
        if (predicate(element)) return element;
        for (const child of element.children ?? []) { const found = walk(child); if (found) return found; }
      }
    };
    return walk(tree);
  }
  function button(tree: Element, title: string): Element {
    const found = find(tree, element => element.props?.title === title); assert.ok(found, `Missing button: ${title}`); return found;
  }
  const press = (element: Element) => { assert.equal(typeof element.props.press, 'function'); (element.props.press as () => void)(); };
  async function settle(view: ViewPreferences | null | Error) {
    if (view instanceof Error) rejectJournal(view); else { pending = view; resolveJournal(view); }
    await journal.catch(() => {}); await Promise.resolve(); await Promise.resolve();
  }
  async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); return render(); }
  async function loadPage(url: string) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    const event = { nativeEvent: { url } };
    (web.props.onLoadStart as (event: unknown) => void)(event);
    render(); // Native start and end arrive in separate render cycles.
    (web.props.onLoadEnd as (event: unknown) => void)(event);
    return flush();
  }
  function allowNavigation(url: string) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    return (web.props.onShouldStartLoadWithRequest as (request: unknown) => boolean)({ url, isTopFrame: true });
  }
  const loadFlight = () => loadPage(FLIGHT_URL);
  function currentCommand() {
    const script = injections.at(-1); assert.ok(script, 'No native driver command was issued');
    const match = /\}\)\("([^"]+)","([^"]+)"/.exec(script); assert.ok(match, 'Cannot identify issued native command');
    return { token: match[1]!, phase: match[2]! };
  }
  async function message(payload: Record<string, unknown>) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    const command = currentCommand();
    (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: FLIGHT_URL,
      data: JSON.stringify({ ...command, url: FLIGHT_URL, accountLabel: original.accountLabel, ...payload }) } });
    return flush();
  }
  async function contextMessage(observed: unknown, sender = context.PROFILE_URL, nonce?: string, documentUrl = context.PROFILE_URL, kind = 'vf-context-v1') {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    const token = nonce ?? /nonce:"([^"]+)"/.exec(injections.at(-1) ?? '')?.[1]; assert.ok(token, 'Missing issued context nonce');
    (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: sender, data: JSON.stringify({ kind, nonce: token, url: documentUrl, context: observed }) } });
    return flush();
  }
  async function loginMessage(result: string, nonce = issuedNonces.at(-1), sender = probe.LOGIN_URL) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: sender,
      data: JSON.stringify({ kind: 'vf-login-result-v1', nonce, url: probe.LOGIN_URL, result }) } });
    return flush();
  }
  return { render, button, press, settle, find, flush, loadPage, loadFlight, message, currentCommand, writes, injections,
    contextMessage, loginMessage,
    allowNavigation, lastIssuedNonce: () => issuedNonces.at(-1),
    appState: (state: string) => appStateListener?.(state),
    changeOwner: (value: string) => { localOwner = value; render(); },
    controller: () => { render(); return controller; },
    finishJournalSave, finishCaptureSave, pending: () => pending, savedCapture: () => savedCapture,
    loginStorage: () => ({ reads: savedLoginReads, forgets: savedLoginForgets }),
    finishClear, clearCalls: () => clearCalls, finishLoginRead, finishLoginForget, finishBinding, scopeWrites: () => scopeWrites,
    finishSafety, changeFingerprint: () => { currentFingerprint = 'cd'.repeat(32); },
    isLab: (tree: Element) => tree.type === CaptureRun || tree.type === WindowCapture };
}

const observedContext = { accountNumber: '123', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;

test('supported session-required profile response reveals login without accepting account evidence', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ error: 'session-required' });
  assert.equal(f.controller().connection.phase, 'login-required');
  assert.equal(f.controller().visible, true);
  assert.equal(f.controller().connection.lastCheckedAt, null);
  assert.deepEqual(f.writes, []);
});

test('fresh protected-profile redirect to the exact login root verifies sign-out; invalid root evidence does not', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  f.controller().startDisconnect(); f.controller().checkDisconnection();
  assert.equal(f.allowNavigation(context.PROFILE_URL), true);
  await f.loadPage(context.PROFILE_URL); await f.loadPage(probe.LOGIN_URL);
  await f.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, undefined, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.equal(f.controller().connection.phase, 'disconnected');
  assert.ok(f.controller().disconnectedAt);

  const foreign = fixture({ product: true }); foreign.render(); await foreign.settle(null); await establishProductAssociation(foreign);
  foreign.controller().startDisconnect(); foreign.controller().checkDisconnection();
  assert.equal(foreign.allowNavigation(context.PROFILE_URL), true);
  await foreign.loadPage(context.PROFILE_URL); await foreign.loadPage(probe.LOGIN_URL);
  const nonce = /nonce:"([^\"]+)"/.exec(foreign.injections.at(-1)!)![1]!;
  await foreign.contextMessage({ error: 'session-required' }, 'https://evil.example/', nonce, probe.LOGIN_URL, 'vf-login-required-v1');
  await foreign.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, 'stale-root-nonce', probe.LOGIN_URL, 'vf-login-required-v1');
  await foreign.contextMessage({ unexpected: true }, probe.LOGIN_URL, nonce, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.notEqual(foreign.controller().connection.phase, 'disconnected');
  assert.equal(foreign.controller().disconnectedAt, null);

  const raced = fixture({ product: true }); raced.render(); await raced.settle(null); await establishProductAssociation(raced);
  raced.controller().startDisconnect(); raced.controller().checkDisconnection();
  assert.equal(raced.allowNavigation(context.PROFILE_URL), true);
  await raced.loadPage(context.PROFILE_URL); await raced.loadPage(probe.LOGIN_URL);
  const racedNonce = /nonce:"([^\"]+)"/.exec(raced.injections.at(-1)!)![1]!;
  // A profile-context response can race navigation and must never count as the root detector's proof.
  await raced.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, racedNonce, probe.LOGIN_URL, 'vf-context-v1');
  assert.notEqual(raced.controller().connection.phase, 'disconnected');
  await raced.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, racedNonce, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.equal(raced.controller().connection.phase, 'disconnected');

  const normal = fixture({ product: true }); normal.render(); await normal.settle(null); await normal.flush();
  normal.controller().connect(); await normal.loadPage(probe.LOGIN_URL);
  normal.controller().checkConnection(); assert.equal(normal.allowNavigation(context.PROFILE_URL), true);
  await normal.loadPage(context.PROFILE_URL); await normal.loadPage(probe.LOGIN_URL);
  await normal.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, undefined, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.equal(normal.controller().connection.phase, 'login-required', 'The same supported evidence during a normal check requests sign-in');
  normal.controller().dismissLogin();
  assert.equal(normal.controller().connection.phase, 'login-required', 'Hiding the provider view preserves known login-required evidence');
  assert.equal(normal.controller().connection.confirmed, false);

  const unavailable = fixture({ product: true }); unavailable.render(); await unavailable.settle(null); await unavailable.flush();
  unavailable.controller().connect(); await unavailable.loadPage(probe.LOGIN_URL);
  unavailable.controller().checkConnection(); assert.equal(unavailable.allowNavigation(context.PROFILE_URL), true);
  await unavailable.loadPage(context.PROFILE_URL); await unavailable.loadPage(probe.LOGIN_URL);
  await unavailable.contextMessage({ error: 'login-layout-unavailable' }, probe.LOGIN_URL, undefined, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.equal(unavailable.controller().connection.phase, 'error', 'An unsupported login layout is not proof of sign-out');
  unavailable.controller().dismissLogin();
  assert.equal(unavailable.controller().connection.phase, 'error', 'Closing the panel preserves the known unsupported-layout outcome');
});

test('a queued root response without observed profile navigation cannot prove logout; a fresh observed request can', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  f.controller().startDisconnect(); f.controller().checkDisconnection();
  const abandonedNonce = f.lastIssuedNonce(); assert.ok(abandonedNonce);
  // Simulate an old root document completing while the requested protected-profile
  // navigation is still queued and has not passed the native top-frame callback.
  await f.loadPage(probe.LOGIN_URL);
  assert.notEqual(f.controller().connection.phase, 'disconnected');
  assert.equal(f.controller().disconnectedAt, null);
  await f.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, abandonedNonce, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.notEqual(f.controller().connection.phase, 'disconnected', 'Late bridge from the queued request is rejected');

  f.controller().startDisconnect(); f.controller().checkDisconnection();
  assert.equal(f.allowNavigation(context.PROFILE_URL), true);
  await f.loadPage(context.PROFILE_URL); await f.loadPage(probe.LOGIN_URL);
  await f.contextMessage({ error: 'session-required' }, probe.LOGIN_URL, undefined, probe.LOGIN_URL, 'vf-login-required-v1');
  assert.equal(f.controller().connection.phase, 'disconnected');
  assert.ok(f.controller().disconnectedAt);
});

test('login-required reader checks form structure without reading credential values', () => {
  const form = { method: 'post', getAttribute: (_name: string) => null };
  const credential = { form, get value(): never { throw new Error('Credential value was read'); } };
  const button = { form };
  const evaluate = (users: unknown[], passwords: unknown[], buttons: unknown[], href = probe.LOGIN_URL) => {
    const window: { top?: unknown } = {}; window.top = window;
    return runInNewContext(`(${context.LOGIN_REQUIRED_SOURCE})()`, {
    window, location: { href }, document: { querySelectorAll(selector: string) {
      if (selector === 'input[name="user"]') return users;
      if (selector === 'input[name="pwinput"]#pwinput') return passwords;
      if (selector === 'button#submitbtn') return buttons;
      throw new Error(`Unexpected selector ${selector}`);
    } }, URL,
  });
  };
  const win: { top?: unknown } = {}; win.top = win;
  const valid = runInNewContext(`(${context.LOGIN_REQUIRED_SOURCE})()`, {
    window: win, location: { href: probe.LOGIN_URL }, document: { querySelectorAll(selector: string) {
      if (selector === 'input[name="user"]') return [credential];
      if (selector === 'input[name="pwinput"]#pwinput') return [credential];
      if (selector === 'button#submitbtn') return [button];
      throw new Error(`Unexpected selector ${selector}`);
    } }, URL,
  });
  assert.equal((valid as { error: string }).error, 'session-required');
  assert.equal((evaluate([], [credential], [button]) as { error: string }).error, 'login-layout-unavailable');
  assert.equal((evaluate([credential, credential], [credential], [button]) as { error: string }).error, 'login-layout-unavailable');
  const externalForm = { method: 'post', getAttribute: (_name: string) => 'https://evil.example/' };
  assert.equal((evaluate([{ form: externalForm }], [{ form: externalForm }], [{ form: externalForm }]) as { error: string }).error, 'login-layout-unavailable');
});

async function establishProductAssociation(f: ReturnType<typeof fixture>) {
  await f.flush(); // Allow the asynchronous startup recovery read to mark the empty journal as known.
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext); await f.controller().confirmConnection();
}

test('disconnect refuses startup, failed-read, recovery, and active-save states', async () => {
  const startup = fixture({ product: true }); startup.render();
  startup.controller().startDisconnect();
  assert.equal(startup.controller().disconnecting, false);
  await startup.settle(null);

  const failedRead = fixture({ product: true }); failedRead.render(); await failedRead.settle(new Error('Synthetic unreadable journal'));
  failedRead.controller().startDisconnect();
  assert.equal(failedRead.controller().disconnecting, false);

  const recovery = fixture({ product: true }); recovery.render(); await recovery.settle(original);
  recovery.controller().startDisconnect();
  assert.equal(recovery.controller().disconnecting, false);

  const saving = fixture({ product: true, deferJournalSave: true }); saving.render(); await saving.settle(null);
  await establishProductAssociation(saving); saving.controller().retrieve(); await saving.loadFlight();
  await saving.message({ kind: 'vf-view-v2', view: original });
  assert.ok(saving.writes.includes('journal-start'));
  saving.controller().startDisconnect();
  assert.equal(saving.controller().disconnecting, false, 'Disconnect cannot interrupt an active durable save');
  saving.finishJournalSave(); await saving.flush();
});

test('disconnect checks the retained provider session and recognizes logout only from protected-profile evidence', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  await establishProductAssociation(f);
  const before = f.controller().connection;
  f.controller().startDisconnect();
  assert.equal(f.controller().disconnecting, true);
  assert.equal(f.controller().visible, true);
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().connection.observed?.accountNumber, before.observed?.accountNumber, 'Private prior association remains for reconnect validation');
  f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext);
  assert.equal(f.controller().connection.phase, 'unknown', 'A still-valid profile is not a logout');
  assert.equal(f.controller().disconnecting, false);
  assert.equal(f.controller().connection.confirmed, false);
  assert.deepEqual(f.writes, []);

  f.controller().startDisconnect(); f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ error: 'session-required' });
  assert.equal(f.controller().connection.phase, 'disconnected');
  assert.equal(f.controller().disconnecting, false);
  assert.equal(f.controller().visible, false);
  assert.ok(f.controller().disconnectedAt);
  assert.equal(f.controller().connection.observed, null);

  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext);
  assert.equal(f.controller().connection.phase, 'observed', 'The previously associated account and club reconnect without reapproval');
  assert.equal(f.controller().connection.confirmed, true);
});

test('cancelled, stale, backgrounded, and failed disconnect checks never claim logout', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  await establishProductAssociation(f);
  f.controller().startDisconnect(); f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  const abandoned = /nonce:"([^\"]+)"/.exec(f.injections.at(-1)!)![1]!;
  f.controller().dismissLogin();
  assert.equal(f.controller().disconnecting, false);
  await f.contextMessage({ error: 'session-required' }, context.PROFILE_URL, abandoned);
  assert.notEqual(f.controller().connection.phase, 'disconnected');

  f.controller().startDisconnect(); f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  f.appState('background');
  assert.notEqual(f.controller().connection.phase, 'disconnected');
  assert.equal(f.controller().disconnecting, false);

  f.appState('active'); f.controller().startDisconnect(); f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ unexpected: 'network failure' });
  assert.notEqual(f.controller().connection.phase, 'disconnected');
  assert.equal(f.controller().disconnecting, false);
});

test('forgetting saved login is independent from provider logout and guarded during active ownership', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  await establishProductAssociation(f);
  f.controller().startDisconnect();
  assert.equal(f.controller().disconnecting, true);
  await f.controller().forgetLogin();
  assert.equal(f.loginStorage().forgets, 0, 'Credential deletion is blocked while disconnect owns the browser');
  f.controller().dismissLogin();
  await f.controller().forgetLogin();
  assert.equal(f.loginStorage().forgets, 1);
  assert.notEqual(f.controller().connection.phase, 'disconnected');
});

test('forget-login storage failure preserves the provider session; deferred deletion stays single-owner', async () => {
  const failed = fixture({ product: true, failLoginForget: true }); failed.render(); await failed.settle(null);
  await establishProductAssociation(failed);
  await failed.controller().forgetLogin();
  assert.equal(failed.loginStorage().forgets, 1);
  assert.equal(failed.controller().connection.confirmed, true);
  assert.notEqual(failed.controller().connection.phase, 'disconnected');

  const deferred = fixture({ product: true, deferLoginForget: true }); deferred.render(); await deferred.settle(null);
  await establishProductAssociation(deferred);
  const deleting = deferred.controller().forgetLogin();
  assert.equal(deferred.loginStorage().forgets, 1);
  await deferred.controller().forgetLogin();
  assert.equal(deferred.loginStorage().forgets, 1, 'A pending secure-storage deletion cannot be duplicated');
  deferred.finishLoginForget(); await deleting;
  assert.equal(deferred.controller().connection.confirmed, true);
});

test('cancelling or backgrounding a deferred saved-login read prevents late credential injection', async () => {
  for (const interrupt of ['dismiss', 'background'] as const) {
    const f = fixture({ product: true, deferLoginRead: true }); f.render(); await f.settle(null); await f.flush();
    f.controller().useLogin(); await f.loadPage(probe.LOGIN_URL);
    const injectionCount = f.injections.length;
    if (interrupt === 'dismiss') f.controller().dismissLogin(); else f.appState('background');
    f.finishLoginRead({ username: 'synthetic-user', password: 'synthetic-password' });
    await f.flush();
    assert.equal(f.injections.length, injectionCount, `Late read after ${interrupt} must not submit credentials`);
    assert.ok(!f.injections.join('\n').includes('synthetic-password'));
    assert.equal(f.controller().disconnectedAt, null);
    assert.equal(f.controller().loginNotice, 'cancelled');
  }
});

test('duplicate login-page load callbacks cannot overlap deferred storage reads or submit twice', async () => {
  const f = fixture({ product: true, deferLoginRead: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().useLogin(); await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.loginStorage().reads, 1);
  await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.loginStorage().reads, 1, 'A second load-end while the first secure read is pending must not start another read');
  f.finishLoginRead({ username: 'synthetic-user', password: 'synthetic-password' });
  await f.flush();
  assert.equal(f.injections.length, 1);
  assert.ok(f.injections[0]!.includes('synthetic-password'));
  assert.equal(f.controller().loginNotice, 'none', 'Submission remains pending provider response');
});

test('starting saved login invalidates confidence, clears pending confirmation, and makes no startup secret read', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  assert.equal(f.loginStorage().reads, 0, 'Product startup does not read a saved secret');
  assert.equal(f.controller().connection.confirmed, true);
  f.controller().useLogin();
  assert.equal(f.controller().connection.phase, 'unknown');
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().loginNotice, 'none');
  await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().result, 'none');
  assert.ok(!f.injections.some(script => /\}\)\("[^"]+","snapshot"/.test(script)));

  const pending = fixture({ product: true }); pending.render(); await pending.settle(null); await pending.flush();
  pending.controller().connect(); await pending.loadPage(probe.LOGIN_URL);
  pending.controller().checkConnection('retrieve'); await pending.loadPage(context.PROFILE_URL);
  await pending.contextMessage(observedContext);
  assert.equal(pending.controller().connection.confirmed, false);
  pending.controller().useLogin();
  await pending.controller().confirmConnection();
  assert.equal(pending.controller().busy, false, 'A cleared after-confirmation action cannot start capture');
  assert.ok(!pending.injections.some(script => /\}\)\("[^"]+","snapshot"/.test(script)));
});

test('saved-login absence and read failure produce explicit outcomes; an existing secret is attempted once', async () => {
  const absent = fixture({ product: true }); absent.render(); await absent.settle(null); await absent.flush();
  absent.controller().useLogin(); await absent.loadPage(probe.LOGIN_URL); await absent.flush();
  assert.equal(absent.controller().loginNotice, 'unavailable');
  assert.equal(absent.loginStorage().reads, 1);
  assert.equal(absent.controller().loginBusy, false);
  assert.equal(absent.injections.length, 0);

  const failed = fixture({ product: true, failLoginRead: true }); failed.render(); await failed.settle(null); await failed.flush();
  failed.controller().useLogin(); await failed.loadPage(probe.LOGIN_URL); await failed.flush();
  assert.equal(failed.controller().loginNotice, 'failed');
  assert.equal(failed.loginStorage().reads, 1);
  assert.equal(failed.injections.length, 0);

  const stored = fixture({ product: true, savedLogin: { username: 'synthetic-user', password: 'synthetic-password' } });
  stored.render(); await stored.settle(null); await stored.flush();
  stored.controller().useLogin(); await stored.loadPage(probe.LOGIN_URL); await stored.flush();
  const submitted = [...stored.injections];
  assert.equal(stored.loginStorage().reads, 1);
  assert.equal(submitted.length, 1, 'The explicit user action starts one saved-login attempt');
  await stored.loadPage(probe.LOGIN_URL); await stored.flush();
  assert.equal(stored.loginStorage().reads, 1, 'A repeat page callback does not reread or retry');
  assert.equal(stored.injections.length, submitted.length, 'No automatic credential retry is started');
});

test('original-page assisted re-login after helper failure requires fresh same-account evidence before retrieval', async () => {
  const f = fixture({ product: true, priorCapture, savedLogin: { username: 'synthetic-user', password: 'synthetic-password' } });
  f.render(); await f.settle(null); await establishProductAssociation(f);
  f.controller().startDisconnect(); f.controller().checkDisconnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ error: 'session-required' });
  f.controller().useLogin(); await f.loadPage(probe.LOGIN_URL);
  const nonce = f.lastIssuedNonce();
  await f.loginMessage('provider-script-error', 'stale-attempt');
  await f.loginMessage('provider-script-error', nonce, 'https://example.test/');
  assert.equal(f.controller().loginBusy, true, 'Unowned messages cannot end the active login');
  await f.loginMessage('provider-script-error', nonce);
  assert.equal(f.controller().loginNotice, 'failed');
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.loginStorage().reads, 1);
  const attempts = f.injections.filter(script => script.includes('synthetic-password')).length;
  await f.loadPage(context.PROFILE_URL); // Native navigation after the original provider submit action.
  assert.equal(f.controller().connection.confirmed, false, 'A successful page load alone is not account evidence');
  assert.equal(f.injections.filter(script => script.includes('synthetic-password')).length, attempts, 'Manual continuation never retries credentials');
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.controller().connection.confirmed, true);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadFlight();
  assert.equal(f.currentCommand().phase, 'snapshot');
  assert.equal(f.savedCapture(), priorCapture);
  assert.deepEqual(f.writes, [], 'Prior evidence stays unchanged until the original view is journaled');
});

test('assisted re-login into a different account remains blocked before any capture or preference write', async () => {
  const f = fixture({ product: true, priorCapture, savedLogin: { username: 'synthetic-user', password: 'synthetic-password' } });
  f.render(); await f.settle(null); await establishProductAssociation(f);
  f.controller().useLogin(); await f.loadPage(probe.LOGIN_URL); await f.loginMessage('provider-script-error');
  await f.loadPage(context.PROFILE_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  await f.controller().confirmConnection(); f.controller().retrieve();
  assert.equal(f.controller().connection.phase, 'mismatch');
  assert.equal(f.controller().busy, false);
  assert.equal(f.savedCapture(), priorCapture);
  assert.deepEqual(f.writes, []);
});

test('cancelled login confirmation cannot launch a stale retrieval; reconnect retains account and club checks', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext);
  f.controller().dismissLogin();
  await f.controller().confirmConnection();
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().result, 'none');
  assert.ok(!f.injections.some(script => /\}\)\("[^"]+","snapshot"/.test(script)));

  const reconnect = fixture({ product: true }); reconnect.render(); await reconnect.settle(null);
  await establishProductAssociation(reconnect);
  reconnect.controller().startDisconnect(); reconnect.controller().checkDisconnection(); await reconnect.loadPage(context.PROFILE_URL);
  await reconnect.contextMessage({ error: 'session-required' });
  reconnect.controller().connect(); await reconnect.loadPage(probe.LOGIN_URL);
  reconnect.controller().checkConnection(); await reconnect.loadPage(context.PROFILE_URL);
  await reconnect.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(reconnect.controller().connection.phase, 'mismatch');
  reconnect.controller().connect(); await reconnect.loadPage(probe.LOGIN_URL);
  reconnect.controller().checkConnection(); await reconnect.loadPage(context.PROFILE_URL);
  await reconnect.contextMessage({ ...observedContext, clubLabel: 'Other Club' });
  assert.equal(reconnect.controller().connection.phase, 'mismatch');
});

test('background interruption during durable journal write retains recovery without starting provider mutations', async () => {
  const f = fixture({ product: true, priorCapture, deferJournalSave: true }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext); await f.controller().confirmConnection(); await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', view: original });
  assert.deepEqual(f.writes, ['journal-start']);
  f.appState('background');
  const count = f.injections.length;
  f.finishJournalSave(); await f.flush();
  assert.equal(f.injections.length, count, 'No backup or export may begin after suspended journal write');
  assert.deepEqual(f.writes, ['journal-start', 'journal-saved']);
  assert.deepEqual(f.pending(), original);
  assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().recovery, true);
  assert.equal(f.controller().connection.phase, 'unknown');
  f.appState('active');
  assert.equal(f.controller().connection.phase, 'unknown', 'Foreground return does not establish session validity');
});

test('product controller keeps native key/source/ref across login hiding and navigation without claiming connection', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  assert.equal(f.find(f.render(), element => element.type === 'WebView'), undefined);
  f.controller().connect();
  const initial = f.find(f.render(), element => element.type === 'WebView'); assert.ok(initial);
  await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.controller().connection.phase, 'unknown', 'Cookie or login page load is not verification');
  f.controller().dismissLogin();
  const hidden = f.find(f.render(), element => element.type === 'WebView'); assert.ok(hidden);
  for (const property of ['key', 'source', 'ref']) assert.equal(hidden.props[property], initial.props[property]);
  f.controller().checkConnection();
  const checking = f.find(f.render(), element => element.type === 'WebView'); assert.ok(checking);
  for (const property of ['key', 'source', 'ref']) assert.equal(checking.props[property], initial.props[property]);
  assert.match(f.injections.at(-1)!, /location.assign/);
  assert.equal(f.controller().connection.phase, 'checking');
});

test('product context checks reject foreign origins, stale nonces and cancelled late responses', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  const abandoned = /nonce:"([^"]+)"/.exec(f.injections.at(-1)!)![1]!;
  await f.contextMessage(observedContext, 'https://evil.example/', abandoned);
  assert.equal(f.controller().connection.phase, 'checking');
  await f.contextMessage(observedContext, context.PROFILE_URL, 'stale');
  assert.equal(f.controller().connection.phase, 'checking');
  f.controller().dismissLogin();
  await f.contextMessage(observedContext, context.PROFILE_URL, abandoned);
  assert.equal(f.controller().connection.phase, 'unknown');
  assert.equal(f.controller().connection.confirmed, false);
  assert.deepEqual(f.writes, []);
});

test('product retrieval waits for observed confirmation and rejects changed account before snapshot', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  f.controller().retrieve();
  assert.equal(f.controller().busy, false);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext);
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().busy, false);
  await f.controller().confirmConnection(); await f.loadFlight();
  assert.equal(f.controller().busy, true);
  assert.equal(f.currentCommand().phase, 'snapshot');
  f.controller().cancelRetrieval(); await f.flush();
  assert.equal(f.controller().busy, false);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(f.controller().connection.phase, 'mismatch');
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().connection.confirmed, false);
  assert.deepEqual(f.writes, []);
});

test('export failure keeps its owned stage through verified cleanup without publishing provider error content', async () => {
  const f = fixture({ product: true, priorCapture }); f.render(); await f.settle(null);
  await establishProductAssociation(f);
  f.controller().retrieve(); await f.loadFlight(); await backupVerified(f);
  await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  assert.equal(f.currentCommand().phase, 'columns');
  await f.message({ kind: 'vf-export-v1', error: 'PRIVATE PROVIDER CONTENT' });
  assert.equal(f.controller().restoring.current, true);
  assert.equal(f.savedCapture(), priorCapture);
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.pending(), null);
  assert.equal(f.controller().result, 'failed');
  assert.equal(f.controller().status, 'Retrieval validation failed at export-columns. Previous captures preserved. Original provider view restored and verified.');
  assert.equal(f.savedCapture(), priorCapture);
});

test('product post-capture account mismatch preserves prior capture and recovery without modifying another account', async () => {
  const f = fixture({ product: true, priorCapture }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext); await f.controller().confirmConnection(); await f.loadFlight();
  await backupVerified(f);
  for (const phase of exporter.EXPORT_PHASES.filter(phase => phase !== 'read')) {
    assert.equal(f.currentCommand().phase, phase);
    await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  }
  await f.message({ kind: 'vf-export-v1', status: 'page', preset: exporter.ACTIVE_EXPORT_VIEW,
    period: 'ab 01.01.2026 bis 31.12.2026', participation: exporter.PARTICIPATION, filtersClear: true, allColumns: true,
    headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Kosten'], columnIds: ['1', '2', '3', '4', '5', '6'],
    first: 0, last: 0, total: 0, rows: [], nextUrl: null });
  assert.equal(f.controller().connection.phase, 'checking');
  assert.ok(!f.writes.includes('capture-start'), 'Full list alone must not commit before post-check');
  await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(f.controller().connection.phase, 'mismatch');
  assert.equal(f.savedCapture(), priorCapture);
  assert.ok(!f.writes.includes('capture-start'));
  assert.equal(f.controller().restoring.current, false);
  assert.deepEqual(f.pending(), original);
  assert.ok(!f.writes.includes('journal-cleared'));
  assert.equal(f.controller().recovery, true);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().lastSuccessfulCaptureAt, null);
  assert.equal(f.savedCapture(), priorCapture);
});

test('hiding the product panel during post-capture checking keeps ownership through save and verified restoration', async () => {
  const f = fixture({ product: true, priorCapture }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext); await f.controller().confirmConnection(); await f.loadFlight();
  await backupVerified(f);
  for (const phase of exporter.EXPORT_PHASES.filter(phase => phase !== 'read')) {
    assert.equal(f.currentCommand().phase, phase);
    await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  }
  await f.message({ kind: 'vf-export-v1', status: 'page', preset: exporter.ACTIVE_EXPORT_VIEW,
    period: 'ab 01.01.2026 bis 31.12.2026', participation: exporter.PARTICIPATION, filtersClear: true, allColumns: true,
    headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Kosten'], columnIds: ['1', '2', '3', '4', '5', '6'],
    first: 0, last: 0, total: 0, rows: [], nextUrl: null });
  f.controller().dismissLogin();
  assert.equal(f.controller().connection.phase, 'checking', 'Presentation close must retain an active capture check');
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.ok(f.writes.includes('capture-saved'));
  assert.notEqual(f.savedCapture(), priorCapture);
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.deepEqual(f.pending(), original, 'Restored view alone must wait for final account check');
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.pending(), null);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().result, 'captured');
  assert.equal(f.controller().lastSuccessfulCaptureAt, f.savedCapture()!.retrievedAt);
});

test('both legacy labs stay closed until the startup recovery journal has been read', () => {
  for (const title of titles) {
    const f = fixture(), tree = f.render(), button = f.button(tree, title);
    assert.equal(button.props.disabled, true);
    f.press(button); assert.equal(f.isLab(f.render()), false, 'Direct handler must also reject pending initialization');
  }
});

test('pending or failed startup recovery blocks current and stale legacy-lab handlers', async () => {
  for (const verdict of [original, new Error('Synthetic journal read failure')]) {
    for (const title of titles) {
      const f = fixture(), staleButton = f.button(f.render(), title);
      await f.settle(verdict);
      const button = f.button(f.render(), title); assert.equal(button.props.disabled, true);
      f.press(button); assert.equal(f.isLab(f.render()), false);
      f.press(staleButton); assert.equal(f.isLab(f.render()), false);
    }
  }
});

test('a verified empty startup journal permits each legacy lab; stale initial handlers stay refused', async () => {
  for (const title of titles) {
    const f = fixture(), staleButton = f.button(f.render(), title);
    await f.settle(null);
    f.press(staleButton); assert.equal(f.isLab(f.render()), false);
    const button = f.button(f.render(), title); assert.equal(button.props.disabled, false);
    f.press(button); assert.equal(f.isLab(f.render()), true);
  }
});

const priorCapture: probe.ProbeSnapshot = {
  captureId: 'synthetic-prior', retrievedAt: '2026-01-01T12:00:00.000Z', headers: ['Datum'],
  rows: [{ values: ['01.01.2025'], sourceFlightId: '1' }],
  sourceIdentity: 'unverified', coverage: 'visible-personal-list-only', timeBasis: 'unknown',
};
async function start(f: ReturnType<typeof fixture>) {
  f.render(); await f.settle(null);
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight();
  assert.equal(f.currentCommand().phase, 'snapshot');
}
async function restoredReadback(f: ReturnType<typeof fixture>) {
  await f.loadFlight(); assert.equal(f.currentCommand().phase, 'restore');
  await f.message({ kind: 'vf-view-v2', status: 'next' });
  assert.equal(f.currentCommand().phase, 'verify');
}
const restored = { ...original, preset: view.VIEW_BACKUP };
function strategy(f: ReturnType<typeof fixture>) {
  return f.find(f.render(), element => element.type === 'Text' && element.children.some(child => typeof child === 'string' && child.startsWith('Original view restoration strategy: ')))?.children[0];
}
async function backupVerified(f: ReturnType<typeof fixture>) {
  await f.message({ kind: 'vf-view-v2', view: original });
  await f.message({ kind: 'vf-view-v2', status: 'saved-request' });
  await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', status: 'load-request' });
  await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.currentCommand().phase, 'reset');
}

test('opt-in interruption checkpoint holds after verified reset and ignores navigation and abandoned Continue callbacks', async () => {
  const f = fixture({ priorCapture });
  f.render(); await f.settle(null);
  f.press(f.button(f.render(), 'Enable interruption test pause'));
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight(); await backupVerified(f);
  await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  const continueButton = f.button(f.render(), 'Continue test retrieval');
  assert.deepEqual(f.pending(), original); assert.equal(f.savedCapture(), priorCapture);
  const count = f.injections.length;
  await f.loadFlight(); assert.equal(f.injections.length, count, 'Navigation cannot advance a paused run');
  f.press(f.button(f.render(), 'Cancel retrieval')); f.press(continueButton);
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight(); await backupVerified(f);
  await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  const secondCount = f.injections.length;
  f.press(continueButton); assert.equal(f.injections.length, secondCount, 'Prior request Continue cannot resume a new request');
  f.press(f.button(f.render(), 'Continue test retrieval'));
  assert.equal(f.currentCommand().phase, 'columns');
});

test('interruption test setting is transient; restarted pending journal blocks retrieval and exposes verified recovery', async () => {
  const f = fixture({ priorCapture }); f.render(); await f.settle(original);
  assert.equal(f.button(f.render(), 'Enable interruption test pause').props.disabled, true);
  assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, true);
  f.press(f.button(f.render(), 'Restore original provider view')); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.button(f.render(), 'Enable interruption test pause').props.disabled, false);
});

test('cancellation before journaling retains the prior capture and ignores the abandoned snapshot callback', async () => {
  const f = fixture({ priorCapture });
  const actionTitles = (tree: Element) => {
    const row = f.find(tree, element => element.children?.some(child => (child as Element | null)?.props?.title === 'Show provider login'));
    assert.ok(row); return row.children.map(child => (child as Element | null)?.props?.title);
  };
  assert.deepEqual(actionTitles(f.render()), ['Show provider login', 'Retrieve flights', 'Close access PoC']);
  await start(f);
  assert.deepEqual(actionTitles(f.render()), ['Show provider login', 'Cancel retrieval', 'Close access PoC'], 'Cancel keeps the retrieval action slot');
  const staleWeb = f.find(f.render(), element => element.type === 'WebView'); assert.ok(staleWeb);
  const staleCommand = f.currentCommand();
  const cancel = f.button(f.render(), 'Cancel retrieval'); assert.equal(cancel.props.disabled, false);
  f.press(cancel);
  assert.deepEqual(f.writes, []); assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
  const list = f.find(f.render(), element => element.type === 'FlatList'); assert.ok(list);
  assert.deepEqual(list.props.data, priorCapture.rows);
  (staleWeb.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: FLIGHT_URL,
    data: JSON.stringify({ kind: 'vf-view-v2', ...staleCommand, url: FLIGHT_URL, view: original }) } });
  await f.flush(); assert.deepEqual(f.writes, []); assert.equal(f.pending(), null);
});

test('journal write locks cancellation; cancelling afterward retains recovery until independently verified restoration', async () => {
  const f = fixture({ priorCapture, deferJournalSave: true }); await start(f);
  await f.message({ kind: 'vf-view-v2', view: original });
  assert.deepEqual(f.writes, ['journal-start']);
  assert.equal(strategy(f), undefined, 'Uncommitted snapshot must not report a selected restoration strategy');
  const locked = f.button(f.render(), 'Cancel retrieval'); assert.equal(locked.props.disabled, true);
  f.press(locked); assert.equal(f.currentCommand().phase, 'snapshot');
  f.finishJournalSave(); await f.flush(); assert.equal(f.currentCommand().phase, 'backup');
  assert.equal(strategy(f), 'Original view restoration strategy: reserved backup');
  assert.deepEqual(f.pending(), original);
  f.press(f.button(f.render(), 'Cancel retrieval'));
  assert.equal(f.button(f.render(), 'Cancel retrieval').props.disabled, true, 'Cleanup cannot be cancelled');
  await restoredReadback(f);
  assert.deepEqual(f.pending(), original); assert.ok(!f.writes.includes('journal-cleared'));
  await f.message({ kind: 'vf-view-v2', token: 'stale-command', status: 'next', view: restored });
  assert.deepEqual(f.pending(), original); assert.ok(!f.writes.includes('journal-cleared'));
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.deepEqual(f.writes, ['journal-start', 'journal-saved', 'journal-cleared']);
  assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, false);
});

test('failed restoration readback keeps recovery visible and blocks new exports until a verified retry', async () => {
  const f = fixture({ priorCapture }); await start(f);
  await f.message({ kind: 'vf-view-v2', view: original });
  f.press(f.button(f.render(), 'Cancel retrieval')); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: { ...restored, period: 'Synthetic changed period' } });
  assert.deepEqual(f.pending(), original); assert.ok(!f.writes.includes('journal-cleared'));
  assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, true);
  const recover = f.button(f.render(), 'Restore original provider view'); assert.equal(recover.props.disabled, false);
  f.press(recover); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
});

test('capture writing locks cancellation and commits its outcome separately from restoration', async () => {
  const f = fixture({ priorCapture, deferCaptureSave: true }); await start(f);
  await f.message({ kind: 'vf-view-v2', view: original });
  assert.equal(f.currentCommand().phase, 'backup');
  await f.message({ kind: 'vf-view-v2', status: 'saved-request' });
  await f.loadFlight(); assert.equal(f.currentCommand().phase, 'backup-load');
  await f.message({ kind: 'vf-view-v2', status: 'load-request' });
  await f.loadFlight(); assert.equal(f.currentCommand().phase, 'backup-verify');
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  for (const phase of exporter.EXPORT_PHASES.filter(phase => phase !== 'read')) {
    assert.equal(f.currentCommand().phase, phase);
    await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  }
  assert.equal(f.currentCommand().phase, 'read');
  await f.message({ kind: 'vf-export-v1', status: 'page', preset: exporter.ACTIVE_EXPORT_VIEW,
    period: 'ab 01.01.2026 bis 31.12.2026', participation: exporter.PARTICIPATION, filtersClear: true, allColumns: true,
    headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Kosten'], columnIds: ['1', '2', '3', '4', '5', '6'],
    first: 0, last: 0, total: 0, rows: [], nextUrl: null });
  assert.ok(f.writes.includes('capture-start')); assert.equal(f.savedCapture(), priorCapture);
  const locked = f.button(f.render(), 'Cancel retrieval'); assert.equal(locked.props.disabled, true);
  f.press(locked); assert.ok(!f.writes.includes('capture-saved')); assert.deepEqual(f.pending(), original);
  f.finishCaptureSave(); await f.flush();
  assert.ok(f.writes.includes('capture-saved')); assert.notEqual(f.savedCapture(), priorCapture);
  assert.deepEqual(f.pending(), original); assert.ok(!f.writes.includes('journal-cleared'));
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null);
  assert.ok(f.writes.indexOf('capture-saved') < f.writes.indexOf('journal-cleared'));
  assert.equal(strategy(f), 'Original view restoration strategy: reserved backup', 'Successful cleanup retains the observed strategy');
});

test('login redirect during pending restoration retains recovery and prior capture until same-account retry', async () => {
  const f = fixture({ priorCapture }); f.render(); await f.settle(original);
  f.press(f.button(f.render(), 'Restore original provider view'));
  await f.loadPage(probe.LOGIN_URL);
  assert.deepEqual(f.pending(), original); assert.deepEqual(f.writes, []); assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, true);
  for (const title of titles) assert.equal(f.button(f.render(), title).props.disabled, true);
  assert.equal(f.button(f.render(), 'Restore original provider view').props.disabled, false);
  // Opening the provider's login screen does not itself authorize journal cleanup.
  f.press(f.button(f.render(), 'Show provider login')); await f.loadPage(probe.LOGIN_URL);
  assert.deepEqual(f.pending(), original); assert.deepEqual(f.writes, []);
  f.press(f.button(f.render(), 'Restore original provider view')); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.deepEqual(f.writes, ['journal-cleared']);
  assert.equal(f.savedCapture(), priorCapture); assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, false);
});

test('changed-account export and restoration callbacks retain evidence and block retrieval until same-account recovery', async () => {
  const f = fixture({ priorCapture }); await start(f); await backupVerified(f);
  await f.message({ kind: 'vf-export-v1', accountLabel: 'Synthetic other account', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  assert.deepEqual(f.pending(), original); assert.equal(f.savedCapture(), priorCapture);
  await f.loadFlight(); assert.equal(f.currentCommand().phase, 'restore');
  await f.message({ kind: 'vf-view-v2', accountLabel: 'Synthetic other account', status: 'next' });
  assert.deepEqual(f.pending(), original); assert.ok(!f.writes.includes('capture-start')); assert.ok(!f.writes.includes('journal-cleared'));
  assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, true);
  const count = f.injections.length;
  f.press(f.button(f.render(), 'Retrieve flights'));
  assert.equal(f.injections.length, count, 'Even a direct blocked handler must not replace pending recovery');
  for (const title of titles) assert.equal(f.button(f.render(), title).props.disabled, true);
  f.press(f.button(f.render(), 'Restore original provider view')); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
  assert.deepEqual(f.writes, ['journal-start', 'journal-saved', 'journal-cleared']);
});

// This synthetic supported-control signature exercises default branching. It is
// not evidence that all controls/preferences on the live provider are complete.
const defaultOriginal: ViewPreferences = {
  ...original, preset: exporter.ACTIVE_EXPORT_VIEW,
  columns: ['1','2','3','4','5','6','7','8','9','10','105','11','12','13','14','15'],
  filters: [
    ...['1','2','3','4','5','6','7','8','9','10','105','11','12','13','14','15'].flatMap(id => [
      { name: `col${id}`, type: 'text' as const, value: '', checked: false },
      { name: `op_col${id}`, type: 'select-one' as const, value: ':F:eq', checked: false },
    ]),
    { name: 'col11_0', type: 'checkbox', value: '1', checked: true },
    { name: 'col11_all', type: 'checkbox', value: 'all', checked: true },
  ], reset: true,
};
async function executeViewDriver(f: ReturnType<typeof fixture>, current: ViewPreferences, actions: string[]) {
  const select = {
    options: [{ textContent: current.preset, text: current.preset, value: current.preset, disabled: true },
      { textContent: 'Zurücksetzen', text: 'Zurücksetzen', value: '-1', disabled: false }],
    get selectedOptions() { return [this.options[0]]; }, selectedIndex: 0,
    dispatchEvent() {
      actions.push('reset'); assert.equal(this.options[this.selectedIndex]?.value, '-1');
      // Actual provider reset retains the selected period/participation.
      Object.assign(current, structuredClone(defaultOriginal), { period: current.period, role: current.role, reset: false });
    },
  };
  const quick = { method: 'post', getAttribute: () => FLIGHT_URL, querySelector: () => select };
  const document = {
    querySelector(selector: string) {
      if (selector === 'form[name="frm_tablelist_quickconfig"]') return quick;
      if (selector === '#divpageheadermenu') return { children: [{}, { textContent: current.accountLabel }] };
      if (selector === '#tablelist_20') return {};
      if (selector === '#frmfilter') return { elements: current.filters };
      if (selector === '#globalfilter') return { textContent: current.period };
      if (selector === '#globalfilter2') return { textContent: current.role };
      assert.fail(`Unexpected default-path control: ${selector}`);
    },
    querySelectorAll(selector: string) {
      if (selector === '#LST_VISIBLE > li') return current.columns.map(column => ({ getAttribute: () => column }));
      if (selector === '#tablelist_20 thead th') return current.columns.map(column => ({ querySelectorAll: () => current.sort.filter(sort => sort.column === column).map(sort => ({ classList: [sort.icon] })) }));
      if (selector === '#menu_globalfilter2 a') return [{ textContent: 'Pilot', getAttribute: () => `${FLIGHT_URL}?_params=synthetic-role`, click() { actions.push('role'); current.role = 'Pilot'; } }];
      if (selector === '#menu_globalfilter a') return [{ textContent: 'Das letzte Jahr', getAttribute: () => `${FLIGHT_URL}?_params=synthetic-period`, click() { actions.push('period'); current.period = 'Das letzte Jahr'; } }];
      assert.fail(`Unexpected default-path collection: ${selector}`);
    },
  };
  const messages: Record<string, unknown>[] = [], window: { top?: unknown; ReactNativeWebView: { postMessage: (message: string) => void } } = {
    ReactNativeWebView: { postMessage: message => messages.push(JSON.parse(message) as Record<string, unknown>) },
  }; window.top = window;
  runInNewContext(f.injections.at(-1)!, { window, document, location: new URL(FLIGHT_URL), URL, Event: class {} });
  for (const message of messages) { assert.ok(!message.error, 'Default driver rejected synthetic supported controls'); await f.message(message); }
}

test('default-original lifecycle skips named backup controls and clears recovery only after verified reset restoration', async () => {
  const f = fixture({ priorCapture }), actions: string[] = []; await start(f);
  await executeViewDriver(f, defaultOriginal, actions); assert.equal(f.currentCommand().phase, 'backup');
  assert.equal(strategy(f), 'Original view restoration strategy: reset');
  await executeViewDriver(f, defaultOriginal, actions); assert.equal(f.currentCommand().phase, 'backup-load');
  await executeViewDriver(f, defaultOriginal, actions); assert.equal(f.currentCommand().phase, 'backup-verify');
  await executeViewDriver(f, defaultOriginal, actions); assert.equal(f.currentCommand().phase, 'reset');
  assert.deepEqual(actions, [], 'Default backup phases must invoke no named save/load control');
  assert.deepEqual(f.pending(), defaultOriginal);
  for (const phase of exporter.EXPORT_PHASES.filter(phase => phase !== 'read')) {
    assert.equal(f.currentCommand().phase, phase);
    await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  }
  await f.message({ kind: 'vf-export-v1', status: 'page', preset: exporter.ACTIVE_EXPORT_VIEW,
    period: 'ab 01.01.2026 bis 31.12.2026', participation: exporter.PARTICIPATION, filtersClear: true, allColumns: true,
    headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Kosten'], columnIds: ['1', '2', '3', '4', '5', '6'],
    first: 0, last: 0, total: 0, rows: [], nextUrl: null });
  await f.loadFlight(); assert.equal(f.currentCommand().phase, 'restore');
  const current = { ...structuredClone(defaultOriginal), columns: ['1'], filters: [original.filters[0]!],
    period: 'ab 01.01.2026 bis 31.12.2026', role: 'Pilot oder Fluglehrer', reset: false };
  await executeViewDriver(f, current, actions);
  assert.deepEqual(actions, ['reset']); assert.deepEqual(f.pending(), defaultOriginal);
  assert.equal(current.period, 'ab 01.01.2026 bis 31.12.2026'); assert.equal(current.role, 'Pilot oder Fluglehrer');
  await f.loadFlight(); await executeViewDriver(f, current, actions);
  assert.deepEqual(actions, ['reset', 'role']); assert.deepEqual(f.pending(), defaultOriginal);
  await f.loadFlight(); await executeViewDriver(f, current, actions);
  assert.deepEqual(actions, ['reset', 'role', 'period']); assert.deepEqual(f.pending(), defaultOriginal);
  await f.loadFlight(); await executeViewDriver(f, current, actions);
  assert.equal(f.currentCommand().phase, 'verify'); assert.ok(!f.writes.includes('journal-cleared'));
  await executeViewDriver(f, current, actions);
  assert.equal(f.pending(), null); assert.deepEqual(actions, ['reset', 'role', 'period']);
  assert.deepEqual(f.writes, ['journal-start', 'journal-saved', 'capture-start', 'capture-saved', 'journal-cleared']);
  assert.equal(strategy(f), 'Original view restoration strategy: reset', 'Verified cleanup must leave branch evidence visible');
  f.press(f.button(f.render(), 'Retrieve flights'));
  assert.equal(strategy(f), undefined, 'A new request must not report the previous request strategy before its snapshot is journaled');
});

test('startup recovery reports only the journaled restoration strategy without private view values', async () => {
  for (const journal of [original, defaultOriginal]) {
    const f = fixture({ priorCapture }); f.render();
    assert.equal(strategy(f), undefined);
    await f.settle(journal);
    assert.equal(strategy(f), `Original view restoration strategy: ${journal.reset ? 'reset' : 'reserved backup'}`);
    assert.equal(f.button(f.render(), 'Retrieve flights').props.disabled, true);
  }
  const failed = fixture(); failed.render(); await failed.settle(new Error('Synthetic unreadable journal'));
  assert.equal(strategy(failed), undefined, 'Unknown recovery contents cannot establish a strategy');
});

test('pre-backup checkpoint pauses before any backup command and cancellation verifies the unchanged original', async () => {
  const f = fixture({ priorCapture }); f.render(); await f.settle(null);
  f.press(f.button(f.render(), 'Enable pre-backup test pause'));
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', view: original });
  const continueButton = f.button(f.render(), 'Continue test retrieval'), count = f.injections.length;
  assert.equal(f.currentCommand().phase, 'snapshot', 'The durable journal must pause before the backup driver is injected');
  assert.equal(strategy(f), 'Original view restoration strategy: reserved backup');
  assert.deepEqual(f.pending(), original); assert.equal(f.savedCapture(), priorCapture);
  assert.deepEqual(f.writes, ['journal-start', 'journal-saved']);
  await f.loadFlight(); assert.equal(f.injections.length, count, 'Navigation cannot advance pre-backup pause');
  f.press(f.button(f.render(), 'Cancel retrieval')); f.press(continueButton);
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', token: 'abandoned-snapshot-token', status: 'next', view: original });
  assert.deepEqual(f.pending(), original);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: original });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
  assert.ok(!f.injections.some(script => /\}\)\("[^"]+","backup(?:-load|-verify)?"/.test(script)), 'Cancellation must never inject a backup save/load phase');
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', view: original });
  const secondCount = f.injections.length;
  f.press(continueButton); assert.equal(f.injections.length, secondCount, 'An old Continue cannot release the new request');
});

test('pre-backup Continue owns the request and preserves the existing verified-backup and post-reset checkpoint flow', async () => {
  const f = fixture({ priorCapture }); f.render(); await f.settle(null);
  f.press(f.button(f.render(), 'Enable pre-backup test pause'));
  f.press(f.button(f.render(), 'Enable interruption test pause'));
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight();
  await f.message({ kind: 'vf-view-v2', view: original });
  f.press(f.button(f.render(), 'Continue test retrieval')); assert.equal(f.currentCommand().phase, 'backup');
  await f.message({ kind: 'vf-view-v2', status: 'saved-request' }); await f.loadFlight();
  assert.equal(f.currentCommand().phase, 'backup-load');
  await f.message({ kind: 'vf-view-v2', status: 'load-request' }); await f.loadFlight();
  assert.equal(f.currentCommand().phase, 'backup-verify');
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.equal(f.currentCommand().phase, 'reset');
  await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  const count = f.injections.length; await f.loadFlight(); assert.equal(f.injections.length, count);
  f.press(f.button(f.render(), 'Continue test retrieval')); assert.equal(f.currentCommand().phase, 'columns');
  assert.deepEqual(f.pending(), original); assert.equal(f.savedCapture(), priorCapture);
  const restarted = fixture({ priorCapture }); restarted.render(); await restarted.settle(original);
  assert.equal(restarted.button(restarted.render(), 'Enable pre-backup test pause').props.disabled, true, 'Test mode is transient and pending recovery takes priority');
});

function webViewPath(tree: Element): number[] | undefined {
  if (tree.type === 'WebView') return [];
  for (let i = 0; i < tree.children.length; i++) {
    const child = tree.children[i];
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const path = webViewPath(child as Element); if (path) return [i, ...path];
    }
  }
}
function controlsHidden(f: ReturnType<typeof fixture>, tree: Element) {
  const controls = f.find(tree, element => element.children?.some(child => (child as Element | null)?.children?.includes('Vereinsflieger access PoC')));
  assert.ok(controls);
  return (controls.props.style as unknown[]).some(style => (style as { display?: string } | null)?.display === 'none');
}

test('provider expansion retains native identity, command callbacks and pending recovery while only hiding lab controls', async () => {
  const f = fixture({ priorCapture }); f.render(); await f.settle(null);
  f.press(f.button(f.render(), 'Enable pre-backup test pause'));
  f.press(f.button(f.render(), 'Retrieve flights')); await f.loadFlight();
  const before = f.render(), native = f.find(before, element => element.type === 'WebView'); assert.ok(native);
  const command = f.currentCommand(), count = f.injections.length;
  assert.equal(controlsHidden(f, before), false);
  f.press(f.button(before, 'Expand provider page'));
  const expanded = f.render(), expandedNative = f.find(expanded, element => element.type === 'WebView'); assert.ok(expandedNative);
  assert.equal(controlsHidden(f, expanded), true);
  assert.deepEqual(webViewPath(expanded), webViewPath(before));
  for (const property of ['key', 'source', 'ref']) assert.equal(expandedNative.props[property], native.props[property]);
  assert.equal(f.injections.length, count); assert.deepEqual(f.writes, []); assert.equal(f.pending(), null);
  // The callback obtained before the layout change still owns the same native
  // generation and command, demonstrating that expansion has not navigated.
  (native.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: FLIGHT_URL,
    data: JSON.stringify({ kind: 'vf-view-v2', ...command, url: FLIGHT_URL, view: original }) } });
  await f.flush(); assert.deepEqual(f.pending(), original); assert.equal(f.injections.length, count);
  for (const title of titles) assert.equal(f.button(f.render(), title).props.disabled, true);
  const pausedNative = f.find(f.render(), element => element.type === 'WebView'); assert.ok(pausedNative);
  f.press(f.button(f.render(), 'Back to lab'));
  const collapsed = f.render(), collapsedNative = f.find(collapsed, element => element.type === 'WebView'); assert.ok(collapsedNative);
  assert.equal(controlsHidden(f, collapsed), false); assert.deepEqual(webViewPath(collapsed), webViewPath(expanded));
  for (const property of ['key', 'source', 'ref']) assert.equal(collapsedNative.props[property], pausedNative.props[property]);
  assert.equal(f.injections.length, count); assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.button(collapsed, 'Cancel retrieval').props.disabled, false);
  f.press(f.button(collapsed, 'Cancel retrieval')); await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: original });
  assert.equal(f.pending(), null); assert.equal(f.savedCapture(), priorCapture);
});

test('Back to lab stays available during a journal write while expansion cannot bypass the saving guard', async () => {
  const f = fixture({ priorCapture, deferJournalSave: true }); await start(f);
  const staleExpand = f.button(f.render(), 'Expand provider page'); f.press(staleExpand);
  await f.message({ kind: 'vf-view-v2', view: original });
  const count = f.injections.length, back = f.button(f.render(), 'Back to lab');
  assert.equal(back.props.disabled, false); f.press(back);
  const collapsed = f.render(); assert.equal(controlsHidden(f, collapsed), false);
  assert.equal(f.button(collapsed, 'Expand provider page').props.disabled, true);
  assert.equal(f.button(collapsed, 'Cancel retrieval').props.disabled, true);
  f.press(staleExpand); assert.equal(controlsHidden(f, f.render()), false, 'Old expansion handler must respect the current write lock');
  assert.equal(f.injections.length, count); assert.deepEqual(f.writes, ['journal-start']);
  f.finishJournalSave(); await f.flush(); assert.deepEqual(f.pending(), original);
  assert.equal(f.button(f.render(), 'Expand provider page').props.disabled, false);
});


test('expiry redirect during a product export requires login and retains original-account recovery', async () => {
  const f = fixture({ product: true, priorCapture }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext); await f.controller().confirmConnection(); await f.loadFlight();
  await backupVerified(f);
  const count = f.injections.length;
  await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.controller().connection.phase, 'login-required');
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().visible, true);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().recovery, true);
  assert.deepEqual(f.pending(), original);
  assert.equal(f.savedCapture(), priorCapture);
  assert.equal(f.injections.length, count, 'Expired session cannot receive a restoration mutation');
});


test('legacy unassigned recovery blocks capture/disconnect without claiming its original view', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(original); await f.flush();
  assert.equal(f.controller().legacyRecovery, true); assert.equal(f.controller().recovery, true);
  assert.equal(f.controller().original.current, null);
  await establishProductAssociation(f);
  f.controller().retrieve(); f.controller().recoverView(); f.controller().startDisconnect();
  assert.equal(f.controller().busy, false); assert.equal(f.controller().disconnecting, false);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.pending(), original);
});

async function startReviewedRecovery(f: ReturnType<typeof fixture>, accepted: ViewPreferences | null = null) {
  f.controller().requestLegacyRecovery('ab'.repeat(32), accepted);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  for (let i=0;i<5;i++) await f.flush();
  if (f.controller().busy) await f.loadFlight();
}

test('reviewed recovery saves current view before replay and requires full readback plus fresh context before receipt', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(original); await establishProductAssociation(f);
  assert.equal(f.writes.length, 0); // Startup never reads/adopts the full legacy journal.
  await startReviewedRecovery(f);
  assert.deepEqual(f.writes, ['legacy-read', 'legacy-copy']);
  await f.message({ kind: 'vf-view-v2', view: original }); await f.flush();
  assert.equal(f.currentCommand().phase, 'restore');
  assert.deepEqual(f.writes.slice(-2), ['legacy-safety-start', 'legacy-safety']);
  f.controller().retrieve(); await f.controller().clearLocalSession();
  assert.equal(f.clearCalls(), 0);
  await f.message({ kind: 'vf-view-v2', status: 'next' });
  assert.equal(f.currentCommand().phase, 'verify');
  await f.message({ kind: 'vf-view-v2', status: 'next', view: original });
  assert.equal(f.writes.includes('legacy-receipt'), false);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); for(let i=0;i<5;i++) await f.flush();
  assert.equal(f.writes.includes('legacy-receipt'), true);
  assert.equal(f.controller().recovery, false); assert.equal(f.controller().legacyRecovery, false);
  assert.equal(f.controller().result, 'recovered');
  assert.deepEqual(f.pending(), original); // Immutable original untouched.
  assert.equal(f.writes.includes('cleared'), false);
  await f.controller().refreshRecovery(); assert.equal(f.controller().legacyRecovery, false);
});

test('a differing private current view pauses without mutation and consent is bound to its exact snapshot', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(original); await establishProductAssociation(f);
  await startReviewedRecovery(f);
  const current = { ...original, period: 'Die letzten 20 Flüge (max. 24 Monate)' };
  await f.message({ kind: 'vf-view-v2', view: current }); await f.flush();
  assert.equal(f.controller().busy, false); assert.equal(f.controller().legacyRecovery, true);
  assert.equal(f.controller().result, 'review-required');
  assert.deepEqual(f.controller().legacyChoice?.current, current);
  assert.equal(f.currentCommand().phase, 'snapshot');
  const before = f.injections.length;
  f.controller().requestLegacyRecovery('ab'.repeat(32), { ...current, period: 'forged choice' });
  assert.equal(f.injections.length, before); assert.equal(f.controller().connection.phase, 'observed');
  await startReviewedRecovery(f, current);
  // Current settings changed again after the choice: pause and ask again.
  const newer = { ...current, role: 'Pilot oder Fluglehrer' };
  await f.message({ kind: 'vf-view-v2', view: newer }); await f.flush();
  assert.equal(f.controller().busy, false); assert.deepEqual(f.controller().legacyChoice?.current, newer);
  assert.equal(f.writes.includes('legacy-receipt'), false);
  await startReviewedRecovery(f, newer);
  await f.message({ kind: 'vf-view-v2', view: newer }); await f.flush();
  assert.equal(f.currentCommand().phase, 'restore');
  assert.deepEqual(f.pending(), original);
});

test('legacy safety failure or interruption cannot run a restore command or waive quarantine', async () => {
  for (const mode of ['failure', 'background', 'background-return', 'owner'] as const) {
    const f = fixture({ product: true, failSafety: mode === 'failure', deferSafety: mode !== 'failure' });
    f.render(); await f.settle(original); await establishProductAssociation(f); await startReviewedRecovery(f);
    await f.message({ kind: 'vf-view-v2', view: original });
    if (mode === 'background' || mode === 'background-return') f.appState('background');
    if (mode === 'background-return') f.appState('active');
    if (mode === 'owner') f.changeOwner('other-owner');
    f.finishSafety(); for(let i=0;i<5;i++) await f.flush();
    assert.equal(f.currentCommand().phase, 'snapshot');
    assert.equal(f.writes.includes('legacy-receipt'), false); assert.equal(f.controller().recovery, true);
    assert.deepEqual(f.pending(), original);
  }
});

test('changed source, mismatched readback and receipt failure retain legacy quarantine', async () => {
  for (const mode of ['source', 'readback', 'receipt'] as const) {
    const f = fixture({ product: true, failReceipt: mode === 'receipt' }); f.render(); await f.settle(original); await establishProductAssociation(f);
    await startReviewedRecovery(f); await f.message({ kind: 'vf-view-v2', view: original }); await f.flush();
    await f.message({ kind: 'vf-view-v2', status: 'next' });
    await f.message({ kind: 'vf-view-v2', status: 'next', view: mode === 'readback' ? { ...original, period: 'wrong' } : original });
    if (mode !== 'readback') {
      if (mode === 'source') f.changeFingerprint();
      await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); for(let i=0;i<5;i++) await f.flush();
    }
    assert.equal(f.writes.includes('legacy-receipt'), false); assert.equal(f.controller().legacyRecovery, true);
    assert.equal(f.controller().recovery, true); assert.deepEqual(f.pending(), original);
  }
});

test('failed exact legacy read and foreign fresh provider context cannot create a recovery copy', async () => {
  const f = fixture({ product: true, failLegacyRead: true }); f.render(); await f.settle(original); await establishProductAssociation(f);
  await startReviewedRecovery(f); assert.deepEqual(f.writes, ['legacy-read']); assert.equal(f.controller().busy, false);
  const foreign = fixture({ product: true }); foreign.render(); await foreign.settle(original); await establishProductAssociation(foreign);
  foreign.controller().requestLegacyRecovery('ab'.repeat(32)); await foreign.loadPage(context.PROFILE_URL);
  await foreign.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.deepEqual(foreign.writes, []); assert.equal(foreign.controller().connection.phase, 'mismatch');
});

test('platforms without recovery module retain ordinary startup and quarantine without gaining legacy replay', async () => {
  for (const legacy of [null, original]) {
    const f = fixture({ product: true, noNativeRecovery: true }); f.render(); await f.settle(legacy); for(let i=0;i<4;i++) await f.flush();
    assert.equal(f.controller().viewReady, true); assert.equal(f.controller().recovery, !!legacy);
    assert.equal(f.controller().legacyRecoveryAvailable, false);
    await establishProductAssociation(f); f.controller().requestLegacyRecovery('ab'.repeat(32));
    assert.equal(f.writes.length, 0); assert.equal(f.controller().busy, false);
  }
});

test('association persistence is serialized and a backgrounded confirmation cannot resume retrieval', async () => {
  const f = fixture({ product: true, deferBinding: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  const saving = f.controller().confirmConnection();
  assert.equal(f.controller().binding, true); await f.controller().confirmConnection();
  f.controller().retrieve(); f.controller().startDisconnect(); f.controller().useLogin();
  assert.equal(f.scopeWrites(), 1); assert.equal(f.controller().busy, false); assert.equal(f.controller().loginBusy, false);
  f.appState('background'); f.finishBinding(); await saving; await f.flush();
  assert.equal(f.controller().connection.confirmed, false); assert.equal(f.controller().busy, false);
  f.appState('active'); assert.equal(f.controller().connection.confirmed, false);
});

test('failed association write does not confirm the session or save capture evidence', async () => {
  const f = fixture({ product: true, failBinding: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection('retrieve'); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.controller().confirmConnection();
  assert.equal(f.controller().connection.confirmed, false); f.controller().retrieve();
  assert.equal(f.controller().busy, false); assert.deepEqual(f.writes, []);
});

test('reopened association rejects a different provider account before capture or recovery', async () => {
  const f = fixture({ product: true, persistedScope: { version: 1, owner: 'synthetic-pilot', connectionId: 'prior', context: observedContext } });
  f.render(); await f.settle(null); for (let i=0;i<4;i++) await f.flush();
  assert.equal(f.controller().connection.confirmed, false);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(f.controller().connection.phase, 'mismatch');
  await f.controller().confirmConnection(); f.controller().retrieve();
  assert.equal(f.scopeWrites(), 0); assert.equal(f.controller().busy, false); assert.deepEqual(f.writes, []);
});


test('local clearing is blocked for unknown or legacy-pending recovery and while a check owns the controller', async () => {
  const f = fixture({ product: true }); f.render(); await f.controller().clearLocalSession();
  assert.equal(f.clearCalls(), 0);
  await f.settle(original); await f.flush(); await f.controller().clearLocalSession(); assert.equal(f.clearCalls(), 0);
  const checking = fixture({ product: true }); checking.render(); await checking.settle(null); await establishProductAssociation(checking);
  checking.controller().checkConnection(); await checking.controller().clearLocalSession(); assert.equal(checking.clearCalls(), 0);
});

test('local clearing detaches the document first, serializes mutation and stays unconfirmed after background completion', async () => {
  const f = fixture({ product: true, deferClear: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  const saved = f.savedCapture();
  const clearing = f.controller().clearLocalSession();
  assert.equal(f.clearCalls(), 0); assert.equal(f.controller().browserActive, false);
  await f.flush(); assert.equal(f.clearCalls(), 1);
  await f.controller().clearLocalSession(); f.controller().connect(); f.controller().useLogin();
  f.controller().startDisconnect(); f.controller().retrieve(); await f.controller().forgetLogin();
  assert.equal(f.clearCalls(), 1); assert.equal(f.controller().loginBusy, false); assert.equal(f.controller().busy, false);
  assert.equal(f.loginStorage().forgets, 0); assert.deepEqual(f.writes, []);
  f.appState('background'); f.finishClear(); await clearing; await f.flush();
  assert.equal(f.controller().clearNotice, 'cleared'); assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().browserActive, false); assert.equal(f.savedCapture(), saved);
  f.appState('active'); f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(f.controller().connection.phase, 'mismatch');
});

test('a native clearing failure cannot claim local removal or provider sign-out', async () => {
  const f = fixture({ product: true, failClear: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  const clearing = f.controller().clearLocalSession(); await f.flush(); await clearing;
  assert.equal(f.controller().clearNotice, 'failed'); assert.equal(f.controller().disconnectedAt, null);
  assert.equal(f.controller().connection.confirmed, false); assert.equal(f.controller().browserActive, false);
});


test('changing the explicit local owner quarantines the retained controller instead of reusing its association', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  f.changeOwner('another-local-owner'); await f.flush();
  assert.equal(f.controller().connection.confirmed, false); assert.equal(f.controller().viewReady, false);
  assert.equal(f.controller().snapshot, null); assert.equal(f.controller().browserActive, false);
  f.controller().retrieve(); f.controller().useLogin(); f.controller().connect(); await f.controller().clearLocalSession();
  assert.equal(f.controller().busy, false); assert.equal(f.clearCalls(), 0); assert.equal(f.controller().browserActive, false);
});


test('renderer termination cancels an outstanding secret read before its late resolution', async () => {
  const f = fixture({ product: true, deferLoginRead: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().useLogin(); await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.loginStorage().reads, 1);
  const web = f.find(f.render(), element => element.type === 'WebView')!;
  (web.props.onRenderProcessGone as () => void)();
  f.finishLoginRead({ username: 'synthetic', password: 'synthetic' }); await f.flush();
  assert.equal(f.controller().loginBusy, false); assert.equal(f.controller().loginNotice, 'cancelled');
  assert.ok(f.injections.every(script => !script.includes('login.username')));
});

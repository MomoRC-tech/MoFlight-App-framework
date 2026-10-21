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
import { captureFixture } from './capture-review-fixture.ts';
import * as information from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
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
const savedLoginSource = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/use-saved-login.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
}).outputText;
const informationControllerSource = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/use-information-controller.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
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
  let historyBacks = 0;
  let nativeReloads = 0;
  let informationReads = 0, savedInformation: information.InformationCapture | null = null;
  let informationReader = async (_scope: ProviderScope, gate: () => void): Promise<information.InformationCapture[]> => { gate(); return savedInformation ? [savedInformation] : []; };
  let informationCaptureReader = async (_scope: ProviderScope, id: string, gate: () => void): Promise<information.InformationCapture | null> => { gate(); return savedInformation?.id === id ? savedInformation : null; };
  let informationHistoryReader = async (_scope: ProviderScope, category: information.InformationCategory, position: number, gate: () => void): Promise<information.InformationHistory> => { gate(); return { category, index: position, total: 0, capture: null }; };
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
  const nativeWeb = { injectJavaScript: (script: string) => injections.push(script), reload() { nativeReloads++; }, stopLoading() {}, goBack() { historyBacks++; } };
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
    './flight-diagnostics': { startFlightSpan:()=>()=>{} },
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
    './export': { ...exporter, calendarYearRequest: () => ({ from: '2026-01-01', to: '2026-12-31' }), recentCaptureRequest: () => ({ from: '2026-01-01', to: '2026-12-31' }) },
    './retrieval': { Retrieval }, './CaptureRun': { CaptureRun }, './WindowCapture': { WindowCapture },
    './login': login, './view': view, './context': context, './connection-state': { ConnectionSession },
    './information': information, './information-run': { InformationRun },
    './information-native': { readInformationCapture: (scope: ProviderScope, id: string, gate: () => void) => informationCaptureReader(scope, id, gate), loadInformation: (scope: ProviderScope, gate: () => void) => { informationReads++; return informationReader(scope, gate); }, readInformationHistory: (scope: ProviderScope, category: information.InformationCategory, position: number, gate: () => void) => informationHistoryReader(scope, category, position, gate), saveInformation: async (_scope: unknown, value: unknown, gate: () => void) => { gate(); savedInformation = information.validateInformationCapture(value); writes.push('information-saved'); } },
  };
  const runtime = { require: (name: string) => {
    assert.ok(name in modules, `Unexpected component dependency: ${name}`); return modules[name];
  }, setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout: (id: number) => timers.delete(id), URL };
  const loginExports = {};
  runInNewContext(savedLoginSource, { exports: loginExports, ...runtime });
  modules['./use-saved-login'] = loginExports;
  const informationExports = {};
  runInNewContext(informationControllerSource, { exports: informationExports, ...runtime });
  modules['./use-information-controller'] = informationExports;
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
    await journal.catch(() => {}); await new Promise<void>(resolve => { setImmediate(resolve); });
  }
  // Drain completed promise chains without depending on how many async feature
  // boundaries they cross. Deferred storage and the controlled timers stay pending.
  async function flush() { await new Promise<void>(resolve => { setImmediate(resolve); }); return render(); }
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
  function history(canGoBack: boolean) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    (web.props.onNavigationStateChange as (state: unknown) => void)({ url: probe.LOGIN_URL, canGoBack });
    render();
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
    setInformationReader: (reader: typeof informationReader) => { informationReader = reader; }, informationReads: () => informationReads, savedInformation: () => savedInformation,
    setInformationCaptureReader: (reader: typeof informationCaptureReader) => { informationCaptureReader = reader; },
    setInformationHistoryReader: (reader: typeof informationHistoryReader) => { informationHistoryReader = reader; },
    contextMessage, loginMessage, history, historyBacks: () => historyBacks, nativeReloads: () => nativeReloads,
    allowNavigation, lastIssuedNonce: () => issuedNonces.at(-1),
    unmount: () => { for (const hook of hooks) if (hook && typeof hook === 'object' && 'cleanup' in hook && typeof hook.cleanup === 'function') hook.cleanup(); },
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

test('combined action checks retained session and binds only a fresh matching profile without a confirmation tap',async()=>{
  const f=fixture({product:true});f.render();await f.settle(null);await f.flush();
  f.controller().beginGuidedFlightConnection();
  assert.equal(f.controller().connection.phase,'checking');
  await f.loadPage(context.PROFILE_URL);await f.contextMessage(observedContext);await f.flush();
  assert.equal(f.controller().connection.confirmed,true);assert.equal(f.controller().visible,false);assert.equal(f.scopeWrites(),1);
  f.controller().beginGuidedFlightConnection();await f.loadPage(context.PROFILE_URL);await f.contextMessage(observedContext);
  assert.equal(f.controller().connection.confirmed,true);assert.equal(f.scopeWrites(),1);
  f.controller().beginGuidedFlightConnection();await f.loadPage(context.PROFILE_URL);await f.contextMessage({...observedContext,accountNumber:'456'});
  assert.equal(f.controller().connection.phase,'mismatch');assert.equal(f.scopeWrites(),1);assert.equal(f.controller().busy,false);
  f.unmount();
});

test('combined login resumes after original-page authentication but never after dismissal or background',async()=>{
  for(const stop of ['none','dismiss','background'] as const){
    const f=fixture({product:true});f.render();await f.settle(null);await f.flush();
    f.controller().beginGuidedFlightConnection();await f.loadPage(context.PROFILE_URL);await f.loadPage(probe.LOGIN_URL);
    await f.contextMessage({error:'session-required'},probe.LOGIN_URL,undefined,probe.LOGIN_URL,'vf-login-required-v1');
    assert.equal(f.controller().visible,true);assert.equal(f.scopeWrites(),0);
    if(stop==='dismiss')f.controller().dismissLogin();
    if(stop==='background'){f.appState('background');f.appState('active');}
    await f.loadPage('https://vereinsflieger.de/member/index.php');
    if(stop==='none'){
      assert.equal(f.controller().connection.phase,'checking');await f.loadPage(context.PROFILE_URL);await f.contextMessage(observedContext);
      assert.equal(f.controller().connection.confirmed,true);assert.equal(f.scopeWrites(),1);
    }else{assert.notEqual(f.controller().connection.phase,'checking');assert.equal(f.scopeWrites(),0);}
    f.unmount();
  }
});

test('provider Back uses retained native history only on an idle visible owned page', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null);
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 0);
  f.history(true);
  const browserKey = (f.controller().browser as any).props.key;
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 1);
  assert.equal((f.controller().browser as any).props.key, browserKey);
  assert.equal(f.controller().connection.phase, 'unknown');
  assert.deepEqual(f.writes, []);
  f.controller().checkConnection();
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 1, 'Cannot interrupt owned session check');
  f.controller().dismissLogin();
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 1, 'Closed provider presentation cannot navigate');
  f.controller().connect(); f.history(true); f.appState('background');
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 1, 'Background action is refused');
  f.appState('active'); f.changeOwner('other-synthetic-pilot');
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 1, 'A changed owner cannot navigate the prior browser');
});

test('provider Back cannot interrupt saved-login reading or submission', async () => {
  const f = fixture({ product: true, deferLoginRead: true }); f.render(); await f.settle(null); await f.flush();
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL); f.history(true);
  const login = f.controller().useLogin(); await f.flush();
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 0);
  f.finishLoginRead({ username: 'synthetic-user', password: 'synthetic-password' }); await login; await f.flush();
  await f.loadPage(probe.LOGIN_URL); f.history(true);
  f.controller().backWithinProvider(); assert.equal(f.historyBacks(), 0);
  assert.deepEqual(f.writes, []);
});

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

async function reachPostCaptureCheck(f: ReturnType<typeof fixture>) {
  await establishProductAssociation(f);
  f.controller().retrieve(); await f.loadFlight(); await backupVerified(f);
  for (const phase of exporter.EXPORT_PHASES.filter(phase => phase !== 'read')) {
    assert.equal(f.currentCommand().phase, phase);
    await f.message({ kind: 'vf-export-v1', status: 'next', preset: exporter.ACTIVE_EXPORT_VIEW });
  }
  await f.message({ kind: 'vf-export-v1', status: 'page', preset: exporter.ACTIVE_EXPORT_VIEW,
    period: 'ab 01.01.2026 bis 31.12.2026', participation: exporter.PARTICIPATION, filtersClear: true, allColumns: true,
    headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Kosten'], columnIds: ['1', '2', '3', '4', '5', '6'],
    first: 0, last: 0, total: 0, rows: [], nextUrl: null });
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
  assert.equal(f.controller().completedFlightSource, null, 'A foreign after-context cannot publish source input');
});

test('late post-capture context cannot publish source input after cancellation or backgrounding', async () => {
  for (const boundary of ['cancel', 'background'] as const) {
    const f = fixture({ product: true, priorCapture }); f.render(); await f.settle(null);
    await reachPostCaptureCheck(f); await f.loadPage(context.PROFILE_URL);
    const staleNonce = /nonce:"([^\"]+)"/.exec(f.injections.at(-1)!)![1]!;
    if (boundary === 'cancel') f.controller().cancelRetrieval();
    else f.appState('background');
    await f.contextMessage(observedContext, context.PROFILE_URL, staleNonce);
    assert.equal(f.controller().completedFlightSource, null, `${boundary} leaves no publishable source input`);
    assert.equal(f.writes.includes('capture-saved'), false);
    assert.equal(f.savedCapture(), priorCapture);
  }
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
  assert.equal(f.controller().completedFlightSource, null, 'Raw save alone is not enough before view restoration');
  await restoredReadback(f);
  await f.message({ kind: 'vf-view-v2', status: 'next', view: restored });
  assert.deepEqual(f.pending(), original, 'Restored view alone must wait for final account check');
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.pending(), null);
  assert.equal(f.controller().busy, false);
  assert.equal(f.controller().result, 'captured');
  assert.equal(f.controller().lastSuccessfulCaptureAt, f.savedCapture()!.retrievedAt);
  const sourceInput = f.controller().completedFlightSource;
  assert.ok(sourceInput);
  assert.equal(sourceInput.binding.accountRef, observedContext.accountNumber);
  assert.equal(canonical(sourceInput.contextBefore), canonical(observedContext));
  assert.equal(canonical(sourceInput.contextAfter), canonical(observedContext));
  assert.equal(canonical(sourceInput.requestedWindow), canonical({ from: '2026-01-01', to: '2026-12-31', participation: exporter.PARTICIPATION }));
  assert.equal(canonical(sourceInput.capture), canonical(f.savedCapture()));
  f.controller().dismissLogin();
  assert.equal(f.controller().completedFlightSource, sourceInput, 'Closing the provider panel retains completed source evidence');
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.controller().completedFlightSource, sourceInput, 'A same-context check does not replace the completed capture evidence');
  f.controller().retrieve();
  assert.equal(f.controller().completedFlightSource, null, 'A new retrieval supersedes the earlier source input');
  f.controller().cancelRetrieval();
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
  f.changeOwner('other-owner'); await f.flush();
  assert.equal(f.controller().legacyChoice, null); assert.equal(f.controller().original.current, null);
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

test('explicit browser suspension preserves scoped evidence and recovery while rejecting late native callbacks', async () => {
  const capture = captureFixture();
  const f = fixture({ product: true, priorCapture: capture,
    persistedScope: { version: 1, owner: 'synthetic-pilot', connectionId: 'prior', context: observedContext }, scopedView: original });
  f.render(); await f.settle(null); for (let i = 0; i < 4; i++) await f.flush();
  assert.equal(f.controller().snapshot, capture);
  assert.equal(f.controller().recovery, true);
  assert.deepEqual(f.controller().original.current, original);

  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  const staleWebView = f.find(f.render(), element => element.type === 'WebView'); assert.ok(staleWebView);
  const staleLoadEnd = staleWebView.props.onLoadEnd as (event: unknown) => void;
  const injectionsBefore = f.injections.length;
  assert.equal(f.controller().suspendBrowserForOwnerSwitch(), true);
  assert.equal(f.controller().browserActive, false);
  assert.equal(f.controller().visible, false);
  assert.equal(f.controller().loaded, false);
  assert.equal(f.controller().connection.phase, 'unknown');
  assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().snapshot, capture);
  assert.equal(f.controller().recovery, true);
  assert.deepEqual(f.controller().original.current, original);
  staleLoadEnd({ nativeEvent: { url: probe.LOGIN_URL } });
  await f.flush();
  assert.equal(f.controller().loaded, false, 'A callback from the detached document cannot mark it loaded again');
  assert.equal(f.injections.length, injectionsBefore, 'A callback from the detached document cannot inject a new page command');
  assert.deepEqual(f.writes, [], 'Suspension does not write captures, recovery, or information files');
  assert.deepEqual(f.loginStorage(), { reads: 0, forgets: 0 }, 'Suspension does not read, change, or forget credentials');
  assert.equal(f.scopeWrites(), 0);

  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  assert.equal(f.controller().browserActive, true, 'The existing connect path resumes the provider browser');
  f.controller().checkConnection(); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '456' });
  assert.equal(f.controller().connection.phase, 'mismatch', 'The prior owner association remains binding after suspension');
  assert.equal(f.scopeWrites(), 0);
  assert.equal(f.savedCapture(), capture);
  assert.deepEqual(f.writes, []);
});

test('explicit browser suspension refuses while a provider context check owns the browser', async () => {
  const f = fixture({ product: true }); f.render(); await f.settle(null); for (let i = 0; i < 4; i++) await f.flush();
  f.controller().connect(); await f.loadPage(probe.LOGIN_URL);
  f.controller().checkConnection();
  assert.equal(f.controller().connection.phase, 'checking');
  const generation = f.controller().generation;
  assert.equal(f.controller().suspendBrowserForOwnerSwitch(), false);
  assert.equal(f.controller().browserActive, true);
  assert.equal(f.controller().visible, true);
  assert.equal(f.controller().connection.phase, 'checking');
  assert.equal(f.controller().generation, generation, 'A refused suspension leaves native callbacks owned by the active check');
  assert.deepEqual(f.writes, []);
});

test('saved owner-scoped review loads offline before recovery is ready and survives recovery-read failure', async () => {
  const capture = captureFixture();
  const f = fixture({ product: true, priorCapture: capture, persistedScope: { version: 1, owner: 'synthetic-pilot', connectionId: 'prior', context: observedContext } });
  f.render(); for (let i = 0; i < 4; i++) await f.flush();
  assert.equal(f.controller().snapshot, capture);
  assert.equal(f.controller().captureLoadState, 'ready');
  assert.equal(f.controller().viewReady, false);
  assert.equal(f.controller().browserActive, false); assert.equal(f.controller().connection.confirmed, false);
  assert.equal(f.controller().completedFlightSource, null, 'A persisted capture has no live before/after retrieval context');
  await f.settle(new Error('Synthetic failed legacy diagnostic'));
  for (let i = 0; i < 4; i++) await f.flush();
  assert.equal(f.controller().snapshot, capture); assert.equal(f.controller().captureLoadState, 'ready');
  assert.equal(f.controller().recovery, true); assert.deepEqual(f.writes, []);
  f.changeOwner('other-owner');
  assert.equal(f.controller().snapshot, null, 'Old owner capture is hidden on the first changed-owner render');
});

test('cancelled and failed live attempts retain the previously reopened readable capture', async () => {
  for (const outcome of ['cancel', 'failure'] as const) {
    const capture = captureFixture();
    const f = fixture({ product: true, priorCapture: capture, persistedScope: { version: 1, owner: 'synthetic-pilot', connectionId: 'prior', context: observedContext } });
    f.render(); await f.settle(null); for (let i = 0; i < 4; i++) await f.flush();
    await establishProductAssociation(f);
    f.controller().retrieve(); await f.loadFlight();
    if (outcome === 'cancel') f.controller().cancelRetrieval();
    else (f.find(f.render(), element => element.type === 'WebView')!.props.onError as () => void)();
    await f.flush();
    assert.equal(f.controller().snapshot, capture); assert.equal(f.savedCapture(), capture);
    assert.equal(f.controller().captureLoadState, 'ready');
    assert.ok(!f.writes.includes('capture-start'));
  }
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

const informationSource = 'https://vereinsflieger.de/member/profile/synthetic-hours?year=2026';
const informationPage = {
  category: 'work-hours', path: '/member/profile/synthetic-hours',
  columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'activity', label: 'Tätigkeit', index: 1 }, { key: 'hours', label: 'Stunden', index: 2 }, { key: 'status', label: 'Status', index: 3 }],
  rows: [{ position: 1, values: ['01.10.2026', 'Synthetic activity', '2.00', 'Akzeptiert'] }], filters: ['2026'], empty: false,
  coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' },
};
async function startInformationFixture() {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  f.controller().setVisible(true); f.controller().navigate(informationSource); await f.loadPage(informationSource);
  f.controller().startInformation(); await f.flush();
  return f;
}
async function informationMessage(f: ReturnType<typeof fixture>) {
  const web = f.find(f.render(), e => e.type === 'WebView')!;
  (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: informationSource, data: JSON.stringify({ kind: 'vf-information-v1', nonce: f.lastIssuedNonce() + '-read', url: informationSource, page: informationPage }) } });
  await f.flush();
}
test('information and saved-login features share exclusive browser admission', async () => {
  const informationOwner = await startInformationFixture();
  const informationUrl = informationOwner.controller().url;
  informationOwner.controller().useLogin();
  await informationOwner.controller().forgetLogin();
  assert.equal(informationOwner.controller().informationBusy, true);
  assert.equal(informationOwner.controller().loginBusy, false);
  assert.equal(informationOwner.controller().url, informationUrl);
  assert.deepEqual(informationOwner.loginStorage(), { reads: 0, forgets: 0 });

  const loginOwner = fixture({ product: true, persistedScope: {
    version: 1, owner: 'synthetic-pilot', connectionId: 'exclusive-features', context: observedContext,
  } });
  loginOwner.render(); await loginOwner.settle(null);
  loginOwner.controller().setVisible(true); loginOwner.controller().navigate(informationSource);
  await loginOwner.loadPage(informationSource);
  loginOwner.controller().useLogin();
  const loginUrl = loginOwner.controller().url;
  loginOwner.controller().startInformation();
  assert.equal(loginOwner.controller().loginBusy, true);
  assert.equal(loginOwner.controller().informationBusy, false);
  assert.equal(loginOwner.controller().url, loginUrl);
  assert.deepEqual(loginOwner.writes, []);
  loginOwner.controller().dismissLogin();
});
test('information capture saves only after matching protected profiles before and after the selected source', async () => {
  const f = await startInformationFixture(); assert.equal(f.controller().informationBusy, true);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadPage(informationSource); await informationMessage(f);
  assert.ok(!f.writes.includes('information-saved'));
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush(); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1);
  assert.equal(f.controller().informationBusy, false); assert.match(f.controller().informationNotice, /lokal gespeichert/);
  assert.ok(!f.writes.includes('capture-saved')); assert.equal(f.loginStorage().reads, 0);
});
test('information context mismatch after extraction preserves old flight capture and performs no save', async () => {
  const f = await startInformationFixture(); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadPage(informationSource); await informationMessage(f); await f.loadPage(context.PROFILE_URL);
  await f.contextMessage({ ...observedContext, accountNumber: '999' });
  assert.ok(!f.writes.includes('information-saved')); assert.equal(f.controller().informationBusy, false);
  assert.match(f.controller().informationNotice, /nicht bestätigt/); assert.ok(!f.writes.includes('capture-saved'));
});
test('background cancellation prevents late information callbacks from saving or publishing', async () => {
  const f = await startInformationFixture(); await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadPage(informationSource); const web = f.find(f.render(), e => e.type === 'WebView')!;
  f.appState('background'); await f.flush();
  (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: informationSource, data: JSON.stringify({ kind: 'vf-information-v1', nonce: f.lastIssuedNonce() + '-read', url: informationSource, page: informationPage }) } });
  await f.flush(); assert.equal(f.controller().informationBusy, false); assert.ok(!f.writes.includes('information-saved'));
});

const trainingSummarySource = 'https://vereinsflieger.de/member/profile/usereducation/summaryueid?ueid=synthetic-selected';
const trainingSummaryPage = {
  category: 'training-summary', path: '/member/profile/usereducation/summaryueid',
  columns: [['group', 'Ausbildungsbereich'], ['field', 'Quellenfeld'], ['unit', 'Quelleneinheit'], ['value', 'Originaltext']].map(([key, label], index) => ({ key, label, index })),
  rows: ['Praktische Ausbildung', 'Theoretische Ausbildung'].flatMap((group, g) => [
    ...['Lernziele beendet', 'Lernziele begonnen', 'Lernziele nicht begonnen'].map((field, i) => ({ position: g * 3 + i, values: [group, field, 'Anzahl', String(i)] })),
    ...(g ? [{ position: 6, values: [group, 'Theoriestunden', 'Zeit', ''] }] : []),
  ]), filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' },
};
async function trainingSummaryFixture(read = true) {
  const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
  for (let i = 0; i < information.informationCategories.length && f.controller().informationCategory !== 'training-summary'; i++) f.controller().nextInformationCategory();
  f.controller().setVisible(true); f.controller().navigate(trainingSummarySource); await f.loadPage(trainingSummarySource);
  f.controller().startInformation(); await f.flush();
  if (read) { await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.loadPage(trainingSummarySource); }
  return f;
}
async function summaryMessage(f: ReturnType<typeof fixture>, page: unknown, nonce = f.lastIssuedNonce()) {
  const web = f.find(f.render(), e => e.type === 'WebView')!;
  (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: trainingSummarySource, data: JSON.stringify({ kind: 'vf-information-v1', nonce: nonce + '-read', url: trainingSummarySource, page }) } });
  await f.flush();
}
test('explicit summary retry retains the selected source, ignores stale messages and rechecks both contexts before a single save', async () => {
  const f = await trainingSummaryFixture(), failedNonce = f.lastIssuedNonce();
  await summaryMessage(f, { error: 'training-summary-unverified' });
  assert.equal(f.controller().informationRetryReady, true); assert.equal(f.controller().informationNeedsReload, false);
  assert.match(f.controller().informationNotice, /Ausbildungsübersicht/); assert.ok(!f.writes.includes('information-saved'));
  f.controller().navigate(context.PROFILE_URL); await f.loadPage(context.PROFILE_URL);
  f.controller().retryInformation(); await f.flush();
  assert.notEqual(f.lastIssuedNonce(), failedNonce); assert.equal(f.controller().informationBusy, true);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.controller().currentUrl.current, trainingSummarySource, 'Retry must use the originally selected opaque enrolment URL');
  await f.loadPage(trainingSummarySource); await summaryMessage(f, trainingSummaryPage, failedNonce);
  assert.ok(!f.writes.includes('information-saved'));
  await summaryMessage(f, trainingSummaryPage); assert.ok(!f.writes.includes('information-saved'));
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1);
  assert.equal(canonical(f.controller().informationCaptures[0]!.rows), canonical(trainingSummaryPage.rows));
  assert.equal(f.controller().informationRetryReady, false); assert.equal(f.loginStorage().reads, 0);
});

test('summary retry rejects changed account or club; changing category, owner or cancelling removes the old retry', async () => {
  for (const boundary of ['account', 'club', 'category', 'owner', 'cancel', 'background'] as const) {
    const f = await trainingSummaryFixture(); await summaryMessage(f, { error: 'source-unavailable' });
    if (boundary === 'category') f.controller().nextInformationCategory();
    if (boundary === 'owner') f.changeOwner('another-owner');
    if (boundary === 'cancel') f.controller().stopInformation();
    if (boundary === 'background') { f.appState('background'); f.appState('active'); }
    f.controller().retryInformation(); await f.flush();
    if (boundary === 'account' || boundary === 'club') {
      await f.loadPage(context.PROFILE_URL); await f.contextMessage({ ...observedContext, ...(boundary === 'account' ? { accountNumber: '999' } : { clubLabel: 'Another club' }) });
    } else assert.equal(f.controller().informationBusy, false, boundary);
    assert.ok(!f.writes.includes('information-saved'), boundary);
  }
});

test('network failure and expired source login expose only explicit retry and cannot save late source data', async () => {
  for (const failure of ['network', 'session'] as const) {
    const f = await trainingSummaryFixture(), failedNonce = f.lastIssuedNonce();
    if (failure === 'network') {
      const web = f.find(f.render(), e => e.type === 'WebView')!; (web.props.onHttpError as () => void)();
    } else await summaryMessage(f, { error: 'source-unavailable' });
    await f.flush(); assert.equal(f.controller().informationRetryReady, true); assert.equal(f.controller().informationBusy, false);
    await summaryMessage(f, trainingSummaryPage, failedNonce); assert.ok(!f.writes.includes('information-saved'));
    f.controller().retryInformation(); await f.flush(); await f.loadPage(context.PROFILE_URL);
    await f.contextMessage({ error: 'session-required' });
    assert.ok(!f.writes.includes('information-saved')); assert.equal(f.controller().informationBusy, false);
    assert.match(f.controller().informationNotice, /Anbietersitzung abgelaufen/);
    assert.equal(f.loginStorage().reads, 0);
  }
});

test('explicit source retry recovers a native load-start/error without load-end and still verifies both contexts before one save', async () => {
  const f = await trainingSummaryFixture(), failedNonce = f.lastIssuedNonce();
  const loadingWeb = f.find(f.render(), e => e.type === 'WebView')!;
  (loadingWeb.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: trainingSummarySource } });
  await f.flush();
  const failedWeb = f.find(f.render(), e => e.type === 'WebView')!;
  (failedWeb.props.onError as () => void)(); await f.flush();
  assert.equal(f.controller().loaded, false, 'Native failure deliberately has no load-end callback');
  assert.equal(f.controller().informationRetryReady, true); assert.equal(f.controller().informationBusy, false);
  f.controller().startInformation(); await f.flush();
  assert.equal(f.controller().informationBusy, false, 'Ordinary capture still requires a loaded source document');
  f.controller().retryInformation(); await f.flush();
  assert.equal(f.controller().informationBusy, true, 'Explicit retry must not depend on the failed document loading');
  assert.equal(f.controller().currentUrl.current, context.PROFILE_URL);
  assert.notEqual(f.lastIssuedNonce(), failedNonce);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  assert.equal(f.controller().currentUrl.current, trainingSummarySource);
  await f.loadPage(trainingSummarySource); await summaryMessage(f, trainingSummaryPage);
  assert.ok(!f.writes.includes('information-saved'));
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1);
  assert.equal(canonical(f.controller().informationCaptures[0]!.rows), canonical(trainingSummaryPage.rows));
  assert.equal(f.loginStorage().reads, 0);
});

async function failedProfileFixture() {
  const f = await trainingSummaryFixture(false);
  const web = f.find(f.render(), e => e.type === 'WebView')!;
  (web.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await f.flush();
  const failed = f.find(f.render(), e => e.type === 'WebView')!;
  (failed.props.onError as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await f.flush();
  assert.equal(f.controller().loaded, false); assert.equal(f.controller().informationRetryReady, true);
  return f;
}

test('exact failed-profile retry uses one native reload and ignores old same-URL load-end until a fresh native start', async () => {
  const f = await failedProfileFixture(), failedNonce = f.lastIssuedNonce(), injectionCount = f.injections.length;
  f.controller().retryInformation(); await f.flush();
  assert.equal(f.nativeReloads(), 1); assert.equal(f.injections.length, injectionCount, 'Do not evaluate location.assign in the failed profile document');
  assert.notEqual(f.lastIssuedNonce(), failedNonce);
  const web = f.find(f.render(), e => e.type === 'WebView')!;
  (web.props.onLoadEnd as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await f.flush();
  assert.equal(f.injections.length, injectionCount, 'Stale load-end cannot inject a fresh context nonce into the old error DOM');
  await f.loadPage(context.PROFILE_URL);
  await f.contextMessage(observedContext, context.PROFILE_URL, failedNonce + '-before');
  assert.equal(f.controller().currentUrl.current, context.PROFILE_URL, 'Old nonce cannot advance the native-reloaded request');
  await f.contextMessage(observedContext); assert.equal(f.controller().currentUrl.current, trainingSummarySource);
  await f.loadPage(trainingSummarySource); await summaryMessage(f, trainingSummaryPage);
  assert.ok(!f.writes.includes('information-saved'));
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1); assert.equal(f.nativeReloads(), 1);
});

test('failed-profile reload evidence survives Android trailing profile/error-document callbacks but never reloads an error document', async () => {
  for (const intermediate of [null, 'about:blank', 'chrome-error://chromewebdata/']) {
    const blank = intermediate !== null;
    const f = await failedProfileFixture();
    let web = f.find(f.render(), e => e.type === 'WebView')!;
    if (blank) {
      (web.props.onNavigationStateChange as (state: unknown) => void)({ url: intermediate, canGoBack: true }); await f.flush();
      const before = f.injections.length; f.controller().retryInformation(); await f.flush();
      assert.equal(f.nativeReloads(), 0, 'An internal error document is never an authorized reload target');
      // The guarded navigation attempt above consumes the retry target. Use a
      // separate failed attempt to exercise the trailing blank/profile sequence.
      assert.ok(f.injections.length > before);
      f.controller().stopInformation();
    }
    const current = blank ? await failedProfileFixture() : f;
    web = current.find(current.render(), e => e.type === 'WebView')!;
    if (blank) {
      (web.props.onNavigationStateChange as (state: unknown) => void)({ url: intermediate, canGoBack: true }); await current.flush();
      web = current.find(current.render(), e => e.type === 'WebView')!;
      (web.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: intermediate } }); await current.flush();
      web = current.find(current.render(), e => e.type === 'WebView')!;
    }
    (web.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await current.flush();
    web = current.find(current.render(), e => e.type === 'WebView')!;
    (web.props.onNavigationStateChange as (state: unknown) => void)({ url: context.PROFILE_URL, canGoBack: true });
    (web.props.onLoadEnd as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await current.flush();
    current.controller().retryInformation(); await current.flush();
    assert.equal(current.nativeReloads(), 1, 'Same failed-profile callback train must retain native recovery');
    await current.loadPage(context.PROFILE_URL); await current.contextMessage(observedContext);
    await current.loadPage(trainingSummarySource); await summaryMessage(current, trainingSummaryPage);
    await current.loadPage(context.PROFILE_URL); await current.contextMessage(observedContext); await current.flush();
    assert.equal(current.writes.filter(w => w === 'information-saved').length, 1);
  }
});

test('unproven error URLs, source failures and intervening navigation cannot select native profile reload', async () => {
  for (const boundary of ['unknown', 'foreign', 'source', 'intervening', 'intervening-native'] as const) {
    const f = boundary === 'intervening' || boundary === 'intervening-native' ? await failedProfileFixture() : await trainingSummaryFixture(boundary === 'source');
    if (boundary === 'intervening') { f.controller().navigate(context.PROFILE_URL); await f.flush(); }
    else if (boundary === 'intervening-native') {
      let web = f.find(f.render(), e => e.type === 'WebView')!;
      (web.props.onShouldStartLoadWithRequest as (request: unknown) => boolean)({ url: trainingSummarySource, isTopFrame: true });
      (web.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: trainingSummarySource } }); await f.flush();
      web = f.find(f.render(), e => e.type === 'WebView')!;
      (web.props.onLoadStart as (event: unknown) => void)({ nativeEvent: { url: context.PROFILE_URL } }); await f.flush();
    }
    else {
      const web = f.find(f.render(), e => e.type === 'WebView')!;
      const error = boundary === 'unknown' ? undefined : { nativeEvent: { url: boundary === 'foreign' ? 'https://evil.test/' : trainingSummarySource } };
      (web.props.onError as (event: unknown) => void)(error); await f.flush();
    }
    const before = f.injections.length; f.controller().retryInformation(); await f.flush();
    assert.equal(f.nativeReloads(), 0, boundary);
    assert.ok(f.injections.slice(before).some(script => script.includes('window.location.assign')), boundary);
    assert.ok(!f.writes.includes('information-saved'));
  }
});

test('native profile reload cannot accept a wrong destination or changed account and remains cancelled across lifecycle boundaries', async () => {
  for (const boundary of ['destination', 'account', 'club', 'background', 'owner', 'cancel'] as const) {
    const f = await failedProfileFixture(); f.controller().retryInformation(); await f.flush(); assert.equal(f.nativeReloads(), 1);
    if (boundary === 'destination') { f.controller().currentUrl.current = trainingSummarySource; await f.loadPage(trainingSummarySource); }
    else if (boundary === 'background') { f.appState('background'); f.appState('active'); }
    else if (boundary === 'owner') f.changeOwner('foreign-owner');
    else if (boundary === 'cancel') f.controller().stopInformation();
    else {
      await f.loadPage(context.PROFILE_URL);
      await f.contextMessage({ ...observedContext, ...(boundary === 'account' ? { accountNumber: '999' } : { clubLabel: 'Another club' }) });
    }
    await f.flush(); assert.equal(f.controller().informationBusy, false, boundary); assert.ok(!f.writes.includes('information-saved'), boundary);
  }
});

test('native event capture probes the still-selected page first and saves only when its date/view survives context navigation', async () => {
  const selected = 'https://vereinsflieger.de/member/community/appointment/?weekCount=synthetic-period';
  for (const changed of [false, true]) {
    const f = fixture({ product: true }); f.render(); await f.settle(null); await establishProductAssociation(f);
    for (let i = 0; i < 16 && f.controller().informationCategory !== 'events'; i++) f.controller().nextInformationCategory();
    assert.equal(f.controller().informationCategory, 'events');
    f.controller().setVisible(true); f.controller().navigate(selected); await f.loadPage(selected);
    f.controller().startInformation(); await f.flush();
    assert.match(f.injections.at(-1)!, /vf-information-selection-v1/);
    assert.ok(!f.writes.includes('information-saved'));
    async function send(kind: string, stage: string, payload: Record<string, unknown>) {
      const web = f.find(f.render(), e => e.type === 'WebView')!;
      (web.props.onMessage as (event: unknown) => void)({ nativeEvent: { url: selected, data: JSON.stringify({ kind, nonce: f.lastIssuedNonce() + '-' + stage, url: selected, ...payload }) } });
      await f.flush();
    }
    await send('vf-information-selection-v1', 'selection', { selection: { date: '19.07.2026', view: '3 Monate' } });
    await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
    await f.loadPage(selected);
    await send('vf-information-v1', 'read', { page: {
      category: 'events', path: '/member/community/appointment/', columns: [{ key: 'date', label: 'Datum', index: 2 }, { key: 'time', label: 'Zeit', index: 3 }, { key: 'kind', label: 'Kategorie', index: 4 }, { key: 'info', label: 'Info · Titel/Ort', index: 5 }],
      rows: [{ position: 3, values: ['26.07.2026', 'Ganztägig', 'Termine', 'Synthetic event'] }], filters: ['Quellkategorie: Termine', 'Ab ' + (changed ? '20.07.2026' : '19.07.2026'), 'Ansicht: 3 Monate'], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' },
    } });
    if (changed) assert.match(f.controller().informationNotice, /Kalenderansicht.*geändert/);
    else { await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush(); }
    assert.equal(f.writes.filter(w => w === 'information-saved').length, changed ? 0 : 1);
    assert.ok(!f.writes.includes('capture-saved')); assert.equal(f.loginStorage().reads, 0);
  }
});

const informationHistoryScope: ProviderScope = { version: 1, owner: 'synthetic-pilot', connectionId: 'synthetic-history', context: observedContext };
function historyValue(position = 0): information.InformationHistory {
  return { category: 'work-hours', index: position, total: 2, capture: information.validateInformationCapture({ ...informationPage, version: 1, id: 'synthetic-history-' + position, retrievedAt: '2026-10-19T12:00:00.000Z', owner: informationHistoryScope.owner, connectionId: informationHistoryScope.connectionId, sourceIdentity: 'provisional-observed-profile' }) };
}
test('local information history needs no provider session and a failed read preserves its prior snapshot', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
  f.setInformationHistoryReader(async (_scope, _category, position, gate) => { gate(); return historyValue(position); });
  await f.controller().loadInformationHistory('work-hours', 1); await f.flush();
  assert.equal(f.controller().informationHistory!.index, 1); assert.equal(f.controller().browserActive, false);
  f.setInformationHistoryReader(async () => { throw new Error('Synthetic disk read failure'); });
  await f.controller().loadInformationHistory('work-hours', 0); await f.flush();
  assert.equal(f.controller().informationHistory!.index, 1); assert.match(f.controller().informationHistoryNotice, /bleiben erhalten/);
  assert.equal(f.controller().informationHistoryBusy, false); assert.equal(f.injections.length, 0); assert.equal(f.loginStorage().reads, 0);
  assert.ok(!f.writes.includes('information-saved'));
});

test('late local history cannot publish after owner change or backgrounding', async () => {
  for (const boundary of ['owner', 'background', 'background-resume']) {
    const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
    let finish!: (value: information.InformationHistory) => void;
    const delayed = new Promise<information.InformationHistory>(resolve => { finish = resolve; });
    f.setInformationHistoryReader(async (_scope, _category, _position, gate) => { gate(); return delayed; });
    const pending = f.controller().loadInformationHistory('work-hours', 0); assert.equal(f.controller().informationHistoryBusy, true);
    if (boundary === 'owner') f.changeOwner('another-owner'); else f.appState('background');
    if (boundary === 'background-resume') f.appState('active');
    await f.flush(); finish(historyValue()); await pending; await f.flush();
    assert.equal(f.controller().informationHistory, null); assert.equal(f.controller().informationHistoryBusy, false);
    assert.ok(!f.writes.includes('information-saved')); assert.equal(f.loginStorage().reads, 0);
  }
});

test('newer local history requests supersede delayed results without overwriting their chosen snapshot or notice', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
  let finish!: (value: information.InformationHistory) => void;
  const delayed = new Promise<information.InformationHistory>(resolve => { finish = resolve; });
  f.setInformationHistoryReader(async (_scope, _category, position, gate) => { gate(); return position ? delayed : historyValue(); });
  const old = f.controller().loadInformationHistory('work-hours', 1);
  await f.controller().loadInformationHistory('work-hours', 0); finish(historyValue(1)); await old; await f.flush();
  assert.equal(f.controller().informationHistory!.index, 0); assert.equal(f.controller().informationHistoryNotice, '');
  assert.equal(f.controller().informationHistoryBusy, false);
});


test('failed startup information read can be explicitly retried offline without provider work or new captures', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope });
  f.setInformationReader(async () => { throw new Error('Synthetic disk failure'); });
  f.render(); await f.settle(null); await f.flush(); await f.flush();
  assert.match(f.controller().informationNotice, /konnten nicht geöffnet/);
  assert.equal(f.controller().informationCanReload, true);
  f.setInformationReader(async (_scope, gate) => { gate(); return [historyValue().capture!]; });
  await f.controller().reloadInformation(); await f.flush();
  assert.deepEqual(f.controller().informationCaptures, [historyValue().capture!]);
  assert.equal(f.controller().informationLoading, false); assert.match(f.controller().informationNotice, /lokal neu geladen/);
  assert.equal(f.controller().browserActive, false); assert.equal(f.injections.length, 0); assert.equal(f.loginStorage().reads, 0);
  assert.ok(!f.writes.includes('information-saved'));
});

test('failed, unexpectedly empty or foreign local reload keeps the prior captures and selected history', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
  f.setInformationReader(async (_scope, gate) => { gate(); return [historyValue().capture!]; });
  await f.controller().reloadInformation();
  f.setInformationHistoryReader(async () => historyValue(1)); await f.controller().loadInformationHistory('work-hours', 1);
  for (const reader of [
    async () => { throw new Error('Synthetic read failure'); },
    async () => [],
    async () => [{ ...historyValue().capture!, owner: 'foreign-owner' }],
    async () => [{ ...historyValue().capture!, connectionId: 'foreign-connection' }],
  ]) {
    f.setInformationReader(reader); await f.controller().reloadInformation(); await f.flush();
    assert.deepEqual(f.controller().informationCaptures, [historyValue().capture!]);
    assert.equal(f.controller().informationHistory!.index, 1);
    assert.match(f.controller().informationNotice, /bleiben erhalten/); assert.equal(f.controller().informationLoading, false);
  }
  f.setInformationReader(async () => [historyValue().capture!]); await f.controller().reloadInformation();
  assert.equal(f.controller().informationHistory, null); assert.equal(f.injections.length, 0);
});

test('a newer local reload supersedes an older startup read and keeps valid initial empty distinct', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope });
  let finish!: (value: information.InformationCapture[]) => void;
  const delayed = new Promise<information.InformationCapture[]>(resolve => { finish = resolve; });
  f.setInformationReader(async () => delayed); f.render(); await f.settle(null); await f.flush();
  assert.equal(f.informationReads(), 1);
  f.setInformationReader(async () => [historyValue().capture!]); await f.controller().reloadInformation();
  finish([]); await f.flush(); await f.flush();
  assert.deepEqual(f.controller().informationCaptures, [historyValue().capture!]);
  assert.match(f.controller().informationNotice, /lokal neu geladen/); assert.equal(f.controller().informationLoading, false);
  const empty = fixture({ product: true, persistedScope: informationHistoryScope }); empty.render(); await empty.settle(null); await empty.flush();
  await empty.controller().reloadInformation(); assert.deepEqual(empty.controller().informationCaptures, []);
  assert.match(empty.controller().informationNotice, /lokal neu geladen/);
});

test('late or revoked information reload results cannot publish after supersession, background or owner switch', async () => {
  for (const boundary of ['newer-read', 'background', 'owner', 'revoked', 'unmount'] as const) {
    const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
    let finish!: (value: information.InformationCapture[]) => void;
    const delayed = new Promise<information.InformationCapture[]>(resolve => { finish = resolve; });
    f.setInformationReader(async (_scope, gate) => { gate(); const result = await delayed; if (boundary === 'revoked') throw new Error('Synthetic revoked authority'); gate(); return result; });
    const pending = f.controller().reloadInformation();
    if (boundary === 'newer-read') { f.setInformationReader(async () => [historyValue(1).capture!]); await f.controller().reloadInformation(); }
    if (boundary === 'background') { f.appState('background'); f.appState('active'); }
    if (boundary === 'owner') f.changeOwner('foreign-owner');
    if (boundary === 'unmount') f.unmount();
    finish([historyValue().capture!]); await pending; await f.flush();
    assert.deepEqual(Array.from(f.controller().informationCaptures), boundary === 'newer-read' ? [historyValue(1).capture!] : []);
    if (boundary !== 'unmount') assert.equal(f.controller().informationLoading, false);
    assert.equal(f.injections.length, 0);
  }
});

test('new information capture invalidates pending local reload publication and reload cannot run during capture', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
  for (let i = 0; i < 8 && !f.controller().viewReady; i++) await f.flush();
  assert.equal(f.controller().viewReady, true);
  let finish!: (value: information.InformationCapture[]) => void;
  const delayed = new Promise<information.InformationCapture[]>(resolve => { finish = resolve; });
  f.setInformationReader(async () => delayed); const pending = f.controller().reloadInformation();
  f.controller().setVisible(true); f.controller().navigate(informationSource); await f.loadPage(informationSource); f.controller().startInformation(); await f.flush();
  assert.equal(f.controller().informationBusy, true, 'Capture must be active before testing reload exclusion');
  const reads = f.informationReads(); await f.controller().reloadInformation(); assert.equal(f.informationReads(), reads);
  f.setInformationReader(async (_scope, gate) => { gate(); return [f.savedInformation() ?? historyValue(1).capture!]; });
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadPage(informationSource); await informationMessage(f);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush(); await f.flush();
  finish([historyValue().capture!]); await pending; await f.flush();
  assert.deepEqual(Array.from(f.controller().informationCaptures), [f.savedInformation()]);
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1); assert.equal(f.controller().informationLoading, false);
});


test('explicit local reload recovers a committed capture after failed readback without saving another capture', async () => {
  const f = await startInformationFixture();
  f.setInformationReader(async () => { throw new Error('Synthetic post-commit readback failure'); });
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext);
  await f.loadPage(informationSource); await informationMessage(f);
  await f.loadPage(context.PROFILE_URL); await f.contextMessage(observedContext); await f.flush(); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1);
  assert.match(f.controller().informationNotice, /nicht bestätigt/); assert.equal(f.controller().informationBusy, false);
  assert.equal(f.controller().informationNeedsReload, true); assert.equal(f.controller().informationRetryReady, false);
  const beforeRetry = f.injections.length;
  f.controller().startInformation(); f.controller().retryInformation(); await f.flush();
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1); assert.equal(f.injections.length, beforeRetry);
  const saved = f.savedInformation(); assert.ok(saved);
  f.setInformationReader(async () => []); await f.controller().reloadInformation();
  assert.equal(f.controller().informationNeedsReload, true, 'Known committed ID missing from latest read must not unlock a duplicate capture');
  f.setInformationReader(async () => [saved]);
  f.setInformationCaptureReader(async () => { throw new Error('Synthetic ID recovery failure'); }); await f.controller().reloadInformation();
  assert.equal(f.controller().informationNeedsReload, true);
  f.setInformationCaptureReader(async () => ({ ...saved, id: 'another-id' })); await f.controller().reloadInformation();
  assert.equal(f.controller().informationNeedsReload, true);
  f.setInformationCaptureReader(async () => saved);
  const injections = f.injections.length;
  f.setInformationReader(async (_scope, gate) => { gate(); return [saved]; }); await f.controller().reloadInformation();
  assert.deepEqual(f.controller().informationCaptures, [saved]);
  assert.equal(f.writes.filter(w => w === 'information-saved').length, 1); assert.equal(f.injections.length, injections);
  assert.match(f.controller().informationNotice, /lokal neu geladen/);
  assert.equal(f.controller().informationNeedsReload, false);
});


test('a history choice made after local reload starts is preserved when the reload completes', async () => {
  const f = fixture({ product: true, persistedScope: informationHistoryScope }); f.render(); await f.settle(null); await f.flush();
  let finish!: (value: information.InformationCapture[]) => void;
  const delayed = new Promise<information.InformationCapture[]>(resolve => { finish = resolve; });
  f.setInformationReader(async () => delayed); const pending = f.controller().reloadInformation();
  f.setInformationHistoryReader(async () => historyValue(1)); await f.controller().loadInformationHistory('work-hours', 1);
  finish([historyValue().capture!]); await pending; await f.flush();
  assert.equal(f.controller().informationHistory!.index, 1); assert.deepEqual(f.controller().informationHistory!.capture, historyValue(1).capture);
  assert.deepEqual(f.controller().informationCaptures, [historyValue().capture!]);
});

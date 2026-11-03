import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import * as context from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import * as information from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { createTaskSelectionRecovery, validateTaskSelectionRecovery, type TaskSelectionRecovery } from '../../apps/platform-lab/src/vereinsflieger/task-selection-recovery.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/use-information-controller.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
}).outputText;

const scope: ProviderScope = {
  version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection',
  context: { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' },
};
const taskUrl = information.OWN_OPEN_TASKS_URL;
const options = [
  { label: 'Alle nicht beendeten Aufgaben', href: '?gselect=allopen' },
  { label: 'Meine nicht beendeten Aufgaben', href: '?gselect=myopen' },
  { label: 'Alle Aufgaben', href: '?gselect=all' },
];
const selection = (label = 'Alle nicht beendeten Aufgaben') => ({ selected: label, options });
const taskPage: information.InformationPage = {
  category: 'tasks', path: '/member/community/tasklist/tasklist',
  columns: [{ key: 'title', label: 'Titel', index: 0 }, { key: 'due', label: 'Zu erledigen bis', index: 1 }, { key: 'status', label: 'Status', index: 2 }],
  rows: [{ position: 2, values: ['Synthetic task', '31.10.2026', 'Offen'] }],
  filters: ['Meine nicht beendeten Aufgaben'], empty: false,
  coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' },
};

class Journal {
  readonly records = new Map<string, unknown>();
  readonly trace: string[] = [];
  failClear = false;
  failSave = false;
  deferSave = false;
  readonly saveStarted: Promise<void>;
  private signalSaveStarted!: () => void;
  private releaseSave!: () => void;
  private saveGate = new Promise<void>(resolve => { this.releaseSave = resolve; });
  constructor() { this.saveStarted = new Promise<void>(resolve => { this.signalSaveStarted = resolve; }); }
  finishSave() { this.releaseSave(); }
  private key(scopeValue: ProviderScope) { return canonical(scopeValue); }
  async load(scopeValue: ProviderScope, gate: () => void) {
    gate(); this.trace.push('journal-read');
    const value = this.records.get(this.key(scopeValue));
    if (value === undefined) return null;
    const checked = validateTaskSelectionRecovery(value, scopeValue);
    gate(); return checked;
  }
  async save(scopeValue: ProviderScope, input: TaskSelectionRecovery, gate: () => void) {
    gate(); this.trace.push('journal-save');
    if (this.deferSave) { this.signalSaveStarted(); await this.saveGate; }
    gate(); if (this.failSave) throw new Error('Synthetic uncertain save');
    const checked = validateTaskSelectionRecovery(input, scopeValue), key = this.key(scopeValue), old = this.records.get(key);
    if (old !== undefined && canonical(validateTaskSelectionRecovery(old, scopeValue)) !== canonical(checked)) throw new Error('A different task selector recovery is still pending.');
    this.records.set(key, checked); gate(); return checked;
  }
  async clear(scopeValue: ProviderScope, expected: TaskSelectionRecovery, gate: () => void) {
    gate(); this.trace.push('journal-clear');
    const key = this.key(scopeValue), checked = validateTaskSelectionRecovery(expected, scopeValue), old = this.records.get(key);
    if (!old || canonical(validateTaskSelectionRecovery(old, scopeValue)) !== canonical(checked)) throw new Error('Task selector recovery changed before acknowledgement.');
    if (this.failClear) throw new Error('Synthetic uncertain clear');
    this.records.delete(key); gate();
  }
  pending(scopeValue: ProviderScope) { return this.records.get(this.key(scopeValue)) ?? null; }
  setRaw(scopeValue: ProviderScope, value: unknown) { this.records.set(this.key(scopeValue), value); }
}

function host(journal: Journal, startScope = scope) {
  const hooks: unknown[] = [], effects: (() => void)[] = [], timers = new Map<number, () => void>();
  let index = 0, timerId = 0, epoch = 1, url = context.PROFILE_URL, selectedScope = startScope, nonce = 0;
  const scripts: string[] = [], trace = journal.trace, providerEvents: string[] = [], saved: information.InformationCapture[] = [];
  const react = {
    useRef<T>(initial: T) { const i = index++; if (!(i in hooks)) hooks[i] = { current: initial }; return hooks[i] as { current: T }; },
    useState<T>(initial: T | (() => T)): [T, (next: T | ((old: T) => T)) => void] {
      const i = index++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? (initial as () => T)() : initial;
      return [hooks[i] as T, next => { hooks[i] = typeof next === 'function' ? (next as (old: T) => T)(hooks[i] as T) : next; }];
    },
    useEffect(callback: () => void | (() => void), dependencies?: unknown[]) {
      const i = index++, previous = hooks[i] as { dependencies?: unknown[]; cleanup?: () => void } | undefined;
      if (!previous || !dependencies || !previous.dependencies || dependencies.some((value, n) => !Object.is(value, previous.dependencies![n]))) {
        const state: { dependencies?: unknown[]; cleanup?: () => void } = { dependencies }; hooks[i] = state;
        effects.push(() => { previous?.cleanup?.(); const cleanup = callback(); if (cleanup) state.cleanup = cleanup; });
      }
    },
  };
  const modules: Record<string, unknown> = {
    react,
    '@moflight/flight-logbook': { canonical },
    './activity-probe': { decodeActivityProbe: () => ({ sources: [] }) },
    './context': context,
    './scope-store': { validateScope: (value: unknown) => value },
    './provider-diagnostics': { recordProviderEvent: (event: string) => providerEvents.push(event) },
    './information': information,
    './information-run': { InformationRun },
    './information-native': {
      loadInformation: async (_scope: ProviderScope, gate: () => void) => { gate(); return [...saved]; },
      readInformationCapture: async () => null,
      readInformationHistory: async (_scope: ProviderScope, category: information.InformationCategory, index: number) => ({ category, index, total: 0, capture: null }),
      saveAndLoadInformation: async (_scope: ProviderScope, capture: information.InformationCapture, gate: () => void) => { gate(); trace.push('capture-save'); saved.push(capture); gate(); return [...saved]; },
    },
    './task-selection-recovery-native': {
      loadTaskSelectionRecovery: (s: ProviderScope, gate: () => void) => journal.load(s, gate),
      saveTaskSelectionRecovery: (s: ProviderScope, value: TaskSelectionRecovery, gate: () => void) => journal.save(s, value, gate),
      clearTaskSelectionRecovery: (s: ProviderScope, value: TaskSelectionRecovery, gate: () => void) => journal.clear(s, value, gate),
    },
  };
  const exports = {} as { useInformationController: (ports: unknown) => any };
  runInNewContext(source, {
    exports,
    require: (name: string) => { assert.ok(name in modules, `Unexpected controller dependency: ${name}`); return modules[name]; },
    setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearTimeout: (id: number) => timers.delete(id),
    URL, console,
  });
  const ports = {
    product: true, mounted: () => true, foreground: () => true, ownerCurrent: () => true, scope: () => selectedScope,
    canStart: () => true, canStartMedical: () => true, canReload: () => true, currentUrl: () => url, epoch: () => epoch,
    uuid: () => `synthetic-task-${++nonce}`, setBusy: (_value: boolean) => {}, setVisible: (_value: boolean) => {},
    navigate: (value: string) => { url = value; trace.push('navigate:' + value); },
    loadPage: async (value: string) => { url = value; trace.push('load:' + value); },
    inject: (script: string) => scripts.push(script), requestNativeReload: (_value: string) => {},
  };
  let controller: any;
  function render() { index = 0; controller = exports.useInformationController(ports); effects.splice(0).forEach(effect => effect()); return controller; }
  async function flush() { for (let i = 0; i < 5; i++) await new Promise<void>(resolve => { setImmediate(resolve); }); }
  function nonceFromScript() {
    const match = /nonce:("(?:[^"\\]|\\.)*")/.exec(scripts.at(-1) ?? ''); assert.ok(match, 'Expected an injected nonce'); return JSON.parse(match[1]!) as string;
  }
  async function send(kind: string, value: Record<string, unknown>) {
    const c = render(), target = url;
    c.loadStarted(target); assert.equal(c.pageLoaded(target), true, `Expected stage navigation at ${target}`);
    const packet = { kind, nonce: nonceFromScript(), url: target, ...value };
    await c.receiveInformation({ nativeEvent: { url: target, data: JSON.stringify(packet) } }); await flush();
  }
  async function select(label?: string) { await send('vf-information-task-selection-v1', { selection: selection(label) }); }
  async function profile(observed: unknown = scope.context) { trace.push('profile-proof'); await send('vf-context-v1', { context: observed }); }
  async function restore(label?: string) { await send('vf-information-task-restore-v1', { selection: selection(label) }); }
  async function readTask() { await send('vf-information-v1', { page: taskPage }); }
  function cleanup() { for (const hook of hooks) if (hook && typeof hook === 'object' && 'cleanup' in hook && typeof (hook as any).cleanup === 'function') (hook as any).cleanup(); }
  return {
    controller: () => render(), url: () => url, scripts, trace, providerEvents, saved,
    start: () => { const pending = render().public.retrieveFeatureInformation('tasks'); void pending.catch(() => {}); return pending; },
    select, profile, restore, readTask, flush, cleanup, setScope: (value: ProviderScope) => { selectedScope = value; },
    sendLateRead: async () => {
      const c = render();
      await c.receiveInformation({ nativeEvent: { url: taskUrl, data: JSON.stringify({ kind: 'vf-information-v1', nonce: 'stale-task-nonce', url: taskUrl, page: taskPage }) } });
      await flush();
    },
    fireTimeout: () => Array.from(timers.values()).at(-1)?.(),
    captureTimeout: () => Array.from(timers.values()).at(-1),
    pageLoadedCurrent: () => render().pageLoaded(url),
    changeDocument: (value: string) => { url = value; epoch++; },
  };
}

test('task selector is journaled only after a fresh matching profile and resumes explicitly after process recreation', async () => {
  const journal = new Journal(), first = host(journal);
  const interrupted = first.start();
  await first.flush(); assert.equal(first.url(), information.TASK_SELECTION_PROBE_URL);
  await first.select();
  assert.equal(journal.pending(scope), null, 'selector observation alone cannot be saved under an unverified provider account');
  assert.equal(first.url(), context.PROFILE_URL);
  await first.profile();
  assert.ok(journal.pending(scope));
  assert.ok(first.trace.indexOf('journal-save') < first.trace.indexOf('navigate:' + taskUrl));
  assert.equal(first.url(), taskUrl);
  first.cleanup(); await assert.rejects(interrupted);

  const foreign = host(journal), refused = foreign.start(); await foreign.flush();
  await foreign.profile({ ...scope.context, accountNumber: '99999' }); await assert.rejects(refused);
  assert.equal(foreign.url(), context.PROFILE_URL, 'a mismatched fresh profile cannot navigate to the pending restore URL');
  assert.ok(journal.pending(scope)); assert.equal(foreign.trace.some(value => value.includes('gselect=allopen')), false);
  foreign.cleanup();

  const second = host(journal), resumed = second.start();
  await second.flush();
  assert.equal(second.url(), context.PROFILE_URL, 'pending recovery starts only after an explicit task request');
  await second.profile();
  assert.equal(second.url(), 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen');
  await second.restore();
  assert.equal(journal.pending(scope), null, 'the old checkpoint clears only after exact selector readback');
  assert.equal(second.url(), context.PROFILE_URL);
  const oldClear = second.trace.indexOf('journal-clear');
  await second.profile();
  const newCheckpoint = second.trace.lastIndexOf('journal-save');
  assert.ok(oldClear < newCheckpoint, 'a recovered view is re-checkpointed only after another fresh profile proof');
  assert.ok(newCheckpoint < second.trace.lastIndexOf('navigate:' + taskUrl));
  assert.equal(second.url(), taskUrl);
  await second.readTask(); assert.equal(second.url(), context.PROFILE_URL);
  await second.profile(); assert.equal(second.url(), 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen');
  await second.restore();
  const capture = await resumed;
  assert.equal(capture.category, 'tasks');
  assert.equal(second.saved.length, 1);
  assert.equal(journal.pending(scope), null);
  second.cleanup();
});

test('a selector read from a different provider account is never checkpointed or used for own/open navigation', async () => {
  const journal = new Journal(), f = host(journal), rejected = f.start();
  await f.flush(); await f.select('Alle Aufgaben');
  assert.equal(f.url(), context.PROFILE_URL);
  await f.profile({ ...scope.context, accountNumber: '99999' });
  await assert.rejects(rejected);
  assert.equal(journal.pending(scope), null);
  assert.equal(f.trace.some(value => value === 'navigate:' + taskUrl), false);
  assert.ok(f.providerEvents.includes('provider-task-context-before-failed'));
  f.cleanup();
});

test('cancel restores through a fresh profile and exact selector readback; late source packets cannot save', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  let settled = false; void pending.then(() => { settled = true; }, () => { settled = true; });
  await f.flush(); await f.select(); await f.profile();
  assert.ok(journal.pending(scope));
  f.controller().public.stopInformation('Synthetic cancellation');
  assert.equal(f.url(), context.PROFILE_URL);
  await f.flush(); assert.equal(settled, false, 'the combined feature promise remains pending while selector cleanup is in progress');
  await f.sendLateRead(); assert.equal(f.saved.length, 0); assert.ok(journal.pending(scope));
  await f.profile(); assert.equal(f.url(), 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen');
  await f.flush(); assert.equal(settled, false, 'fresh profile proof alone does not settle the request before selector acknowledgement');
  await f.restore();
  await assert.rejects(pending);
  assert.equal(settled, true, 'the request rejects after exact restore acknowledgement and durable clear');
  assert.equal(journal.pending(scope), null); assert.equal(f.saved.length, 0);
  f.cleanup();
});

test('the original deadline ends a pending task run without starting selector recovery navigation', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select(); await f.profile();
  const before = f.trace.length;
  assert.ok(journal.pending(scope)); assert.equal(f.url(), taskUrl);
  f.fireTimeout(); await f.flush(); await assert.rejects(pending);
  assert.equal(f.trace.length, before, 'deadline expiry performs no new provider navigation or journal operation');
  assert.equal(f.url(), taskUrl); assert.ok(journal.pending(scope)); assert.equal(f.saved.length, 0);
  f.cleanup();
});

test('the original deadline ends restore-only cleanup and retains the pending selector checkpoint', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select(); await f.profile();
  f.controller().public.stopInformation('Synthetic cancellation');
  assert.equal(f.url(), context.PROFILE_URL, 'explicit cancellation begins bounded restore-only cleanup');
  const before = f.trace.length;
  f.fireTimeout(); await f.flush(); await assert.rejects(pending);
  assert.equal(f.trace.length, before, 'deadline expiry does not begin another navigation or journal write');
  assert.equal(f.url(), context.PROFILE_URL); assert.ok(journal.pending(scope)); assert.equal(f.saved.length, 0);
  f.cleanup();
});

test('a delayed timer from a completed task run cannot stop or diagnose its replacement', async () => {
  const journal = new Journal(), f = host(journal), first = f.start();
  await f.flush(); await f.select(); await f.profile();
  const staleTimeout = f.captureTimeout(); assert.ok(staleTimeout);
  await f.readTask(); await f.profile(); await f.restore();
  assert.equal((await first).category, 'tasks');

  const second = f.start(); await f.flush();
  assert.equal(f.url(), information.TASK_SELECTION_PROBE_URL);
  const eventsBefore = [...f.providerEvents];
  staleTimeout(); await f.flush();
  assert.equal(f.controller().public.informationBusy, true);
  assert.equal(f.url(), information.TASK_SELECTION_PROBE_URL);
  assert.deepEqual(f.providerEvents, eventsBefore, 'the stale callback cannot emit timeout diagnostics for the new run');
  f.controller().public.stopInformation('Synthetic cleanup before checkpoint'); await assert.rejects(second);
  f.cleanup();
});

test('foreign scope and malformed recovery state are preserved without blocking another scoped task selector', async () => {
  const journal = new Journal(), f = host(journal);
  const a = createTaskSelectionRecovery(scope, 'Alle nicht beendeten Aufgaben', 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen', 'attempt-a');
  journal.setRaw(scope, a);
  const scopeB: ProviderScope = { ...scope, owner: 'other-owner', connectionId: 'other-connection', context: { ...scope.context, accountNumber: '54321', clubLabel: 'Other synthetic club' } };
  const other = host(journal, scopeB), pending = other.start();
  await other.flush(); assert.equal(other.url(), information.TASK_SELECTION_PROBE_URL);
  await other.select('Alle Aufgaben'); await other.profile(scopeB.context);
  assert.ok(journal.pending(scope), 'scope B cannot replace scope A recovery');
  assert.ok(journal.pending(scopeB)); await other.controller().public.stopInformation();
  await other.profile(scopeB.context); await other.restore('Alle Aufgaben'); await assert.rejects(pending);
  other.cleanup();

  const clearsBeforeMalformed = journal.trace.filter(value => value.startsWith('journal-clear')).length;
  const malformed = host(journal); journal.setRaw(scope, { ...a, selector: 'private-selector', restoreUrl: 'https://private.invalid/' });
  const blocked = malformed.start(); await malformed.flush(); await assert.rejects(blocked);
  assert.equal(malformed.url(), context.PROFILE_URL, 'malformed recovery causes no provider navigation');
  assert.deepEqual(journal.pending(scope), { ...a, selector: 'private-selector', restoreUrl: 'https://private.invalid/' });
  assert.equal(journal.trace.filter(value => value.startsWith('journal-clear')).length, clearsBeforeMalformed);
  malformed.cleanup();
});

test('uncertain restoration clear keeps checkpoint and withholds capture', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select(); await f.profile();
  f.controller().public.stopInformation('Synthetic cancellation'); await f.profile();
  assert.match(f.url(), /gselect=allopen$/); journal.failClear = true;
  await f.restore(); await assert.rejects(pending);
  assert.ok(journal.pending(scope)); assert.equal(f.saved.length, 0);
  f.cleanup();
});

test('same-document load-end is consumed during checkpoint write and cancellation prevents source navigation', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select();
  journal.deferSave = true;
  const writing = f.profile(); await journal.saveStarted;
  assert.equal(f.url(), context.PROFILE_URL);
  assert.equal(f.pageLoadedCurrent(), true, 'the prior profile load-end belongs to the in-flight local checkpoint boundary');
  assert.equal(f.providerEvents.includes('provider-information-unexpected-document'), false);
  f.controller().public.stopInformation('Synthetic cancellation during checkpoint');
  journal.finishSave(); await writing;
  assert.equal(f.url(), context.PROFILE_URL, 'cancellation is honored before own/open source navigation');
  assert.ok(journal.pending(scope));
  assert.equal(f.trace.some(value => value === 'navigate:' + taskUrl), false);
  await f.profile(); assert.match(f.url(), /gselect=allopen$/);
  await f.restore(); await assert.rejects(pending);
  assert.equal(journal.pending(scope), null); assert.equal(f.saved.length, 0);
  f.cleanup();
});

test('a fresh same-url load-start during checkpoint write invalidates the earlier profile proof', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select();
  journal.deferSave = true;
  const writing = f.profile(); await journal.saveStarted;
  f.controller().loadStarted(context.PROFILE_URL);
  journal.finishSave(); await writing; await assert.rejects(pending);
  assert.equal(f.url(), context.PROFILE_URL);
  assert.equal(journal.pending(scope), null, 'the invalidated local checkpoint write is rolled back');
  assert.equal(f.trace.some(value => value === 'navigate:' + taskUrl), false, 'the earlier profile proof cannot dispatch source navigation');
  f.cleanup();
});

test('owner switch during deferred checkpoint cannot leak cancellation state into the next scoped request', async () => {
  const journal = new Journal(), f = host(journal), interrupted = f.start();
  await f.flush(); await f.select();
  journal.deferSave = true;
  const writing = f.profile(); await journal.saveStarted;
  f.controller().public.stopInformation('Synthetic deferred cancellation');
  const scopeB: ProviderScope = { ...scope, owner: 'other-owner', connectionId: 'other-connection', context: { ...scope.context, accountNumber: '54321', clubLabel: 'Other synthetic club' } };
  f.setScope(scopeB); f.controller().ownerChanged(); journal.finishSave();
  await writing; await assert.rejects(interrupted);
  assert.equal(journal.pending(scope), null);
  journal.deferSave = false;
  const retry = f.start(); await f.flush(); assert.equal(f.url(), information.TASK_SELECTION_PROBE_URL);
  await f.select('Alle Aufgaben'); await f.profile(scopeB.context);
  assert.ok(journal.pending(scopeB), 'the new owner can create its own checkpoint after fresh profile proof');
  assert.equal(f.url(), taskUrl, 'the old deferred cancellation did not abort the new owner request');
  f.controller().public.stopInformation('Synthetic second cancellation'); await f.profile(scopeB.context); await f.restore('Alle Aufgaben');
  await assert.rejects(retry); assert.equal(journal.pending(scopeB), null);
  f.cleanup();
});

test('failed deferred checkpoint after cancellation does not poison an explicit retry', async () => {
  const journal = new Journal(), f = host(journal), interrupted = f.start();
  await f.flush(); await f.select();
  journal.deferSave = true; journal.failSave = true;
  const writing = f.profile(); await journal.saveStarted;
  f.controller().public.stopInformation('Synthetic cancellation before failed checkpoint');
  journal.finishSave(); await writing; await assert.rejects(interrupted);
  assert.equal(journal.pending(scope), null); assert.equal(f.trace.some(value => value === 'navigate:' + taskUrl), false);
  journal.deferSave = false; journal.failSave = false;
  const retry = f.start(); await f.flush(); assert.equal(f.url(), information.TASK_SELECTION_PROBE_URL);
  await f.select(); await f.profile(); assert.ok(journal.pending(scope)); assert.equal(f.url(), taskUrl);
  f.controller().public.stopInformation('Synthetic cleanup'); await f.profile(); await f.restore();
  await assert.rejects(retry); assert.equal(journal.pending(scope), null);
  f.cleanup();
});

test('real document and epoch drift during checkpoint prevents own/open dispatch', async () => {
  const journal = new Journal(), f = host(journal), pending = f.start();
  await f.flush(); await f.select(); journal.deferSave = true;
  const writing = f.profile(); await journal.saveStarted;
  const unexpected = 'https://vereinsflieger.de/member/overview/overview';
  f.changeDocument(unexpected); assert.equal(f.controller().pageLoaded(unexpected), true);
  journal.finishSave(); await writing; await assert.rejects(pending);
  assert.equal(f.url(), unexpected);
  assert.equal(journal.pending(scope), null);
  assert.equal(f.trace.some(value => value === 'navigate:' + taskUrl), false);
  f.cleanup();
});

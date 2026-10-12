import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { Retrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval.ts';
import * as probe from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import * as view from '../../apps/platform-lab/src/vereinsflieger/view.ts';
import * as exporter from '../../apps/platform-lab/src/vereinsflieger/export.ts';
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
function fixture(options: { priorCapture?: probe.ProbeSnapshot; deferJournalSave?: boolean; deferCaptureSave?: boolean } = {}) {
  let resolveJournal!: (view: ViewPreferences | null) => void, rejectJournal!: (error: Error) => void;
  const journal = new Promise<ViewPreferences | null>((resolve, reject) => { resolveJournal = resolve; rejectJournal = reject; });
  const hooks: unknown[] = [], effects: (() => void)[] = [];
  let index = 0, nextId = 0, timerId = 0, pending: ViewPreferences | null = null;
  let savedCapture = options.priorCapture ?? null;
  const writes: string[] = [], injections: string[] = [], timers = new Map<number, () => void>();
  let finishJournalSave!: () => void, finishCaptureSave!: () => void;
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
    react: { default: react, ...react },
    'react-native': { StyleSheet: { create: (value: unknown) => value }, View: 'View', Text: 'Text', FlatList: 'FlatList' },
    'react-native-webview': { WebView: 'WebView' }, 'expo-crypto': { randomUUID: () => `fixture-${++nextId}` },
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
    './login-storage': { readSavedLogin: async () => null },
    './export': { ...exporter, calendarYearRequest: () => ({ from: '2026-01-01', to: '2026-12-31' }) },
    './retrieval': { Retrieval }, './CaptureRun': { CaptureRun }, './WindowCapture': { WindowCapture },
    './login': {}, './view': view, './context': {},
  };
  const exported = {} as { AccessProbe: (props: { close: () => void }) => Element };
  runInNewContext(source, { exports: exported, require: (name: string) => {
    assert.ok(name in modules, `Unexpected component dependency: ${name}`); return modules[name];
  }, setTimeout: (callback: () => void) => { const id = ++timerId; timers.set(id, callback); return id; },
  clearTimeout: (id: number) => timers.delete(id), URL });
  function render() { index = 0; const tree = exported.AccessProbe({ close() {} }); effects.splice(0).forEach(effect => effect()); return tree; }
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
  async function loadFlight() {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    const event = { nativeEvent: { url: FLIGHT_URL } };
    (web.props.onLoadStart as (event: unknown) => void)(event);
    render(); // Native start and end arrive in separate render cycles.
    (web.props.onLoadEnd as (event: unknown) => void)(event);
    return flush();
  }
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
  return { render, button, press, settle, find, flush, loadFlight, message, currentCommand, writes, injections,
    finishJournalSave, finishCaptureSave, pending: () => pending, savedCapture: () => savedCapture,
    isLab: (tree: Element) => tree.type === CaptureRun || tree.type === WindowCapture };
}

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
  const locked = f.button(f.render(), 'Cancel retrieval'); assert.equal(locked.props.disabled, true);
  f.press(locked); assert.equal(f.currentCommand().phase, 'snapshot');
  f.finishJournalSave(); await f.flush(); assert.equal(f.currentCommand().phase, 'backup');
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
});

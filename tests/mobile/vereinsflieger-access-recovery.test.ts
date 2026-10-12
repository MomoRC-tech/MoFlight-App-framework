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
  async function loadPage(url: string) {
    const web = find(render(), element => element.type === 'WebView'); assert.ok(web);
    const event = { nativeEvent: { url } };
    (web.props.onLoadStart as (event: unknown) => void)(event);
    render(); // Native start and end arrive in separate render cycles.
    (web.props.onLoadEnd as (event: unknown) => void)(event);
    return flush();
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
  return { render, button, press, settle, find, flush, loadPage, loadFlight, message, currentCommand, writes, injections,
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
    dispatchEvent() { actions.push('reset'); assert.equal(this.options[this.selectedIndex]?.value, '-1'); },
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
  await executeViewDriver(f, { ...defaultOriginal, period: 'ab 01.01.2026 bis 31.12.2026', role: 'Pilot oder Fluglehrer', reset: false }, actions);
  assert.deepEqual(actions, ['reset']); assert.deepEqual(f.pending(), defaultOriginal);
  await f.loadFlight(); await executeViewDriver(f, defaultOriginal, actions);
  assert.equal(f.currentCommand().phase, 'verify'); assert.ok(!f.writes.includes('journal-cleared'));
  await executeViewDriver(f, defaultOriginal, actions);
  assert.equal(f.pending(), null); assert.deepEqual(actions, ['reset']);
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

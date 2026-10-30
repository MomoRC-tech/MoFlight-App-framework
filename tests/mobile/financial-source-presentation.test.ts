import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function fixture() {
  type Element = { type: string; props: Record<string, any>; children: any[] };
  const slots: any[] = [], cleanups: (() => void)[] = [], calls: string[] = [];
  let cursor = 0, tree: Element, changed: (state: string) => void = () => {};
  let capture = async (): Promise<any> => ({ id: 'synthetic' });
  let read = async (): Promise<any> => ({ state: 'verified', receiptCount: 1, billedFlightCount: 1, latestBilledChecksum: 'abc' });
  const appState = { currentState: 'active', addEventListener(_name: string, listener: typeof changed) {
    changed = listener; return { remove() { calls.push('remove'); } };
  } };
  const react = {
    createElement: (type: any, props: any, ...children: any[]): Element => typeof type === 'function'
      ? type({ ...props, children: children.flat(Infinity) }) : { type, props: props ?? {}, children: children.flat(Infinity) },
    useState(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], (value: any) => { slots[i] = value; }]; },
    useRef(initial: any) { const i = cursor++; if (!(i in slots)) slots[i] = { current: initial }; return slots[i]; },
    useEffect(effect: () => (() => void) | void) { const i = cursor++; if (!(i in slots)) { slots[i] = true; const cleanup = effect(); if (cleanup) cleanups.push(cleanup); } },
  };
  const leaves = (names: string[]) => Object.fromEntries(names.map(name => [name, name]));
  const modules: Record<string, any> = {
    react: { default: react, ...react },
    'react-native': { ...leaves(['View', 'Text', 'Pressable', 'TextInput']), AppState: appState, StyleSheet: { create: (x: unknown) => x } },
    './theme': { ...leaves(['Action', 'Label']), colors: {}, ui: {} },
  };
  const load = (name: string) => {
    const exports: any = {};
    const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/' + name + '.tsx', import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
    }).outputText;
    runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  };
  modules['./settings-secondary-content'] = load('settings-secondary-content');
  const { FinancialSourceProof } = load('FinancialSourceProof');
  const props = { blocked: false, saveUncertain: false, state: { phase: 'idle', failure: null },
    openProvider() { calls.push('open-provider'); },
    async capture(list: string, detail: string) { calls.push(`capture:${list}:${detail}`); return capture(); },
    async retrySave() { calls.push('retry'); return capture(); },
    async read(expected?: any) { calls.push(expected ? 'read-exact' : 'read-local'); return read(); },
    cancel() { calls.push('cancel'); return true; }, onBusyChange(busy: boolean) { calls.push(`busy:${busy}`); } };
  const nodes = () => { const all: Element[] = []; const visit = (n: any) => { if (n?.children) { all.push(n); n.children.forEach(visit); } }; visit(tree); return all; };
  const text = (n: any): string => n?.children ? n.children.map(text).join(' ') : typeof n === 'string' ? n : '';
  const render = () => { cursor = 0; tree = FinancialSourceProof(props); };
  const button = (label: string) => nodes().find(n => ['Action', 'Pressable'].includes(n.type) && text(n).startsWith(label))!;
  const input = (label: string, value: string) => nodes().find(n => n.type === 'TextInput' && n.props.accessibilityLabel === label)!.props.onChangeText(value);
  const settle = async () => { await new Promise<void>(done => { setImmediate(done); }); render(); };
  const open = () => { button('Echten Finanzbeleg prüfen').props.onPress(); render(); };
  render();
  return { props, calls, render, open, button, input, settle, text: () => text(tree),
    capture: (next: typeof capture) => { capture = next; }, read: (next: typeof read) => { read = next; },
    background() { appState.currentState = 'background'; changed('background'); }, unmount() { cleanups.forEach(c => c()); } };
}

test('opening/disclosing performs no work; explicit local read never captures', async () => {
  const f = fixture(); f.open(); assert.deepEqual(f.calls, []);
  assert.equal(f.button('Diesen abgerechneten').props.disabled, true);
  f.button('Lokale Finanzbelege').props.onPress(); await f.settle();
  assert.deepEqual(f.calls, ['busy:true', 'read-local', 'busy:false']);
  assert.match(f.text(), /Lokale Finanzbelege geprüft/);
});

test('explicit login handoff does no capture and respects blocked/uncertain/background admission', () => {
  const f = fixture(); f.open();
  f.button('Anbieteranmeldung für Finanznachweis').props.onPress(); assert.deepEqual(f.calls, ['open-provider']);
  f.props.blocked = true; f.render(); f.button('Anbieteranmeldung für Finanznachweis').props.onPress();
  f.props.blocked = false; f.props.saveUncertain = true; f.render(); f.button('Anbieteranmeldung für Finanznachweis').props.onPress();
  f.props.saveUncertain = false; f.background(); f.render(); f.button('Anbieteranmeldung für Finanznachweis').props.onPress();
  assert.deepEqual(f.calls, ['open-provider', 'cancel']);
});

test('capture passes exact observed links once, then verifies exact receipt', async () => {
  const f = fixture(); f.open();
  f.input('Beobachtete Eigene-Flüge-Liste', 'observed-list'); f.input('Beobachteter Flugdetail-Link', 'observed-detail'); f.render();
  const action = f.button('Diesen abgerechneten'); action.props.onPress(); action.props.onPress(); await f.settle();
  assert.deepEqual(f.calls, ['busy:true', 'capture:observed-list:observed-detail', 'read-exact', 'busy:false']);
  assert.match(f.text(), /gespeichert und exakt zurückgelesen/);
});

test('uncertain save exposes only reconciliation; retry uses same controller request', async () => {
  const f = fixture(); f.props.saveUncertain = true; f.render(); f.open();
  assert.equal(f.button('Diesen abgerechneten').props.disabled, true);
  assert.equal(f.button('Lokale Finanzbelege').props.disabled, true);
  f.button('Ursprüngliche Finanzspeicherung').props.onPress(); await f.settle();
  assert.deepEqual(f.calls, ['busy:true', 'retry', 'read-exact', 'busy:false']);
});

test('capture failure and acknowledged-save read failure have distinct recovery messages', async () => {
  const f = fixture(); f.open(); f.capture(async () => { throw Error('private provider error'); });
  f.button('Diesen abgerechneten').props.onPress(); await f.settle();
  assert.match(f.text(), /Nachweis nicht bestätigt/); assert.ok(!f.calls.includes('read-exact'));
  f.capture(async () => ({ id: 'synthetic' })); f.read(async () => { throw Error('private disk error'); });
  f.button('Diesen abgerechneten').props.onPress(); await f.settle();
  assert.match(f.text(), /Speichern bestätigt; lokales Zurücklesen nicht bestätigt/);
  assert.ok(!f.text().includes('private'));
});

test('blocked/foreground admission and interrupted lifecycle prevent stale readback/display', async () => {
  const f = fixture(); f.open(); f.props.blocked = true; f.render();
  f.button('Lokale Finanzbelege').props.onPress(); assert.equal(f.calls.length, 0);
  f.props.blocked = false; let finish!: (value: any) => void;
  f.capture(() => new Promise(resolve => { finish = resolve; })); f.render();
  f.button('Diesen abgerechneten').props.onPress(); f.background(); finish({ id: 'synthetic' }); await f.settle();
  assert.deepEqual(f.calls, ['busy:true', 'capture::', 'cancel', 'busy:false']);
  assert.ok(!f.text().includes('exakt zurückgelesen'));
  f.button('Lokale Finanzbelege').props.onPress(); assert.ok(!f.calls.includes('read-local'));
  f.unmount(); assert.equal(f.calls.at(-1), 'remove');
});

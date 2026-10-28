import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element { type: string; props: Record<string, any>; children: any[] }
const flatten = (style: any): Record<string, any> => Array.isArray(style)
  ? Object.assign({}, ...style.map(flatten)) : style || {};
function fixture() {
  const react = { createElement: (type: any, props: any, ...children: any[]): Element =>
    typeof type === 'function' ? type({ ...props, children }) : { type, props: props ?? {}, children: children.flat(Infinity) } };
  const modules: Record<string, unknown> = {
    react: { default: react },
    'react-native': { ...Object.fromEntries(['ImageBackground', 'Pressable', 'Text', 'View', 'Modal', 'ScrollView'].map(n => [n, n])),
      Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ width: 360, fontScale: 1.6 }),
      StyleSheet: { create: (value: unknown) => value, absoluteFill: {} } },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
  };
  (modules.react as any).useEffect = () => {};
  function load(name: string) {
    const source = ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${name}.tsx`, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
    }).outputText;
    const exports: any = {};
    runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
    return exports;
  }
  const theme = load('theme'); modules['./theme'] = theme;
  return { theme, load };
}
function nodes(tree: Element): Element[] {
  return [tree, ...tree.children.filter(n => n && typeof n === 'object' && n.children).flatMap(nodes)];
}

test('content action separates a compact face from its independent target and retains label, press and disabled semantics', () => {
  const { theme } = fixture(); let calls = 0;
  const props = { children: 'Gespeicherte Zugangsdaten verwalten', label: 'Zugangsdaten', testID: 'test-action', onPress: () => calls++ };
  for (const secondary of [false, true]) {
    const tree = theme.Action({ ...props, secondary });
    const target = flatten(tree.props.style({ pressed: false })), face = flatten(tree.children[0].props.style);
    assert.ok(target.minHeight >= 48 && target.minWidth >= 48);
    assert.equal(target.backgroundColor, undefined, 'The target does not paint the larger face');
    assert.equal(face.minHeight, 40); assert.equal(face.paddingHorizontal, 12);
    assert.equal(face.height, undefined, 'Multiline and enlarged labels may grow');
    const label = nodes(tree).find(n => n.type === 'Text')!;
    assert.equal(label.children[0], props.children); assert.equal(label.props.numberOfLines, undefined);
    assert.equal(tree.props.accessibilityLabel, props.label); assert.equal(tree.props.testID, props.testID);
    assert.equal(flatten(tree.props.style({ pressed: true })).opacity, .72);
    tree.props.onPress();
    const disabled = theme.Action({ ...props, secondary, disabled: true });
    assert.equal(disabled.props.disabled, true); assert.equal(disabled.props.accessibilityState.disabled, true);
    assert.equal(flatten(disabled.props.style({ pressed: false })).opacity, .5);
  }
  assert.equal(calls, 2);
});

test('content cards brighten independently while Start keeps its selected surfaces', () => {
  const { theme } = fixture();
  assert.equal(theme.colors.background, '#001b29'); assert.equal(theme.colors.cyan, '#27d3d2');
  assert.equal(flatten(theme.Card({}).props.style).backgroundColor, '#103546');
  const start = flatten(theme.Card({ surface: 'start' }).props.style);
  assert.equal(start.backgroundColor, '#062331'); assert.equal(start.borderColor, '#183d50');
  const secondary = (surface: string) => flatten(theme.Action({ secondary: true, surface, onPress() {} }).children[0].props.style);
  assert.equal(secondary('content').backgroundColor, '#1a4356');
  assert.equal(secondary('start').backgroundColor, '#0c3041');
});

test('short decisions retain cancellation and confirmation with growing faces inside distinct tap targets', () => {
  const f = fixture();
  for (const name of ['SyncConfirmationDialog', 'BackupRestoreConfirmationDialog', 'AiDeleteConfirmationDialog']) {
    let cancelled = 0, confirmed = 0;
    const tree = f.load(name)[name]({ title: 'Synthetic conversation', onCancel: () => cancelled++, onConfirm: () => confirmed++ });
    const actions = nodes(tree).filter(n => n.type === 'Pressable' && n.props.accessibilityRole === 'button');
    assert.equal(actions.length, 2);
    for (const action of actions) {
      assert.ok(flatten(action.props.style({ pressed: false })).minHeight >= 48);
      const face = flatten(action.children[0].props.style);
      assert.equal(face.minHeight, 40); assert.equal(face.height, undefined);
      action.props.onPress();
    }
    assert.equal(cancelled, 1); assert.equal(confirmed, 1);
    tree.props.onRequestClose(); assert.equal(cancelled, 2);
  }
});

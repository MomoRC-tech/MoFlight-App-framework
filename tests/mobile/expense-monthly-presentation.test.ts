import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expenseMoney } from '../../apps/platform-lab/src/mobile/financial-analysis-model';

test('cost months expose exact amounts, distinguish unknown/zero/conflict and select the exact month', () => {
  const code = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ExpenseMonthlyChart.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const createElement = (type: string, props: any, ...children: any[]) => ({ type, props: props ?? {}, children: children.flat(Infinity) });
  const modules: Record<string, unknown> = {
    react: { createElement },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (s: unknown) => s } },
    './theme': { Label: 'Label', colors: {} }, './financial-analysis-model': { expenseMoney },
  };
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const months = [null, 0, 640].map((knownMinor, i) => ({ year: 2026, month: i + 1, label: ['Jan', 'Feb', 'Mär'][i], knownMinor, state: i === 2 ? 'conflict' : 'partial' }));
  let selected: unknown;
  const tree = exports.ExpenseMonthlyChart({ months, selectedMonth: 2, onMonth: (month: unknown) => { selected = month; } });
  const nodes: any[] = [];
  const visit = (node: any) => { if (node?.children) { nodes.push(node); node.children.forEach(visit); } }; visit(tree);
  const buttons = nodes.filter(node => node.type === 'Pressable');
  assert.equal(buttons.length, 3);
  assert.match(buttons[0].props.accessibilityLabel, /—, Betrag unbekannt/);
  assert.match(buttons[1].props.accessibilityLabel, /0,00 €.*bekannter Teilbetrag/);
  assert.equal(buttons[1].props.accessibilityState.selected, true);
  assert.match(buttons[2].props.accessibilityLabel, /6,40 €.*Widerspruch/);
  buttons[2].props.onPress(); assert.equal(selected, months[2]);
  const labels = nodes.filter(node => node.type === 'Label').flatMap(node => node.children);
  assert.ok(labels.includes('6,40 €')); assert.ok(labels.includes('Widerspruch'));
});

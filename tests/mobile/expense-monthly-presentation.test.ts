import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { expenseMoney } from '../../apps/platform-lab/src/mobile/financial-analysis-model';

test('cost trend preserves a full year, exact month routes, unknown gaps, zero and conflict markers', () => {
  const code = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ExpenseMonthlyChart.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const createElement = (type: string, props: any, ...children: any[]) => ({ type, props: props ?? {}, children: children.flat(Infinity) });
  const modules: Record<string, unknown> = {
    react: { createElement },
    'react-native': { Pressable: 'Pressable', ScrollView: 'ScrollView', View: 'View', StyleSheet: { create: (s: unknown) => s } },
    './theme': { Label: 'Label', colors: { cyan: '#b8adff', raised: '#292d43', text: '#f4f2fb', orange: '#ffb49a' } },
    './TrendChart': { TrendChart: 'TrendChart' }, './financial-analysis-model': { expenseMoney },
  };
  const exports: any = {};
  runInNewContext(code, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const months = Array.from({ length: 12 }, (_, i) => ({ year: 2026, month: i + 1,
    label: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'][i]!,
    knownMinor: i === 0 ? null : i === 1 ? 0 : i === 2 ? 640 : 100 * i, state: i === 2 ? 'conflict' : 'partial' }));
  let selected: unknown;
  const tree = exports.ExpenseMonthlyChart({ months, selectedMonth: 2, onMonth: (month: unknown) => { selected = month; } });
  const nodes: any[] = [];
  const visit = (node: any) => { if (node?.children) { nodes.push(node); node.children.forEach(visit); } }; visit(tree);
  const buttons = nodes.filter(node => node.type === 'Pressable');
  assert.equal(buttons.length, 12);
  assert.match(buttons[0].props.accessibilityLabel, /—, Betrag unbekannt/);
  assert.match(buttons[1].props.accessibilityLabel, /0,00 €.*bekannter Teilbetrag/);
  assert.equal(buttons[1].props.accessibilityState.selected, true);
  assert.match(buttons[2].props.accessibilityLabel, /6,40 €.*Widerspruch/);
  assert.equal(buttons[0].props.style[0].minHeight, 48, 'Every exact month option meets the compact touch target');
  buttons[2].props.onPress(); assert.equal(selected, months[2]);
  const trend = nodes.find(node => node.type === 'TrendChart')!;
  assert.deepEqual([...trend.props.values], months.map(month => month.knownMinor), 'Unknown is null and known zero stays zero');
  assert.deepEqual([...trend.props.labels], months.map(month => month.label));
  assert.deepEqual([...trend.props.uncertain], months.map(month => month.state === 'conflict'));
  assert.equal(trend.props.selectedIndex, 1);
  assert.equal(trend.props.formatValue(0), '0,00 €');
  trend.props.onSelect(2); assert.equal(selected, months[2], 'Trend selection follows the same period route as the month pill');
  assert.match(trend.props.accessibilityLabel, /Unbekannte.*Lücken.*Widersprüche/);
  const labels = nodes.filter(node => node.type === 'Label').flatMap(node => node.children);
  assert.ok(nodes.some(node => node.type === 'Label' && node.children.join('') === 'Feb 2026'));
  assert.ok(labels.includes('0,00 €')); assert.ok(labels.includes('!'));
  assert.match(buttons[2].props.accessibilityLabel, /Widerspruch/);
  assert.ok(labels.includes('— Betrag unbekannt'));
  assert.equal(labels.filter((value: unknown) => typeof value === 'string' && /\d,\d\d €/.test(value)).length, 1,
    'The chart does not crowd the year with twelve displayed prices');
});

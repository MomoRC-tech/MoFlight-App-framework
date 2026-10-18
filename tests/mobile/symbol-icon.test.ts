import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

interface Element { type: unknown; props: Record<string, any>; children: any[] }
const react = { createElement: (type: unknown, props: Element['props'], ...children: unknown[]): Element => ({ type, props: props ?? {}, children }) };
function load(name: string, modules: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/mobile/${name}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
  }).outputText;
  const exports: Record<string, any> = {};
  runInNewContext(source, { exports, require: (path: string) => {
    assert.ok(path in modules, `Unexpected service/runtime dependency: ${path}`); return modules[path];
  } });
  return exports;
}
const icons = load('SymbolIcon', {
  react: { default: react },
  'react-native': { Image: 'Image', View: 'View', StyleSheet: { create: (s: unknown) => s } },
  './duotone-assets': { duotoneAssets: { home: { default: 'cyan-home', muted: 'muted-home', contrast: 'dark-home' } } },
});

test('decorative icons choose independent duotone variants without tinting or duplicate announcements', () => {
  const icon = icons.SymbolIcon({ name: 'home', size: 20, tone: 'muted' }) as Element;
  assert.equal(icon.props.source, 'muted-home');
  assert.equal(icon.props.accessible, false);
  assert.equal(icon.props.accessibilityElementsHidden, true);
  assert.equal(icon.props.importantForAccessibility, 'no');
  assert.equal(icon.props.style.width, 20);
  assert.equal(icon.props.style.height, 20);
  assert.equal(icon.props.style.tintColor, undefined);
  assert.equal(icon.props.accessibilityLabel, undefined);
  const tiled = icons.SymbolIcon({ name: 'home', size: 28, tile: true }) as Element;
  assert.equal(tiled.type, 'View');
  assert.equal(tiled.props.style[1].width, 36);
  assert.equal(tiled.children[0].props.source, 'cyan-home');
});

test('selected Medical card and supplied paper plane reach the existing shell interfaces', () => {
  const shell = load('ShellIcons', { react: { default: react }, './SymbolIcon': { SymbolIcon: 'SymbolIcon', legacyIconTone: icons.legacyIconTone } });
  assert.equal(shell.MedicalIcon().props.name, 'medical-card');
  const selected = shell.PlaneIcon({ color: '#00c8ff' });
  assert.equal(selected.props.name, 'flight-paper-plane');
  assert.equal(selected.props.tone, 'default');
  assert.equal(shell.PlaneIcon({ color: '#adbed5' }).props.tone, 'muted');
});

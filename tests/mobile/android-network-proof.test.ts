import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as reader from '../../apps/platform-lab/src/vereinsflieger/activity-probe';

test('build-only network proof permits only its fixed localhost origin and profile path', async () => {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/development/android-network-poc.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports: { networkReader?: string } = {};
  const modules: Record<string, unknown> = { react: {}, 'react-native': {}, 'react-native-webview': {}, 'expo-sqlite': {}, '../vereinsflieger/activity-probe': reader };
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  assert.ok(exports.networkReader);
  for (const [url, allowed] of [
    ['http://localhost:18765/member/profile/viewprofile', true],
    ['https://vereinsflieger.de/member/profile/viewprofile', false],
    ['http://localhost:18766/member/profile/viewprofile', false],
    ['http://localhost.evil:18765/member/profile/viewprofile', false],
    ['http://localhost:18765/member/profile/flightlog.php', false],
    ['http://localhost:18765/member/profile/viewprofile?foreign=1', false],
  ] as const) {
    let requests = 0;
    const window: any = { ReactNativeWebView: { postMessage() {} } }; window.top = window;
    const document = {
      querySelector: () => null,
      querySelectorAll: (selector: string) => selector === 'table.tablelist.alternative tr'
        ? [{ cells: [{ textContent: 'Benutzernummer' }, { textContent: '123' }] }]
        : [{ textContent: 'Synthetic club', getAttribute: () => '/member/community/main' }],
    };
    await runInNewContext(`(${exports.networkReader})('test',{accountNumber:'123',clubLabel:'Synthetic club'})`, {
      location: new URL(url), window, document, URL, AbortController, Date, setTimeout, clearTimeout,
      fetch: async () => { requests++; throw new Error('Synthetic connection refusal'); },
    });
    assert.equal(requests, allowed ? 1 : 0, url);
    assert.equal(window.__moflightActivityAbort, undefined);
  }
});

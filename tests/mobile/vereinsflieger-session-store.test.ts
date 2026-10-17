import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type * as SessionStore from '../../apps/platform-lab/src/vereinsflieger/session-store.ts';

const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/session-store.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

test('iOS and missing Android module fail closed without touching secrets, SQLite or the browser store', async () => {
  for (const platform of ['ios', 'android']) {
    let lookups = 0;
    const forbidden = () => { throw new Error('Unexpected data access'); };
    const modules: Record<string, unknown> = {
      'react-native': { Platform: { OS: platform } },
      expo: { requireOptionalNativeModule: () => { lookups++; return null; } },
      'expo-crypto': { randomUUID: forbidden }, 'expo-secure-store': { setItemAsync: forbidden, getItemAsync: forbidden, deleteItemAsync: forbidden },
      '../storage': { openDriver: forbidden },
    };
    const adapter = {} as typeof SessionStore;
    runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
    assert.equal(adapter.sessionClearingAvailable, false); assert.equal(adapter.sessionProofAvailable, false);
    await assert.rejects(adapter.clearProviderStore(), /unsupported/);
    assert.equal(await adapter.proveSyntheticStore(), false);
    assert.equal(lookups, platform === 'ios' ? 0 : 1);
  }
});

test('Android adapter requires both cookie emptiness and a WebStorage deletion request', async () => {
  let calls = 0;
  let result = { cookiesEmpty: false, webStorageDeletionRequested: true };
  const modules: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'android' } },
    expo: { requireOptionalNativeModule: () => ({ clearAsync: async () => { calls++; return result; } }) },
    'expo-crypto': {}, 'expo-secure-store': {}, '../storage': {},
  };
  const adapter = {} as typeof SessionStore;
  runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  assert.equal(adapter.sessionClearingAvailable, true);
  await assert.rejects(adapter.clearProviderStore(), /unconfirmed/);
  result = { cookiesEmpty: true, webStorageDeletionRequested: false };
  await assert.rejects(adapter.clearProviderStore(), /unconfirmed/);
  result = { cookiesEmpty: true, webStorageDeletionRequested: true };
  await adapter.clearProviderStore(); await adapter.clearProviderStore();
  assert.equal(calls, 4); // Already-empty store is also a successful clear.
});

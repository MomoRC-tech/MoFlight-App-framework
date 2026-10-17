import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type * as SessionStore from '../../apps/platform-lab/src/vereinsflieger/session-store.ts';
import * as review from '../../apps/platform-lab/src/vereinsflieger/legacy-review.ts';
import * as legacyStore from '../../apps/platform-lab/src/vereinsflieger/legacy-recovery-store.ts';
import { createHash } from 'node:crypto';

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
      './legacy-review': review, './legacy-recovery-store': legacyStore,
    };
    const adapter = {} as typeof SessionStore;
    runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
    assert.equal(adapter.sessionClearingAvailable, false); assert.equal(adapter.sessionProofAvailable, false);
    assert.equal(adapter.legacyReviewAvailable, false);
    assert.equal(adapter.legacyRecoveryAvailable, false);
    await assert.rejects(adapter.legacyRecoveryFingerprint(), /unavailable/);
    await assert.rejects(adapter.readReviewedRecovery('ab'.repeat(32)), /unavailable/);
    await assert.rejects(adapter.reviewLegacyRecovery(), /unavailable/);
    await assert.rejects(adapter.clearProviderStore(), /unsupported/);
    assert.equal(await adapter.proveSyntheticStore(), false);
    assert.equal(lookups, platform === 'ios' ? 0 : 1);
  }
});

test('native state returns only a strict fingerprint; full journal read is explicit and independently hashed/validated', async () => {
  let stateReads = 0, payloadReads = 0;
  const target = { version: 2, accountLabel: 'Synthetic Pilot', preset: 'Synthetic view', columns: ['1'], filters: [{ name: 'col1', type: 'text', value: '', checked: false }], sort: [], role: 'Pilot', period: 'Das letzte Jahr', reset: false };
  let payload: unknown = JSON.stringify(target);
  const hash = (text: string) => createHash('sha256').update(text).digest('hex');
  const fingerprint = hash(payload as string);
  let state: unknown = fingerprint;
  const forbidden = () => { throw new Error('Unexpected credential/storage access'); };
  const modules: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'android' } },
    expo: { requireOptionalNativeModule: () => ({ legacyRecoveryStateAsync: async () => { stateReads++; return state; }, readReviewedRecoveryAsync: async () => { payloadReads++; return payload; }, clearAsync: forbidden }) },
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digestStringAsync: async (_: unknown, text: string) => hash(text) },
    'expo-secure-store': { getItemAsync: forbidden, setItemAsync: forbidden, deleteItemAsync: forbidden },
    '../storage': { openDriver: forbidden }, './legacy-review': review, './legacy-recovery-store': legacyStore,
  };
  const adapter = {} as typeof SessionStore;
  runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  assert.equal(stateReads, 0); assert.equal(payloadReads, 0);
  assert.equal(adapter.legacyRecoveryAvailable, true);
  assert.equal(await adapter.legacyRecoveryFingerprint(), fingerprint);
  assert.equal(payloadReads, 0);
  assert.deepEqual(await adapter.readReviewedRecovery(fingerprint), target);
  await assert.rejects(adapter.readReviewedRecovery('../wrong'));
  assert.equal(payloadReads, 1);
  payload = JSON.stringify({ ...target, period: 'Changed' });
  await assert.rejects(adapter.readReviewedRecovery(fingerprint), /changed/);
  payload = { payload: 'Unexpected bridge object' };
  await assert.rejects(adapter.readReviewedRecovery(fingerprint), /unavailable/);
  state = { fingerprint };
  await assert.rejects(adapter.legacyRecoveryFingerprint(), /fingerprint/);
  state = null; assert.equal(await adapter.legacyRecoveryFingerprint(), null);
});

test('Android adapter requires both cookie emptiness and a WebStorage deletion request', async () => {
  let calls = 0;
  let result = { cookiesEmpty: false, webStorageDeletionRequested: true };
  const modules: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'android' } },
    expo: { requireOptionalNativeModule: () => ({ clearAsync: async () => { calls++; return result; } }) },
    'expo-crypto': {}, 'expo-secure-store': {}, '../storage': {},
    './legacy-review': review, './legacy-recovery-store': legacyStore,
  };
  const adapter = {} as typeof SessionStore;
  runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  assert.equal(adapter.sessionClearingAvailable, true);
  assert.equal(adapter.legacyReviewAvailable, false); // Older native builds have no diagnostic.
  await assert.rejects(adapter.clearProviderStore(), /unconfirmed/);
  result = { cookiesEmpty: true, webStorageDeletionRequested: false };
  await assert.rejects(adapter.clearProviderStore(), /unconfirmed/);
  result = { cookiesEmpty: true, webStorageDeletionRequested: true };
  await adapter.clearProviderStore(); await adapter.clearProviderStore();
  assert.equal(calls, 4); // Already-empty store is also a successful clear.
});

test('explicit native review projects metadata without invoking storage, credentials or clearing', async () => {
  let reads = 0;
  const forbidden = () => { throw new Error('Unexpected data access'); };
  let result: unknown = { status: 'absent' };
  const modules: Record<string, unknown> = {
    'react-native': { Platform: { OS: 'android' } },
    expo: { requireOptionalNativeModule: () => ({ reviewLegacyRecoveryAsync: async () => { reads++; return result; }, clearAsync: forbidden }) },
    'expo-crypto': { randomUUID: forbidden }, 'expo-secure-store': { getItemAsync: forbidden, setItemAsync: forbidden, deleteItemAsync: forbidden },
    '../storage': { openDriver: forbidden }, './legacy-review': review, './legacy-recovery-store': legacyStore,
  };
  const adapter = {} as typeof SessionStore;
  runInNewContext(source, { exports: adapter, require: (name: string) => { assert.ok(name in modules); return modules[name]; } });
  assert.equal(reads, 0); assert.equal(adapter.legacyReviewAvailable, true);
  assert.deepEqual(await adapter.reviewLegacyRecovery(), { status: 'absent' });
  result = { status: 'absent', payload: 'private synthetic sentinel' };
  await assert.rejects(adapter.reviewLegacyRecovery(), /^Error: Legacy review unavailable\.$/);
  assert.equal(reads, 2);
});

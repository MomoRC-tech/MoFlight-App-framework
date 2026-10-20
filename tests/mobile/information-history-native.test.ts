import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { informationCategories } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { validateScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

test('missing capture history authorizes first, opens no capture database and creates no false source-empty snapshot', async () => {
  const events: string[] = [];
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/information-native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modules = {
    'expo-file-system': { File: class { get exists() { events.push('file-check'); return false; } } },
    'expo-sqlite': { defaultDatabaseDirectory: 'file:///synthetic' },
    '../storage': { openDriver: async (name: string) => { assert.equal(name, 'vereinsflieger-owner-registry.sqlite'); events.push('registry-open'); return { close: async () => { events.push('registry-close'); } }; } },
    './scope-store': { validateScope, authorizeScope: async () => { events.push('authorized'); } },
    './information-store': { InformationStore: class { constructor() { throw new Error('Missing-file history must not construct a store'); } } },
    './information': { informationCategories },
  };
  const exports = {} as typeof import('../../apps/platform-lab/src/vereinsflieger/information-native.ts');
  runInNewContext(source, { exports, require: (name: keyof typeof modules) => { assert.ok(name in modules, name); return modules[name]; } });
  const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-history', context: { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
  const value = await exports.readInformationHistory(scope, 'work-hours', 0, () => {});
  assert.deepEqual(JSON.parse(JSON.stringify(value)), { category: 'work-hours', index: 0, total: 0, capture: null });
  assert.ok(events.indexOf('authorized') < events.indexOf('file-check')); assert.equal(events.filter(x => x === 'registry-close').length, 1);
  await assert.rejects(exports.readInformationHistory(scope, 'work-hours', 1, () => {}));
  await assert.rejects(exports.readInformationHistory(scope, 'work-hours', 0, () => { throw new Error('Expired owner'); }));
  assert.equal(await exports.readInformationCapture(scope, 'uncertain-capture', () => {}), null);
  await assert.rejects(exports.readInformationCapture(scope, '../foreign', () => {}));
  await assert.rejects(exports.readInformationCapture(scope, 'uncertain-capture', () => { throw new Error('Expired owner'); }));
});

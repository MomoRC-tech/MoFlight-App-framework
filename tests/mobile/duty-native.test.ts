import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { createDutyRosterSnapshot } from '../../apps/platform-lab/src/vereinsflieger/duties.ts';

const scope: ProviderScope = { version: 1, owner: 'synthetic', connectionId: 'synthetic-club', context: { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
function nativeHarness(exists: boolean, failSave = false) {
  const events: string[] = [];
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/duty-native.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const modules = {
    'expo-file-system': { Paths: { cache: { uri: 'file:///synthetic-cache/' } }, Directory: class {
      uri = 'file:///synthetic-cache/vereinsflieger-duty-roster/';
      constructor(parent: { uri: string }, name: string) { assert.equal(parent.uri, 'file:///synthetic-cache/'); assert.equal(name, 'vereinsflieger-duty-roster'); }
      create() { events.push('cache-directory'); }
    }, File: class {
      constructor(directory: string, name: string) { assert.equal(directory, 'file:///synthetic-cache/vereinsflieger-duty-roster/'); assert.equal(name, 'vereinsflieger-duty-roster-synthetic-club.sqlite'); }
      get exists() { events.push('file-check'); return exists; }
    } },
    '../storage': { openDriver: async (name: string, directory?: string) => {
      if (name === 'vereinsflieger-owner-registry.sqlite') { assert.equal(directory, undefined); events.push('registry-open'); }
      else { assert.equal(name, 'vereinsflieger-duty-roster-synthetic-club.sqlite'); assert.equal(directory, 'file:///synthetic-cache/vereinsflieger-duty-roster/'); events.push('cache-open'); }
      return { exec: async (sql: string) => { assert.match(sql, /secure_delete=ON/); events.push('secure-delete'); }, close: async () => { events.push('closed'); } };
    } },
    './scope-store': { validateScope, authorizeScope: async () => { events.push('authorized'); } },
    './duty-store': { DutyRosterStore: class {
      constructor() { events.push('store'); }
      async initialize() { events.push('initialize'); }
      async save() { events.push('save'); if (failSave) throw new Error('Failed cache write'); }
      async load() { events.push('load'); return null; }
    } },
  };
  const exports = {} as typeof import('../../apps/platform-lab/src/vereinsflieger/duty-native.ts');
  runInNewContext(source, { exports, require: (name: keyof typeof modules) => { assert.ok(name in modules, name); return modules[name]; } });
  return { exports, events };
}

test('native missing cache authorizes first, creates no file and returns unknown', async () => {
  const { exports, events } = nativeHarness(false);
  assert.equal(await exports.loadDutyRoster(scope), null);
  assert.ok(events.indexOf('authorized') < events.indexOf('file-check'));
  assert.ok(!events.includes('cache-open'));
  await assert.rejects(exports.loadDutyRoster(scope, () => { throw new Error('Expired'); }));
});

test('native roster opens OS cache outside backed-up databases, enables secure delete and propagates write failure', async () => {
  const { exports, events } = nativeHarness(true, true);
  const snapshot = createDutyRosterSnapshot(scope, [{ version: 1, id: 'synthetic', retrievedAt: '2026-10-22T10:00:00.000Z', owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile', category: 'duties', path: '/member/profile/myservices.php', columns: [{ key: 'duty', label: 'Dienst', index: 0 }, { key: 'period', label: 'Zeitraum', index: 1 }, { key: 'people', label: 'Person(en)', index: 2 }], rows: [], filters: [], empty: true, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } }], '2026-10-22T10:00:00.000Z');
  await assert.rejects(exports.saveDutyRoster(scope, snapshot, () => {}), /Failed cache write/);
  assert.deepEqual(events.slice(-4), ['store', 'initialize', 'save', 'closed']);
  assert.ok(events.indexOf('authorized') < events.indexOf('cache-open'));
  assert.ok(events.includes('secure-delete'));
});

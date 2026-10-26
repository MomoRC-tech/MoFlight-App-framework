import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { validateScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store';

const scope: ProviderScope = { version: 1, owner: 'synthetic', connectionId: 'synthetic-connection', context: {
  accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number',
} };
type Mode = 'success' | 'save-fails' | 'readback-fails' | 'gate-changed' | 'scope-changed' | 'restore-pending' | 'restore-after-readback';

function harness(kind: 'information' | 'duty', mode: Mode) {
  const events: string[] = [], opened: string[] = [], closed: string[] = [];
  let active = true, authorized = true, restoreChecks = 0, mutating = false;
  const readback = { persisted: true };
  const returned = kind === 'information' ? [readback] : readback;
  class Store {
    constructor(_db: unknown, _scope: unknown, readonly authorize: () => Promise<void>) {}
    async initialize() { events.push('initialize'); await this.authorize(); }
    async save() {
      if (kind === 'information') assert.equal(mutating, true);
      events.push('save'); await this.authorize();
      if (mode === 'save-fails') throw new Error('save failed');
      if (mode === 'gate-changed') active = false;
      if (mode === 'scope-changed') authorized = false;
    }
    async load() {
      if (kind === 'information') assert.equal(mutating, true);
      events.push('readback'); await this.authorize();
      if (mode === 'readback-fails') throw new Error('readback failed');
      return returned;
    }
    async latest() { return this.load(); }
  }
  const modules: Record<string, unknown> = {
    'expo-file-system': { File: class { get exists() { return false; } }, Directory: class {
      uri = 'file:///synthetic-cache'; create() { events.push('directory'); }
    }, Paths: { cache: 'file:///synthetic-cache' } },
    'expo-sqlite': { defaultDatabaseDirectory: 'file:///synthetic' },
    'expo-crypto': {},
    '../storage': { openDriver: async (name: string) => {
      opened.push(name); return { exec: async () => {}, close: async () => { closed.push(name); } };
    } },
    './scope-store': { validateScope, authorizeScope: async () => { if (!authorized) throw new Error('scope changed'); } },
    '../user-backup-restore-journal-native': { assertNoPendingUserBackupRestore: async () => {
      restoreChecks++;
      if (mode === 'restore-pending' || mode === 'restore-after-readback' && restoreChecks > 1) throw new Error('restore pending');
    } },
    './information-store': { InformationStore: Store },
    './duty-store': { DutyRosterStore: Store },
    './information': {},
    './information-selection': { INFORMATION_SELECTION_FILE_NAME: 'selection.sqlite', informationStoreName: () => 'information.sqlite',
      withInformationMutation: async (work: () => Promise<unknown>) => {
        assert.equal(mutating, false); mutating = true;
        try { return await work(); } finally { mutating = false; events.push('mutation-released'); }
      } },
    './information-backup-service': {},
  };
  const source = ts.transpileModule(readFileSync(new URL(`../../apps/platform-lab/src/vereinsflieger/${kind}-native.ts`, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  const saveAndRead = exports[kind === 'information' ? 'saveAndLoadInformation' : 'saveAndLoadDutyRoster'];
  assert.ok(saveAndRead);
  const run = () => saveAndRead(scope, { submitted: true }, () => { if (!active) throw new Error('gate changed'); });
  return { run, returned, events, opened, closed };
}

for (const kind of ['information', 'duty'] as const) {
  test(`${kind} save/readback shares one store, returns actual readback and closes every opened database`, async () => {
    const h = harness(kind, 'success');
    assert.equal(await h.run(), h.returned);
    assert.equal(h.events.filter(event => event === 'initialize').length, 1);
    assert.ok(h.events.indexOf('save') < h.events.indexOf('readback'));
    assert.equal(h.opened.filter(name => name !== 'vereinsflieger-owner-registry.sqlite').length, 1);
    assert.deepEqual([...h.closed].sort(), [...h.opened].sort());
  });
  for (const mode of ['save-fails', 'readback-fails', 'gate-changed', 'scope-changed', 'restore-pending', 'restore-after-readback'] as const) {
    test(`${kind} save/readback rejects ${mode} and releases its resources`, async () => {
      const h = harness(kind, mode);
      await assert.rejects(h.run(), /failed|changed|pending/);
      assert.deepEqual([...h.closed].sort(), [...h.opened].sort());
      if (['save-fails', 'gate-changed', 'restore-pending'].includes(mode)) assert.ok(!h.events.includes('readback'));
      if (mode === 'restore-pending') assert.equal(h.opened.length, 0);
      if (kind === 'information') assert.equal(h.events.at(-1), 'mutation-released');
    });
  }
}

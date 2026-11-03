import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { bindScope, authorizeScope, SCOPE_SCHEMA, validateScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { clearTaskSelectionRecovery, createTaskSelectionRecovery, loadPendingTaskSelectionRecovery, rememberTaskSelectionRecovery, validateTaskSelectionRecovery, type TaskSelectionRecovery } from '../../apps/platform-lab/src/vereinsflieger/task-selection-recovery.ts';

test('native selector journal is per full scope, read-missing creates no file, and final registry revocation preserves evidence', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-task-selector-native-'));
  const events: string[] = [];
  let authorizationCalls = 0, revokeAt = Number.POSITIVE_INFINITY;
  const databaseDirectory = pathToFileURL(directory).href.replace(/\/$/, '');
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/task-selection-recovery-native.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: false },
  }).outputText;
  const modules = {
    'expo-crypto': {
      CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
      digestStringAsync: async (_algorithm: string, value: string) => createHash('sha256').update(value).digest('hex'),
    },
    'expo-sqlite': { defaultDatabaseDirectory: databaseDirectory },
    'expo-file-system': { File: class {
      readonly path: string;
      constructor(base: string, name: string) { this.path = fileURLToPath(new URL(name, base.endsWith('/') ? base : base + '/')); events.push('file:' + name); }
      get exists() { events.push('check'); return existsSync(this.path); }
      create(options: { overwrite?: boolean; intermediates?: boolean }) {
        if (existsSync(this.path) && !options.overwrite) throw new Error('Synthetic file already exists');
        if (options.intermediates) mkdirSync(directory, { recursive: true });
        writeFileSync(this.path, new Uint8Array()); events.push('create');
      }
    } },
    '@moflight/flight-logbook': { canonical },
    '../storage': { openDriver: async (name: string) => nodeDriver(join(directory, name)) },
    '../user-backup-restore-journal-native': { assertNoPendingUserBackupRestore: async () => { events.push('backup-check'); } },
    './scope-store': {
      validateScope,
      authorizeScope: async (db: Parameters<typeof authorizeScope>[0], scope: ProviderScope) => {
        authorizationCalls++; events.push('authorize');
        if (authorizationCalls === revokeAt) await db.run('DELETE FROM provider_scopes WHERE owner=?', scope.owner);
        return authorizeScope(db, scope);
      },
    },
    './task-selection-recovery': {
      clearTaskSelectionRecovery,
      loadPendingTaskSelectionRecovery,
      rememberTaskSelectionRecovery,
      validateTaskSelectionRecovery,
    },
  };
  const exports = {} as {
    loadTaskSelectionRecovery(scope: ProviderScope, gate?: () => void): Promise<TaskSelectionRecovery | null>;
    saveTaskSelectionRecovery(scope: ProviderScope, value: TaskSelectionRecovery, gate?: () => void): Promise<TaskSelectionRecovery>;
    clearTaskSelectionRecovery(scope: ProviderScope, expected: TaskSelectionRecovery, gate?: () => void): Promise<void>;
  };
  runInNewContext(source, { exports, require: (name: keyof typeof modules) => { assert.ok(name in modules, name); return modules[name]; } });

  const scopeA: ProviderScope = { version: 1, owner: 'native-owner-a', connectionId: 'native-connection-a', context: { accountNumber: '12345', clubLabel: 'Synthetic club A', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
  const scopeB: ProviderScope = { version: 1, owner: 'native-owner-b', connectionId: 'native-connection-b', context: { accountNumber: '54321', clubLabel: 'Synthetic club B', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
  const registry = nodeDriver(join(directory, 'vereinsflieger-owner-registry.sqlite'));
  try {
    await registry.exec(SCOPE_SCHEMA); await bindScope(registry, scopeA); await bindScope(registry, scopeB); await registry.close();
    assert.equal(await exports.loadTaskSelectionRecovery(scopeA), null);
    const createdBeforeWrite = events.filter(event => event === 'create').length;
    assert.equal(createdBeforeWrite, 0, 'a missing read does not reserve or initialize a checkpoint file');
    assert.ok(events.indexOf('authorize') < events.indexOf('check'), 'the full owner registry is checked before probing the scoped file');

    const selected = createTaskSelectionRecovery(scopeA, 'Alle Aufgaben', 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=all', 'native-attempt-a');
    const foreignSelected = createTaskSelectionRecovery(scopeB, 'Alle Aufgaben', 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=all', 'native-attempt-b');
    const filenameA = `vereinsflieger-task-selector-${createHash('sha256').update(canonical(validateScope(scopeA))).digest('hex')}.sqlite`;
    await assert.rejects(exports.saveTaskSelectionRecovery(scopeA, foreignSelected), /scope mismatch/);
    assert.equal(existsSync(join(directory, filenameA)), false, 'a foreign payload is rejected before the authorized scope file is created');
    assert.equal(events.filter(event => event === 'create').length, 0);

    await exports.saveTaskSelectionRecovery(scopeA, selected);
    assert.ok(existsSync(join(directory, filenameA)), 'the filename is derived from the complete validated provider scope');
    const directA = nodeDriver(join(directory, filenameA));
    try {
      assert.equal((await directA.first<{ user_version: number }>('PRAGMA user_version'))?.user_version, 1);
      assert.deepEqual((await directA.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map(row => row.name), ['pending_task_selector_restore_v1', 'task_selector_recovery_manifest_v1']);
      assert.deepEqual(await loadPendingTaskSelectionRecovery(directA, scopeA), selected, 'explicit save commits the pending record before its native adapter returns');
    }
    finally { await directA.close(); }
    assert.deepEqual(await exports.loadTaskSelectionRecovery(scopeA), selected);
    await assert.rejects(exports.saveTaskSelectionRecovery(scopeA, foreignSelected), /scope mismatch/);
    await assert.rejects(exports.clearTaskSelectionRecovery(scopeA, foreignSelected), /scope mismatch/);
    assert.deepEqual(await exports.loadTaskSelectionRecovery(scopeA), selected, 'foreign save/clear arguments cannot alter an existing authorized-scope checkpoint');
    assert.equal(await exports.loadTaskSelectionRecovery(scopeB), null, 'another authorized account receives its own empty scope');
    const filenameB = `vereinsflieger-task-selector-${createHash('sha256').update(canonical(validateScope(scopeB))).digest('hex')}.sqlite`;
    assert.notEqual(filenameA, filenameB); assert.equal(existsSync(join(directory, filenameB)), false);

    revokeAt = authorizationCalls + 3;
    await assert.rejects(exports.loadTaskSelectionRecovery(scopeA), /Unowned provider scope/);
    const evidenceDb = nodeDriver(join(directory, filenameA));
    try { assert.deepEqual(await loadPendingTaskSelectionRecovery(evidenceDb, scopeA), selected, 'a final registry recheck failure does not erase the saved selector checkpoint'); }
    finally { await evidenceDb.close(); }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

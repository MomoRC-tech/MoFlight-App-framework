import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const leaseId = '33333333-3333-4333-8333-333333333333';
const ownerRegistryName = 'moflight-real-owner-registry-v1.sqlite';
const candidateName = 'moflight-real-history-44444444-4444-4444-8444-444444444444.sqlite';
type NativeTestAdapter = {
  openOwnerRegistry(createExplicitly?: boolean): Promise<unknown>;
  createRealFlightCandidate(scope: unknown, name: string, manifest: unknown): Promise<unknown>;
  restoreRealFlightCandidate(scope: unknown, name: string, text: string): Promise<unknown>;
  openRealFlightCandidate(scope: unknown, name: string, selectionGate?: (write: boolean) => Promise<void>): Promise<unknown>;
  resumeInitialRealFlightCandidate(scope: unknown): Promise<unknown>;
  resumePreparedRealFlightCandidate(scope: unknown, operationId: string, text: string): Promise<unknown>;
  openRealFlightSelection(scope: unknown, createExplicitly?: boolean): Promise<unknown>;
  openRealFlightCommandJournal(scope: unknown, createExplicitly?: boolean): Promise<unknown>;
};
type NativeTestDependencies = {
  defaultDatabaseDirectory: string;
  file(directory: string, name: string): { readonly exists: boolean; create(options: { overwrite: boolean; intermediates: boolean }): void };
  openDriver(name: string): Promise<{ close(): Promise<void> }>;
  hash(text: string): Promise<string>;
  uuid(): string;
  now(): string;
};
const manifest = {
  singleton: 1,
  family: 'moflight-real-flight-history',
  schema_version: 1,
  payload_version: 1,
  store_id: storeId,
  owner_id: ownerId,
  created_at: '2026-10-20T10:00:00.000Z',
};

function loadAdapter(behavior: { events: string[]; fileExists?: Record<string, boolean>; emptyFiles?: Record<string, boolean>; onOpenDriver?: (name: string) => void;
  onLibraryOpen?: () => void; onLibraryCreate?: () => void; onSelectionOpen?: () => void; onJournalOpen?: () => void;
  registryError?: Error; selectionError?: Error; journalError?: Error; backupError?: Error; restoreError?: Error;
  preparation?: { operationId: string; candidateName: string; expectedGraphSha256: string; status: string };
  onBackupValidate?: () => void } = { events: [] }) {
  const { events } = behavior;
  const files = behavior.fileExists ?? {};
  const databaseNames: string[] = [];
  const closedDrivers: string[] = [];
  const libraryCalls: { mode: string; name?: string; ownerId?: string; storeId?: string; create?: boolean }[] = [];
  const createdRegistries: string[] = [];
  const openedRegistries: string[] = [];
  const selectionCalls: boolean[] = [];
  const journalCalls: boolean[] = [];
  const libraries: { close: () => Promise<void> }[] = [];
  const fakeDriver = (name: string) => ({
    first: async (sql: string) => sql === 'PRAGMA user_version'
      ? { user_version: behavior.emptyFiles?.[name] ? 0 : 1 } : null,
    close: async () => { events.push('driver-close'); closedDrivers.push(name); },
  });
  let permit: { ownerId: string; storeId: string; leaseId: string; writable: boolean } | null = {
    ownerId, storeId, leaseId, writable: true,
  };

  class FakeLibrary {
    static async restoreIntoEmptyValidated(_db: unknown, _text: string, _owner: string, _store: string, _hash: unknown,
      _authorize: unknown, _fault: unknown, gate: (write: boolean) => Promise<void>) {
      await gate(true);
      libraryCalls.push({ mode: 'resume-empty-or-exact' });
      return { close: async () => { events.push('library-close'); } };
    }
    static async create(db: unknown, value: typeof manifest, _hash: unknown, _authorize: unknown,
      _fault: unknown, gate: (write: boolean) => Promise<void>) {
      events.push('library-create');
      libraryCalls.push({ mode: 'create', name: candidateName, ownerId: value.owner_id, storeId: value.store_id });
      await gate(true);
      behavior.onLibraryCreate?.();
      const handle = { close: async () => { events.push('library-close'); } };
      libraries.push(handle);
      return handle;
    }
    static async open(_db: unknown, openOwnerId: string, openStoreId: string, _hash: unknown,
      _authorize: unknown, _fault: unknown, gate: (write: boolean) => Promise<void>) {
      events.push('library-open');
      libraryCalls.push({ mode: 'open', ownerId: openOwnerId, storeId: openStoreId });
      await gate(false);
      behavior.onLibraryOpen?.();
      const handle = { close: async () => { events.push('library-close'); } };
      libraries.push(handle);
      return handle;
    }
    static async restoreValidated(_db: unknown, text: string, openOwnerId: string, openStoreId: string,
      _hash: unknown, _authorize: unknown, _fault: unknown, gate: (write: boolean) => Promise<void>) {
      events.push('library-restore-validated');
      libraryCalls.push({ mode: 'restore', name: candidateName, ownerId: openOwnerId, storeId: openStoreId });
      assert.equal(text, 'valid-backup');
      await gate(true);
      if (behavior.restoreError) throw behavior.restoreError;
      const handle = { close: async () => { events.push('library-close'); } };
      libraries.push(handle);
      return handle;
    }
  }
  class FakeOwnerRegistry {
    static async open(db: unknown, _uuid: unknown) {
      events.push('registry-open-existing'); openedRegistries.push(ownerRegistryName);
      if (behavior.registryError) throw behavior.registryError;
      return { db, close: async () => { events.push('registry-handle-close'); } };
    }
    static async create(db: unknown, _uuid: unknown, _at: string) {
      events.push('registry-create'); createdRegistries.push(ownerRegistryName);
      if (behavior.registryError) throw behavior.registryError;
      return { db, close: async () => { events.push('registry-handle-close'); } };
    }
  }
  class FakeSelection {
    static async open(db: unknown, openOwnerId: string, openStoreId: string, _authorize: unknown,
      _opener: unknown, _hash: unknown, create: boolean) {
      events.push('selection-open'); selectionCalls.push(create);
      assert.equal(openOwnerId, ownerId); assert.equal(openStoreId, storeId);
      if (behavior.selectionError) throw behavior.selectionError;
      behavior.onSelectionOpen?.();
      return { db, getRestorePreparation: async (id: string) => behavior.preparation?.operationId === id ? behavior.preparation : null,
        close: async () => { events.push('selection-close'); await (db as { close(): Promise<void> }).close(); } };
    }
  }
  class FakeCommandJournal {
    static async open(db: unknown, openOwnerId: string, openStoreId: string, _authorize: unknown,
      _hash: unknown, create: boolean) {
      events.push('command-journal-open'); journalCalls.push(create);
      assert.equal(openOwnerId, ownerId); assert.equal(openStoreId, storeId);
      if (behavior.journalError) throw behavior.journalError;
      behavior.onJournalOpen?.();
      return { db, close: async () => { events.push('command-journal-close'); await (db as { close(): Promise<void> }).close(); } };
    }
  }

  const modules = {
    '@moflight/flight-logbook': { canonical: JSON.stringify },
    'expo-crypto': { randomUUID: () => '55555555-5555-4555-8555-555555555555' },
    'expo-file-system': { File: class {} },
    'expo-sqlite': { defaultDatabaseDirectory: 'file:///mock/sqlite' },
    '../storage': {
      hash: async () => 'a'.repeat(64),
      openDriver: async (name: string) => {
        events.push('driver-open'); databaseNames.push(name); behavior.onOpenDriver?.(name);
        return fakeDriver(name);
      },
    },
    './real-flight-native-driver': {
      openRealFlightNativeDriver: async (name: string) => {
        events.push('durable-driver-open'); databaseNames.push(name); behavior.onOpenDriver?.(name);
        return fakeDriver(name);
      },
    },
    './real-flight-command-journal': { RealFlightCommandJournal: FakeCommandJournal },
    './real-flight-library': { RealFlightLibrary: FakeLibrary },
    './real-flight-library-model': {
      validateRealFlightBackup: async (text: string, expectedOwnerId: string, expectedStoreId: string) => {
        events.push('backup-validate'); behavior.onBackupValidate?.();
        if (behavior.backupError) throw behavior.backupError;
        if (text !== 'valid-backup') throw new Error('unsupported backup');
        return { manifest: { owner_id: expectedOwnerId, store_id: expectedStoreId } };
      },
    },
    './real-history-contract': {
      realHistoryUuid(value: unknown) { if (typeof value !== 'string' || !/^[0-9a-f-]{36}$/.test(value)) throw new Error('bad uuid'); },
      validateRealHistoryCandidateName(value: unknown) {
        if (typeof value !== 'string' || !/^moflight-real-history-[0-9a-f-]{36}\.sqlite$/.test(value)) throw new Error('bad candidate name');
        return value;
      },
      validateRealHistoryManifest(value: unknown) { return value; },
    },
    './real-flight-selection': { RealFlightSelection: FakeSelection },
    './real-owner-registry': { RealOwnerRegistry: FakeOwnerRegistry },
  };
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {} as Record<string, unknown>;
  runInNewContext(source, { exports, require: (name: keyof typeof modules) => {
    assert.ok(name in modules, String(name)); return modules[name];
  } });

  const dependencies = {
    defaultDatabaseDirectory: 'file:///mock/sqlite',
    file(directory: string, name: string) {
      events.push('file-constructor');
      assert.equal(directory, 'file:///mock/sqlite');
      return {
        get exists() { events.push('file-check'); return files[name] ?? false; },
        create(options: { overwrite: boolean; intermediates: boolean }) {
          events.push('file-create'); assert.equal(options.overwrite, false); assert.equal(options.intermediates, true);
          if (files[name]) throw new Error('collision');
          files[name] = true;
        },
      };
    },
    openDriver: modules['../storage'].openDriver,
    hash: modules['../storage'].hash,
    uuid: () => '55555555-5555-4555-8555-555555555555',
    now: () => '2026-10-20T10:00:00.000Z',
  };
  const createAdapter = exports.createRealFlightNativeAdapter as (dependencies: NativeTestDependencies) => NativeTestAdapter;
  const adapter = createAdapter(dependencies);
  const scope = {
    registry: { assertCurrent: async () => { events.push('registry-assert'); } },
    lease: { version: 1, ownerId, storeId, candidateName, createdAt: '2026-10-20T10:00:00.000Z',
      selectionSeq: 1, selectedAt: '2026-10-20T10:00:00.000Z', leaseId },
    authorize: () => { events.push('authorize'); return permit; },
  };
  return { adapter, events, databaseNames, closedDrivers, libraryCalls, createdRegistries, openedRegistries,
    selectionCalls, journalCalls, libraries, files, scope, setPermit(value: typeof permit) { permit = value; } };
}

test('owner registry reads do not create missing SQLite files; explicit creation reserves the fixed filename', async () => {
  const state = loadAdapter();
  const missing = await state.adapter.openOwnerRegistry();
  assert.equal(missing, null);
  assert.deepEqual(state.databaseNames, []);
  assert.ok(!state.events.includes('file-create'));

  const created = await state.adapter.openOwnerRegistry(true);
  assert.ok(created);
  assert.deepEqual(state.databaseNames, ['moflight-real-owner-registry-v1.sqlite']);
  assert.deepEqual(state.createdRegistries, ['moflight-real-owner-registry-v1.sqlite']);
  assert.ok(state.events.indexOf('file-create') < state.events.indexOf('driver-open'));
});

test('existing unsupported owner registry is opened only for validation, closed on failure and preserved', async () => {
  const state = loadAdapter({ events: [], fileExists: { 'moflight-real-owner-registry-v1.sqlite': true }, registryError: new Error('unsupported schema') });
  await assert.rejects(state.adapter.openOwnerRegistry(true), /unsupported schema/);
  assert.deepEqual(state.openedRegistries, ['moflight-real-owner-registry-v1.sqlite']);
  assert.deepEqual(state.closedDrivers, ['moflight-real-owner-registry-v1.sqlite']);
  assert.ok(state.files['moflight-real-owner-registry-v1.sqlite']);
  assert.ok(!state.events.includes('file-create'));
});

test('candidate reads authorize before file access and never open a missing candidate database', async () => {
  const state = loadAdapter();
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, candidateName), /missing/);
  assert.ok(state.events.indexOf('authorize') < state.events.indexOf('file-constructor'));
  assert.ok(state.events.indexOf('registry-assert') < state.events.indexOf('file-check'));
  assert.deepEqual(state.databaseNames, []);
  assert.ok(!state.events.includes('file-create'));
});

test('candidate opener rejects non-generated names before touching the filesystem', async () => {
  const state = loadAdapter();
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, '../foreign.sqlite'), /candidate name/);
  assert.ok(!state.events.includes('file-constructor'));
  assert.deepEqual(state.databaseNames, []);
});

test('selection access gate runs alongside registry authorization before candidate file checks', async () => {
  const state = loadAdapter();
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, candidateName, async () => {
    state.events.push('selection-live-gate');
  }), /missing/);
  assert.ok(state.events.indexOf('selection-live-gate') < state.events.indexOf('file-check'));
  assert.ok(state.events.indexOf('registry-assert') < state.events.indexOf('selection-live-gate'));
});

test('candidate creation preserves collisions and reserves a new opaque file before SQLite open', async () => {
  const collision = loadAdapter({ events: [], fileExists: { [candidateName]: true } });
  await assert.rejects(collision.adapter.createRealFlightCandidate(collision.scope, candidateName, manifest), /preserved/);
  assert.deepEqual(collision.databaseNames, []);
  assert.ok(!collision.events.includes('file-create'));

  const fresh = loadAdapter();
  await fresh.adapter.createRealFlightCandidate(fresh.scope, candidateName, manifest);
  assert.deepEqual(fresh.databaseNames, [candidateName]);
  assert.ok(fresh.events.indexOf('registry-assert') < fresh.events.indexOf('file-check'));
  assert.ok(fresh.events.indexOf('file-create') < fresh.events.indexOf('driver-open'));
  assert.ok(fresh.events.indexOf('driver-open') < fresh.events.indexOf('library-create'));
});

test('restore rejects hostile or foreign backup before reserving a candidate', async () => {
  const invalid = loadAdapter({ events: [], backupError: new Error('Foreign real flight history backup.') });
  await assert.rejects(invalid.adapter.restoreRealFlightCandidate(invalid.scope, candidateName, 'hostile'), /Foreign real flight/);
  assert.ok(invalid.events.indexOf('authorize') < invalid.events.indexOf('backup-validate'));
  assert.deepEqual(invalid.databaseNames, []);
  assert.ok(!invalid.events.includes('file-constructor'));

  let ownerSwitched: ReturnType<typeof loadAdapter>;
  ownerSwitched = loadAdapter({ events: [], onBackupValidate: () => ownerSwitched.setPermit({
    ownerId: '99999999-9999-4999-8999-999999999999', storeId, leaseId, writable: true,
  }) });
  await assert.rejects(ownerSwitched.adapter.restoreRealFlightCandidate(ownerSwitched.scope, candidateName, 'valid-backup'), /foreign real flight owner lease/);
  assert.deepEqual(ownerSwitched.databaseNames, []);
  assert.ok(!ownerSwitched.events.includes('file-create'));
});

test('restore validates before reserving, opens a fresh candidate, and preserves a reserved file on failure', async () => {
  const fresh = loadAdapter();
  await fresh.adapter.restoreRealFlightCandidate(fresh.scope, candidateName, 'valid-backup');
  assert.ok(fresh.events.indexOf('backup-validate') < fresh.events.indexOf('file-check'));
  assert.ok(fresh.events.indexOf('file-create') < fresh.events.indexOf('driver-open'));
  assert.ok(fresh.events.indexOf('driver-open') < fresh.events.indexOf('library-restore-validated'));
  assert.deepEqual(fresh.libraryCalls.map(call => call.mode), ['restore']);

  const broken = loadAdapter({ events: [], restoreError: new Error('restore transaction failed') });
  await assert.rejects(broken.adapter.restoreRealFlightCandidate(broken.scope, candidateName, 'valid-backup'), /restore transaction failed/);
  assert.ok(broken.files[candidateName]);
  assert.deepEqual(broken.closedDrivers, [candidateName]);
});

test('owner switch during async candidate open closes the handle and leaves the file intact', async () => {
  const state = loadAdapter({
    events: [], fileExists: { [candidateName]: true },
    onOpenDriver: () => state.setPermit({ ownerId: '99999999-9999-4999-8999-999999999999', storeId, leaseId, writable: true }),
  });
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, candidateName), /foreign real flight owner lease/);
  assert.deepEqual(state.closedDrivers, [candidateName]);
  assert.deepEqual(state.libraryCalls, []);
  assert.ok(state.files[candidateName]);
});

test('owner switch after library validation closes the published handle before returning it', async () => {
  const state = loadAdapter({
    events: [], fileExists: { [candidateName]: true },
    onLibraryOpen: () => state.setPermit({ ownerId: '99999999-9999-4999-8999-999999999999', storeId, leaseId, writable: true }),
  });
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, candidateName), /foreign real flight owner lease/);
  assert.deepEqual(state.libraryCalls.map(call => call.mode), ['open']);
  assert.ok(state.events.includes('library-close'));
  assert.ok(state.files[candidateName]);
});

test('selection and command journals use fixed names, never autovivify on reads, and create only when explicit', async () => {
  const state = loadAdapter();
  assert.equal(await state.adapter.openRealFlightSelection(state.scope), null);
  assert.equal(await state.adapter.openRealFlightCommandJournal(state.scope), null);
  assert.deepEqual(state.databaseNames, []);
  assert.ok(!state.events.includes('file-create'));

  await state.adapter.openRealFlightSelection(state.scope, true);
  await state.adapter.openRealFlightCommandJournal(state.scope, true);
  assert.deepEqual(state.databaseNames, [
    'moflight-real-history-selection-v1.sqlite',
    'moflight-real-history-command-journal-v1.sqlite',
  ]);
  assert.deepEqual(state.selectionCalls, [true]);
  assert.deepEqual(state.journalCalls, [true]);
  assert.ok(state.events.filter(event => event === 'file-create').length === 2);
  assert.ok(state.events.indexOf('authorize') < state.events.indexOf('file-constructor'));
});

test('selection and command journal access reject a missing permit before touching fixed paths', async () => {
  const state = loadAdapter();
  state.setPermit(null);
  await assert.rejects(state.adapter.openRealFlightSelection(state.scope, true), /Unauthorized/);
  await assert.rejects(state.adapter.openRealFlightCommandJournal(state.scope, true), /Unauthorized/);
  assert.ok(!state.events.includes('file-constructor'));
  assert.deepEqual(state.databaseNames, []);
});

test('selection and command journal handles close when the owner lease changes during async validation', async () => {
  let selectionState: ReturnType<typeof loadAdapter>;
  selectionState = loadAdapter({ events: [], onSelectionOpen: () => selectionState.setPermit({
    ownerId: '99999999-9999-4999-8999-999999999999', storeId, leaseId, writable: true,
  }) });
  await assert.rejects(selectionState.adapter.openRealFlightSelection(selectionState.scope, true), /foreign real flight owner lease/);
  assert.deepEqual(selectionState.closedDrivers, ['moflight-real-history-selection-v1.sqlite']);
  assert.ok(selectionState.events.includes('selection-close'));
  assert.ok(selectionState.files['moflight-real-history-selection-v1.sqlite']);

  let journalState: ReturnType<typeof loadAdapter>;
  journalState = loadAdapter({ events: [], onJournalOpen: () => journalState.setPermit({
    ownerId: '99999999-9999-4999-8999-999999999999', storeId, leaseId, writable: true,
  }) });
  await assert.rejects(journalState.adapter.openRealFlightCommandJournal(journalState.scope, true), /foreign real flight owner lease/);
  assert.deepEqual(journalState.closedDrivers, ['moflight-real-history-command-journal-v1.sqlite']);
  assert.ok(journalState.events.includes('command-journal-close'));
  assert.ok(journalState.files['moflight-real-history-command-journal-v1.sqlite']);
});

test('existing selection and command journals are opened without reset and failed opens close but preserve files', async () => {
  const files = {
    'moflight-real-history-selection-v1.sqlite': true,
    'moflight-real-history-command-journal-v1.sqlite': true,
  };
  const state = loadAdapter({ events: [], fileExists: files, selectionError: new Error('unsupported selection schema'), journalError: new Error('unsupported command schema') });
  await assert.rejects(state.adapter.openRealFlightSelection(state.scope, true), /unsupported selection schema/);
  await assert.rejects(state.adapter.openRealFlightCommandJournal(state.scope, true), /unsupported command schema/);
  assert.deepEqual(state.databaseNames, [
    'moflight-real-history-selection-v1.sqlite',
    'moflight-real-history-command-journal-v1.sqlite',
  ]);
  assert.deepEqual(state.selectionCalls, [false]);
  assert.deepEqual(state.journalCalls, [false]);
  assert.deepEqual(state.closedDrivers, state.databaseNames);
  assert.deepEqual(state.events.filter(event => event === 'file-create'), []);
  assert.ok(files['moflight-real-history-selection-v1.sqlite']);
  assert.ok(files['moflight-real-history-command-journal-v1.sqlite']);
});

test('reserved empty registry and journals require explicit setup continuation without replacing files', async () => {
  const selectionName = 'moflight-real-history-selection-v1.sqlite';
  const commandsName = 'moflight-real-history-command-journal-v1.sqlite';
  const files = { [ownerRegistryName]: true, [selectionName]: true, [commandsName]: true };
  const state = loadAdapter({ events: [], fileExists: files, emptyFiles: { ...files } });
  await assert.rejects(state.adapter.openOwnerRegistry(false), /explicit setup continuation/);
  await assert.rejects(state.adapter.openRealFlightSelection(state.scope, false), /explicit setup continuation/);
  await assert.rejects(state.adapter.openRealFlightCommandJournal(state.scope, false), /explicit setup continuation/);
  assert.equal(state.createdRegistries.length, 0);
  assert.deepEqual(state.selectionCalls, []); assert.deepEqual(state.journalCalls, []);
  assert.deepEqual(state.closedDrivers, [ownerRegistryName, selectionName, commandsName]);
  await state.adapter.openOwnerRegistry(true);
  await state.adapter.openRealFlightSelection(state.scope, true);
  await state.adapter.openRealFlightCommandJournal(state.scope, true);
  assert.equal(state.createdRegistries.length, 1);
  assert.deepEqual(state.selectionCalls, [true]); assert.deepEqual(state.journalCalls, [true]);
  assert.equal(state.events.includes('file-create'), false);
  assert.ok(Object.values(files).every(Boolean));
});

test('explicit initial-candidate continuation initializes a reserved empty file and enforces its current lease', async () => {
  const state = loadAdapter({ events: [], fileExists: { [candidateName]: true }, emptyFiles: { [candidateName]: true } });
  await assert.rejects(state.adapter.openRealFlightCandidate(state.scope, candidateName), /explicit setup continuation/);
  assert.equal(state.libraryCalls.length, 0);
  await state.adapter.resumeInitialRealFlightCandidate(state.scope);
  assert.deepEqual(state.libraryCalls.map(call => call.mode), ['create']);
  assert.equal(state.events.includes('file-create'), false);
  state.setPermit(null);
  const opened = state.databaseNames.length;
  await assert.rejects(state.adapter.resumeInitialRealFlightCandidate(state.scope), /Unauthorized/);
  assert.equal(state.databaseNames.length, opened);
  assert.equal(state.files[candidateName], true);
});

test('prepared restore retry uses only its recorded candidate and rejects foreign or stale operations before opening it', async () => {
  const operationId = '66666666-6666-4666-8666-666666666666';
  const preparation = { operationId, candidateName, expectedGraphSha256: 'a'.repeat(64), status: 'pending' };
  const selectionName = 'moflight-real-history-selection-v1.sqlite';
  for (const empty of [true, false]) {
    const state = loadAdapter({ events: [], preparation, fileExists: { [selectionName]: true, [candidateName]: true },
      emptyFiles: { [candidateName]: empty } });
    await state.adapter.resumePreparedRealFlightCandidate(state.scope, operationId, 'valid-backup');
    assert.deepEqual(state.libraryCalls.map(call => call.mode), [empty ? 'restore' : 'resume-empty-or-exact']);
    assert.equal(state.events.includes('file-create'), false);
    assert.equal(state.files[candidateName], true);
  }
  for (const input of [{ ...preparation, status: 'stale' }, { ...preparation, operationId: leaseId }]) {
    const state = loadAdapter({ events: [], preparation: input, fileExists: { [selectionName]: true, [candidateName]: true } });
    await assert.rejects(state.adapter.resumePreparedRealFlightCandidate(state.scope, operationId, 'valid-backup'), /foreign, stale/);
    assert.equal(state.databaseNames.includes(candidateName), false);
  }
});

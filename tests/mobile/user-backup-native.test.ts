import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PilotBooks } from '../../packages/local-data/src/books.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { validateInformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import * as realModel from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import * as backup from '../../apps/platform-lab/src/user-backup.ts';
import { encodeChatArchive, type ChatArchive } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { financialTarget, financialObservation } from './fixtures/expense-capture.ts';
import type { UserBackupServicePorts } from '../../apps/platform-lab/src/user-backup-service.ts';

const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const connectionId = '33333333-3333-4333-8333-333333333333';
const at = '2026-10-25T10:00:00.000Z';
const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const providerScope: ProviderScope = { version: 1, owner: ownerId, connectionId,
  context: { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/user-backup-native.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

async function fixture() {
  // Real store exports and the real aggregate codec; only native orchestration leaves are replaced.
  const pilot = new PilotBooks(nodeDriver(':memory:'), 'synthetic-pilot', hash);
  let pilotBackup: string;
  try {
    await pilot.initialize();
    for (const id of ['first', 'selected']) await pilot.createBook({ id, owner: 'synthetic-pilot', name: id,
      format: 'synthetic-powered-five-row-v1', classes: ['glider'], from: '2020-01-01', through: null });
    await pilot.saveState('selected', 'pending', { draft: 'Synthetic pending writing' });
    await pilot.saveState('selected', 'photo', { reference: 'local-photo.jpg' });
    pilotBackup = await pilot.backup();
  } finally { await pilot.db.close(); }
  const permit = { ownerId, storeId, leaseId: connectionId, writable: true };
  const real = await RealFlightLibrary.create(nodeDriver(':memory:'), { singleton: 1, family: 'moflight-real-flight-history',
    schema_version: 1, payload_version: 1, owner_id: ownerId, store_id: storeId, created_at: at }, hash, () => permit);
  let realBackup: string;
  try {
    const window = { from: '2026-10-01', to: '2026-10-25', participation: 'Pilot oder Fluglehrer' as const };
    const input = { version: 1 as const, binding: { provider: 'vereinsflieger' as const, accountRef: '12345' },
      contextBefore: providerScope.context, contextAfter: providerScope.context, requestedWindow: window,
      capture: { captureId: 'synthetic-flights', retrievedAt: at, headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'],
        rows: [{ values: ['20.10.2026', 'D-TEST', '09:00', '10:00', '1:00', 'Synthetic pilot'], sourceFlightId: '1' }],
        sourceIdentity: 'unverified' as const, coverage: 'complete-requested-list' as const, timeBasis: 'unknown' as const,
        exportContext: { ...window, preset: 'Konfiguration laden', accountLabel: 'Synthetic account', recordCount: 1, pageCount: 1,
          columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 as const } } };
    await real.bindAccount({ kind: 'bind', commandId: ownerId, baseGeneration: 0, source: input, at });
    const plan = await real.prepareImport(input);
    await real.saveUnassigned({ kind: 'import-unassigned', commandId: storeId, baseGeneration: plan.baseGeneration,
      bindingId: plan.bindingId, source: input, planToken: plan.planToken, at });
    realBackup = await real.exportBackup();
  } finally { await real.close(); }
  const info = new InformationStore(nodeDriver(':memory:'), providerScope, async () => {});
  let infoBackup: string;
  try {
    await info.initialize();
    await info.save(validateInformationCapture({ version: 1, id: 'synthetic-medical', retrievedAt: at, owner: ownerId,
      connectionId, sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
      columns: [{ key: 'kind', label: 'Medical-Art', index: 0 }, { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 }],
      rows: [{ position: 1, values: ['Synthetic class', '31.12.2027'] }],
      filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } }));
    infoBackup = await info.exportBackup(hash);
  } finally { await info.db.close(); }
  const chat: ChatArchive = { ...backup.emptyUserChatArchive(ownerId), activitySequence: 1,
    identity: { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '12345', observedAt: at,
      provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } },
    conversations: [{ version: 1, id: 'synthetic-chat', ownerId, title: 'Synthetic chat', draft: 'Offline draft', context: null,
      activitySequence: 1, updatedAt: at, messages: [] }] };
  const state = { pending: false, authorized: true, permission: true, directoryUri: 'folder:',
    corruptReadback: false, profileFailure: false, closes: 0, loads: 0, realReads: 0, chatReads: 0,
    selectedBook: 'selected', informationScope: providerScope as ProviderScope | null,
    financial: { state: 'absent' } as backup.UserFinancialBackup, financialReads: 0, financialFailure: false, revokeOnCodecHash: false,
    restorePorts: null as UserBackupServicePorts | null, financialScope: null as unknown,
    financialRestore: null as unknown, financialPreflight: null as unknown };
  const files = new Map<string, string>();
  let nextFile = 0;
  const io = {
    async requestDirectory() { return { granted: state.permission, directoryUri: state.directoryUri }; },
    async createFolderFile(directory: string, name: string, mime: string) {
      assert.equal(directory, 'folder:'); assert.equal(mime, 'application/json');
      const uri = `${directory}/${name}`; files.set(uri, ''); return uri;
    },
    async writeFolderFile(uri: string, text: string) { files.set(uri, text); },
    async readFolderFile(uri: string) { return state.corruptReadback ? 'corrupt external bytes' : files.get(uri)!; },
  };
  const modules: Record<string, unknown> = {
    'expo-file-system': { File: class {} }, 'expo-sqlite': { defaultDatabaseDirectory: 'synthetic:' },
    './duty-target-native': { withDutyTargetLock: (work:()=>Promise<unknown>) => work(), async exportDutyTargetsNative(scope:unknown) { return {scope,targets:[{year:2025,hours:0},{year:2026,hours:37.5}]}; } },
    './vereinsflieger/real-flight-library-model': realModel,
    './storage': { async hash(text: string) { const value = await hash(text); if (state.financialReads && state.revokeOnCodecHash) state.authorized = false; return value; } }, './user-backup': backup, './user-backup-service': { async restoreUserBackup(_owner: string, _store: string, _gate: unknown, ports: UserBackupServicePorts) {
      state.restorePorts = ports; return { state: 'cancelled' };
    } },
    './vereinsflieger/expense-native': { financialNative: {
      async exportSection() { state.financialReads++; if (state.financialFailure) throw new Error('Financial file unavailable'); return state.financial; },
      async currentTarget(scope: unknown) { state.financialScope = scope; return financialTarget; },
      async preflight(scope: unknown, section: unknown, gate: () => Promise<void>) { await gate(); state.financialScope = scope; state.financialPreflight = section; },
      async restore(scope: unknown, section: unknown, permit: unknown, gate: () => Promise<void>) { await gate(); state.financialScope = scope; state.financialRestore = { section, permit }; },
    } },
    './book-storage': {
      async loadBooks() {
        state.loads++;
        return { name: 'synthetic.sqlite', lib: { owner: 'synthetic-pilot', db: { async close() { state.closes++; } },
          async books() { return [{ id: 'first' }, { id: 'selected' }]; }, async backup() { return pilotBackup; } } };
      },
      async rememberedBook() { return state.selectedBook; },
    },
    './mobile/local-profile': { async readLocalDisplayName() {
      if (state.profileFailure) throw new Error('Synthetic profile read failure');
      return 'Synthetic custom name';
    } },
    './vereinsflieger/real-flight-backup-native': { async createRealFlightBackupDependencies() {
      return { io, uuid: () => `00000000-0000-4000-8000-${String(++nextFile).padStart(12, '0')}` };
    } },
    './vereinsflieger/scoped-storage': { async loadProviderScope() { return state.informationScope; } },
    './vereinsflieger/information-native': { async exportInformationBackup(scope: ProviderScope) {
      assert.equal(scope.owner, ownerId); return infoBackup;
    } },
    './user-backup-restore-journal-native': { async assertNoPendingUserBackupRestore() {
      if (state.pending) throw new Error('Synthetic aggregate restore pending');
    } },
    './ai/chat-native': { async readOwnerChatArchiveNative() { state.chatReads++; return chat; } },
    './ai/chat-model': { encodeChatArchive },
  };
  const api = {} as typeof import('../../apps/platform-lab/src/user-backup-native.ts');
  runInNewContext(source, { exports: api, TextEncoder, require: (name: string) => {
    assert.ok(name in modules, name); return modules[name];
  } });
  const scope = { lease: permit, authorize: () => state.authorized ? permit : null } as unknown as Parameters<typeof api.exportUserBackupNative>[0];
  const service = { ownerId, storeId, async exportBackup() { state.realReads++; return realBackup; } } as Parameters<typeof api.exportUserBackupNative>[1];
  return { api, scope, service, state, files, pilotBackup, realBackup, infoBackup, chat };
}

test('native aggregate export preserves selected profile/book, pending state, Medical, AI and v3 duty targets', async () => {
  const f = await fixture();
  const text = await f.api.exportUserBackupNative(f.scope, f.service, async () => {});
  const value = await backup.validateUserBackup(text, { ownerId, storeId, informationScope: providerScope }, hash);
  assert.equal(value.version, 3);
  if (value.version === 3) assert.deepEqual(JSON.parse(JSON.stringify(value.dutyTargets.targets)), [{year:2025,hours:0},{year:2026,hours:37.5}]);
  assert.equal(value.pilot.displayName, 'Synthetic custom name');
  assert.equal(value.pilot.selectedBookId, 'selected');
  assert.equal(value.pilot.backup, f.pilotBackup);
  const pilot = JSON.parse(JSON.parse(value.pilot.backup).payload) as { state: Array<{ kind: string; payload: string }> };
  assert.deepEqual(JSON.parse(pilot.state.find(row => row.kind === 'photo')!.payload), { reference: 'local-photo.jpg' },
    'the JSON archive retains only the existing text reference, not the external photo file');
  assert.equal(value.realFlights.backup, f.realBackup);
  assert.equal(value.information?.backup, f.infoBackup);
  assert.equal(value.version === 3 && value.ai.archive, encodeChatArchive(f.chat));
  assert.equal(f.state.closes, 1);
});

test('pending restore, unavailable owner and foreign service refuse export before store reads', async () => {
  const f = await fixture();
  f.state.pending = true;
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {}), /restore pending/);
  f.state.pending = false; f.state.authorized = false;
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {}), /lease/);
  f.state.authorized = true;
  await assert.rejects(f.api.exportUserBackupNative(f.scope, { ...f.service, storeId: connectionId }, async () => {}), /Foreign/);
  assert.equal(f.state.loads, 0); assert.equal(f.state.realReads, 0); assert.equal(f.state.chatReads, 0);
});

test('pilot read failure or stale selected book closes the library and prevents later store reads', async () => {
  const f = await fixture();
  f.state.profileFailure = true;
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {}), /profile read failure/);
  f.state.profileFailure = false; f.state.selectedBook = 'missing';
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {}), /Selected pilot book/);
  assert.equal(f.state.closes, 2); assert.equal(f.state.realReads, 0);
});

test('foreign information scope and owner revocation during export never produce an archive', async () => {
  const f = await fixture();
  f.state.informationScope = { ...providerScope, owner: connectionId };
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {}), /Foreign selected information/);
  assert.equal(f.state.chatReads, 0); assert.equal(f.state.closes, 1);
  f.state.informationScope = providerScope;
  await assert.rejects(f.api.exportUserBackupNative(f.scope, f.service, async () => {
    if (f.state.chatReads) f.state.authorized = false;
  }), /lease/);
  assert.equal(f.state.closes, 2);
});

test('folder cancellation and missing granted directory cannot create files or read user stores', async () => {
  const f = await fixture(); f.state.permission = false;
  assert.equal((await f.api.saveUserBackupToFolder(f.scope, f.service, async () => {})).state, 'cancelled');
  f.state.permission = true; f.state.directoryUri = '';
  await assert.rejects(f.api.saveUserBackupToFolder(f.scope, f.service, async () => {}), /folder is unavailable/);
  assert.equal(f.files.size, 0); assert.equal(f.state.loads, 0);
});

test('external aggregate save reports success only after exact file readback and SHA-256 verification', async () => {
  const f = await fixture();
  const result = await f.api.saveUserBackupToFolder(f.scope, f.service, async () => {});
  assert.equal(result.state, 'saved');
  if (result.state !== 'saved') throw new Error('Expected external save');
  const text = f.files.get(`folder:/${result.fileName}`)!;
  assert.equal(result.sha256, await hash(text));
  assert.equal((await backup.validateUserBackup(text, { ownerId, storeId, informationScope: providerScope }, hash)).version, 3);
  f.state.corruptReadback = true;
  await assert.rejects(f.api.saveUserBackupToFolder(f.scope, f.service, async () => {}), /External user backup verification failed/);
  assert.equal(f.files.size, 2);
  assert.equal(f.files.get(`folder:/${result.fileName}`), text, 'a failed later save preserves the previous verified external backup');
});

test('consecutive external saves preserve every verified archive and the same supported snapshot', async () => {
  const f = await fixture();
  const saved: string[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await f.api.saveUserBackupToFolder(f.scope, f.service, async () => {});
    assert.equal(result.state, 'saved');
    if (result.state !== 'saved') throw new Error('Expected external save');
    const text = f.files.get(`folder:/${result.fileName}`)!;
    assert.equal(await hash(text), result.sha256);
    const value = await backup.validateUserBackup(text, { ownerId, storeId, informationScope: providerScope }, hash);
    assert.equal(value.pilot.backup, f.pilotBackup);
    assert.equal(value.realFlights.backup, f.realBackup);
    assert.equal(value.information?.backup, f.infoBackup);
    saved.push(text);
    assert.deepEqual([...f.files.values()], saved);
  }
  assert.equal(f.state.closes, 3);
});

test('native export selects v4 only for an existing financial store and preserves exact raw receipts', async () => {
  const f = await fixture(), db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, financialTarget, hash, async () => {});
  try {
    await store.initialize(true);
    for (const populated of [false, true]) {
      if (populated) await store.save('own-fee', 'billed-flight', financialObservation());
      f.state.financial = { state: populated ? 'present' : 'empty', target: financialTarget, archive: await store.exportBackup() };
      const result = await f.api.saveUserBackupToFolder(f.scope, f.service, async () => {});
      assert.equal(result.state, 'saved'); if (result.state !== 'saved') throw Error('Expected external save');
      const value = await backup.validateUserBackup(f.files.get(`folder:/${result.fileName}`)!, {
        ownerId, storeId, informationScope: providerScope, financialTarget,
      }, hash);
      assert.equal(value.version, 4);
      if (value.version === 4) assert.deepEqual(JSON.parse(JSON.stringify(value.financial)), f.state.financial);
    }
    f.state.financial = { state: 'absent' };
    assert.equal((await backup.validateUserBackup(await f.api.exportUserBackupNative(f.scope, f.service, async () => {}), {
      ownerId, storeId, informationScope: providerScope,
    }, hash)).version, 3);
  } finally { await db.close(); }
});

test('unreadable financial state refuses export rather than silently producing a partial v3 file', async () => {
  const f = await fixture(); f.state.financialFailure = true;
  await assert.rejects(f.api.saveUserBackupToFolder(f.scope, f.service, async () => {}), /Financial file unavailable/);
  assert.equal(f.files.size, 0);
});

test('owner revocation during aggregate encoding refuses publication and creates no external file', async () => {
  const f = await fixture(); f.state.revokeOnCodecHash = true;
  await assert.rejects(f.api.saveUserBackupToFolder(f.scope, f.service, async () => {}), /lease/);
  assert.equal(f.state.financialReads, 1); assert.equal(f.files.size, 0);
});

test('native financial restore ports forward the current target, recovery operation and owner gates', async () => {
  const f = await fixture(); let gates = 0;
  const operationId = '55555555-5555-4555-8555-555555555555';
  assert.equal((await f.api.restoreUserBackupFromPickerNative(f.scope, async () => { gates++; }, operationId)).state, 'cancelled');
  const ports = f.state.restorePorts!.financial!;
  assert.deepEqual(await ports.currentTarget(ownerId, storeId), financialTarget);
  assert.equal((f.state.financialScope as { backupRestoreOperationId: string }).backupRestoreOperationId, operationId);
  await assert.rejects(ports.currentTarget(ownerId, connectionId), /Foreign financial/);
  const section = { state: 'empty' as const, target: financialTarget, archive: 'validated upstream' };
  await ports.preflight(section, async () => { gates++; }); assert.equal(f.state.financialPreflight, section);
  const permit = { operationId, ownerId, storeId };
  await ports.restore({ section, permit }, async () => { gates++; });
  assert.equal(JSON.stringify(f.state.financialRestore), JSON.stringify({ section, permit })); assert.ok(gates >= 5);
});

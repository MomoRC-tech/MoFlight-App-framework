import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Hash } from '../../packages/local-data/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { RealFlightLibrary, type RealFlightPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { REAL_HISTORY_BACKUP_LIMIT, type RealHistoryManifest } from '../../apps/platform-lab/src/vereinsflieger/real-history-contract.ts';
import { restoreRealFlightBackup, saveRealFlightBackupToFolder, type RealFlightBackupDependencies,
  type RealFlightBackupIo } from '../../apps/platform-lab/src/vereinsflieger/real-flight-backup-native.ts';
import type { RealFlightNativeScope } from '../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import { RealFlightSelection, type RealCandidateOpener } from '../../apps/platform-lab/src/vereinsflieger/real-flight-selection.ts';
import { RealFlightService } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';

const ownerId = '11111111-1111-4111-8111-111111111111';
const storeId = '22222222-2222-4222-8222-222222222222';
const ownerB = '33333333-3333-4333-8333-333333333333';
const storeB = '44444444-4444-4444-8444-444444444444';
const leaseId = '55555555-5555-4555-8555-555555555555';
const at = '2026-10-20T10:00:00.000Z';
const hash: Hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');
const commandId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const oldCandidate = 'moflight-real-history-66666666-6666-4666-8666-666666666666.sqlite';

function manifest(owner: string, store: string): RealHistoryManifest {
  return { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1, payload_version: 1,
    store_id: store, owner_id: owner, created_at: at };
}
function source(captureId: string, reference: string | null): RealFlightSourceInput {
  const context = { accountNumber: '12345', clubLabel: 'Example club', clubIdentity: 'display-label-only' as const,
    verification: 'observed-profile-number' as const };
  const window = { from: '2026-10-01', to: '2026-10-20', participation: 'Pilot oder Fluglehrer' as const };
  const headers = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'];
  const rows = reference === null ? [] : [{ values: ['20.10.2026', 'D-TEST', '09:00', '10:00', '1:00', 'Synthetic pilot'], sourceFlightId: reference }];
  return { version: 1, binding: { provider: 'vereinsflieger', accountRef: '12345' },
    contextBefore: { ...context }, contextAfter: { ...context }, requestedWindow: window,
    capture: { captureId, retrievedAt: at, headers, rows, sourceIdentity: 'unverified',
      coverage: 'complete-requested-list', timeBasis: 'unknown',
      exportContext: { ...window, preset: 'Konfiguration laden', accountLabel: 'Synthetic account',
        recordCount: rows.length, pageCount: 1, columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } } };
}

async function makeBackup(owner = ownerId, store = storeId): Promise<string> {
  let permit: RealFlightPermit = { ownerId: owner, storeId: store, leaseId, writable: true };
  const authorize = () => permit;
  const library = await RealFlightLibrary.create(nodeDriver(':memory:'), manifest(owner, store), hash, authorize);
  try {
    const bindingSource = source(`binding-${owner.slice(0, 4)}`, '1001');
    await library.bindAccount({ kind: 'bind', commandId: commandId(1), baseGeneration: 0, source: bindingSource, at });
    const input = source(`flights-${owner.slice(0, 4)}`, '1001');
    const plan = await library.prepareImport(input);
    await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(2), baseGeneration: plan.baseGeneration,
      bindingId: plan.bindingId, source: input, planToken: plan.planToken, at });
    return await library.exportBackup();
  } finally { await library.close(); }
}

const ownerBackup = await makeBackup();
const foreignBackup = await makeBackup(ownerB, storeB);

function makeScope(writable = true) {
  const calls: string[] = [];
  const scope = {
    registry: { assertCurrent: async (_lease: unknown, owner: string, store: string) => {
      calls.push('registry-assert'); assert.equal(owner, ownerId); assert.equal(store, storeId);
    } },
    lease: { version: 1, ownerId, storeId, candidateName: oldCandidate, createdAt: at,
      selectionSeq: 1, selectedAt: at, leaseId },
    authorize: () => ({ ownerId, storeId, leaseId, writable }),
  } as unknown as RealFlightNativeScope;
  return { scope, calls };
}

function makeIo(options: { picked?: string; canceled?: boolean; size?: number | null; readTransform?: (value: string) => string;
  onPick?: () => void; pending?: boolean; folderGranted?: boolean } = {}) {
  const files = new Map<string, string>();
  const readUris: string[] = [];
  const io: RealFlightBackupIo = {
    requestDirectory: async () => ({ granted: options.folderGranted ?? true, directoryUri: 'folder://selected' }),
    createFolderFile: async (_folder, name) => { const uri = `folder://selected/${name}`; files.set(uri, ''); return uri; },
    writeFolderFile: async (uri, text) => { files.set(uri, text); },
    readFolderFile: async uri => options.readTransform?.(files.get(uri) ?? '') ?? files.get(uri) ?? '',
    pickBackup: async () => {
      options.onPick?.();
      return options.canceled ? { canceled: true } : { canceled: false,
        assets: [{ uri: 'cache://picked-backup.json', size: options.size ?? null }] };
    },
    readPickedFile: async uri => { readUris.push(uri); return options.picked ?? ownerBackup; },
  };
  return { io, files, readUris };
}

function makeNative(scope: RealFlightNativeScope, options: { pending?: boolean; activationError?: Error; unreadable?: boolean;
  publicationUnreadable?: boolean } = {}) {
  const events: string[] = [];
  const candidates = new Set([oldCandidate]);
  const createdCandidates: string[] = [];
  const preparations = new Map<string, { operationId:string; candidateName:string; expectedGraphSha256:string; previousSequence:number|null;
    preparedAt:string; status:'pending'|'stale'|'activated'; activatedSequence:number|null }>();
  const otherFiles = new Set(['moflight-real-history-77777777-7777-4777-8777-777777777777.sqlite',
    'moflight-session-capture-v1.sqlite', 'moflight-pilot-books.sqlite']);
  let activeName = oldCandidate, sequence = 4;
  let activationError = options.activationError;
  const permit: RealFlightPermit = { ownerId, storeId, leaseId, writable: true };
  const openBackupLibrary = async (text: string) => RealFlightLibrary.restoreValidated(nodeDriver(':memory:'), text,
    ownerId, storeId, hash, () => permit);
  const native = {
    openRealFlightSelection: async () => {
      events.push('open-selection');
      const name = activeName, seq = sequence;
      return {
        select: async () => ({ candidate: await openBackupLibrary(ownerBackup), name, sequence: seq,
          recoveryRequired: false, warning: null }),
        inspect: async () => options.unreadable && (activeName === oldCandidate || options.publicationUnreadable)
          ? {state:'unreadable',headSequence:sequence,selected:null,preparations:[...preparations.values()],warning:'No readable retained candidate.'}
          : {state:options.unreadable ? 'recovery-required' : 'selected',headSequence:sequence,
            selected:{candidate:await openBackupLibrary(ownerBackup),name:activeName,sequence,selectedAt:at,
              recoveryRequired:options.unreadable ?? false,warning:options.unreadable ? 'Retained history is unreadable.' : null},
            preparations:[...preparations.values()]},
        listRestorePreparations: async () => [...preparations.values()],
        getRestorePreparation: async (operationId: string) => preparations.get(operationId) ?? null,
        prepareRestore: async (input: { operationId:string; candidateName:string; expectedGraphSha256:string; previousSequence:number|null; preparedAt:string }) => {
          events.push('prepare');
          assert.equal(input.previousSequence,seq);
          const value = { ...input, status:'pending' as const, activatedSequence:null };
          preparations.set(input.operationId,value); return value;
        },
        activatePreparedRestore: async (activationId: string) => {
          events.push('activate');
          assert.match(activationId, /^[0-9a-f-]{36}$/);
          const preparation = preparations.get(activationId);
          assert.ok(preparation); assert.equal(preparation?.previousSequence, seq);
          if (activationError) throw activationError;
          if (!candidates.has(preparation!.candidateName)) throw new Error('candidate is missing');
          const validation = await openBackupLibrary(ownerBackup);
          await validation.close();
          activeName = preparation!.candidateName; sequence++; preparation!.status = 'activated'; preparation!.activatedSequence = sequence; return sequence;
        },
        close: async () => { events.push('selection-close'); },
      };
    },
    openRealFlightCommandJournal: async () => {
      events.push('open-journal');
      if (!options.pending) return null;
      return { pending: async () => ({ kind: 'bind' }), close: async () => { events.push('journal-close'); } };
    },
    restoreRealFlightCandidate: async (_scope: RealFlightNativeScope, name: string, text: string) => {
      events.push('restore-candidate');
      candidates.add(name);
      createdCandidates.push(name);
      return openBackupLibrary(text);
    },
    openRealFlightCandidate: async (_scope: RealFlightNativeScope, name: string) => {
      events.push('reopen-candidate');
      if (!candidates.has(name)) throw new Error('Real flight candidate is missing; preserved for recovery.');
      return openBackupLibrary(ownerBackup);
    },
    resumePreparedRealFlightCandidate: async (_scope: RealFlightNativeScope, operationId: string, text: string) => {
      events.push('resume-candidate');
      const preparation = preparations.get(operationId);
      assert.ok(preparation, 'resume uses a durable restore preparation');
      assert.equal(preparation?.status, 'pending');
      assert.ok(candidates.has(preparation!.candidateName), 'resume retains and populates the reserved candidate');
      return openBackupLibrary(text);
    },
  };
  const state = { native, events, candidates, createdCandidates, otherFiles, preparations,
    setActivationError(error?: Error) { activationError = error; },
    changeSelection(name: string, nextSequence: number) { activeName = name; sequence = nextSequence; candidates.add(name); },
    get active() { return { name: activeName, sequence }; } };
  return state;
}

function dependencies(io: RealFlightBackupIo, native: ReturnType<typeof makeNative>['native']): RealFlightBackupDependencies {
  const ids = ['88888888-8888-4888-8888-888888888888', '99999999-9999-4999-8999-999999999999'];
  return { io, native: native as never, hash, uuid: () => ids.shift() ?? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now: () => at };
}
const allow = async () => {};

test('folder save observes cancellation and verifies exact bytes and digest without sharing', async () => {
  let exports = 0;
  const service = { ownerId, storeId, exportBackup: async () => { exports++; return ownerBackup; } };
  const canceledIo = makeIo({ folderGranted: false });
  const canceledDeps = dependencies(canceledIo.io, makeNative(makeScope().scope).native);
  const canceledPhases: string[] = [];
  assert.deepEqual(await saveRealFlightBackupToFolder(service, async phase => { canceledPhases.push(phase); }, canceledDeps), { state: 'cancelled' });
  assert.deepEqual(canceledPhases, ['before-picker', 'after-picker']);
  assert.equal(exports, 0); assert.equal(canceledIo.files.size, 0);

  const io = makeIo();
  const phases: string[] = [];
  const saved = await saveRealFlightBackupToFolder(service, async phase => { phases.push(phase); }, dependencies(io.io, makeNative(makeScope().scope).native));
  assert.equal(saved.state, 'saved');
  if (saved.state === 'saved') {
    assert.match(saved.fileName, /^moflight-real-flight-backup-[0-9a-f-]{36}\.json$/);
    assert.equal(saved.sha256, await hash(ownerBackup));
    assert.equal([...io.files.values()][0], ownerBackup);
  }
  assert.deepEqual(phases, ['before-picker', 'after-picker', 'before-export', 'before-write', 'after-write', 'before-read', 'after-read']);
  assert.equal(exports, 1);

  const failedIo = makeIo({ readTransform: text => text + ' ' });
  await assert.rejects(saveRealFlightBackupToFolder(service, allow, dependencies(failedIo.io, makeNative(makeScope().scope).native)), /verification failed/);
  assert.equal(failedIo.files.size, 1, 'a failed readback leaves the selected file in place for recovery');
});

test('hostile, unsupported, foreign-owner and oversized picked backups fail before candidate creation', async () => {
  for (const picked of ['{"format":"other","version":9}', foreignBackup]) {
    const { scope } = makeScope(); const io = makeIo({ picked }); const native = makeNative(scope);
    await assert.rejects(restoreRealFlightBackup(scope, allow, dependencies(io.io, native.native)));
    assert.deepEqual([...native.candidates], [oldCandidate]);
    assert.ok(!native.events.includes('restore-candidate'));
  }
  const { scope } = makeScope(); const oversizedIo = makeIo({ size: REAL_HISTORY_BACKUP_LIMIT + 1 }); const oversizedNative = makeNative(scope);
  await assert.rejects(restoreRealFlightBackup(scope, allow, dependencies(oversizedIo.io, oversizedNative.native)), /128 MiB/);
  assert.deepEqual(oversizedIo.readUris, []);
  assert.ok(!oversizedNative.events.includes('restore-candidate'));
});

test('restore cancellation, pending journal, and owner recovery preserve existing inventory', async () => {
  const { scope } = makeScope();
  const io = makeIo({ canceled: true }); const native = makeNative(scope);
  assert.deepEqual(await restoreRealFlightBackup(scope, allow, dependencies(io.io, native.native)), { state: 'cancelled' });
  assert.deepEqual([...native.candidates], [oldCandidate]);
  assert.equal(native.active.name, oldCandidate);
  assert.ok(native.otherFiles.has('moflight-session-capture-v1.sqlite'));
  assert.ok(native.otherFiles.has('moflight-pilot-books.sqlite'));

  const pendingNative = makeNative(scope, { pending: true }); const pendingIo = makeIo();
  await assert.rejects(restoreRealFlightBackup(scope, allow, dependencies(pendingIo.io, pendingNative.native)), /pending real flight command/);
  assert.equal(pendingNative.events.includes('restore-candidate'), false);
  assert.equal(pendingIo.readUris.length, 0);

  const readOnly = makeScope(false); const readOnlyNative = makeNative(readOnly.scope); const readOnlyIo = makeIo();
  await assert.rejects(restoreRealFlightBackup(readOnly.scope, allow, dependencies(readOnlyIo.io, readOnlyNative.native)), /Unauthorized/);
  assert.equal(readOnlyIo.readUris.length, 0);
  assert.deepEqual([...readOnlyNative.candidates], [oldCandidate]);
});

test('restore reopens and reads a fresh candidate before explicit predecessor activation; activation failure retains it', async () => {
  const { scope } = makeScope(); const io = makeIo(); const native = makeNative(scope);
  const result = await restoreRealFlightBackup(scope, allow, dependencies(io.io, native.native));
  assert.equal(result.state, 'restored');
  if (result.state === 'restored') {
    assert.equal(result.selection.sequence, 5);
    assert.equal(result.snapshot.generation, 2);
    assert.equal(result.snapshot.flightCount, 1);
    assert.equal(result.selection.name, result.fileName);
    assert.match(result.fileName, /^moflight-real-history-[0-9a-f-]{36}\.sqlite$/);
  }
  assert.ok(native.events.indexOf('restore-candidate') < native.events.indexOf('reopen-candidate'));
  assert.ok(native.events.indexOf('reopen-candidate') < native.events.indexOf('activate'));
  assert.ok(native.events.indexOf('prepare') < native.events.indexOf('restore-candidate'));
  assert.deepEqual(native.createdCandidates, [result.state === 'restored' ? result.fileName : '']);
  assert.deepEqual([...native.otherFiles], ['moflight-real-history-77777777-7777-4777-8777-777777777777.sqlite',
    'moflight-session-capture-v1.sqlite', 'moflight-pilot-books.sqlite']);

  const failure = new Error('activation transaction failed');
  const failedNative = makeNative(scope, { activationError: failure }); const failedIo = makeIo();
  const recovery = await restoreRealFlightBackup(scope, allow, dependencies(failedIo.io, failedNative.native));
  assert.equal(recovery.state,'recovery-required');
  if (recovery.state === 'recovery-required') {
    assert.equal(recovery.fileName,failedNative.createdCandidates[0]);
    assert.equal(failedNative.preparations.get(recovery.operationId)?.status,'pending');
  }
  assert.deepEqual(failedNative.createdCandidates, [
    'moflight-real-history-88888888-8888-4888-8888-888888888888.sqlite',
  ]);
  assert.deepEqual(failedNative.active, { name: oldCandidate, sequence: 4 });
  if (recovery.state === 'recovery-required') {
    failedNative.setActivationError();
    const resumed = await restoreRealFlightBackup(scope, allow, dependencies(makeIo().io, failedNative.native), recovery.operationId);
    assert.equal(resumed.state,'restored');
    if (resumed.state === 'restored') assert.equal(resumed.fileName,recovery.fileName);
    assert.ok(failedNative.events.includes('resume-candidate'));
    assert.deepEqual(failedNative.createdCandidates,[recovery.fileName]);
    const exactRetry = await restoreRealFlightBackup(scope, allow, dependencies(makeIo().io, failedNative.native), recovery.operationId);
    assert.deepEqual(exactRetry,{state:'already-activated',fileName:recovery.fileName,operationId:recovery.operationId,
      selection:{name:recovery.fileName,sequence:5}});
  }
});

test('restore refuses a predecessor change while the document picker is open', async () => {
  const { scope } = makeScope(); const native = makeNative(scope);
  const io = makeIo({ onPick: () => native.changeSelection('moflight-real-history-77777777-7777-4777-8777-777777777777.sqlite', 5) });
  const deps = dependencies(io.io, native.native);
  await assert.rejects(restoreRealFlightBackup(scope, allow, deps), /Active real flight history changed/);
  assert.deepEqual(native.createdCandidates, []);
  assert.ok(!native.events.includes('restore-candidate'));
});

test('explicit restore can extend an unreadable selection head without discarding it and reports the read-only recovery state', async () => {
  const { scope } = makeScope(); const native = makeNative(scope,{unreadable:true}); const io = makeIo();
  const result = await restoreRealFlightBackup(scope,allow,dependencies(io.io,native.native));
  assert.equal(result.state,'restored');
  if (result.state === 'restored') {
    assert.equal(result.selection.sequence,5);
    assert.equal(result.warning,'Die Sicherung wurde aktiviert. Aufbewahrte Dateien müssen geprüft werden. Die ausgewählte Bibliothek bleibt bis zur Klärung nur lesbar.');
    const prep = [...native.preparations.values()][0]!;
    assert.equal(prep.previousSequence,4);
    assert.equal(prep.status,'activated');
  }
  assert.deepEqual(native.active,{name:result.state === 'restored' ? result.fileName : oldCandidate,sequence:5});
  assert.ok(native.candidates.has(oldCandidate),'the unreadable selected candidate remains retained');
});

test('restore reports when no retained library can be read after activation', async () => {
  const { scope } = makeScope();
  const native = makeNative(scope,{unreadable:true,publicationUnreadable:true});
  const result = await restoreRealFlightBackup(scope,allow,dependencies(makeIo().io,native.native));
  assert.equal(result.state,'restored');
  if (result.state === 'restored') {
    assert.equal(result.warning,'Die Sicherung wurde aktiviert, aber keine gespeicherte Bibliothek kann gelesen werden. Die aufbewahrten Dateien müssen geprüft werden.');
    assert.equal([...native.preparations.values()][0]!.status,'activated');
    assert.ok(native.candidates.has(result.fileName));
  }
  assert.ok(native.candidates.has(oldCandidate));
});

test('SQLite empty-to-populated-to-empty restore reports review without claiming readable retained history is unreadable', async t => {
  const directory = mkdtempSync(join(tmpdir(),'moflight-real-backup-rollback-'));
  t.after(() => rmSync(directory,{recursive:true,force:true}));
  const { scope } = makeScope();
  const authorize = scope.authorize;
  const selectionPath = join(directory,'selection.sqlite');
  const opener: RealCandidateOpener<RealFlightLibrary> = async (name,auth,gate) => {
    const path = join(directory,name);
    assert.ok(existsSync(path),'reading a missing candidate must not create a database');
    return RealFlightLibrary.open(nodeDriver(path),ownerId,storeId,hash,auth,async () => {},gate);
  };
  const initial = await RealFlightLibrary.create(nodeDriver(join(directory,oldCandidate)),manifest(ownerId,storeId),hash,authorize);
  const emptyBackup = await initial.exportBackup(), emptyGraph = await initial.snapshot();
  await initial.close();
  const selection = await RealFlightSelection.open(nodeDriver(selectionPath),ownerId,storeId,authorize,opener,hash,true);
  try { await selection.activate(commandId(400),oldCandidate,null,at); }
  finally { await selection.close(); }
  let nextId = 401, picked = ownerBackup, pickerCalls = 0;
  const io = makeIo().io;
  io.pickBackup = async () => { pickerCalls++; return {canceled:false,assets:[{uri:'cache://synthetic-backup.json'}]}; };
  io.readPickedFile = async () => picked;
  const deps: RealFlightBackupDependencies = {
    io,hash,uuid:() => commandId(nextId++),now:() => at,
    native:{
      openRealFlightSelection:async () => RealFlightSelection.open(nodeDriver(selectionPath),ownerId,storeId,authorize,opener,hash),
      openRealFlightCommandJournal:async () => null,
      restoreRealFlightCandidate:async (_scope,name,text) => {
        const path = join(directory,name);
        assert.equal(existsSync(path),false,'restore reserves a fresh candidate');
        return RealFlightLibrary.restoreValidated(nodeDriver(path),text,ownerId,storeId,hash,authorize);
      },
      openRealFlightCandidate:async (_scope,name) => opener(name,authorize),
    },
  };
  const populated = await restoreRealFlightBackup(scope,allow,deps);
  assert.equal(populated.state,'restored');
  if (populated.state !== 'restored') return;
  assert.equal(populated.warning,undefined);
  assert.deepEqual(populated.snapshot,{generation:2,flightCount:1});
  const retained = await opener(populated.fileName,authorize);
  let populatedGraph;
  try { populatedGraph = await retained.snapshot(); }
  finally { await retained.close(); }

  picked = emptyBackup;
  const rollback = await restoreRealFlightBackup(scope,allow,deps);
  assert.equal(rollback.state,'restored');
  if (rollback.state !== 'restored') return;
  assert.equal(rollback.warning,'Die Sicherung wurde aktiviert. Aufbewahrte Dateien müssen geprüft werden. Die ausgewählte Bibliothek bleibt bis zur Klärung nur lesbar.');
  assert.deepEqual(rollback.snapshot,{generation:0,flightCount:0});
  const reopened = await deps.native.openRealFlightSelection(scope);
  assert.ok(reopened);
  try {
    const selected = await reopened.select();
    try {
      assert.equal(selected.name,rollback.fileName);
      assert.equal(selected.recoveryRequired,true);
      assert.deepEqual(await selected.candidate.snapshot(),emptyGraph);
      assert.deepEqual(await selected.candidate.list(),[]);
      await assert.rejects(selected.candidate.bindAccount({kind:'bind',commandId:commandId(450),baseGeneration:0,
        source:source('blocked-rollback-bind','1001'),at}),/write|writ|recovery|Unauthorized/i);
    } finally { await selected.candidate.close(); }
    assert.equal((await reopened.listRestorePreparations()).every(preparation => preparation.status === 'activated'),true);
  } finally { await reopened.close(); }

  const service = new RealFlightService(ownerId,storeId,leaseId,{
    authorize,hash,uuid:() => commandId(nextId++),now:() => at,
    retrieve:async () => { throw new Error('No provider retrieval in rollback verification'); },
    journal:async () => ({pending:async () => null,close:async () => {},
      supersede:async()=>assert.fail('no command to supersede'),prepare:async () => assert.fail('no save command may be prepared'),resolve:async () => assert.fail('no command to resolve')}),
    repository:async () => {
      const journal = await deps.native.openRealFlightSelection(scope);
      assert.ok(journal);
      try {
        const selected = await journal.select();
        return {library:selected.candidate,writable:!selected.recoveryRequired,warning:selected.warning,
          close:async () => { try { await selected.candidate.close(); } finally { await journal.close(); } }};
      } catch (error) { await journal.close(); throw error; }
    },
  });
  try {
    const stored = await service.readStored();
    assert.equal(stored.snapshot.recovery.readOnly,true);
    assert.deepEqual(stored.flights,[]);
    await assert.rejects(service.exportBackup(),/retained-candidate recovery/);
  } finally { service.dispose(); }
  const filesBeforeBlockedRestore = readdirSync(directory).sort(), pickedBefore = pickerCalls;
  await assert.rejects(restoreRealFlightBackup(scope,allow,deps),/Read-only real flight recovery/);
  assert.equal(pickerCalls,pickedBefore,'read-only restore is rejected before opening the picker');
  assert.deepEqual(readdirSync(directory).sort(),filesBeforeBlockedRestore);
  const stillRetained = await opener(populated.fileName,authorize);
  try { assert.deepEqual(await stillRetained.snapshot(),populatedGraph); }
  finally { await stillRetained.close(); }
});

import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Driver, Hash } from '../../packages/local-data/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { REAL_FLIGHT_COMMAND_JOURNAL_SCHEMA, RealFlightCommandJournal,
  IndeterminateRealFlightCommandJournalWrite, type RealFlightCommandJournalPermit } from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import type { RealFlightCommand } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';

const hash: Hash = async value => createHash('sha256').update(value, 'utf8').digest('hex');
const at = '2026-10-20T10:00:00.000Z';
const ownerA = '11111111-1111-4111-8111-111111111111';
const storeA = '22222222-2222-4222-8222-222222222222';
const ownerB = '33333333-3333-4333-8333-333333333333';
const storeB = '44444444-4444-4444-8444-444444444444';
const commandId = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;

test('fresh-attempt resolution migrates v1 atomically, retains exact intent and refuses stale replay',async t=>{
  const path=tempDb(t),first=await openJournal(t,path,ownerA,storeA,true),command=bindCommand(91);
  await first.journal.prepare(command);
  await assert.rejects(first.journal.supersede(command.commandId),/confirmed uncommitted/);
  await first.journal.resolve(command.commandId,'not-committed');
  await first.journal.supersede(command.commandId);await first.journal.close();
  const reopened=await openJournal(t,path);
  assert.equal(await reopened.journal.pending(),null);
  await reopened.journal.supersede(command.commandId);
  await assert.rejects(reopened.journal.prepare(command),/cannot be replayed/);
  await assert.rejects(reopened.journal.resolve(command.commandId,'committed'),/cannot be downgraded/);
  await reopened.journal.prepare(bindCommand(92));
  const db=trackedDriver(t,path);
  assert.equal((await db.first<{user_version:number}>('PRAGMA user_version'))!.user_version,2);
  const retained=await db.first<{request_json:string}>('SELECT request_json FROM real_flight_commands WHERE command_id=?',command.commandId);
  assert.deepEqual(JSON.parse(retained!.request_json),command);
  assert.deepEqual((await db.all<{outcome:string}>('SELECT outcome FROM real_flight_command_resolutions WHERE command_id=? ORDER BY seq',command.commandId)).map(row=>row.outcome),['not-committed','superseded']);
});

test('interrupted supersession rolls back the complete schema transition and leaves the original attempt retryable',async t=>{
  const path=tempDb(t),seeded=await openJournal(t,path,ownerA,storeA,true),command=bindCommand(93);
  await seeded.journal.prepare(command);await seeded.journal.resolve(command.commandId,'not-committed');await seeded.journal.close();
  const raw=trackedDriver(t,path),auth=authorizeFor(ownerA,storeA,'migration-interruption');
  const interrupted:Driver={...raw,transaction:work=>raw.transaction(async tx=>{await work(tx);throw new Error('Interrupted migration');})};
  const journal=await RealFlightCommandJournal.open(interrupted,ownerA,storeA,auth.authorize,hash);
  await assert.rejects(journal.supersede(command.commandId),/Interrupted migration/);await journal.close();
  const reopened=await openJournal(t,path);assert.deepEqual(await reopened.journal.pending(),command);
  const db=trackedDriver(t,path);assert.equal((await db.first<{user_version:number}>('PRAGMA user_version'))!.user_version,1);
  await reopened.journal.supersede(command.commandId);assert.equal(await reopened.journal.pending(),null);
});
const headers = ['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'];
const context = { accountNumber: '10101', clubLabel: 'Example Gliding Club', clubIdentity: 'display-label-only' as const,
  verification: 'observed-profile-number' as const };
const resources = new WeakMap<TestContext, { directory: string; closers: Array<() => Promise<void>> }>();

function source(captureId: string, accountRef = '10101'): RealFlightSourceInput {
  return {
    version: 1,
    binding: { provider: 'vereinsflieger', accountRef },
    contextBefore: { ...context, accountNumber: accountRef },
    contextAfter: { ...context, accountNumber: accountRef },
    requestedWindow: { from: '2026-10-01', to: '2026-10-31', participation: 'Pilot oder Fluglehrer' },
    capture: {
      captureId, retrievedAt: at, headers: [...headers], rows: [{ sourceFlightId: '1',
        values: ['20.10.2026', 'D-TEST', '10:00', '10:12', '12', 'Example Pilot'] }],
      sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
      exportContext: { from: '2026-10-01', to: '2026-10-31', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
        accountLabel: 'Example account', recordCount: 1, pageCount: 1, columnIds: ['1','2','3','4','5','6'], adapterVersion: 2 },
    },
  };
}

function bindCommand(id: number, ownerId = ownerA, storeId = storeA): RealFlightCommand {
  return { version: 1, kind: 'bind', ownerId, storeId, commandId: commandId(id), baseGeneration: 0,
    source: source(`capture-${id}`, ownerId === ownerA ? '10101' : '20202'), at };
}

function tempDb(t: TestContext): string {
  const directory = mkdtempSync(join(tmpdir(), 'moflight-command-journal-'));
  const state = { directory, closers: [] as Array<() => Promise<void>> };
  resources.set(t, state);
  t.after(async () => {
    for (const close of state.closers.reverse()) { try { await close(); } catch { /* A test may already have closed this handle. */ } }
    rmSync(directory, { recursive: true, force: true });
  });
  return join(directory, 'journal.sqlite');
}

function trackedDriver(t: TestContext, path: string): Driver {
  const db = nodeDriver(path);
  resources.get(t)!.closers.push(() => db.close());
  return db;
}

function authorizeFor(ownerId: string, storeId: string, leaseId: string) {
  let permit: RealFlightCommandJournalPermit = { ownerId, storeId, leaseId, writable: true };
  return { authorize: () => permit, setPermit(value: RealFlightCommandJournalPermit) { permit = value; } };
}

async function openJournal(t: TestContext, path: string, ownerId = ownerA, storeId = storeA, create = false,
  gate?: (write: boolean) => Promise<void>, db?: Driver) {
  const auth = authorizeFor(ownerId, storeId, `lease-${ownerId}`);
  const actualDb = db ?? trackedDriver(t, path);
  const journal = await RealFlightCommandJournal.open(actualDb, ownerId, storeId, auth.authorize, hash, create, gate);
  resources.get(t)!.closers.push(() => journal.close());
  return { journal, ...auth };
}

test('prepared commands survive restart and are isolated by owner/store in one shared journal', async t => {
  const path = tempDb(t);
  const a = await openJournal(t, path, ownerA, storeA, true);
  const original = bindCommand(1);
  await a.journal.prepare(original);
  assert.deepEqual(await a.journal.pending(), original);

  const b = await openJournal(t, path, ownerB, storeB);
  assert.equal(await b.journal.pending(), null);
  await assert.rejects(b.journal.prepare(bindCommand(1, ownerB, storeB)), /already used outside this owner\/store/);
  await assert.rejects(b.journal.resolve(original.commandId, 'committed'), /Unknown real flight command/);
  await b.journal.prepare(bindCommand(2, ownerB, storeB));
  assert.equal((await b.journal.pending())?.ownerId, ownerB);
  assert.deepEqual(await a.journal.pending(), original);

  await a.journal.close();
  await b.journal.close();
  const reopenedA = await openJournal(t, path);
  const reopenedB = await openJournal(t, path, ownerB, storeB);
  assert.deepEqual(await reopenedA.journal.pending(), original);
  assert.equal((await reopenedB.journal.pending())?.commandId, commandId(2));
});

test('same-command retry is idempotent, while unresolved work blocks new IDs until committed recovery', async t => {
  const path = tempDb(t), { journal } = await openJournal(t, path, ownerA, storeA, true);
  const first = bindCommand(10), altered = { ...first, at: '2026-10-20T11:00:00.000Z' };
  await journal.prepare(first);
  await journal.prepare(structuredClone(first));
  await assert.rejects(journal.prepare(altered), /ID reused with different input/);
  await assert.rejects(journal.prepare(bindCommand(11)), /pending real flight command/);

  await journal.resolve(first.commandId, 'not-committed');
  assert.deepEqual(await journal.pending(), first);
  await assert.rejects(journal.prepare(bindCommand(11)), /pending real flight command/);
  await journal.prepare(first);
  await journal.resolve(first.commandId, 'committed');
  assert.equal(await journal.pending(), null);
  const imported: RealFlightCommand = { version: 1, kind: 'import-unassigned', ownerId: ownerA, storeId: storeA,
    commandId: commandId(11), baseGeneration: 4, bindingId: 'a'.repeat(64), source: source('capture-import'),
    planToken: 'b'.repeat(64), at };
  await journal.prepare(imported);
  assert.deepEqual(await journal.pending(), imported);
  const invalidToken = { ...imported, commandId: commandId(12), planToken: 'not-a-sha256' };
  await assert.rejects(journal.prepare(invalidToken), /digest/);
  assert.equal((await journal.pending())?.commandId, commandId(11));
  await assert.rejects(journal.resolve(first.commandId, 'not-committed'), /cannot be downgraded/);
});

test('authorization switch is rejected before scoped reads and stale lease cannot retrieve pending data', async t => {
  const path = tempDb(t), raw = trackedDriver(t, path);
  let reads = 0;
  const db: Driver = {
    exec: raw.exec, run: raw.run,
    all: async <T>(sql: string, ...params: (string | number | null)[]) => { reads++; return raw.all<T>(sql, ...params); },
    first: async <T>(sql: string, ...params: (string | number | null)[]) => { reads++; return raw.first<T>(sql, ...params); },
    transaction: raw.transaction, close: raw.close,
  };
  const a = await openJournal(t, path, ownerA, storeA, true, undefined, db);
  await a.journal.prepare(bindCommand(20));
  const before = reads;
  a.setPermit({ ownerId: ownerB, storeId: storeB, leaseId: 'foreign', writable: true });
  await assert.rejects(a.journal.pending(), /Expired or foreign real flight command journal access/);
  assert.equal(reads, before);
});

test('invalid source requests are refused before writing and reopen validates stored request hashes', async t => {
  const path = tempDb(t), { journal } = await openJournal(t, path, ownerA, storeA, true);
  const invalid = bindCommand(30);
  (invalid.source.capture as unknown as { exportContext: { recordCount: number } }).exportContext.recordCount = 2;
  await assert.rejects(journal.prepare(invalid), /saved export shape|record count|coverage|source/i);
  assert.equal(await journal.pending(), null);

  const valid = bindCommand(31);
  await journal.prepare(valid);
  await journal.close();
  const tampered = trackedDriver(t, path);
  await tampered.exec("DROP TRIGGER real_flight_commands_no_update; UPDATE real_flight_commands SET request_sha256='" + '0'.repeat(64) + "'; " +
    "CREATE TRIGGER real_flight_commands_no_update BEFORE UPDATE ON real_flight_commands BEGIN SELECT RAISE(ABORT,'Append-only real flight command journal'); END;");
  await tampered.close();
  await assert.rejects(openJournal(t, path), /request hash or identity mismatch/);
});

test('unknown versions and unversioned nonempty databases are preserved; interrupted first create rolls back', async t => {
  const versionedPath = tempDb(t), versioned = trackedDriver(t, versionedPath);
  await versioned.exec('PRAGMA user_version=7; CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES (\'keep\');');
  await versioned.close();
  await assert.rejects(openJournal(t, versionedPath), /Unsupported real flight command journal version/);
  const checkVersion = trackedDriver(t, versionedPath);
  assert.equal((await checkVersion.first<{ user_version: number }>('PRAGMA user_version'))?.user_version, 7);
  assert.equal((await checkVersion.first<{ value: string }>('SELECT value FROM sentinel'))?.value, 'keep');
  await checkVersion.close();

  const nonemptyPath = tempDb(t), nonempty = trackedDriver(t, nonemptyPath);
  await nonempty.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('keep');");
  await nonempty.close();
  await assert.rejects(openJournal(t, nonemptyPath, ownerA, storeA, true), /Existing real flight command journal preserved/);
  const checkNonempty = trackedDriver(t, nonemptyPath);
  assert.equal((await checkNonempty.first<{ value: string }>('SELECT value FROM sentinel'))?.value, 'keep');
  assert.equal((await checkNonempty.first<{ user_version: number }>('PRAGMA user_version'))?.user_version, 0);
  await checkNonempty.close();

  const interruptedPath = tempDb(t), interruptedDriver = trackedDriver(t, interruptedPath);
  const interrupted: Driver = { ...interruptedDriver, transaction: async work => interruptedDriver.transaction(async tx => {
    await work(tx); throw new Error('simulated power loss before commit');
  }) };
  const auth = authorizeFor(ownerA, storeA, 'interrupted-create');
  await assert.rejects(RealFlightCommandJournal.open(interrupted, ownerA, storeA, auth.authorize, hash, true), /simulated power loss/);
  const afterInterruption = trackedDriver(t, interruptedPath);
  assert.equal((await afterInterruption.first<{ user_version: number }>('PRAGMA user_version'))?.user_version, 0);
  assert.equal(await afterInterruption.first("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"), null);
  await afterInterruption.close();
});

test('post-commit errors are indeterminate and reopening returns the exact command for recovery', async t => {
  const path = tempDb(t), seeded = await openJournal(t, path, ownerA, storeA, true);
  await seeded.journal.close();
  const raw = trackedDriver(t, path);
  const uncertain: Driver = { ...raw, transaction: async work => { await raw.transaction(work); throw new Error('commit acknowledgement lost'); } };
  const auth = authorizeFor(ownerA, storeA, 'lease-uncertain');
  const journal = await RealFlightCommandJournal.open(uncertain, ownerA, storeA, auth.authorize, hash);
  const command = bindCommand(40);
  await assert.rejects(journal.prepare(command), error => error instanceof IndeterminateRealFlightCommandJournalWrite &&
    error.operation === 'prepare' && error.commandId === command.commandId);
  await journal.close();
  const recovered = await openJournal(t, path);
  assert.deepEqual(await recovered.journal.pending(), command);
});

test('schema family is explicit and exact on disk', async t => {
  const path = tempDb(t), { journal } = await openJournal(t, path, ownerA, storeA, true);
  const inspect = trackedDriver(t, path);
  const schema = await inspect.all<{ name: string; sql: string }>("SELECT name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY name");
  assert.ok(schema.some(item => item.name === 'real_flight_commands'));
  assert.match(REAL_FLIGHT_COMMAND_JOURNAL_SCHEMA, /PRAGMA user_version=1/);
  assert.equal((await inspect.first<{ family: string }>('SELECT family FROM real_flight_command_manifest'))?.family,
    'moflight-real-flight-command-journal');
  await inspect.close();
});

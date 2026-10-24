import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { seedUpdateProof, verifyUpdateProof, UPDATE_ACCOUNTS, type UpdateProofPorts } from '../../apps/platform-lab/src/development/update-preservation-fixture.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightCommandJournal } from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { UserBackupRestoreJournal } from '../../apps/platform-lab/src/user-backup-restore-journal.ts';
import { validateUserBackup } from '../../apps/platform-lab/src/user-backup.ts';
import { archivedUpgradeWriter } from './upgrade-source-loader.ts';
import type { Driver } from '../../packages/local-data/src/index.ts';

const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-populated-upgrade-'));
  function path(name: string) { assert.match(name, /^[a-z][a-z0-9.-]+$/); return join(directory, name); }
  const drivers = new Set<Driver>();
  const ports: UpdateProofPorts = { open: async name => {
    const db = nodeDriver(path(name)); let closed = false;
    const tracked = { ...db, close: async () => { if (!closed) { closed = true; drivers.delete(tracked); await db.close(); } } };
    drivers.add(tracked); return tracked;
  }, hash,
    exists: async name => access(path(name)).then(() => true, () => false),
    read: name => readFile(path(name), 'utf8'), write: (name, value) => writeFile(path(name), value, 'utf8') };
  return { directory, path, ports, async cleanup() {
    for (const db of drivers) await db.close().catch(() => {});
    const target = resolve(directory);
    assert.equal(dirname(target), resolve(tmpdir())); assert.match(basename(target), /^moflight-populated-upgrade-/);
    await rm(target, { recursive: true, force: true });
  } };
}

test('populated current formats preserve two owners, four books, raw evidence, pending work and attachments across restart and recovery', async () => {
  const f = await fixture();
  try {
    await seedUpdateProof(f.ports);
    const names = UPDATE_ACCOUNTS.flatMap(a => [`${a.key}-real.sqlite`, `${a.key}-commands.sqlite`, `${a.key}-books.sqlite`,
      `${a.key}-information.sqlite`, `${a.key}-settings.json`, `${a.key}-attachment.txt`]);
    const before = await Promise.all(names.map(name => readFile(f.path(name))));
    await verifyUpdateProof(f.ports);
    for (const [index, name] of names.entries()) assert.deepEqual(await readFile(f.path(name)), before[index], name);
    await verifyUpdateProof(f.ports, false);
  } finally { await f.cleanup(); }
});

test('unsupported SQL/aggregate versions and foreign owners preserve populated original files', async () => {
  const f = await fixture();
  try {
    await seedUpdateProof(f.ports);
    const a = UPDATE_ACCOUNTS[0]!;
    const auth = () => ({ ownerId: a.ownerId, storeId: a.storeId, leaseId: 'synthetic-upgrade-proof', writable: true });
    const scope = { version: 1 as const, owner: a.ownerId, connectionId: a.connectionId,
      context: { accountNumber: a.account, clubLabel: 'Synthetic upgrade club', clubIdentity: 'display-label-only' as const, verification: 'observed-profile-number' as const } };
    for (const name of ['a-real.sqlite', 'a-information.sqlite', 'restore.sqlite']) {
      const changed = nodeDriver(f.path(name)); await changed.exec('PRAGMA user_version=99'); await changed.close();
      const before = await readFile(f.path(name)), driver = await f.ports.open(name);
      try {
        if (name === 'a-real.sqlite') await assert.rejects(RealFlightLibrary.open(driver, a.ownerId, a.storeId, hash, auth), /SQL version/);
        else if (name === 'a-information.sqlite') await assert.rejects(new InformationStore(driver, scope, async () => {}).initialize(false), /Unsupported information/);
        else await assert.rejects(UserBackupRestoreJournal.open(driver, false), /Unsupported user backup/);
      } finally { await driver.close(); }
      assert.deepEqual(await readFile(f.path(name)), before, name);
    }
    const archive = await f.ports.read('archive.json'), foreign = UPDATE_ACCOUNTS[1]!;
    await assert.rejects(validateUserBackup(archive, { ownerId: foreign.ownerId, storeId: foreign.storeId, informationScope: null }, hash), /Foreign/);
    await assert.rejects(validateUserBackup(JSON.stringify({ ...JSON.parse(archive), version: 99 }),
      { ownerId: a.ownerId, storeId: a.storeId, informationScope: scope }, hash), /Unsupported or corrupt/);
    const b = UPDATE_ACCOUNTS[1]!, driver = await f.ports.open('b-real.sqlite');
    const before = await readFile(f.path('b-real.sqlite'));
    try { await assert.rejects(RealFlightLibrary.open(driver, a.ownerId, b.storeId, hash,
      () => ({ ownerId: a.ownerId, storeId: b.storeId, leaseId: 'foreign', writable: true })), /owner|manifest|scope/i); }
    finally { await driver.close(); }
    assert.deepEqual(await readFile(f.path('b-real.sqlite')), before);
  } finally { await f.cleanup(); }
});

test('existing command-journal v1 to v2 migration rolls back write failure and retries without losing pending evidence', async () => {
  const f = await fixture();
  try {
    await seedUpdateProof(f.ports);
    const a = UPDATE_ACCOUNTS[0]!, path = f.path('a-commands.sqlite');
    const auth = () => ({ ownerId: a.ownerId, storeId: a.storeId, leaseId: 'synthetic-upgrade-proof', writable: true });
    const original = await RealFlightCommandJournal.open(await f.ports.open('a-commands.sqlite'), a.ownerId, a.storeId, auth, hash);
    const command = await original.pending(); assert.ok(command);
    await original.resolve(command.commandId, 'not-committed'); await original.close();
    const before = await readFile(path), db = await f.ports.open('a-commands.sqlite');
    const faultDriver = { ...db, transaction: (work: Parameters<typeof db.transaction>[0]) => db.transaction(async tx => {
      await work({ ...tx, exec: async sql => { await tx.exec(sql); if (sql.includes('PRAGMA user_version=2')) throw new Error('Synthetic migration write failure'); } });
    }) };
    const journal = await RealFlightCommandJournal.open(faultDriver, a.ownerId, a.storeId, auth, hash);
    await assert.rejects(journal.supersede(command.commandId), /Synthetic migration write failure/);
    await journal.close(); assert.deepEqual(await readFile(path), before);
    const retry = await RealFlightCommandJournal.open(nodeDriver(path), a.ownerId, a.storeId, auth, hash);
    try { assert.deepEqual(await retry.pending(), command); await retry.supersede(command.commandId); await retry.supersede(command.commandId); assert.equal(await retry.pending(), null); }
    finally { await retry.close(); }
  } finally { await f.cleanup(); }
});

for (const source of ['766b71944c28c899cdf7d6a76e198cec58f0d82f', '20ade40b04460172daafab0d8c104e97929c181d']) {
  test(`historical writer ${source.slice(0, 7)} populated files open in the current reader with skipped releases`,
    { skip: !process.env.MOFLIGHT_HISTORICAL_UPGRADE }, async () => {
      const f = await fixture();
      try { const old = archivedUpgradeWriter(source); await old.seedUpdateProof(f.ports); await verifyUpdateProof(f.ports); }
      finally { await f.cleanup(); }
    });
}

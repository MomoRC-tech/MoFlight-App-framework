import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Driver } from '../../packages/local-data/src/index.ts';
import { REAL_OWNER_REGISTRY_FAMILY, REAL_OWNER_REGISTRY_SCHEMA, RealOwnerRegistry } from '../../apps/platform-lab/src/vereinsflieger/real-owner-registry.ts';
import { nodeDriver } from './sqlite-driver.ts';

const at = '2026-10-20T10:00:00.000Z';
const later = '2026-10-20T10:01:00.000Z';

function uuidSource(start = 1) {
  let value = start;
  return () => {
    const current = value++;
    return '00000000-0000-4000-8000-' + current.toString(16).padStart(12, '0');
  };
}

function interruptedBeforeCommit(db: Driver): { driver: Driver; interrupt(): void; resume(): void } {
  let shouldInterrupt = false;
  const driver: Driver = {
    exec: (...args) => db.exec(...args),
    run: (...args) => db.run(...args),
    all: (...args) => db.all(...args),
    first: (...args) => db.first(...args),
    close: () => db.close(),
    transaction: work => db.transaction(async tx => {
      await work(tx);
      if (shouldInterrupt) throw new Error('Injected transaction interruption.');
    }),
  };
  return { driver, interrupt: () => { shouldInterrupt = true; }, resume: () => { shouldInterrupt = false; } };
}

test('fresh owner creates separate UUID identities, selects atomically and survives reopen without adopting old stores', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-real-owner-'));
  const oldPath = join(dir, 'synthetic-lab.sqlite');
  const registryPath = join(dir, 'moflight-real-owner-registry-v1.sqlite');
  let registry: RealOwnerRegistry | undefined;
  let db: Driver | undefined;
  let oldCheck: Driver | undefined;
  try {
    const oldStore = nodeDriver(oldPath);
    await oldStore.exec('CREATE TABLE synthetic_records(id TEXT PRIMARY KEY,payload TEXT NOT NULL);');
    await oldStore.run('INSERT INTO synthetic_records VALUES (?,?)', 'kept', '{"source":"synthetic"}');
    await oldStore.close();

    db = nodeDriver(registryPath);
    registry = await RealOwnerRegistry.create(db, uuidSource(), at);
    const owner = await registry.createFreshOwner(later);
    assert.match(owner.ownerId, /^[0-9a-f-]{36}$/);
    assert.match(owner.storeId, /^[0-9a-f-]{36}$/);
    assert.notEqual(owner.ownerId, owner.storeId);
    assert.match(owner.candidateName, /^moflight-real-history-[0-9a-f-]{36}\.sqlite$/);
    const candidateId = owner.candidateName.slice('moflight-real-history-'.length, -'.sqlite'.length);
    assert.notEqual(candidateId, owner.ownerId);
    assert.notEqual(candidateId, owner.storeId);
    assert.equal(owner.selectionSeq, 1);
    assert.deepEqual(await registry.listOwners(owner), [{
      version: 1, ownerId: owner.ownerId, storeId: owner.storeId, candidateName: owner.candidateName, createdAt: later,
    }]);
    await registry.close(); registry = undefined; db = undefined;

    registry = await RealOwnerRegistry.open(nodeDriver(registryPath), uuidSource(100));
    const reopened = await registry.currentOwner();
    assert.ok(reopened);
    assert.equal(reopened.ownerId, owner.ownerId);
    assert.equal(reopened.storeId, owner.storeId);
    assert.equal(reopened.candidateName, owner.candidateName);
    assert.equal(reopened.selectionSeq, owner.selectionSeq);
    assert.notEqual(reopened.leaseId, owner.leaseId);
    await registry.assertCurrent(reopened, owner.ownerId, owner.storeId);
    assert.deepEqual((await registry.listOwners(reopened)).map(value => value.ownerId), [owner.ownerId]);

    oldCheck = nodeDriver(oldPath);
    assert.deepEqual(JSON.parse(JSON.stringify(await oldCheck.all('SELECT * FROM synthetic_records'))),
      [{ id: 'kept', payload: '{"source":"synthetic"}' }]);
    assert.equal(await oldCheck.first('SELECT name FROM sqlite_master WHERE name=?', 'real_owner_records'), null);
    await oldCheck.close(); oldCheck = undefined;
  } finally {
    if (oldCheck) await oldCheck.close();
    if (registry) await registry.close(); else if (db) await db.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('only the current issued lease can read or switch owners; a switch invalidates prior capabilities', async () => {
  const db = nodeDriver(':memory:');
  const registry = await RealOwnerRegistry.create(db, uuidSource(), at);
  try {
    const first = await registry.createFreshOwner(at);
    const second = await registry.createFreshOwner(later);
    await assert.rejects(registry.assertCurrent(first), /Expired or forged|selection changed/);
    await assert.rejects(registry.listOwners(first), /Expired or forged|selection changed/);
    await assert.rejects(registry.assertCurrent(second, first.ownerId), /Foreign real owner reference/);
    await assert.rejects(registry.assertCurrent(second, second.ownerId, first.storeId), /Foreign real owner reference/);

    const selectedFirst = await registry.selectOwner(first.ownerId, later, second);
    assert.equal(selectedFirst.ownerId, first.ownerId);
    assert.equal(selectedFirst.storeId, first.storeId);
    assert.equal(selectedFirst.candidateName, first.candidateName);
    assert.equal(selectedFirst.selectionSeq, 3);
    await registry.assertCurrent(selectedFirst);
    await assert.rejects(registry.assertCurrent(second), /Expired or forged|selection changed/);
    await assert.rejects(registry.selectOwner('99999999-9999-4999-8999-999999999999', later, selectedFirst), /Unknown real owner/);
    await registry.assertCurrent(selectedFirst);
    assert.deepEqual((await registry.listOwners(selectedFirst)).map(owner => owner.ownerId), [first.ownerId, second.ownerId]);
  } finally { await registry.close(); }
});

test('an interrupted fresh-owner transaction leaves no owner or selection and preserves the prior state', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-owner-create-interrupt-'));
  const path = join(dir, 'registry.sqlite');
  const setup = await RealOwnerRegistry.create(nodeDriver(path), uuidSource(), at);
  await setup.close();
  const base = nodeDriver(path), fault = interruptedBeforeCommit(base);
  const registry = await RealOwnerRegistry.open(fault.driver, uuidSource(100));
  try {
    fault.interrupt();
    await assert.rejects(registry.createFreshOwner(later), /Injected transaction interruption/);
    fault.resume();
    assert.deepEqual(await base.all('SELECT * FROM real_owner_records'), []);
    assert.deepEqual(await base.all('SELECT * FROM real_owner_selections'), []);
    assert.equal(await registry.currentOwner(), null);
  } finally { await registry.close(); await rm(dir, { recursive: true, force: true }); }
});

test('an interrupted owner switch rolls back and leaves the previous lease current', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-owner-switch-interrupt-'));
  const path = join(dir, 'registry.sqlite');
  const registry = await RealOwnerRegistry.create(nodeDriver(path), uuidSource(), at);
  let interrupted: RealOwnerRegistry | undefined;
  try {
    const first = await registry.createFreshOwner(at);
    const second = await registry.createFreshOwner(later);
    const base = nodeDriver(path), fault = interruptedBeforeCommit(base);
    interrupted = await RealOwnerRegistry.open(fault.driver, uuidSource(100));
    const switchLease = (await interrupted.currentOwner())!;
    fault.interrupt();
    await assert.rejects(interrupted.selectOwner(first.ownerId, later, switchLease), /Injected transaction interruption/);
    fault.resume();
    await registry.assertCurrent(second);
    assert.equal((await registry.currentOwner())?.ownerId, second.ownerId);
    assert.equal((await base.all('SELECT * FROM real_owner_selections')).length, 2);
  } finally {
    if (interrupted) await interrupted.close();
    await registry.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('create and open refuse unknown, nonempty, unsupported and altered registries without repair', async () => {
  const blank = nodeDriver(':memory:');
  await assert.rejects(RealOwnerRegistry.open(blank, uuidSource()), /Unsupported real owner registry version/);
  await blank.close();

  const unknown = nodeDriver(':memory:');
  await unknown.exec('CREATE TABLE unrelated(value TEXT);');
  await assert.rejects(RealOwnerRegistry.create(unknown, uuidSource(), at), /Existing or unknown/);
  assert.equal(await unknown.first('SELECT name FROM sqlite_master WHERE name=?', 'unrelated') !== null, true);
  await unknown.close();

  const dir = await mkdtemp(join(tmpdir(), 'moflight-owner-version-'));
  const unsupportedPath = join(dir, 'unsupported.sqlite');
  const alteredPath = join(dir, 'altered.sqlite');
  try {
    const initial = await RealOwnerRegistry.create(nodeDriver(unsupportedPath), uuidSource(), at);
    await initial.close();
    const versionDb = nodeDriver(unsupportedPath);
    await versionDb.exec('PRAGMA user_version=2;');
    await versionDb.close();
    const unsupportedOpen = nodeDriver(unsupportedPath);
    await assert.rejects(RealOwnerRegistry.open(unsupportedOpen, uuidSource()), /Unsupported real owner registry version/);
    await unsupportedOpen.close();
    const verifyVersion = nodeDriver(unsupportedPath);
    assert.equal((await verifyVersion.first<{ user_version: number }>('PRAGMA user_version'))?.user_version, 2);
    await verifyVersion.close();

    const valid = await RealOwnerRegistry.create(nodeDriver(alteredPath), uuidSource(), at);
    await valid.close();
    const alterDb = nodeDriver(alteredPath);
    await alterDb.exec('DROP TRIGGER real_owner_records_no_delete;');
    await alterDb.close();
    const alteredOpen = nodeDriver(alteredPath);
    await assert.rejects(RealOwnerRegistry.open(alteredOpen, uuidSource()), /Unsupported real owner registry schema/);
    await alteredOpen.close();
    const verifyAltered = nodeDriver(alteredPath);
    assert.equal(await verifyAltered.first('SELECT name FROM sqlite_master WHERE name=?', 'real_owner_records_no_delete'), null);
    await verifyAltered.close();
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('owner registry tables are append-only even with recursive triggers disabled and reject INSERT OR REPLACE', async () => {
  const db = nodeDriver(':memory:');
  await db.exec('PRAGMA recursive_triggers=OFF;');
  const registry = await RealOwnerRegistry.create(db, uuidSource(), at);
  try {
    const owner = await registry.createFreshOwner(at);
    for (const table of ['real_owner_manifest', 'real_owner_records', 'real_owner_selections']) {
      await assert.rejects(db.exec('UPDATE ' + table + ' SET rowid=rowid'), /Append-only/);
      await assert.rejects(db.exec('DELETE FROM ' + table), /Append-only/);
    }
    const tables = ['real_owner_manifest', 'real_owner_records', 'real_owner_selections'];
    const before = await Promise.all(tables.map(table => db.all('SELECT * FROM ' + table + ' ORDER BY 1')));
    await assert.rejects(db.run('INSERT OR REPLACE INTO real_owner_manifest VALUES (1,?,?,?)', REAL_OWNER_REGISTRY_FAMILY, 1, later), /identity collision/);
    await assert.rejects(db.run('INSERT OR REPLACE INTO real_owner_records VALUES (?,?,?,?)', owner.ownerId, '99999999-9999-4999-8999-999999999999', owner.candidateName, later), /identity collision/);
    await assert.rejects(db.run('INSERT OR REPLACE INTO real_owner_selections VALUES (?,?,?,?,?,?,?)', owner.selectionSeq, owner.ownerId, owner.storeId, owner.candidateName, '99999999-9999-4999-8999-999999999999', null, later), /identity collision/);
    const after = await Promise.all(tables.map(table => db.all('SELECT * FROM ' + table + ' ORDER BY 1')));
    assert.deepEqual(after, before);
    assert.equal((await db.first<{ recursive_triggers: number }>('PRAGMA recursive_triggers'))?.recursive_triggers, 0);
  } finally { await registry.close(); }
});

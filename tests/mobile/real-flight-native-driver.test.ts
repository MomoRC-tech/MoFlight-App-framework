import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { Bind, Driver } from '../../packages/local-data/src/index.ts';
import { openRealFlightNativeDriver, type RealFlightNativeDatabase, type RealFlightNativeDatabaseOptions }
  from '../../apps/platform-lab/src/vereinsflieger/real-flight-native-driver.ts';
import { RealOwnerRegistry } from '../../apps/platform-lab/src/vereinsflieger/real-owner-registry.ts';

interface OpenedConnection {
  useNewConnection: boolean;
  calls: string[];
  closed: boolean;
}

function sqliteOpener(path: string, options: { ignoreTransactionPragmas?: boolean } = {}) {
  const opened: OpenedConnection[] = [];
  const open = async (_name: string, openOptions?: RealFlightNativeDatabaseOptions): Promise<RealFlightNativeDatabase> => {
    const database = new DatabaseSync(path);
    const state: OpenedConnection = { useNewConnection: openOptions?.useNewConnection === true, calls: [], closed: false };
    opened.push(state);
    const handle = {
      execAsync: async (sql: string) => {
        state.calls.push(sql);
        if (!(state.useNewConnection && options.ignoreTransactionPragmas)) database.exec(sql);
        else database.exec('PRAGMA foreign_keys=OFF; PRAGMA synchronous=NORMAL;');
      },
      runAsync: async (sql: string, ...params: Bind[]) => {
        state.calls.push(sql);
        return database.prepare(sql).run(...params);
      },
      getAllAsync: async <T>(sql: string, ...params: Bind[]) => {
        state.calls.push(sql);
        return database.prepare(sql).all(...params) as T[];
      },
      getFirstAsync: async <T>(sql: string, ...params: Bind[]) => {
        state.calls.push(sql);
        return (database.prepare(sql).get(...params) ?? null) as T | null;
      },
      closeAsync: async () => { state.closed = true; database.close(); },
    };
    return handle as unknown as RealFlightNativeDatabase;
  };
  return { open, opened };
}

function temporaryPath(): { directory: string; path: string } {
  const directory = mkdtempSync(join(tmpdir(), 'moflight-native-driver-'));
  return { directory, path: join(directory, 'history.sqlite') };
}

function uuidSource(start = 1) {
  let value = start;
  return () => '00000000-0000-4000-8000-' + (value++).toString(16).padStart(12, '0');
}

test('fresh-owner registry create, selection and reopen work with independent native transaction connections', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  let registry: RealOwnerRegistry | undefined;
  let reopened: RealOwnerRegistry | undefined;
  let driver: Driver | undefined;
  let reopenedDriver: Driver | undefined;
  try {
    driver = await openRealFlightNativeDriver('history.sqlite', factory.open);
    registry = await RealOwnerRegistry.create(driver, uuidSource(), '2026-10-20T10:00:00.000Z');
    const owner = await registry.createFreshOwner('2026-10-20T10:01:00.000Z');
    assert.equal(owner.selectionSeq, 1);
    assert.ok(factory.opened.filter(connection => connection.useNewConnection).every(connection => connection.closed));
    await registry.close(); registry = undefined; driver = undefined;

    reopenedDriver = await openRealFlightNativeDriver('history.sqlite', factory.open);
    reopened = await RealOwnerRegistry.open(reopenedDriver, uuidSource(100));
    const current = await reopened.currentOwner();
    assert.ok(current);
    assert.equal(current.ownerId, owner.ownerId);
    assert.equal(current.storeId, owner.storeId);
    assert.equal(current.selectionSeq, 1);
    await reopened.close(); reopened = undefined; reopenedDriver = undefined;
  } finally {
    if (registry) await registry.close(); else if (driver) await driver.close();
    if (reopened) await reopened.close(); else if (reopenedDriver) await reopenedDriver.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native driver configures the independent transaction connection before BEGIN and enforces foreign keys', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver = await openRealFlightNativeDriver('history.sqlite', factory.open);
  try {
    assert.equal((await driver.first<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1);
    assert.equal((await driver.first<{ synchronous: number }>('PRAGMA synchronous'))?.synchronous, 2);
    await driver.exec('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parent_id INTEGER REFERENCES parent(id));');

    await driver.transaction(async tx => {
      assert.equal((await tx.first<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1);
      assert.equal((await tx.first<{ synchronous: number }>('PRAGMA synchronous'))?.synchronous, 2);
      await tx.run('INSERT INTO parent(id) VALUES (?)', 1);
      await tx.run('INSERT INTO child(parent_id) VALUES (?)', 1);
    });
    assert.equal((await driver.first<{ count: number }>('SELECT count(*) AS count FROM child'))?.count, 1);

    const transactionConnection = factory.opened.find(connection => connection.useNewConnection);
    assert.ok(transactionConnection);
    const pragmaCall = transactionConnection.calls.indexOf('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    const beginCall = transactionConnection.calls.indexOf('BEGIN EXCLUSIVE TRANSACTION');
    assert.ok(pragmaCall >= 0 && beginCall > pragmaCall, 'connection-local settings must precede BEGIN');
    assert.equal(transactionConnection.closed, true);

    await assert.rejects(driver.transaction(tx => tx.run('INSERT INTO child(parent_id) VALUES (?)', 999)), /FOREIGN KEY/);
    assert.equal((await driver.first<{ count: number }>('SELECT count(*) AS count FROM child'))?.count, 1);
    const completed = factory.opened.filter(connection => connection.useNewConnection);
    assert.ok(completed.every(connection => connection.closed), 'every transaction connection closes after success or failure');
  } finally {
    await driver.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test('native driver rolls back callback failures and closes a transaction connection whose pragmas cannot be enforced', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver = await openRealFlightNativeDriver('history.sqlite', factory.open);
  try {
    await driver.exec('CREATE TABLE values_to_keep(value INTEGER PRIMARY KEY);');
    await assert.rejects(driver.transaction(async tx => {
      await tx.run('INSERT INTO values_to_keep(value) VALUES (?)', 1);
      throw new Error('simulated callback failure');
    }), /simulated callback failure/);
    assert.equal(await driver.first('SELECT value FROM values_to_keep'), null);
    assert.ok(factory.opened.filter(connection => connection.useNewConnection).every(connection => connection.closed));
  } finally {
    await driver.close();
    rmSync(directory, { recursive: true, force: true });
  }

  const unsafe = temporaryPath(), unsafeFactory = sqliteOpener(unsafe.path, { ignoreTransactionPragmas: true });
  const unsafeDriver = await openRealFlightNativeDriver('history.sqlite', unsafeFactory.open);
  try {
    await assert.rejects(unsafeDriver.transaction(async () => {}), /Unsafe real flight SQLite connection/);
    const transactionConnection = unsafeFactory.opened.find(connection => connection.useNewConnection);
    assert.ok(transactionConnection?.closed, 'connection closes if PRAGMA setup fails');
  } finally {
    await unsafeDriver.close();
    rmSync(unsafe.directory, { recursive: true, force: true });
  }
});

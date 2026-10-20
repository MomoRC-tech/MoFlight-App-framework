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
  database: DatabaseSync;
  useNewConnection: boolean;
  calls: string[];
  closed: boolean;
}

function sqliteOpener(path: string, options: { ignoreTransactionPragmas?: boolean } = {}) {
  const opened: OpenedConnection[] = [];
  const open = async (_name: string, openOptions?: RealFlightNativeDatabaseOptions): Promise<RealFlightNativeDatabase> => {
    const database = new DatabaseSync(path);
    const state: OpenedConnection = { database, useNewConnection: openOptions?.useNewConnection === true, calls: [], closed: false };
    opened.push(state);
    const ignorePragmas = options.ignoreTransactionPragmas && opened.length > 1;
    const handle = {
      execAsync: async (sql: string) => {
        state.calls.push(sql);
        if (!(ignorePragmas)) database.exec(sql);
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
    assert.equal(factory.opened.slice(1).length, 1);
    await registry.close(); registry = undefined; driver = undefined;
    assert.ok(factory.opened.every(connection => connection.closed));

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

    const transactionConnection = factory.opened[1];
    assert.ok(transactionConnection);
    const pragmaCall = transactionConnection.calls.indexOf('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
    const beginCall = transactionConnection.calls.indexOf('BEGIN EXCLUSIVE TRANSACTION');
    assert.ok(pragmaCall >= 0 && beginCall > pragmaCall, 'connection-local settings must precede BEGIN');
    assert.equal(transactionConnection.closed, false, 'successful connection remains owned by this driver');
    transactionConnection.database.exec('PRAGMA foreign_keys=OFF; PRAGMA synchronous=NORMAL;');
    await driver.transaction(async tx => {
      assert.equal((await tx.first<{ foreign_keys: number }>('PRAGMA foreign_keys'))?.foreign_keys, 1);
      assert.equal((await tx.first<{ synchronous: number }>('PRAGMA synchronous'))?.synchronous, 2);
    });
    assert.equal(factory.opened.slice(1).length, 1);

    await assert.rejects(driver.transaction(tx => tx.run('INSERT INTO child(parent_id) VALUES (?)', 999)), /FOREIGN KEY/);
    assert.equal((await driver.first<{ count: number }>('SELECT count(*) AS count FROM child'))?.count, 1);
    const completed = factory.opened.slice(1);
    assert.ok(completed.every(connection => connection.closed), 'failure discards even a previously reused connection');
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
    assert.ok(factory.opened.slice(1).every(connection => connection.closed));
  } finally {
    await driver.close();
    rmSync(directory, { recursive: true, force: true });
  }

  const unsafe = temporaryPath(), unsafeFactory = sqliteOpener(unsafe.path, { ignoreTransactionPragmas: true });
  const unsafeDriver = await openRealFlightNativeDriver('history.sqlite', unsafeFactory.open);
  try {
    await assert.rejects(unsafeDriver.transaction(async () => {}), /Unsafe real flight SQLite connection/);
    const transactionConnection = unsafeFactory.opened[1];
    assert.ok(transactionConnection?.closed, 'connection closes if PRAGMA setup fails');
  } finally {
    await unsafeDriver.close();
    rmSync(unsafe.directory, { recursive: true, force: true });
  }
});

test('transactions serialize; close drains accepted work, rejects new work and closes each handle once', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver = await openRealFlightNativeDriver('history.sqlite',factory.open);
  let release!: () => void, entered!: () => void;
  const hold = new Promise<void>(resolve => { release=resolve; });
  const started = new Promise<void>(resolve => { entered=resolve; });
  const order: string[] = [];
  try {
    await driver.exec('CREATE TABLE ordered_values(value TEXT)');
    const first = driver.transaction(async tx => {
      order.push('first-start');await tx.run('INSERT INTO ordered_values VALUES (?)','first');entered();await hold;order.push('first-end');
    });
    await started;
    const second = driver.transaction(async tx => {
      order.push('second');await tx.run('INSERT INTO ordered_values VALUES (?)','second');
    });
    const closing = driver.close();
    assert.equal(driver.close(),closing,'close is idempotent, including while draining');
    await assert.rejects(driver.transaction(async()=>{}),/driver closed/);
    await assert.rejects(driver.first('SELECT 1'),/driver closed/);
    assert.deepEqual(order,['first-start']);
    release();await Promise.all([first,second,closing]);
    assert.deepEqual(order,['first-start','first-end','second']);
    assert.equal(factory.opened.length,2,'one root and one private serial transaction connection');
    assert.ok(factory.opened.every(x=>x.closed));
    const readback = new DatabaseSync(path);
    try { assert.deepEqual(readback.prepare('SELECT value FROM ordered_values ORDER BY rowid').all().map(x=>x.value),['first','second']); }
    finally { readback.close(); }
  } finally { release();await driver.close();rmSync(directory,{recursive:true,force:true}); }
});

test('a failed callback discards its handle, preserves the error and lets queued work reopen cleanly', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver = await openRealFlightNativeDriver('history.sqlite',factory.open), failure = new Error('original callback failure');
  try {
    await driver.exec('CREATE TABLE retained_values(value INTEGER)');
    const failed = driver.transaction(async tx => { await tx.run('INSERT INTO retained_values VALUES (1)');throw failure; });
    const next = driver.transaction(async tx => { await tx.run('INSERT INTO retained_values VALUES (2)'); });
    await assert.rejects(failed,error=>error===failure);await next;
    assert.deepEqual((await driver.all<{value:number}>('SELECT value FROM retained_values')).map(x=>x.value),[2]);
    assert.equal(factory.opened.length,3);
    assert.equal(factory.opened[1]!.closed,true);assert.equal(factory.opened[2]!.closed,false);
  } finally { await driver.close();rmSync(directory,{recursive:true,force:true}); }
});

test('indeterminate commit and rollback failures discard the connection without replacing the original error', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const failure = new Error('commit reply lost');let loseCommit=true;
  const driver = await openRealFlightNativeDriver('history.sqlite',async(name,options)=>{
    const db=await factory.open(name,options);
    if(factory.opened.length===1)return db;
    return {...db,execAsync:async sql=>{
      if(sql==='ROLLBACK'&&loseCommit===false)throw new Error('rollback failed');
      await db.execAsync(sql);
      if(sql==='COMMIT'&&loseCommit){loseCommit=false;throw failure;}
    }};
  });
  try {
    await driver.exec('CREATE TABLE committed_values(value INTEGER)');
    await assert.rejects(driver.transaction(tx=>tx.run('INSERT INTO committed_values VALUES (1)')),error=>error===failure);
    assert.equal(factory.opened[1]!.closed,true);
    await driver.transaction(tx=>tx.run('INSERT INTO committed_values VALUES (2)'));
    assert.deepEqual((await driver.all<{value:number}>('SELECT value FROM committed_values ORDER BY value')).map(x=>x.value),[1,2]);
    assert.equal(factory.opened.length,3);
  } finally { await driver.close();rmSync(directory,{recursive:true,force:true}); }
});

test('reused registry connections still reject another handle switching owner and forged leases', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver=await openRealFlightNativeDriver('registry.sqlite',factory.open);
  const registry=await RealOwnerRegistry.create(driver,uuidSource(),'2026-10-20T10:00:00.000Z');
  const otherDriver=await openRealFlightNativeDriver('registry.sqlite',factory.open);
  const other=await RealOwnerRegistry.open(otherDriver,uuidSource(100));
  try {
    const first=await registry.createFreshOwner('2026-10-20T10:01:00.000Z');
    await registry.assertCurrent(first);await registry.assertCurrent(first);
    await assert.rejects(registry.assertCurrent({...first,leaseId:'00000000-0000-4000-8000-000000000099'}),/lease|owner|selection/i);
    const second=await other.createFreshOwner('2026-10-20T10:02:00.000Z');
    await assert.rejects(registry.assertCurrent(first));
    await other.assertCurrent(second);
    assert.notEqual(first.ownerId,second.ownerId);
  } finally { await registry.close();await other.close();assert.ok(factory.opened.every(x=>x.closed));rmSync(directory,{recursive:true,force:true}); }
});

test('transaction callbacks cannot retain access to a connection reused by later work', async () => {
  const { directory, path } = temporaryPath(), factory = sqliteOpener(path);
  const driver=await openRealFlightNativeDriver('history.sqlite',factory.open);
  let expired: Parameters<Parameters<Driver['transaction']>[0]>[0] | undefined;
  try {
    await driver.exec('CREATE TABLE scoped_values(value INTEGER)');
    await driver.transaction(async tx=>{ expired=tx;await tx.run('INSERT INTO scoped_values VALUES (1)'); });
    assert.ok(expired);
    await assert.rejects(expired.run('INSERT INTO scoped_values VALUES (99)'),/transaction ended/);
    await driver.transaction(async tx=>{
      await assert.rejects(expired!.exec('DELETE FROM scoped_values'),/transaction ended/);
      await tx.run('INSERT INTO scoped_values VALUES (2)');
    });
    assert.deepEqual((await driver.all<{value:number}>('SELECT value FROM scoped_values ORDER BY value')).map(x=>x.value),[1,2]);
  } finally { await driver.close();rmSync(directory,{recursive:true,force:true}); }
});

test('transaction opener failure does not poison the serial queue', async () => {
  const { directory, path } = temporaryPath(), factory=sqliteOpener(path), failure=new Error('temporary open failure');
  let failOpen=true;
  const driver=await openRealFlightNativeDriver('history.sqlite',async(name,options)=>{
    if(options?.useNewConnection&&factory.opened.length>0&&failOpen){failOpen=false;throw failure;}
    return factory.open(name,options);
  });
  try {
    const failed=driver.transaction(async()=>{assert.fail('callback must not run without a transaction connection');});
    const recovered=driver.transaction(async tx=>{assert.equal((await tx.first<{value:number}>('SELECT 1 AS value'))?.value,1);});
    await assert.rejects(failed,error=>error===failure);await recovered;
    assert.equal(factory.opened.length,2);
  } finally { await driver.close();rmSync(directory,{recursive:true,force:true}); }
});

test('closing a concurrent inspector cannot invalidate a retained driver when the native opener caches default roots',async()=>{
  const {directory,path}=temporaryPath(),factory=sqliteOpener(path);
  let cached:RealFlightNativeDatabase|undefined;
  const open=async(name:string,options?:RealFlightNativeDatabaseOptions)=>{
    if(options?.useNewConnection)return factory.open(name,options);
    cached??=await factory.open(name,options);return cached;
  };
  const retained=await openRealFlightNativeDriver('selection.sqlite',open);
  const inspector=await openRealFlightNativeDriver('selection.sqlite',open);
  try{
    await retained.exec('CREATE TABLE selected_head(value INTEGER); INSERT INTO selected_head VALUES (4)');
    assert.equal((await inspector.first<{value:number}>('SELECT value FROM selected_head'))?.value,4);
    await inspector.close();
    assert.equal((await retained.first<{value:number}>('SELECT value FROM selected_head'))?.value,4);
    await retained.transaction(async tx=>{assert.equal((await tx.first<{value:number}>('SELECT value FROM selected_head'))?.value,4);});
    assert.ok(factory.opened.every(x=>x.useNewConnection),'root and transaction handles must be independently owned');
    assert.equal(factory.opened.length,3);
  }finally{await retained.close();await inspector.close();rmSync(directory,{recursive:true,force:true});}
});

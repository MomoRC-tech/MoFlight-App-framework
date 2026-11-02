import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bind, Connection, Driver } from '../../packages/local-data/src/index.ts';
import { FlightReviewStore } from '../../apps/platform-lab/src/vereinsflieger/flight-review-store.ts';
import type { FlightAcknowledgment, FlightReviewTarget } from '../../apps/platform-lab/src/vereinsflieger/flight-source-review.ts';
import { nodeDriver } from './sqlite-driver.ts';

const ownerA = '00000000-0000-4000-8000-000000000001';
const storeA = '00000000-0000-4000-8000-000000000002';
const ownerB = '00000000-0000-4000-8000-000000000003';
const storeB = '00000000-0000-4000-8000-000000000004';
const targetA: FlightReviewTarget = { ownerId: ownerA, storeId: storeA, accountRef: '12345' };
const targetB: FlightReviewTarget = { ownerId: ownerB, storeId: storeB, accountRef: '98765' };
const gate = async () => {};
const ack = (flightId: string, revision = 1, payloadSha256 = 'b'.repeat(64)): FlightAcknowledgment => ({ flightId, revision, payloadSha256 });

test('last acknowledgment is idempotent, updates by flight, and survives reopen', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-flight-review-'));
  const path = join(dir, 'review.sqlite');
  let store = await FlightReviewStore.create(nodeDriver(path), targetA, gate);
  try {
    const first = ack('a'.repeat(64), 2);
    await store.acknowledge(first);
    await store.acknowledge(first);
    await store.acknowledge({ ...first, revision: 3, payloadSha256: 'c'.repeat(64) });
    assert.deepEqual(await store.list(), [{ ...first, revision: 3, payloadSha256: 'c'.repeat(64) }]);
    await store.close();

    store = await FlightReviewStore.open(nodeDriver(path), targetA, gate);
    assert.deepEqual(await store.list(), [{ ...first, revision: 3, payloadSha256: 'c'.repeat(64) }]);
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('creation refuses populated files and open refuses a foreign target without changing stored state', async () => {
  const db = nodeDriver(':memory:');
  await db.exec('CREATE TABLE unrelated(value TEXT);');
  await assert.rejects(FlightReviewStore.create(db, targetA, gate), /preserved/);
  assert.ok(await db.first("SELECT name FROM sqlite_master WHERE name='unrelated'"));
  await db.close();

  const dir = await mkdtemp(join(tmpdir(), 'moflight-flight-review-owner-'));
  const path = join(dir, 'review.sqlite');
  const initial = await FlightReviewStore.create(nodeDriver(path), targetA, gate);
  await initial.acknowledge(ack('a'.repeat(64)));
  await initial.close();
  const foreignDb = nodeDriver(path);
  await assert.rejects(FlightReviewStore.open(foreignDb, targetB, gate), /Foreign or malformed/);
  await foreignDb.close();
  const reopened = await FlightReviewStore.open(nodeDriver(path), targetA, gate);
  try {
    assert.equal((await reopened.list()).length, 1);
  } finally {
    await reopened.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('open and list reject malformed persisted acknowledgment rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-flight-review-corrupt-'));
  const path = join(dir, 'review.sqlite');
  const db = nodeDriver(path);
  const store = await FlightReviewStore.create(db, targetA, gate);
  try {
    await store.acknowledge(ack('a'.repeat(64)));
    await db.run('UPDATE flight_review_acknowledgments SET payload_sha256=?', 'not-a-sha');
    await assert.rejects(store.list(), /Invalid flight acknowledgment/);
    await store.close();
    const corrupted = nodeDriver(path);
    await assert.rejects(FlightReviewStore.open(corrupted, targetA, gate), /Invalid flight acknowledgment/);
    await corrupted.close();
  } finally {
    await store.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid or extended acknowledgments are rejected before writing', async () => {
  const db = nodeDriver(':memory:');
  const store = await FlightReviewStore.create(db, targetA, gate);
  try {
    await assert.rejects(store.acknowledge({ ...ack('A'.repeat(64)) }), /Invalid flight acknowledgment/);
    await assert.rejects(store.acknowledge({ ...ack('a'.repeat(64)), unexpected: true } as FlightAcknowledgment), /Invalid flight acknowledgment/);
    await assert.rejects(store.acknowledge(ack('a'.repeat(64), 0)), /Invalid flight acknowledgment/);
    assert.deepEqual(await store.list(), []);
  } finally {
    await store.close();
  }
});

test('a revoked gate after the insert rolls back the acknowledgment', async () => {
  const base = nodeDriver(':memory:');
  let armed = false;
  let revoked = false;
  const db: Driver = {
    exec: (...args) => base.exec(...args),
    run: (...args) => base.run(...args),
    all: <T>(sql: string, ...params: Bind[]) => base.all<T>(sql, ...params),
    first: <T>(sql: string, ...params: Bind[]) => base.first<T>(sql, ...params),
    close: () => base.close(),
    transaction: work => base.transaction(tx => {
      const wrapped: Connection = {
        exec: (...args) => tx.exec(...args),
        run: async (sql, ...params) => {
          await tx.run(sql, ...params);
          if (armed && sql.includes('INSERT INTO flight_review_acknowledgments')) revoked = true;
        },
        all: <T>(sql: string, ...params: Bind[]) => tx.all<T>(sql, ...params),
        first: <T>(sql: string, ...params: Bind[]) => tx.first<T>(sql, ...params),
      };
      return work(wrapped);
    }),
  };
  const store = await FlightReviewStore.create(db, targetA, async () => { if (revoked) throw new Error('scope expired'); });
  try {
    armed = true;
    await assert.rejects(store.acknowledge(ack('a'.repeat(64))), /scope expired/);
    armed = false; revoked = false;
    assert.deepEqual(await store.list(), []);
  } finally {
    await store.close();
  }
});

test('target and acknowledgment inputs are pinned before asynchronous gate waits', async () => {
  const db = nodeDriver(':memory:');
  let pause = true;
  let entered!: () => void;
  let release!: () => void;
  let didEnter = new Promise<void>(resolve => { entered = resolve; });
  let barrier = new Promise<void>(resolve => { release = resolve; });
  const heldGate = async () => {
    if (pause) {
      pause = false;
      entered();
      await barrier;
    }
  };
  const target = { ...targetA };
  const opening = FlightReviewStore.create(db, target, heldGate);
  await didEnter;
  target.ownerId = ownerB;
  target.storeId = storeB;
  release();
  const store = await opening;
  try {
    assert.equal((await db.first<{ owner_id: string }>('SELECT owner_id FROM flight_review_manifest'))?.owner_id, ownerA);

    pause = true;
    didEnter = new Promise<void>(resolve => { entered = resolve; });
    barrier = new Promise<void>(resolve => { release = resolve; });
    const request = ack('c'.repeat(64), 4, 'd'.repeat(64));
    const writing = store.acknowledge(request);
    await didEnter;
    request.flightId = 'e'.repeat(64);
    request.revision = 9;
    request.payloadSha256 = 'f'.repeat(64);
    release();
    await writing;
    assert.deepEqual(await store.list(), [ack('c'.repeat(64), 4, 'd'.repeat(64))]);
  } finally {
    await store.close();
  }
});

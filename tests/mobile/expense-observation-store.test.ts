import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { Driver, Hash } from '../../packages/local-data/src/index.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { decodeFlightBillingObservation, type FlightBillingObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-flight-billing.ts';
import type { FinancialLedgerObservation, FinancialObservationTarget } from '../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { nodeDriver } from './sqlite-driver.ts';

const scope: ProviderScope = { version: 1, owner: 'owner-a', connectionId: 'connection-a', context: {
  accountNumber: '10001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number',
} };
const target: FinancialObservationTarget = { storeId: '11111111-1111-4111-8111-111111111111', scope };
const at = '2026-10-30T12:00:00.000Z';
const hash: Hash = async text => createHash('sha256').update(text, 'utf8').digest('hex');
function flight(id = '12345', retrievedAt = at): FlightBillingObservation {
  const url = `https://vereinsflieger.de/member/profile/viewflight.php?flid=${id}`;
  return decodeFlightBillingObservation({ url, sourceFlightId: id, registrationRaw: 'D-TEST', dateRaw: '31.05.2026',
    billingModeRaw: 'Pilot', billedRaw: 'Ja', clubLabel: scope.context.clubLabel, lines: [
      { position: 0, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Flight fee', amountRaw: '2,40 EUR' },
      { position: 1, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Winch fee', amountRaw: '4,00 EUR' },
    ], statedTotalRaw: '6,40 EUR' }, { ...target, ownRecipientLabel: 'Example, Alex', observedDetailUrl: url },
  target, scope.context, scope.context, retrievedAt);
}
function ledger(selector = '101', label = 'Synthetic member'): FinancialLedgerObservation {
  const url = `https://vereinsflieger.de/member/profile/account.php?caid=${selector}`;
  return { version: 1, storeId: target.storeId, scope: structuredClone(scope), contextBefore: structuredClone(scope.context),
    contextAfter: structuredClone(scope.context), sourceAccount: { selector, label }, ownNavigation: { label, url },
    pageAccountLabel: label, sourceUrl: url, reportedRowCount: 1,
    capture: { version: 1, id: 'capture-a', retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId,
      sourceIdentity: 'provisional-observed-profile', category: 'ledger', path: '/member/profile/account.php',
      columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'booking', label: 'BuchungsNr.', index: 1 },
        { key: 'invoice', label: 'Abrechnung', index: 2 }, { key: 'information', label: 'Informationen', index: 3 },
        { key: 'value', label: 'Wert (EUR)', index: 4 }, { key: 'balance', label: 'Saldo (EUR)', index: 5 }],
      rows: [{ position: 0, values: ['30.06.2026', 'repeated-booking', 'INV-A', 'Raw movement', '-10,00', '90,00'] }],
      filters: ['Jahr 2026'], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } } };
}
function guardState() {
  const state = { selected: structuredClone(target), writable: true };
  const authorize = async (mode: 'read' | 'write', held: FinancialObservationTarget) => {
    if (canonical(held) !== canonical(state.selected) || mode === 'write' && !state.writable) throw new Error('Synthetic selection revoked.');
  };
  return { state, authorize };
}
async function memory(customHash = hash) {
  const db = nodeDriver(':memory:'), g = guardState(), store = new FinancialObservationStore(db, target, customHash, g.authorize);
  await store.initialize(true); return { db, store, ...g };
}

test('real SQLite round-trips raw flights and separately attributed ledgers after close/reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-observations-')), path = join(directory, 'raw.sqlite');
  const g = guardState(); let db: Driver | null = nodeDriver(path);
  try {
    let store = new FinancialObservationStore(db, target, hash, g.authorize); await store.initialize(true);
    const input = flight(), member = ledger(), allowance = ledger('202', 'Synthetic allowance');
    allowance.capture.rows[0]!.values[4] = '4,00';
    const a = await store.save('flight-first', 'billed-flight', input);
    const b = await store.save('member-first', 'ledger', member), c = await store.save('allowance-first', 'ledger', allowance);
    assert.notEqual(b.sourceKey, c.sourceKey);
    assert.deepEqual((b.value as FinancialLedgerObservation).capture.rows[0]!.values[1], (c.value as FinancialLedgerObservation).capture.rows[0]!.values[1]);
    await db.close(); db = nodeDriver(path);
    store = new FinancialObservationStore(db, target, hash, g.authorize); await store.initialize();
    assert.deepEqual(await store.find('flight-first'), a);
    assert.deepEqual((await store.find('member-first'))!.value, member);
    assert.deepEqual((await store.find('allowance-first'))!.value, allowance);
    assert.deepEqual((await store.history(0, 2)).receipts.map(r => r.id), ['allowance-first', 'member-first']);
    assert.deepEqual((await store.history(2, 2)).receipts.map(r => r.id), ['flight-first']);
    assert.equal((await store.history()).total, 3);
    assert.deepEqual((await store.find('flight-first'))!.value, input);
  } finally {
    await db?.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  }
});

test('serialized concurrent identical retries share one receipt; changed reuse preserves the original', async () => {
  const f = await memory();
  try {
    const input = flight(), [a, b] = await Promise.all([f.store.save('retry-id', 'billed-flight', input), f.store.save('retry-id', 'billed-flight', input)]);
    assert.deepEqual(a, b); assert.equal((await f.store.history()).total, 1);
    const changed = flight(); changed.source.statedTotalRaw = '9,00 EUR';
    await assert.rejects(f.store.save('retry-id', 'billed-flight', changed), /identity conflict/);
    assert.deepEqual((await f.store.find('retry-id'))!.value, input);
    assert.equal((await f.store.history()).total, 1);
    await f.store.save('new-id', 'billed-flight', changed);
    assert.equal((await f.store.history()).total, 2, 'failed jobs do not poison the queue');
  } finally { await f.db.close(); }
});

test('same-source time/repeat never selects a winner; changed evidence stays an explicit conflict', async () => {
  const f = await memory();
  try {
    assert.deepEqual(await f.store.assessFlight('12345'), { state: 'missing', total: 0, variants: [] });
    await f.store.save('old', 'billed-flight', flight());
    await f.store.save('same-later', 'billed-flight', flight('12345', '2026-10-31T12:00:00.000Z'));
    assert.deepEqual(await f.store.assessFlight('12345'), { state: 'consistent', total: 2, variants: [['old', 'same-later']] });
    const changed = flight('12345', '2026-11-01T12:00:00.000Z'); changed.source.lines[0]!.amountRaw = 'unknown';
    await f.store.save('changed', 'billed-flight', changed);
    await f.store.save('different-flight', 'billed-flight', flight('67890'));
    assert.deepEqual(await f.store.assessFlight('12345'), { state: 'conflict', total: 3, variants: [['old', 'same-later'], ['changed']] });
    assert.equal((await f.store.assessFlight('67890')).state, 'consistent');
    assert.deepEqual((await f.store.find('old'))!.value, flight());
    assert.equal('revision' in (await f.store.find('changed'))!, false);
  } finally { await f.db.close(); }
});

test('assessment cannot claim consistency from truncated local history', async () => {
  const f = await memory();
  try {
    for (let i = 0; i < 21; i++) await f.store.save(`receipt-${i}`, 'billed-flight', flight());
    assert.deepEqual(await f.store.assessFlight('12345'), { state: 'history-limit', total: 21, variants: [] });
    assert.equal((await f.store.history()).receipts.length, 20);
    assert.equal((await f.store.history(20)).receipts.length, 1);
  } finally { await f.db.close(); }
});

for (const [name, change] of [
  ['owner', (t: FinancialObservationTarget) => { t.scope.owner = 'owner-b'; }],
  ['store', (t: FinancialObservationTarget) => { t.storeId = '22222222-2222-4222-8222-222222222222'; }],
  ['connection', (t: FinancialObservationTarget) => { t.scope.connectionId = 'connection-b'; }],
  ['provider account', (t: FinancialObservationTarget) => { t.scope.context.accountNumber = '10002'; }],
  ['club', (t: FinancialObservationTarget) => { t.scope.context.clubLabel = 'Other club'; }],
] as const) test(`foreign ${name} cannot open, read, or write the existing financial file`, async () => {
  const f = await memory();
  try {
    await f.store.save('original', 'billed-flight', flight());
    change(f.state.selected);
    await assert.rejects(f.store.find('original'));
    await assert.rejects(f.store.save('foreign', 'billed-flight', flight()));
    await assert.rejects(f.store.assessFlight('12345'));
    const other = new FinancialObservationStore(f.db, f.state.selected, hash, async () => {});
    await assert.rejects(other.initialize(), /Foreign/);
    await assert.rejects(other.history(), /Foreign/);
    f.state.selected = structuredClone(target);
    assert.equal((await f.store.history()).total, 1); assert.equal(await f.store.find('foreign'), null);
  } finally { await f.db.close(); }
});

test('read-only/expired selection preserves saved data; input and exposed target cannot mutate the held scope', async () => {
  const db = nodeDriver(':memory:'), selected = structuredClone(target), g = guardState();
  const store = new FinancialObservationStore(db, selected, hash, g.authorize);
  try {
    await store.initialize(true); await store.save('original', 'billed-flight', flight());
    selected.scope.owner = 'mutated-input'; store.target.scope.owner = 'mutated-output';
    g.state.writable = false;
    assert.equal((await store.find('original'))!.value.scope.owner, 'owner-a');
    await assert.rejects(store.save('blocked', 'billed-flight', flight()));
    assert.equal((await store.history()).total, 1);
    g.state.selected.scope.context.accountNumber = '10002';
    await assert.rejects(store.history());
    g.state.selected = structuredClone(target); assert.equal((await store.find('original'))!.id, 'original');
  } finally { await db.close(); }
});

test('mutation and account switch during asynchronous hashing cannot change or admit the queued write', async () => {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>(r => { entered = r; }), gate = new Promise<void>(r => { release = r; });
  const f = await memory(async text => { entered(); await gate; return hash(text); });
  try {
    const value = flight(), original = structuredClone(value), pending = f.store.save('delayed', 'billed-flight', value);
    value.source.lines[0]!.amountRaw = '999,00 EUR';
    await ready; f.state.selected.scope.owner = 'owner-b'; release();
    await assert.rejects(pending);
    f.state.selected = structuredClone(target); assert.equal((await f.store.history()).total, 0);
    await f.store.save('retry', 'billed-flight', original);
    assert.deepEqual((await f.store.find('retry'))!.value, original);
  } finally { release(); await f.db.close(); }
});

test('a switch after insertion but before commit rolls the write back', async () => {
  const db = nodeDriver(':memory:'), g = guardState(); let stop = false;
  const wrapped: Driver = { ...db, transaction: work => db.transaction(tx => work({ ...tx, run: async (sql, ...params) => {
    await tx.run(sql, ...params);
    if (stop && sql.startsWith('INSERT INTO financial_observations')) { stop = false; g.state.selected.scope.owner = 'owner-b'; }
  } })) };
  const store = new FinancialObservationStore(wrapped, target, hash, g.authorize);
  try {
    await store.initialize(true); await store.save('original', 'billed-flight', flight()); stop = true;
    await assert.rejects(store.save('interrupted', 'billed-flight', flight()));
    g.state.selected = structuredClone(target);
    assert.equal(await store.find('interrupted'), null); assert.equal((await store.history()).total, 1);
  } finally { await db.close(); }
});

test('revocation after commit leaves an uncertain own-scope receipt that is reconciled, never replayed into another owner', async () => {
  const db = nodeDriver(':memory:'), g = guardState(); let stop = false;
  const wrapped: Driver = { ...db, transaction: async work => {
    await db.transaction(work); if (stop) { stop = false; g.state.selected.scope.owner = 'owner-b'; }
  } };
  const store = new FinancialObservationStore(wrapped, target, hash, g.authorize);
  try {
    await store.initialize(true); stop = true;
    await assert.rejects(store.save('uncertain', 'billed-flight', flight()));
    await assert.rejects(store.find('uncertain'));
    g.state.selected = structuredClone(target);
    const found = await store.find('uncertain'); assert.ok(found);
    assert.deepEqual(await store.save('uncertain', 'billed-flight', flight()), found);
    assert.equal((await store.history()).total, 1);
  } finally { await db.close(); }
});

for (const [name, change] of [
  ['version', (v: FlightBillingObservation) => { (v as { version: number }).version = 2; }],
  ['foreign owner', (v: FlightBillingObservation) => { v.scope.owner = 'owner-b'; }],
  ['foreign store', (v: FlightBillingObservation) => { v.storeId = '22222222-2222-4222-8222-222222222222'; }],
  ['foreign recipient', (v: FlightBillingObservation) => { v.source.lines[0]!.recipientRaw = 'Other, Person'; }],
  ['promoted interpretation', (v: FlightBillingObservation) => { (v as { interpretation: string }).interpretation = 'verified-expense'; }],
  ['complete coverage', (v: FlightBillingObservation) => { (v as { coverage: string }).coverage = 'complete'; }],
  ['unbilled source', (v: FlightBillingObservation) => { (v.source as { billedRaw: string }).billedRaw = 'Nein'; }],
] as const) test(`reject saved observation ${name} without changing the store`, async () => {
  const f = await memory();
  try {
    const value = flight(); change(value); await assert.rejects(f.store.save('invalid', 'billed-flight', value));
    assert.equal((await f.store.history()).total, 0);
  } finally { await f.db.close(); }
});

test('schema, receipt identity, integrity and read windows fail closed without reset', async () => {
  const f = await memory();
  try {
    await f.store.save('original', 'billed-flight', flight());
    await assert.rejects(f.db.run("UPDATE financial_observations SET payload='{}'"), /Immutable/);
    await assert.rejects(f.db.run('DELETE FROM financial_observations'), /Immutable/);
    await assert.rejects(f.db.run("UPDATE financial_manifest SET family='other'"), /Immutable/);
    for (const id of ['', '../other', 'x'.repeat(101)]) await assert.rejects(f.store.find(id));
    for (const [offset, limit] of [[-1, 20], [0, 21], [0, 0], [0.5, 1]]) await assert.rejects(f.store.history(offset, limit));
    await f.db.exec('DROP TRIGGER financial_no_update');
    await f.db.run("UPDATE financial_observations SET checksum=? WHERE id='original'", '0'.repeat(64));
    await assert.rejects(f.store.find('original'), /Corrupt/);
    await assert.rejects(f.store.history(), /Corrupt/);
    await assert.rejects(f.store.assessFlight('12345'), /Corrupt/);
  } finally { await f.db.close(); }
  const db = nodeDriver(':memory:');
  try {
    await db.exec('CREATE TABLE existing(value TEXT)'); await db.run('INSERT INTO existing VALUES (?)', 'preserved');
    const store = new FinancialObservationStore(db, target, hash, async () => {});
    await assert.rejects(store.initialize(true));
    assert.equal((await db.first<{ value: string }>('SELECT value FROM existing'))!.value, 'preserved');
  } finally { await db.close(); }
});

test('a recomputed checksum cannot admit foreign payloads, and corrupt JSON never appears in error text', async () => {
  const f = await memory();
  try {
    const original = await f.store.save('original', 'billed-flight', flight());
    await f.db.exec('DROP TRIGGER financial_no_update');
    const foreign = flight(); foreign.scope.owner = 'owner-b';
    const checksum = await hash(canonical({ id: original.id, kind: original.kind, sourceKey: original.sourceKey,
      retrievedAt: original.retrievedAt, value: foreign }));
    await f.db.run('UPDATE financial_observations SET payload=?,checksum=? WHERE id=?', canonical(foreign), checksum, original.id);
    await assert.rejects(f.store.find('original'));
    await f.db.exec('PRAGMA ignore_check_constraints=ON');
    await f.db.run('UPDATE financial_observations SET payload=? WHERE id=?', '{"SYNTHETIC_PRIVATE_FRAGMENT"', original.id);
    await assert.rejects(f.store.find('original'), error => error instanceof Error && error.message === 'Corrupt financial observation payload.');
  } finally { await f.db.close(); }
});

test('unsupported schemas and empty-file read opens never reset or silently create data', async () => {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {});
  try {
    await assert.rejects(store.initialize());
    assert.equal((await db.all("SELECT name FROM sqlite_master WHERE type='table'")).length, 0);
    await store.initialize(true); await store.save('original', 'billed-flight', flight());
    await db.exec('PRAGMA user_version=2');
    await assert.rejects(store.initialize(true)); await assert.rejects(store.find('original'));
    assert.equal((await db.first<{ total: number }>('SELECT count(*) total FROM financial_observations'))!.total, 1);
  } finally { await db.close(); }
});

test('invalid/unavailable integrity hashing cannot write data or disclose input through errors', async () => {
  for (const badHash of [async () => 'invalid', async () => { throw new Error('SYNTHETIC_PRIVATE_FRAGMENT'); }]) {
    const f = await memory(badHash);
    try {
      await assert.rejects(f.store.save('invalid-hash', 'billed-flight', flight()), error => error instanceof Error &&
        !error.message.includes('SYNTHETIC_PRIVATE_FRAGMENT'));
      assert.equal((await f.store.history()).total, 0);
    } finally { await f.db.close(); }
  }
});

test('UTF-8 observation byte limits reject oversized raw ledgers without truncating saved history', async () => {
  const f = await memory();
  try {
    await f.store.save('original', 'ledger', ledger());
    const large = ledger(); large.reportedRowCount = 20;
    large.capture.rows = Array.from({ length: 20 }, (_, position) => ({ position,
      values: ['30.06.2026', 'booking', 'invoice', '界'.repeat(8192), '-10,00', '90,00'] }));
    await assert.rejects(f.store.save('too-large', 'ledger', large), /size limit/);
    assert.equal((await f.store.history()).total, 1);
    assert.deepEqual((await f.store.find('original'))!.value, ledger());
  } finally { await f.db.close(); }
});

test('a real interrupted SQLite transaction recovers after process death and permits the same-receipt retry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-crash-')), path = join(directory, 'raw.sqlite');
  let db: Driver | null = nodeDriver(path);
  try {
    let store = new FinancialObservationStore(db, target, hash, async () => {}); await store.initialize(true);
    const original = await store.save('original', 'billed-flight', flight()); await db.close(); db = null;
    const child = `
import {readFileSync} from 'node:fs'; import {createHash} from 'node:crypto';
import {nodeDriver} from ${JSON.stringify(new URL('./sqlite-driver.ts', import.meta.url).href)};
import {FinancialObservationStore} from ${JSON.stringify(new URL('../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts', import.meta.url).href)};
const input=JSON.parse(readFileSync(0,'utf8')), db=nodeDriver(input.path);
const wrapped={...db,transaction:work=>db.transaction(tx=>work({...tx,run:async(sql,...args)=>{await tx.run(sql,...args);if(sql.startsWith('INSERT INTO financial_observations'))process.exit(73);}}))};
const store=new FinancialObservationStore(wrapped,input.target,async text=>createHash('sha256').update(text).digest('hex'),async()=>{});
await store.initialize(); await store.save('interrupted','billed-flight',input.value); process.exit(74);
`;
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', child], {
      input: JSON.stringify({ path, target, value: flight() }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 73, result.stderr);
    db = nodeDriver(path); store = new FinancialObservationStore(db, target, hash, async () => {}); await store.initialize();
    assert.deepEqual(await store.find('original'), original); assert.equal(await store.find('interrupted'), null);
    await store.save('interrupted', 'billed-flight', flight()); assert.equal((await store.history()).total, 2);
  } finally {
    await db?.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  }
});

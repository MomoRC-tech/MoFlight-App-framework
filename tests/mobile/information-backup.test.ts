import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { InformationStore, validateInformationBackup } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { validateInformationCapture, type InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { nodeDriver } from './sqlite-driver.ts';

const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection',
  context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const otherScope: ProviderScope = { ...scope, owner: 'other-owner', connectionId: 'other-connection' };
const at = '2026-10-23T10:00:00.000Z';
const hash = async (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

function capture(id: string, category: 'medical' | 'work-hours' | 'duties', retrievedAt = at): InformationCapture {
  const config = category === 'medical'
    ? { path: '/member/profile/viewprofile', columns: [
      { key: 'kind', label: 'Medical-Art', index: 0 }, { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 },
    ], values: ['Synthetic medical class', '31.12.2027'], filters: [] as string[] }
    : category === 'duties'
      ? { path: '/member/profile/myservices.php', columns: [
        { key: 'duty', label: 'Dienst', index: 0 }, { key: 'period', label: 'Zeitraum', index: 1 },
        { key: 'people', label: 'Person(en)', index: 2 },
      ], values: ['Synthetic duty', 'October 2026', 'Synthetic other member'], filters: ['Aktuelle und anstehende Dienste'] }
      : { path: '/member/profile/workhours/list', columns: [
      { key: 'date', label: 'Datum', index: 0 }, { key: 'activity', label: 'Tätigkeit', index: 1 },
      { key: 'hours', label: 'Stunden', index: 2 }, { key: 'status', label: 'Status', index: 3 },
    ], values: ['01.10.2026', 'Synthetic work', '0.00', 'Akzeptiert'], filters: ['2026'] };
  return validateInformationCapture({ version: 1, id, retrievedAt, owner: scope.owner, connectionId: scope.connectionId,
    sourceIdentity: 'provisional-observed-profile', category, path: config.path, columns: config.columns,
    rows: [{ position: 1, values: config.values }], filters: config.filters, empty: false,
    coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } });
}

const child = `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nodeDriver } from ${JSON.stringify(new URL('./sqlite-driver.ts', import.meta.url).href)};
import { InformationStore } from ${JSON.stringify(new URL('../../apps/platform-lab/src/vereinsflieger/information-store.ts', import.meta.url).href)};
const input=JSON.parse(readFileSync(0,'utf8'));
const hash=async value=>createHash('sha256').update(value,'utf8').digest('hex');
const db=nodeDriver(input.path), store=new InformationStore(db,input.scope,async()=>{});
await store.initialize();
await store.restoreBackup(input.backup,hash,async stage=>{if(stage==='after-capture')process.exit(73)});
throw new Error('restore interruption point was not reached');
`;

test('populated source and Medical history restore to a same-scope candidate with exact history order and unchanged original', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-backup-'));
  const originalPath = join(dir, 'original.sqlite'), candidatePath = join(dir, 'candidate.sqlite');
  let originalDb = nodeDriver(originalPath), candidateDb = nodeDriver(candidatePath);
  try {
    let original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    const firstMedical = capture('medical-first', 'medical', '2026-10-20T10:00:00.000Z');
    const secondMedical = capture('medical-second', 'medical', '2026-10-23T10:00:00.000Z');
    const work = capture('work-hours-source', 'work-hours');
    await original.save(firstMedical); await original.save(work); await original.save(secondMedical);
    const excludedDuty = capture('duty-with-other-member', 'duties'); await original.save(excludedDuty);
    const expected = await original.exportBackup(hash), originalBytes = await readFile(originalPath);
    const envelope = JSON.parse(expected) as { payload: string };
    const payload = JSON.parse(envelope.payload) as { captures: InformationCapture[]; excludedCategories: string[] };
    assert.deepEqual(payload.excludedCategories.includes('duties'), true);
    assert.equal(payload.captures.some(value => value.id === excludedDuty.id), false,
      'raw duty evidence naming another member remains in the local original and is excluded from the archive');

    let candidate = new InformationStore(candidateDb, scope, async () => {}); await candidate.initialize();
    const injectedPayload = canonical({ ...payload, captures: [...payload.captures, excludedDuty] });
    const injectedArchive = canonical({ ...JSON.parse(expected), payload: injectedPayload, checksum: await hash(injectedPayload) });
    await assert.rejects(candidate.restoreBackup(injectedArchive, hash), /excluded/);
    assert.equal((await candidateDb.first<{ count: number }>('SELECT count(*) AS count FROM information_captures'))!.count, 0,
      'a recomputed checksum cannot bypass the category allowlist');
    await candidate.restoreBackup(expected, hash);
    assert.equal(await candidate.exportBackup(hash), expected);
    assert.deepEqual(await candidate.history('medical', 0), { category: 'medical', index: 0, total: 2, capture: secondMedical });
    assert.deepEqual(await candidate.history('medical', 1), { category: 'medical', index: 1, total: 2, capture: firstMedical });
    assert.deepEqual(await candidate.latest(), [secondMedical, work].sort((a, b) => a.category.localeCompare(b.category)));
    await candidateDb.close(); candidateDb = nodeDriver(candidatePath); candidate = new InformationStore(candidateDb, scope, async () => {});
    await candidate.initialize(false); assert.equal(await candidate.exportBackup(hash), expected);
    assert.deepEqual(await readFile(originalPath), originalBytes);
  } finally { await originalDb.close(); await candidateDb.close(); await rm(dir, { recursive: true, force: true }); }
});

test('foreign, corrupt and unsupported information backups are rejected before candidate rows are written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-backup-refusal-'));
  const sourceDb = nodeDriver(join(dir, 'source.sqlite')), candidateDb = nodeDriver(join(dir, 'candidate.sqlite'));
  try {
    const source = new InformationStore(sourceDb, otherScope, async () => {}); await source.initialize();
    await source.save({ ...capture('foreign-medical', 'medical'), owner: otherScope.owner, connectionId: otherScope.connectionId });
    const foreign = await source.exportBackup(hash);
    const candidate = new InformationStore(candidateDb, scope, async () => {}); await candidate.initialize();
    for (const text of [foreign, '{}', foreign.slice(0, -1) + ' ']) {
      await assert.rejects(candidate.restoreBackup(text, hash));
      assert.equal((await candidateDb.first<{ count: number }>('SELECT count(*) AS count FROM information_captures'))!.count, 0);
    }
    await assert.rejects(validateInformationBackup(foreign, scope, hash));
  } finally { await sourceDb.close(); await candidateDb.close(); await rm(dir, { recursive: true, force: true }); }
});

test('interrupted Medical restore rolls back all rows and the identical validated archive can be retried', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-backup-process-'));
  const originalPath = join(dir, 'original.sqlite'), candidatePath = join(dir, 'candidate.sqlite');
  let originalDb: ReturnType<typeof nodeDriver> | null = nodeDriver(originalPath), candidateDb: ReturnType<typeof nodeDriver> | null = null;
  try {
    const original = new InformationStore(originalDb!, scope, async () => {}); await original.initialize();
    await original.save(capture('medical-a', 'medical', '2026-10-20T10:00:00.000Z'));
    await original.save(capture('medical-b', 'medical', '2026-10-21T10:00:00.000Z'));
    await original.save(capture('medical-c', 'medical', '2026-10-22T10:00:00.000Z'));
    const backup = await original.exportBackup(hash), originalBytes = await readFile(originalPath); await originalDb!.close(); originalDb = null;

    const run = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', child], {
      input: JSON.stringify({ path: candidatePath, backup, scope }), encoding: 'utf8', timeout: 20_000,
    });
    assert.ifError(run.error); assert.equal(run.status, 73, run.stderr);

    candidateDb = nodeDriver(candidatePath); const candidate = new InformationStore(candidateDb, scope, async () => {});
    await candidate.initialize(false);
    assert.equal((await candidateDb.first<{ count: number }>('SELECT count(*) AS count FROM information_captures'))!.count, 0,
      'the abandoned SQLite transaction must not publish a partial history');
    await candidate.restoreBackup(backup, hash);
    assert.equal(await candidate.exportBackup(hash), backup);
    assert.equal((await candidate.history('medical', 0)).total, 3);
    originalDb = nodeDriver(originalPath); const reopenedOriginal = new InformationStore(originalDb, scope, async () => {});
    await reopenedOriginal.initialize(false); assert.deepEqual(await readFile(originalPath), originalBytes);
    assert.equal((await reopenedOriginal.history('medical', 2)).capture?.id, 'medical-a');
  } finally { await originalDb?.close(); await candidateDb?.close(); await rm(dir, { recursive: true, force: true }); }
});

test('restore refuses to append or replace an existing information store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-backup-original-'));
  const db = nodeDriver(join(dir, 'current.sqlite'));
  try {
    const current = new InformationStore(db, scope, async () => {}); await current.initialize();
    await current.save(capture('current-medical', 'medical'));
    const before = await current.exportBackup(hash);
    await assert.rejects(current.restoreBackup(before, hash), /empty information candidate/);
    assert.equal(await current.exportBackup(hash), before);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightCommandJournal } from '../../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import type { RealFlightCommand } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';

const ownerId = '11111111-1111-4111-8111-111111111111', storeId = '22222222-2222-4222-8222-222222222222';
const at = '2026-10-20T10:00:00.000Z';
const hash = async (value: string) => createHash('sha256').update(value).digest('hex');
const authorize = () => ({ ownerId, storeId, leaseId: 'host-restart-test', writable: true });
const manifest = { singleton: 1 as const, family: 'moflight-real-flight-history' as const, schema_version: 1 as const,
  payload_version: 1 as const, owner_id: ownerId, store_id: storeId, created_at: at };
async function removeFixtureDirectory(directory: string) {
  const target = resolve(directory);
  assert.equal(dirname(target), resolve(tmpdir()));
  assert.match(basename(target), /^moflight-(process|restore)-recovery-/);
  await rm(target, { recursive: true, force: true });
}
function source(captureId: string): RealFlightSourceInput {
  const context = { accountNumber: '101', clubLabel: 'Example club', clubIdentity: 'display-label-only' as const,
    verification: 'observed-profile-number' as const };
  return { version: 1, binding: { provider: 'vereinsflieger', accountRef: '101' }, contextBefore: context, contextAfter: { ...context },
    requestedWindow: { from: '2026-10-01', to: '2026-10-20', participation: 'Pilot oder Fluglehrer' },
    capture: { captureId, retrievedAt: at, headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'],
      rows: [{ sourceFlightId: '9001', values: ['20.10.2026', 'D-TEST', '10:00', '10:12', '12', 'Example pilot'] }],
      sourceIdentity: 'unverified', timeBasis: 'unknown', coverage: 'complete-requested-list',
      exportContext: { from: '2026-10-01', to: '2026-10-20', preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer',
        accountLabel: 'Example account', recordCount: 1, pageCount: 1, columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } } };
}

// Abrupt process exit deliberately skips Driver.close(), catch/rollback and JS
// finalizers. This exercises SQLite recovery of actual files, not physical
// power-loss durability or compatibility with an unselected older app binary.
const child = `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { nodeDriver } from ${JSON.stringify(new URL('./sqlite-driver.ts', import.meta.url).href)};
import { RealFlightLibrary } from ${JSON.stringify(new URL('../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts', import.meta.url).href)};
const input = JSON.parse(readFileSync(0, 'utf8'));
const hash = async value => createHash('sha256').update(value).digest('hex');
const authorize = () => input.permit;
const interrupt = async stage => { if (stage === input.stage) process.exit(73); };
if (input.backup) {
  await RealFlightLibrary.restoreIntoEmptyValidated(nodeDriver(input.path), input.backup,
    input.permit.ownerId, input.permit.storeId, hash, authorize, interrupt);
} else {
  const library = await RealFlightLibrary.open(nodeDriver(input.path), input.permit.ownerId,
    input.permit.storeId, hash, authorize, interrupt);
  await library.commit(input.command);
}
throw new Error('The requested interruption point was not reached');
`;
function interrupt(input: { path: string; stage: string; command?: RealFlightCommand; backup?: string }) {
  const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', child], {
    input: JSON.stringify({ ...input, permit: authorize() }), encoding: 'utf8', timeout: 20_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 73, `Child must exit at the requested durable boundary: ${result.stderr}`);
}
async function seed(path: string) {
  const library = await RealFlightLibrary.create(nodeDriver(path), manifest, hash, authorize);
  await library.bindAccount({ kind: 'bind', commandId: '00000000-0000-4000-8000-000000000001',
    baseGeneration: 0, source: source('binding-capture'), at });
  return library;
}

for (const stage of ['after-facts', 'after-commit']) {
  test(`same-v1 saved files recover a durable command after abrupt process exit at ${stage}`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'moflight-process-recovery-'));
    const path = join(directory, 'history.sqlite'), journalPath = join(directory, 'commands.sqlite');
    try {
      const library = await seed(path), input = source('import-capture'), plan = await library.prepareImport(input);
      const before = await library.snapshot();
      const command: RealFlightCommand = { version: 1, kind: 'import-unassigned', ownerId, storeId,
        commandId: '00000000-0000-4000-8000-000000000002', baseGeneration: plan.baseGeneration,
        bindingId: plan.bindingId, planToken: plan.planToken, source: input, at };
      const journal = await RealFlightCommandJournal.open(nodeDriver(journalPath), ownerId, storeId, authorize, hash, true);
      await journal.prepare(command); await journal.close(); await library.close();

      interrupt({ path, stage, command });

      const reopened = await RealFlightLibrary.open(nodeDriver(path), ownerId, storeId, hash, authorize);
      const recoveredJournal = await RealFlightCommandJournal.open(nodeDriver(journalPath), ownerId, storeId, authorize, hash);
      try {
        assert.deepEqual(await recoveredJournal.pending(), command);
        const receipt = await reopened.recoverReceipt(command.commandId);
        assert.equal(receipt.status, stage === 'after-commit' ? 'found' : 'not-found');
        if (stage === 'after-facts') assert.deepEqual(await reopened.snapshot(), before, 'uncommitted receipt/facts/evidence roll back together');
        const result = await reopened.commit(command);
        if (receipt.status === 'found') assert.deepEqual(result, receipt.result);
        await recoveredJournal.resolve(command.commandId, 'committed');
        assert.equal(await recoveredJournal.pending(), null);
        const graph = await reopened.snapshot();
        assert.equal(graph.generation, before.generation + 1);
        assert.equal(graph.receipts.length, before.receipts.length + 1);
        const flights = await reopened.list(); assert.equal(flights.length, 1);
        assert.equal((await reopened.detail(flights[0]!.flightId))?.factHistory.length, 1);
      } finally { await recoveredJournal.close(); await reopened.close(); }
    } finally { await removeFixtureDirectory(directory); }
  });
}

test('abruptly interrupted on-disk restore preserves the original and resumes its initialized candidate after reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-restore-recovery-'));
  const path = join(directory, 'original.sqlite'), candidatePath = join(directory, 'candidate.sqlite');
  try {
    const library = await seed(path), input = source('saved-capture'), plan = await library.prepareImport(input);
    await library.saveUnassigned({ kind: 'import-unassigned', commandId: '00000000-0000-4000-8000-000000000003',
      baseGeneration: plan.baseGeneration, bindingId: plan.bindingId, planToken: plan.planToken, source: input, at });
    const expected = await library.snapshot(), backup = await library.exportBackup(); await library.close();

    interrupt({ path: candidatePath, stage: 'restore-record', backup });

    const original = await RealFlightLibrary.open(nodeDriver(path), ownerId, storeId, hash, authorize);
    try { assert.deepEqual(await original.snapshot(), expected); } finally { await original.close(); }
    const interrupted = await RealFlightLibrary.open(nodeDriver(candidatePath), ownerId, storeId, hash, authorize);
    try {
      const graph = await interrupted.snapshot();
      assert.deepEqual(graph.manifest, expected.manifest); assert.equal(graph.generation, 0);
      assert.deepEqual(graph.receipts, []); assert.deepEqual(graph.records, []);
    } finally { await interrupted.close(); }
    const restored = await RealFlightLibrary.restoreIntoEmptyValidated(nodeDriver(candidatePath), backup, ownerId, storeId, hash, authorize);
    try { assert.deepEqual(await restored.snapshot(), expected); assert.equal(await restored.exportBackup(), backup); }
    finally { await restored.close(); }
    const reopened = await RealFlightLibrary.open(nodeDriver(candidatePath), ownerId, storeId, hash, authorize);
    try { assert.deepEqual(await reopened.snapshot(), expected); } finally { await reopened.close(); }
  } finally { await removeFixtureDirectory(directory); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { validateInformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationStoreSelection, INFORMATION_SELECTION_SCHEMA, informationStoreName, withInformationMutation } from '../../apps/platform-lab/src/vereinsflieger/information-selection.ts';
import { restoreInformationBackup, type InformationBackupPorts } from '../../apps/platform-lab/src/vereinsflieger/information-backup-service.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { nodeDriver } from './sqlite-driver.ts';

const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection',
  context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const otherScope: ProviderScope = { ...scope, owner: 'other-owner', connectionId: 'other-connection' };
const hash = async (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const op1 = '00000000-0000-4000-8000-000000000001';
const op2 = '00000000-0000-4000-8000-000000000002';
const now = () => '2026-10-23T10:00:00.000Z';
function medicalCapture(id: string) {
  return validateInformationCapture({ version: 1, id, retrievedAt: now(), owner: scope.owner, connectionId: scope.connectionId,
    sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
    columns: [{ key: 'kind', label: 'Medical-Art', index: 0 }, { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 }],
    rows: [{ position: 1, values: ['Synthetic class', '31.12.2027'] }], filters: [], empty: false,
    coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } });
}

function ports(directory: string, operationIds = [op1, op2]): InformationBackupPorts {
  const selectionPath = join(directory, 'selection.sqlite');
  let nextId = 0;
  return {
    async openSelection(current, create) {
      if (!existsSync(selectionPath) && !create) return null;
      const existed = existsSync(selectionPath), db = nodeDriver(selectionPath);
      const selection = new InformationStoreSelection(db, current, async () => {});
      try { await selection.initialize(create || !existed); return selection; }
      catch (error) { await db.close(); throw error; }
    },
    informationFileExists: name => existsSync(join(directory, name)),
    async openInformationStore(current, name) {
      return new InformationStore(nodeDriver(join(directory, name)), current, async () => {});
    },
    uuid: () => operationIds[nextId++] ?? op2,
    now,
  };
}

test('selection restore activates only an exact owner-bound candidate and preserves the predecessor', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-selection-'));
  const originalPath = join(directory, informationStoreName(scope));
  const originalDb = nodeDriver(originalPath); let selectionDb: ReturnType<typeof nodeDriver> | null = null;
  let candidateDb: ReturnType<typeof nodeDriver> | null = null;
  try {
    const original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    await original.save(medicalCapture('saved-medical'));
    const backup = await original.exportBackup(hash), originalBytes = await readFile(originalPath);
    const deps = ports(directory);
    const result = await restoreInformationBackup(scope, backup, hash, async () => {}, deps);
    assert.equal(result.state, 'restored');
    if (result.state !== 'restored') return;
    assert.equal(result.databaseName, informationStoreName(scope, op1));
    assert.equal(result.sequence, 1);

    selectionDb = nodeDriver(join(directory, 'selection.sqlite'));
    const selected = new InformationStoreSelection(selectionDb, scope, async () => {});
    await selected.initialize(false);
    assert.equal((await selected.snapshot()).selection?.databaseName, result.databaseName);
    assert.equal((await selected.pending()), null);
    candidateDb = nodeDriver(join(directory, result.databaseName));
    const candidate = new InformationStore(candidateDb, scope, async () => {}); await candidate.initialize(false);
    assert.equal(await candidate.exportBackup(hash), backup);
    assert.deepEqual(await readFile(originalPath), originalBytes);
  } finally { await originalDb.close(); await selectionDb?.close(); await candidateDb?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('interrupted candidate activation remains pending, blocks mutation, and resumes with the same archive', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-recovery-'));
  const originalDb = nodeDriver(join(directory, informationStoreName(scope))); let selectionDb: ReturnType<typeof nodeDriver> | null = null;
  try {
    const original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    await original.save(medicalCapture('resume-medical'));
    const backup = await original.exportBackup(hash), deps = ports(directory);
    let interrupted = false;
    const first = await restoreInformationBackup(scope, backup, hash, async phase => {
      if (phase === 'after-candidate') { interrupted = true; throw new Error('synthetic process interruption'); }
    }, deps);
    assert.equal(interrupted, true);
    assert.deepEqual(first, { state: 'recovery-required', operationId: op1,
      databaseName: informationStoreName(scope, op1), reason: 'restore-or-activation-incomplete' });

    selectionDb = nodeDriver(join(directory, 'selection.sqlite'));
    const selection = new InformationStoreSelection(selectionDb, scope, async () => {}); await selection.initialize(false);
    assert.equal((await selection.snapshot()).selection, null, 'candidate is not visible before pointer activation');
    assert.equal((await selection.pending())?.operationId, op1);
    await assert.rejects(selection.prepareRestore({ operationId: op2, databaseName: informationStoreName(scope, op2),
      backupSha256: await hash(backup), previousSequence: 0, preparedAt: now() }), /pending information restore/);

    const resumed = await restoreInformationBackup(scope, backup, hash, async () => {}, deps, op1);
    assert.equal(resumed.state, 'restored');
    const repeated = await restoreInformationBackup(scope, backup, hash, async () => {}, deps, op1);
    assert.equal(repeated.state, 'already-activated');
    assert.equal((await selection.snapshot()).selection?.databaseName, informationStoreName(scope, op1));
  } finally { await originalDb.close(); await selectionDb?.close(); await rm(directory, { recursive: true, force: true }); }
});

test('foreign scope and altered archive cannot resume an existing preparation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-foreign-'));
  try {
    const originalDb = nodeDriver(join(directory, informationStoreName(scope)));
    const original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    await original.save(medicalCapture('foreign-check'));
    const backup = await original.exportBackup(hash), deps = ports(directory);
    const prepared = await restoreInformationBackup(scope, backup, hash, async phase => {
      if (phase === 'after-candidate') throw new Error('interrupt');
    }, deps);
    assert.equal(prepared.state, 'recovery-required');
    await assert.rejects(restoreInformationBackup(otherScope, backup, hash, async () => {}, deps, op1), /Foreign or unsupported/);
    const alteredDb = nodeDriver(join(directory, 'altered-source.sqlite'));
    const alteredStore = new InformationStore(alteredDb, scope, async () => {}); await alteredStore.initialize();
    await alteredStore.save(medicalCapture('different-medical'));
    const changed = await alteredStore.exportBackup(hash); await alteredDb.close();
    const resumed = await restoreInformationBackup(scope, changed, hash, async () => {}, deps, op1);
    assert.equal(resumed.state, 'recovery-required');
    assert.equal(resumed.operationId, op1);
    await originalDb.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('unsupported selection schema is refused without rewriting its original bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-selection-unsupported-'));
  const path = join(directory, 'selection.sqlite'), db = nodeDriver(path);
  try {
    await db.exec(INFORMATION_SELECTION_SCHEMA.replace('PRAGMA user_version=1;', 'PRAGMA user_version=8;'));
    await db.close(); const before = await readFile(path);
    const reopened = nodeDriver(path), selection = new InformationStoreSelection(reopened, scope, async () => {});
    await assert.rejects(selection.initialize(false), /Unsupported information selection version/);
    await reopened.close(); assert.deepEqual(await readFile(path), before);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a crash after reserving an information candidate but before schema creation is resumable without replacing it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-pristine-'));
  const originalDb = nodeDriver(join(directory, informationStoreName(scope)));
  try {
    const original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    await original.save(medicalCapture('pristine-retry'));
    const backup = await original.exportBackup(hash), deps = ports(directory);
    const candidatePath = join(directory, informationStoreName(scope, op1));
    await (await import('node:fs/promises')).writeFile(candidatePath, '');
    const result = await restoreInformationBackup(scope, backup, hash, async () => {}, deps);
    assert.equal(result.state, 'restored');
    if (result.state === 'restored') {
      const db = nodeDriver(candidatePath), candidate = new InformationStore(db, scope, async () => {});
      try { await candidate.initialize(false); await candidate.verifyBackup(backup, hash); }
      finally { await db.close(); }
    }
  } finally { await originalDb.close(); await rm(directory, { recursive: true, force: true }); }
});

test('a preparation failure without a durable row is not reported as a resumable restore', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-information-unsaved-prepare-'));
  const originalDb = nodeDriver(join(directory, informationStoreName(scope)));
  try {
    const original = new InformationStore(originalDb, scope, async () => {}); await original.initialize();
    await original.save(medicalCapture('unsaved-prepare'));
    const backup = await original.exportBackup(hash), deps = ports(directory);
    const openSelection = deps.openSelection.bind(deps);
    deps.openSelection = async (current, create) => {
      const selection = await openSelection(current, create);
      if (selection) selection.prepareRestore = async () => { throw new Error('preparation was not persisted'); };
      return selection;
    };
    await assert.rejects(restoreInformationBackup(scope, backup, hash, async () => {}, deps), /preparation was not persisted/);
  } finally { await originalDb.close(); await rm(directory, { recursive: true, force: true }); }
});

test('process-wide information mutation lock serializes writers and releases after failure', async () => {
  const order: string[] = []; let release!: () => void;
  const first = withInformationMutation(async () => { order.push('first-start'); await new Promise<void>(resolve => { release = resolve; }); order.push('first-end'); });
  const second = withInformationMutation(async () => { order.push('second'); });
  await new Promise(resolve => { setImmediate(resolve); });
  assert.deepEqual(order, ['first-start']); release(); await Promise.all([first, second]);
  assert.deepEqual(order, ['first-start', 'first-end', 'second']);
  await assert.rejects(withInformationMutation(async () => { throw new Error('test failure'); }), /test failure/);
  await withInformationMutation(async () => { order.push('after-failure'); });
  assert.equal(order.at(-1), 'after-failure');
});

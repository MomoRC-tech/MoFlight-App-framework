import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import {
  clearTaskSelectionRecovery,
  createTaskSelectionRecovery,
  loadPendingTaskSelectionRecovery,
  rememberTaskSelectionRecovery,
} from '../../apps/platform-lab/src/vereinsflieger/task-selection-recovery.ts';
import { nodeDriver } from './sqlite-driver.ts';

const scope: ProviderScope = {
  version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection',
  context: { accountNumber: '12345', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' },
};
const selected = createTaskSelectionRecovery(scope, 'Alle nicht beendeten Aufgaben', 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen', 'task-attempt-a');

test('task selector checkpoint survives close/reopen and clears only after exact same-scope acknowledgement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-task-selector-')); const path = join(dir, 'recovery.sqlite');
  let db = nodeDriver(path);
  try {
    assert.deepEqual(await loadPendingTaskSelectionRecovery(db, scope), null);
    assert.equal(await db.first("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"), null, 'a read leaves the reserved empty journal schema untouched');
    const saved = await rememberTaskSelectionRecovery(db, selected);
    assert.deepEqual(saved, selected);
    assert.deepEqual(await rememberTaskSelectionRecovery(db, selected), selected, 'an exact retry is idempotent');
    await assert.rejects(rememberTaskSelectionRecovery(db, { ...selected, attemptId: 'different-attempt' }), /still pending/);
    await db.close(); db = nodeDriver(path);
    assert.deepEqual(await loadPendingTaskSelectionRecovery(db, scope), selected, 'a new process can recover the exact original selection');
    const foreign: ProviderScope = { ...scope, owner: 'other-owner' };
    await assert.rejects(loadPendingTaskSelectionRecovery(db, foreign), /mismatch/);
    await assert.rejects(clearTaskSelectionRecovery(db, foreign, selected), /mismatch/);
    assert.deepEqual(await loadPendingTaskSelectionRecovery(db, scope), selected, 'foreign scope cannot read through or clear the pending record');
    await clearTaskSelectionRecovery(db, scope, selected);
    assert.deepEqual(await loadPendingTaskSelectionRecovery(db, scope), null);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('a revoked owner gate rolls back the pending-row write', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-task-selector-gate-')); const db = nodeDriver(join(dir, 'recovery.sqlite'));
  let calls = 0;
  try {
    await assert.rejects(rememberTaskSelectionRecovery(db, selected, () => { if (++calls === 3) throw new Error('Revoked synthetic owner'); }), /Revoked/);
    assert.deepEqual(await loadPendingTaskSelectionRecovery(db, scope), null);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('unknown or foreign nonempty journal schemas are preserved rather than extended', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-task-selector-schema-')); const path = join(dir, 'recovery.sqlite');
  let db = nodeDriver(path);
  try {
    await db.exec('CREATE TABLE future_recovery_state(value TEXT NOT NULL); PRAGMA user_version=9;');
    await db.run('INSERT INTO future_recovery_state(value) VALUES (?)', 'preserve-me');
    await db.close(); db = nodeDriver(path);
    await assert.rejects(loadPendingTaskSelectionRecovery(db, scope), /Unsupported task selector recovery database/);
    await assert.rejects(rememberTaskSelectionRecovery(db, selected), /Unsupported task selector recovery database/);
    const objects = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    assert.deepEqual(objects.map(row => row.name), ['future_recovery_state']);
    assert.equal((await db.first<{ value: string }>('SELECT value FROM future_recovery_state'))!.value, 'preserve-me');
    assert.equal(canonical(objects.map(row => row.name)), canonical(['future_recovery_state']));
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

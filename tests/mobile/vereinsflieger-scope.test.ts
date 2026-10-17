import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { SCOPE_SCHEMA, bindScope, readScope, authorizeScope, type ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { ConnectionSession } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';

const context = { accountNumber: '123', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const scope: ProviderScope = { version: 1, owner: 'pilot-a', connectionId: 'random-connection-a', context };
test('durable provider association survives SQLite reopen without claiming live confidence or allowing replacement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-scope-'));
  let db = nodeDriver(join(dir, 'registry.sqlite'));
  try {
    await db.exec(SCOPE_SCHEMA);
    assert.equal(await readScope(db, 'pilot-a'), null);
    await bindScope(db, scope); await db.close();
    db = nodeDriver(join(dir, 'registry.sqlite'));
    const saved = await readScope(db, 'pilot-a'); assert.deepEqual(saved, scope);
    assert.deepEqual(await bindScope(db, { ...scope, connectionId: 'new-unused-id' }), scope);
    await assert.rejects(bindScope(db, { ...scope, context: { ...context, accountNumber: '456' } }), /mismatch/);
    await assert.rejects(bindScope(db, { ...scope, context: { ...context, clubLabel: 'Other club' } }), /mismatch/);
    assert.deepEqual(await readScope(db, 'pilot-a'), scope);
    const session = new ConnectionSession(); session.restoreAssociation(saved!.context);
    assert.equal(session.state.confirmed, false); assert.equal(session.state.lastCheckedAt, null);
    session.start('fresh'); assert.equal(session.observe('fresh', { ...context, accountNumber: '456' }, '2026-10-17T10:00:00.000Z'), false);
    assert.equal(session.confirm(), false);
    session.start('fresh-2'); assert.equal(session.observe('fresh-2', context, '2026-10-17T10:01:00.000Z'), true);
    assert.equal(session.state.confirmed, true);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('scope authority rejects missing owners, forged connection IDs and borrowed provider contexts', async () => {
  const db = nodeDriver(':memory:');
  try {
    await db.exec(SCOPE_SCHEMA); await bindScope(db, scope);
    const second = { ...scope, owner: 'pilot-b', connectionId: 'random-connection-b', context: { ...context, accountNumber: '456' } };
    await bindScope(db, second);
    assert.deepEqual(await authorizeScope(db, second), second);
    for (const forged of [
      { ...scope, owner: 'pilot-c' }, { ...scope, owner: second.owner },
      { ...scope, connectionId: second.connectionId }, { ...scope, context: second.context },
      { ...scope, owner: '../legacy' }, { ...scope, connectionId: '../legacy' },
    ]) await assert.rejects(authorizeScope(db, forged));
    assert.equal((await readScope(db, 'pilot-a'))?.context.clubIdentity, 'display-label-only');
  } finally { await db.close(); }
});

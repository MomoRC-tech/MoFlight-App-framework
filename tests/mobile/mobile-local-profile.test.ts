import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver.ts';
import { normalizedDisplayName, readLocalDisplayName, saveLocalDisplayName } from '../../apps/platform-lab/src/mobile/local-profile.ts';

test('local display name survives SQLite restart, stays library scoped and rejects foreign owners', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-profile-'));
  let db = nodeDriver(join(dir, 'a.sqlite'));
  const other = nodeDriver(join(dir, 'b.sqlite'));
  try {
    for (const connection of [db, other]) await connection.exec("CREATE TABLE pilot(id TEXT PRIMARY KEY); INSERT INTO pilot VALUES ('synthetic-pilot');");
    assert.equal(await readLocalDisplayName(db, 'synthetic-pilot'), '');
    assert.equal(await saveLocalDisplayName(db, 'synthetic-pilot', '  Test   Pilot  '), 'Test Pilot');
    await db.close(); db = nodeDriver(join(dir, 'a.sqlite'));
    assert.equal(await readLocalDisplayName(db, 'synthetic-pilot'), 'Test Pilot');
    assert.equal(await readLocalDisplayName(other, 'synthetic-pilot'), '');
    await assert.rejects(readLocalDisplayName(db, 'foreign'), /Foreign/);
    await assert.rejects(saveLocalDisplayName(db, 'foreign', 'Changed'), /Foreign/);
    await assert.rejects(saveLocalDisplayName(db, 'synthetic-pilot', 'x'.repeat(61)), /Invalid/);
    assert.equal(await readLocalDisplayName(db, 'synthetic-pilot'), 'Test Pilot');
    await saveLocalDisplayName(db, 'synthetic-pilot', '');
    assert.equal(await readLocalDisplayName(db, 'synthetic-pilot'), '');
  } finally { await db.close(); await other.close(); await rm(dir, { recursive: true }); }
});

test('display name validation rejects embedded control characters and preserves Unicode', () => {
  assert.equal(normalizedDisplayName('  René  '), 'René');
  assert.throws(() => normalizedDisplayName('Test\0Pilot'), /Invalid/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalLogbook } from '../../packages/local-data/src/index.ts';
import { canonical, type Source, type Page } from '../../packages/flight-logbook/src/index.ts';
import { SELECTION_SCHEMA, persistSelection, selectionCandidates } from '../../apps/platform-lab/src/selection-store.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { activatePrepared } from '../../apps/platform-lab/src/activation.ts';
const hash = async (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = JSON.parse(await readFile('tests/fixtures/local-logbook/mobile.json', 'utf8')) as { source: Omit<Source, 'id'>; page: Page; raw_page: string };
test('checksum-valid semantic corruption in every record kind is rejected before destination mutation', async () => {
  const source = new LocalLogbook(nodeDriver(':memory:'), 'synthetic-lab-a', hash);
  await source.initialize(); await source.importSource(fixture.source); await source.preparePage(fixture.page, fixture.raw_page);
  await source.respond('fixture:f69:aircraft_model', 'ignore', null, 'acknowledged', await source.revision());
  const t = await source.makeTemplate(); await source.confirmCopied(t.id, ['fixture:f70'], await source.revision());
  const backup = await source.backup();
  const changes: [string, (v: Record<string, any>, row: Record<string, any>) => void][] = [
    ['flight', v => { v.registration = {}; }], ['flight', (v, row) => { row.id = 'foreign'; }], ['flight', v => { v.crew = [{ person_id: 'p', name: {}, role: 'PIC' }]; }],
    ['import', v => { v.successful = 'yes'; }], ['state', v => { v.source_id = 'missing'; }], ['flight_source', v => { v.source_id = 'missing'; }],
    ['page', v => { v.carry.minutes = -1; }], ['observation', v => { v.raw_page = '{}'; }], ['paper', v => { v.page = 99; }],
    ['finding', v => { v.flight_id = 'missing'; }], ['decision', v => { v.action = 'auto-confirm'; }], ['template', v => { v.pages[0].rows[0].flight = null; }],
  ];
  try {
    for (const [kind, change] of changes) {
      const envelope = JSON.parse(backup), body = JSON.parse(envelope.payload), row = body.records.find((r: {kind: string}) => r.kind === kind);
      const value = JSON.parse(row.payload); change(value, row); row.payload = canonical(value);
      envelope.payload = canonical(body); envelope.checksum = await hash(envelope.payload);
      const target = new LocalLogbook(nodeDriver(':memory:'), source.datasetId, hash); await target.initialize();
      try { const before = await target.backup(); await assert.rejects(target.restore(canonical(envelope)), kind); assert.equal(await target.backup(), before); }
      finally { await target.db.close(); }
    }
    assert.equal(await source.backup(), backup);
    const target = new LocalLogbook(nodeDriver(':memory:'), source.datasetId, hash); await target.initialize();
    try { await target.restore(backup); assert.equal(await target.backup(), backup); } finally { await target.db.close(); }
  } finally { await source.db.close(); }
});
test('selection transaction failure and corrupt latest entry recover prior committed selection after disk restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-selection-')); const path = join(dir, 'selection.sqlite');
  let db = nodeDriver(path);
  const a = { datasetId: 'synthetic-lab-a', databaseName: 'lab-a.sqlite' };
  try {
    await db.exec(SELECTION_SCHEMA); await persistSelection(db, a);
    await assert.rejects(persistSelection({ ...db, transaction: work => db.transaction(async tx => { await work(tx); throw new Error('interrupted commit'); }) }, { datasetId: 'synthetic-lab-b', databaseName: 'lab-b.sqlite' }));
    await db.close(); db = nodeDriver(path); assert.deepEqual(await selectionCandidates(db), [a]);
    await db.run('INSERT INTO selections(payload) VALUES (?)', '{"databaseName":"../../foreign"}');
    assert.deepEqual(await selectionCandidates(db), [a]);
    await assert.rejects(persistSelection(db, { datasetId: a.datasetId, databaseName: 'lab-b.sqlite' }));
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});
test('failed restored reader or selection commit cannot publish a new active repository', async () => {
  for (const phase of ['reader','commit']) {
    let active='original',selection='original',closed=false;
    await assert.rejects(activatePrepared(async()=>{if(phase==='reader')throw new Error('Unreadable restored template');return 'candidate';},async()=>{if(phase==='commit')throw new Error('Selection write failed');selection='candidate';},candidate=>{active=candidate;},async()=>{closed=true;}));
    assert.equal(active,'original');assert.equal(selection,'original');assert.equal(closed,true);
  }
});

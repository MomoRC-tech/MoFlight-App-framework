import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { LocalLogbook } from '../../packages/local-data/src/index.ts';
import { query, findings, reviewRequired, literalFields, canonical, type Source, type Page, type Template } from '../../packages/flight-logbook/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';

const fixture = JSON.parse(await readFile('tests/fixtures/local-logbook/mobile.json', 'utf8')) as { source: Omit<Source, 'id'>; page: Page; raw_page: string };
const hash = async (s: string) => createHash('sha256').update(s).digest('hex');
async function withLab(work: (r: LocalLogbook, dir: string) => Promise<void>) {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-ts-'));
  const r = new LocalLogbook(nodeDriver(join(dir, 'a.db')), 'synthetic-lab-a', hash);
  try { await r.initialize(); await r.importSource(fixture.source); await r.preparePage(fixture.page, fixture.raw_page); await work(r, dir); }
  finally { await r.db.close(); await rm(dir, { recursive: true, force: true }); }
}
test('exact aircraft/person identities, crew roles, duplicates and coverage', async () => withLab(async r => {
  const h = await r.history();
  assert.equal(query(h, { registration: 'D-EX01' }).count, 2);
  assert.deepEqual(query(h, { aircraft_model: 'ASK 21' }).supporting_flights.map(f => f.id), ['fixture:older', 'fixture:f70', 'fixture:f71']);
  assert.deepEqual(query(h, { person_id: 'fixture:p1', role: 'instructor' }).latest_flight_ids, ['fixture:f69']);
  assert.equal(query(h, { person_id: 'fixture:p1' }).count, 2);
  assert.equal(query(h, { person_id: 'fixture:p2' }).count, 1);
  assert.deepEqual(query(h).coverage, fixture.source.coverage);
  assert.deepEqual(query(h, { registration: 'D-EX01' }).source_references, { 'fixture:f69': h.source!.id, 'fixture:f70': h.source!.id });
  assert.equal(query(h, { basis: 'paper' }).source_references['fixture:f69'], 'prepared:prepared-page');
  assert.throws(() => query(h, { from: '2026-02-31' }), /date filter/);
  assert.throws(() => query(h, { from: '2026-06-03', through: '2026-06-01' }), /date range/);
  const revision = await r.revision(); await r.importSource(fixture.source); assert.equal(await r.revision(), revision);
}));
test('ignore, override, reversal and original source keep independent meanings', async () => withLab(async r => {
  const id = 'fixture:f69:aircraft_model';
  await r.respond(id, 'ignore', null, 'Synthetic acknowledgement', await r.revision());
  assert.equal(query(await r.history(), { aircraft_model: 'ASK 21' }).count, 3);
  await r.respond(id, 'override', 'ASK 21', 'Synthetic correction', await r.revision());
  assert.equal(query(await r.history(), { aircraft_model: 'ASK 21' }).count, 4);
  assert.equal(query(await r.history(), { aircraft_model: 'ASK 21', basis: 'source' }).count, 3);
  await r.respond(id, 'reverse', null, 'Synthetic reversal', await r.revision());
  assert.equal(query(await r.history(), { aircraft_model: 'ASK 21' }).count, 3);
  assert.equal(findings(await r.history())[0]?.status, 'open');
}));
test('only changed relevant evidence stales scoped decision; failed import preserves usable history', async () => withLab(async r => {
  await r.respond('fixture:f69:aircraft_model', 'override', 'ASK 21', 'Synthetic correction', await r.revision());
  await r.importSource({ ...fixture.source, retrieved_at: '2026-06-03T12:00:00Z' });
  assert.equal(findings(await r.history())[0]?.status, 'override');
  await r.importSource({ ...fixture.source, flights: fixture.source.flights.map(f => f.id === 'fixture:f69' ? { ...f, remarks: 'unrelated' } : f) });
  assert.equal(findings(await r.history())[0]?.status, 'override');
  await r.importSource({ ...fixture.source, flights: fixture.source.flights.map(f => f.id === 'fixture:f69' ? { ...f, aircraft_model: 'DG-1000 T' } : f) });
  assert.equal(findings(await r.history())[0]?.status, 'stale-review-required');
  const success = (await r.history()).source!.id;
  await r.importSource({ ...fixture.source, successful: false, retrieved_at: '2026-06-04T12:00:00Z' });
  assert.equal((await r.history()).source!.id, success);
  assert.equal((await r.history()).lastAttempt!.successful, false);
}));
test('fixed pages, integer totals, literal fields and repeated preparation', async () => withLab(async r => {
  const before = (await r.history()).paper;
  const t = await r.makeTemplate(), [a, b] = t.pages;
  assert.equal(a!.rows.at(-1)!.nr, 70); assert.equal(a!.rows.at(-1)!.row, 10);
  assert.equal(b!.rows[0]!.nr, 71); assert.equal(b!.page, 8);
  assert.deepEqual(a!.page_total, { minutes: 110, pic_minutes: 20, dual_minutes: 90, fi_minutes: 0, landings: 10 });
  assert.deepEqual(a!.cumulative_total, { minutes: 710, pic_minutes: 420, dual_minutes: 290, fi_minutes: 0, landings: 70 });
  assert.deepEqual(b!.carry, a!.cumulative_total); assert.equal(b!.page_total, null); assert.equal(b!.cumulative_total, null);
  assert.equal(Object.fromEntries(literalFields(a!.rows.at(-1)!))['PIC (h:mm)'], '0:20');
  assert.equal(Object.fromEntries(literalFields(b!.rows[0]!))['Dual (h:mm)'], '0:30');
  assert.equal((await r.makeTemplate()).id, t.id);
  assert.deepEqual((await r.history()).paper, before);
}));
test('selected copied entry only; invalid scope rolls back all entries; old template remains fixed', async () => withLab(async r => {
  const t = await r.makeTemplate(), base = await r.revision();
  await assert.rejects(r.confirmCopied(t.id, ['fixture:f70', 'foreign'], base));
  assert.equal(await r.revision(), base);
  await r.confirmCopied(t.id, ['fixture:f70'], base);
  assert.ok(await r.get('paper', 'fixture:f70')); assert.equal(await r.get('paper', 'fixture:f71'), null);
  await assert.rejects(r.makeTemplate(), /Paper advanced/);
  assert.deepEqual(await r.get('template', t.id), t);
}));
test('changed evidence prompts review without mutating old instructions or accepting copied entry', async () => withLab(async r => {
  const t = await r.makeTemplate();
  await r.importSource({ ...fixture.source, flights: fixture.source.flights.map(f => f.id === 'fixture:f71' ? { ...f, registration: 'D-NEW' } : f) });
  assert.equal(reviewRequired(t, await r.history()), true);
  await assert.rejects(r.confirmCopied(t.id, ['fixture:f71'], await r.revision()), /review/);
  assert.deepEqual(await r.get('template', t.id), t);
}));
test('real disk database reopens in a separate process with network creation disabled', async () => withLab(async (r, dir) => {
  const t = await r.makeTemplate();
  const code = `import { DatabaseSync } from 'node:sqlite'; import net from 'node:net'; net.connect=()=>{throw Error('network disabled')}; const db=new DatabaseSync(${JSON.stringify(join(dir, 'a.db'))}); console.log(db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get('template',${JSON.stringify(t.id)}).payload); db.close();`;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr); assert.deepEqual(JSON.parse(run.stdout), t);
}));
test('versioned backup restores IDs/history/original bytes and rejects corrupt or destructive restores', async () => withLab(async (r, dir) => {
  await r.respond('fixture:f69:aircraft_model', 'ignore', null, 'Synthetic acknowledgement', await r.revision());
  const t = await r.makeTemplate(), backup = await r.backup();
  const restored = new LocalLogbook(nodeDriver(join(dir, 'restored.db')), r.datasetId, hash);
  try {
    await restored.initialize(); await restored.restore(backup);
    assert.deepEqual(await restored.history(), await r.history()); assert.deepEqual(await restored.get('template', t.id), t);
    assert.equal((await restored.history()).source!.raw_csv, fixture.source.raw_csv);
    assert.equal((await restored.get<{ raw_page: string }>('observation', 'prepared-page'))!.raw_page, fixture.raw_page);
    await assert.rejects(restored.restore(backup), /clean dataset/);
    const bad = JSON.parse(backup); bad.checksum = 'wrong'; await assert.rejects(restored.restore(JSON.stringify(bad)), /integrity/);
  } finally { await restored.db.close(); }
}));
test('separate datasets and identity guard protect local selection; stale writes and unknown dates are explicit', async () => withLab(async (r, dir) => {
  const other = new LocalLogbook(nodeDriver(join(dir, 'b.db')), 'synthetic-lab-b', hash);
  try { await other.initialize(); assert.equal(query(await other.history()).count, 0); await assert.rejects(other.respond('fixture:f69:aircraft_model', 'ignore', null, 'bad', 0)); }
  finally { await other.db.close(); }
  await assert.rejects(r.respond('fixture:f69:aircraft_model', 'ignore', null, 'bad', 0), /Stale/);
  await r.importSource({ ...fixture.source, flights: fixture.source.flights.map(f => f.id === 'fixture:f71' ? { ...f, date: null } : f) });
  assert.deepEqual(query(await r.history(), { person_id: 'fixture:p2' }).unknown_ids, ['fixture:f71']);
  await assert.rejects(r.makeTemplate(), /chronology/);
}));
test('all copyable fields match the Python host reference for the same canonical fixtures', async () => withLab(async r => {
  const t = await r.makeTemplate();
  const run = spawnSync('python3', ['-c', `import json,tempfile\nfrom pathlib import Path\nfrom pocs.local_logbook.lab import Lab,literal_fields\nwith tempfile.TemporaryDirectory() as d:\n l=Lab(d);p=Path('tests/fixtures/local-logbook');l.import_csv(p/'flights.csv',${JSON.stringify(fixture.source.coverage).replace('false', 'False')},'2026-06-02T12:00:00Z');l.prepare_page(p/'page.json');t=l.template();print(json.dumps([{'page':p['page'],'row':r['row'],'fields':literal_fields(r)} for p in t['pages'] for r in p['rows']]));l.close()`], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(t.pages.flatMap(p => p.rows.map(row => ({ page: p.page, row: row.row, fields: Object.fromEntries(literalFields(row)) }))), JSON.parse(run.stdout));
}));

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PilotBooks, sourceId, type SourceFlight, type Book } from '../../packages/local-data/src/books.ts';
import { LocalLogbook } from '../../packages/local-data/src/index.ts';
import { canonical, type Source, type Page } from '../../packages/flight-logbook/src/index.ts';
import { nodeDriver } from './sqlite-driver.ts';
const hash = async (s: string) => createHash('sha256').update(s).digest('hex');
const fixture = JSON.parse(await readFile('tests/fixtures/local-logbook/mobile.json', 'utf8')) as { source: Omit<Source, 'id'>; page: Page; raw_page: string };
const owner = 'synthetic-pilot';
function book(id: string, classes: Book['classes'], format = 'synthetic-powered-five-row-v1'): Book { return { id, owner, name: id, format, classes, from: '2020-01-01', through: null }; }
function source(reference: string, aircraftClass: SourceFlight['aircraftClass']): SourceFlight { const id = sourceId(owner, 'synthetic-provider-club', reference); return { transport: 'synthetic-proof', id, owner, connection: 'synthetic-provider-club', reference, aircraftClass, duplicate: false, flight: { ...fixture.source.flights.at(-1)!, id, pilot_role: 'PIC' }, raw: 'synthetic evidence' }; }
test('four books persist independent overlapping entries, states and snapshots; shared evidence never doubles primary credit', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-books-')); const path = join(dir, 'pilot.sqlite'); let lib = new PilotBooks(nodeDriver(path), owner, hash);
  try {
    await lib.initialize(); for (const b of [book('g1', ['glider']), book('g2', ['glider']), book('ul', ['ultralight']), book('motor', ['powered'])]) await lib.createBook(b);
    const a = source('1', 'glider'), b = source('2', 'glider'), ul = source('3', 'ultralight'), motor = source('4', 'powered'); await lib.ingest([a, b, ul, motor]); const revision = await lib.revision(); await lib.ingest([a, b]); assert.equal(await lib.revision(), revision);
    assert.deepEqual((await lib.route(a.id)).state, 'review'); await lib.associate('g1', a.id, true); await lib.associate('g2', a.id, false); await lib.associate('g2', b.id, true); await lib.associate('ul', ul.id, true); await lib.associate('motor', motor.id, true);
    await assert.rejects(lib.associate('g2', a.id, true));
    const sa = await lib.prepare('g1'), sb = await lib.prepare('g2');
    assert.equal(sa.pages[0]!.rows[0]!.nr, sb.pages[0]!.rows[0]!.nr); assert.equal(sa.pages[0]!.page, sb.pages[0]!.page);
    await lib.saveState('g1', 'photo', { reference: 'synthetic-photo-a' }); await lib.saveState('g1', 'decision', []); await lib.saveState('g1', 'pending', { draft: 'keep me' });
    await lib.confirm('g1', sa.id, [a.id]); assert.equal((await lib.entries('g2')).length, 0); assert.equal(await lib.state('g2', 'photo'), null);
    await assert.rejects(lib.confirm('g2', sa.id, [a.id])); await lib.confirm('g2', sb.id, [b.id]);
    assert.equal((await lib.flights(['g1', 'g2'])).length, 2); assert.equal(Object.values(await lib.totals(['g1', 'g2'])).reduce((n, c) => n + c.minutes, 0), a.flight.minutes! + b.flight.minutes!);
    const backup = await lib.backup(); await lib.db.close(); lib = new PilotBooks(nodeDriver(path), owner, hash); await lib.initialize(); assert.equal(await lib.backup(), backup); assert.deepEqual(await lib.state('g1', 'pending'), { draft: 'keep me' });
    const restored = new PilotBooks(nodeDriver(':memory:'), owner, hash); await restored.initialize(); try { await restored.restore(backup); assert.equal(await restored.backup(), backup); } finally { await restored.db.close(); }
    const foreign = new PilotBooks(nodeDriver(':memory:'), 'other-pilot', hash); await foreign.initialize(); try { await assert.rejects(foreign.restore(backup)); await assert.rejects(foreign.book('g1')); await assert.rejects(foreign.createBook(book('forged', ['glider']))); await assert.rejects(foreign.ingest([a])); } finally { await foreign.db.close(); }
    await lib.ingest([{ ...b, flight: { ...b.flight, registration: 'D-CHANGED' } }]); assert.deepEqual((await lib.snapshots('g2'))[0], sb);
  } finally { await lib.db.close(); await rm(dir, { recursive: true, force: true }); }
});
test('routing distinguishes combined-category, TMG, successor dates, duplicates and unknown class', async () => {
  const lib = new PilotBooks(nodeDriver(':memory:'), owner, hash); await lib.initialize();
  try {
    await lib.createBook({ ...book('old', ['glider']), through: '2025-12-31' }); await lib.createBook({ ...book('combined', ['glider', 'TMG', 'powered']), from: '2026-01-01' });
    const g = source('g', 'glider'), tmg = source('t', 'TMG'), old = { ...source('old', 'glider'), flight: { ...source('old', 'glider').flight, date: '2025-06-01' } }, unknown = source('unknown', null), duplicate = { ...source('dup', 'glider'), duplicate: true };
    await lib.ingest([g, tmg, old, unknown, duplicate]); assert.deepEqual((await lib.route(old.id)).bookIds, ['old']); assert.deepEqual((await lib.route(tmg.id)).bookIds, ['combined']); assert.equal((await lib.route(unknown.id)).state, 'review'); assert.equal((await lib.route(duplicate.id)).state, 'review');
    await lib.associate('combined', g.id, true); await lib.associate('combined', tmg.id, true); assert.equal(Object.keys(await lib.totals(['combined'])).length, 2);
    await assert.rejects(lib.associate('combined', old.id, true)); await assert.rejects(lib.associate('combined', duplicate.id, true)); await assert.rejects(lib.prepare('foreign'));
  } finally { await lib.db.close(); }
});
test('explicit legacy migration preserves original backup and source identity mapping without mutating legacy DB', async () => {
  const old = new LocalLogbook(nodeDriver(':memory:'), 'synthetic-lab-a', hash), lib = new PilotBooks(nodeDriver(':memory:'), owner, hash); await old.initialize(); await lib.initialize();
  try {
    await old.importSource(fixture.source); await old.preparePage(fixture.page, fixture.raw_page); await old.makeTemplate(); const backup = await old.backup(); await lib.createBook(book('legacy', ['glider'], 'synthetic-ten-row-v1'));
    const mapping = await lib.migrateLegacy('legacy', backup, 'legacy-synthetic'); assert.equal(await old.backup(), backup); assert.equal((await lib.state<{backup: string}>('legacy', 'legacy'))!.backup, backup); assert.ok(fixture.source.flights.every(f => mapping[f.id]));
    const snapshot = await lib.prepare('legacy'); assert.equal(snapshot.pages[0]!.rows.at(-1)!.nr, 70); assert.equal(snapshot.pages[1]!.rows[0]!.nr, 71);
    await assert.rejects(lib.migrateLegacy('legacy', backup, 'other')); const pilotBackup = await lib.backup(); const restored = new PilotBooks(nodeDriver(':memory:'), owner, hash); await restored.initialize(); try { await restored.restore(pilotBackup); assert.equal(await restored.backup(), pilotBackup); } finally { await restored.db.close(); }
  } finally { await old.db.close(); await lib.db.close(); }
});
test('checksum-valid pilot backup foreign/dangling records rollback and unknown formats preserve viewable snapshots', async () => {
  const lib = new PilotBooks(nodeDriver(':memory:'), owner, hash); await lib.initialize();
  try {
    await lib.createBook(book('g', ['glider'])); const f = source('f', 'glider'); await lib.ingest([f]); await lib.associate('g', f.id, true); const t = await lib.prepare('g'); await lib.confirm('g', t.id, [f.id]); const backup = await lib.backup();
    for (const mutate of [(p: any) => { p.memberships[0].flight_id = 'missing'; }, (p: any) => { const b = JSON.parse(p.books[0].payload); b.owner = 'foreign'; p.books[0].payload = canonical(b); }, (p: any) => { p.entries[0].payload = '{}'; }]) {
      const e = JSON.parse(backup), p = JSON.parse(e.payload); mutate(p); e.payload = canonical(p); e.checksum = await hash(e.payload); const target = new PilotBooks(nodeDriver(':memory:'), owner, hash); await target.initialize(); try { const before = await target.backup(); await assert.rejects(target.restore(canonical(e))); assert.equal(await target.backup(), before); } finally { await target.db.close(); }
    }
  } finally { await lib.db.close(); }
});
test('book-specific review creates immutable decision snapshots and source corrections retain every revision including reversions', async () => {
  const old = new LocalLogbook(nodeDriver(':memory:'), 'synthetic-lab-a', hash), lib = new PilotBooks(nodeDriver(':memory:'), owner, hash); await old.initialize(); await lib.initialize();
  try {
    await old.importSource(fixture.source); await old.preparePage(fixture.page, fixture.raw_page); await lib.createBook(book('gliding', ['glider'], 'synthetic-ten-row-v1')); await lib.createBook(book('archive', ['glider']));
    const mapping = await lib.migrateLegacy('gliding', await old.backup(), 'legacy-synthetic'); const h = await lib.history('gliding'), finding = h.findings[0]!;
    const before = await lib.prepare('gliding'); await assert.rejects(lib.confirm('gliding', before.id, [mapping['fixture:f70']!]), /review/);
    await lib.respond('gliding', finding.id, 'override', finding.paper_value, 'Book-only correction'); const after = await lib.prepare('gliding'); assert.notEqual(after.id, before.id); assert.deepEqual((await lib.snapshots('gliding'))[0], before);
    await lib.confirm('gliding', after.id, [mapping['fixture:f70']!]); await lib.associate('archive', mapping['fixture:f70']!, false); assert.deepEqual((await lib.history('archive')).decisions, []);
    const s = (await lib.sources()).find(s => s.id === mapping['fixture:f71'])!, revision = await lib.revision(); await lib.ingest([{...s, flight: {...s.flight, remarks:'temporary correction'}}]); await lib.ingest([s]); assert.equal(await lib.revision(), revision + 2); assert.deepEqual((await lib.sources()).find(x=>x.id===s.id), s);
    const e=JSON.parse(await lib.backup()),p=JSON.parse(e.payload),b=JSON.parse(p.books.find((r:any)=>r.id==='archive').payload);b.format='future-format-v99';p.books.find((r:any)=>r.id==='archive').payload=canonical(b);e.payload=canonical(p);e.checksum=await hash(e.payload);
    const restored=new PilotBooks(nodeDriver(':memory:'),owner,hash);await restored.initialize();try{await restored.restore(canonical(e));assert.equal((await restored.book('archive')).format,'future-format-v99');await assert.rejects(restored.prepare('archive'),/Unsupported format/);}finally{await restored.db.close();}
  } finally { await old.db.close(); await lib.db.close(); }
});

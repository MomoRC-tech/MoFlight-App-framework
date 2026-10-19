import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INFORMATION_READER_SOURCE, INFORMATION_TYPES, informationCategoryUrl, validateInformationCapture, validateInformationPage } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const source = 'https://vereinsflieger.de/member/profile/usereducation/summaryueid?ueid=synthetic';
const groups = ['Praktische Ausbildung', 'Theoretische Ausbildung'];
const fields = ['Lernziele beendet', 'Lernziele begonnen', 'Lernziele nicht begonnen'];
const at = '2026-10-19T12:00:00.000Z';
const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-connection', context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const cell = (text: string, colSpan = 1) => ({ tagName: 'TD', innerText: text, textContent: text, colSpan, rowSpan: 1, children: [] as {tagName:string}[], querySelector: (_selector: string): unknown => null });
const row = (texts: string[]) => ({ cells: texts.map(t => cell(t)) });
function fixture(values = [' 8 ', '1', '12', '0', '3', '6', '01:30']) {
  const sections = new Map<string, any>();
  for (const [g, id] of ['practise', 'theory'].entries()) {
    const graphic = cell('', 2); graphic.children.push({ tagName: 'DIV' });
    const rows = [row(['', 'Anzahl']), ...fields.map((label, i) => row([label, values[g * 3 + i]!])), { cells: [graphic] }, ...(g ? [row(['', 'Zeit']), row(['Theoriestunden', values[6]!])] : [])];
    const table = { tagName: 'TABLE', rows };
    const span = { innerText: groups[g] };
    const head = { tagName: 'DIV', classList: { contains: (c: string) => c === 'box-header' }, querySelector: (q: string) => q === 'span' ? span : null };
    const section = { tagName: 'DIV', children: [head] as any[] };
    const content = { tagName: 'DIV', parentElement: section, children: [table], querySelectorAll: (q: string) => { assert.equal(q, 'table'); return [table]; } };
    section.children.push(content);
    sections.set(id, section); sections.set(id + '_content', content);
  }
  const document = {
    querySelector: (q: string) => { assert.equal(q, 'input[name="pwinput"]'); return null; },
    getElementById: (id: string) => { assert.ok(['practise', 'practise_content', 'theory', 'theory_content'].includes(id), 'Unrelated Person/progresschecks/flight section must not be accessed'); return sections.get(id) ?? null; },
    querySelectorAll: (q: string) => { assert.ok(q.startsWith('#'), 'No broad table, filter or private-section reads'); const value = sections.get(q.slice(1)); return value ? [value] : []; },
  };
  const read = (url = source) => {
    const window = {}; Object.assign(window, { top: window });
    return JSON.parse(JSON.stringify(runInNewContext(`(${INFORMATION_READER_SOURCE})('training-summary', config)`, { document, window, location: { href: url }, URL, config: INFORMATION_TYPES['training-summary'] })));
  };
  return { sections, document, read, rows: (id: string) => sections.get(id + '_content').children[0].rows as { cells: ReturnType<typeof cell>[] }[] };
}
const page = () => validateInformationPage(fixture().read());
const capture = (id: string) => validateInformationCapture({ ...page(), version: 1, id, retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile' });

test('training summary reads only owned labelled groups, preserving raw counts, units and explicit zero', () => {
  const p = page();
  assert.equal(p.rows.length, 7); assert.deepEqual(p.filters, []); assert.equal(p.empty, false);
  assert.deepEqual(p.rows[0]!.values, [groups[0], fields[0], 'Anzahl', ' 8 ']);
  assert.deepEqual(p.rows[3]!.values, [groups[1], fields[0], 'Anzahl', '0']);
  assert.deepEqual(p.rows[6]!.values, [groups[1], 'Theoriestunden', 'Zeit', '01:30']);
  assert.deepEqual(p.coverage, { kind: 'visible-page', truncated: false, pagination: 'unverified' });
});

test('blank summary values remain unknown while unusual source text is retained without numeric or qualification inference', () => {
  const p = validateInformationPage(fixture(['', 'source unknown', '0', '0', '3', '6', '']).read());
  assert.equal(p.rows[0]!.values[3], ''); assert.equal(p.rows[1]!.values[3], 'source unknown');
  assert.equal(p.rows[6]!.values[3], ''); assert.equal(p.rows[2]!.values[3], '0');
});

test('missing, duplicate, foreign-owned or unsupported summary structures fail before saving', () => {
  const variants = [
    (f: ReturnType<typeof fixture>) => f.sections.delete('theory'),
    (f: ReturnType<typeof fixture>) => { f.document.querySelectorAll = q => q === '#practise' ? [f.sections.get('practise'), f.sections.get('practise')] : [f.sections.get(q.slice(1))]; },
    (f: ReturnType<typeof fixture>) => { f.sections.get('theory_content').parentElement = f.sections.get('practise'); },
    (f: ReturnType<typeof fixture>) => { f.rows('practise')[1]!.cells[0]!.innerText = 'Unsupported field'; },
    (f: ReturnType<typeof fixture>) => { f.rows('theory').pop(); },
    (f: ReturnType<typeof fixture>) => { f.rows('theory')[5]!.cells[1]!.innerText = 'Stunden'; },
    (f: ReturnType<typeof fixture>) => { f.rows('practise')[2]!.cells[1]!.colSpan = 2; },
    (f: ReturnType<typeof fixture>) => { f.rows('practise')[4]!.cells[0]!.innerText = 'Uncontracted graphical label'; },
  ];
  for (const mutate of variants) { const f = fixture(); mutate(f); const result = f.read(); assert.deepEqual(result, { error: 'training-summary-unverified' }); assert.throws(() => validateInformationPage(result)); }
});

test('nested data/control values are rejected without reading their text and graphics do not supply status', () => {
  const f = fixture(), value = f.rows('practise')[1]!.cells[1]!;
  value.children.push({ tagName: 'A' });
  Object.defineProperty(value, 'innerText', { get: () => { throw new Error('Private linked text was read'); } });
  assert.deepEqual(f.read(), { error: 'training-summary-unverified' });
  const g = fixture(); g.rows('practise')[4]!.cells[0]!.querySelector = () => ({});
  assert.deepEqual(g.read(), { error: 'training-summary-unverified' });
});

test('summary route permits only the evidenced pathname and sole opaque enrolment selector', () => {
  for (const bad of [source + '&ueid=other', source + '&id=foreign', source.replace('summaryueid', 'summaryueid/'), source.replace('summaryueid', 'editelidp'), source + '#fragment']) {
    assert.equal(informationCategoryUrl('training-summary', bad), false);
    assert.throws(() => new InformationRun(scope, 'training-summary', bad, 'synthetic-run'));
  }
  assert.equal(informationCategoryUrl('training-summary', source), true);
  assert.equal(informationCategoryUrl('training-summary', source.split('?')[0]!), true);
  assert.deepEqual(fixture().read(source + '&id=foreign'), { error: 'source-unavailable' });
});

test('summary payload rejects duplicate fields, missing groups, wrong units and invented filters', () => {
  const p = page();
  for (const bad of [
    { ...p, rows: p.rows.slice(0, 6) },
    { ...p, rows: p.rows.map((r, i) => i === 1 ? { ...r, values: p.rows[0]!.values } : r) },
    { ...p, rows: p.rows.map(r => ({ ...r, values: ['Foreign group', ...r.values.slice(1)] })) },
    { ...p, rows: p.rows.map((r, i) => i === 6 ? { ...r, values: [groups[1], 'Theoriestunden', 'Anzahl', '0'] } : r) },
    { ...p, filters: ['2026'] },
  ]) assert.throws(() => validateInformationPage(bad));
});

test('fresh context is required before summary save; SQLite restart preserves previous and unrelated evidence', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-training-summary-')), file = join(dir, 'capture.sqlite'); let db = nodeDriver(file);
  try {
    let store = new InformationStore(db, scope, async () => {}); await store.initialize();
    const old = { ...capture('summary-old'), rows: page().rows.map(r => ({ ...r, values: [...r.values.slice(0, 3), ''] })) };
    const unrelated = validateInformationCapture({ ...capture('other-source'), category: 'news', path: '/member/overview/overview', columns: [{ key: 'notice', label: 'Hinweis · Originaltext', index: 0 }], rows: [], empty: true });
    await store.save(old); await store.save(unrelated);
    const before = await db.all('SELECT * FROM information_captures ORDER BY rowid');
    const run = new InformationRun(scope, 'training-summary', source, 'summary-new');
    const context = () => ({ kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scope.context });
    run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, context());
    run.observeNavigation(source); run.accept(source, source, { kind: 'vf-information-v1', nonce: run.messageNonce, url: source, page: page() });
    assert.throws(() => run.capture(at));
    run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, context()), 'save');
    await store.save(run.capture(at));
    await assert.rejects(store.save({ ...capture('foreign'), owner: 'foreign-owner' }));
    await db.close(); db = nodeDriver(file); store = new InformationStore(db, scope, async () => {}); await store.initialize(false);
    assert.deepEqual((await store.history('training-summary', 0)).capture, capture('summary-new'));
    assert.deepEqual((await store.history('training-summary', 1)).capture, old);
    assert.deepEqual(await db.all('SELECT * FROM information_captures WHERE id<>? ORDER BY rowid', 'summary-new'), before);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

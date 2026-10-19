import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INFORMATION_READER_SOURCE, INFORMATION_TYPES, validateInformationPage, validateInformationCapture, informationRouteShape, informationCategoryUrl, informationUrl, type InformationCategory } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const url = 'https://vereinsflieger.de/member/profile/synthetic-working-hours?year=2026';
const ledgerUrl = 'https://vereinsflieger.de/member/profile/account.php?caid=synthetic-account';
const tasksUrl = 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=synthetic-own';
const at = '2026-10-19T12:00:00.000Z';
const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-scope', context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
function cell(text: string, extra: Record<string, unknown> = {}) { return { textContent: text, innerText: text, colSpan: 1, rowSpan: 1, querySelector: () => null, ...extra }; }
function row(texts: string[]) { return { cells: texts.map(t => cell(t)), querySelector: () => null }; }
const header = ['', 'Datum', 'Tätigkeit', 'Stunden', 'Kategorie', 'Status', 'Private contact'];
const entries = [['', '01.10.2026', 'Synthetic work', '0.00', 'Custom', 'Akzeptiert', 'Do not collect']];
function read(category: InformationCategory, rows = [row(header), ...entries.map(row)], tables?: { rows: typeof rows }[], taskFilter = 'Meine nicht beendeten Aufgaben') {
  const window = {}; const document = { getElementById: () => ({ innerText: category === 'tasks' ? taskFilter : '' }), querySelector: () => null, querySelectorAll: (s: string) => s === 'table' ? tables ?? [{ rows }] : s === 'select' ? category === 'tasks' ? [] : [{ selectedOptions: [{ textContent: '2026' }] }, { selectedOptions: [{ textContent: 'Private person filter' }] }] : [] };
  return JSON.parse(JSON.stringify(runInNewContext(`(${INFORMATION_READER_SOURCE})(category, config)`, { document, location: { href: category === 'tasks' ? tasksUrl : category === 'ledger' ? ledgerUrl : category === 'medical' || category === 'work-summary' ? PROFILE_URL : category === 'duties' ? 'https://vereinsflieger.de/member/profile/myservices.php' : url }, window: Object.assign(window, { top: window }), URL, category, config: INFORMATION_TYPES[category] })));
}
const page = () => validateInformationPage(read('work-hours'));
test('bounded local route diagnostic excludes query values and numeric path identities', () => {
  const shape = informationRouteShape('https://vereinsflieger.de/member/profile/example/123?year=2026&private=secret&private=another&bad123=hidden');
  assert.deepEqual(shape, { path: '/member/profile/example/#', queryKeys: ['year', 'private', '(other)'] });
  assert.equal(informationRouteShape('https://evil.test/member/profile/example'), null);
});
const capture = (id = 'capture-a') => validateInformationCapture({ ...page(), version: 1, id, retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile' });

test('allowlisted work rows retain exact zero/raw evidence and exclude private columns/filter values', () => {
  const p = page(); assert.equal(p.rows.length, 1); assert.deepEqual(p.rows[0]!.values, ['01.10.2026', 'Synthetic work', '0.00', 'Custom', 'Akzeptiert']);
  assert.deepEqual(p.filters, ['2026']); assert.equal(p.coverage.pagination, 'unverified');
  assert.ok(!JSON.stringify(p).includes('Do not collect')); assert.ok(!JSON.stringify(p).includes('Private'));
});
test('visible-page cap preserves partial coverage and never calls twenty rows complete', () => {
  const p = validateInformationPage(read('work-hours', [row(header), ...Array.from({ length: 21 }, () => row(entries[0]!))]));
  assert.equal(p.rows.length, 20); assert.equal(p.coverage.truncated, true); assert.equal(p.coverage.kind, 'visible-page');
});
test('verified source empty marker is distinct from missing rows, login/unknown and contradictory empty data', () => {
  const empty = validateInformationPage(read('work-hours', [row(header), row(['Es wurden keine passenden Daten gefunden!'])]));
  assert.equal(empty.empty, true); assert.equal(empty.rows.length, 0);
  for (const rows of [[row(header)], [row(header), row(['Unknown empty response'])], [row(header), row(['Es wurden keine Daten gefunden!']), row(entries[0]!)]]) assert.throws(() => validateInformationPage(read('work-hours', rows)));
});
test('duplicate anchors/tables, malformed/spanning/nested rows reject rather than shift fields', () => {
  const p = [row(header), row(entries[0]!)];
  assert.throws(() => validateInformationPage(read('work-hours', p, [{ rows: p }, { rows: p }])));
  for (const rows of [[row([...header, 'Stunden']), row([...entries[0]!, '5'])], [row(header), row(['only one'])]]) assert.throws(() => validateInformationPage(read('work-hours', rows)));
  const nested = row(entries[0]!); nested.cells[2]!.querySelector = () => ({}) as any;
  assert.throws(() => validateInformationPage(read('work-hours', [row(header), nested])));
  const spanning = row(entries[0]!); spanning.cells[0]!.rowSpan = 2;
  assert.throws(() => validateInformationPage(read('work-hours', [row(header), spanning])));
});
test('historical multi-person duty period remains one source row with raw end/people; no availability inference', () => {
  const assignment = row(['Custom duty', '01.09.2026 -\n07.09.2026 23:59', 'Synthetic A\nSynthetic B']);
  assignment.cells[2]!.querySelector = ((selector: string) => selector === 'table' ? {} : null) as any;
  const p = validateInformationPage(read('duties', [row(['Dienst', 'Zeitraum', 'Person(en)']), assignment]));
  assert.equal(p.rows.length, 1); assert.equal(p.rows[0]!.values[1], '01.09.2026 -\n07.09.2026 23:59'); assert.equal(p.rows[0]!.values[2], 'Synthetic A\nSynthetic B');
});
test('ledger charges/credits/opening balance stay signed raw observations, never computed cost totals', () => {
  const p = validateInformationPage(read('ledger', [row(['Datum', 'BuchungsNr.', 'Abrechnung', 'Informationen', 'Wert (EUR)', 'Saldo (EUR)']), row(['01.01.2026', '', '', 'Anfangsbestand', '', '0,00']), row(['02.01.2026', '123', '456', 'Synthetic charge', '-12,50', '-12,50']), row(['03.01.2026', '124', '', 'Kontoausgleich', '12,50', '0,00'])]));
  assert.equal(p.rows.length, 3); assert.equal(p.rows[1]!.values[4], '-12,50'); assert.equal(p.rows[2]!.values[4], '12,50');
});
test('observed ledger route permits only its own query-key shape; other routes retain their guard', () => {
  assert.equal(informationCategoryUrl('ledger', ledgerUrl), true);
  assert.equal(informationCategoryUrl('ledger', 'https://vereinsflieger.de/member/profile/account.php'), true); // persisted pathname
  for (const bad of [ledgerUrl + '&action=delete', ledgerUrl + '&year=2026', ledgerUrl + '&caid=other', ledgerUrl + '#fragment', ledgerUrl.replace('account.php', 'synthetic-working-hours'), ledgerUrl.replace('https:', 'http:'), ledgerUrl.replace('vereinsflieger.de', 'evil.test'), ledgerUrl.replace('account.php', 'account.php/extra')]) assert.equal(informationUrl(bad), false, bad);
  assert.equal(informationCategoryUrl('ledger', url), false);
  assert.throws(() => validateInformationPage({ ...page(), category: 'ledger' }));
});
test('ledger native message must match the selected account query and fresh context before saving', () => {
  const p = validateInformationPage(read('ledger', [row(['Datum', 'BuchungsNr.', 'Informationen', 'Wert (EUR)', 'Saldo (EUR)']), row(['01.01.2026', '', 'Anfangsbestand', '', '0,00'])]));
  const run = new InformationRun(scope, 'ledger', ledgerUrl, 'ledger-a');
  run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run));
  const other = ledgerUrl.replace('synthetic-account', 'other');
  run.observeNavigation(other);
  assert.equal(run.accept(other, other, { kind: 'vf-information-v1', nonce: run.messageNonce, url: other, page: p }), 'ignored');
  assert.throws(() => run.capture(at));
  run.observeNavigation(ledgerUrl);
  assert.equal(run.accept(ledgerUrl, ledgerUrl, { kind: 'vf-information-v1', nonce: run.messageNonce, url: ledgerUrl, page: p }), 'navigate');
  assert.throws(() => run.capture(at));
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'save');
  assert.deepEqual(run.capture(at).rows, p.rows);
  assert.ok(!JSON.stringify(run.capture(at)).includes('synthetic-account')); // query values are not stored
});
test('own open task reader retains raw due/status/zero evidence while excluding contact and delegation names', () => {
  const p = validateInformationPage(read('tasks', [row(['Titel', 'Ansprechpartner', 'Delegiert an', 'Zu erledigen bis', 'Anzahl Tage', 'Status', 'Priorität']), row(['Synthetic own task', 'Private contact', 'Private delegate', '', '0', 'Offen', 'Hoch'])]));
  assert.deepEqual(p.rows[0]!.values, ['Synthetic own task', '', '0', 'Offen', 'Hoch']);
  assert.deepEqual(p.filters, ['Meine nicht beendeten Aufgaben']);
  assert.ok(!JSON.stringify(p).includes('Private'));
  assert.deepEqual(validateInformationCapture({ ...p, version: 1, id: 'tasks-a', retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile' }).rows, p.rows);
});
test('own-task empty source needs exact owned filter and explicit marker; other scopes stay unavailable', () => {
  const rows = [row(['Titel', 'Zu erledigen bis', 'Status']), row(['Es wurden keine passenden Daten gefunden!'])];
  const p = validateInformationPage(read('tasks', rows)); assert.equal(p.empty, true);
  for (const filter of ['', 'Alle Aufgaben', 'Alle nicht beendeten Aufgaben']) {
    assert.equal(read('tasks', rows, undefined, filter).error, 'task-scope-unverified');
    assert.throws(() => validateInformationPage({ ...p, filters: filter ? [filter] : [] }));
  }
  assert.throws(() => validateInformationPage(read('tasks', [rows[0]!]))) ;
});
test('task selection key is confined to its evidenced route; mutation, duplicate and cross-category routes reject', () => {
  assert.equal(informationCategoryUrl('tasks', tasksUrl), true);
  for (const bad of [tasksUrl + '&action=delete', tasksUrl + '&gselect=other', tasksUrl.replace('tasklist/tasklist', 'tasklist/edit'), tasksUrl.replace('tasklist/tasklist', 'elsewhere')]) assert.equal(informationUrl(bad), false);
  assert.equal(informationCategoryUrl('tasks', url), false);
  assert.equal(informationCategoryUrl('tasks', ledgerUrl), false);
});
test('Medical reader selects class/expiry only inside Medical section and excludes document/private rows', () => {
  const p = validateInformationPage(read('medical', [row(['Allgemeine Daten']), row(['Name', 'Private name']), row(['Medical']), row(['Klasse 2', 'Gültig bis 01.10.2027 - synthetic-ref']), row(['LAPL', '']), row(['Dokumente']), row(['Private document', 'Do not collect'])]));
  assert.equal(p.rows.length, 2); assert.deepEqual(p.rows[1]!.values, ['LAPL', '']); assert.ok(!JSON.stringify(p).includes('Private'));
});
test('decoder rejects unknown fields, unsafe source, forged coverage and malformed/oversize metadata', () => {
  const p = page();
  for (const bad of [{ ...p, extra: true }, { ...p, path: '/member/delete-record' }, { ...p, empty: true }, { ...p, coverage: { ...p.coverage, kind: 'complete' } }, { ...p, rows: [{ position: 1, values: ['x'.repeat(8193), 'a', 'b', 'c', 'd'] }] }, { ...p, columns: p.columns.map(c => ({ ...c, key: '__proto__' })) }]) assert.throws(() => validateInformationPage(bad));
  assert.throws(() => validateInformationCapture({ ...capture(), retrievedAt: '2026-02-30T12:00:00.000Z' }));
  for (const bad of [url.replace('https:', 'http:'), url + '#secret', url + '&token=secret', 'https://evil.test/member/profile/viewprofile', 'https://vereinsflieger.de/member/download/document']) assert.equal(informationUrl(bad), false);
});
function contextMessage(run: InformationRun, changed = false) { return { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: { ...scope.context, accountNumber: changed ? '9999' : '1001' } }; }
function advance(run: InformationRun) {
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'navigate');
  run.observeNavigation(url); assert.equal(run.accept(url, url, { kind: 'vf-information-v1', nonce: run.messageNonce, url, page: page() }), 'navigate');
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'save');
}
test('capture requires fresh before/after matching context and exact source/nonce, cancellation stays terminal', () => {
  const run = new InformationRun(scope, 'work-hours', url, 'capture-a');
  assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'ignored'); assert.throws(() => run.capture(at));
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, { ...contextMessage(run), nonce: 'foreign' }), 'ignored');
  advance(run); assert.deepEqual(run.capture(at), capture());
  assert.throws(() => run.assertScope({ ...scope, owner: 'foreign' }));
  const cancelled = new InformationRun(scope, 'work-hours', url, 'cancelled'); cancelled.cancel(); cancelled.observeNavigation(PROFILE_URL);
  assert.equal(cancelled.accept(PROFILE_URL, PROFILE_URL, contextMessage(cancelled)), 'ignored'); assert.throws(() => cancelled.capture(at));
});
test('wrong account before or after extraction cannot create a capture; wrong category/page rejects', () => {
  for (const after of [false, true]) {
    const run = new InformationRun(scope, 'work-hours', url, 'capture-a'); run.observeNavigation(PROFILE_URL);
    if (after) { run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)); run.observeNavigation(url); run.accept(url, url, { kind: 'vf-information-v1', nonce: run.messageNonce, url, page: page() }); run.observeNavigation(PROFILE_URL); }
    assert.throws(() => run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run, true))); assert.throws(() => run.capture(at));
  }
});
test('a replayed before-profile message cannot replace the required after-profile observation', () => {
  const run = new InformationRun(scope, 'work-hours', url, 'capture-a');
  const before = contextMessage(run); run.observeNavigation(PROFILE_URL);
  run.accept(PROFILE_URL, PROFILE_URL, before); run.observeNavigation(url);
  run.accept(url, url, { kind: 'vf-information-v1', nonce: run.messageNonce, url, page: page() });
  run.observeNavigation(PROFILE_URL);
  assert.equal(run.accept(PROFILE_URL, PROFILE_URL, before), 'ignored');
  assert.throws(() => run.capture(at));
});
test('real SQLite immutable retries, scoped isolation, corruption and close/reopen preserve source facts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-synthetic-')); const file = join(dir, 'capture.sqlite');
  let db = nodeDriver(file); let permitted = true;
  const gate = async () => { if (!permitted) throw new Error('Revoked synthetic owner'); };
  try {
    let store = new InformationStore(db, scope, gate); await store.initialize(); await store.save(capture()); await store.save(capture());
    assert.equal((await db.first<{n:number}>('SELECT count(*) n FROM information_captures'))!.n, 1);
    await assert.rejects(store.save({ ...capture(), rows: [{ position: 1, values: ['changed', 'a', 'b', 'c', 'd'] }] }));
    await assert.rejects(store.save({ ...capture('foreign'), owner: 'other' }));
    await assert.rejects(db.run('DELETE FROM information_captures')); await assert.rejects(db.run('UPDATE information_manifest SET version=2'));
    await db.close(); db = nodeDriver(file); store = new InformationStore(db, scope, gate); await store.initialize(); assert.deepEqual(await store.latest(), [capture()]);
    await assert.rejects(new InformationStore(db, { ...scope, connectionId: 'other' }, gate).initialize());
    permitted = false; await assert.rejects(store.latest()); await assert.rejects(store.save(capture('new'))); permitted = true;
    assert.deepEqual(await store.latest(), [capture()]);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

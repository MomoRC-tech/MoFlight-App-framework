import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INFORMATION_READER_SOURCE, TASK_SELECTION_READER_SOURCE, TASK_SELECTION_PROBE_URL, OWN_OPEN_TASKS_URL, INFORMATION_TYPES, retrievableInformationCategories, validateTaskSelection, validateInformationPage, validateInformationCapture, informationRouteShape, informationCategoryUrl, informationUrl, type InformationCategory } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationStore } from '../../apps/platform-lab/src/vereinsflieger/information-store.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const url = 'https://vereinsflieger.de/member/profile/workhours/list?year=2026';
const ledgerUrl = 'https://vereinsflieger.de/member/profile/account.php?caid=synthetic-account';
const tasksUrl = OWN_OPEN_TASKS_URL;
const overviewUrl = 'https://vereinsflieger.de/member/overview/overview';
const at = '2026-10-19T12:00:00.000Z';
const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-scope', context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
function cell(text: string, extra: Record<string, unknown> = {}) { return { textContent: text, innerText: text, colSpan: 1, rowSpan: 1, querySelector: () => null, ...extra }; }
function row(texts: string[]) { return { cells: texts.map(t => cell(t)), querySelector: () => null }; }
const header = ['', 'Datum', 'Tätigkeit', 'Stunden', 'Kategorie', 'Status', 'Private contact'];
const entries = [['', '01.10.2026', 'Synthetic work', '0.00', 'Custom', 'Akzeptiert', 'Do not collect']];
function read(category: InformationCategory, rows = [row(header), ...entries.map(row)], tables?: { rows: typeof rows }[], taskFilter = 'Meine nicht beendeten Aufgaben', taskAnchor = 'globalfiltertime', options: { url?: string; globalFilter?: string } = {}) {
  const window = {}; const document = { getElementById: (id: string) => id === taskAnchor ? ({ innerText: category === 'tasks' ? taskFilter : '' }) : id === 'globalfilter' ? ({ innerText: options.globalFilter ?? '' }) : null, querySelector: () => null, querySelectorAll: (s: string) => s === 'table' ? tables ?? [{ rows }] : s === 'select' ? category === 'tasks' ? [] : [{ selectedOptions: [{ textContent: '2026' }] }, { selectedOptions: [{ textContent: 'Private person filter' }] }] : [] };
  const defaultUrl = category === 'tasks' ? tasksUrl : category === 'ledger' ? ledgerUrl : category === 'medical' || category === 'work-summary' || category === 'own-profile' || category === 'licence-metadata' ? PROFILE_URL : category === 'duties' ? 'https://vereinsflieger.de/member/profile/myservices.php' : category === 'practical' || category === 'theory' ? 'https://vereinsflieger.de/member/profile/usereducation/editelid' + (category === 'practical' ? 'p' : 't') + '?ueid=synthetic' : url;
  return JSON.parse(JSON.stringify(runInNewContext(`(${INFORMATION_READER_SOURCE})(category, config)`, { document, location: { href: options.url ?? defaultUrl }, window: Object.assign(window, { top: window }), URL, category, config: INFORMATION_TYPES[category] })));
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
test('work-hours reads only the evidenced workhours list route', () => {
  assert.equal(informationCategoryUrl('work-hours', url), true);
  const wrong = 'https://vereinsflieger.de/member/profile/synthetic-hours?year=2026';
  assert.equal(informationCategoryUrl('work-hours', wrong), false);
  assert.throws(() => validateInformationPage(read('work-hours', [row(header), row(entries[0]!)], undefined, undefined, undefined, { url: wrong })));
});
test('visible-page cap preserves partial coverage and never calls twenty rows complete', () => {
  const p = validateInformationPage(read('work-hours', [row(header), ...Array.from({ length: 21 }, () => row(entries[0]!))]));
  assert.equal(p.rows.length, 20); assert.equal(p.coverage.truncated, true); assert.equal(p.coverage.kind, 'visible-page');
});
const practicalHeader = ['No', 'Status', 'Lernziel', 'Fluglehrer (Begonnen)', 'Begonnen am', 'Fluglehrer (Beendet)', 'Beendet am', 'Landungen', 'Blockzeit', 'Unselected field'];
const practicalRows = (count: number) => [row(practicalHeader), ...Array.from({ length: count }, (_, i) => row([i === 0 ? '1' : String(i) + '.1', '', i === 0 ? 'Synthetic section' : 'Synthetic objective ' + i, 'Synthetic instructor', '', '', '', '0', '0:00', 'Do not collect']))];
test('practical training retains the evidenced longer loaded page while other source bounds stay unchanged', () => {
  const p = validateInformationPage(read('practical', practicalRows(62)));
  assert.equal(p.rows.length, 62); assert.equal(p.rows[61]!.values[2], 'Synthetic objective 61');
  assert.equal(p.rows[0]!.values[0], '1'); assert.equal(p.rows[0]!.values[2], 'Synthetic section');
  assert.equal(p.rows[61]!.values[1], ''); assert.equal(p.rows[61]!.values[7], '0');
  assert.equal(p.coverage.truncated, false); assert.equal(p.coverage.pagination, 'unverified');
  assert.ok(!JSON.stringify(p).includes('Do not collect'));
  const theory = validateInformationPage(read('theory', [row(['No', 'Status', 'Lernziel']), ...Array.from({ length: 62 }, (_, i) => row([String(i), '', 'Synthetic theory']))]));
  assert.equal(theory.rows.length, 20); assert.equal(theory.coverage.truncated, true);
});
test('practical status preserves literal source text without normalizing completion or qualification', () => {
  const rows = practicalRows(3);
  for (const [i, text] of ['  Synthetic explicit status  ', 'Unrecognized source state', '0'].entries()) {
    rows[i + 1]!.cells[1] = cell(text);
  }
  const p = validateInformationPage(read('practical', rows));
  assert.deepEqual(p.rows.map(r => r.values[1]), ['  Synthetic explicit status  ', 'Unrecognized source state', '0']);
});

test('blank graphical practical statuses remain unknown regardless of color and undocumented class', () => {
  const rows = practicalRows(4);
  for (const [i, color] of ['green', 'yellow', 'red', 'transparent'].entries()) {
    rows[i + 1]!.cells[1] = cell('', {
      className: 'synthetic-completed-' + i, id: 'private-source-' + i,
      style: { backgroundColor: color },
      getAttribute: () => { throw new Error('Uncontracted status attribute read'); },
    });
    // Dates/instructor text must not silently turn the missing status into a
    // completion/qualification claim; these remain independent raw columns.
    rows[i + 1]!.cells[6] = cell('01.10.2026');
  }
  const p = validateInformationPage(read('practical', rows));
  assert.deepEqual(p.rows.map(r => r.values[1]), ['', '', '', '']);
  assert.ok(p.rows.every(r => r.values[6] === '01.10.2026'));
  assert.ok(!JSON.stringify(p).includes('private-source-'));
  assert.ok(!JSON.stringify(p).includes('synthetic-completed-'));
});

test('unsupported tooltip or accessibility-only practical status is not adopted without a source contract', () => {
  const rows = practicalRows(1);
  rows[1]!.cells[1] = cell('', {
    title: 'Synthetic completion', ariaLabel: 'Synthetic qualification',
    children: [{ textContent: '', title: 'Unverified icon meaning' }],
    getAttribute: () => { throw new Error('Uncontracted status attribute read'); },
  });
  const p = validateInformationPage(read('practical', rows));
  assert.equal(p.rows[0]!.values[1], '');
  assert.ok(!JSON.stringify(p).includes('Synthetic completion'));
  assert.ok(!JSON.stringify(p).includes('Synthetic qualification'));
  assert.throws(() => validateInformationPage({ ...p, rows: [{ ...p.rows[0]!, status: 'completed' }] }));
});

test('practical finite bound and malformed later rows stay guarded after the original twenty-row boundary', () => {
  const exact = validateInformationPage(read('practical', practicalRows(100)));
  assert.equal(exact.rows.length, 100); assert.equal(exact.coverage.truncated, false);
  const overflow = validateInformationPage(read('practical', practicalRows(101)));
  assert.equal(overflow.rows.length, 100); assert.equal(overflow.coverage.truncated, true);
  assert.throws(() => validateInformationPage({ ...overflow, rows: [...overflow.rows, { ...overflow.rows[0]!, position: 101 }] }));
  const malformed = practicalRows(62); malformed[26]!.cells[2]!.colSpan = 2;
  assert.throws(() => validateInformationPage(read('practical', malformed)));
});
test('extended practical context-verified capture reopens alongside its original partial snapshot without rewriting it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-practical-')); const file = join(dir, 'capture.sqlite'); let db = nodeDriver(file);
  try {
    const p = validateInformationPage(read('practical', practicalRows(62)));
    let store = new InformationStore(db, scope, async () => {}); await store.initialize();
    const old = validateInformationCapture({ ...capture('old-practical'), ...p, rows: p.rows.slice(0, 20), coverage: { ...p.coverage, truncated: true } });
    await store.save(old); await store.save(capture('unrelated-work'));
    const before = await db.all('SELECT * FROM information_captures ORDER BY rowid');
    const source = 'https://vereinsflieger.de/member/profile/usereducation/editelidp?ueid=synthetic';
    const run = new InformationRun(scope, 'practical', source, 'extended-practical');
    run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run));
    run.observeNavigation(source); run.accept(source, source, { kind: 'vf-information-v1', nonce: run.messageNonce, url: source, page: p });
    assert.throws(() => run.capture(at));
    run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'save');
    await store.save(run.capture(at)); await db.close(); db = nodeDriver(file); store = new InformationStore(db, scope, async () => {}); await store.initialize(false);
    assert.equal((await store.history('practical', 0)).capture!.rows.length, 62);
    assert.deepEqual((await store.history('practical', 1)).capture, old);
    assert.deepEqual(await db.all('SELECT * FROM information_captures WHERE id<>? ORDER BY rowid', 'extended-practical'), before);
    assert.equal((await store.latest()).find(c => c.category === 'work-hours')!.id, 'unrelated-work');
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
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
  assert.equal(read('tasks', rows, undefined, 'Meine nicht beendeten Aufgaben', 'globalfilter').error, 'task-scope-unverified');
  for (const filter of ['', 'Alle Aufgaben', 'Alle nicht beendeten Aufgaben']) {
    assert.equal(read('tasks', rows, undefined, filter).error, 'task-scope-unverified');
    assert.throws(() => validateInformationPage({ ...p, filters: filter ? [filter] : [] }));
  }
  assert.throws(() => validateInformationPage(read('tasks', [rows[0]!]))) ;
});
test('task selection key is confined to its evidenced route; mutation, duplicate and cross-category routes reject', () => {
  assert.equal(informationCategoryUrl('tasks', tasksUrl), true);
  for (const bad of [tasksUrl + '&action=delete', tasksUrl + '&gselect=all', tasksUrl.replace('gselect=myopen', 'gselect=other'), tasksUrl.replace('tasklist/tasklist', 'tasklist/edit'), tasksUrl.replace('tasklist/tasklist', 'elsewhere')]) assert.equal(informationUrl(bad), false);
  assert.equal(informationCategoryUrl('tasks', url), false);
  assert.equal(informationCategoryUrl('tasks', ledgerUrl), false);
});
test('task selector probe reads only the selected label and exact observed selector links', () => {
  const options = [
    { label: 'Alle nicht beendeten Aufgaben', href: '?gselect=allopen' },
    { label: 'Meine nicht beendeten Aufgaben', href: '?gselect=myopen' },
    { label: 'Alle Aufgaben', href: '?gselect=all' },
  ];
  function probe(selected: string, links = options, href = TASK_SELECTION_PROBE_URL) {
    const selectedNode = { innerText: selected };
    const anchors = links.map(option => ({ innerText: option.label, getAttribute: (key: string) => key === 'href' ? option.href : null }));
    const document = { querySelector: () => null, querySelectorAll: (selector: string) => selector === '#globalfiltertime' ? [selectedNode] : selector === 'a[href*="gselect="]' ? anchors : [] };
    const window = {}; Object.assign(window, { top: window });
    return JSON.parse(JSON.stringify(runInNewContext(`(${TASK_SELECTION_READER_SOURCE})('probe')`, { document, window, location: { href }, URL })));
  }
  const captured = probe('Alle nicht beendeten Aufgaben');
  assert.deepEqual(captured, { selected: 'Alle nicht beendeten Aufgaben', options });
  assert.equal(validateTaskSelection(captured).restoreUrl, 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen');
  assert.equal(probe('Unknown selector'), null);
  assert.equal(probe('Alle Aufgaben', [...options, { label: 'Unsupported', href: '?gselect=other' }]), null);
  assert.equal(probe('Alle Aufgaben', options.slice(1)), null);
  assert.equal(probe('Alle Aufgaben', options, tasksUrl), null, 'initial selector probe requires a query-free task-list route');
  assert.throws(() => validateTaskSelection({ ...captured, options: [...options.slice(0, 2), { label: 'Unsupported', href: '?gselect=other' }] }));
  assert.throws(() => validateTaskSelection({ ...captured, selected: 'All tasks' }));
});
test('native task empty footer must be the exact paired sibling of the own-list header', () => {
  const fixture = () => {
    const h = { tagName: 'TABLE', id: 'tablelist_1', rows: [row(['Titel', 'Zu erledigen bis', 'Status'])], parentElement: null as any, nextElementSibling: null as any };
    const f = { tagName: 'TABLE', rows: [row(['Es wurden keine passenden Daten gefunden!', ''])] };
    h.parentElement = { tagName: 'DIV', id: 'div1', children: [h, f] }; h.nextElementSibling = f;
    return { h, f };
  };
  const native = fixture(); assert.equal(validateInformationPage(read('tasks', [], [native.h, native.f])).empty, true);
  for (const change of [
    ({ h }: ReturnType<typeof fixture>) => { h.parentElement.id = 'unrelated'; },
    ({ h }: ReturnType<typeof fixture>) => { h.parentElement.children = [h]; },
    ({ h }: ReturnType<typeof fixture>) => { h.id = 'other'; },
    ({ f }: ReturnType<typeof fixture>) => { f.rows[0]!.cells[1]!.innerText = 'Unrelated source content'; },
    ({ f }: ReturnType<typeof fixture>) => { f.rows[0]!.cells[0]!.colSpan = 2; },
    ({ f }: ReturnType<typeof fixture>) => { f.rows.push(row(['Unverified extra row', ''])); },
  ]) {
    const bad = fixture(); change(bad); assert.throws(() => validateInformationPage(read('tasks', [], [bad.h, bad.f])));
  }
});
test('duty empty requires the observed selected filter and exact paired header/footer on a known route', () => {
  const fixture = (url = 'https://vereinsflieger.de/member/profile/myservices.php') => {
    const h = { tagName: 'TABLE', id: 'tablelist_32', rows: [row(['Dienst', 'Diensttausch', 'Zeitraum', 'Person(en)', 'Dienstplan von'])], parentElement: null as any, nextElementSibling: null as any };
    const f = { tagName: 'TABLE', rows: [row(['Es wurden keine passenden Daten gefunden!', ''])] };
    h.parentElement = { tagName: 'DIV', id: 'div32', children: [h, f] }; h.nextElementSibling = f;
    return { h, f, url };
  };
  const native = fixture();
  const page = validateInformationPage(read('duties', [], [native.h, native.f], undefined, undefined, { url: native.url, globalFilter: 'Aktuelle und anstehende Dienste' }));
  assert.equal(page.empty, true); assert.deepEqual(page.rows, []);
  assert.deepEqual(page.filters, ['2026', 'Aktuelle und anstehende Dienste']);
  assert.equal(page.coverage.kind, 'visible-page'); assert.equal(page.coverage.pagination, 'unverified');
  for (const mutate of [
    ({ h }: ReturnType<typeof fixture>) => { h.parentElement.id = 'div31'; },
    ({ h }: ReturnType<typeof fixture>) => { h.parentElement.children = [h]; },
    ({ h }: ReturnType<typeof fixture>) => { h.nextElementSibling = null; },
    ({ f }: ReturnType<typeof fixture>) => { f.rows[0]!.cells[1]!.innerText = 'Source text'; },
    ({ f }: ReturnType<typeof fixture>) => { f.rows.push(row(['Another footer row', ''])); },
    ({ h }: ReturnType<typeof fixture>) => { h.rows[0]!.cells[1]!.innerText = 'Unsupported exchange'; },
  ]) {
    const bad = fixture(); mutate(bad);
    assert.equal(read('duties', [], [bad.h, bad.f], undefined, undefined, { url: bad.url, globalFilter: 'Aktuelle und anstehende Dienste' }).error, 'empty-scope-unverified');
  }
  assert.equal(read('duties', [], [native.h, native.f], undefined, undefined, { url: native.url, globalFilter: 'Alle Dienste' }).error, 'empty-scope-unverified');
  assert.equal(read('duties', [], [native.h, native.f], undefined, undefined, { url: 'https://vereinsflieger.de/member/profile/unrelated.php', globalFilter: 'Aktuelle und anstehende Dienste' }).error, 'empty-scope-unverified');
  const extraRows = [row(['Dienst', 'Diensttausch', 'Zeitraum', 'Person(en)', 'Dienstplan von']), row(['Synthetic duty', '', '01.11.2026', '', ''])];
  assert.equal(read('duties', extraRows, undefined, undefined, undefined, { url: native.url, globalFilter: 'Aktuelle und anstehende Dienste' }).empty, false);
});
function readCalendar(categories: string[], options: { selectedDate?: string; view?: string; shownDate?: string; dataDates?: string[] } = {}) {
  const selectedDate = options.selectedDate ?? '23.10.2026', view = options.view ?? '1 Tag';
  const labels = ['1 Tag', '1 Woche', '2 Wochen', '3 Wochen', '4 Wochen', '3 Monate', '6 Monate', '1 Jahr'];
  const dateInput = { tagName: 'INPUT', type: 'text', value: selectedDate };
  const selectOptions = labels.map(textContent => ({ textContent }));
  const dropdown = { options: selectOptions, selectedOptions: selectOptions.filter(option => option.textContent === view) };
  const calendarRow = (kind: string, index: number) => {
    const date = options.dataDates?.[index] ?? (index === 0 ? (options.shownDate ?? selectedDate) : '');
    const cells = ['', 'Tag', date, 'Synthetic time', kind, 'Synthetic info'].map(text => cell(text));
    if (kind !== 'Termine') {
      Object.defineProperty(cells[3]!, 'innerText', { get() { throw new Error('Unselected calendar time must not be read'); } });
      Object.defineProperty(cells[5]!, 'innerText', { get() { throw new Error('Unselected calendar Info must not be read'); } });
    }
    return { cells, querySelector: () => null };
  };
  const table = { id: 'tablelist_230', rows: [row(['', 'Tag', 'Datum', 'Zeit', 'Kategorie', 'Info']), ...categories.map((kind, index) => calendarRow(kind, index))] };
  const document = {
    getElementById: (id: string) => id === 'frm_datefrom' ? dateInput : null,
    querySelector: () => null,
    querySelectorAll: (query: string) => query === '#frm_datefrom' ? [dateInput] : query === 'select' ? [dropdown] : query === 'table[id^="tablelist_"]' ? [table] : [],
  };
  const window = {}; Object.assign(window, { top: window });
  return JSON.parse(JSON.stringify(runInNewContext(`(${INFORMATION_READER_SOURCE})(category, config)`, {
    document, location: { href: 'https://vereinsflieger.de/member/community/appointment/' }, window, URL,
    category: 'events', config: INFORMATION_TYPES.events,
  })));
}
test('calendar empty captures only a validated one-day excerpt with known other categories and never reads their details', () => {
  const categories = ['Fremde Dienste', 'Fremde Reservierungen', 'Flugzeugsperren', 'Fremde Dienste', 'Fremde Reservierungen', 'Flugzeugsperren'];
  const p = validateInformationPage(readCalendar(categories));
  assert.equal(p.empty, true); assert.deepEqual(p.rows, []);
  assert.deepEqual(p.filters, ['Quellkategorie: Termine', 'Ab 23.10.2026', 'Ansicht: 1 Tag']);
  assert.equal(p.coverage.kind, 'visible-page'); assert.equal(p.coverage.pagination, 'unverified');
  const headerOnly = readCalendar([]); assert.equal(headerOnly.error, 'empty-scope-unverified');
  assert.equal(readCalendar(categories, { view: '3 Monate' }).error, 'empty-scope-unverified');
  assert.equal(readCalendar(categories, { shownDate: '22.10.2026' }).error, 'empty-scope-unverified');
  assert.equal(readCalendar(categories, { dataDates: ['22.10.2026', '23.10.2026', '', '', '', ''] }).error, 'empty-scope-unverified');
  assert.equal(readCalendar([...categories.slice(0, 5), 'Unobserved category']).error, 'empty-scope-unverified');
  const event = validateInformationPage(readCalendar(['Termine']));
  assert.equal(event.empty, false); assert.deepEqual(event.rows[0]!.values, ['23.10.2026', 'Synthetic time', 'Termine', 'Synthetic info']);
});
function readNotice(category: 'document-notices' | 'news' | 'own-reservations', options: { rows?: ReturnType<typeof row>[]; duplicate?: boolean; wrongParent?: boolean; caption?: string; copies?: number; linkedTitle?: string; dateSuffix?: string } = {}) {
  const id = category === 'news' ? 'news' : category === 'own-reservations' ? 'my_reservation' : 'docs';
  const anchor = { nodeType: 1, tagName: 'A', innerText: options.linkedTitle ?? 'Synthetic notice', classList: { contains: (s: string) => s === 'icon-download' }, get href(): never { throw new Error('Download link must not be read'); } };
  const documentRow = row(['Synthetic notice 01.10.2026']);
  (documentRow.cells[0] as any).childNodes = [anchor, { nodeType: 3, textContent: options.dateSuffix ?? ' 01.10.2026' }];
  const table = { rows: options.rows ?? (category !== 'document-notices' ? [row(['', 'Es wurden keine Daten gefunden!'])] : Array.from({ length: options.copies ?? 1 }, () => documentRow)) };
  const head = { tagName: 'DIV', classList: { contains: (s: string) => s === 'box-header' }, querySelector: () => ({ innerText: options.caption ?? (category === 'news' ? 'News' : category === 'own-reservations' ? 'Meine Reservierungen' : 'Dokumente') }) };
  const content = { tagName: 'DIV', parentElement: null as any, querySelectorAll: () => [table] };
  const section = { tagName: 'DIV', children: [head, content] }; content.parentElement = options.wrongParent ? {} : section;
  const document = { querySelector: () => null, getElementById: (s: string) => s === id ? section : s === id + '_content' ? content : null, querySelectorAll: (s: string) => s === '#' + id || s === '#' + id + '_content' ? options.duplicate ? [section, section] : [section] : [] };
  const window = {}; Object.assign(window, { top: window });
  return JSON.parse(JSON.stringify(runInNewContext(`(${INFORMATION_READER_SOURCE})(category, config)`, { document, window, location: { href: overviewUrl }, URL, category, config: INFORMATION_TYPES[category] })));
}
test('document notice reader takes only direct title/date text and never reads download links or action metadata', () => {
  const p = validateInformationPage(readNotice('document-notices'));
  assert.deepEqual(p.rows, [{ position: 0, values: ['Synthetic notice 01.10.2026'] }]);
  assert.deepEqual(p.columns, [{ key: 'notice', label: 'Hinweis · Originaltext', index: 0 }]);
  const capped = validateInformationPage(readNotice('document-notices', { copies: 21 })); assert.equal(capped.rows.length, 20); assert.equal(capped.coverage.truncated, true);
  for (const options of [{ duplicate: true }, { wrongParent: true }, { caption: 'Other section' }, { rows: [] }, { rows: [row(['Unexpected body'])] }]) assert.throws(() => validateInformationPage(readNotice('document-notices', options)));
});
test('News supports only the evidenced empty overview; positive content is unsupported without opening or marking read', () => {
  const p = validateInformationPage(readNotice('news')); assert.equal(p.empty, true); assert.deepEqual(p.rows, []);
  assert.throws(() => validateInformationPage({ ...p, empty: false, rows: [{ position: 0, values: ['Forged positive news'] }] }));
  for (const rows of [[row(['', 'Synthetic positive news'])], [row(['Es wurden keine Daten gefunden!'])], [row(['', 'Es wurden keine Daten gefunden!']), row(['', 'Another row'])]]) assert.throws(() => validateInformationPage(readNotice('news', { rows })));
});
test('linked document title is retained with its separate date suffix; either missing part stays unsupported', () => {
  const p = validateInformationPage(readNotice('document-notices', { linkedTitle: 'Synthetic linked title', dateSuffix: ' - 01.10.2026' }));
  assert.equal(p.rows[0]!.values[0], 'Synthetic linked title - 01.10.2026');
  assert.throws(() => validateInformationPage(readNotice('document-notices', { linkedTitle: '' })));
  assert.throws(() => validateInformationPage(readNotice('document-notices', { linkedTitle: '01.10.2026 in a filename', dateSuffix: '' })));
});
test('own-reservation overview requires its own caption and explicit empty, never a general roster or positive booking', () => {
  const p = validateInformationPage(readNotice('own-reservations')); assert.equal(p.empty, true);
  assert.throws(() => validateInformationPage({ ...p, empty: false, rows: [{ position: 0, values: ['Forged booking'] }] }));
  for (const options of [{ caption: 'Reservierungen' }, { wrongParent: true }, { duplicate: true }, { rows: [row(['', 'Synthetic booking'])] }]) assert.throws(() => validateInformationPage(readNotice('own-reservations', options)));
});
test('notice sources require the exact query-free overview route and preserve strict ledger/task paths', () => {
  for (const category of ['document-notices', 'news', 'own-reservations'] as const) {
    assert.equal(informationCategoryUrl(category, overviewUrl), true);
    for (const bad of [overviewUrl + '?view=all', overviewUrl + '/', url, ledgerUrl]) assert.equal(informationCategoryUrl(category, bad), false);
  }
  assert.equal(informationCategoryUrl('ledger', 'https://vereinsflieger.de/member/profile/account.php/'), false);
  assert.equal(informationCategoryUrl('tasks', 'https://vereinsflieger.de/member/community/tasklist/tasklist/'), false);
});
test('Medical reader selects class/expiry only inside Medical section and excludes document/private rows', () => {
  const p = validateInformationPage(read('medical', [row(['Allgemeine Daten']), row(['Name', 'Private name']), row(['Medical']), row(['Klasse 2', 'Gültig bis 01.10.2027 - synthetic-ref']), row(['LAPL', '']), row(['Dokumente']), row(['Private document', 'Do not collect'])]));
  assert.equal(p.rows.length, 2); assert.deepEqual(p.rows[1]!.values, ['LAPL', '']); assert.ok(!JSON.stringify(p).includes('Private'));
});
test('minimum own profile reads only three required fields inside General Data, preserving raw names/reference', () => {
  const heading = row(['Allgemeine Daten']); heading.cells[0]!.colSpan = 2;
  const boundary = row(['Medical']); boundary.cells[0]!.colSpan = 3;
  const privateRow = row(['Mailadresse', 'Do not read contact']); Object.defineProperty(privateRow.cells[1], 'innerText', { get() { throw new Error('Excluded contact read'); } });
  const rows = [heading, row(['Vorname', 'Synthetic first']), row(['Nachname', 'Synthetic last']), privateRow, row(['Benutzernummer', '1001']), boundary, row(['Vorname', 'Do not collect outside section'])];
  const p = validateInformationPage(read('own-profile', rows));
  assert.deepEqual(p.rows.map(r => r.values), [['Vorname', 'Synthetic first'], ['Nachname', 'Synthetic last'], ['Benutzernummer', '1001']]);
  assert.deepEqual(p.filters, []); assert.ok(!JSON.stringify(p).includes('Do not'));
  assert.throws(() => validateInformationPage(read('own-profile', rows.filter(r => r !== rows[2]))));
  assert.throws(() => validateInformationPage(read('own-profile', [heading, ...rows.slice(1, 5), row(['Vorname', 'duplicate'])])));
  assert.throws(() => validateInformationPage({ ...p, rows: p.rows.map((r, i) => i === 0 ? { ...r, values: ['Mailadresse', 'Forbidden'] } : r) }));
  for (const url of [PROFILE_URL + '?id=foreign', PROFILE_URL + '/', ledgerUrl]) assert.equal(informationCategoryUrl('own-profile', url), false);
});
test('licence source metadata preserves paired original values and stops before Medical/documents without inferring qualification', () => {
  const heading = (text: string) => { const r = row([text]); r.cells[0]!.colSpan = 3; r.cells[0]!.querySelector = ((s: string) => s === 'b' ? {} : null) as any; return r; };
  const field = (label: string, value: string) => { const r = row([label, value]); r.cells[1]!.colSpan = 2; return r; };
  const after = field('Lizenz', 'Do not collect Medical/private value'); Object.defineProperty(after.cells[1], 'innerText', { get() { throw new Error('Read beyond licence boundary'); } });
  const rows = [heading('Lizenzen / Berechtigungen'), heading('Synthetic group'), field('Lizenz', ''), field('Klassenberechtigung (Segelflugzeuge)', 'Synthetic original rating'), heading(''), heading('Medical'), after];
  const p = validateInformationPage(read('licence-metadata', rows));
  assert.deepEqual(p.rows.map(r => r.values), [['Synthetic group', 'Lizenz', ''], ['Synthetic group', 'Klassenberechtigung (Segelflugzeuge)', 'Synthetic original rating']]);
  assert.deepEqual(p.filters, []); assert.ok(!JSON.stringify(p).includes('Do not collect'));
  for (const bad of [rows.slice(0, 4), [rows[0]!, rows[1]!, rows[2]!, rows[5]!], [rows[0]!, rows[1]!, field('Unknown field', 'Unsupported'), rows[3]!, rows[5]!], [...rows.slice(0, 4), rows[2]!, rows[5]!]]) assert.throws(() => validateInformationPage(read('licence-metadata', bad)));
  assert.equal(informationCategoryUrl('licence-metadata', PROFILE_URL + '?id=foreign'), false);
});
test('decoder rejects unknown fields, unsafe source, forged coverage and malformed/oversize metadata', () => {
  const p = page();
  for (const bad of [{ ...p, extra: true }, { ...p, path: '/member/delete-record' }, { ...p, empty: true }, { ...p, coverage: { ...p.coverage, kind: 'complete' } }, { ...p, rows: [{ position: 1, values: ['x'.repeat(8193), 'a', 'b', 'c', 'd'] }] }, { ...p, columns: p.columns.map(c => ({ ...c, key: '__proto__' })) }]) assert.throws(() => validateInformationPage(bad));
  assert.throws(() => validateInformationCapture({ ...capture(), retrievedAt: '2026-02-30T12:00:00.000Z' }));
  for (const bad of [url.replace('https:', 'http:'), url + '#secret', url + '&token=secret', 'https://evil.test/member/profile/viewprofile', 'https://vereinsflieger.de/member/download/document']) assert.equal(informationUrl(bad), false);
});
function contextMessage(run: InformationRun, changed = false) { return { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: { ...scope.context, accountNumber: changed ? '9999' : '1001' } }; }
const taskOptions = [
  { label: 'Alle nicht beendeten Aufgaben', href: '?gselect=allopen' },
  { label: 'Meine nicht beendeten Aufgaben', href: '?gselect=myopen' },
  { label: 'Alle Aufgaben', href: '?gselect=all' },
];
const taskSelection = (selected: string) => ({ selected, options: taskOptions });
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
test('own-task run probes the prior selector, reads only my-open tasks, and verifies the original selection is restored', () => {
  const run = new InformationRun(scope, 'tasks', tasksUrl, 'tasks-preserve');
  assert.equal(run.stage, 'selection'); assert.equal(run.url, TASK_SELECTION_PROBE_URL);
  run.observeNavigation(TASK_SELECTION_PROBE_URL);
  assert.equal(run.accept(TASK_SELECTION_PROBE_URL, TASK_SELECTION_PROBE_URL, {
    kind: 'vf-information-task-selection-v1', nonce: run.messageNonce, url: TASK_SELECTION_PROBE_URL,
    selection: taskSelection('Alle nicht beendeten Aufgaben'),
  }), 'navigate');
  assert.equal(run.taskRestoreUrl, 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=allopen');
  assert.equal(run.url, PROFILE_URL);
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'navigate');
  run.observeNavigation(tasksUrl);
  const ownTasks = read('tasks', [row(['Titel', 'Zu erledigen bis', 'Status']), row(['Synthetic own task', '', 'Offen'])]);
  assert.equal(run.accept(tasksUrl, tasksUrl, { kind: 'vf-information-v1', nonce: run.messageNonce, url: tasksUrl, page: ownTasks }), 'navigate');
  run.observeNavigation(PROFILE_URL); assert.equal(run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run)), 'navigate');
  assert.equal(run.stage, 'restore'); assert.equal(run.url, run.taskRestoreUrl);
  run.observeNavigation(run.url);
  assert.equal(run.accept(run.url, run.url, { kind: 'vf-information-task-restore-v1', nonce: run.messageNonce, url: run.url, selection: taskSelection('Alle nicht beendeten Aufgaben') }), 'save');
  assert.deepEqual(run.capture(at).rows, ownTasks.rows);
  assert.equal(run.resultUrl, run.taskRestoreUrl);
});
test('unsupported prior task selector cannot navigate to or capture the own-open list', () => {
  const run = new InformationRun(scope, 'tasks', tasksUrl, 'tasks-mismatch');
  run.observeNavigation(TASK_SELECTION_PROBE_URL);
  assert.throws(() => run.accept(TASK_SELECTION_PROBE_URL, TASK_SELECTION_PROBE_URL, {
    kind: 'vf-information-task-selection-v1', nonce: run.messageNonce, url: TASK_SELECTION_PROBE_URL,
    selection: { selected: 'Alle Aufgaben', options: [...taskOptions.slice(0, 2), { label: 'Andere Aufgaben', href: '?gselect=other' }] },
  }));
  assert.equal(run.stage, 'selection'); assert.equal(run.url, TASK_SELECTION_PROBE_URL);
  assert.throws(() => run.capture(at));
});
test('own-task capture is withheld when the restored selector does not match the prior choice', () => {
  const run = new InformationRun(scope, 'tasks', tasksUrl, 'tasks-restore-mismatch');
  run.observeNavigation(TASK_SELECTION_PROBE_URL);
  run.accept(TASK_SELECTION_PROBE_URL, TASK_SELECTION_PROBE_URL, { kind: 'vf-information-task-selection-v1', nonce: run.messageNonce, url: TASK_SELECTION_PROBE_URL, selection: taskSelection('Alle Aufgaben') });
  run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run));
  run.observeNavigation(tasksUrl); run.accept(tasksUrl, tasksUrl, { kind: 'vf-information-v1', nonce: run.messageNonce, url: tasksUrl, page: read('tasks', [row(['Titel', 'Zu erledigen bis', 'Status']), row(['Synthetic task', '', 'Offen'])]) });
  run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, contextMessage(run));
  run.observeNavigation(run.url);
  assert.throws(() => run.accept(run.url, run.url, { kind: 'vf-information-task-restore-v1', nonce: run.messageNonce, url: run.url, selection: taskSelection('Meine nicht beendeten Aufgaben') }));
  assert.equal(run.failureMessage, 'Der vorherige Aufgabenfilter konnte nicht bestätigt werden.');
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
    assert.deepEqual(await store.find('capture-a'), capture()); assert.equal(await store.find('not-saved'), null);
    await assert.rejects(store.find('../foreign'));
    await assert.rejects(new InformationStore(db, { ...scope, connectionId: 'other' }, gate).initialize());
    permitted = false; await assert.rejects(store.latest()); await assert.rejects(store.find('capture-a')); await assert.rejects(store.save(capture('new'))); permitted = true;
    assert.deepEqual(await store.latest(), [capture()]);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});
test('all enabled categories including an explicit empty own-task capture survive SQLite reopening together', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-catalogue-')); const file = join(dir, 'capture.sqlite');
  let db = nodeDriver(file);
  const paths: Partial<Record<InformationCategory, string>> = { 'training-summary': '/member/profile/usereducation/summaryueid', events: '/member/community/appointment/', ledger: new URL(ledgerUrl).pathname, tasks: new URL(tasksUrl).pathname, 'document-notices': new URL(overviewUrl).pathname, news: new URL(overviewUrl).pathname, 'own-reservations': new URL(overviewUrl).pathname, 'own-profile': new URL(PROFILE_URL).pathname, 'licence-metadata': new URL(PROFILE_URL).pathname, medical: new URL(PROFILE_URL).pathname, 'work-summary': new URL(PROFILE_URL).pathname, duties: '/member/profile/myservices.php', enrolments: '/member/profile/usereducation', practical: '/member/profile/usereducation/editelidp', theory: '/member/profile/usereducation/editelidt' };
  const values = Object.entries(INFORMATION_TYPES).map(([category, config]) => validateInformationCapture({
    version: 1, id: 'synthetic-' + category, retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile', category, path: paths[category as InformationCategory] ?? new URL(url).pathname,
    columns: Object.entries(config.fields).map(([key, names], index) => ({ key, label: names[0], index })),
    rows: category === 'training-summary' ? ['Praktische Ausbildung', 'Theoretische Ausbildung'].flatMap((group, g) => [...['Lernziele beendet', 'Lernziele begonnen', 'Lernziele nicht begonnen'].map((field, i) => ({ position: g * 3 + i, values: [group, field, 'Anzahl', '0'] })), ...(g ? [{ position: 6, values: [group, 'Theoriestunden', 'Zeit', ''] }] : [])]) : category === 'events' ? [{ position: 1, values: ['26.07.2026', 'Ganztägig', 'Termine', 'Synthetic event'] }] : category === 'licence-metadata' ? ['Lizenz', 'Klassenberechtigung (Segelflugzeuge)'].map((label, i) => ({ position: i, values: ['Synthetic group', label, ''] })) : category === 'own-profile' ? ['Vorname', 'Nachname', 'Benutzernummer'].map((label, i) => ({ position: i, values: [label, 'Synthetic raw value'] })) : ['tasks', 'news', 'own-reservations'].includes(category) ? [] : [{ position: 1, values: Object.keys(config.fields).map(() => 'Synthetic raw value') }],
    empty: ['tasks', 'news', 'own-reservations'].includes(category), filters: category === 'events' ? ['Quellkategorie: Termine', 'Ab 19.07.2026', 'Ansicht: 3 Monate'] : category === 'tasks' ? ['Meine nicht beendeten Aufgaben'] : [], coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' },
  })).sort((a, b) => a.category.localeCompare(b.category));
  try {
    let store = new InformationStore(db, scope, async () => {}); await store.initialize();
    for (const value of values) await store.save(value);
    await db.close(); db = nodeDriver(file); store = new InformationStore(db, scope, async () => {}); await store.initialize();
    assert.deepEqual(await store.latest(), values);
    const tasks = (await store.latest()).find(v => v.category === 'tasks')!;
    assert.equal(tasks.empty, true); assert.deepEqual(tasks.filters, ['Meine nicht beendeten Aufgaben']);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('stored history orders retrieval time then insertion ties, reopens unchanged and distinguishes no snapshot from source empty', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-history-')); const file = join(dir, 'capture.sqlite');
  let db = nodeDriver(file);
  try {
    let store = new InformationStore(db, scope, async () => {}); await store.initialize();
    const a = capture('first'), b = capture('second'), older = { ...capture('older'), retrievedAt: '2026-10-18T12:00:00.000Z' };
    await store.save(a); await store.save(b); await store.save(older);
    const before = await db.all('SELECT * FROM information_captures ORDER BY rowid');
    assert.deepEqual((await store.history('work-hours', 0)).capture, b);
    assert.deepEqual((await store.history('work-hours', 1)).capture, a);
    assert.deepEqual((await store.history('work-hours', 2)).capture, older);
    assert.deepEqual(await store.history('news', 0), { category: 'news', index: 0, total: 0, capture: null });
    for (const index of [-1, 0.5, 3, Number.NaN]) await assert.rejects(store.history('work-hours', index));
    await assert.rejects(store.history('unknown' as InformationCategory, 0));
    await db.close(); db = nodeDriver(file); store = new InformationStore(db, scope, async () => {}); await store.initialize();
    assert.equal((await store.history('work-hours', 2)).total, 3);
    assert.deepEqual(await db.all('SELECT * FROM information_captures ORDER BY rowid'), before);
    assert.equal((await store.latest()).find(c => c.category === 'work-hours')!.id, b.id);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('read-only opening refuses an uninitialized store without adding schema or rows', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-uninitialized-')); const file = join(dir, 'capture.sqlite');
  const db = nodeDriver(file);
  try {
    const store = new InformationStore(db, scope, async () => {});
    await assert.rejects(store.initialize(false), /Uninitialized/);
    assert.deepEqual(await db.all('SELECT name FROM sqlite_master'), []);
    assert.equal((await db.first<{user_version:number}>('PRAGMA user_version'))!.user_version, 0);
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

test('history cannot publish revoked, foreign or mismatched stored evidence and never repairs or deletes it', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-information-history-boundary-')); const file = join(dir, 'capture.sqlite');
  const db = nodeDriver(file); let calls = 0, revoke = false;
  const store = new InformationStore(db, scope, async () => { if (revoke && ++calls >= 3) throw new Error('Revoked history lease'); });
  try {
    await store.initialize(); await store.save(capture()); calls = 0; revoke = true;
    await assert.rejects(store.history('work-hours', 0), /Revoked/); revoke = false;
    const foreign = { ...capture('foreign-history'), owner: 'another-owner' };
    await db.run('INSERT INTO information_captures VALUES (?,?,?,?)', foreign.id, foreign.category, foreign.retrievedAt, JSON.stringify(foreign));
    await assert.rejects(store.history('work-hours', 0), /Foreign/);
    await assert.rejects(store.find('foreign-history'), /Foreign/);
    await db.run('INSERT INTO information_captures VALUES (?,?,?,?)', 'mismatched', 'work-hours', at, JSON.stringify(capture('different-id')));
    await assert.rejects(store.history('work-hours', 0), /identity mismatch/);
    await assert.rejects(store.find('mismatched'), /identity mismatch/);
    await db.run('INSERT INTO information_captures VALUES (?,?,?,?)', 'malformed', 'work-hours', at, '{');
    await assert.rejects(store.history('work-hours', 0));
    assert.equal((await db.first<{n:number}>('SELECT count(*) n FROM information_captures'))!.n, 4);
    assert.equal((await store.history('work-hours', 3)).capture!.id, 'capture-a');
  } finally { await db.close(); await rm(dir, { recursive: true, force: true }); }
});

 test('invoice capture is deferred while existing invoice evidence stays readable', () => {
  assert.ok(!retrievableInformationCategories.includes('invoices'));
  assert.ok(retrievableInformationCategories.includes('ledger'));
  assert.throws(() => new InformationRun(scope, 'invoices', url, 'invoice-deferred'));
  const config = INFORMATION_TYPES.invoices;
  const columns = Object.entries(config.fields).map(([key, labels], index) => ({ key, label: labels[0], index }));
  const page = validateInformationPage({ category: 'invoices', path: new URL(url).pathname, columns, rows: [{ position: 0, values: columns.map(() => 'synthetic') }], filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } });
  assert.equal(page.category, 'invoices');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { INFORMATION_READER_SOURCE, INFORMATION_TYPES, EVENT_SELECTION_READER_SOURCE, eventViews, eventSelectionFilters, validateInformationPage, informationCategoryUrl } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const url = 'https://vereinsflieger.de/member/community/appointment/?weekCount=synthetic-period';
const scope: ProviderScope = { version: 1, owner: 'synthetic-owner', connectionId: 'synthetic-scope', context: { accountNumber: '1001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const row = (texts: string[]) => ({ cells: texts.map(text => ({ innerText: text, textContent: text, colSpan: 1, rowSpan: 1, querySelector: () => null })) });
const header = () => row(['', 'Tag', 'Datum', 'Zeit', 'Kategorie', 'Info']);
function fixture(options: { date?: string; view?: string; rows?: ReturnType<typeof row>[]; duplicate?: boolean; missingDate?: boolean; duplicateDate?: boolean; foreignUrl?: string } = {}) {
  const table = { id: 'tablelist_230', rows: options.rows ?? [header(), row(['', 'So', '26.07.2026', 'Ganztägig', 'Termine', 'Synthetic all-day event']), row(['', '', '', '18:00 -\n20:00', 'Termine', 'Synthetic timed event\nOrt: Synthetic place'])] };
  const date = { tagName: 'INPUT', type: 'text', value: options.date ?? '19.07.2026' };
  const select = { options: eventViews.map(textContent => ({ textContent })), selectedOptions: [{ textContent: options.view ?? '3 Monate' }] };
  const document = { getElementById: (id: string) => id === 'frm_datefrom' && !options.missingDate ? date : null, querySelector: () => null, querySelectorAll: (s: string) => s === 'select' ? [select] : s === '#frm_datefrom' ? options.duplicateDate ? [date, date] : [date] : s === 'table[id^="tablelist_"]' ? options.duplicate ? [table, table] : [table] : [] };
  const window = {}; Object.assign(window, { top: window });
  const context = { document, window, location: { href: options.foreignUrl ?? url }, URL, category: 'events', config: INFORMATION_TYPES.events };
  const run = (source: string) => JSON.parse(JSON.stringify(runInNewContext(source, context)));
  return { read: () => run(`(${INFORMATION_READER_SOURCE})(category,config)`), selection: () => run(`(${EVENT_SELECTION_READER_SOURCE})()`) };
}

test('events inherit displayed dates and preserve all-day/time/location text without reading other calendar kinds', () => {
  const privateRow = row(['', 'So', '26.07.2026', '', 'Fremde Dienste', '']);
  for (const index of [0, 3, 5]) for (const property of ['innerText', 'textContent']) Object.defineProperty(privateRow.cells[index]!, property, { get() { throw new Error('Unselected private value read'); } });
  const p = validateInformationPage(fixture({ rows: [header(), privateRow, row(['', '', '', 'Ganztägig', 'Termine', 'Synthetic event\nOrt: Synthetic place'])] }).read());
  assert.deepEqual(p.rows, [{ position: 2, values: ['26.07.2026', 'Ganztägig', 'Termine', 'Synthetic event\nOrt: Synthetic place'] }]);
  assert.deepEqual(p.filters, ['Quellkategorie: Termine', 'Ab 19.07.2026', 'Ansicht: 3 Monate']);
  assert.deepEqual(validateInformationPage(fixture().read()).rows[1]!.values, ['26.07.2026', '18:00 -\n20:00', 'Termine', 'Synthetic timed event\nOrt: Synthetic place']);
});

test('events reject unconfirmed selection, ambiguous tables and zero selected rows; cap counts selected events only', () => {
  for (const options of [{ missingDate: true }, { duplicateDate: true }, { view: 'Unknown view' }, { date: '31.02.2026' }, { duplicate: true }, { rows: [header(), row(['', 'Mo', '19.10.2026', 'Ganztägig', 'Geburtstage', 'Never import'])] }]) assert.throws(() => validateInformationPage(fixture(options).read()));
  const many = [header(), ...Array.from({ length: 21 }, () => row(['', 'So', '26.07.2026', 'Ganztägig', 'Termine', 'Synthetic event']))];
  const capped = validateInformationPage(fixture({ rows: many }).read());
  assert.equal(capped.rows.length, 20); assert.equal(capped.coverage.truncated, true); assert.equal(capped.coverage.pagination, 'unverified');
  const bad = validateInformationPage(fixture().read()); bad.rows[0]!.values[2] = 'Geburtstage'; assert.throws(() => validateInformationPage(bad));
  const extra = [header(), row(['', 'So', '26.07.2026', 'Ganztägig', 'Termine', 'Synthetic event\nAttendees: do not collect'])];
  assert.throws(() => validateInformationPage(fixture({ rows: extra }).read()));
});

test('event selection reads its known date/view only; exact route rejects unrelated keys and aliases', () => {
  assert.deepEqual(fixture().selection(), { date: '19.07.2026', view: '3 Monate' });
  assert.equal(fixture({ foreignUrl: 'https://evil.test/member/community/appointment/' }).selection(), null);
  for (const date of ['00.07.2026', '31.02.2026', '19.13.2026', '19.07.0000']) assert.throws(() => eventSelectionFilters({ date, view: '3 Monate' }));
  assert.equal(informationCategoryUrl('events', url), true);
  assert.equal(informationCategoryUrl('events', url.replace('weekCount=', 'date=')), true);
  for (const value of [url + '&weekCount=other', url + '&date=synthetic-date', url.replace('weekCount=', 'date=') + '&date=other', url + '&id=foreign', url + '#other', url.replace('/?', '?'), PROFILE_URL]) assert.equal(informationCategoryUrl('events', value), false, value);
});

test('event operation binds initial date/view before profile navigation and refuses changed selection without saving', () => {
  for (const changed of [false, true]) {
    const run = new InformationRun(scope, 'events', url, 'synthetic-events');
    assert.equal(run.stage, 'selection'); assert.equal(run.url, url); run.observeNavigation(url);
    const selection = { kind: 'vf-information-selection-v1', nonce: run.messageNonce, url, selection: fixture().selection() };
    assert.equal(run.accept('https://evil.test/', url, selection), 'ignored');
    assert.equal(run.accept(url, url, selection), 'navigate'); assert.equal(run.stage, 'before');
    run.observeNavigation(PROFILE_URL); run.accept(PROFILE_URL, PROFILE_URL, { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scope.context });
    run.observeNavigation(url);
    const message = { kind: 'vf-information-v1', nonce: run.messageNonce, url, page: fixture({ date: changed ? '20.07.2026' : '19.07.2026' }).read() };
    if (changed) { assert.throws(() => run.accept(url, url, message), /selection changed/); assert.throws(() => run.capture('2026-10-19T16:00:00Z')); }
    else {
      assert.equal(run.accept(url, url, message), 'navigate'); run.observeNavigation(PROFILE_URL);
      assert.equal(run.accept(PROFILE_URL, PROFILE_URL, { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scope.context }), 'save');
      assert.equal(run.capture('2026-10-19T16:00:00.000Z').rows.length, 2);
    }
  }
});

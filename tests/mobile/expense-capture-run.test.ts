import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { FinancialCaptureRun } from '../../apps/platform-lab/src/vereinsflieger/expense-capture-run.ts';
import { FinancialObservationStore } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { financialAt as at, financialHash as hash, financialTarget as target, financialListUrl as listUrl, financialDetailUrl as detailUrl,
  financialProfile as profile, financialRead as read, financialObservation as observation } from './fixtures/expense-capture.ts';

const run = () => new FinancialCaptureRun(target, 'capture-one', listUrl, detailUrl);
function message(job: FinancialCaptureRun) {
  return { kind: job.stage === 'list' ? 'vf-financial-link-v1' : job.stage === 'detail' ? 'vf-financial-billing-v1' : 'vf-financial-profile-v1',
    nonce: job.messageNonce, url: job.url, ...(job.stage === 'before' || job.stage === 'after' ? { profile: profile() }
      : { page: job.stage === 'list' ? { url: listUrl, detailUrl } : read() }) };
}
function advance(job: FinancialCaptureRun) {
  job.observeNavigation(job.url); const p = message(job);
  return job.accept(job.url, job.url, p, target, at);
}
function ready(job: FinancialCaptureRun) { for (let i = 0; i < 4; i++) advance(job); assert.equal(job.stage, 'ready'); }

test('verified profile/list/detail/profile flow saves and reconciles one immutable SQLite receipt', async () => {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {});
  try {
    await store.initialize(true); const job = run();
    assert.equal(advance(job), 'navigate'); assert.equal(job.url, listUrl);
    assert.equal(advance(job), 'navigate'); assert.equal(job.url, detailUrl);
    assert.equal(advance(job), 'navigate'); assert.equal(job.url, PROFILE_URL);
    assert.equal(advance(job), 'save');
    const saved = await job.save(store, () => target, async () => {});
    assert.deepEqual(saved.value, observation()); assert.equal(job.stage, 'done');
    assert.deepEqual(await store.find(job.id), saved); assert.equal((await store.history()).total, 1);
    await assert.rejects(job.save(store, () => target, async () => {}));
  } finally { await db.close(); }
});

test('forged/foreign/stale bridge messages and absent navigation cannot advance capture', () => {
  const job = run(), p = message(job);
  assert.equal(job.accept(PROFILE_URL, PROFILE_URL, p, target, at), 'ignored');
  job.observeNavigation(PROFILE_URL);
  for (const changed of [{ ...p, nonce: 'old-before' }, { ...p, kind: 'vf-context-v1' }, { ...p, url: listUrl }]) {
    assert.equal(job.accept(PROFILE_URL, PROFILE_URL, changed, target, at), 'ignored');
  }
  assert.equal(job.accept('https://evil.test/', PROFILE_URL, p, target, at), 'ignored');
  assert.equal(job.accept(PROFILE_URL, listUrl, p, target, at), 'ignored');
  assert.equal(advance(job), 'navigate');
  assert.equal(job.accept(PROFILE_URL, PROFILE_URL, p, target, at), 'ignored');
});

test('second-profile identity/recipient changes and expiry retain prior observations', async () => {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {});
  try {
    await store.initialize(true); await store.save('prior', 'billed-flight', observation());
    for (const changed of [{ ...profile(), context: { ...target.scope.context, accountNumber: '99999' } },
      { ...profile(), ownRecipientLabel: 'Other, Person' }, { error: 'session-required' }]) {
      const job = run(); for (let i = 0; i < 3; i++) advance(job); job.observeNavigation(job.url);
      assert.throws(() => job.accept(job.url, job.url, { ...message(job), profile: changed }, target, at), /could not be verified/);
      assert.equal(job.stage, 'failed'); await assert.rejects(job.save(store, () => target, async () => {}));
    }
    assert.equal((await store.history()).total, 1); assert.deepEqual((await store.find('prior'))!.value, observation());
  } finally { await db.close(); }
});

for (const stage of ['before', 'list', 'detail', 'after'] as const) test(`cancellation at ${stage} rejects late callbacks`, () => {
  const job = run(); while (job.stage !== stage) advance(job);
  const old = message(job); assert.equal(job.cancel(), true);
  job.observeNavigation(old.url); assert.equal(job.accept(old.url, old.url, old, target, at), 'ignored');
  assert.equal(job.stage, 'cancelled');
});

test('unobserved detail links, unbilled layouts and foreign targets never reach save', () => {
  const job = run(); advance(job); job.observeNavigation(job.url);
  assert.throws(() => job.accept(job.url, job.url, { ...message(job), page: { url: listUrl, detailUrl: detailUrl.replace('54321', '99999') } }, target, at));
  const unbilled = run(); advance(unbilled); advance(unbilled); unbilled.observeNavigation(unbilled.url);
  assert.throws(() => unbilled.accept(unbilled.url, unbilled.url, { ...message(unbilled), page: { ...read(), billedRaw: 'Nein' } }, target, at));
  const foreign = structuredClone(target); foreign.scope.owner = 'other';
  assert.throws(() => run().accept(PROFILE_URL, PROFILE_URL, {}, foreign, at));
  for (const url of [listUrl + '?token=secret', listUrl + '?_params=observed-preset', listUrl.replace('https:', 'http:'), listUrl.replace('vereinsflieger.de', 'evil.test')]) {
    assert.throws(() => new FinancialCaptureRun(target, 'job', url, detailUrl));
  }
});

test('lost post-commit acknowledgement reconciles the same receipt on explicit retry', async () => {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {});
  try {
    await store.initialize(true); const job = run(); ready(job); let guards = 0;
    await assert.rejects(job.save(store, () => target, async () => { if (++guards === 3) throw Error('revoked'); }));
    assert.equal(job.stage, 'save-uncertain'); assert.ok(await store.find(job.id));
    const recovered = await job.save(store, () => target, async () => {});
    assert.equal(job.stage, 'done'); assert.equal((await store.history()).total, 1); assert.deepEqual(recovered.value, observation());
  } finally { await db.close(); }
});

test('owner switch or revoked lease during save cannot acknowledge data to a foreign selection', async () => {
  const db = nodeDriver(':memory:'); let selected = structuredClone(target), leaseActive = true;
  const authorize = async () => { if (!leaseActive || canonical(selected) !== canonical(target)) throw Error('lease revoked'); };
  const store = new FinancialObservationStore(db, target, hash, authorize);
  try {
    await store.initialize(true); const job = run(); ready(job); selected.scope.connectionId = 'other';
    await assert.rejects(job.save(store, () => selected, authorize)); assert.equal((await db.first<{ n: number }>('SELECT count(*) n FROM financial_observations'))!.n, 0);
    selected = structuredClone(target); leaseActive = false;
    await assert.rejects(job.save(store, () => selected, authorize));
    leaseActive = true; await job.save(store, () => selected, authorize);
    assert.equal((await store.history()).total, 1);
  } finally { await db.close(); }
});

test('save locks cancellation until the original receipt outcome is known', async () => {
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; });
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, async text => { entered(); await gate; return hash(text); }, async () => {});
  try {
    await store.initialize(true); const job = run(); ready(job); const pending = job.save(store, () => target, async () => {});
    await started; assert.equal(job.cancel(), false); release(); await pending; assert.equal(job.stage, 'done');
  } finally { release(); await db.close(); }
});

test('actual emitted profile/list/detail bridge scripts run against independent synthetic DOM shapes', () => {
  const job = run();
  class Cell {
    colSpan = 1; rowSpan = 1;
    constructor(public textContent: string, public nested: Table[] = []) {}
    get innerText() { return this.textContent; }
    querySelector() { return this.nested[0] ?? null; } querySelectorAll() { return this.nested; }
  }
  class Row { constructor(public cells: Cell[]) {} getClientRects() { return [{}]; } }
  class Table {
    constructor(public rows: Row[], public links: unknown[] = []) {}
    getClientRects() { return [{}]; } querySelectorAll() { return this.links; }
  }
  const row = (...s: string[]) => new Row(s.map(v => new Cell(v)));
  const profileRows = [row('Benutzernummer', '12345'), row('Vorname', 'Alex'), row('Nachname', 'Example'), row('IBAN', 'DO_NOT_COLLECT')];
  const fees = new Table([row('Example, Alex', 'INV-A - Flight fee', '2,40 EUR', ''), row('Example, Alex', 'INV-A - Launch fee', '4,00 EUR', ''), row('', 'Summe:', '6,40 EUR', '')]);
  const detail = new Table([row('Allgemeine Daten', ''), row('Eintrag', '54321'), row('Verein', 'Synthetic club'), row('Flugdaten', ''),
    row('CallSign', 'D-TEST'), row('Datum', '31.05.2026'), row('Abrechnungsdaten', ''), row('Abrechnungsart', 'Pilot'), row('Abgerechnet', 'Ja'),
    new Row([new Cell('Synthetic club'), new Cell('', [fees])])]);
  const list = new Table([row('Synthetic row')], [{ href: detailUrl, getClientRects: () => [{}] }]);
  for (let i = 0; i < 4; i++) {
    const messages: string[] = [], window = { top: null as unknown, ReactNativeWebView: { postMessage: (v: string) => messages.push(v) } }; window.top = window;
    const document = { readyState: 'complete', querySelectorAll: (s: string) => {
      if (s.startsWith('input')) return [];
      if (s === 'table.tablelist.alternative tr') return profileRows;
      if (s === '#topnavi a[href]') return [{ textContent: 'Synthetic club', getAttribute: () => '/member/community/main' }];
      if (s === 'table#tablelist_20') return [list]; if (s === 'table.view') return [detail];
      throw Error('Unexpected DOM read: ' + s);
    } };
    const url = job.url; job.observeNavigation(url);
    runInNewContext(job.script, { window, document, location: new URL(url), URL });
    assert.equal(messages.length, 1); assert.ok(!messages[0]!.includes('DO_NOT_COLLECT'));
    job.accept(url, url, JSON.parse(messages[0]!), target, at);
  }
  assert.equal(job.stage, 'ready');
});

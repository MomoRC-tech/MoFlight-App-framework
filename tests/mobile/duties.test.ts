import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDutyOverview, createDutyRosterSnapshot, dutyWindow, parseDutyPeriod, abbreviateDutyName, DUTY_RETENTION_MS, validateDutyRosterSnapshot } from '../../apps/platform-lab/src/vereinsflieger/duties.ts';
import { DutyRosterStore } from '../../apps/platform-lab/src/vereinsflieger/duty-store.ts';
import { InformationRun } from '../../apps/platform-lab/src/vereinsflieger/information-run.ts';
import { PROFILE_URL } from '../../apps/platform-lab/src/vereinsflieger/context.ts';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';
import { nodeDriver } from './sqlite-driver.ts';

const scope: ProviderScope = { version: 1, owner: 'synthetic', connectionId: 'synthetic-club', context: { accountNumber: '123', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
const at = '2026-10-22T10:00:00.000Z', time = Date.parse(at);
function capture(rows: string[][] = [], path = '/member/profile/myservices.php', id = 'synthetic-capture'): InformationCapture {
  return { version: 1, id, retrievedAt: at, owner: scope.owner, connectionId: scope.connectionId, sourceIdentity: 'provisional-observed-profile', category: 'duties', path, columns: [{ key: 'duty', label: 'Dienst', index: 0 }, { key: 'period', label: 'Zeitraum', index: 1 }, { key: 'people', label: 'Person(en)', index: 2 }], rows: rows.map((values, position) => ({ position, values })), filters: [], empty: !rows.length, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } };
}
const sample = () => createDutyRosterSnapshot(scope, [capture([['Custom duty', '20.10.2026 -\n25.10.2026 23:59', 'Ada Synthetic\nBob Example']])], at);

test('source coverage keeps local window, missing/empty/truncated pages and unknown dates distinct after offline reopen', async () => {
  const db = nodeDriver(':memory:');
  try {
    const own = capture([['Own', '01.10.2026 - 25.10.2026', 'Ada Synthetic'], ['Unknown', '', 'Bob Example']]);
    const club = capture([], '/member/community/serviceshedulelist.php', 'club-page');
    const snapshot = createDutyRosterSnapshot(scope,[own,club],at);
    const store = new DutyRosterStore(db,scope,async()=>{},()=>time);
    await store.initialize(); await store.save(snapshot);
    const reopened = new DutyRosterStore(db,scope,async()=>{},()=>time); await reopened.initialize(false);
    const overview = buildDutyOverview(scope,await reopened.load(),'2026-10-22',time);
    assert.deepEqual(overview.sources?.map(s=>[s.source,s.state,s.rowCount,s.inWindowCount,s.unknownPeriodCount,s.complete]),[
      ['own','partial',2,1,1,false],['personal-list','missing',0,0,0,false],['club','empty-page',0,0,0,false],
    ]);
    assert.deepEqual(overview.sources?.[0]?.displayedInterval,{start:'2026-10-01',end:'2026-10-25'});
    assert.deepEqual(overview.window,{start:'2026-10-22',end:'2026-11-01'});
    assert.equal(overview.status,'partial');
    assert.ok(!JSON.stringify(overview.sources).includes('Ada'));
    const truncated = createDutyRosterSnapshot(scope,[{...own,coverage:{...own.coverage,truncated:true}}],at);
    const cut = buildDutyOverview(scope,truncated,'2026-10-22',time);
    assert.equal(cut.sources?.[0]?.state,'truncated');assert.match(cut.coverageMessage,/abgeschnitten/);
    assert.deepEqual(buildDutyOverview(scope,snapshot,'2026-11-22',time+DUTY_RETENTION_MS).sources,[]);
  } finally { await db.close(); }
});

test('window includes current partial week through following Sunday, including Sunday/month/year edges', () => {
  assert.deepEqual(dutyWindow('2026-10-22'), { start: '2026-10-22', end: '2026-11-01' });
  assert.equal(dutyWindow('2026-10-25').end, '2026-11-01');
  assert.equal(dutyWindow('2026-10-26').end, '2026-11-08');
  assert.equal(dutyWindow('2026-12-31').end, '2027-01-10');
  assert.throws(() => dutyWindow('2026-02-30'));
});

test('observed wrapped German intervals preserve dates, invalid/missing/ambiguous periods stay unknown', () => {
  assert.deepEqual(parseDutyPeriod('01.09.2026 -\n07.09.2026 23:59'), { start: '2026-09-01', end: '2026-09-07' });
  assert.deepEqual(parseDutyPeriod('22.10.2026 08:00 - 22.10.2026 10:00'), { start: '2026-10-22', end: '2026-10-22' });
  for (const raw of ['', '22.10.2026', '01.11.2026 - 30.10.2026', '31.02.2026 - 01.03.2026', '22.10.2026 25:00 - 23.10.2026', '22.10.2026 12:00 - 22.10.2026 10:00', '22.10.26 - 23.10.26', '22.10.2026 - 23.10.2026 CET']) assert.equal(parseDutyPeriod(raw), null, raw);
});

test('all custom duty names and overlapping full intervals retained once; three later own records exclude in-progress duty', () => {
  const rows = [
    ['Week duty', '20.10.2026 - 05.11.2026 23:59', 'Ada Synthetic'],
    ['Unknown custom role', '01.11.2026 - 01.11.2026 23:59', 'Ada Synthetic'],
    ['Later 4', '07.11.2026 - 07.11.2026 23:59', 'Ada Synthetic'],
    ['Later 2', '03.11.2026 - 03.11.2026 23:59', 'Ada Synthetic'],
    ['Later 1', '02.11.2026 - 02.11.2026 23:59', 'Ada Synthetic'],
    ['Later 3', '04.11.2026 - 04.11.2026 23:59', 'Ada Synthetic'],
    ['Past', '19.10.2026 - 21.10.2026 23:59', 'Ada Synthetic'],
    ['Unknown period', '', 'Ada Synthetic'],
  ];
  const overview = buildDutyOverview(scope, createDutyRosterSnapshot(scope, [capture(rows)], at), '2026-10-22', time);
  assert.deepEqual(overview.items.map(i => i.duty), ['Week duty', 'Unknown custom role']);
  assert.equal(overview.items[0]!.period, rows[0]![1]);
  assert.equal(overview.items[0]!.end, '2026-11-05');
  assert.equal(overview.ownItems.length, 2);
  assert.deepEqual(overview.laterOwn.map(i => i.duty), ['Later 1', 'Later 2', 'Later 3']);
  assert.equal(overview.unplaced.length, 1);
  assert.equal(overview.status, 'partial');
});

test('name abbreviations are display-only, no same-name ownership or cross-row partner inference', () => {
  assert.equal(abbreviateDutyName('Ada Synthetic'), 'Ada S.');
  assert.equal(abbreviateDutyName('Ada'), 'Ada');
  assert.equal(abbreviateDutyName('Anna-Lena'), 'Anna-Lena');
  assert.equal(abbreviateDutyName('Éva'), 'Éva');
  assert.equal(abbreviateDutyName('A.'), 'A.');
  assert.equal(abbreviateDutyName(''), 'Name unbekannt');
  assert.equal(abbreviateDutyName('Synthetic, Ada'), 'Ada S.');
  assert.equal(abbreviateDutyName('Synthetic, Merlin + Example, Anna Maria'), 'Merlin S. · Anna Maria E.');
  assert.equal(abbreviateDutyName('Synthetic, MerlinExample, Anna Maria'), 'Namen unklar · bitte synchronisieren');
  assert.equal(abbreviateDutyName('Synthetic, Merlin'), 'Merlin S.');
  assert.equal(abbreviateDutyName('Synthetic, Anna Maria'), 'Anna Maria S.');
  assert.equal(abbreviateDutyName('Anna Maria Synthetic'), 'Anna Maria S.');
  assert.equal(abbreviateDutyName('Anna-Lena Éxample'), 'Anna-Lena É.');
  assert.equal(abbreviateDutyName('Synthetic, Ada\nBob Example'), 'Ada S. · Bob E.');
  assert.equal(abbreviateDutyName('  Ada\tSynthetic\r\n\r\n Example, Bob  '), 'Ada S. · Bob E.');
  const snapshot = createDutyRosterSnapshot(scope, [capture([['Custom duty', '20.10.2026 - 25.10.2026 23:59', 'Synthetic, Ada Maria\nBob Example']]), capture([['Custom duty', '22.10.2026 - 25.10.2026 23:59', 'Ada Synthetic\nCarla Other']], '/member/profile/allservicelist.php', 'club-capture')], at);
  const overview = buildDutyOverview(scope, snapshot, '2026-10-22', time);
  assert.deepEqual(overview.items.map(item => item.ownState), ['own', 'unknown']);
  assert.deepEqual(overview.items[0]!.people, ['Ada Maria S.', 'Bob E.']);
  assert.equal(snapshot.captures[0]!.rows[0]!.values[2], 'Synthetic, Ada Maria\nBob Example', 'raw name evidence is preserved');
  assert.equal(overview.items[0]!.identity, 'source-row-only');
  assert.deepEqual(overview.items[0]!.coAssignees, []);
  assert.match(overview.coverageMessage, /Partner ungeprüft/);
});

test('old collapsed people stay explicit until refresh and are never guessed into different identities', () => {
  const raw='Synthetic, MerlinExample, Anna Maria';
  const snapshot=createDutyRosterSnapshot(scope,[capture([['Synthetic duty','22.10.2026 - 25.10.2026 23:59',raw]])],at);
  const overview=buildDutyOverview(scope,snapshot,'2026-10-22',time);
  assert.deepEqual(overview.items[0]!.people,['Namen unklar · bitte synchronisieren']);
  assert.equal(snapshot.captures[0]!.rows[0]!.values[2],raw);
  assert.equal(overview.items[0]!.ownState,'own');
});

test('missing, empty, truncated and expired evidence cannot become complete or no-duties', () => {
  assert.equal(buildDutyOverview(scope, null, '2026-10-22', time).status, 'unavailable');
  const empty = createDutyRosterSnapshot(scope, [capture()], at);
  assert.equal(buildDutyOverview(scope, empty, '2026-10-22', time).status, 'partial');
  const truncated = sample(); truncated.captures[0]!.coverage.truncated = true;
  assert.equal(buildDutyOverview(scope, truncated, '2026-10-22', time).status, 'partial');
  assert.equal(buildDutyOverview(scope, sample(), '2026-11-21', time + DUTY_RETENTION_MS).status, 'unavailable');
  assert.equal(buildDutyOverview(scope, sample(), '2026-10-21', time - 1).status, 'unavailable');
});

test('scope, route, missing identity and ambiguous duplicate source are rejected without invented IDs', () => {
  const foreign = { ...scope, owner: 'foreign' };
  assert.throws(() => buildDutyOverview(foreign, sample(), '2026-10-22', time));
  assert.throws(() => buildDutyOverview({ ...scope, context: { ...scope.context, clubLabel: 'Other club' } }, sample(), '2026-10-22', time));
  assert.throws(() => createDutyRosterSnapshot(scope, [capture([], '/member/other')], at));
  assert.throws(() => createDutyRosterSnapshot(scope, [capture(), capture()], at));
  assert.throws(() => createDutyRosterSnapshot(scope, [{ ...capture(), connectionId: 'foreign' }], at));
  assert.throws(() => validateDutyRosterSnapshot({ ...sample(), captures: [{ ...capture(), id: '' }] }));
});

test('real SQLite cache survives reopen, account/club isolation fails closed and expiry removes raw rows at 30 days', async () => {
  const db = nodeDriver(':memory:'); let now = time;
  try {
    const store = new DutyRosterStore(db, scope, async () => {}, () => now);
    await store.initialize(); await store.save(sample());
    const reopened = new DutyRosterStore(db, scope, async () => {}, () => now);
    await reopened.initialize(false); assert.deepEqual(await reopened.load(), sample());
    const otherClub = new DutyRosterStore(db, { ...scope, context: { ...scope.context, clubLabel: 'Other club' } }, async () => {}, () => now);
    await assert.rejects(otherClub.initialize(false), /Foreign duty cache/);
    const otherAccount = new DutyRosterStore(db, { ...scope, owner: 'foreign' }, async () => {}, () => now);
    await assert.rejects(otherAccount.initialize(false), /Foreign duty cache/);
    await assert.rejects(store.save({ ...sample(), scope: { ...scope, owner: 'foreign' } }), /Foreign/);
    now += DUTY_RETENTION_MS - 1; assert.ok(await reopened.load());
    now++; assert.equal(await reopened.load(), null);
    assert.equal((await db.first<{ n: number }>('SELECT count(*) n FROM duty_roster'))!.n, 0);
  } finally { await db.close(); }
});

test('failed/cancelled/older refresh preserves last roster; rewrapping never extends original expiry', async () => {
  const db = nodeDriver(':memory:'); let cancelled = false, calls = 0;
  const authorize = async () => { calls++; if (cancelled && calls >= 3) throw new Error('Cancelled'); };
  try {
    const store = new DutyRosterStore(db, scope, authorize, () => time + 1000);
    await store.initialize(); await store.save(sample());
    const updated = createDutyRosterSnapshot(scope, [{ ...capture([['Changed duty', '22.10.2026 - 25.10.2026', 'Ada Synthetic']]), retrievedAt: '2026-10-22T10:00:00.500Z' }], '2026-10-22T10:00:00.500Z');
    cancelled = true; calls = 0; await assert.rejects(store.save(updated), /Cancelled/);
    cancelled = false; assert.deepEqual(await store.load(), sample());
    await store.save(updated);
    await assert.rejects(store.save(sample()), /Older duty refresh/);
    assert.deepEqual(await store.load(), updated);
    const wrapped = createDutyRosterSnapshot(scope, sample().captures, '2026-10-23T10:00:00.000Z');
    const later = new DutyRosterStore(db, scope, async () => {}, () => time + 24 * 60 * 60 * 1000);
    await later.save(wrapped);
    assert.equal((await db.first<{ expires_at: number }>('SELECT expires_at FROM duty_roster'))!.expires_at, time + DUTY_RETENTION_MS);
  } finally { await db.close(); }
});

test('supported own route uses fresh context before and after reading; foreign profile prevents snapshot publication', () => {
  const run = new InformationRun(scope, 'duties', 'https://vereinsflieger.de/member/profile/myservices.php', 'synthetic-duty-run');
  const context = () => ({ kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scope.context });
  run.observeNavigation(PROFILE_URL);
  assert.equal(run.accept(PROFILE_URL, PROFILE_URL, context()), 'navigate');
  const url = run.url, source = capture(); const { version: _v, id: _i, retrievedAt: _t, owner: _o, connectionId: _c, sourceIdentity: _s, ...page } = source;
  run.observeNavigation(url);
  assert.equal(run.accept(url, url, { kind: 'vf-information-v1', nonce: run.messageNonce, url, page }), 'navigate');
  assert.throws(() => run.capture(at));
  run.observeNavigation(PROFILE_URL);
  assert.throws(() => run.accept(PROFILE_URL, PROFILE_URL, { ...context(), context: { ...scope.context, accountNumber: '456' } }));
  assert.throws(() => run.capture(at));
});

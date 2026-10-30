import assert from 'node:assert/strict';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { decodeFlightBillingObservation, FLIGHT_BILLING_READER_SOURCE, type FlightBillingRead, type FlightBillingTarget } from '../../apps/platform-lab/src/vereinsflieger/expense-flight-billing.ts';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store.ts';

const url = 'https://vereinsflieger.de/member/profile/viewflight.php?flid=12345';
const scope: ProviderScope = { version: 1, owner: 'owner-a', connectionId: 'connection-a', context: {
  accountNumber: '10001', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only', verification: 'observed-profile-number',
} };
const target: FlightBillingTarget = { storeId: '11111111-1111-4111-8111-111111111111', scope,
  ownRecipientLabel: 'Example, Alex', observedDetailUrl: url };
const at = '2026-10-30T12:00:00.000Z';
function source(): FlightBillingRead {
  return { url, sourceFlightId: '12345', registrationRaw: 'D-TEST', dateRaw: '30.06.2026', billingModeRaw: 'Pilot',
    billedRaw: 'Ja', clubLabel: 'Synthetic club', lines: [
      { position: 0, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Synthetic invoice - Flight fee', amountRaw: '2,40 EUR' },
      { position: 1, recipientRaw: 'Example, Alex', descriptionRaw: 'INV-A - Synthetic invoice - Winch fee', amountRaw: '4,00 EUR' },
    ], statedTotalRaw: '6,40 EUR' };
}
const decode = (p: unknown, t = target) => decodeFlightBillingObservation(p, t,
  { storeId: target.storeId, scope }, scope.context, scope.context, at);

test('billed raw lines preserve invoice text, explicit currency text and total without producing expenses', () => {
  const input = source(), result = decode(input);
  assert.deepEqual(result.source, input);
  assert.equal(result.coverage, 'single-flight');
  assert.equal(result.interpretation, 'raw-source-only');
  assert.equal(result.source.lines[0]!.amountRaw, '2,40 EUR');
  assert.equal('minorUnits' in result.source.lines[0]!, false);
  assert.equal('paid' in result, false);
  assert.equal('chargeId' in result.source.lines[0]!, false);
  input.lines[0]!.amountRaw = '999,00 EUR';
  result.scope.context.clubLabel = 'Detached result';
  assert.equal(result.source.lines[0]!.amountRaw, '2,40 EUR');
  assert.equal(target.scope.context.clubLabel, 'Synthetic club');
});

test('unknown numeric grammar and disagreeing source totals remain raw observations, never trusted calculations', () => {
  const p = source(); p.lines[0]!.amountRaw = 'unknown'; p.statedTotalRaw = '999,00 EUR';
  assert.deepEqual(decode(p).source, p);
});

const badReads: [string, (p: FlightBillingRead) => void][] = [
  ['other URL', p => { p.url += '&other=1'; }],
  ['other flight', p => { p.sourceFlightId = '99999'; }],
  ['other club', p => { p.clubLabel = 'Other club'; }],
  ['unbilled status', p => { (p as { billedRaw: string }).billedRaw = 'Nein'; }],
  ['unknown status', p => { (p as { billedRaw: string }).billedRaw = ''; }],
  ['other charged person', p => { p.lines[0]!.recipientRaw = 'Other, Person'; }],
  ['missing line', p => { p.lines.shift(); }],
  ['duplicate position', p => { p.lines[1]!.position = 0; }],
  ['summary as fee', p => { p.lines[0]!.descriptionRaw = 'Summe:'; }],
  ['missing source total', p => { p.statedTotalRaw = ''; }],
  ['missing fee amount', p => { p.lines[0]!.amountRaw = ''; }],
  ['invalid calendar date', p => { p.dateRaw = '31.06.2026'; }],
  ['unbounded amount', p => { p.lines[0]!.amountRaw = '1'.repeat(129); }],
  ['unbounded fee text', p => { p.lines[0]!.descriptionRaw = 'x'.repeat(2049); }],
  ['unsupported property', p => { (p as unknown as Record<string, unknown>).paid = true; }],
  ['unsupported line property', p => { (p.lines[0] as unknown as Record<string, unknown>).chargeId = 'asserted'; }],
];
for (const [name, change] of badReads) test(`reject ${name} without changing original evidence`, () => {
  const p = source(); change(p); const before = JSON.stringify(p);
  assert.throws(() => decode(p)); assert.equal(JSON.stringify(p), before);
});

for (const [name, change] of [
  ['owner', (s: ProviderScope) => { s.owner = 'owner-b'; }],
  ['connection', (s: ProviderScope) => { s.connectionId = 'connection-b'; }],
  ['provider account', (s: ProviderScope) => { s.context.accountNumber = '10002'; }],
  ['club', (s: ProviderScope) => { s.context.clubLabel = 'Other club'; }],
] as const) test(`late result cannot be admitted with the old ${name} target`, () => {
  const switched = structuredClone(scope); change(switched);
  assert.throws(() => decodeFlightBillingObservation(source(), target, { storeId: target.storeId, scope: switched }, scope.context, scope.context, at));
});

test('a result must carry its original request target through owner/store/connection switches', () => {
  // Matching display context cannot hide a local owner/store/connection switch.
  const result = decode(source());
  assert.equal(result.scope.owner, 'owner-a'); assert.equal(result.scope.connectionId, 'connection-a');
  assert.equal(result.storeId, target.storeId);
  assert.throws(() => decodeFlightBillingObservation(source(), target,
    { storeId: '22222222-2222-4222-8222-222222222222', scope }, scope.context, scope.context, at));
  assert.throws(() => decode(source(), { ...target, storeId: 'invalid' }));
  assert.throws(() => decode(source(), { ...target, ownRecipientLabel: 'Other, Person' }));
  assert.throws(() => decode(source(), { ...target, observedDetailUrl: url.replace('12345', '67890') }));
});

test('changed or self-extended before/after profile contexts cannot attest the source', () => {
  const selected = { storeId: target.storeId, scope };
  for (const changed of [{ ...scope.context, accountNumber: '10002' }, { ...scope.context, clubLabel: 'Other club' },
    { ...scope.context, attested: true }]) {
    assert.throws(() => decodeFlightBillingObservation(source(), target, selected, changed, scope.context, at));
    assert.throws(() => decodeFlightBillingObservation(source(), target, selected, scope.context, changed, at));
  }
});

test('reject invalid source time and unsupported routes before observation creation', () => {
  for (const bad of ['unknown', '2026-02-30T12:00:00.000Z', '2026-10-30T12:00:00Z']) {
    assert.throws(() => decodeFlightBillingObservation(source(), target, { storeId: target.storeId, scope }, scope.context, scope.context, bad));
  }
  for (const bad of [url + '&flid=12345', url.replace('viewflight', 'editflight'), url.replace('https:', 'http:'),
    url.replace('vereinsflieger.de', 'evil.test'), url.replace('https://', 'https://name:secret@')]) {
    assert.throws(() => decode(source(), { ...target, observedDetailUrl: bad }));
  }
});

test('20 fee observations are bounded evidence; a larger payload cannot be silently truncated', () => {
  const p = source(); p.lines = Array.from({ length: 20 }, (_, position) => ({ ...p.lines[0]!, position }));
  assert.equal(decode(p).source.lines.length, 20);
  p.lines.push({ ...p.lines[0]!, position: 20 }); assert.throws(() => decode(p));
  p.lines = []; assert.throws(() => decode(p));
});

// Synthetic observed HTML shape. Literal fee values are independent of the
// extractor; no provider session, browser library or network is used here.
class Cell {
  colSpan = 1; rowSpan = 1;
  constructor(public innerText: string, public nested: Table[] = []) {}
  get textContent() { return this.innerText; }
  querySelector() { return this.nested[0] ?? null; }
  querySelectorAll() { return this.nested; }
}
class Row {
  shown = true;
  constructor(public cells: Cell[]) {}
  getClientRects() { return this.shown ? [{}] : []; }
}
class Table {
  shown = true;
  constructor(public rows: Row[]) {}
  getClientRects() { return this.shown ? [{}] : []; }
}
const row = (...values: string[]) => new Row(values.map(s => new Cell(s)));
function domFixture() {
  const fees = new Table([
    row('Example, Alex', 'INV-A - Synthetic invoice - Flight fee', '2,40 EUR', ''),
    row('Example, Alex', 'INV-A - Synthetic invoice - Winch fee', '4,00 EUR', ''),
    row('', 'Summe:', '6,40 EUR', ''),
  ]);
  const table = new Table([
    row('Allgemeine Daten', ''), row('Eintrag', '12345'), row('Verein', 'Synthetic club'),
    row('Private unrelated field', 'Must not be collected'), row('Flugdaten', ''),
    row('CallSign', 'D-TEST'), row('Datum', '30.06.2026'), row('Pilot', 'Unrelated crew label'),
    row('Abrechnungsdaten', ''), row('Abrechnungsart', 'Pilot'), row('Abzurechnende Personen', 'Example, Alex - Synthetic rate'),
    row('Abgerechnet', 'Ja'), new Row([new Cell('Synthetic club'), new Cell('nested', [fees])]), row(''),
  ]);
  const tables = [table];
  const window = {}; Object.assign(window, { top: window });
  const document = { querySelectorAll: (selector: string) => { assert.equal(selector, 'table.view'); return tables; } };
  const run = (overrideUrl = url) => runInNewContext(`(${FLIGHT_BILLING_READER_SOURCE})(expected)`, {
    document, window, location: { href: overrideUrl }, URL,
    expected: { observedDetailUrl: url, clubLabel: 'Synthetic club', ownRecipientLabel: 'Example, Alex' },
  });
  return { fees, table, tables, run };
}

test('DOM billed reader preserves exactly the independent source lines and excludes crew/private fields', () => {
  const f = domFixture(), result = decode(f.run());
  assert.deepEqual(result.source, source());
  assert.ok(!JSON.stringify(result).includes('Must not be collected'));
  assert.ok(!JSON.stringify(result).includes('Unrelated crew'));
});

const domFailures: [string, (f: ReturnType<typeof domFixture>) => void][] = [
  ['unbilled detail', f => { f.table.rows[11]!.cells[1]!.innerText = 'Nein'; }],
  ['unknown billing status', f => { f.table.rows[11]!.cells[1]!.innerText = 'Unknown'; }],
  ['foreign fee recipient', f => { f.fees.rows[1]!.cells[0]!.innerText = 'Other, Person'; }],
  ['foreign club group', f => { f.table.rows[12]!.cells[0]!.innerText = 'Other club'; }],
  ['wrong source ID', f => { f.table.rows[1]!.cells[1]!.innerText = '67890'; }],
  ['duplicate source field', f => { f.table.rows.splice(2, 0, row('Eintrag', '12345')); }],
  ['missing billing section', f => { f.table.rows[8]!.cells[0]!.innerText = 'Changed source'; }],
  ['duplicate billing section', f => { f.table.rows.push(row('Abrechnungsdaten', '')); }],
  ['ambiguous main tables', f => { f.tables.push(f.table); }],
  ['missing total', f => { f.fees.rows.pop(); }],
  ['summary before final row', f => { f.fees.rows.reverse(); }],
  ['nonempty summary recipient', f => { f.fees.rows[2]!.cells[0]!.innerText = 'Example, Alex'; }],
  ['hidden fee', f => { f.fees.rows[0]!.shown = false; }],
  ['unsupported extra cell', f => { f.fees.rows[0]!.cells.push(new Cell('other')); }],
  ['spanned fee cells', f => { f.fees.rows[0]!.cells[1]!.rowSpan = 2; }],
  ['unbounded fee rows', f => { f.fees.rows.unshift(...Array.from({ length: 20 }, () => row('Example, Alex', 'Extra fee', '1,00 EUR', ''))); }],
  ['unbounded outer table', f => { f.table.rows.push(...Array.from({ length: 121 }, () => row(''))); }],
];
for (const [name, change] of domFailures) test(`DOM refusal: ${name}`, () => {
  const f = domFixture(); change(f); const result = f.run();
  assert.equal(typeof result.error, 'string'); assert.deepEqual(Object.keys(result), ['error']);
  assert.throws(() => decode(result));
});

test('DOM source refuses login redirects, foreign routes and a different observed reference', () => {
  const f = domFixture();
  for (const other of ['https://vereinsflieger.de/', url + '&action=other', url.replace('12345', '67890'), url.replace('vereinsflieger.de', 'evil.test')]) {
    assert.equal(f.run(other).error, 'unexpected-page');
  }
});

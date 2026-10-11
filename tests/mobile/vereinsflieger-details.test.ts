import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { attemptDetail, createDetailTrial, decodeDetail, detailReference, DETAIL_LABELS, DETAIL_READER_SOURCE, inspectDetail, type DetailTrial } from '../../apps/platform-lab/src/vereinsflieger/details.ts';

const url = 'https://vereinsflieger.de/member/profile/viewflight.php?flid=12345';
const url2 = url.replace('12345', '67890'), at = '2026-10-11T08:00:00Z';
function fixture(id = '12345') {
  return { url: url.replace('12345', id), fields: [
    { section: 'Allgemeine Daten', position: 1, label: 'Eintrag', raw: id },
    { section: 'Allgemeine Daten', position: 2, label: 'Kommentar', raw: '' },
    { section: 'Flugdaten', position: 4, label: 'CallSign', raw: 'D-1234' },
    { section: 'Flugdaten', position: 5, label: 'Datum', raw: '11.10.2026' },
    { section: 'Flugdaten', position: 6, label: 'Flugzeit', raw: '00:06 = 6min.' },
    { section: 'Flugdaten', position: 7, label: 'Begleiter / FI', raw: 'Synthetic instructor' },
  ] };
}
test('detail preserves sections, original values and conditional missing versus blank', () => {
  const o = decodeDetail(fixture(), url, at);
  assert.equal(inspectDetail(o, 'Allgemeine Daten', 'Kommentar').state, 'blank');
  assert.equal(inspectDetail(o, 'Flugdaten', 'PIC').state, 'not-captured');
  assert.equal(inspectDetail(o, 'Flugdaten', 'Begleiter / FI').state, 'value');
  assert.deepEqual(o.fields, fixture().fields);
  assert.equal(o.costs, 'not-captured'); assert.equal(o.sourceIdentity, 'unverified');
});
test('reference guards reject external, credential-bearing, malformed and extra-parameter links', () => {
  assert.equal(detailReference(url), '12345');
  for (const value of [url + '&flid=12345', url + '&token=secret', url + '#x', url.replace('https:', 'http:'), url.replace('vereinsflieger.de', 'vereinsflieger.de.evil.test'), url.replace('https://', 'https://user:secret@'), url.replace('12345', 'abc'), url.replace('viewflight', 'editflight')]) assert.equal(detailReference(value), null);
});
test('wrong flight, duplicate labels, lost anchors and oversized fields fail closed', () => {
  const p = fixture();
  for (const payload of [{ ...p, url: url2 }, fixture('67890'), { ...p, fields: [...p.fields, p.fields[5]] }, { ...p, fields: p.fields.slice(1) }, { ...p, fields: p.fields.map(f => ({ ...f, raw: 'x'.repeat(2049) })) }, { ...p, fields: p.fields.map(f => ({ ...f, position: 0 })) }, { error: 'session-required' }]) assert.throws(() => decodeDetail(payload, url, at));
});
test('standalone DOM reader excludes nested billing and unknown/private labels', () => {
  const cell = (text: string, nested = false) => ({ textContent: text, innerText: text, querySelector: () => nested ? {} : null });
  const row = (label: string, raw = '', nested = false) => ({ cells: [cell(label), cell(raw, nested)] });
  const rows = [row('Allgemeine Daten'), row('Eintrag', '12345'), row('Kommentar'), row('Flugdaten'), row('CallSign', 'D-1234'), row('Datum', '11.10.2026'), row('Flugzeit', '00:06 = 6min.'), row('Begleiter / FI', 'Synthetic instructor'), row('Private unrelated field', 'Do not collect'), row('Abrechnungsdaten'), row('Pilot', 'Billing party'), row('Synthetic club', 'Private costs', true)];
  let reads = 0;
  const document = { querySelectorAll: (selector: string) => { reads++; assert.equal(selector, 'table.view'); return [{ rows }]; } };
  const payload = runInNewContext(`(${DETAIL_READER_SOURCE})(allowed)`, { document, location: { href: url }, URL, allowed: DETAIL_LABELS });
  assert.equal(reads, 1);
  const o = decodeDetail(payload, url, at);
  assert.equal(o.fields.length, 6); assert.ok(!o.fields.some(f => f.raw.includes('Private') || f.raw.includes('Billing')));
  const redirected = runInNewContext(`(${DETAIL_READER_SOURCE})(allowed)`, { document, location: { href: 'https://vereinsflieger.de/' }, URL, allowed: DETAIL_LABELS });
  assert.equal(redirected.error, 'unexpected-page'); assert.equal(reads, 1);
  const ambiguous = runInNewContext(`(${DETAIL_READER_SOURCE})(allowed)`, { document: { querySelectorAll: () => [{ rows }, { rows }] }, location: { href: url }, URL, allowed: DETAIL_LABELS });
  assert.equal(ambiguous.error, 'detail-table');
});
test('disk checkpoint resumes outstanding tasks after interruption and preserves evidence on expiry', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'moflight-synthetic-detail-'));
  try {
    const path = join(dir, 'checkpoint.json');
    const initial = createDetailTrial('synthetic-scope', [url, url2]);
    const first = attemptDetail(initial, 'synthetic-scope', url, fixture(), at);
    assert.equal(initial.observations.length, 0);
    await writeFile(path, JSON.stringify(first));
    let resumed: DetailTrial = JSON.parse(await readFile(path, 'utf8'));
    assert.equal(resumed.tasks.filter(t => t.state !== 'success').length, 1);
    resumed = attemptDetail(resumed, 'synthetic-scope', url2, { error: 'session-required' }, at);
    assert.equal(resumed.tasks[1]!.error, 'session-required');
    assert.deepEqual(resumed.observations, first.observations);
    await writeFile(path, JSON.stringify(resumed));
    resumed = JSON.parse(await readFile(path, 'utf8'));
    resumed = attemptDetail(resumed, 'synthetic-scope', url2, fixture('67890'), at);
    assert.equal(resumed.tasks.every(t => t.state === 'success'), true);
    assert.equal(resumed.tasks[1]!.attempts, 2);
    assert.equal(resumed.observations.length, 2);
    assert.throws(() => attemptDetail(resumed, 'other-scope', url, fixture(), at));
    assert.throws(() => attemptDetail(resumed, 'synthetic-scope', url.replace('12345', '99999'), fixture('99999'), at));
    assert.throws(() => createDetailTrial('synthetic-scope', [url, url2, url, url2]));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('repeat and changed detail reads append revisions without replacing earlier evidence', () => {
  let trial = createDetailTrial('synthetic-scope', [url]);
  trial = attemptDetail(trial, trial.scope, url, fixture(), at);
  trial = attemptDetail(trial, trial.scope, url, fixture(), at);
  const changed = fixture(); changed.fields[4]!.raw = '00:07 = 7min.';
  trial = attemptDetail(trial, trial.scope, url, changed, at);
  assert.equal(trial.observations.length, 3);
  assert.equal(trial.observations[0]!.fields[4]!.raw, '00:06 = 6min.');
  assert.equal(trial.observations[2]!.fields[4]!.raw, '00:07 = 7min.');
});

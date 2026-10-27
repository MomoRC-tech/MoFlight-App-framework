import { test } from 'node:test';
import assert from 'node:assert/strict';
import { medicalExpiry, medicalExpiryStatusText } from '../../apps/platform-lab/src/mobile/medical-expiry.ts';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';

const now = new Date(2026, 9, 22, 12).getTime();
function capture(values: Array<[string, string]>, truncated = false, sourceIndexes: [number, number] = [0, 1]): InformationCapture {
  return { version: 1, id: 'synthetic-medical', owner: 'synthetic-owner', connectionId: 'synthetic-connection',
    retrievedAt: '2026-10-21T12:00:00.000Z', sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
    columns: [{key:'kind',label:'Medical-Art',index:sourceIndexes[0]},{key:'expiry',label:'Gültig bis · Originaltext',index:sourceIndexes[1]}],
    rows: values.map(([kind, expiry], position) => ({ position, values: [kind, expiry] })), filters: [], empty: !values.length,
    coverage: {kind:'visible-page',truncated,pagination:'unverified'} };
}

test('earliest strictly parsed date is retained even when already expired', () => {
  const assessment = medicalExpiry(capture([['Klasse 2', '31.12.2027 · Quelle A'], ['LAPL', '21.10.2026 · Quelle B']]), now);
  assert.equal(assessment.date, '21.10.2026');
  assert.equal(assessment.state, 'expired');
  assert.deepEqual(assessment.issues, []);
});

test('column values use projection order even when source table indexes are sparse', () => {
  const assessment = medicalExpiry(capture([['Klasse 2', '31.12.2027'], ['LAPL', '30.06.2028']], false, [2, 7]), now);
  assert.equal(assessment.date, '31.12.2027');
  assert.equal(assessment.state, 'later');
});

test('observed provider expiry prefix and opaque certificate reference preserve the date without parsing the reference', () => {
  const source=capture([['Klasse 2','Gültig bis 31.12.2027 - DE-0000000-0'],['LAPL','Gültig bis 30.06.2028 - DE-0000000-1']]);
  const original=structuredClone(source);
  assert.equal(medicalExpiry(source,now).date,'31.12.2027');
  assert.equal(medicalExpiry(source,now).state,'later');
  assert.deepEqual(source,original);
  for(const raw of ['Gültig bis 31.02.2027 - DE-0000000-0','Gültig bis 31.12.2027 - DE-0000000-0 01.01.2028','Gültig bis unknown - DE-0000000-0']){
    assert.equal(medicalExpiry(capture([['Klasse 2',raw]]),now).date,null);
  }
});

test('provider certificate country separator accepts the observed space and hyphen without changing source evidence', () => {
  for (const separator of [' ', '-']) {
    const source = capture([
      ['Klasse 2', `Gültig bis 31.12.2028 - DE${separator}0000000-0`],
      ['LAPL', `Gültig bis 21.10.2026 - DE${separator}0000000-1`],
    ]);
    const original = structuredClone(source);
    assert.deepEqual(medicalExpiry(source, now), { date: '21.10.2026', state: 'expired', issues: [] });
    assert.deepEqual(source, original);
  }
  const soon = medicalExpiry(capture([['Klasse 2', 'Gültig bis 22.04.2027 - DE 0000000-0']]), now);
  assert.deepEqual(soon, { date: '22.04.2027', state: 'soon', issues: [] });
});

test('space-separated certificate suffix keeps invalid, ambiguous and unsupported source values unknown', () => {
  for (const raw of [
    'Gültig bis 31.02.2028 - DE 0000000-0',
    'Gültig bis 29.02.2027 - DE 0000000-0',
    'Gültig bis 00.12.2028 - DE 0000000-0',
    'Gültig bis 31.12.0000 - DE 0000000-0',
    'Gültig bis 31.12.2028 - DE 0000000-0 01.01.2029',
    'Gültig bis 31.12.2028 - DE 0000000-0 · 01.01.2029',
    'Gültig bis 31.12.2028 - DE 0000000-0\n01.01.2029',
    'Gültig bis 31.12.2028 - DE/0000000-0',
    'Gültig bis 31.12.2028 - DE  0000000-0',
    'Gültig bis 31.12.2028 - DE 0000000',
    'Gültig bis 31.12.2028 - DE 0000000-0 extra',
  ]) {
    const assessment = medicalExpiry(capture([['Klasse 2', raw]]), now);
    assert.equal(assessment.date, null, raw);
    assert.equal(assessment.state, 'unknown', raw);
    assert.ok(assessment.issues.length, raw);
  }
  assert.deepEqual(medicalExpiry(capture([['Klasse 2', 'Gültig bis 29.02.2028 - DE 0000000-0']]), now),
    { date: '29.02.2028', state: 'later', issues: [] });
});

test('date colors classify today and the six-calendar-month boundary as soon, then become quiet', () => {
  assert.equal(medicalExpiry(capture([['Klasse 2', '22.10.2026']]), now).state, 'soon');
  assert.equal(medicalExpiry(capture([['Klasse 2', '22.04.2027']]), now).state, 'soon');
  assert.equal(medicalExpiry(capture([['Klasse 2', '23.04.2027']]), now).state, 'later');
  assert.equal(medicalExpiryStatusText('expired'), 'Datum liegt in der Vergangenheit');
  assert.equal(medicalExpiryStatusText('soon'), 'Datum liegt innerhalb der nächsten sechs Kalendermonate');
  assert.equal(medicalExpiryStatusText('later'), 'Datum liegt mehr als sechs Kalendermonate in der Zukunft');
});

test('six calendar months clamp to the last valid day of the target month', () => {
  const endOfAugust = new Date(2026, 7, 31, 12).getTime();
  assert.equal(medicalExpiry(capture([['Klasse 2', '28.02.2027']]), endOfAugust).state, 'soon');
  assert.equal(medicalExpiry(capture([['Klasse 2', '01.03.2027']]), endOfAugust).state, 'later');
});

test('only the strict German date token and its observed middle-dot suffix are parsed', () => {
  assert.equal(medicalExpiry(capture([['Klasse 2', '31.12.2027 · source reference']]), now).date, '31.12.2027');
  for (const value of ['2027-12-31', '31.02.2027', 'expiry 31.12.2027', '31.12.2027, reference']) {
    const assessment = medicalExpiry(capture([['Klasse 2', value]]), now);
    assert.equal(assessment.date, null, value);
    assert.equal(assessment.state, 'unknown', value);
    assert.ok(assessment.issues.length, value);
  }
});

test('blank, multiple, duplicate and partial source data keep an explicit unknown warning', () => {
  const assessment = medicalExpiry(capture([
    ['Klasse 2', '31.12.2027 · reference 30.11.2027'], ['LAPL', ''], ['Klasse 2', '30.06.2028'],
  ], true), now);
  assert.equal(assessment.date, '30.06.2028');
  assert.equal(assessment.state, 'later');
  assert.ok(assessment.issues.some(issue => /mehrere mögliche Daten/.test(issue)));
  assert.ok(assessment.issues.some(issue => /leer/.test(issue)));
  assert.ok(assessment.issues.some(issue => /Mehrere Medical-Datensätze/.test(issue)));
  assert.ok(assessment.issues.some(issue => /teilweise erfasst/.test(issue)));
});

test('empty capture and invalid clock remain unknown', () => {
  assert.equal(medicalExpiry(capture([]), now).state, 'unknown');
  const valid = capture([['Klasse 2', '31.12.2027']]);
  assert.equal(medicalExpiry(valid, Number.NaN).state, 'unknown');
});

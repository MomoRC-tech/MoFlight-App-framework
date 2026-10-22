import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataFreshness } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { medicalSource } from '../../apps/platform-lab/src/mobile/medical-source.ts';
import type { InformationCapture } from '../../apps/platform-lab/src/vereinsflieger/information.ts';

const at = '2026-10-01T12:00:00.000Z', time = Date.parse(at), threeDays = 72 * 60 * 60 * 1000;
export function medicalFixture(): InformationCapture {
  return { version: 1, id: 'synthetic-medical', owner: 'synthetic-owner', connectionId: 'synthetic-connection',
    retrievedAt: at, sourceIdentity: 'provisional-observed-profile', category: 'medical', path: '/member/profile/viewprofile',
    columns: [{key:'kind',label:'Medical-Art',index:0},{key:'expiry',label:'Gültig bis · Originaltext',index:1}],
    rows: [{position:0,values:['Synthetic class','31.12.2027 · source reference']}], filters: [], empty: false,
    coverage: {kind:'visible-page',truncated:false,pagination:'unverified'} };
}

test('data-age reminder begins only after 72 elapsed hours, independent of session state', () => {
  assert.equal(dataFreshness(at, 'ready', time + threeDays).reminder, false);
  assert.equal(dataFreshness(at, 'ready', time + threeDays + 1).reminder, true);
  assert.match(dataFreshness(at, 'ready', time + threeDays + 1).note, /mehr als drei Tage/);
});

test('missing, loading and failed reads are distinct; an unconfirmed time never looks fresh', () => {
  assert.match(dataFreshness(null, 'ready', time).label, /Noch keine/);
  assert.match(dataFreshness(null, 'loading', time).note, /geladen/);
  assert.match(dataFreshness(null, 'failed', time).note, /nicht erneut gelesen/);
  for (const value of ['broken-date', '2026-02-30T00:00:00.000Z', '2027-01-01T00:00:00.000Z']) {
    assert.match(dataFreshness(value, 'ready', time).label, /unklar/);
    assert.equal(dataFreshness(value, 'ready', time).reminder, false);
  }
});

test('failed refresh/readback preserves the age and reminder of the last usable capture', () => {
  const saved = dataFreshness(at, 'ready', time + threeDays + 1);
  const failed = dataFreshness(at, 'failed', time + threeDays + 1);
  assert.equal(failed.label, saved.label);
  assert.equal(failed.reminder, true);
  assert.match(failed.note, /Frühere Daten bleiben/);
});

test('Medical source is own validated text; no eligibility/date interpretation is produced', () => {
  const capture = medicalFixture();
  assert.deepEqual(medicalSource([capture], capture.owner), capture);
  assert.equal(medicalSource([capture], 'another-owner'), null);
  assert.equal(medicalSource([capture, {...capture,id:'other-medical'}], capture.owner), null);
  assert.equal(medicalSource([{...capture,path:'/member/profile/documents'}], capture.owner), null);
});

test('empty/partial Medical observations remain explicitly empty/partial source evidence', () => {
  const capture = medicalFixture();
  const empty = {...capture, rows:[],empty:true};
  assert.deepEqual(medicalSource([empty], capture.owner)?.rows, []);
  const partial = {...capture,coverage:{...capture.coverage,truncated:true}};
  assert.equal(medicalSource([partial], capture.owner)?.coverage.truncated, true);
});

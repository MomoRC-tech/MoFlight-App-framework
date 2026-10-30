import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeHttpExportReply, exportHttpScript, exportReadTarget } from '../../apps/platform-lab/src/vereinsflieger/export-http';
import { acceptExportMessage, ACTIVE_EXPORT_VIEW, beginExport, PARTICIPATION } from '../../apps/platform-lab/src/vereinsflieger/export';
import { FLIGHT_URL } from '../../apps/platform-lab/src/vereinsflieger/probe';
const expected = { accountNumber: '123', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const pending = { token: 'read-123', anchor: FLIGHT_URL, target: FLIGHT_URL, expected };
const request = { from: '2026-01-01', to: '2026-12-31' };
const headers = ['Datum','Lfz.','Start','Landung','Flugzeit','Pilot'];
const row = (id: number) => ({ sourceFlightId: String(id), values: ['01.06.2026','D-TEST','10:00','10:10','00:10','Synthetic pilot'] });
const page = (extra = {}) => ({ kind: 'vf-export-v1', token: pending.token, phase: 'read', url: FLIGHT_URL, status: 'page', preset: ACTIVE_EXPORT_VIEW, accountLabel: 'Synthetic account', headers, columnIds: ['1','2','3','4','5','6'], rows: [row(1)], first: 1, last: 1, total: 1, nextUrl: null, rowsPerPage: 500, period: 'ab 01.01.2026 bis 31.12.2026', participation: PARTICIPATION, allColumns: true, filtersClear: true, ...extra });
const packet = (extra = {}) => JSON.stringify({ kind: 'vf-export-http-v1', token: pending.token, url: FLIGHT_URL, target: FLIGHT_URL, contextBefore: expected, contextAfter: expected, milliseconds: 123, payload: page(), ...extra });
const decode = (raw: string) => decodeHttpExportReply(raw, FLIGHT_URL, FLIGHT_URL, pending);
const run = () => ({ ...beginExport(request), phase: 'read' as const });

test('HTTP targets permit only same-origin own-list and bounded observed pagination', () => {
  assert.equal(exportReadTarget(FLIGHT_URL+'?_params=original-document', FLIGHT_URL+'?page=2'), FLIGHT_URL+'?page=2');
  for (const target of [FLIGHT_URL+'?_params=opaque', FLIGHT_URL+'?page=2&page=2', FLIGHT_URL+'?page=41', FLIGHT_URL+'?page=0', FLIGHT_URL+'#x', FLIGHT_URL.replace('vereinsflieger.de','foreign.invalid'), FLIGHT_URL.replace('flightlog.php','viewflight.php?flid=1')]) assert.throws(() => exportReadTarget(FLIGHT_URL, target));
  assert.throws(() => exportHttpScript('bad token', run(), expected, FLIGHT_URL, FLIGHT_URL));
});
test('HTTP bridge rejects wrong nonce, target, origin or current document', () => {
  assert.equal(decode(packet({ token: 'old' })), null);
  assert.equal(decode(packet({ target: FLIGHT_URL+'?page=2' })), null);
  assert.equal(decodeHttpExportReply(packet(), 'https://foreign.invalid/', FLIGHT_URL, pending), null);
  assert.equal(decodeHttpExportReply(packet(), FLIGHT_URL, FLIGHT_URL+'?page=2', pending), null);
  assert.equal(decodeHttpExportReply(packet(), 'https://vereinsflieger.de/', FLIGHT_URL, pending)?.kind, 'page');
});
test('fallback requires both matching account proofs; expiry, foreign accounts/clubs and malformed payloads stop', () => {
  assert.equal(decode(packet({ error: 'unsupported', fallbackSafe: true }))?.kind, 'fallback');
  for (const extra of [
    { error: 'unsupported' }, { contextBefore: null }, { contextAfter: { ...expected, accountNumber: '456' } },
    { contextAfter: { ...expected, clubLabel: 'Other club' } }, { milliseconds: 20000 }, { milliseconds: NaN },
    { error: 'session-required', fallbackSafe: true }, { error: 'context-changed', fallbackSafe: true },
    { payload: page({ token: 'old' }) }, { payload: page({ url: FLIGHT_URL+'?page=2' }) },
  ]) assert.equal(decode(packet(extra))?.kind, 'failed');
});
test('HTTP 500+1 pages and zero-row scopes retain the original complete export contract', () => {
  const active = run(), first = decode(packet({ payload: page({ rows: Array.from({length:500},(_,i)=>row(i+1)), last:500,total:501,nextUrl:FLIGHT_URL+'?page=2' }) }));
  assert.equal(first?.kind, 'page'); if(first?.kind!=='page')return;
  assert.equal(acceptExportMessage(active, first.payload, FLIGHT_URL, FLIGHT_URL, pending.token).complete, undefined);
  const target=FLIGHT_URL+'?page=2', second=decodeHttpExportReply(packet({ target,payload:page({url:target,rows:[row(501)],first:501,last:501,total:501}) }),FLIGHT_URL,FLIGHT_URL,{...pending,target});
  assert.equal(second?.kind,'page');if(second?.kind!=='page')return;
  const complete=acceptExportMessage(active,second.payload,FLIGHT_URL,FLIGHT_URL,pending.token).complete!;
  assert.equal(complete.rows.length,501);assert.equal(complete.coverage,'complete-requested-list');assert.equal(complete.exportContext?.pageCount,2);
  const empty=decode(packet({payload:page({rows:[],first:0,last:0,total:0})}));assert.equal(empty?.kind,'page');if(empty?.kind==='page')assert.equal(acceptExportMessage(run(),empty.payload,FLIGHT_URL,FLIGHT_URL,pending.token).complete?.rows.length,0);
});
test('HTTP cannot bypass date, duplicate, incomplete-count, changed-total or foreign-next validation', () => {
  for(const extra of [{rows:[{...row(1),values:['01.01.2025',...row(1).values.slice(1)]}]},{rows:[row(1),row(1)],last:2,total:2},{last:1,total:2},{last:1,total:2,nextUrl:'https://foreign.invalid/?page=2'}]){
    const result=decode(packet({payload:page(extra)}));assert.equal(result?.kind,'page');if(result?.kind==='page')assert.throws(()=>acceptExportMessage(run(),result.payload,FLIGHT_URL,FLIGHT_URL,pending.token));
  }
  const active=run();acceptExportMessage(active,JSON.stringify(page({total:2,nextUrl:FLIGHT_URL+'?page=2'})),FLIGHT_URL,FLIGHT_URL,pending.token);
  assert.throws(()=>acceptExportMessage(active,JSON.stringify(page({url:FLIGHT_URL+'?page=2',rows:[row(2)],first:2,last:2,total:3,nextUrl:FLIGHT_URL+'?page=3'})),FLIGHT_URL,FLIGHT_URL,pending.token));
});

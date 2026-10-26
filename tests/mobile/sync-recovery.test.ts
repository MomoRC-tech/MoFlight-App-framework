import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeSyncRecovery, recoveredFlight, remainingSyncSources, type SyncRecoveryRecord } from '../../apps/platform-lab/src/mobile/sync-recovery.ts';
import type { OwnFlightStoredSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import type { RealFlightResult } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';
import { clearSyncRecoveryRow, readSyncRecoveryRow, saveSyncRecoveryRow, SYNC_RECOVERY_SCHEMA } from '../../apps/platform-lab/src/mobile/sync-recovery-store.ts';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Bind, Connection } from '../../packages/local-data/src/index.ts';

const record:SyncRecoveryRecord={version:1,ownerId:'owner',storeId:'store',accountRef:'123',clubLabel:'Club',startedAt:'2026-10-26T12:00:00Z',flightCaptureId:'capture',sources:{medical:'updated'}};
const result={kind:'import-unassigned',captureId:'capture',counts:{added:1,changed:0,unchanged:0,pending:0}} as RealFlightResult;
const snapshot={ownerId:'owner',storeId:'store',account:{provider:'vereinsflieger',accountRef:'123'},recovery:{readOnly:false},
  latestSavedResult:result,coverage:[{captureId:'capture',coverage:{displayedWindow:{from:'2026-01-01',to:'2026-10-26'}}}],
  savedRetrievals:[{from:'2026-01-01',to:'2026-10-26'}]} as OwnFlightStoredSnapshot;

test('saved flight is reusable only with matching scoped account, capture and committed coverage',()=>{
  assert.equal(recoveredFlight(record,snapshot)?.result,result);
  assert.equal(recoveredFlight({...record,accountRef:'foreign'},snapshot),null);
  assert.equal(recoveredFlight({...record,flightCaptureId:'old'},snapshot),null);
  assert.equal(recoveredFlight(record,{...snapshot,recovery:{readOnly:true,warning:null}}),null);
  assert.equal(recoveredFlight(record,{...snapshot,savedRetrievals:[]}),null);
  assert.equal(recoveredFlight(record,{...snapshot,latestSavedResult:null}),null);
});

test('saved progress accepts only current owner and completed source statuses',()=>{
  assert.deepEqual(decodeSyncRecovery(record,'owner','store'),record);
  assert.throws(()=>decodeSyncRecovery(record,'foreign','store'));
  assert.throws(()=>decodeSyncRecovery({...record,sources:{medical:'failed'}},'owner','store'));
  assert.throws(()=>decodeSyncRecovery({...record,extra:true},'owner','store'));
  assert.equal(remainingSyncSources(record.sources),true);
  assert.equal(remainingSyncSources({medical:'empty',duties:'partial',events:'partial',documentNotices:'partial',
    workSummary:'partial',workHours:'partial',tasks:'partial'}),false);
});

test('Sync progress survives a database reopen and remains isolated by owner and store',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'moflight-sync-recovery-'));
  const path=join(dir,'progress.sqlite');
  const open=()=>{
    const sqlite=new DatabaseSync(path);
    const db:Connection={exec:async sql=>{sqlite.exec(sql);},run:async(sql,...params:Bind[])=>{sqlite.prepare(sql).run(...params);},
      all:async<T>(sql:string,...params:Bind[])=>sqlite.prepare(sql).all(...params) as T[],
      first:async<T>(sql:string,...params:Bind[])=>sqlite.prepare(sql).get(...params) as T|null};
    return {sqlite,db};
  };
  try {
    const first=open();await first.db.exec(SYNC_RECOVERY_SCHEMA);
    await saveSyncRecoveryRow(first.db,record);first.sqlite.close();
    const second=open();await second.db.exec(SYNC_RECOVERY_SCHEMA);
    assert.deepEqual(await readSyncRecoveryRow(second.db,'owner','store'),record);
    assert.equal(await readSyncRecoveryRow(second.db,'other-owner','store'),null);
    assert.equal(await readSyncRecoveryRow(second.db,'owner','other-store'),null);
    await clearSyncRecoveryRow(second.db,'owner','store');
    assert.equal(await readSyncRecoveryRow(second.db,'owner','store'),null);
    second.sqlite.close();
  } finally {unlinkSync(path);rmdirSync(dir);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { nodeDriver } from './sqlite-driver.ts';
import { captureFixture } from './capture-review-fixture.ts';
import { ChatStore } from '../../apps/platform-lab/src/ai/chat-store.ts';
import * as identity from '../../apps/platform-lab/src/ai/historical-provider-identity.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { emptyUserChatArchive } from '../../apps/platform-lab/src/user-backup.ts';
import type { RealFlightSourceInput } from '../../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';
import type { RealFlightGraph } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts';

const ownerId='11111111-1111-4111-8111-111111111111', storeId='22222222-2222-4222-8222-222222222222';
const at='2026-10-24T12:00:00.000Z';
const observed={accountNumber:'101',clubLabel:'Synthetic club',clubIdentity:'display-label-only' as const,verification:'observed-profile-number' as const};
const hash=async(text:string)=>createHash('sha256').update(text).digest('hex');
const clone=<T>(value:T):T=>JSON.parse(JSON.stringify(value));
async function graph():Promise<RealFlightGraph> {
  const library=await RealFlightLibrary.create(nodeDriver(':memory:'),{singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,
    store_id:storeId,owner_id:ownerId,created_at:at},hash,()=>({ownerId,storeId,leaseId:'lease',writable:true}));
  const input:RealFlightSourceInput={version:1,binding:{provider:'vereinsflieger',accountRef:'101'},contextBefore:observed,contextAfter:observed,
    requestedWindow:{from:'2026-10-01',to:'2026-10-18',participation:'Pilot oder Fluglehrer'},capture:captureFixture(0)};
  try { await library.commit({version:1,kind:'bind',ownerId,storeId,commandId:'33333333-3333-4333-8333-333333333333',baseGeneration:0,at,source:input}); return await library.snapshot(); }
  finally { await library.close(); }
}

test('authenticated historical receipt persists without flights/session and cannot replace another owner/account',async()=>{
  const store=await ChatStore.open(nodeDriver(':memory:'),ownerId,async()=>{});
  try {
    const receipt=identity.authenticatedProfileIdentity(ownerId,observed,at);
    await identity.rememberHistoricalIdentity(store,receipt,async()=>{});
    assert.equal((await store.archive()).conversations.length,0);
    const later={...receipt,observedAt:'2026-10-25T12:00:00.000Z'};
    assert.deepEqual(await identity.rememberHistoricalIdentity(store,later,async()=>{}),receipt);
    await assert.rejects(identity.rememberHistoricalIdentity(store,{...receipt,accountRef:'999'},async()=>{}),/account changed/);
    await assert.rejects(identity.rememberHistoricalIdentity(store,{...receipt,localOwnerId:'owner-b'},async()=>{}),/Foreign/);
    assert.deepEqual((await store.archive()).identity,receipt);
    for(const bad of [{...observed,accountNumber:'member-101'},{...observed,verification:'login-form'},null]) assert.throws(()=>identity.authenticatedProfileIdentity(ownerId,bad,at));
  } finally {await store.close();}
});

test('saved-binding seeding validates the full capture/receipt graph, including empty history and forged IDs',async()=>{
  const source=await graph();
  const receipt=await identity.savedBindingIdentity(source,ownerId,storeId,hash);
  assert.equal(receipt?.accountRef,'101'); assert.equal(receipt?.provenance.kind,'verified-saved-binding');
  assert.equal(source.records.some(row=>row.kind==='flight'),false);
  await assert.rejects(identity.savedBindingIdentity(source,'foreign-owner',storeId,hash));
  await assert.rejects(identity.savedBindingIdentity(source,ownerId,'foreign-store',hash));
  for(const kind of ['binding','capture']) {
    const forged=clone(source), row=forged.records.find(row=>row.kind===kind)!;
    row.payload=row.payload.replace('101','999'); row.payload_sha256=await hash(row.payload);
    await assert.rejects(identity.savedBindingIdentity(forged,ownerId,storeId,hash));
  }
});

async function nativeFixture(source:RealFlightGraph|null=null) {
  const directory=await mkdtemp(join(tmpdir(),'moflight-identity-')), path=join(directory,'chats.sqlite');
  let currentOwner:string|null=ownerId, pending=false, closed=0, reads=0;
  const lease={ownerId,storeId,leaseId:'lease'};
  const check=async()=>{if(pending)throw new Error('Restore pending');if(currentOwner!==ownerId)throw new Error('Owner switched');};
  const open=async(_scope:unknown,gate:()=>Promise<void>)=>{await check();await gate();return ChatStore.open(nodeDriver(path),ownerId,async()=>{await check();await gate();});};
  const modules:Record<string,unknown>={
    '../vereinsflieger/real-flight-native':{openOwnerRegistry:async()=>({currentOwner:async()=>currentOwner?{...lease,ownerId:currentOwner}:null,assertCurrent:check,close:async()=>{closed++;}})},
    '../user-backup-restore-journal-native':{assertNoPendingUserBackupRestore:async()=>{if(pending)throw new Error('Restore pending');}},
    './chat-native':{openOwnerChatStoreNative:open,readOwnerChatArchiveNative:async(scope:unknown,gate:()=>Promise<void>)=>{await check();await gate();if(!existsSync(path))return emptyUserChatArchive(ownerId);const store=await open(scope,gate);try{return await store.archive();}finally{await store.close();}}},
    './historical-provider-identity':identity,'../storage':{hash},
    '../mobile/own-flight-reader-native':{ownFlightReadPorts:{open:async()=>{reads++;return source?{ownerId,storeId,assertCurrent:check,pendingCommand:async()=>false,service:{readBindingEvidence:async()=>source},close:async()=>{closed++;}}:null;}}},
  };
  const exports:any={};
  const text=ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/ai/historical-provider-identity-native.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(text,{exports,require:(name:string)=>{assert.ok(name in modules,name);return modules[name];}});
  return {exports,path,reads:()=>reads,closed:()=>closed,setOwner:(value:string|null)=>{currentOwner=value;},setPending:()=>{pending=true;},cleanup:()=>rm(directory,{recursive:true,force:true})};
}

test('native orchestration keeps prior login valid offline without a current session or flight reader',async()=>{
  const f=await nativeFixture();try{
    assert.equal(await f.exports.loadHistoricalIdentityNative(async()=>{}),null);assert.equal(existsSync(f.path),false);
    await f.exports.rememberAuthenticatedProfileNative(ownerId,observed,at,async()=>{});
    const reads=f.reads(), receipt=await f.exports.loadHistoricalIdentityNative(async()=>{});
    assert.equal(receipt.accountRef,'101');assert.equal(f.reads(),reads);
    f.setPending();await assert.rejects(f.exports.loadHistoricalIdentityNative(async()=>{}),/Restore pending/);
  }finally{await f.cleanup();}
});

test('native seeding uses only a validated owner binding; no owner is implicitly created and stale gates reject writes',async()=>{
  const f=await nativeFixture(await graph());try{
    const receipt=await f.exports.loadHistoricalIdentityNative(async()=>{});assert.equal(receipt.provenance.kind,'verified-saved-binding');assert.ok(f.closed()>0);
    f.setOwner(null);assert.equal(await f.exports.loadHistoricalIdentityNative(async()=>{}),null);
    f.setOwner('foreign-owner');await assert.rejects(f.exports.rememberAuthenticatedProfileNative(ownerId,observed,at,async()=>{}),/owner changed/);
    f.setOwner(ownerId);let checks=0;await assert.rejects(f.exports.rememberAuthenticatedProfileNative(ownerId,observed,at,async()=>{if(++checks>1)throw new Error('Stale observation');}),/Stale/);
  }finally{await f.cleanup();}
});

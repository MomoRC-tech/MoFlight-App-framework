import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as model from '../../apps/platform-lab/src/duty-target.ts';

const ownerId = '11111111-1111-4111-8111-111111111111', storeId = '22222222-2222-4222-8222-222222222222';
const scope = { ownerId, storeId, accountRef: '12345' }, permit = { ownerId, storeId, operationId: '33333333-3333-4333-8333-333333333333' };
const hash = async (text: string) => createHash('sha256').update(text).digest('hex');
const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/duty-target-native.ts',import.meta.url),'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function fixture() {
  const files = new Map<string,string>(); let pending = false, corruptNextWrite = false, corruptReadback = false, readGate: Promise<void> | null = null;
  class File {
    name: string; constructor(_root: unknown,name: string) { this.name = name; }
    get exists() { return files.has(this.name); } get size() { return files.get(this.name)?.length ?? 0; }
    async text() { const value = files.get(this.name)!; const gate=readGate;readGate=null;if(gate)await gate; if(corruptReadback && !this.name.endsWith('.original')) { corruptReadback=false; return 'corrupt'; } return value; }
    write(text: string) { if(corruptNextWrite && !this.name.endsWith('.original')) { corruptNextWrite=false;files.set(this.name,'partial');throw Error('interrupted write'); } files.set(this.name,text); }
  }
  class Directory { list() { return [...files.keys()].map(name=>new File('',name)); } }
  const modules: Record<string,unknown> = { 'expo-file-system': { File,Directory,Paths:{ document:'synthetic' } }, './storage':{ hash }, './duty-target':model,
    './user-backup-restore-journal-native': { async assertNoPendingUserBackupRestore(allowed?:unknown) { if(pending && !allowed)throw Error('aggregate pending'); } } };
  const api = {} as typeof import('../../apps/platform-lab/src/duty-target-native.ts');
  runInNewContext(source,{ exports:api,require:(id:string)=>{assert.ok(id in modules,id);return modules[id];} });
  return { api,files,pauseRead:()=>{let release!:()=>void;readGate=new Promise<void>(resolve=>{release=resolve;});return release;},pending:(value:boolean)=>{pending=value;},interrupt:()=>{corruptNextWrite=true;},badRead:()=>{corruptReadback=true;} };
}
const key = (year:number,accountRef='12345') => model.dutyTargetKey(model.dutyTargetScopeKey({...scope,accountRef}),year);
const archive: model.DutyTargetArchive = {scope,targets:[{year:2025,hours:0},{year:2026,hours:37.5}]};
test('native target archive enumerates every selected year, preserves zero, excludes foreign account and originals',async()=>{
  const f=fixture();for(const [year,hours] of [[2025,0],[2026,37.5],[2024,12]] as const)assert.equal(await f.api.saveDutyTargetNative(key(year),hours,()=>true),true);
  await f.api.saveDutyTargetNative(key(2026,'99999'),99,()=>true);
  const exported=await f.api.withDutyTargetLock(()=>f.api.exportDutyTargetsNative(scope,async()=>{}));
  assert.deepEqual(JSON.parse(JSON.stringify(exported.targets)),[{year:2024,hours:12},{year:2025,hours:0},{year:2026,hours:37.5}]);
  const before=new Map(f.files);f.pending(true);
  await f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{}));
  await f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{}));f.pending(false);
  assert.equal(await f.api.readDutyTargetNative(key(2024)),12);assert.equal(await f.api.readDutyTargetNative(key(2026,'99999')),99);
  for(const [name,text] of before)assert.equal(f.files.get(name),text);
});
test('target edits are refused during archive lock or durable pending restore; stale callbacks cannot write',async()=>{
  const f=fixture();await f.api.withDutyTargetLock(async()=>{await assert.rejects(f.api.saveDutyTargetNative(key(2026),30,()=>true),/busy/);});
  f.pending(true);await assert.rejects(f.api.saveDutyTargetNative(key(2026),30,()=>true),/pending/);await assert.rejects(f.api.readDutyTargetNative(key(2026)),/pending/);
  f.pending(false);assert.equal(await f.api.saveDutyTargetNative(key(2026),30,()=>false),false);assert.equal(f.files.size,0);
});
test('interrupted target replacement resumes idempotently and retains original bytes, including previously absent targets',async()=>{
  for(const populated of [false,true]){
    const f=fixture();if(populated)await f.api.saveDutyTargetNative(key(2025),44,()=>true);
    const original=new Map(f.files);f.interrupt();f.pending(true);
    await assert.rejects(f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{})),/interrupted/);
    await assert.rejects(f.api.readDutyTargetNative(key(2025)),/pending/);
    await f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{}));f.pending(false);
    assert.equal(await f.api.readDutyTargetNative(key(2025)),0);assert.equal(await f.api.readDutyTargetNative(key(2026)),37.5);
    for(const [name,text] of original)assert.equal(f.files.get(`${name}.restore-${permit.operationId}.original`),text);
  }
});
test('corrupt selected destination fails preflight; corrupt/foreign filenames cannot silently disappear from export',async()=>{
  const f=fixture();const name=`cockpit-duty-${await hash(key(2025))}.json`;f.files.set(name,'corrupt');const before=[...f.files];
  await assert.rejects(f.api.withDutyTargetLock(()=>f.api.preflightDutyTargetsNative(archive,async()=>{})));
  await assert.rejects(f.api.withDutyTargetLock(()=>f.api.exportDutyTargetsNative(scope,async()=>{})));assert.deepEqual([...f.files],before);
  f.files.set(name,JSON.stringify({version:1,key:key(2026),hours:12}));await assert.rejects(f.api.withDutyTargetLock(()=>f.api.exportDutyTargetsNative(scope,async()=>{})),/filename mismatch/);
});
test('archive rejects duplicate/year/value/scope tampering without inferring defaults',()=>{
  assert.deepEqual(model.validateDutyTargetArchive({scope,targets:[]},ownerId,storeId,'12345').targets,[]);
  for(const targets of [[{year:2026,hours:0},{year:2026,hours:1}],[{year:1900,hours:1}],[{year:2026,hours:1000}],[{year:2026,hours:1.234}]])assert.throws(()=>model.validateDutyTargetArchive({scope,targets},ownerId,storeId,'12345'));
  assert.throws(()=>model.validateDutyTargetArchive(archive,ownerId,storeId,'99999'),/Foreign/);
  assert.throws(()=>model.validateDutyTargetArchive({...archive,scope:null},ownerId,storeId,null));
});

test('legacy preview and unrelated malformed-hour preferences remain preserved and cannot block selected export',async()=>{
  const f=fixture();await f.api.saveDutyTargetNative(key(2026),30,()=>true);
  const legacyKey=JSON.stringify(['owner/store/account',2026]);
  const legacyName=`cockpit-duty-${await hash(legacyKey)}.json`,legacyText=JSON.stringify({version:1,key:legacyKey,hours:25});f.files.set(legacyName,legacyText);
  const foreignKey=key(2026,'99999'),foreignName=`cockpit-duty-${await hash(foreignKey)}.json`,foreignText=JSON.stringify({version:1,key:foreignKey,hours:'legacy invalid'});f.files.set(foreignName,foreignText);
  const exported=await f.api.withDutyTargetLock(()=>f.api.exportDutyTargetsNative(scope,async()=>{}));
  assert.deepEqual(JSON.parse(JSON.stringify(exported.targets)),[{year:2026,hours:30}]);assert.equal(f.files.get(legacyName),legacyText);assert.equal(f.files.get(foreignName),foreignText);
});
test('lost target readback reports failure and replay completes under durable pending gate',async()=>{
  const f=fixture();f.pending(true);f.badRead();
  await assert.rejects(f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{})),/readback/);
  await f.api.withDutyTargetLock(()=>f.api.restoreDutyTargetsNative(archive,permit,async()=>{}));f.pending(false);
  assert.equal(await f.api.readDutyTargetNative(key(2025)),0);assert.equal(await f.api.readDutyTargetNative(key(2026)),37.5);
});

test('a target read paused across an aggregate lock or pending restore cannot publish stale hours',async()=>{
  for(const durable of [false,true]){
    const f=fixture();await f.api.saveDutyTargetNative(key(2026),30,()=>true);
    const release=f.pauseRead(),read=f.api.readDutyTargetNative(key(2026));await new Promise(resolve=>{setImmediate(resolve);});
    const checked=assert.rejects(read,durable?/pending/:/busy/);
    await f.api.withDutyTargetLock(async()=>{if(durable)f.pending(true);release();await checked;});
  }
});

test('a completed archive operation invalidates a still-paused older target read',async()=>{
  const f=fixture();await f.api.saveDutyTargetNative(key(2026),30,()=>true);
  const release=f.pauseRead(),read=f.api.readDutyTargetNative(key(2026));await new Promise(resolve=>{setImmediate(resolve);});
  await f.api.withDutyTargetLock(async()=>{});const checked=assert.rejects(read,/busy/);release();await checked;
});

import * as Crypto from 'expo-crypto';
import {Directory,File,Paths} from 'expo-file-system';
import {canonical} from '@moflight/flight-logbook';
import {loadStartPreviewCache,saveStartPreviewCache,clearStartPreviewCache} from '../mobile/start-preview-native';
import {readStartPreview,type StartPreview} from '../mobile/start-preview';

/** Build-only cache I/O proof: random synthetic UUID files, no owner registry,
 * provider, production history, AI or ordinary Start UI. */
export async function runNativeStartCacheProof() {
 const ids=[Crypto.randomUUID(),Crypto.randomUUID()];
 const directory=new Directory(Paths.cache,'moflight-start-preview-v1');
 const files=ids.map(id=>new File(directory,`start-${id}.sqlite`));
 if(files.some(file=>file.exists))throw new Error('Synthetic cache UUID collision');
 const checks:string[]=[],samples:{stage:string;milliseconds:number}[]=[];
 const gate=async()=>{};
 const now=Date.parse('2026-11-03T12:00:00.000Z');
 const fixture=(index:number):StartPreview=>{
  const owner=Crypto.randomUUID(),account=String(999990101+index),store=ids[index]!;
  const zero={time:'0:00',starts:'0',unknownDurationCount:0,unknownDateCount:0};
  return {version:1,ownerId:owner,storeId:store,accountRef:account,
   providerScope:{version:1,owner,connectionId:Crypto.randomUUID(),context:{accountNumber:account,clubLabel:'Synthetic cache club',clubIdentity:'display-label-only',verification:'observed-profile-number'}},
   context:{ownerSelectionSeq:1,selectionIdentity:'synthetic-cache-selection'},revision:'a'.repeat(64),day:'2026-11-03',savedAt:new Date(now).toISOString(),retrievedAt:null,
   dashboard:{current:{...zero,time:index?'0:24':'0:12',starts:String(index+1)},prior:zero,
    roles:['solo','dualInstruction','picWithCompanion'].map(key=>({key:key as 'solo'|'dualInstruction'|'picWithCompanion',count:0,knownMinutes:0,knownDurationCount:0,unknownDurationCount:0})),latest:null,workHours:null},medical:null,duties:null};
 };
 const values=ids.map((_,i)=>fixture(i)),texts=values.map(value=>canonical(value));
 const expected=(i:number)=>({ownerId:values[i]!.ownerId,storeId:ids[i]!,scope:values[i]!.providerScope,selectionSeq:1});
 const check=(value:unknown,message:string)=>{if(!value)throw new Error(message);checks.push(message);};
 const stage=async<T>(name:string,work:()=>Promise<T>)=>{
  const at=performance.now();try{return await work();}finally{samples.push({stage:name,milliseconds:performance.now()-at});}
 };
 let cleaned=false,error:string|null=null;
 try {
  await stage('seed-two-cache-stores',async()=>{for(const [i,id] of ids.entries())await saveStartPreviewCache(id,texts[i]!,gate);});
  await stage('closed-cache-readback-isolation',async()=>{
   for(const [i,id] of ids.entries()){
    const text=await loadStartPreviewCache(id);
    check(text===texts[i],`closed native cache ${i} exact readback`);
    check(text!==null&&readStartPreview(text,expected(i),now)!==null,`native cache ${i} admits its own valid envelope`);
   }
   check(readStartPreview((await loadStartPreviewCache(ids[0]!))!,expected(1),now)===null,'foreign account/store envelope rejected');
  });
  await stage('cancelled-cache-write',async()=>{
   let calls=0,rejected=false;
   try{await saveStartPreviewCache(ids[0]!,'rejected cache',async()=>{if(++calls===2)throw new Error('Synthetic cancelled write');});}catch{rejected=true;}
   check(rejected&&await loadStartPreviewCache(ids[0]!)===texts[0],'cancelled write preserves committed cache');
  });
  await stage('damaged-cache-rewarm',async()=>{
   files[0]!.write('Synthetic damaged SQLite cache');
   check(await loadStartPreviewCache(ids[0]!)===null&&!files[0]!.exists,'damaged native SQLite cache discarded as miss');
   await saveStartPreviewCache(ids[0]!,texts[0]!,gate);
   check(await loadStartPreviewCache(ids[0]!)===texts[0],'verified values can warm cache after damage');
  });
  await stage('invalidation-isolation',async()=>{
   await clearStartPreviewCache(ids[0]!);
   check(await loadStartPreviewCache(ids[0]!)===null,'failed-history cache invalidation removes saved preview');
   check(await loadStartPreviewCache(ids[1]!)===texts[1],'other account/store cache remains exact');
  });
 } catch(failure) { error=String(failure).slice(0,500); }
 finally {
  // Each handle has closed; delete only newly generated fixture files.
  for(const file of files)try{if(file.exists)file.delete();}catch(failure){error??=String(failure).slice(0,500);}
  cleaned=files.every(file=>!file.exists);
 }
 if(!cleaned)error??='Synthetic cache cleanup failed';
 return {version:1,status:error?'failed':'passed',error,sourceCommit:process.env.EXPO_PUBLIC_MOFLIGHT_SOURCE,checks,samples,cleaned,
  limitation:'Synthetic native cache/helper proof; no ordinary owner-registry/account-switch UI, complete history validation, first-visible frame, live provider, phone or iOS acceptance.'};
}

import {Directory,File,Paths} from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import {canonical} from '@moflight/flight-logbook';
import {hash} from '../storage';
import {openRealFlightNativeDriver} from '../vereinsflieger/real-flight-native-driver';
import {RealFlightLibrary,type RealFlightTiming} from '../vereinsflieger/real-flight-library';
import {RealFlightCommandJournal} from '../vereinsflieger/real-flight-command-journal';
import {RealFlightService} from '../vereinsflieger/real-flight-service';
import {SyncVerificationScope} from '../vereinsflieger/sync-verification-scope';
import {RECOVERY_AT,RECOVERY_MANIFEST,RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit} from './android-core-recovery-fixture';
import {responsivenessSource} from './android-flight-responsiveness';

/** Explicit synthetic-only control/candidate comparison, no provider/native owner
 * files. Every trial starts from identical closed seeds, and closes all handles
 * during the simulated provider wait. Both variants use current code; the
 * control omits the disposable verification scope. */
export async function runSyncVerificationBenchmark(active:()=>boolean,onProgress:(value:string)=>void,count=101){
  if(!Number.isSafeInteger(count)||count<1||count>500)throw new Error('Invalid synthetic size');
  const root=new Directory(Paths.cache,`moflight-sync-verification-v1-${count}`);root.create({idempotent:true,intermediates:true});
  const seeds=new Directory(root,'seeds');seeds.create({idempotent:true,intermediates:true});
  const run=new Directory(root,`run-${Date.now()}`);run.create();
  const requireActive=()=>{if(!active())throw new Error('Synthetic comparison interrupted');};
  const open=(directory:Directory,name:string)=>openRealFlightNativeDriver(name,(file,options)=>SQLite.openDatabaseAsync(file,options,directory.uri));
  const verified={accountNumber:'101',clubLabel:'Synthetic recovery club'};
  function service(directory:Directory,libraryName:string,journalName:string,capture:string,start:number,scope?:SyncVerificationScope){
    let next=start,hashCalls=0,openReplays=0;
    const digest=async(text:string)=>{hashCalls++;return hash(text);};
    const timing:RealFlightTiming=name=>{if(name==='graph-validation')openReplays++;return()=>{};};
    const value=new RealFlightService(RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit().leaseId,{
      authorize:()=>active()?recoveryPermit():null,hash:digest,now:()=>RECOVERY_AT,
      uuid:()=>`59595959-5959-4959-8959-${(next++).toString(16).padStart(12,'0')}`,
      retrieve:async()=>{requireActive();return responsivenessSource(capture,count);},
      repository:async()=>{
        requireActive();const db=await open(directory,libraryName);
        try{const library=await RealFlightLibrary.open(db,RECOVERY_OWNER,RECOVERY_STORE,digest,()=>active()?recoveryPermit():null,undefined,undefined,timing,scope);
          return {library,writable:true,warning:null,close:()=>library.close()};}
        catch(error){await db.close();throw error;}
      },journal:async()=>RealFlightCommandJournal.open(await open(directory,journalName),RECOVERY_OWNER,RECOVERY_STORE,()=>active()?recoveryPermit():null,digest,false,undefined,scope),
    });
    return {value,counts:()=>({hashCalls,openReplays})};
  }
  requireActive();
  if(!new File(seeds,'ready.txt').exists){
    await (await RealFlightLibrary.create(await open(seeds,'history.sqlite'),RECOVERY_MANIFEST,hash,recoveryPermit)).close();
    await (await RealFlightCommandJournal.open(await open(seeds,'commands.sqlite'),RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,hash,true)).close();
    for(let i=0;i<4;i++){
      requireActive();onProgress(`Testverlauf vorbereiten ${i+1}/4`);
      const seed=service(seeds,'history.sqlite','commands.sqlite',`verification-seed-${i}`,1+i*10);
      try{await seed.value.retrieveUpdateWithStoredReadback({beforeSave:async()=>verified},new Date(RECOVERY_AT));}finally{seed.value.dispose();}
    }
    new File(seeds,'ready.txt').write('complete');
  }
  const seedDigests=await Promise.all(['history.sqlite','commands.sqlite'].map(async name=>hash(await new File(seeds,name).base64())));
  const samples:{variant:'control'|'reuse';trial:number;milliseconds:number;stages:Record<string,number>;hashCalls:number;openReplays:number;graphHits:number;commandHits:number;graphSha256:string;receipts:number}[]=[];
  let expected:string|undefined;
  for(let trial=0;trial<5;trial++)for(const variant of ['control','reuse'] as const){
    requireActive();onProgress(`${variant==='control'?'Bisherige Prüfung':'Wiederverwendung'} ${trial+1}/5`);
    const libraryName=`${variant}-${trial}.sqlite`,journalName=`${variant}-${trial}-commands.sqlite`;
    await new File(seeds,'history.sqlite').copy(new File(run,libraryName));await new File(seeds,'commands.sqlite').copy(new File(run,journalName));
    const digests=await Promise.all([libraryName,journalName].map(async name=>hash(await new File(run,name).base64())));
    if(canonical(digests)!==canonical(seedDigests))throw new Error('Synthetic seed differs');
    const scope=variant==='reuse'?new SyncVerificationScope(recoveryPermit()):undefined;
    const current=service(run,libraryName,journalName,'verification-current',100,scope),stages:Record<string,number>={};
    async function measured<T>(name:string,work:()=>Promise<T>){const at=performance.now();try{return await work();}finally{stages[name]=performance.now()-at;}}
    const at=performance.now();
    try{
      await measured('local-admission',()=>current.value.readStored());
      await measured('entry-recovery',()=>current.value.prepareFreshFetch());
      const saved=await measured('update-review-save-readback',()=>current.value.retrieveUpdateWithStoredReadback({beforeSave:async()=>verified},new Date(RECOVERY_AT)));
      requireActive();if(saved.stored.flights.length!==count)throw new Error('Synthetic flight count differs');
      const milliseconds=performance.now()-at,counts=current.counts(),reuse=scope?.snapshot()??{graphHits:0,commandHits:0};
      scope?.close();
      const graph=await current.value.exportBackup();const graphSha256=await hash(graph);
      if(expected&&expected!==graphSha256)throw new Error('Synthetic graphs or receipts differ');expected=graphSha256;
      if((await current.value.recoverPending()).status!=='none')throw new Error('Synthetic receipt unresolved');
      const receipts=JSON.parse(JSON.parse(graph).payload).receipts.length;
      const sample={variant,trial,milliseconds,stages,...counts,...reuse,graphSha256,receipts};samples.push(sample);
      console.info('MOFLIGHT_SYNC_VERIFICATION_SAMPLE '+JSON.stringify(sample));
    }catch(error){console.info('MOFLIGHT_SYNC_VERIFICATION_INTERRUPTED '+JSON.stringify({variant,trial,milliseconds:performance.now()-at,stages,...current.counts(),...(scope?.snapshot()??{})}));throw error;}
    finally{scope?.close();current.value.dispose();}
  }
  const finalSeedDigests=await Promise.all(['history.sqlite','commands.sqlite'].map(async name=>hash(await new File(seeds,name).base64())));
  if(canonical(seedDigests)!==canonical(finalSeedDigests))throw new Error('Synthetic seed changed');
  const report={version:1,count,seedDigests,samples,scope:'Synthetic native local admission/recovery/automatic update; fake provider returns fixed source immediately; no network/UI/owner-registry timing'};
  new File(run,'report.json').write(JSON.stringify(report));
  console.info('MOFLIGHT_SYNC_VERIFICATION_COMPLETE '+JSON.stringify({samples:samples.length,count}));return report;
}

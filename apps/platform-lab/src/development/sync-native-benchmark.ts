import {Directory,File,Paths} from 'expo-file-system';
import {canonical} from '@moflight/flight-logbook';
import {hash} from '../storage';
import * as SQLite from 'expo-sqlite';
import {openRealFlightNativeDriver} from '../vereinsflieger/real-flight-native-driver';
import {RealFlightLibrary} from '../vereinsflieger/real-flight-library';
import {RealFlightCommandJournal} from '../vereinsflieger/real-flight-command-journal';
import {RealFlightService} from '../vereinsflieger/real-flight-service';
import {RECOVERY_AT,RECOVERY_MANIFEST,RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit} from './android-core-recovery-fixture';
import {responsivenessSource} from './android-flight-responsiveness';

/** Build-only synthetic proof. Every trial starts from byte-identical closed SQLite seeds. */
export async function runSyncNativeBenchmark(onProgress:(value:string)=>void,count=101){
  if(!Number.isSafeInteger(count)||count<1||count>500)throw new Error('Invalid synthetic benchmark size');
  const root=new Directory(Paths.cache,`moflight-fixed-sync-benchmark-v3-${count}`);root.create({idempotent:true,intermediates:true});
  const seeds=new Directory(root,'seeds');seeds.create({idempotent:true,intermediates:true});
  const run=new Directory(root,`run-${Date.now()}`);run.create();
  const openAt=(name:string,directory=run)=>openRealFlightNativeDriver(name,(file,options)=>SQLite.openDatabaseAsync(file,options,directory.uri));
  const open=(name:string)=>openAt(name);
  let sequence=1;
  const uuid=()=>`59595959-5959-4959-8959-${(sequence++).toString(16).padStart(12,'0')}`;
  function input(changed=false){const value=responsivenessSource(changed?'fixed-changed':'fixed-unchanged',count);
    if(changed)value.capture.rows[0]!.values[3]='10:13',value.capture.rows[0]!.values[4]='13';return value;}
  async function service(libraryName:string,journalName:string,changed=false,directory=run){
    return new RealFlightService(RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit().leaseId,{
      authorize:recoveryPermit,hash,uuid,now:()=>RECOVERY_AT,retrieve:async()=>input(changed),
      repository:async()=>{const library=await RealFlightLibrary.open(await openAt(libraryName,directory),RECOVERY_OWNER,RECOVERY_STORE,hash,recoveryPermit);
        return {library,writable:true,warning:null,close:()=>library.close()};},
      journal:async()=>RealFlightCommandJournal.open(await openAt(journalName,directory),RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,hash),
    });
  }
  if(!new File(seeds,'ready.txt').exists){
    const initial=await RealFlightLibrary.create(await openAt('empty.sqlite',seeds),RECOVERY_MANIFEST,hash,recoveryPermit);await initial.close();
    await (await RealFlightCommandJournal.open(await openAt('empty-commands.sqlite',seeds),RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,hash,true)).close();
    new File(seeds,'empty.sqlite').copy(new File(seeds,'populated.sqlite'));
    new File(seeds,'empty-commands.sqlite').copy(new File(seeds,'populated-commands.sqlite'));
    const seed=await service('populated.sqlite','populated-commands.sqlite',false,seeds);
    try{await seed.saveVerifiedReview(await seed.retrieveUpdate(new Date(RECOVERY_AT)),{accountNumber:'101',clubLabel:'Synthetic recovery club'});}finally{seed.dispose();}
    new File(seeds,'ready.txt').write('complete');
  }
  const seedDigests:Record<string,string[]>={};
  const samples:{scenario:string;trial:number;milliseconds:number;stages:Record<string,number>;graphSha256:string;receipts:number}[]=[];
  for(const scenario of ['first','unchanged','changed','reopened'] as const){
    const base=scenario==='first'?'empty':'populated';let expectedGraph:string|undefined;
    const seedHashes=await Promise.all([hash(await new File(seeds,`${base}.sqlite`).base64()),hash(await new File(seeds,`${base}-commands.sqlite`).base64())]);seedDigests[base]=seedHashes;
    for(let trial=0;trial<5;trial++){
      onProgress(`${scenario} ${trial+1}/5`);sequence=100;
      const name=`${scenario}-${trial}`,libraryName=`${name}.sqlite`,journalName=`${name}-commands.sqlite`;
      new File(seeds,`${base}.sqlite`).copy(new File(run,libraryName));new File(seeds,`${base}-commands.sqlite`).copy(new File(run,journalName));
      if(await hash(await new File(run,libraryName).base64())!==seedHashes[0]||await hash(await new File(run,journalName).base64())!==seedHashes[1])throw new Error('Seed clone differs');
      const current=await service(libraryName,journalName,scenario==='changed');const stages:Record<string,number>={};
      async function measure<T>(stage:string,work:()=>Promise<T>){const at=performance.now();const value=await work();stages[stage]=performance.now()-at;return value;}
      const at=performance.now();
      try{
        if(scenario!=='reopened'){
          const review=await measure('retrieval-review',()=>current.retrieveUpdate(new Date(RECOVERY_AT)));
          const result=await measure('save',()=>current.saveVerifiedReview(review,{accountNumber:'101',clubLabel:'Synthetic recovery club'}));
          if(scenario==='first'&&result.counts.added!==count||scenario==='unchanged'&&result.counts.unchanged!==count||scenario==='changed'&&result.counts.changed!==1)throw new Error('Unexpected import result');
        }
        const stored=await measure('readback',()=>current.readStored());
        if(stored.flights.length!==count||(await current.recoverPending()).status!=='none')throw new Error('Preservation/recovery failed');
        const milliseconds=performance.now()-at;
        const library=await RealFlightLibrary.open(await open(libraryName),RECOVERY_OWNER,RECOVERY_STORE,hash,recoveryPermit);
        let graph;try{graph=await library.snapshot();}finally{await library.close();}
        const graphSha256=await hash(canonical(graph));if(expectedGraph&&expectedGraph!==graphSha256)throw new Error('Graphs or receipts differ between trials');expectedGraph=graphSha256;
        samples.push({scenario,trial,milliseconds,stages,graphSha256,receipts:graph.receipts.length});
        console.info('MOFLIGHT_SYNC_SAMPLE '+JSON.stringify(samples.at(-1)));
      }finally{current.dispose();}
    }
  }
  const report={version:1,flights:count,scope:'Synthetic Android native SQLite; five byte-identical seed clones per scenario, no provider/network/physical-phone claim',seedDigests,samples};
  new File(run,'report.json').write(JSON.stringify(report));console.info('MOFLIGHT_SYNC_BENCHMARK '+JSON.stringify({...report,samples:samples.length}));return report;
}

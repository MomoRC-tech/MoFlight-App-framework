import type { Driver, Hash } from '@moflight/local-data';
import { RealFlightLibrary } from '../vereinsflieger/real-flight-library';
import { RealFlightSelection } from '../vereinsflieger/real-flight-selection';
import { RealFlightCommandJournal } from '../vereinsflieger/real-flight-command-journal';
import { RealFlightService } from '../vereinsflieger/real-flight-service';
import { RECOVERY_AT, RECOVERY_MANIFEST, RECOVERY_OWNER, RECOVERY_STORE, recoveryPermit, recoverySource } from './android-core-recovery-fixture';

/** Synthetic diagnostic only; no production registry, provider or file discovery. */
export function responsivenessSource(captureId: string, count = 101) {
  const source = recoverySource(captureId);
  source.capture.headers.push(...Array.from({length:41}, (_,i)=>`Synthetic field ${i+1}`));
  source.capture.rows = Array.from({length:count}, (_,i)=>({sourceFlightId:String(9001+i),
    values:['20.10.2026','D-TEST','10:00','10:12','12','Synthetic pilot',
      ...Array.from({length:41}, (_,j)=>`Synthetic value ${i+1}/${j+1}`)]}));
  source.capture.exportContext = {...source.capture.exportContext!, recordCount:count, pageCount:count>100?2:1,
    columnIds:Array.from({length:47}, (_,i)=>String(i+1))};
  return source;
}
export interface ResponsivenessPorts {
  open(name:string):Promise<Driver>;
  hash:Hash;
  uuid():string;
  now():number;
}
export interface ResponsivenessStage { name:string; milliseconds:number; hashCalls:number }
export interface ResponsivenessReport {
  version:1; mode:'seed'|'reopen'; stages:ResponsivenessStage[];
  initialFlights:number; finalFlights:number; initialGeneration:number; finalGeneration:number;
}

export async function runFlightResponsiveness(ports:ResponsivenessPorts, runId:string, seed:boolean,
  onStage:(stage:ResponsivenessStage)=>void = ()=>{}):Promise<ResponsivenessReport> {
  // A caller-supplied UUID gives each seed its own files. Reopen uses that same UUID.
  const candidate=`moflight-real-history-${runId}.sqlite`;
  const selectionName=`native-responsiveness-${runId}-selection.sqlite`;
  const journalName=`native-responsiveness-${runId}-commands.sqlite`;
  let hashCalls=0;
  const hash:Hash=async text=>{hashCalls++;return ports.hash(text);};
  const stages:ResponsivenessStage[]=[];
  async function stage<T>(name:string, work:()=>Promise<T>):Promise<T> {
    const start=ports.now(), before=hashCalls;
    const value=await work();
    const result={name,milliseconds:ports.now()-start,hashCalls:hashCalls-before};
    stages.push(result);onStage(result);return value;
  }
  const openCandidate=async (name:string, authorize= recoveryPermit, gate?: (write:boolean)=>Promise<void>)=>{
    if(name!==candidate)throw new Error('Foreign diagnostic candidate.');
    const db=await ports.open(name);
    try {return await RealFlightLibrary.open(db,RECOVERY_OWNER,RECOVERY_STORE,hash,authorize,undefined,gate);}
    catch(error){await db.close();throw error;}
  };
  const selection=async (create=false)=>{
    const db=await ports.open(selectionName);
    try {return await RealFlightSelection.open(db,RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,
      (name,authorize,gate)=>openCandidate(name,()=>{const value=authorize();if(!value)throw new Error('Expired probe.');return value;},gate),hash,create);}
    catch(error){await db.close();throw error;}
  };
  const journal=async (create=false)=>{
    const db=await ports.open(journalName);
    try{return await RealFlightCommandJournal.open(db,RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit,hash,create);}
    catch(error){await db.close();throw error;}
  };
  if(seed)await stage('seed-six-receipts',async()=>{
    const library=await RealFlightLibrary.create(await ports.open(candidate),RECOVERY_MANIFEST,hash,recoveryPermit);
    try {
      await library.bindAccount({kind:'bind',commandId:ports.uuid(),baseGeneration:0,source:responsivenessSource('probe-bind',5),at:RECOVERY_AT});
      for(const [index,count] of [5,5,0,5,101].entries()){
        const source=responsivenessSource(`probe-seed-${index}`,count),plan=await library.prepareImport(source);
        await library.saveUnassigned({kind:'import-unassigned',commandId:ports.uuid(),baseGeneration:plan.baseGeneration,
          bindingId:plan.bindingId,source,planToken:plan.planToken,at:RECOVERY_AT});
      }
    } finally {await library.close();}
    const selected=await selection(true);
    try {await selected.activate(ports.uuid(),candidate,null,RECOVERY_AT);}finally{await selected.close();}
    await (await journal(true)).close();
  });
  const library=await stage('candidate-open',()=>openCandidate(candidate));
  try {await stage('candidate-snapshot',()=>library.snapshot());}finally{await library.close();}
  const service=new RealFlightService(RECOVERY_OWNER,RECOVERY_STORE,recoveryPermit().leaseId,{
    authorize:recoveryPermit,hash,uuid:ports.uuid,now:()=>RECOVERY_AT,
    retrieve:async()=>responsivenessSource(`probe-review-${ports.uuid()}`),journal,
    repository:async()=>{
      const selected=await selection();
      try {
        const result=await selected.select();
        return {library:result.candidate,writable:!result.recoveryRequired,warning:result.warning,
          close:async()=>{try{await result.candidate.close();}finally{await selected.close();}}};
      }catch(error){await selected.close();throw error;}
    },
  });
  try {
    const snapshot=await stage('service-snapshot',()=>service.snapshot());
    const flights=await stage('service-list',()=>service.list());
    const stored=await stage('service-stored-view',()=>service.readStored());
    if(stored.snapshot.generation!==snapshot.generation||stored.flights.length!==flights.length)throw new Error('Incoherent stored view.');
    await stage('service-recover',()=>service.recoverPending());
    const review=await stage('source-review',()=>service.retrieve({from:'2026-10-01',to:'2026-10-20'}));
    await stage('explicit-save',()=>service.saveUnassigned(review));
    const final=await stage('post-save-snapshot',()=>service.snapshot());
    const rows=await stage('post-save-list',()=>service.list());
    if(flights.length!==101||rows.length!==101||final.generation!==snapshot.generation+1)throw new Error('Probe preservation failed.');
    return {version:1,mode:seed?'seed':'reopen',stages,initialFlights:flights.length,finalFlights:rows.length,
      initialGeneration:snapshot.generation,finalGeneration:final.generation};
  }finally{service.dispose();}
}

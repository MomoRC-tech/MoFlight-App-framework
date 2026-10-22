export type MedicalJobStatus='updated'|'empty'|'failed'|'skipped';
export type DutyJobStatus='partial'|'failed'|'skipped';
export type FeatureJobStatus='partial'|'failed'|'skipped';
export interface OtherAccountDataResult { medical:MedicalJobStatus; duties?:DutyJobStatus; events?:FeatureJobStatus; documentNotices?:FeatureJobStatus; workSummary?:FeatureJobStatus; workHours?:FeatureJobStatus; tasks?:FeatureJobStatus }

/** Independent optional source jobs. A failure never reruns the flight job. */
export async function retrieveOtherAccountData(ports:{
  medical:()=>Promise<{rows:readonly unknown[]}>;
  duties?:()=>Promise<{rows:readonly unknown[];partial:true}>;
  events?:()=>Promise<{rows:readonly unknown[]}>;
  documentNotices?:()=>Promise<{rows:readonly unknown[]}>;
  workSummary?:()=>Promise<{rows:readonly unknown[]}>;
  workHours?:()=>Promise<{rows:readonly unknown[]}>;
  tasks?:()=>Promise<{rows:readonly unknown[]}>;
  active:()=>boolean;
}):Promise<OtherAccountDataResult> {
  const result:OtherAccountDataResult={medical:'skipped'};
  if(ports.active())try {
    const capture=await ports.medical();
    result.medical=ports.active()?(capture.rows.length?'updated':'empty'):'skipped';
  } catch { result.medical=ports.active()?'failed':'skipped'; }
  for(const key of ['duties','events','documentNotices','workSummary','workHours','tasks'] as const){
    const job=ports[key];if(!job)continue;
    result[key]='skipped';if(!ports.active())continue;
    try { await job();result[key]=ports.active()?'partial':'skipped'; }
    catch { result[key]=ports.active()?'failed':'skipped'; }
  }
  return result;
}

/** One explicit action coordinates independently owned flight and other-data jobs. */
export async function runAccountRetrievalJobs<T>(ports:{
  flights:()=>Promise<T>;
  otherData:()=>Promise<OtherAccountDataResult>;
  active:()=>boolean;
  stage:(stage:'flights'|'other-data')=>void;
}):Promise<{flights:T;otherData:OtherAccountDataResult}> {
  if(!ports.active())throw new Error('Account refresh is no longer active.');
  ports.stage('flights');
  const flights=await ports.flights();
  if(!ports.active())return {flights,otherData:{medical:'skipped'}};
  ports.stage('other-data');
  let otherData:OtherAccountDataResult;
  try { otherData=await ports.otherData(); }
  catch { otherData={medical:ports.active()?'failed':'skipped'}; }
  return {flights,otherData};
}

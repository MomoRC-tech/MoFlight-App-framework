export type MedicalJobStatus='updated'|'empty'|'failed'|'skipped';
export type DutyJobStatus='partial'|'failed'|'skipped';
export interface OtherAccountDataResult { medical:MedicalJobStatus; duties?:DutyJobStatus }

/** Independent optional source jobs. A failure never reruns the flight job. */
export async function retrieveOtherAccountData(ports:{
  medical:()=>Promise<{rows:readonly unknown[]}>;
  duties?:()=>Promise<{rows:readonly unknown[];partial:true}>;
  active:()=>boolean;
}):Promise<OtherAccountDataResult> {
  if(!ports.active())return {medical:'skipped',...(ports.duties?{duties:'skipped' as const}:{})};
  let medical:MedicalJobStatus;
  try {
    const capture=await ports.medical();
    medical=ports.active()?(capture.rows.length?'updated':'empty'):'skipped';
  } catch { medical=ports.active()?'failed':'skipped'; }
  if(!ports.duties)return {medical};
  if(!ports.active())return {medical,duties:'skipped'};
  try { await ports.duties();return {medical,duties:ports.active()?'partial':'skipped'}; }
  catch { return {medical,duties:ports.active()?'failed':'skipped'}; }
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

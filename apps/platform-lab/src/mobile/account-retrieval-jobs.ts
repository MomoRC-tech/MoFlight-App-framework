export type MedicalJobStatus='updated'|'empty'|'failed'|'skipped';
export interface OtherAccountDataResult { medical:MedicalJobStatus }

/** Independent optional source jobs. A failure never reruns the flight job. */
export async function retrieveOtherAccountData(ports:{
  medical:()=>Promise<{rows:readonly unknown[]}>;
  active:()=>boolean;
}):Promise<OtherAccountDataResult> {
  if(!ports.active())return {medical:'skipped'};
  try {
    const capture=await ports.medical();
    return {medical:ports.active()?(capture.rows.length?'updated':'empty'):'skipped'};
  } catch { return {medical:ports.active()?'failed':'skipped'}; }
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

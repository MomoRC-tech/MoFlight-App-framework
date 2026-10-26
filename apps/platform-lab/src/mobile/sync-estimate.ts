import {syncStages,type SyncStage} from './sync-progress';

/** Disposable local performance hints; increment after changing timing boundaries. */
export const SYNC_ESTIMATE_MODEL_VERSION=2;
/** Shared monotonic clock for runtime events; deterministic callers inject their own timestamps. */
export const syncEstimateNow=()=>performance.now();
export type SyncEstimateStage=Exclude<SyncStage,'sign-in'>|'review';
export type SyncEstimateMode='first'|'repeat'|'resume';
export type SyncEstimateVolume='unknown'|'small'|'medium'|'large';
type Sample={mode:SyncEstimateMode;volume:SyncEstimateVolume;stage:SyncEstimateStage;durationsMs:number[]};
export type SyncEstimateContext={mode:'first'|'repeat';volume:SyncEstimateVolume};
export type SyncEstimateHistory={version:number;scope:string;samples:Sample[];context?:SyncEstimateContext};
const stages:readonly string[]=[...new Set([...syncStages.filter(stage=>stage!=='sign-in'),'review'])];
const modes:readonly string[]=['first','repeat','resume'];
const volumes:readonly string[]=['unknown','small','medium','large'];
const MAX_DURATION=24*60*60*1000,MAX_SAMPLES=5,MAX_GROUPS=stages.length*modes.length*volumes.length;
const validStage=(value:unknown):value is SyncEstimateStage=>typeof value==='string'&&stages.includes(value);
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const validTime=(value:number)=>Number.isFinite(value)&&value>=0;

/** Broad input buckets, not a fitted per-flight cost model. Unknown stays distinct. */
export function syncEstimateVolume(incomingRows:number|null,libraryRows:number|null=null):SyncEstimateVolume{
  const counts=[incomingRows,libraryRows].filter((value):value is number=>value!==null&&Number.isSafeInteger(value)&&value>=0);
  if(!counts.length)return 'unknown';
  const maximum=Math.max(...counts);
  return maximum<=100?'small':maximum<=1000?'medium':'large';
}

/** No business payload, identity or unbounded input survives this parser. Scope is caller-owned device/build context. */
export function parseSyncEstimateHistory(value:unknown,scope:string):SyncEstimateHistory{
  const empty:SyncEstimateHistory={version:SYNC_ESTIMATE_MODEL_VERSION,scope,samples:[]};
  if(typeof value==='string'){
    if(value.length>100_000)return empty;
    try{value=JSON.parse(value);}catch{return empty;}
  }
  if(!record(value)||value.version!==SYNC_ESTIMATE_MODEL_VERSION||value.scope!==scope||!Array.isArray(value.samples))return empty;
  const groups=new Map<string,Sample>();
  for(const item of value.samples.slice(-MAX_GROUPS)){
    if(!record(item)||typeof item.mode!=='string'||!modes.includes(item.mode)||typeof item.volume!=='string'||!volumes.includes(item.volume)||!validStage(item.stage)||!Array.isArray(item.durationsMs))continue;
    const durationsMs=item.durationsMs.filter((duration):duration is number=>typeof duration==='number'&&Number.isFinite(duration)&&duration>=1&&duration<=MAX_DURATION).slice(-MAX_SAMPLES);
    if(!durationsMs.length)continue;
    const sample:Sample={mode:item.mode as SyncEstimateMode,volume:item.volume as SyncEstimateVolume,stage:item.stage,durationsMs};
    const key=`${sample.mode}/${sample.volume}/${sample.stage}`,previous=groups.get(key);
    groups.set(key,{...sample,durationsMs:[...(previous?.durationsMs??[]),...durationsMs].slice(-MAX_SAMPLES)});
  }
  const context=record(value.context)&&['first','repeat'].includes(String(value.context.mode))&&typeof value.context.mode==='string'&&typeof value.context.volume==='string'&&volumes.includes(value.context.volume)?
    {mode:value.context.mode as 'first'|'repeat',volume:value.context.volume as SyncEstimateVolume}:undefined;
  return {...empty,samples:[...groups.values()],...(context?{context}:{})};
}

type Unit={stage:SyncEstimateStage;expectedMs:number|null;elapsedMs:number;done:boolean;count?:{done:number;total:number}};
export type SyncEstimateStatus='active'|'paused'|'success'|'partial'|'failed'|'cancelled';
export type SyncEstimateState={
  runId:string;scope:string;mode:SyncEstimateMode;volume:SyncEstimateVolume;units:Unit[];
  current:SyncEstimateStage|null;status:SyncEstimateStatus;now:number;fraction:number|null;learnable:boolean;contextVerified:boolean;
};
export type SyncEstimateEvent={runId:string;at:number}&(
  {type:'start'|'finish';stage:SyncEstimateStage}|
  {type:'count';stage:SyncEstimateStage;done:number;total:number|null}|
  {type:'pause';reason:'sign-in'|'background'}|
  {type:'resume'|'tick'}|
  {type:'terminal';outcome:'success'|'partial'|'failed'|'cancelled'}
);

function median(values:readonly number[]):number{
  const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[middle]!:(sorted[middle-1]!+sorted[middle]!)/2;
}

/** Plans only remaining units for resume. Missing comparable history means indeterminate, never equal invented weights. */
export function createSyncEstimate({runId,scope,mode,volume,stages:planned,history,now,provisional=false}:{
  runId:string;scope:string;mode:SyncEstimateMode;volume:SyncEstimateVolume;
  stages:readonly (SyncEstimateStage|'sign-in')[];history?:unknown;now:number;provisional?:boolean;
}):SyncEstimateState{
  if(!runId||!scope||scope.length>128||!validTime(now))throw new Error('Invalid Sync estimate context');
  const samples=parseSyncEstimateHistory(history,scope).samples;
  const units=[...new Set(planned.filter(validStage))].map(stage=>{
    const sample=samples.find(item=>item.mode===mode&&item.volume===volume&&item.stage===stage);
    return {stage,expectedMs:sample?median(sample.durationsMs):null,elapsedMs:0,done:false};
  });
  return {runId,scope,mode,volume,units,current:null,status:'active',now,fraction:units.length&&units.every(unit=>unit.expectedMs!==null)?0:null,learnable:true,contextVerified:!provisional};
}

/** Cached context only selects provisional hints. Existing business reads must confirm it before learning. */
export function confirmSyncEstimateContext(state:SyncEstimateState,context:{mode:SyncEstimateMode;volume:SyncEstimateVolume},remaining?:readonly SyncEstimateStage[]):SyncEstimateState{
  const planned=remaining?['prepare','account',...remaining]:state.units.map(unit=>unit.stage);
  const changed=state.mode!==context.mode||state.volume!==context.volume;
  const next:SyncEstimateState={...state,...context,contextVerified:true,units:planned.map(stage=>{
    const existing=state.units.find(unit=>unit.stage===stage);
    return existing?{...existing,expectedMs:changed?null:existing.expectedMs}:{stage:stage as SyncEstimateStage,expectedMs:null,elapsedMs:0,done:false};
  }),fraction:changed?null:state.fraction};
  return {...next,fraction:projectedFraction(next)};
}

function projectedFraction(state:SyncEstimateState):number|null{
  if(state.status==='success')return 1;
  if(!state.units.length||state.units.some(unit=>unit.expectedMs===null))return null;
  const total=state.units.reduce((sum,unit)=>sum+unit.expectedMs!,0);
  const completed=state.units.reduce((sum,unit)=>{
    const portion=unit.done?1:unit.stage!==state.current?0:
      unit.stage==='flights'&&unit.count?unit.count.total===0?0:unit.count.done/unit.count.total:
      Math.min(0.9,0.9*unit.elapsedMs/unit.expectedMs!);
    return sum+unit.expectedMs!*portion;
  },0);
  return Math.max(state.fraction??0,Math.min(0.99,completed/total));
}

/** Every timestamp is injected. Invalid, stale, paused and terminal callbacks cannot complete a unit. */
export function reduceSyncEstimate(previous:SyncEstimateState,event:SyncEstimateEvent):SyncEstimateState{
  if(event.runId!==previous.runId||!validTime(event.at)||event.at<previous.now||!['active','paused'].includes(previous.status))return previous;
  const active=previous.units.find(unit=>unit.stage===previous.current);
  if(event.type==='start'&&(previous.status!=='active'||previous.current!==null||previous.units.find(unit=>!unit.done)?.stage!==event.stage))return previous;
  if((event.type==='finish'||event.type==='count')&&(previous.status!=='active'||event.stage!==previous.current||!active))return previous;
  if(event.type==='count'&&(!Number.isSafeInteger(event.done)||event.done<0||event.total===null||!Number.isSafeInteger(event.total)||event.total<event.done||
    active?.count&&(event.done<active.count.done||event.total!==active.count.total)))return previous;
  if(event.type==='pause'&&previous.status!=='active'&&event.reason!=='background'||event.type==='resume'&&previous.status!=='paused')return previous;
  let next:SyncEstimateState={...previous,now:event.at,units:previous.units.map(unit=>({...unit,
    elapsedMs:unit.stage===previous.current&&previous.status==='active'?unit.elapsedMs+event.at-previous.now:unit.elapsedMs}))};
  switch(event.type){
    case 'start':next.current=event.stage;break;
    case 'finish':next.units=next.units.map(unit=>unit.stage===event.stage?{...unit,done:true}:unit);next.current=null;break;
    case 'count':
      if(event.stage==='flights')next.units=next.units.map(unit=>unit.stage===event.stage?{...unit,count:{done:event.done,total:event.total!}}:unit);
      break;
    case 'pause':next.status='paused';if(event.reason==='background')next.learnable=false;break;
    case 'resume':next.status='active';break;
    case 'terminal':next.status=event.outcome==='success'&&(!next.units.length||next.units.some(unit=>!unit.done))?'partial':event.outcome;break;
    case 'tick':break;
  }
  next={...next,fraction:projectedFraction(next)};
  return next;
}

export function snapshotSyncEstimate(state:SyncEstimateState):{fraction:number|null;estimated:boolean;overrun:boolean;status:SyncEstimateStatus}{
  const active=state.units.find(unit=>unit.stage===state.current);
  return {fraction:state.fraction,estimated:state.fraction!==null&&state.status!=='success',
    overrun:state.status==='active'&&!!active&&active.expectedMs!==null&&active.elapsedMs>=active.expectedMs,status:state.status};
}

/** Call once for a terminal attempt. Failed/partial/cancelled/background runs cannot train hints. */
export function learnSyncEstimate(history:unknown,state:SyncEstimateState,context?:SyncEstimateContext):SyncEstimateHistory{
  const parsed=parseSyncEstimateHistory(history,state.scope);
  if(state.status!=='success'||!state.learnable||!state.contextVerified||!state.units.length||state.units.some(unit=>!unit.done||unit.elapsedMs>MAX_DURATION))return parsed;
  for(const unit of state.units){
    const previous=parsed.samples.find(sample=>sample.mode===state.mode&&sample.volume===state.volume&&sample.stage===unit.stage);
    if(previous)previous.durationsMs=[...previous.durationsMs,Math.max(1,unit.elapsedMs)].slice(-MAX_SAMPLES);
    else parsed.samples.push({mode:state.mode,volume:state.volume,stage:unit.stage,durationsMs:[Math.max(1,unit.elapsedMs)]});
  }
  if(context)parsed.context={...context};
  else if(state.mode!=='resume')parsed.context={mode:state.mode,volume:state.volume};
  return parsed;
}

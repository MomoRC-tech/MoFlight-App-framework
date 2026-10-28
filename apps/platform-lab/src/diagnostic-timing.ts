import { diagnosticActions, diagnosticStages, outcomes, member, object, DIAGNOSTIC_CHECKPOINT_LIMIT, type DiagnosticStage } from './diagnostic-vocabulary';

type TimingPoint={name:DiagnosticStage;state:string;offset:number;spanId?:number;parentSpanId?:number};
type Interval={start:number;end:number};
type TimingTimeline = {
  scope:string;complete:boolean;incompleteSpans:number;overlapMilliseconds:number;activeMilliseconds:number;waitingMilliseconds:number;
  unattributedMilliseconds:number;activeIntervals:Interval[];waitingIntervals:Interval[];gaps:Interval[];droppedCheckpoints?:number;
  milestones?:{name:string;milliseconds:number|null;observed:boolean}[];
};
const length=(values:Interval[])=>values.reduce((total,value)=>total+value.end-value.start,0);
function union(values:Interval[]):Interval[]{
  const result:Interval[]=[];
  for(const value of [...values].sort((a,b)=>a.start-b.start||a.end-b.end)){
    if(value.end<=value.start)continue;
    const previous=result.at(-1);
    if(previous&&value.start<=previous.end)previous.end=Math.max(previous.end,value.end);
    else result.push({...value});
  }
  return result;
}
function subtract(values:Interval[],removed:Interval[]):Interval[]{
  const result:Interval[]=[];
  for(const value of union(values)){
    let cursor=value.start;
    for(const cut of union(removed)){
      if(cut.end<=cursor||cut.start>=value.end)continue;
      if(cut.start>cursor)result.push({start:cursor,end:cut.start});
      cursor=Math.max(cursor,cut.end);
      if(cursor>=value.end)break;
    }
    if(cursor<value.end)result.push({start:cursor,end:value.end});
  }
  return result;
}
function timeline(points:TimingPoint[],milliseconds:number): TimingTimeline | undefined {
  if(!points.some(point=>point.name.startsWith('sync-')))return undefined;
  const groups=new Map<number,TimingPoint[]>(),unknown:Interval[]=[],top:Interval[]=[],waits:Interval[]=[];
  let incompleteSpans=0;
  for(const point of points.filter(point=>point.name.startsWith('sync-')||point.name==='user-sign-in-wait')){
    if(point.spanId===undefined){incompleteSpans++;unknown.push({start:0,end:milliseconds});continue;}
    const group=groups.get(point.spanId)??[];group.push(point);groups.set(point.spanId,group);
  }
  for(const group of groups.values()){
    const start=group.find(point=>point.state==='start'),end=group.find(point=>point.state!=='start');
    if(group.length!==2||!start||!end||start.name!==end.name||start.offset>end.offset||end.offset>milliseconds){
      incompleteSpans++;
      // An absent boundary is not a measured interval. Conservatively leave
      // its possible coverage unclassified, including an unfinished user wait.
      unknown.push(start&&end&&(start.offset>end.offset||end.offset>milliseconds)?{start:0,end:milliseconds}:
        {start:start&&start.offset<=milliseconds?start.offset:0,end:end&&end.offset<=milliseconds?end.offset:milliseconds});
      continue;
    }
    const interval={start:start.offset,end:end.offset};
    if(start.name.startsWith('sync-'))top.push(interval);
    if(start.name==='sync-sign-in'||start.name==='user-sign-in-wait')waits.push(interval);
  }
  const stageUnion=union(top),overlapMilliseconds=length(top)-length(stageUnion);
  const waitingIntervals=subtract(waits,unknown);
  const activeIntervals=subtract(stageUnion,[...unknown,...waits]);
  const gaps=subtract([{start:0,end:milliseconds}],[...activeIntervals,...waitingIntervals]);
  return {scope:'observed top-level Sync spans; active excludes recorded sign-in waits; gaps remain unclassified',
    complete:incompleteSpans===0&&overlapMilliseconds===0,incompleteSpans,overlapMilliseconds,
    activeMilliseconds:length(activeIntervals),waitingMilliseconds:length(waitingIntervals),unattributedMilliseconds:length(gaps),
    activeIntervals,waitingIntervals,gaps};
}

/** Start preparation uses disjoint outer steps; cumulative JS milestones are separate endpoints. */
function startTimeline(action: string, points: TimingPoint[], milliseconds: number, dropped: number): TimingTimeline | undefined {
  const names = action === 'read-flights' ? new Set(['local-session-open','local-owner-check','local-pending-command','local-stored-view',
    'local-medical-read','local-duties-read','local-information-read','start-preview-read','start-preview-save','local-session-close','local-view-reuse'])
    : action === 'start-presentation' ? new Set(['start-cached-data','start-render-wait','start-retained-data']) : null;
  if (action === 'start-screen') {
    const milestones = ['start-js-to-shell','start-js-to-data','start-js-to-commit','start-js-to-settled'].map(name => {
      const end = points.find(point => point.name === name && point.state !== 'start');
      return { name, milliseconds: end?.offset ?? null, observed: end?.state === 'success' };
    });
    return { scope: 'JS instrumentation entry only; React commit is a proxy, native launch/presentation unmeasured',
      complete: dropped === 0 && milestones.every(point => point.observed), droppedCheckpoints: dropped, milestones, incompleteSpans:milestones.filter(point=>!point.observed).length, overlapMilliseconds:0,
      activeMilliseconds:0,waitingMilliseconds:0,unattributedMilliseconds:milliseconds,activeIntervals:[],waitingIntervals:[],gaps:[{start:0,end:milliseconds}] };
  }
  if (!names) return undefined;
  const groups = new Map<number, TimingPoint[]>(); let incompleteSpans = 0;
  for (const point of points.filter(point => names.has(point.name))) {
    if (point.spanId === undefined) { incompleteSpans++; continue; }
    const group = groups.get(point.spanId) ?? []; group.push(point); groups.set(point.spanId, group);
  }
  const intervals: Interval[] = [];
  for (const group of groups.values()) {
    const begin=group.find(point=>point.state==='start'),end=group.find(point=>point.state!=='start');
    if(group.length!==2||!begin||!end||begin.name!==end.name||begin.offset>end.offset||end.offset>milliseconds) { incompleteSpans++; continue; }
    intervals.push({start:begin.offset,end:end.offset});
  }
  const activeIntervals=union(intervals), overlapMilliseconds=length(intervals)-length(activeIntervals);
  const gaps=subtract([{start:0,end:milliseconds}],activeIntervals);
  return {scope: action==='read-flights'?'saved-local preparation; render is measured separately':'publication to React commit proxy; not native pixels',
    complete:dropped===0&&incompleteSpans===0&&overlapMilliseconds===0&&intervals.length>0,
    droppedCheckpoints:dropped,incompleteSpans,overlapMilliseconds,activeMilliseconds:length(activeIntervals),waitingMilliseconds:0,waitingIntervals:[],
    unattributedMilliseconds:length(gaps),activeIntervals,gaps};
}

/** Project only finite timing fields. Never copy source text, IDs, context or error messages. */
export function summarizeDiagnosticTiming(input: unknown) {
  const report = object(input);
  if (report.format !== 'MoFlight support diagnostics' || report.version !== 2 || !Array.isArray(report.entries) || report.entries.length > 600) {
    throw new Error('Unsupported diagnostic timing report');
  }
  const duration = (value: unknown) => {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86_400_000) throw new Error('Invalid diagnostic timing');
    return value;
  };
  const operations = report.entries.map(value => {
    const entry = object(value);
    if (!member(diagnosticActions, entry.action) || !member(outcomes, entry.outcome) || !Array.isArray(entry.stages) || entry.stages.length > diagnosticStages.length) throw new Error('Invalid diagnostic operation');
    const seen = new Set<DiagnosticStage>();
    const stages = entry.stages.map(value => {
      const stage = object(value);
      if (!member(diagnosticStages, stage.name) || seen.has(stage.name)) throw new Error('Invalid diagnostic stage');
      seen.add(stage.name);
      const milliseconds = duration(stage.milliseconds), maximum = duration(stage.maximum);
      if (!Number.isSafeInteger(stage.calls) || (stage.calls as number) < 1 || !Number.isSafeInteger(stage.failures) || (stage.failures as number) < 0 || (stage.failures as number) > (stage.calls as number) || maximum > milliseconds) throw new Error('Invalid diagnostic counts');
      return { name: stage.name, calls: stage.calls as number, failures: stage.failures as number, milliseconds, maximum };
    });
    const checkpoints = entry.checkpoints === undefined ? undefined : (() => {
      if (!Array.isArray(entry.checkpoints) || entry.checkpoints.length > DIAGNOSTIC_CHECKPOINT_LIMIT) throw new Error('Invalid diagnostic checkpoints');
      return entry.checkpoints.map(value => {
        const point = object(value);
        if (!member(diagnosticStages, point.name) || !member(['start','success','failed'], point.state)) throw new Error('Invalid diagnostic checkpoint');
        const result: TimingPoint = { name: point.name, state: point.state, offset: duration(point.offset) };
        if (point.spanId !== undefined) {
          if (typeof point.spanId !== 'number' || !Number.isSafeInteger(point.spanId) || point.spanId < 1 || point.spanId > 1_000_000) throw new Error('Invalid diagnostic span');
          result.spanId = point.spanId;
        }
        if (point.parentSpanId !== undefined) {
          if (typeof point.parentSpanId !== 'number' || !Number.isSafeInteger(point.parentSpanId) || point.parentSpanId < 1 || result.spanId === undefined || point.parentSpanId >= result.spanId) throw new Error('Invalid diagnostic parent span');
          result.parentSpanId = point.parentSpanId;
        }
        return result;
      });
    })();
    const milliseconds=duration(entry.milliseconds),dropped=entry.droppedCheckpoints===undefined?0:duration(entry.droppedCheckpoints);
    const observedTimeline=checkpoints===undefined?undefined:startTimeline(entry.action as string,checkpoints,milliseconds,dropped)??timeline(checkpoints,milliseconds);
    const reference = (value: unknown) => { const raw=object(value); return Number.isSafeInteger(raw.session)&&Number.isSafeInteger(raw.sequence)&&(raw.session as number)>0&&(raw.sequence as number)>0&&(raw.session as number)<=1e12&&(raw.sequence as number)<=1e12 ? {session:raw.session as number,sequence:raw.sequence as number} : undefined; };
    const ownReference=reference(entry),related=reference(entry.relatedOperation);
    return { ...(ownReference?{operation:ownReference}:{}),...(related?{relatedOperation:related}:{}), action: entry.action, outcome: entry.outcome, milliseconds, stages, ...(checkpoints === undefined ? {} : { checkpoints }),...(observedTimeline===undefined?{}:{timeline:observedTimeline}) };
  });
  return { version: 1, units: 'milliseconds', scope: 'observed operations only; missing phases remain unmeasured',
    timing: 'operation elapsed and inclusive stages; overlapping stages must not be added or subtracted', operations };
}

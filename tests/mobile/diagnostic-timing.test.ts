import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';
import { summarizeDiagnosticTiming } from '../../apps/platform-lab/src/diagnostic-timing.ts';

test('timing report keeps elapsed distinct from nested and failed stages and never copies arbitrary context', () => {
  let now = 0;
  const journal = new DiagnosticJournal(() => now), operation = journal.begin('update-flights');
  const source = operation.span('source-retrieval'); now = 10;
  const wait = operation.span('user-sign-in-wait'); now = 80; wait(true); now = 90; source(true);
  const save = operation.span('explicit-save'); now = 100; save(false); operation.finish('partial');
  const input = { ...JSON.parse(journal.export()), context: { account: 'PRIVATE', token: 'SECRET' } };
  const report = summarizeDiagnosticTiming(input), result = report.operations[0]!;
  assert.equal(result.milliseconds, 100);
  assert.deepEqual(result.stages.map(s => [s.name, s.milliseconds, s.failures]), [['user-sign-in-wait',70,0],['source-retrieval',90,0],['explicit-save',10,1]]);
  assert.ok(!JSON.stringify(report).includes('PRIVATE')); assert.ok(!JSON.stringify(report).includes('SECRET'));
  assert.match(report.timing, /must not be added or subtracted/);
  assert.equal('unattributedMilliseconds' in result, false);
});

test('rejects malformed, unsupported, duplicate, unbounded and unsafe timing fields', () => {
  const entry = { action:'update-flights', outcome:'success', milliseconds:10, stages:[{name:'source-review',calls:1,failures:0,milliseconds:10,maximum:10}] };
  const report = {format:'MoFlight support diagnostics',version:2,entries:[entry]};
  for (const invalid of [null, {...report,version:3}, {...report,entries:Array(601).fill(entry)},
    {...report,entries:[{...entry,action:'private text'}]}, {...report,entries:[{...entry,stages:[...entry.stages,...entry.stages]}]}]) assert.throws(()=>summarizeDiagnosticTiming(invalid));
  for (const milliseconds of [-1, Infinity, NaN, '10',86_400_001]) assert.throws(()=>summarizeDiagnosticTiming({...report,entries:[{...entry,milliseconds}]}));
  for (const stage of [{...entry.stages[0],calls:0},{...entry.stages[0],failures:2},{...entry.stages[0],maximum:11},{...entry.stages[0],name:'private value'}]) assert.throws(()=>summarizeDiagnosticTiming({...report,entries:[{...entry,stages:[stage]}]}));
  assert.deepEqual(summarizeDiagnosticTiming({...report,entries:[]}).operations, []);
});

test('bounded span correlation survives timing projection without arbitrary checkpoint fields',()=>{
 const journal=new DiagnosticJournal(()=>0),op=journal.begin('update-flights'),outer=op.span('graph-validation'),inner=outer.span('graph-validation');inner(true);outer(true);op.finish('success');
 const raw=JSON.parse(journal.export());raw.entries[0].checkpoints[0].source='private@example.test';
 const result=summarizeDiagnosticTiming(raw).operations[0]!;
 assert.deepEqual(result.checkpoints?.map(point=>[point.spanId,point.parentSpanId]),[[1,undefined],[2,1],[2,1],[1,undefined]]);
 assert.ok(!JSON.stringify(result).includes('private@example.test'));
 for(const patch of [{spanId:'secret'},{spanId:1_000_001},{spanId:2,parentSpanId:2},{spanId:2,parentSpanId:-1},{offset:Infinity}]){
  const invalid=JSON.parse(JSON.stringify(raw));Object.assign(invalid.entries[0].checkpoints[0],patch);assert.throws(()=>summarizeDiagnosticTiming(invalid));
 }
 const legacy=JSON.parse(JSON.stringify(raw));delete legacy.entries[0].checkpoints;
 assert.equal(summarizeDiagnosticTiming(legacy).operations[0]!.checkpoints,undefined);
});

test('real journal top stages reconcile active time, sign-in waiting and explicit gaps',()=>{
 let now=0;const journal=new DiagnosticJournal(()=>now),op=journal.begin('update-flights');
 now=10;const prep=op.span('sync-prepare');now=30;prep(true);
 now=40;const account=op.span('sync-account');now=50;const wait=account.span('user-sign-in-wait');now=70;wait(true);now=80;account(true);
 now=90;const save=op.span('sync-save');const nested=save.span('graph-validation');now=100;nested(true);save(true);now=110;op.finish('success');
 const result=summarizeDiagnosticTiming(JSON.parse(journal.export())).operations[0]!,timeline=result.timeline!;
 assert.equal(timeline.complete,true);assert.equal(timeline.incompleteSpans,0);
 assert.deepEqual([timeline.activeMilliseconds,timeline.waitingMilliseconds,timeline.unattributedMilliseconds],[50,20,40]);
 assert.deepEqual(timeline.gaps,[{start:0,end:10},{start:30,end:40},{start:80,end:90},{start:100,end:110}]);
 assert.equal(timeline.activeMilliseconds+timeline.waitingMilliseconds+timeline.unattributedMilliseconds,result.milliseconds);
});

function projectedTimeline(checkpoints:unknown[],outcome='success',milliseconds=100){
 return summarizeDiagnosticTiming({format:'MoFlight support diagnostics',version:2,entries:[{action:'update-flights',outcome,milliseconds,stages:[],checkpoints}]}).operations[0]!.timeline!;
}
const point=(name:string,state:string,offset:number,spanId:number)=>({name,state,offset,spanId});

test('overlapping stages and duplicate nested sign-in timers are unioned instead of double counted',()=>{
 const timeline=projectedTimeline([
  point('sync-account','start',0,1),point('sync-review','start',20,2),
  point('sync-sign-in','start',30,3),point('user-sign-in-wait','start',35,4),
  point('user-sign-in-wait','success',45,4),point('sync-sign-in','success',50,3),
  point('sync-account','success',60,1),point('sync-review','success',80,2),
 ]);
 assert.equal(timeline.complete,false);assert.equal(timeline.overlapMilliseconds,60);
 assert.deepEqual([timeline.activeMilliseconds,timeline.waitingMilliseconds,timeline.unattributedMilliseconds],[60,20,20]);
 assert.deepEqual(timeline.waitingIntervals,[{start:30,end:50}]);
 assert.deepEqual(timeline.activeIntervals,[{start:0,end:30},{start:50,end:80}]);
});

test('truncated or cancelled spans remain incomplete and their unseen boundaries are not synthesized',()=>{
 const truncated=projectedTimeline([point('sync-prepare','success',30,1),point('sync-save','start',50,2),point('sync-save','success',80,2)]);
 assert.equal(truncated.complete,false);assert.equal(truncated.incompleteSpans,1);
 assert.deepEqual([truncated.activeMilliseconds,truncated.unattributedMilliseconds],[30,70]);
 assert.deepEqual(truncated.gaps,[{start:0,end:50},{start:80,end:100}]);
 const cancelled=projectedTimeline([point('sync-account','start',10,1),point('user-sign-in-wait','start',20,2)],'cancelled');
 assert.equal(cancelled.complete,false);assert.equal(cancelled.incompleteSpans,2);
 assert.deepEqual([cancelled.activeMilliseconds,cancelled.waitingMilliseconds,cancelled.unattributedMilliseconds],[0,0,100]);
 const unclosedWait=projectedTimeline([point('sync-account','start',0,1),point('user-sign-in-wait','start',20,2),point('sync-account','success',80,1)],'partial');
 assert.deepEqual([unclosedWait.activeMilliseconds,unclosedWait.waitingMilliseconds,unclosedWait.unattributedMilliseconds],[20,0,80]);
});

test('legacy, oversized and inconsistent timelines cannot invent observed coverage',()=>{
 const legacy=projectedTimeline([{name:'sync-save',state:'start',offset:10},{name:'sync-save',state:'success',offset:80}]);
 assert.equal(legacy.complete,false);assert.equal(legacy.unattributedMilliseconds,100);
 const beyond=projectedTimeline([point('sync-save','start',20,1),point('sync-save','success',101,1)]);
 assert.equal(beyond.complete,false);assert.equal(beyond.activeMilliseconds,0);assert.equal(beyond.unattributedMilliseconds,100);
 assert.throws(()=>projectedTimeline(Array(129).fill(point('sync-save','start',0,1))));
 const noSync=summarizeDiagnosticTiming({format:'MoFlight support diagnostics',version:2,entries:[{action:'read-flights',outcome:'success',milliseconds:10,stages:[]}]}).operations[0]!;
 assert.equal('timeline'in noSync,false);
});

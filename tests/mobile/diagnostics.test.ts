import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal, diagnosticStages, DIAGNOSTIC_FILE_BYTES, DIAGNOSTIC_STORAGE_BYTES, DIAGNOSTIC_RETENTION_MS, DIAGNOSTIC_CHECKPOINT_LIMIT, utf8Bytes } from '../../apps/platform-lab/src/diagnostics';

const wall=2_000_000_000_000;

test('task failure reasons survive support export as fixed vocabulary only', async () => {
 const {taskFailureDiagnosticEvents}=await import('../../apps/platform-lab/src/diagnostic-vocabulary.ts');
 const journal=new DiagnosticJournal(()=>1000,()=>wall);
 for(const event of taskFailureDiagnosticEvents) journal.record('provider',event);
 journal.record('provider','private task title' as any);
 const events=JSON.parse(journal.export()).events;
 assert.deepEqual(events.map((event:any)=>event.target),[...taskFailureDiagnosticEvents]);
 assert.ok(!journal.export().includes('private task title'));
});

test('sync causes, native/provider lifecycle and source stages survive file persistence without private text',async()=>{
 const f=fixture();f.journal.connect(f.storage);const op=f.journal.begin('update-flights');
 op.note('library','ready');op.note('view','pending');op.note('restore','ready');
 for(const target of ['sync-requested','sync-prepare','sync-block-save','sync-previous-save-superseded','provider-previous-view-retained','sync-popup-hidden','sync-work-hours','sync-partial'] as const)f.journal.record('sync',target);
 f.journal.record('provider','provider-information-unexpected-document');
 f.journal.record('provider','provider-verification-superseded');
 const span=op.span('work-hours');f.now(500);span(false);op.finish('partial','events-failed');await f.journal.flush();
 const reopened=new DiagnosticJournal(()=>1000,()=>wall);reopened.connect({read:f.saved,write:()=>{}});
 const report=JSON.parse(reopened.export());assert.equal(report.entries[0].observedState.view,'pending');
 assert.equal(report.entries[0].stages[0].name,'work-hours');assert.ok(report.events.some((e:any)=>e.target==='sync-previous-save-superseded'));
 assert.equal(report.entries[0].code,'events-failed');assert.ok(report.events.some((e:any)=>e.target==='provider-information-unexpected-document'));
 assert.ok(report.events.some((e:any)=>e.target==='provider-verification-superseded'));
 assert.deepEqual(report.diagnosticStorage,{connected:true,failed:false});
 f.journal.record('sync','password=private-secret' as never);assert.ok(!f.journal.export().includes('private-secret'));
});
function fixture() { let now=0, date=wall, saved:string|null=null; const journal=new DiagnosticJournal(()=>now,()=>date); const storage={read:()=>saved,write:(text:string)=>{saved=text;}}; return {journal,storage,now:(v:number)=>{now=v;},date:(v:number)=>{date=v;},saved:()=>saved}; }

test('retains hundreds of operations rather than five, with detached timing and phase maxima',()=>{
 const f=fixture(),j=f.journal,first=j.begin('update-flights'),stage=first.span('source-retrieval');f.now(125);stage(false);stage(true);first.finish('failed','source-failed');first.finish('success');
 const entry=j.snapshot()[0]!;assert.equal(entry.milliseconds,125);assert.deepEqual(entry.stages,[{name:'source-retrieval',calls:1,failures:1,milliseconds:125,maximum:125}]);entry.stages[0]!.calls=999;
 for(let i=0;i<650;i++){j.begin('read-flights').finish('success');}
 assert.equal(j.snapshot().length,600);assert.equal(j.failureSnapshot()[0]!.operation.stages[0]!.calls,1);assert.equal(j.failureSnapshot()[0]!.operation.code,'source-failed');
});

test('action history is independent of technical floods, failures retain preceding semantic context',()=>{
 const j=fixture().journal;j.record('screen','home');j.record('action','update-flights');j.begin('update-flights').finish('blocked','account-mismatch');
 for(let i=0;i<1500;i++)j.begin('read-flights').finish('success');
 assert.deepEqual(j.journey().map(e=>e.target),['home','update-flights']);assert.equal(j.failureSnapshot()[0]!.operation.code,'account-mismatch');assert.deepEqual(j.failureSnapshot()[0]!.preceding.map(e=>e.target),['home','update-flights']);
});

test('hard UTF-8 byte bounds hold under mixed floods; short export and separately retained failures stay bounded',async()=>{
 const f=fixture(),j=f.journal;j.connect(f.storage);
 for(let i=0;i<3500;i++){f.now(i*1000);j.record('screen',i%2?'flights':'home');}
 for(let i=0;i<700;i++){const op=j.begin('update-flights');for(const name of diagnosticStages.slice(0,12))op.span(name)(false,{sql:{calls:99,milliseconds:1234,failures:3}});op.finish('failed','operation-failed');}
 await j.flush();assert.ok(j.snapshot().length<=600);assert.ok(j.journey().length<=2000);assert.ok(j.failureSnapshot().length<=5);
 assert.ok(utf8Bytes(f.saved()!)<=DIAGNOSTIC_FILE_BYTES);assert.ok(utf8Bytes(j.export())<=DIAGNOSTIC_FILE_BYTES);assert.ok(utf8Bytes(f.saved()!)+utf8Bytes(j.export())<=DIAGNOSTIC_STORAGE_BYTES);assert.ok(utf8Bytes(j.shortReport())<=32_000);
 assert.equal(utf8Bytes('ä→🛩'),Buffer.byteLength('ä→🛩'));
});

test('unknown/private fields and context values cannot enter any exported stream',()=>{
 const secret='secret@example.test D-PRIVATE token-secret',f=fixture(),j=f.journal;
 const raw={version:2,context:{account:secret},entries:[{sequence:1,session:1,action:'update-flights',outcome:'failed',code:secret,milliseconds:12,retainedAt:wall,private:secret,stages:[{name:secret},{name:'source-review',calls:2,error:secret,counters:{sql:{calls:2,sql:secret},url:secret}}]}],events:[{sequence:2,session:1,offset:2,kind:'filter',target:'search',value:secret,retainedAt:wall},{kind:'screen',target:secret,retainedAt:wall}],failures:[]};
 j.connect({read:()=>JSON.stringify(raw),write:()=>{}});j.setContext({appVersion:secret,webViewVersion:'143.0.1',androidApi:37,owner:secret});j.record('screen',secret as never);j.record(secret as never,'home');j.span(secret)(false);j.span('provider-'+secret)(false);
 assert.ok(!j.export().includes(secret));assert.ok(!j.shortReport().includes(secret));assert.ok(!j.export().includes('retainedAt'));assert.ok(!j.export().includes(String(wall)));assert.equal(j.snapshot()[0]!.code,'none');assert.equal(j.journey().filter(e=>e.kind==='filter').length,1);assert.throws(()=>j.begin(secret as never));
});

test('legacy history migrates, unfinished active phases survive restart and sessions/order remain distinct',async()=>{
 const f=fixture();let saved=JSON.stringify({version:1,entries:[{sequence:1,action:'read-flights',outcome:'success',stages:[]}]});
 const storage={read:()=>saved,write:(text:string)=>{saved=text;}};f.journal.connect(storage);const op=f.journal.begin('update-flights');op.span('session-verification');await f.journal.flush();
 const resumed=new DiagnosticJournal(()=>0,()=>wall);resumed.connect(storage);const interrupted=resumed.snapshot().find(e=>e.action==='update-flights')!;
 assert.equal(interrupted.outcome,'interrupted');assert.deepEqual(interrupted.activeStages,['session-verification']);assert.equal(interrupted.checkpoints[0]!.state,'start');assert.ok(resumed.failureSnapshot().some(f=>f.operation.outcome==='interrupted'));
 const previous=resumed.journey().at(-1)!;resumed.begin('read-flight-detail').finish('success');assert.ok(resumed.snapshot().at(-1)!.sequence>previous.sequence);assert.ok(previous.session>interrupted.session);
});

test('14-day expiry prunes all buffers and prevents expired failure revival on restart',async()=>{
 const f=fixture();f.journal.connect(f.storage);f.journal.record('screen','flights');f.journal.begin('update-flights').finish('failed');await f.journal.flush();
 f.date(wall+DIAGNOSTIC_RETENTION_MS+1);assert.deepEqual(f.journal.snapshot(),[]);assert.deepEqual(f.journal.journey(),[]);assert.deepEqual(f.journal.failureSnapshot(),[]);
 const next=new DiagnosticJournal(()=>0,()=>wall+DIAGNOSTIC_RETENTION_MS+1);next.connect(f.storage);assert.deepEqual(next.snapshot(),[]);assert.deepEqual(next.failureSnapshot(),[]);
});

test('span ownership is captured before concurrent actions; clear/eviction prevents resurrection',()=>{
 const f=fixture(),first=f.journal.begin('update-flights'),a=first.span('source-review'),second=f.journal.begin('read-flights'),b=second.span('local-read');f.now(20);a(false);b(true);
 assert.equal(f.journal.snapshot()[0]!.stages[0]!.name,'source-review');assert.equal(f.journal.snapshot()[1]!.stages[0]!.name,'local-read');
 const late=first.span('explicit-save');f.journal.clear();late(true);first.finish('success');second.finish('success');assert.deepEqual(f.journal.snapshot(),[]);assert.deepEqual(f.journal.journey(),[]);assert.deepEqual(f.journal.failureSnapshot(),[]);
});

test('async writes are serialized/coalesced and a clear wins over an outstanding old write',async()=>{
 const f=fixture();let saved='',active=0,maxActive=0;const finish:(()=>void)[]=[];
 f.journal.connect({read:()=>null,write:text=>new Promise<void>(resolve=>{active++;maxActive=Math.max(active,maxActive);finish.push(()=>{saved=text;active--;resolve();});})});
 f.journal.begin('update-flights').finish('failed');f.journal.clear();const flushed=f.journal.flush();
 while(finish.length){finish.shift()!();await new Promise<void>(done=>{setImmediate(done);});}
 await flushed;assert.equal(maxActive,1);const report=JSON.parse(saved);assert.deepEqual(report.entries,[]);assert.deepEqual(report.events,[]);assert.deepEqual(report.failures,[]);
});

test('persistence failures never break application operations and remain observable',async()=>{
 const j=fixture().journal;j.connect({read:()=>'{broken',write:async()=>{throw new Error('No space');}});j.begin('update-flights').finish('blocked','recovery-required');await j.flush();assert.equal(j.storageFailed,true);assert.equal(j.snapshot()[0]!.code,'recovery-required');j.clear();await j.flush();assert.equal(j.storageFailed,true);
});

test('observed transitions support unfamiliar paths without inferring intention or bridging sessions',()=>{
 const f=fixture();f.journal.record('screen','home');f.now(1000);f.journal.record('screen','flights');f.journal.record('filter','year');f.now(2000);f.journal.record('screen','flight-detail');f.journal.record('back','flights');f.now(3000);f.journal.record('screen','flights');
 assert.deepEqual(f.journal.journeySummary().map(p=>p.path),['home → flights','flights → flight-detail','flight-detail → flights']);assert.ok(!f.journal.export().includes('intent'));
});


test('public build context is associated with each process session across an app update',async()=>{
 const f=fixture();f.journal.connect(f.storage);f.journal.setContext({appVersion:'0.1.0',buildSource:'abcdef1234567',androidApi:37});f.journal.record('screen','flights');await f.journal.flush();
 const next=new DiagnosticJournal(()=>0,()=>wall+1000);next.connect(f.storage);next.setContext({appVersion:'0.2.0',buildSource:'fedcba7654321',androidApi:37});
 const report=JSON.parse(next.export());assert.equal(report.sessions.length,2);assert.equal(report.sessions[0].context.appVersion,'0.1.0');assert.equal(report.sessions[1].context.appVersion,'0.2.0');assert.notEqual(report.sessions[0].session,report.sessions[1].session);assert.ok(!next.export().includes('retainedAt'));
});


test('a failed child read before storage initialization keeps its handle and protected context',()=>{
 const f=fixture();f.journal.record('screen','home');const operation=f.journal.begin('read-flights');operation.finish('failed','operation-failed');
 f.journal.connect({read:()=>JSON.stringify({version:1,entries:[{sequence:4,action:'update-flights',outcome:'failed',code:'source-failed',stages:[]}]}),write:()=>{}});
 assert.equal(f.journal.failureSnapshot().length,2);assert.ok(f.journal.failureSnapshot().some(v=>v.operation.action==='read-flights'&&v.preceding.some(e=>e.target==='home')));
});

test('terminal operations remain frozen when late spans, notes and new spans arrive',()=>{
 const f=fixture(),op=f.journal.begin('update-flights');f.now(20);const stage=op.span('source-retrieval');f.now(50);op.finish('cancelled','cancelled');f.now(100);stage(false);
 const frozen=f.journal.snapshot()[0]!;
 op.note('view','ready');op.span('explicit-save')(true);stage(true);
 assert.deepEqual(f.journal.snapshot()[0],frozen);
 assert.equal(frozen.milliseconds,50);assert.equal(frozen.checkpoints.at(-1)!.offset,20);assert.deepEqual(frozen.stages,[]);
});

test('captured starters and nested same-name spans retain operation and parent identity',()=>{
 const f=fixture(),first=f.journal.begin('update-flights'),bound=f.journal.captureSpan();
 const outer=bound('graph-validation');f.now(10);const inner=outer.span('graph-validation');
 const second=f.journal.begin('read-flights');f.now(30);inner(true);f.now(40);outer(true);
 const points=f.journal.snapshot()[0]!.checkpoints;
 assert.deepEqual(points.map(p=>[p.state,p.spanId,p.parentSpanId,p.offset]),[['start',1,undefined,0],['start',2,1,10],['success',2,1,30],['success',1,undefined,40]]);
 assert.equal(f.journal.snapshot()[0]!.stages[0]!.milliseconds,60);
 first.finish('success');const frozen=f.journal.snapshot();bound('source-review')(true);outer.span('graph-read')(true);
 assert.deepEqual(f.journal.snapshot(),frozen);assert.deepEqual(f.journal.snapshot()[1]!.stages,[]);second.finish('success');
});

test('rejected parent stages leave their nested subtree inert instead of emitting a self-reference',()=>{
 const f=fixture(),op=f.journal.begin('update-flights'),unknown=op.span('private@example.test');
 unknown.span('graph-read')(true);unknown(true);op.span('graph-read')(true);op.finish('success');
 assert.deepEqual(f.journal.snapshot()[0]!.checkpoints.map(point=>[point.spanId,point.parentSpanId]),[[1,undefined],[1,undefined]]);
 assert.ok(!f.journal.export().includes('private@example.test'));
});

test('span identities persist within bounds while legacy v2 checkpoints remain readable',async()=>{
 const f=fixture();f.journal.connect(f.storage);const op=f.journal.begin('update-flights'),outer=op.span('repository-open'),child=outer.span('graph-read');child(true);outer(true);op.finish('success');await f.journal.flush();
 const raw=JSON.parse(f.saved()!);raw.entries[0].checkpoints.push({name:'source-review',state:'start',offset:2,spanId:'private@example.test',parentSpanId:Infinity,private:'token-secret'});
 raw.entries[0].checkpoints.push({name:'source-review',state:'success',offset:3});
 const reopened=new DiagnosticJournal(()=>0,()=>wall);reopened.connect({read:()=>JSON.stringify(raw),write:()=>{}});
 const points=reopened.snapshot()[0]!.checkpoints;
 assert.equal(points[1]!.parentSpanId,points[0]!.spanId);assert.equal(points.at(-1)!.spanId,undefined);
 assert.ok(!reopened.export().includes('private@example.test'));assert.ok(!reopened.export().includes('token-secret'));
 const bounded=reopened.begin('update-flights');
 for(let i=0;i<100;i++)bounded.span('queue-wait')(true);
 assert.equal(reopened.snapshot().at(-1)!.checkpoints.length,DIAGNOSTIC_CHECKPOINT_LIMIT);
});

test('complete sync stage windows and nested details fit the bounded checkpoint timeline',()=>{
 const f=fixture(),op=f.journal.begin('update-flights');
 const stages=diagnosticStages.filter(stage=>stage.startsWith('sync-'));
 for(const [index,name]of stages.entries()){
  f.now(index*100);const stage=op.span(name);
  for(let nested=0;nested<20;nested++){const detail=stage.span('graph-read');detail(true);}
  f.now((index+1)*100);stage(true);
 }
 op.finish('success');const entry=f.journal.snapshot()[0]!;
 const windows=entry.checkpoints.filter(point=>point.name.startsWith('sync-'));
 assert.equal(windows.length,stages.length*2);assert.equal(windows[0]!.name,'sync-prepare');
 assert.equal(windows.at(-1)!.offset,entry.milliseconds);
 assert.equal(windows.filter(point=>point.state==='success').reduce((total,point,index)=>total+point.offset-windows[index*2]!.offset,0),entry.milliseconds);
});

test('operation wall time reconciles with nonoverlapping top stages, explicit gaps and nested user wait',()=>{
 const f=fixture(),op=f.journal.begin('update-flights');
 f.now(10);const prepare=op.span('sync-prepare');f.now(30);prepare(true);
 f.now(40);const account=op.span('sync-account');f.now(50);const wait=account.span('user-sign-in-wait');f.now(70);wait(true);f.now(80);account(true);
 f.now(90);const save=op.span('sync-save');f.now(100);save(true);f.now(110);op.finish('success');
 const entry=f.journal.snapshot()[0]!,points=entry.checkpoints;
 const windows=points.filter(point=>point.state==='start').map(start=>{
  const end=points.find(point=>point.spanId===start.spanId&&point.state==='success')!;
  return {name:start.name,start:start.offset,end:end.offset};
 });
 const top=windows.filter(window=>window.name.startsWith('sync-'));
 let cursor=0,gaps=0,covered=0;
 for(const window of top){assert.ok(window.start>=cursor);gaps+=window.start-cursor;covered+=window.end-window.start;cursor=window.end;}
 gaps+=entry.milliseconds-cursor;
 const waiting=windows.filter(window=>window.name==='user-sign-in-wait').reduce((sum,window)=>sum+window.end-window.start,0);
 assert.deepEqual({covered,gaps,waiting,knownActive:covered-waiting},{covered:70,gaps:40,waiting:20,knownActive:50});
 assert.equal(covered+gaps,entry.milliseconds);
});


test('background state resets do not become observed user screen visits; resume records the current screen',()=>{
 const f=fixture();f.journal.record('screen','flight-detail');f.journal.record('lifecycle','background');f.journal.record('screen','flights');
 assert.deepEqual(f.journal.journey().filter(e=>e.kind==='screen').map(e=>e.target),['flight-detail']);f.journal.record('lifecycle','active');
 assert.deepEqual(f.journal.journey().filter(e=>e.kind==='screen').map(e=>e.target),['flight-detail','flights']);assert.deepEqual(f.journal.journeySummary(),[]);
});


test('protected failure context expires by each action age even when the failure itself is newer',()=>{
 const f=fixture();f.journal.record('screen','home');f.date(wall+10*86_400_000);f.journal.begin('update-flights').finish('failed','source-failed');
 f.date(wall+15*86_400_000);const failures=f.journal.failureSnapshot();assert.equal(failures.length,1);assert.deepEqual(failures[0]!.preceding,[]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal, diagnosticStages, DIAGNOSTIC_FILE_BYTES, DIAGNOSTIC_STORAGE_BYTES, DIAGNOSTIC_RETENTION_MS, utf8Bytes } from '../../apps/platform-lab/src/diagnostics';

const wall=2_000_000_000_000;
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

test('late span completion preserves its original operation-relative checkpoint offset',()=>{
 const f=fixture(),op=f.journal.begin('update-flights');f.now(20);const stage=op.span('source-retrieval');f.now(50);op.finish('cancelled','cancelled');f.now(100);stage(false);
 assert.equal(f.journal.snapshot()[0]!.checkpoints.at(-1)!.offset,100);assert.equal(f.journal.snapshot()[0]!.stages[0]!.milliseconds,80);
});


test('background state resets do not become observed user screen visits; resume records the current screen',()=>{
 const f=fixture();f.journal.record('screen','flight-detail');f.journal.record('lifecycle','background');f.journal.record('screen','flights');
 assert.deepEqual(f.journal.journey().filter(e=>e.kind==='screen').map(e=>e.target),['flight-detail']);f.journal.record('lifecycle','active');
 assert.deepEqual(f.journal.journey().filter(e=>e.kind==='screen').map(e=>e.target),['flight-detail','flights']);assert.deepEqual(f.journal.journeySummary(),[]);
});

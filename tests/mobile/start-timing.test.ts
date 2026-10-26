import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal, DIAGNOSTIC_CHECKPOINT_LIMIT } from '../../apps/platform-lab/src/diagnostics.ts';
import { createStartTiming } from '../../apps/platform-lab/src/start-timing.ts';
import { summarizeDiagnosticTiming } from '../../apps/platform-lab/src/diagnostic-timing.ts';

test('Start records JS data, commit proxy and settlement independently and survives storage attachment',async()=>{
  let now=0,text='';const journal=new DiagnosticJournal(()=>now,()=>1000),start=createStartTiming(journal);
  now=10;const initialization=start.initialization();
  journal.connect({read:()=>null,write:value=>{text=value;}});
  now=15;initialization(true);start.shell();now=80;start.data();now=84;start.commit();
  assert.equal(journal.snapshot()[0]?.outcome,'running');
  now=120;start.settled(true);
  const operation=journal.snapshot()[0]!;assert.equal(operation.outcome,'partial');assert.equal(operation.trigger,'automatic');
  const projected=summarizeDiagnosticTiming(JSON.parse(journal.export())).operations[0]!;
  assert.deepEqual(projected.timeline?.milestones?.map(point=>[point.name,point.milliseconds]),[
    ['start-js-to-shell',15],['start-js-to-data',80],['start-js-to-commit',84],['start-js-to-settled',120]]);
  assert.equal(projected.timeline?.complete,true);assert.match(projected.timeline!.scope,/native launch\/presentation unmeasured/);
  await journal.flush();const reopened=new DiagnosticJournal(()=>0,()=>1000);
  reopened.connect({read:()=>text,write:()=>{}});assert.equal(reopened.snapshot()[0]?.outcome,'partial');await reopened.flush();
});

test('empty and interrupted Start do not claim that saved values were rendered',()=>{
  for(const mode of ['empty','cancel'] as const){
    let now=0;const journal=new DiagnosticJournal(()=>now),start=createStartTiming(journal);
    start.shell();now=20;if(mode==='empty')start.noData();else start.cancel();
    start.data();start.commit();start.settled(false);
    const entry=journal.snapshot()[0]!;assert.equal(entry.outcome,mode==='empty'?'success':'cancelled');
    const timeline=summarizeDiagnosticTiming(JSON.parse(journal.export())).operations[0]!.timeline!;
    assert.equal(timeline.complete,false);assert.equal(timeline.milestones?.find(point=>point.name==='start-js-to-commit')?.observed,false);
  }
});

test('Start preparation timeline reconciles disjoint steps with gaps and detects missing endpoints',()=>{
  let now=0;const journal=new DiagnosticJournal(()=>now),operation=journal.begin('read-flights');
  const open=operation.span('local-session-open');now=10;open(true);now=15;
  const read=operation.span('local-stored-view');now=50;read(true);now=55;operation.finish('success');
  const timeline=summarizeDiagnosticTiming(JSON.parse(journal.export())).operations[0]!.timeline!;
  assert.equal(timeline.complete,true);assert.equal(timeline.activeMilliseconds,45);assert.equal(timeline.unattributedMilliseconds,10);
  assert.equal(timeline.activeMilliseconds!+timeline.unattributedMilliseconds!,55);
  const partial=journal.begin('read-flights');partial.span('local-stored-view');now=60;partial.finish('cancelled');
  assert.equal(summarizeDiagnosticTiming(JSON.parse(journal.export())).operations[1]!.timeline?.complete,false);
});

test('bounded checkpoint retention protects Start endpoints and truthfully reports dropped details after reload',async()=>{
  let now=0,text='';const journal=new DiagnosticJournal(()=>now,()=>1000),start=createStartTiming(journal);
  journal.connect({read:()=>null,write:value=>{text=value;}});
  for(let index=0;index<100;index++){const detail=journal.span('graph-read');now++;detail(true);}
  start.shell();start.data();start.commit();start.settled(false);await journal.flush();
  const entry=journal.snapshot()[0]!;assert.equal(entry.checkpoints.length,DIAGNOSTIC_CHECKPOINT_LIMIT);assert.ok(entry.droppedCheckpoints!>0);
  const reopened=new DiagnosticJournal(()=>now,()=>1000);reopened.connect({read:()=>text,write:()=>{}});
  const timeline=summarizeDiagnosticTiming(JSON.parse(reopened.export())).operations[0]!.timeline!;
  assert.equal(timeline.complete,false);assert.ok(timeline.droppedCheckpoints!>0);assert.equal(timeline.milestones?.length,4);
  assert.ok(timeline.milestones?.every(point=>point.observed));await reopened.flush();
});


test('numeric Start/read/render correlation survives attachment to a journal with previous sessions',async()=>{
  let text='';const previous=new DiagnosticJournal(()=>0,()=>1000);
  previous.connect({read:()=>null,write:value=>{text=value;}});previous.begin('read-flights').finish('success');await previous.flush();
  const journal=new DiagnosticJournal(()=>0,()=>1000),start=createStartTiming(journal);
  const read=journal.begin('read-flights',start.reference());
  const render=journal.begin('start-presentation',read.reference());
  journal.connect({read:()=>text,write:()=>{}});
  render.finish('success');read.finish('success');start.shell();start.data();start.commit();start.settled(false);
  const entries=journal.snapshot(),startup=entries.find(entry=>entry.action==='start-screen')!;
  const data=entries.filter(entry=>entry.action==='read-flights').at(-1)!;
  assert.deepEqual(data.relatedOperation,{session:startup.session,sequence:startup.sequence});
  assert.deepEqual(entries.at(-1)?.relatedOperation,{session:data.session,sequence:data.sequence});
  const result=summarizeDiagnosticTiming(JSON.parse(journal.export()));
  assert.deepEqual(result.operations.at(-1)?.relatedOperation,{session:data.session,sequence:data.sequence});
  await journal.flush();
});

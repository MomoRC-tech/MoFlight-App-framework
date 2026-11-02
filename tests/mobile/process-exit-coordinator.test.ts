import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal } from '../../apps/platform-lab/src/diagnostics';
import { connectProcessExitDiagnostics } from '../../apps/platform-lab/src/mobile/process-exit-coordinator';

const markerA='a'.repeat(32),markerB='b'.repeat(32),markerC='c'.repeat(32);
function memory(){
  let saved:string|null=null;
  const open=()=>{const journal=new DiagnosticJournal();journal.connect({read:()=>saved,write:text=>{saved=text;}});journal.setContext({platform:'android',androidApi:37});return journal;};
  return {open};
}
test('coordinator registers once and maps a native observation only to the prior diagnostic session',async()=>{
  const file=memory(),first=file.open();
  const a=connectProcessExitDiagnostics(first,{processExitAsync:async previous=>{assert.equal(previous,null);return {category:'unknown',registered:true};}},()=>markerA)!;
  await a.idle();a.dispose();await first.flush();
  const second=file.open(),calls:(string|null)[]=[];
  const b=connectProcessExitDiagnostics(second,{processExitAsync:async previous=>{calls.push(previous);return {category:'crash',registered:true,private:'never export'};}},()=>markerB)!;
  await b.idle();second.begin('read-flights').finish('success');await b.idle();
  assert.deepEqual(calls,[markerA],'ordinary operation events do not call the system history API');
  const report=JSON.parse(second.export());assert.equal(report.sessions.find((s:any)=>s.session===1).context.processExitReason,'crash');
  assert.equal(report.context.processExitReason,undefined);assert.ok(!second.export().includes(markerA));assert.ok(!second.export().includes('never export'));
  b.dispose();await second.flush();
});
test('clear serializes native marker rotation and rejects an old delayed observation',async()=>{
  const journal=memory().open(),calls:string[]=[];
  let release!:(value:unknown)=>void;
  let started!:()=>void;
  const inFlight=new Promise<void>(resolve=>{started=resolve;});
  const c=connectProcessExitDiagnostics(journal,{processExitAsync:async(_previous,current)=>{calls.push(current);if(calls.length===1)return new Promise(resolve=>{release=resolve;started();});return {category:'unknown',registered:true};}},()=>calls.length?markerC:markerA)!;
  await inFlight;journal.clear();assert.equal(calls.length,1,'clear queues behind the in-flight native update');
  release({category:'crash',registered:true});await c.idle();
  assert.deepEqual(calls,[markerA,markerC]);assert.equal(journal.processExitState().previousMarker,null);assert.equal(journal.failureSnapshot().length,0);
  assert.ok(!journal.export().includes('crash'));c.dispose();await journal.flush();
});
test('missing module and rejected native call preserve ordinary diagnostics and interruption fallback',async()=>{
  const journal=memory().open();assert.equal(connectProcessExitDiagnostics(journal,null,()=>{throw Error('must not run');}),undefined);
  const c=connectProcessExitDiagnostics(journal,{processExitAsync:async()=>{throw Error('private native error');}},()=>markerA)!;
  await c.idle();journal.begin('read-flights').finish('success');assert.equal(journal.snapshot().length,1);assert.equal(journal.processExitState().previousMarker,null);
  assert.ok(!journal.export().includes('private native error'));c.dispose();await journal.flush();
});

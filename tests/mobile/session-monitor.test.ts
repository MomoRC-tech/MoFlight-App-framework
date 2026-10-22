import test from 'node:test';
import assert from 'node:assert/strict';
import { startSessionMonitor } from '../../apps/platform-lab/src/mobile/session-monitor.ts';

test('session monitor checks once per foreground minute, resumes once and cancels delayed admission',async()=>{
  let changed!:(active:boolean)=>void, timer:(()=>void)|undefined, gate!:(()=>boolean), checks=0, removed=false;
  const pending:(()=>void)[]=[];
  const stop=startSessionMonitor({active:true,subscribe:fn=>{changed=fn;return()=>{removed=true;};},
    schedule:(fn,ms)=>{assert.equal(ms,60_000);timer=fn;return()=>{timer=undefined;};},
    check:async current=>{checks++;gate=current;await new Promise<void>(resolve=>{pending.push(resolve);});},
  });
  assert.equal(checks,1);changed(true);assert.equal(checks,1);
  pending.shift()!();await Promise.resolve();await Promise.resolve();assert.ok(timer);
  const tick=timer!;timer=undefined;tick();assert.equal(checks,2);changed(false);assert.equal(gate(),false);
  pending.shift()!();await Promise.resolve();await Promise.resolve();assert.equal(timer,undefined);
  changed(true);assert.equal(checks,3);stop();assert.equal(gate(),false);assert.equal(removed,true);
  pending.shift()!();await Promise.resolve();await Promise.resolve();assert.equal(timer,undefined);
});

test('a background start performs no work until foreground admission',()=>{
  let changed!:(active:boolean)=>void, checks=0;
  const stop=startSessionMonitor({active:false,subscribe:fn=>{changed=fn;return()=>{};},
    schedule:()=>()=>{},check:async()=>{checks++;}});
  assert.equal(checks,0);changed(false);assert.equal(checks,0);changed(true);assert.equal(checks,1);stop();
});

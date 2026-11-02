import test from 'node:test';
import assert from 'node:assert/strict';
import {trendGeometry} from '../../apps/platform-lab/src/mobile/chart-geometry';

test('missing, future and uncertain observations cannot be bridged by a curve or area',()=>{
 const g=trendGeometry([0,80,10,null,55,0],[false,false,false,false,true],320,180,[0,80]);
 assert.deepEqual(g.segments.map(s=>s.points.map(p=>p.index)),[[0,1,2],[4],[5]]);
 assert.equal(g.points[0]!.value,0,'known zero is retained');
 assert.equal(g.points.some(p=>p.index===3),false);
 assert.equal(trendGeometry([null,null],[],320,180,[0,1]).segments.length,0);
});

test('smoothing stays between observations, including signed amounts and sharp reversals',()=>{
 const g=trendGeometry([-10,0,90,2],[],320,180,[-10,90]);
 for(const segment of g.segments){
  const cubics=[...segment.line.matchAll(/C ([^C]+)/g)].map(match=>match[1]!.trim().split(/[,\s]+/).map(Number));
  cubics.forEach((c,i)=>{
   const a=segment.points[i]!,b=segment.points[i+1]!;
   assert.ok(c[0]!>=a.x&&c[2]!<=b.x,'control x remains within the observed interval');
   for(const t of [.1,.25,.5,.75,.9]){
    const y=(1-t)**3*a.y+3*(1-t)**2*t*c[1]!+3*(1-t)*t*t*c[3]!+t**3*c[5]!;
    assert.ok(y>=Math.min(a.y,b.y)-1e-9&&y<=Math.max(a.y,b.y)+1e-9);
   }
  });
 }
 assert.ok(g.y(0)>12&&g.y(0)<168,'signed area has an interior zero baseline');
 assert.doesNotMatch(g.segments[0]!.line,/NaN|Infinity/);
});

test('isolated known zero and nonfinite observations keep distinct geometry',()=>{
 const g=trendGeometry([null,0,Number.NaN,10],[],300,150,[0,10]);
 assert.deepEqual(g.segments.map(s=>s.points.map(p=>p.value)),[[0],[10]]);
 assert.doesNotMatch(JSON.stringify(g),/NaN|Infinity/);
});

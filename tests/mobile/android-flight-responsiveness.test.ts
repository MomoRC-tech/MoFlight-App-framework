import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { nodeDriver } from './sqlite-driver';
import { responsivenessSource, runFlightResponsiveness } from '../../apps/platform-lab/src/development/android-flight-responsiveness';

test('responsiveness fixture has 101 unique flights across two pages and 47 synthetic fields',()=>{
  const source=responsivenessSource('fixture');
  assert.equal(source.capture.rows.length,101);
  assert.equal(new Set(source.capture.rows.map(row=>row.sourceFlightId)).size,101);
  assert.equal(source.capture.exportContext?.pageCount,2);
  assert.equal(source.capture.headers.length,47);
  assert.ok(source.capture.rows.every(row=>row.values.length===47));
  assert.equal(responsivenessSource('empty',0).capture.exportContext?.recordCount,0);
});

test('responsiveness probe measures production selection/service stages and reopens its persisted graph',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'moflight-responsiveness-'));
  const stages:string[]=[];
  const ports={open:async(name:string)=>nodeDriver(join(directory,name)),
    hash:async(text:string)=>createHash('sha256').update(text).digest('hex'),uuid:randomUUID,now:()=>performance.now()};
  const id=randomUUID();
  try {
    const seeded=await runFlightResponsiveness(ports,id,true,stage=>stages.push(stage.name));
    assert.equal(seeded.initialGeneration,6);assert.equal(seeded.finalGeneration,7);
    assert.equal(seeded.initialFlights,101);assert.equal(seeded.finalFlights,101);
    assert.deepEqual(stages,['seed-six-receipts','candidate-open','candidate-snapshot','service-snapshot','service-list','service-stored-view',
      'service-recover','source-review','explicit-save','post-save-snapshot','post-save-list']);
    assert.ok(seeded.stages.every(stage=>stage.milliseconds>=0&&Number.isSafeInteger(stage.hashCalls)));
    assert.ok(seeded.stages.find(stage=>stage.name==='service-snapshot')!.hashCalls>
      seeded.stages.find(stage=>stage.name==='candidate-snapshot')!.hashCalls);
    const reopened=await runFlightResponsiveness(ports,id,false);
    assert.equal(reopened.mode,'reopen');assert.equal(reopened.initialGeneration,7);assert.equal(reopened.finalGeneration,8);
    assert.equal(reopened.finalFlights,101);assert.ok(!reopened.stages.some(stage=>stage.name==='seed-six-receipts'));
  }finally{await rm(directory,{recursive:true,force:true});}
});

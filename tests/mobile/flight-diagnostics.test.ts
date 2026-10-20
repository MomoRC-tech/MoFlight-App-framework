import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightDiagnostics } from '../../apps/platform-lab/src/vereinsflieger/flight-diagnostics';
import { nodeDriver } from './sqlite-driver';

test('diagnostic counters preserve results/errors and keep nested timings inclusive and detached',async()=>{
  let now=0;const metrics=new FlightDiagnostics(()=>now),before=metrics.snapshot();
  const value={privateInput:'never a metric field'};
  assert.equal(await metrics.measure('ownerGuard',()=>metrics.measure('sql',async()=>{now=12;return value;})),value);
  const error=new Error('private error not logged');
  await assert.rejects(metrics.measure('hash',async()=>{now=17;throw error;}),candidate=>candidate===error);
  const difference=metrics.difference(before);
  assert.deepEqual(difference.ownerGuard,{calls:1,milliseconds:12,failures:0});
  assert.deepEqual(difference.sql,{calls:1,milliseconds:12,failures:0});
  assert.deepEqual(difference.hash,{calls:1,milliseconds:5,failures:1});
  assert.ok(!JSON.stringify(difference).includes('private'));
  difference.sql.calls=100;assert.equal(metrics.snapshot().sql.calls,1);
});

test('profiled driver preserves transactions, rollback, parameter binding and close',async()=>{
  const metrics=new FlightDiagnostics(),db=metrics.driver(nodeDriver(':memory:'));
  try {
    await db.exec('CREATE TABLE example(value TEXT)');
    await db.transaction(async tx=>{await tx.run('INSERT INTO example VALUES (?)','synthetic value');});
    await assert.rejects(db.transaction(async tx=>{await tx.run('INSERT INTO example VALUES (?)','rollback');throw new Error('rollback');}));
    assert.deepEqual(await db.all('SELECT * FROM example'),[{value:'synthetic value'}].map(row=>Object.assign(Object.create(null),row)));
    assert.equal((await db.first<{value:string}>('SELECT value FROM example'))?.value,'synthetic value');
    const report=metrics.snapshot();assert.equal(report.transaction.calls,2);assert.equal(report.transaction.failures,1);
    assert.equal(report.sql.calls,5);assert.ok(!JSON.stringify(report).includes('synthetic value'));
  }finally{await db.close();}
});

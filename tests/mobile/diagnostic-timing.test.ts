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

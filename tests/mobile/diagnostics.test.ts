import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticJournal, diagnosticStages } from '../../apps/platform-lab/src/diagnostics';

test('last five interactions, monotonic timing, bounded phase aggregation and detached snapshots', () => {
  let now = 0; const journal = new DiagnosticJournal(() => now);
  const first = journal.begin('update-flights');
  const span = journal.span('source-retrieval'); now = 125; span(false); span(true);
  first.finish('failed', 'source-failed'); first.finish('success');
  assert.deepEqual(journal.snapshot()[0], { sequence: 1, action: 'update-flights', outcome: 'failed', code: 'source-failed', milliseconds: 125,
    stages: [{ name: 'source-retrieval', calls: 1, failures: 1, milliseconds: 125 }] });
  journal.snapshot()[0]!.stages[0]!.calls = 999;
  for (let i = 0; i < 6; i++) { const operation = journal.begin('read-flights'); now += 10; operation.finish('success'); }
  assert.deepEqual(journal.snapshot().map(entry => entry.sequence), [3, 4, 5, 6, 7]);
  assert.equal(journal.snapshot()[0]!.milliseconds, 10);
});

test('hostile persisted diagnostics are reconstructed without private or unexpected fields', () => {
  const privateValue = 'secret@example.test D-PRIVATE account-123 token-secret';
  const journal = new DiagnosticJournal(); let saved = '';
  journal.connect({ read: () => JSON.stringify({ version: 1, identity: privateValue, entries: [
    { action: privateValue, outcome: 'failed' },
    { action: 'update-flights', outcome: 'failed', code: privateValue, milliseconds: privateValue, error: privateValue,
      stages: [{ name: privateValue }, { name: 'source-review', calls: 2, failures: 1, milliseconds: 12, error: privateValue }] },
  ] }), write: text => { saved = text; } });
  assert.ok(!journal.export().includes(privateValue)); assert.ok(!saved.includes(privateValue));
  assert.equal(journal.snapshot().length, 1); assert.equal(journal.snapshot()[0]!.code, 'none');
  assert.deepEqual(journal.snapshot()[0]!.stages, [{ name: 'source-review', calls: 2, failures: 1, milliseconds: 12 }]);
  assert.throws(() => journal.begin(privateValue as never));
  const operation = journal.begin('update-flights');
  journal.span(privateValue)(false); journal.span(`provider-${privateValue}`)(false);
  operation.finish('failed', privateValue as never);
  assert.ok(!journal.export().includes(privateValue)); assert.equal(journal.snapshot()[1]!.code, 'operation-failed');
});

test('restart preserves completed outcomes and identifies unfinished actions without reusing old clocks', () => {
  let saved: string | null = null, now = 50;
  const storage = { read: () => saved, write: (text: string) => { saved = text; } };
  const first = new DiagnosticJournal(() => now); first.connect(storage);
  first.begin('read-flights').finish('success'); first.begin('update-flights'); now += 25;
  const resumed = new DiagnosticJournal(() => 0); resumed.connect(storage);
  assert.deepEqual(resumed.snapshot().map(entry => [entry.outcome, entry.code]), [['success', 'none'], ['interrupted', 'interrupted']]);
  resumed.begin('read-flight-detail').finish('success');
  assert.equal(resumed.snapshot()[2]!.sequence, 3);
  resumed.clear(); assert.deepEqual(JSON.parse(saved!).entries, []);
});

test('late spans remain with their original action; clearing cannot resurrect entries', () => {
  const journal = new DiagnosticJournal(() => 5);
  const first = journal.begin('update-flights'), span = journal.span('source-review'); first.finish('cancelled', 'background');
  const second = journal.begin('read-flights'); span(false);
  assert.equal(journal.snapshot()[0]!.stages.length, 1); assert.equal(journal.snapshot()[1]!.stages.length, 0);
  const late = journal.span('local-read'); journal.clear(); late(true); second.finish('success');
  assert.deepEqual(journal.snapshot(), []);
});

test('connecting persisted history after child reads start preserves live handles and independent clocks', () => {
  let now=10; const journal=new DiagnosticJournal(()=>now);
  const first=journal.begin('read-flights');now=20;const second=journal.begin('read-flight-detail');
  journal.connect({read:()=>JSON.stringify({version:1,entries:[{action:'update-flights',outcome:'success',stages:[]}]}),write:()=>{}});
  now=40;first.finish('success');second.finish('failed');
  assert.deepEqual(journal.snapshot().map(entry=>[entry.sequence,entry.milliseconds]),[[1,0],[2,30],[3,20]]);
});

test('diagnostics never propagate persistence failures into application operations', () => {
  const journal = new DiagnosticJournal(); journal.connect({ read: () => '{broken', write: () => { throw new Error('No space'); } });
  assert.equal(journal.storageFailed, true);
  assert.doesNotThrow(() => journal.begin('update-flights').finish('blocked', 'recovery-required'));
  assert.equal(journal.snapshot()[0]!.code, 'recovery-required');
  assert.doesNotThrow(() => journal.clear());
  assert.equal(journal.storageFailed, true);
});

test('all phase names remain bounded and aggregate repeated navigation without payloads', () => {
  const journal = new DiagnosticJournal(); const operation = journal.begin('update-flights');
  for (let i = 0; i < 100; i++) for (const name of diagnosticStages) journal.span(name)(true);
  operation.finish('partial', 'medical-failed');
  assert.equal(journal.snapshot()[0]!.stages.length, diagnosticStages.length);
  assert.equal(journal.snapshot()[0]!.stages[0]!.calls, 100);
  assert.ok(journal.export().length < 10000);
});

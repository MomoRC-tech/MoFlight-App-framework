import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectListDurations } from '../../apps/platform-lab/src/vereinsflieger/durations.ts';

function inspect(headers: string[], values: string[]) {
  return inspectListDurations({ headers }, { values, sourceFlightId: '12345' });
}

test('reported list minutes and hh:mm agree, including explicit zero and durations over 24 hours', () => {
  for (const [minutes, formatted, expected] of [['12', '00:12', 12], ['0', '00:00', 0], ['1507', '25:07', 1507], ['6000', '100:00', 6000]] as const) {
    const result = inspect(['Flugzeit', 'Flugzeit in hh:mm'], [minutes, formatted]).flight;
    assert.equal(result.state, 'known'); assert.equal(result.minutes, expected);
    assert.deepEqual(result.evidence.map(value => value.minutes), [expected, expected]);
  }
});

test('not captured, blank and explicit zero stay distinct with exact raw evidence retained', () => {
  const missing = inspect([], []).flight;
  assert.equal(missing.state, 'unknown'); assert.equal(missing.minutes, null);
  assert.deepEqual(missing.evidence.map(value => value.source), [{ state: 'not-captured' }, { state: 'not-captured' }]);
  const blank = inspect(['Flugzeit'], [' \t ']).flight;
  assert.equal(blank.state, 'unknown');
  assert.deepEqual(blank.evidence[0]!.source, { state: 'blank', label: 'Flugzeit', raw: ' \t ' });
  const zero = inspect(['Flugzeit', 'Flugzeit in hh:mm'], [' 0 ', '']).flight;
  assert.equal(zero.state, 'known'); assert.equal(zero.minutes, 0);
  assert.deepEqual(zero.evidence[0]!.source, { state: 'value', label: 'Flugzeit', raw: ' 0 ' });
  assert.equal(zero.evidence[1]!.state, 'blank');
  assert.equal(inspect(['Flugzeit in hh:mm'], [' 00:12 ']).flight.minutes, 12);
});

test('invalid present representations cannot be hidden by a valid counterpart', () => {
  for (const text of ['-1', '+12', '1.5', '1,5', '1e2', '12 min', '00:12', 'NaN', 'Infinity', '9007199254740992']) {
    const result = inspect(['Flugzeit', 'Flugzeit in hh:mm'], [text, '00:12']).flight;
    assert.equal(result.state, 'invalid', text); assert.equal(result.minutes, null);
    assert.equal(result.evidence[0]!.state, 'invalid');
    assert.deepEqual(result.evidence[0]!.source, { state: 'value', label: 'Flugzeit', raw: text });
    assert.equal(result.evidence[1]!.minutes, 12);
  }
  for (const text of ['0:12', '12:60', '12:3', '12:000', '-01:00', '1.5:00', '00:12 h', '00:12:00', '12 : 00', '150119987579016:32']) {
    const result = inspect(['Blockzeit in Minuten', 'Blockzeit in hh:mm'], ['12', text]).block;
    assert.equal(result.state, 'invalid', text); assert.equal(result.minutes, null);
  }
});

test('safe integer boundaries are exact; malformed large inputs never round into a duration', () => {
  assert.equal(inspect(['Flugzeit'], ['9007199254740991']).flight.minutes, Number.MAX_SAFE_INTEGER);
  assert.equal(inspect(['Flugzeit in hh:mm'], ['150119987579016:31']).flight.minutes, Number.MAX_SAFE_INTEGER);
  for (const text of ['9'.repeat(512), '9007199254740992']) assert.equal(inspect(['Flugzeit'], [text]).flight.state, 'invalid');
  assert.equal(inspect(['Flugzeit in hh:mm'], ['9'.repeat(100) + ':00']).flight.state, 'invalid');
});

test('disagreement retains both observations and cannot replace flight time with block time', () => {
  const result = inspect(['Flugzeit', 'Flugzeit in hh:mm', 'Blockzeit in Minuten', 'Blockzeit in hh:mm'], ['12', '00:13', '20', '00:20']);
  assert.equal(result.flight.state, 'conflict'); assert.equal(result.flight.minutes, null);
  assert.deepEqual(result.flight.evidence.map(value => value.minutes), [12, 13]);
  assert.equal(result.block.state, 'known'); assert.equal(result.block.minutes, 20);
  const reversed = inspect(['Flugzeit', 'Blockzeit in Minuten', 'Blockzeit in hh:mm'], ['12', '20', '00:21']);
  assert.equal(reversed.flight.minutes, 12); assert.equal(reversed.block.state, 'conflict');
  const blockOnly = inspect(['Blockzeit in Minuten'], ['20']);
  assert.equal(blockOnly.flight.state, 'unknown'); assert.equal(blockOnly.block.minutes, 20);
});

test('column order and raw clocks, crew and engine text cannot change reported-duration interpretation', () => {
  const headers = ['Start', 'Landung', 'Flugzeit', 'Flugzeit in hh:mm', 'Blockzeit in Minuten', 'Pilot', 'PIC-Time', 'Motorzeit'];
  const values = ['23:55', '00:10', '12', '00:12', '20', 'Synthetic student', 'unclear', '1,5'];
  const row = { sourceFlightId: null, values }, snapshot = { headers };
  const before = structuredClone({ snapshot, row });
  const result = inspectListDurations(snapshot, row);
  assert.equal(result.flight.minutes, 12); // Corrected source minutes, not a guessed overnight interval.
  assert.equal(result.block.minutes, 20);
  assert.deepEqual(inspect([...headers].reverse(), [...values].reverse()), result);
  assert.deepEqual({ snapshot, row }, before);
  result.flight.evidence[0]!.source.state = 'not-captured';
  assert.deepEqual({ snapshot, row }, before);
});

test('ambiguous columns and missing cells cannot silently associate durations', () => {
  assert.throws(() => inspect(['Flugzeit', 'Flugzeit'], ['12', '13']), /Ambiguous/);
  assert.throws(() => inspect(['Flugzeit', 'Blockzeit in Minuten'], ['12']), /Ambiguous/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { canCancelCoreFlightSource, mayReviewCoreFlightCapture, shouldDeferCoreFlightSourceRejection } from '../../apps/platform-lab/src/mobile/core-flight-review-policy';

const base = {
  admission: { nonce: 'retrieval-1', generation: 3, previousCaptureId: 'capture-old' },
  generation: 3,
  foreground: true,
  retrievalPhase: 'idle' as const,
  saving: false,
  restoring: false,
  busy: false,
  recovery: false,
  captureId: 'capture-new',
  handledCaptureId: null,
};

test('only reviews a new capture admitted by the current foreground generation', () => {
  assert.equal(mayReviewCoreFlightCapture(base), true);
  assert.equal(mayReviewCoreFlightCapture({ ...base, generation: 4 }), false);
  assert.equal(mayReviewCoreFlightCapture({ ...base, foreground: false }), false);
});

test('does not review an old, handled, busy, recovering, or unfinished capture', () => {
  assert.equal(mayReviewCoreFlightCapture({ ...base, captureId: 'capture-old' }), false);
  assert.equal(mayReviewCoreFlightCapture({ ...base, handledCaptureId: 'capture-new' }), false);
  assert.equal(mayReviewCoreFlightCapture({ ...base, retrievalPhase: 'loading' }), false);
  assert.equal(mayReviewCoreFlightCapture({ ...base, busy: true }), false);
  assert.equal(mayReviewCoreFlightCapture({ ...base, recovery: true }), false);
});

test('keeps source cancellation disabled while persistence or restoration is finishing', () => {
  assert.equal(canCancelCoreFlightSource('loading', false, false), true);
  assert.equal(canCancelCoreFlightSource('saving', true, false), false);
  assert.equal(canCancelCoreFlightSource('loading', false, true), false);
  assert.equal(shouldDeferCoreFlightSourceRejection('saving', false, false), true);
  assert.equal(shouldDeferCoreFlightSourceRejection('loading', false, true), true);
  assert.equal(shouldDeferCoreFlightSourceRejection('loading', false, false), false);
});

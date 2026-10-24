import assert from 'node:assert/strict';
import test from 'node:test';
import { AI_CHAT_ACCEPTANCE_CASES, type FrozenExpectedOutput } from './fixtures/ai-chat-cases.ts';
import { scoreAiObservation, type AiEvaluationObservation } from '../../pocs/ai-chat-evaluation/score.ts';

function expectedFor(caseId: string): FrozenExpectedOutput {
  for (const frozen of AI_CHAT_ACCEPTANCE_CASES) {
    if (frozen.id === caseId) return frozen.expected;
    const variant = frozen.variants?.find(item => item.id === caseId);
    if (variant) return variant.expected;
  }
  throw new Error(`Missing test fixture ${caseId}`);
}

function fixtureObservation(caseId: string): AiEvaluationObservation {
  const expected = expectedFor(caseId);
  const observation: AiEvaluationObservation = { caseId, status: expected.status,
    supportingFlightRefs: [...(expected.supportingFlightRefs ?? [])] };
  if (expected.metrics) observation.metrics = structuredClone(expected.metrics);
  if (expected.findings) observation.findings = expected.findings.map(({ kind, flightRefs }) => ({ kind, flightRefs: [...flightRefs] }));
  if (expected.detailActionFlightRef) observation.detailActionFlightRef = expected.detailActionFlightRef;
  if (expected.showAllFlightRefs) observation.showAllFlightRefs = [...expected.showAllFlightRefs];
  if (expected.rejectedFlightRefs) observation.rejectedFlightRefs = [...expected.rejectedFlightRefs];
  return observation;
}

test('matching synthetic observations pass structured status, source, metric and anomaly checks', () => {
  for (const caseId of ['ai05-full-august-year-comparison', 'ai06-duplicate-and-conflicting-source-review',
    'injection-and-foreign-flight-reference', 'available-and-completely-covered-empty-history']) {
    const score = scoreAiObservation(fixtureObservation(caseId));
    assert.equal(score.structuredChecksPassed, true, caseId);
    assert.deepEqual(score.invalidReferences, [], caseId);
    assert.equal(score.semanticReview, 'required');
    assert.ok(score.gatesNotCovered.length > 0);
  }
});

test('an altered period total fails the metric check independently', () => {
  const source = fixtureObservation('ai05-full-august-year-comparison');
  const period = source.metrics?.periods?.[0];
  assert.ok(period);
  const altered: AiEvaluationObservation = { ...source, metrics: { ...source.metrics!,
    periods: source.metrics!.periods!.map((item, index) => index === 0 ? { ...item, knownMinutes: item.knownMinutes + 1 } : item) } };

  const score = scoreAiObservation(altered);

  assert.equal(score.checks.metrics, false);
  assert.equal(score.checks.status, true);
  assert.equal(score.checks.supportingFlightRefs, true);
  assert.equal(score.structuredChecksPassed, false);
  assert.ok(score.issues.includes('metric-values-or-references-mismatch'));
});

test('a foreign-owner reference cannot pass as a supplied supporting flight', () => {
  const source = fixtureObservation('ai02-latest-registration-flight');
  const altered = { ...source, supportingFlightRefs: [...source.supportingFlightRefs, 'owner-b/flight-001'] };

  const score = scoreAiObservation(altered);

  assert.equal(score.checks.supportingFlightRefs, false);
  assert.deepEqual(score.invalidReferences, ['owner-b/flight-001']);
  assert.equal(score.structuredChecksPassed, false);
});

test('omitting one frozen anomaly finding fails the finding check', () => {
  const source = fixtureObservation('ai06-duplicate-and-conflicting-source-review');
  const altered: AiEvaluationObservation = { ...source, findings: source.findings!.slice(0, 1) };

  const score = scoreAiObservation(altered);

  assert.equal(score.checks.findings, false);
  assert.equal(score.checks.status, true);
  assert.equal(score.checks.metrics, true);
  assert.equal(score.structuredChecksPassed, false);
});

test('unsupported prose fields and unknown case IDs are rejected instead of text-scored', () => {
  const observation = fixtureObservation('ai02-latest-registration-flight');

  assert.throws(() => scoreAiObservation({ ...observation, answerText: 'The latest flight was yesterday.' }), /Unsupported/);
  assert.throws(() => scoreAiObservation({ ...observation, caseId: 'made-up-case' }), /Unknown frozen/);
});

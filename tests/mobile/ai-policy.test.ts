import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveDispatchPolicy, publicCapabilities } from '../../supabase/functions/ai-relay/policy.ts';
import type { AiPolicy } from '../../packages/ai-contracts/src/index.ts';

const basePolicy: AiPolicy = {
  version: 1,
  id: 'policy-pinned',
  enabled: true,
  model: 'openai/gpt-6-luna',
  reasoning: 'max',
  zdrOnly: true,
  store: false,
  automaticRetries: 0,
  routes: ['azure'],
  features: ['question', 'review', 'progress', 'term'],
  tools: ['describeDataset', 'resolveEntities', 'queryFlights', 'aggregateFlights', 'getFlightEvidence'],
  systemPrompt: 'Pinned synthetic policy prompt.',
  personalCapMicroEur: 800000,
  globalCapMicroEur: 700000,
  questionCapMicroEur: 40000,
  reviewCapMicroEur: 80000,
  inputTokens: 20000,
  outputTokens: 8000,
  questionTurns: 3,
  reviewTurns: 8,
  questionTools: 5,
  reviewTools: 20,
  rowsPerRead: 100,
};

function makePolicy(changes: Partial<AiPolicy> = {}): AiPolicy {
  return {
    ...basePolicy,
    ...changes,
    routes: ['azure'],
    features: changes.features ? [...changes.features] : [...basePolicy.features],
    tools: changes.tools ? [...changes.tools] : [...basePolicy.tools],
  };
}

const numericBounds = [
  'personalCapMicroEur', 'globalCapMicroEur', 'questionCapMicroEur', 'reviewCapMicroEur',
  'inputTokens', 'outputTokens', 'questionTurns', 'reviewTurns', 'questionTools', 'reviewTools', 'rowsPerRead',
] as const;

test('current policy updates retain the pinned prompt and model', () => {
  const pinned = makePolicy();
  const current = makePolicy({ id: 'policy-current', systemPrompt: 'Changed synthetic prompt.' });

  const effective = effectiveDispatchPolicy(pinned, current, true, 'question');

  assert.equal(effective.id, pinned.id);
  assert.equal(effective.systemPrompt, pinned.systemPrompt);
  assert.equal(effective.model, pinned.model);
  assert.equal(effective.reasoning, pinned.reasoning);
});

test('current numeric limits can only lower the pinned limits', () => {
  const pinned = makePolicy();
  const current = makePolicy({
    personalCapMicroEur: 900000,
    globalCapMicroEur: 600000,
    questionCapMicroEur: 30000,
    reviewCapMicroEur: 90000,
    inputTokens: 30000,
    outputTokens: 7000,
    questionTurns: 6,
    reviewTurns: 4,
    questionTools: 10,
    reviewTools: 15,
    rowsPerRead: 150,
  });

  const effective = effectiveDispatchPolicy(pinned, current, true, 'question');

  for (const key of numericBounds) {
    assert.equal(effective[key], Math.min(pinned[key], current[key]), key);
    assert.ok(effective[key] <= pinned[key], `${key} increased above the pinned policy`);
  }
});

test('disabled policy, revoked feature, or revoked tool blocks dispatch', () => {
  const pinned = makePolicy();

  assert.throws(() => effectiveDispatchPolicy(pinned, makePolicy(), false, 'question'), /AI permission unavailable/);
  assert.throws(() => effectiveDispatchPolicy(makePolicy({ enabled: false }), makePolicy(), true, 'question'), /AI permission unavailable/);
  assert.throws(() => effectiveDispatchPolicy(pinned, makePolicy({ enabled: false }), true, 'question'), /AI permission unavailable/);
  assert.throws(() => effectiveDispatchPolicy(pinned, makePolicy({ features: ['review', 'progress', 'term'] }), true, 'question'), /AI permission unavailable/);
  assert.throws(() => effectiveDispatchPolicy(pinned, makePolicy({ tools: pinned.tools.filter(tool => tool !== 'queryFlights') }), true, 'question'), /AI permission unavailable/);
});

test('public capabilities expose only the approved client projection', () => {
  const privatePrompt = 'PRIVATE_PROMPT_SENTINEL';
  const capabilities = publicCapabilities(makePolicy({ systemPrompt: privatePrompt }), true, 1, 1);

  assert.deepEqual(Object.keys(capabilities).sort(), [
    'enabled', 'features', 'inputTokens', 'model', 'outputTokens', 'personalCapMicroEur',
    'policyId', 'reasoning', 'routes', 'rowsPerRead', 'tools', 'version', 'zdrOnly',
  ]);
  for (const forbidden of [
    'systemPrompt', 'billingTag', 'provider', 'globalCapMicroEur', 'settledMicroEur',
    'reservedMicroEur', 'unknownMicroEur', 'remainingMicroEur', 'globalUsage',
  ]) assert.equal(Object.hasOwn(capabilities, forbidden), false, forbidden);
  assert.equal(JSON.stringify(capabilities).includes(privatePrompt), false);
});

test('client, tool, and policy version mismatches are rejected', () => {
  const policy = makePolicy();

  assert.throws(() => publicCapabilities(policy, true, 2, 1), /AI client update required/);
  assert.throws(() => publicCapabilities(policy, true, 1, 2), /AI client update required/);
  assert.throws(() => publicCapabilities({ ...policy, version: 2 }, true, 1, 1), /Incompatible AI contract/);
});

test('malformed and injected policies are rejected without running accessors', () => {
  const pinned = makePolicy();
  const invalidPolicies: unknown[] = [
    { ...makePolicy(), provider: 'attacker-provider' },
    { ...makePolicy(), billingTag: 'attacker-billing-tag' },
    { ...makePolicy(), routes: ['https://attacker.invalid'] },
    { ...makePolicy(), tools: ['fetch'] },
    { ...makePolicy(), features: ['question', 'system'] },
    { ...makePolicy(), features: ['question', 'question'] },
    { ...makePolicy(), systemPrompt: 'x'.repeat(16001) },
    { ...makePolicy(), globalCapMicroEur: 1000001 },
    { ...makePolicy(), inputTokens: 1.5 },
  ];

  for (const invalid of invalidPolicies) {
    assert.throws(() => effectiveDispatchPolicy(pinned, invalid, true, 'question'));
    assert.throws(() => publicCapabilities(invalid, true, 1, 1));
  }

  let getterInvoked = false;
  const accessorPolicy = makePolicy();
  Object.defineProperty(accessorPolicy, 'id', {
    enumerable: true,
    get() {
      getterInvoked = true;
      return 'malicious-policy';
    },
  });
  assert.throws(() => effectiveDispatchPolicy(accessorPolicy, pinned, true, 'question'));
  assert.equal(getterInvoked, false);
});

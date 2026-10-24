import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import type { AiPolicy, AiToolCall } from '../../packages/ai-contracts/src/index.ts';
import { createContinuityCodec, RUN_TTL_MS, type Continuation, type RunClaims } from '../../supabase/functions/ai-relay/continuity.ts';

const now = Date.UTC(2026, 9, 24, 12, 0, 0);
const accountRef = '98765432101234567890';

const policy: AiPolicy = {
  version: 1, id: 'policy-synthetic', enabled: true, model: 'openai/gpt-6-luna', reasoning: 'max', zdrOnly: true,
  store: false, automaticRetries: 0, routes: ['azure'], features: ['question', 'review', 'progress', 'term'],
  tools: ['describeDataset', 'resolveEntities', 'queryFlights', 'aggregateFlights', 'getFlightEvidence'],
  systemPrompt: 'Synthetic continuation test policy.', personalCapMicroEur: 800_000, globalCapMicroEur: 700_000,
  questionCapMicroEur: 40_000, reviewCapMicroEur: 80_000, inputTokens: 20_000, outputTokens: 8_000,
  questionTurns: 3, reviewTurns: 8, questionTools: 5, reviewTools: 20, rowsPerRead: 100,
};

function claims(changes: Partial<RunClaims> = {}): RunClaims {
  return { accountRef, attemptId: 'attempt-synthetic', runId: 'run-synthetic', conversationId: 'conversation-synthetic',
    messageId: 'message-synthetic', feature: 'question', policyId: policy.id, expiresAt: now + 60_000, ...changes };
}

const filter = { from: null, to: null, registrationAlias: null, crewAlias: null, crewSlot: null };
const pendingCall: AiToolCall = { id: 'pending-query', name: 'queryFlights', arguments: { filter, limit: 10, pageToken: null } };

function continuation(changes: Partial<Continuation> = {}): Continuation {
  return { claims: claims(), nextRound: 1, toolCount: 1, policy,
    input: [
      { type: 'message', role: 'user', content: 'SYNTHETIC_PROMPT_SECRET_7K2M' },
      { type: 'reasoning', id: 'reasoning-synthetic', encrypted_content: 'OPAQUE_REASONING_SECRET_8N4Q' },
      { type: 'function_call', call_id: 'call-synthetic', name: 'queryFlights', arguments: '{"limit":10}' },
      { type: 'function_call_output', call_id: 'call-synthetic', output: 'SYNTHETIC_TOOL_OUTPUT_SECRET_3P6R' },
    ], pending: [pendingCall], ...changes };
}

async function aesKey(extractable = false, length = 256, usages: KeyUsage[] = ['encrypt', 'decrypt']): Promise<CryptoKey> {
  return await webcrypto.subtle.generateKey({ name: 'AES-GCM', length }, extractable, usages) as CryptoKey;
}

function codec(key: CryptoKey, clock: () => number = () => now) {
  return createContinuityCodec(key, clock);
}

test('run claims are encrypted and preserve every identity, scope and expiry field', async () => {
  const runClaims = claims({ feature: 'review', expiresAt: now + RUN_TTL_MS });
  const currentCodec = codec(await aesKey());
  const token = await currentCodec.sealRun(runClaims);

  assert.deepEqual(await currentCodec.openRun(token), runClaims);
  assert.equal(token.includes(accountRef), false);
});

test('continuation roundtrip retains every ordered protocol item and hides prompt, input and account strings', async () => {
  const currentCodec = codec(await aesKey());
  const value = continuation();
  const token = await currentCodec.sealContinuation(value);
  const opened = await currentCodec.openContinuation(token);

  assert.deepEqual(opened, value);
  assert.deepEqual(opened.input, value.input);
  for (const secret of [accountRef, 'SYNTHETIC_PROMPT_SECRET_7K2M', 'OPAQUE_REASONING_SECRET_8N4Q', 'SYNTHETIC_TOOL_OUTPUT_SECRET_3P6R']) {
    assert.equal(token.includes(secret), false);
  }
});

test('each encryption uses a fresh nonce', async () => {
  const currentCodec = codec(await aesKey());
  const value = continuation();
  const first = await currentCodec.sealContinuation(value);
  const second = await currentCodec.sealContinuation(value);

  assert.notEqual(first, second);
  assert.notEqual(first.split('.')[1], second.split('.')[1]);
  assert.deepEqual(await currentCodec.openContinuation(first), value);
  assert.deepEqual(await currentCodec.openContinuation(second), value);
});

test('tampering, truncation, wrong keys and run/continuation substitution fail authentication', async () => {
  const currentKey = await aesKey();
  const otherKey = await aesKey();
  const currentCodec = codec(currentKey);
  const runToken = await currentCodec.sealRun(claims());
  const continuationToken = await currentCodec.sealContinuation(continuation());
  const [version, iv, ciphertext] = continuationToken.split('.');
  assert.ok(version && iv && ciphertext);
  const alteredCiphertext = `${version}.${iv}.${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;

  await assert.rejects(currentCodec.openContinuation(alteredCiphertext));
  await assert.rejects(currentCodec.openContinuation(continuationToken.slice(0, -4)));
  await assert.rejects(codec(otherKey).openContinuation(continuationToken));
  await assert.rejects(currentCodec.openRun(continuationToken));
  await assert.rejects(currentCodec.openContinuation(runToken));
});

test('continuity codec rejects exportable, invalid and wrong-algorithm keys', async () => {
  const exportable = await aesKey(true);
  const wrongLength = await aesKey(false, 128);
  const encryptOnly = await aesKey(false, 256, ['encrypt']);
  const hmac = await webcrypto.subtle.generateKey({ name: 'HMAC', hash: 'SHA-256', length: 256 }, false, ['sign', 'verify']) as CryptoKey;

  assert.throws(() => codec(exportable), /key/);
  assert.throws(() => codec(wrongLength), /key/);
  assert.throws(() => codec(encryptOnly), /key/);
  assert.throws(() => codec(hmac), /key/);
  assert.throws(() => createContinuityCodec({} as CryptoKey, () => now), /key/);
});

test('expired and overlong run claims plus invalid continuation bindings and pending calls are rejected', async t => {
  const currentCodec = codec(await aesKey());

  await t.test('expiry must be after now and no more than fifteen minutes ahead', async () => {
    assert.throws(() => currentCodec.sealRun(claims({ expiresAt: now })));
    assert.throws(() => currentCodec.sealRun(claims({ expiresAt: now + RUN_TTL_MS + 1 })));
    const edge = claims({ expiresAt: now + RUN_TTL_MS });
    assert.deepEqual(await currentCodec.openRun(await currentCodec.sealRun(edge)), edge);
  });

  await t.test('continuation policy id must match its run claims', async () => {
    assert.throws(() => currentCodec.sealContinuation(continuation({ claims: claims({ policyId: 'policy-foreign' }) })));
  });

  await t.test('pending tool calls must have unique IDs', async () => {
    assert.throws(() => currentCodec.sealContinuation(continuation({ pending: [pendingCall, pendingCall] })));
  });

  await t.test('pending tool calls must be enabled by the pinned policy', async () => {
    const reducedPolicy = { ...policy, tools: policy.tools.filter(name => name !== 'queryFlights') };
    assert.throws(() => currentCodec.sealContinuation(continuation({ policy: reducedPolicy })));
  });
});

test('plaintext over 180000 bytes is rejected before encryption', async () => {
  const currentCodec = codec(await aesKey());
  const oversized = continuation({ input: ['x'.repeat(180_001)] });
  await assert.rejects(currentCodec.sealContinuation(oversized), /bound/);
});

test('the largest continuation below the plaintext cap encrypts and decrypts without argument overflow', async () => {
  const currentCodec = codec(await aesKey());
  const base = continuation({ input: [] });
  const byteLength = (length: number) => new TextEncoder().encode(JSON.stringify({ ...base, input: ['x'.repeat(length)] })).byteLength;
  let low = 0;
  let high = 180_000;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (byteLength(middle) <= 179_999) low = middle;
    else high = middle - 1;
  }
  const largest = continuation({ input: ['x'.repeat(low)] });
  assert.equal(byteLength(low), 179_999);

  const token = await currentCodec.sealContinuation(largest);

  assert.deepEqual(await currentCodec.openContinuation(token), largest);
});

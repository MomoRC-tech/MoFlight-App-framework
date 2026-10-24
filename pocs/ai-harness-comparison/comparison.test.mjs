// Isolated feasibility evidence, not a production gateway or model-quality test.
import assert from 'node:assert/strict';
import test from 'node:test';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';

// Fail closed on accidental network use, including a library's hidden exporter.
net.Socket.prototype.connect = function () {
  throw new Error('Network disabled: this comparison uses in-memory fetch only');
};
syncBuiltinESMExports();
globalThis.fetch = async () => { throw new Error('Unexpected global fetch'); };
process.env.GENKIT_ENV = 'prod';
process.env.NODE_ENV = 'production';

const { genkit, z } = await import('genkit');
const { openAICompatible } = await import('@genkit-ai/compat-oai');
const { default: OpenAI } = await import('openai');
const { ResponsesToolRunner } = await import('openai/helpers/responses-tool-runner');

const MODEL = 'openai/gpt-6-luna';
const ROUTE = { only: ['azure'], allow_fallbacks: false, require_parameters: true, zdr: true };
const TOOL = { name: 'aggregateFlights', description: 'Read synthetic known flight minutes',
  parameters: { type: 'object', properties: {}, required: [], additionalProperties: false } };
const reasoningItem = { type: 'reasoning', id: 'rs_synthetic', summary: [], encrypted_content: 'synthetic-opaque-state' };
const callItem = { type: 'function_call', id: 'fc_synthetic', call_id: 'call_synthetic',
  name: TOOL.name, arguments: '{}' };

function response(output, extra = {}) {
  return { id: 'resp_synthetic', object: 'response', created_at: 1, status: 'completed',
    model: MODEL, output, usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15,
      output_tokens_details: { reasoning_tokens: 3 }, cost: 0.0000035 }, ...extra };
}

function fakeTransport(replies) {
  const requests = [];
  return { requests, fetch: async (url, options) => {
    assert.equal(new URL(url).origin, 'https://synthetic.invalid');
    assert.equal(new Headers(options.headers).get('authorization'), 'Bearer synthetic-placeholder');
    const body = JSON.parse(options.body);
    requests.push({ path: new URL(url).pathname, body });
    const next = replies[requests.length - 1];
    assert.ok(next, 'Unexpected additional provider dispatch');
    return new Response(JSON.stringify(next.body ?? next), { status: typeof next.status === 'number' ? next.status : 200,
      headers: { 'content-type': 'application/json' } });
  } };
}

function sdk(transport) {
  return new OpenAI({ apiKey: 'synthetic-placeholder', baseURL: 'https://synthetic.invalid/v1',
    maxRetries: 0, fetch: transport.fetch });
}

function genkitClient(transport) {
  return genkit({ plugins: [openAICompatible({ name: 'router', apiKey: 'synthetic-placeholder',
    baseURL: 'https://synthetic.invalid/v1', maxRetries: 0, fetch: transport.fetch })] });
}

function chatReply(tool = false) {
  return { id: 'chat_synthetic', object: 'chat.completion', created: 1, model: MODEL,
    choices: [{ index: 0, finish_reason: tool ? 'tool_calls' : 'stop', message: {
      role: 'assistant', content: tool ? null : 'Synthetic reply',
      ...(tool ? { tool_calls: [{ id: 'call_synthetic', type: 'function',
        function: { name: TOOL.name, arguments: '{}' } }] } : {}) } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
}

test('stock Genkit compatible plugin uses Chat Completions even with explicit Max/tools', async () => {
  const wire = fakeTransport([chatReply()]);
  const ai = genkitClient(wire);
  const tool = ai.defineTool({ name: TOOL.name, description: TOOL.description,
    inputSchema: z.object({}), outputSchema: z.object({ minutes: z.number() }) },
    async () => ({ minutes: 42 }));
  await ai.generate({ model: `router/${MODEL}`, prompt: 'Synthetic total?', tools: [tool],
    config: { reasoning_effort: 'max', provider: ROUTE, maxOutputTokens: 16384, store: false } });
  assert.equal(wire.requests.length, 1);
  const { path, body } = wire.requests[0];
  assert.equal(path, '/v1/chat/completions');
  assert.equal(body.reasoning_effort, 'max');
  assert.deepEqual(body.provider, ROUTE);
  assert.equal(body.tools[0].function.name, TOOL.name);
  // Characterize the stock generic adapter: its generic token setting is omitted.
  assert.equal(body.max_output_tokens, undefined);
  assert.equal(body.max_completion_tokens, undefined);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.store, undefined);
});

test('SDK preserves Responses Max, strict tool schema, route, explicit storage/output controls', async () => {
  const wire = fakeTransport([response([reasoningItem, callItem])]);
  const result = await sdk(wire).responses.create({ model: MODEL, input: 'Synthetic total?',
    reasoning: { effort: 'max' }, store: false, max_output_tokens: 16384,
    provider: ROUTE, tools: [{ type: 'function', ...TOOL, strict: true }] });
  assert.equal(wire.requests[0].path, '/v1/responses');
  assert.deepEqual(wire.requests[0].body.reasoning, { effort: 'max' });
  assert.equal(wire.requests[0].body.store, false);
  assert.equal(wire.requests[0].body.max_output_tokens, 16384);
  assert.deepEqual(wire.requests[0].body.provider, ROUTE);
  assert.equal(wire.requests[0].body.tools[0].strict, true);
  assert.deepEqual(result.output, [reasoningItem, callItem]);
  assert.equal(result.usage.output_tokens_details.reasoning_tokens, 3);
  assert.equal(result.usage.cost, 0.0000035);
});

test('stock Genkit can return tool requests for a local-device round trip without executing them', async () => {
  const wire = fakeTransport([chatReply(true)]);
  const ai = genkitClient(wire);
  let executions = 0;
  const tool = ai.defineTool({ name: TOOL.name, description: TOOL.description,
    inputSchema: z.object({}) }, async () => { executions++; return { minutes: 42 }; });
  const result = await ai.generate({ model: `router/${MODEL}`, prompt: 'Synthetic total?',
    tools: [tool], returnToolRequests: true, config: { reasoning_effort: 'max', max_completion_tokens: 100 } });
  assert.equal(executions, 0);
  assert.equal(result.toolRequests[0].toolRequest.name, TOOL.name);
  assert.equal(wire.requests[0].body.max_completion_tokens, 100);
});

const finalItem = { type: 'message', id: 'msg_synthetic', role: 'assistant', status: 'completed',
  content: [{ type: 'output_text', text: '42 known minutes', annotations: [] }] };
function params() {
  return { model: MODEL, instructions: 'Pinned synthetic system prompt v1; cite supplied evidence.',
    input: [{ role: 'user', content: 'Synthetic total?' }], reasoning: { effort: 'max' },
    provider: structuredClone(ROUTE), store: false, max_output_tokens: 100,
    include: ['reasoning.encrypted_content'] };
}
function runner(execute, allowOutputOverride = false) {
  return new ResponsesToolRunner({ functions: [{ tool: { type: 'function', ...TOOL, strict: true },
    execute, allowOutputOverride }] });
}

test('SDK built-in runner completes a device-tool round trip with stateless opaque reasoning replay', async () => {
  const wire = fakeTransport([response([reasoningItem, callItem]), response([finalItem])]);
  let deviceReads = 0;
  const result = await runner(async () => {
    deviceReads++;
    return JSON.stringify({ knownMinutes: 42, sourceIds: ['synthetic-flight-1'], revision: 'synthetic-r1' });
  }).run(sdk(wire), params(), { maxSteps: 3 });
  assert.equal(deviceReads, 1);
  assert.equal(wire.requests.length, 2);
  for (const request of wire.requests) {
    assert.equal(request.path, '/v1/responses');
    assert.equal(request.body.store, false);
    assert.equal(request.body.previous_response_id, undefined);
    assert.deepEqual(request.body.reasoning, { effort: 'max' });
    assert.deepEqual(request.body.provider, ROUTE);
    assert.equal(request.body.max_output_tokens, 100);
    assert.ok(request.body.include.includes('reasoning.encrypted_content'));
  }
  const input = wire.requests[1].body.input;
  assert.equal(input[1].encrypted_content, reasoningItem.encrypted_content);
  assert.equal(input[2].call_id, callItem.call_id);
  assert.equal(input[3].type, 'function_call_output');
  assert.equal(input[3].call_id, callItem.call_id);
  assert.equal(JSON.parse(input[3].output).knownMinutes, 42);
  assert.equal(result.output[0].content[0].text, '42 known minutes');
});

test('SDK runner iterator accepts externally supplied read results without executing a server-side tool', async () => {
  const wire = fakeTransport([response([callItem]), response([finalItem])]);
  let serverExecutions = 0;
  const run = runner(async () => { serverExecutions++; throw new Error('Use device result instead'); }, true);
  for await (const turn of run.iterate(sdk(wire), params(), { maxSteps: 3 })) {
    if (!turn.final) turn.supplyOutputs([{ type: 'function_call_output', call_id: callItem.call_id,
      output: JSON.stringify({ knownMinutes: 42, sourceIds: ['synthetic-flight-1'] }) }]);
  }
  assert.equal(serverExecutions, 0);
  assert.equal(wire.requests.length, 2);
});

test('SDK runner pins prompt/model while a new global config becomes active between rounds', async () => {
  const wire = fakeTransport([response([callItem]), response([finalItem])]);
  const active = { prompt: 'v1', model: MODEL };
  const pinned = params();
  await runner(async () => {
    active.prompt = 'v2'; active.model = 'synthetic-future-model';
    return JSON.stringify({ knownMinutes: 42 });
  }).run(sdk(wire), pinned, { maxSteps: 3 });
  assert.equal(active.prompt, 'v2');
  for (const request of wire.requests) {
    assert.equal(request.body.instructions, pinned.instructions);
    assert.equal(request.body.model, MODEL);
  }
});

for (const refusal of ['emergency-disabled', 'budget-reservation-refused']) {
  test(`per-dispatch guard stops SDK runner continuation when ${refusal}`, async () => {
    const wire = fakeTransport([response([callItem])]);
    let permitted = true;
    let admissions = 0;
    const guarded = { fetch: async (...args) => {
      admissions++;
      if (!permitted) throw new Error(refusal);
      return wire.fetch(...args);
    } };
    await assert.rejects(() => runner(async () => {
      permitted = false;
      return JSON.stringify({ knownMinutes: 42 });
    }).run(sdk(guarded), params(), { maxSteps: 3 }));
    assert.equal(admissions, 2);
    assert.equal(wire.requests.length, 1);
  });
}

test('SDK runner maxSteps prevents more model requests and new tool execution at its final boundary', async () => {
  const wire = fakeTransport([response([callItem])]);
  let executed = 0;
  await assert.rejects(() => runner(async () => { executed++; return '42'; })
    .run(sdk(wire), params(), { maxSteps: 1 }));
  assert.equal(executed, 0);
  assert.equal(wire.requests.length, 1);
});

for (const library of ['sdk', 'genkit']) {
  test(`${library} makes one dispatch for a 503 when transport retries are disabled`, async () => {
    const wire = fakeTransport([{ status: 503, body: { error: { message: 'Synthetic unavailable' } } }]);
    if (library === 'sdk') await assert.rejects(() => sdk(wire).responses.create(params()));
    else await assert.rejects(() => genkitClient(wire).generate({ model: `router/${MODEL}`, prompt: 'Synthetic' }));
    assert.equal(wire.requests.length, 1);
  });
}

test('Genkit automatic tool loop also permits a per-dispatch emergency guard', async () => {
  const wire = fakeTransport([chatReply(true)]);
  let enabled = true;
  let admissions = 0;
  const ai = genkitClient({ fetch: async (...args) => {
    admissions++;
    if (!enabled) throw new Error('Synthetic emergency disable');
    return wire.fetch(...args);
  } });
  const tool = ai.defineTool({ name: TOOL.name, inputSchema: z.object({}) }, async () => {
    enabled = false;
    return { minutes: 42 };
  });
  await assert.rejects(() => ai.generate({ model: `router/${MODEL}`, prompt: 'Synthetic', tools: [tool] }));
  assert.equal(admissions, 2);
  assert.equal(wire.requests.length, 1);
});

test('SDK runner rejects an undeclared tool instead of executing or continuing', async () => {
  const wire = fakeTransport([response([{ ...callItem, name: 'readForeignAccount' }])]);
  let executions = 0;
  await assert.rejects(() => runner(async () => { executions++; return '42'; })
    .run(sdk(wire), params(), { maxSteps: 3 }));
  assert.equal(executions, 0);
  assert.equal(wire.requests.length, 1);
});

test('SDK runner respects cancellation before making its first request', async () => {
  const wire = fakeTransport([]);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => runner(async () => '42')
    .run(sdk(wire), params(), { maxSteps: 3, signal: controller.signal }));
  assert.equal(wire.requests.length, 0);
});

test('separate SDK relay invocations can continue from serialized phone-owned protocol state', async () => {
  const wire = fakeTransport([response([reasoningItem, callItem]), response([finalItem])]);
  const firstParams = params();
  const first = await sdk(wire).responses.create(firstParams);
  // Active-attempt state only: no reasoning state is added to saved chats/backups.
  const carried = JSON.parse(JSON.stringify([...firstParams.input, ...first.output,
    { type: 'function_call_output', call_id: callItem.call_id, output: '{"knownMinutes":42}' }]));
  const second = await sdk(wire).responses.create({ ...params(), input: carried });
  assert.equal(second.output[0].content[0].text, '42 known minutes');
  assert.equal(wire.requests[1].body.input[1].encrypted_content, reasoningItem.encrypted_content);
  assert.equal(wire.requests[1].body.previous_response_id, undefined);
  assert.equal(wire.requests[1].body.store, false);
});

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { publicCapabilities } from '../../supabase/functions/ai-relay/policy.ts';
import type { AiBudget, AiContext, AiPolicy, AiRequest, AiToolCall, AiToolResult, HistoricalProviderIdentity } from '../../packages/ai-contracts/src/index.ts';
import { AiRunController, type AiRunPorts, type AiRunTools } from '../../apps/platform-lab/src/ai/run-controller.ts';
import { ChatStore } from '../../apps/platform-lab/src/ai/chat-store.ts';
import type { ChatMessage } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { nodeDriver } from './sqlite-driver.ts';

const ownerId = 'owner-a';
const conversationId = 'chat-1';
const at = '2026-10-24T12:00:00.000Z';
const input = 'How many synthetic flights are saved?';

function context(): AiContext {
  return { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '12345', contextVersion: 1,
    flights: { state: 'available', storeId: 'store-a', generation: 1, snapshotRevision: 'snapshot-a' } };
}

function identity(): HistoricalProviderIdentity {
  return { version: 1, localOwnerId: ownerId, provider: 'vereinsflieger', accountRef: '12345', observedAt: at,
    provenance: { kind: 'authenticated-profile', verification: 'observed-profile-number' } };
}

const basePolicy: AiPolicy = {
  version: 1, id: 'policy-synthetic', enabled: true, model: 'openai/gpt-6-luna', reasoning: 'max', zdrOnly: true,
  store: false, automaticRetries: 0, routes: ['azure'], features: ['question', 'review', 'progress', 'term'],
  tools: ['describeDataset', 'resolveEntities', 'queryFlights', 'aggregateFlights', 'getFlightEvidence'],
  systemPrompt: 'Synthetic test policy.', personalCapMicroEur: 800_000, globalCapMicroEur: 700_000,
  questionCapMicroEur: 40_000, reviewCapMicroEur: 80_000, inputTokens: 20_000, outputTokens: 8_000,
  questionTurns: 3, reviewTurns: 8, questionTools: 5, reviewTools: 20, rowsPerRead: 100,
};

function policy(changes: Partial<AiPolicy> = {}): AiPolicy {
  return { ...basePolicy, ...changes,
    routes: ['azure'], features: changes.features ? [...changes.features] : [...basePolicy.features],
    tools: changes.tools ? [...changes.tools] : [...basePolicy.tools] };
}

function capabilities(changes: Partial<AiPolicy> = {}, enabled = true) {
  return publicCapabilities(policy(changes), enabled, 1, 1);
}

function budget(): AiBudget {
  return { period: '2026-10', timezone: 'Europe/Berlin', capMicroEur: 40_000, settledMicroEur: 0,
    reservedMicroEur: 0, unknownMicroEur: 0, remainingMicroEur: 40_000 };
}

function answerEnvelope(request: AiRequest, answer: Record<string, unknown> = {
  text: 'There are no synthetic flights in this answer.', evidenceIds: [], actions: [], metrics: [],
}): unknown {
  return { reply: { version: 1, status: 'answer', receipt: { policyId: 'policy-synthetic', attemptId: request.attemptId,
    runId: request.runId, round: request.round, budget: budget() }, answer }, continuation: null, runCapability: null };
}

function toolsEnvelope(request: AiRequest, calls: AiToolCall[]): unknown {
  return { reply: { version: 1, status: 'needs-tools', receipt: { policyId: 'policy-synthetic', attemptId: request.attemptId,
    runId: request.runId, round: request.round, budget: budget() }, tools: calls },
    continuation: 'opaque-continuation', runCapability: 'A'.repeat(43) };
}

function datasetResult(call: AiToolCall): AiToolResult {
  return { version: 1, callId: call.id, name: call.name,
    coverage: { state: 'empty', requestedFrom: null, requestedTo: null, observedFrom: null, observedTo: null,
      referenceDate: '2026-10-24', timezone: 'Europe/Berlin', totalRows: 0, suppliedRows: 0, omittedRows: 0,
      unknownDateRows: 0, unknownDurationRows: 0, unknownCrewRows: 0, unknownRegistrationRows: 0, conflictingRows: 0 },
    rows: [], sourceRows: [], sourceReview: { state: 'available', totalRows: 0, omittedRows: 0, totalIssues: 0, issues: [] },
    candidates: [], metrics: [], nextPageToken: null };
}

interface ToolOptions {
  assertCurrent?: () => Promise<void>;
  execute?: (call: AiToolCall) => Promise<AiToolResult>;
  metrics?: AiRunTools['metrics'];
  references?: AiRunTools['references'];
  onDispose?: () => void;
}

function makeTools(options: ToolOptions = {}): AiRunTools {
  return { context: context(), references: options.references ?? [], metrics: options.metrics ?? new Map(),
    assertCurrent: options.assertCurrent ?? (async () => {}),
    execute: options.execute ?? (async call => datasetResult(call)), dispose: options.onDispose ?? (() => {}) };
}

type StorePort = Pick<ChatStore, 'archive' | 'appendMessage' | 'updateMessage'>;
interface PortOptions {
  identity?: HistoricalProviderIdentity | null;
  configuration?: unknown;
  policy?: Partial<AiPolicy>;
  enabled?: () => boolean;
  tools?: () => Promise<AiRunTools>;
  transmit: (request: AiRequest, signal: AbortSignal) => Promise<unknown>;
  store?: StorePort;
}

interface SyntheticAnswerEnvelope {
  reply: { receipt: { attemptId: string }; answer: { actions: unknown[]; metrics: unknown[] } };
  continuation: null;
  runCapability: null;
}

function ports(store: ChatStore, options: PortOptions): AiRunPorts {
  let tokenIndex = 0;
  return { store: options.store ?? store,
    identity: async () => options.identity === undefined ? identity() : options.identity,
    configuration: async () => options.configuration ?? capabilities(options.policy),
    tools: options.tools ?? (async () => makeTools()),
    transmit: options.transmit,
    now: () => at, token: () => `generated-${++tokenIndex}`, enabled: options.enabled ?? (() => true), changed: () => {} };
}

async function withStore<T>(run: (store: ChatStore, directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-ai-run-'));
  const store = await ChatStore.open(nodeDriver(join(directory, 'chat.sqlite')), ownerId, async () => {});
  try { return await run(store, directory); }
  finally { await store.close(); await rm(directory, { recursive: true, force: true }); }
}

async function seedDraft(store: ChatStore, saveIdentity = true): Promise<void> {
  if (saveIdentity) await store.saveIdentity(identity());
  await store.saveDraft(conversationId, 'Synthetic question', input, context(), at);
}

function priorAnswer(index: number): ChatMessage {
  return { id: `prior-${index}`, input: `Synthetic question ${index}`, context: context(), status: 'complete',
    answer: { version: 1, text: `Synthetic answer ${index}`, evidence: [], actions: [], metrics: [] }, attempt: null, createdAt: at };
}

function observedStore(store: ChatStore, onAppend: (message: ChatMessage) => Promise<void>): StorePort {
  return { archive: () => store.archive(),
    appendMessage: async (idValue, message, timestamp) => { await store.appendMessage(idValue, message, timestamp); await onAppend(message); },
    updateMessage: (idValue, message, timestamp) => store.updateMessage(idValue, message, timestamp) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

test('explicit send persists the exact input before transmission, stores a direct answer and caps history at eight', async () => {
  await withStore(async store => {
    await seedDraft(store);
    for (let index = 0; index < 10; index++) await store.appendMessage(conversationId, priorAnswer(index), at);
    const beforeTransmit: ChatMessage[] = [];
    let transmitted!: AiRequest;
    const runStore = observedStore(store, async message => {
      const saved = (await store.archive()).conversations[0]?.messages.at(-1);
      assert.equal(saved?.input, input);
      assert.equal(saved?.status, 'pending');
      beforeTransmit.push(saved!);
      assert.equal(message.input, input);
    });
    const controller = new AiRunController(ports(store, { store: runStore, transmit: async request => {
      transmitted = request;
      const saved = (await store.archive()).conversations[0]?.messages.at(-1);
      assert.equal(saved?.input, input);
      assert.equal(saved?.status, 'running');
      beforeTransmit.push(saved!);
      return answerEnvelope(request, { text: 'Ten saved answers were found.', evidenceIds: [], actions: [], metrics: [] });
    } }));

    await controller.send(conversationId, 'question');

    assert.deepEqual(beforeTransmit.map(message => message.status), ['pending', 'running']);
    assert.ok(transmitted.kind === 'start');
    assert.equal(transmitted.text, input);
    assert.deepEqual(transmitted.history.map(item => item.user), Array.from({ length: 8 }, (_, index) => `Synthetic question ${index + 2}`));
    assert.deepEqual(transmitted.history.map(item => item.assistant), Array.from({ length: 8 }, (_, index) => `Synthetic answer ${index + 2}`));
    const saved = (await store.archive()).conversations[0]!;
    const completed = saved.messages.at(-1)!;
    assert.equal(saved.draft, '');
    assert.equal(completed.status, 'complete');
    assert.equal(completed.answer?.text, 'Ten saved answers were found.');
  });
});

test('disabled configuration and missing historical identity preserve the draft without transmitting', async t => {
  await t.test('disabled configuration', async () => withStore(async store => {
    await seedDraft(store);
    let transmissions = 0;
    const controller = new AiRunController(ports(store, { configuration: capabilities({}, false), transmit: async () => { transmissions++; throw new Error('must not transmit'); } }));
    await assert.rejects(controller.send(conversationId, 'question'));
    assert.equal(transmissions, 0);
    assert.equal((await store.archive()).conversations[0]?.draft, input);
    assert.equal((await store.archive()).conversations[0]?.messages.length, 0);
  }));

  await t.test('missing identity', async () => withStore(async store => {
    await seedDraft(store, false);
    let transmissions = 0;
    const controller = new AiRunController(ports(store, { identity: null, transmit: async () => { transmissions++; throw new Error('must not transmit'); } }));
    await assert.rejects(controller.send(conversationId, 'question'));
    assert.equal(transmissions, 0);
    assert.equal((await store.archive()).conversations[0]?.draft, input);
    assert.equal((await store.archive()).conversations[0]?.messages.length, 0);
  }));
});

test('tool continuation uses validated local results and drops start-only fields', async () => {
  await withStore(async store => {
    await seedDraft(store);
    const executed: AiToolCall[] = [];
    const requests: AiRequest[] = [];
    const controller = new AiRunController(ports(store, { policy: { questionTurns: 2, questionTools: 1 },
      tools: async () => makeTools({ execute: async call => { executed.push(call); return datasetResult(call); } }),
      transmit: async request => {
        requests.push(request);
        return request.round === 0 ? toolsEnvelope(request, [{ id: 'describe-call', name: 'describeDataset', arguments: {} }]) :
          answerEnvelope(request, { text: 'The local dataset contains no rows.', evidenceIds: [], actions: [], metrics: [] });
      } }));

    await controller.send(conversationId, 'question');

    assert.equal(executed.length, 1);
    assert.deepEqual(executed[0], { id: 'describe-call', name: 'describeDataset', arguments: {} });
    assert.equal(requests.length, 2);
    const continued = requests[1]!;
    assert.equal(continued.kind, 'continue');
    assert.equal(continued.round, 1);
    assert.equal('text' in continued, false);
    assert.equal('history' in continued, false);
    assert.equal(continued.policyId, 'policy-synthetic');
    assert.equal(continued.continuation, 'opaque-continuation');
    assert.equal(continued.outputs[0]?.callId, 'describe-call');
    assert.deepEqual(JSON.parse(continued.outputs[0]!.payload), datasetResult(executed[0]!));
    assert.equal((await store.archive()).conversations[0]?.messages.at(-1)?.status, 'complete');
  });
});

test('tool responses are type checked and local tool-count and turn limits stop extra calls', async t => {
  await t.test('mismatched tool response is rejected', async () => withStore(async store => {
    await seedDraft(store);
    const controller = new AiRunController(ports(store, { policy: { questionTurns: 2, questionTools: 1 },
      tools: async () => makeTools({ execute: async call => ({ ...datasetResult(call), callId: 'foreign-call' }) }),
      transmit: async request => toolsEnvelope(request, [{ id: 'local-call', name: 'describeDataset', arguments: {} }]) }));
    await assert.rejects(controller.send(conversationId, 'question'));
    assert.equal((await store.archive()).conversations[0]?.messages.at(-1)?.status, 'interrupted');
  }));

  await t.test('tool count cannot exceed local capability', async () => withStore(async store => {
    await seedDraft(store);
    let executed = 0;
    const controller = new AiRunController(ports(store, { policy: { questionTurns: 2, questionTools: 1 },
      tools: async () => makeTools({ execute: async call => { executed++; return datasetResult(call); } }),
      transmit: async request => toolsEnvelope(request, [
        { id: 'call-one', name: 'describeDataset', arguments: {} }, { id: 'call-two', name: 'describeDataset', arguments: {} },
      ]) }));
    await assert.rejects(controller.send(conversationId, 'question'));
    assert.equal(executed, 0);
    assert.equal((await store.archive()).conversations[0]?.messages.at(-1)?.status, 'interrupted');
  }));

  await t.test('turn count cannot exceed local capability', async () => withStore(async store => {
    await seedDraft(store);
    let executed = 0;
    let transmissions = 0;
    const controller = new AiRunController(ports(store, { policy: { questionTurns: 2, questionTools: 2 },
      tools: async () => makeTools({ execute: async call => { executed++; return datasetResult(call); } }),
      transmit: async request => {
        transmissions++;
        return toolsEnvelope(request, [{ id: `call-${request.round}`, name: 'describeDataset', arguments: {} }]);
      } }));
    await assert.rejects(controller.send(conversationId, 'question'));
    assert.equal(transmissions, 2);
    assert.equal(executed, 1);
    assert.equal((await store.archive()).conversations[0]?.messages.at(-1)?.status, 'interrupted');
  }));
});

test('cancellation ignores a late relay answer', async () => {
  await withStore(async store => {
    await seedDraft(store);
    const entered = deferred<void>();
    const lateReply = deferred<unknown>();
    let sentRequest!: AiRequest;
    const controller = new AiRunController(ports(store, { transmit: async request => {
      sentRequest = request;
      entered.resolve();
      return lateReply.promise;
    } }));
    const sending = controller.send(conversationId, 'question');
    const rejected = assert.rejects(sending);
    await entered.promise;
    await controller.cancel();
    lateReply.resolve(answerEnvelope(sentRequest, { text: 'Late answer.', evidenceIds: [], actions: [], metrics: [] }));
    await rejected;
    const saved = (await store.archive()).conversations[0]?.messages.at(-1);
    assert.equal(saved?.status, 'cancelled');
    assert.equal(saved?.answer, null);
  });
});

test('source changes reject a reply received after dispatch', async () => {
  await withStore(async store => {
    await seedDraft(store);
    let sourceChanged = false;
    const controller = new AiRunController(ports(store, { tools: async () => makeTools({ assertCurrent: async () => {
      if (sourceChanged) throw new Error('AI source changed');
    } }), transmit: async request => {
      sourceChanged = true;
      return answerEnvelope(request, { text: 'Must be rejected.', evidenceIds: [], actions: [], metrics: [] });
    } }));
    await assert.rejects(controller.send(conversationId, 'question'), /source changed/);
    const saved = (await store.archive()).conversations[0]?.messages.at(-1);
    assert.equal(saved?.status, 'interrupted');
    assert.equal(saved?.answer, null);
  });
});

test('deleting a conversation during a run prevents a late answer from recreating it', async () => {
  await withStore(async store => {
    await seedDraft(store);
    const controller = new AiRunController(ports(store, { transmit: async request => {
      await store.delete(conversationId);
      return answerEnvelope(request, { text: 'Late answer after deletion.', evidenceIds: [], actions: [], metrics: [] });
    } }));

    await assert.rejects(controller.send(conversationId, 'question'), /gespeichert/);

    assert.deepEqual((await store.archive()).conversations, []);
  });
});

test('cancelling while the initial durable append is pending persists cancellation before returning',async()=>{
  await withStore(async store=>{
    await seedDraft(store);let release!:()=>void,entered!:()=>void;
    const hold=new Promise<void>(resolve=>{release=resolve;}),started=new Promise<void>(resolve=>{entered=resolve;});
    const p=ports(store,{transmit:async()=>{throw new Error('Cancelled before transmission');}});p.store={archive:()=>store.archive(),updateMessage:(...args)=>store.updateMessage(...args),appendMessage:async(...args)=>{entered();await hold;await store.appendMessage(...args);}};
    const controller=new AiRunController(p),running=controller.send(conversationId,'question');
    const rejected=assert.rejects(running,/unterbrochen/);await started;const cancelled=controller.cancel();release();await cancelled;await rejected;
    assert.equal((await store.archive()).conversations[0]!.messages[0]!.status,'cancelled');
  });
});

test('foreign receipt, unissued action and ungranted metric reject a relay answer', async t => {
  const cases: { name: string; mutate: (reply: SyntheticAnswerEnvelope['reply']) => void }[] = [
    { name: 'foreign attempt receipt', mutate: reply => { reply.receipt.attemptId = 'foreign-attempt'; } },
    { name: 'unissued navigation action', mutate: reply => { reply.answer.actions = [{ kind: 'open-flight', referenceIds: ['foreign-flight'] }]; } },
    { name: 'ungranted metric', mutate: reply => { reply.answer.metrics = [{ referenceId: 'foreign-metric', measure: 'count', value: 1, unit: 'flights' }]; } },
  ];
  for (const scenario of cases) await t.test(scenario.name, async () => withStore(async store => {
    await seedDraft(store);
    const controller = new AiRunController(ports(store, { tools: async () => makeTools({ metrics: new Map([
      ['local-metric', { referenceId: 'local-metric', measure: 'count', value: 1, unit: 'flights' }],
    ]) }), transmit: async request => {
      const envelope = answerEnvelope(request) as SyntheticAnswerEnvelope;
      scenario.mutate(envelope.reply);
      return envelope;
    } }));
    await assert.rejects(controller.send(conversationId, 'question'));
    const saved = (await store.archive()).conversations[0]?.messages.at(-1);
    assert.equal(saved?.status, 'interrupted');
    assert.equal(saved?.answer, null);
  }));
});

test('explicit recovery interrupts stored active work without replaying it', async () => {
  await withStore(async (initialStore, directory) => {
    await initialStore.saveIdentity(identity());
    await initialStore.saveDraft(conversationId, 'Synthetic question', input, context(), at);
    await initialStore.appendMessage(conversationId, { id: 'pending-message', input, context: context(), status: 'pending',
      answer: null, attempt: null, createdAt: at }, at);
    await initialStore.close();

    const reopened = await ChatStore.open(nodeDriver(join(directory, 'chat.sqlite')), ownerId, async () => {});
    try {
      await reopened.recoverActive();
      let transmissions = 0;
      const controller = new AiRunController(ports(reopened, { transmit: async () => { transmissions++; throw new Error('must not replay'); } }));
      assert.equal(controller.busy, false);
      assert.equal(transmissions, 0);
      const saved = (await reopened.archive()).conversations[0]?.messages[0];
      assert.equal(saved?.status, 'interrupted');
      assert.equal(transmissions, 0);
    } finally { await reopened.close(); }
  });
});

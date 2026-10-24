import { canonical } from '@moflight/flight-logbook';
import { AI_LIMITS, validateAiContext, validateAiEvidenceReference, validateHistoricalProviderIdentity,
  type AiAction, type AiContext, type AiEvidenceReference, type AiMetric, type HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';
import { array, choice, id, integer, object, text, unique } from '../../../../packages/ai-contracts/src/shape.ts';

export type ChatStatus = 'pending' | 'running' | 'needs-clarification' | 'complete' | 'partial' | 'interrupted' | 'failed' | 'cancelled';

export interface ChatAttempt {
  attemptId: string;
  runId: string;
  policyId: string | null;
  round: number;
}

export interface StoredChatAnswer {
  version: 1;
  text: string;
  evidence: AiEvidenceReference[];
  actions: AiAction[];
  metrics: AiMetric[];
}

export interface ChatMessage {
  id: string;
  input: string;
  context: AiContext | null;
  status: ChatStatus;
  answer: StoredChatAnswer | null;
  attempt: ChatAttempt | null;
  createdAt: string;
}

export interface ChatConversation {
  version: 1;
  id: string;
  ownerId: string;
  title: string;
  draft: string;
  context: AiContext | null;
  messages: ChatMessage[];
  activitySequence: number;
  updatedAt: string;
}

export interface ChatArchive {
  version: 1;
  ownerId: string;
  activitySequence: number;
  identity: HistoricalProviderIdentity | null;
  conversations: ChatConversation[];
}

export interface ChatArchiveOptions { interruptActive?: boolean }

/** Give unsent conversations a useful local title; later drafts retain their history title. */
export function chatDraftTitle(input:string,current?:Pick<ChatConversation,'title'|'messages'>):string {
  if(current?.messages.length||!input.trim())return current?.title||'Neues Gespräch';
  return input.trim().split(/\r?\n/,1)[0]!.slice(0,80);
}

export const CHAT_LIMITS = Object.freeze({
  archiveBytes: 16 * 1024 * 1024,
  conversations: 50,
  messagesPerConversation: 500,
  titleChars: 200,
  inputChars: 16_000,
  draftChars: 16_000,
  answerChars: 32_000,
});

const STATUSES: readonly ChatStatus[] = ['pending', 'running', 'needs-clarification', 'complete', 'partial', 'interrupted', 'failed', 'cancelled'];

function boundedString(value: unknown, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0') || (!allowEmpty && !value.trim())) {
    throw new Error('Invalid AI chat text');
  }
  return value;
}

function timestamp(value: unknown): string {
  const result = text(value, 24);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(result) ||
      !Number.isFinite(Date.parse(result)) || new Date(result).toISOString() !== result) {
    throw new Error('Invalid AI chat timestamp');
  }
  return result;
}

function context(value: unknown, ownerId: string): AiContext {
  const parsed = validateAiContext(value);
  if (parsed.localOwnerId !== ownerId) throw new Error('Foreign AI chat context');
  return parsed;
}

function nullableContext(value: unknown, ownerId: string): AiContext | null {
  return value === null ? null : context(value, ownerId);
}

function parseAttempt(value: unknown): ChatAttempt | null {
  if (value === null) return null;
  const v = object(value, ['attemptId', 'runId', 'policyId', 'round']);
  return {
    attemptId: id(v.attemptId),
    runId: id(v.runId),
    policyId: v.policyId === null ? null : id(v.policyId),
    round: integer(v.round, Number.MAX_SAFE_INTEGER),
  };
}

function parseAnswer(value: unknown, messageContext: AiContext | null): StoredChatAnswer | null {
  if (value === null) return null;
  const v = object(value, ['version', 'text', 'evidence', 'actions', 'metrics']);
  const evidence = array(v.evidence, AI_LIMITS.rows).map(item => {
    if (messageContext === null) throw new Error('AI chat evidence requires its message context');
    return validateAiEvidenceReference(item, messageContext);
  });
  unique(evidence.map(reference => reference.id));
  const flightEvidenceIds = new Set(evidence.filter(reference => !('kind' in reference)).map(reference => reference.id));
  const actions = array(v.actions, 20).map(item => {
    const a = object(item, ['kind', 'referenceIds']);
    const kind = choice(a.kind, ['open-flight', 'show-flights'] as const);
    const referenceIds = unique(array(a.referenceIds, kind === 'open-flight' ? 1 : AI_LIMITS.rows, 1).map(id));
    if (kind === 'open-flight' && referenceIds.length !== 1 || referenceIds.some(referenceId => !flightEvidenceIds.has(referenceId))) {
      throw new Error('Invalid AI chat action reference');
    }
    return { kind, referenceIds };
  });
  const metrics = array(v.metrics, 30).map(item => {
    const m = object(item, ['referenceId', 'measure', 'value', 'unit']);
    const measure = choice(m.measure, ['count', 'knownMinutes', 'averageKnownMinutes'] as const);
    const unit = choice(m.unit, ['flights', 'minutes'] as const);
    if (unit !== (measure === 'count' ? 'flights' : 'minutes')) throw new Error('Invalid AI chat metric unit');
    let value: number | null = null;
    if (m.value !== null) {
      if (typeof m.value !== 'number' || !Number.isFinite(m.value) || m.value < 0 || m.value > Number.MAX_SAFE_INTEGER ||
          measure !== 'averageKnownMinutes' && !Number.isSafeInteger(m.value)) throw new Error('Invalid AI chat metric');
      value = m.value;
    }
    return { referenceId: id(m.referenceId), measure, value, unit };
  });
  unique(metrics.map(metric => metric.referenceId));
  return {
    version: v.version === 1 ? 1 : (() => { throw new Error('Unsupported AI chat answer version'); })(),
    text: boundedString(v.text, CHAT_LIMITS.answerChars), evidence, actions, metrics,
  };
}

function parseMessage(value: unknown, ownerId: string, interruptActive: boolean,
  seenMessageIds: Set<string>, attemptIds: Set<string>, runIds: Set<string>): ChatMessage {
  const v = object(value, ['id', 'input', 'context', 'status', 'answer', 'attempt', 'createdAt']);
  const messageId = id(v.id);
  if (seenMessageIds.has(messageId)) throw new Error('Duplicate AI chat message ID');
  seenMessageIds.add(messageId);
  const parsedContext = nullableContext(v.context, ownerId);
  const parsedAttempt = parseAttempt(v.attempt);
  if (parsedAttempt) {
    if (attemptIds.has(parsedAttempt.attemptId) || runIds.has(parsedAttempt.runId)) throw new Error('Duplicate AI chat attempt ID');
    attemptIds.add(parsedAttempt.attemptId);
    runIds.add(parsedAttempt.runId);
  }
  const status = choice(v.status, STATUSES);
  return {
    id: messageId,
    input: boundedString(v.input, CHAT_LIMITS.inputChars),
    context: parsedContext,
    status: interruptActive && (status === 'pending' || status === 'running') ? 'interrupted' : status,
    answer: parseAnswer(v.answer, parsedContext),
    attempt: parsedAttempt,
    createdAt: timestamp(v.createdAt),
  };
}

function countBytes(textValue: string): number { return new TextEncoder().encode(textValue).byteLength; }

function archiveOptions(value: ChatArchiveOptions): ChatArchiveOptions {
  if (!value || typeof value !== 'object') throw new Error('Invalid AI chat archive options');
  const keys = Reflect.ownKeys(value);
  const parsed = object(value, keys.length === 0 ? [] : ['interruptActive']);
  if (parsed.interruptActive !== undefined && typeof parsed.interruptActive !== 'boolean') throw new Error('Invalid AI chat archive options');
  return parsed.interruptActive === undefined ? {} : { interruptActive: parsed.interruptActive };
}

function assertArchiveSize(archive: ChatArchive): void {
  if (countBytes(canonical(archive)) > CHAT_LIMITS.archiveBytes) throw new Error('AI chat archive exceeds 16 MiB');
}

/** Validate and detach a complete owner-scoped archive. No input object is returned. */
export function validateChatArchive(value: unknown, ownerId: string, options: ChatArchiveOptions = {}): ChatArchive {
  const expectedOwner = id(ownerId);
  const interruptActive = archiveOptions(options).interruptActive === true;
  const v = object(value, ['version', 'ownerId', 'activitySequence', 'identity', 'conversations']);
  if (v.ownerId !== expectedOwner) throw new Error('Foreign AI chat archive');
  const activitySequence = integer(v.activitySequence, Number.MAX_SAFE_INTEGER);
  const identity = v.identity === null ? null : validateHistoricalProviderIdentity(v.identity, expectedOwner);
  const entityIds = new Set<string>();
  const attemptIds = new Set<string>();
  const runIds = new Set<string>();
  const conversations = array(v.conversations, CHAT_LIMITS.conversations).map(item => {
    const c = object(item, ['version', 'id', 'ownerId', 'title', 'draft', 'context', 'messages', 'activitySequence', 'updatedAt']);
    const conversationId = id(c.id);
    if (entityIds.has(conversationId)) throw new Error('Duplicate AI chat ID');
    entityIds.add(conversationId);
    if (c.ownerId !== expectedOwner) throw new Error('Foreign AI chat conversation');
    const conversationContext = nullableContext(c.context, expectedOwner);
    const messages = array(c.messages, CHAT_LIMITS.messagesPerConversation).map(message =>
      parseMessage(message, expectedOwner, interruptActive, entityIds, attemptIds, runIds));
    const contexts = [conversationContext, ...messages.map(message => message.context)].filter((item): item is AiContext => item !== null);
    if (contexts.some(item => item.provider !== contexts[0]?.provider || item.accountRef !== contexts[0]?.accountRef)) {
      throw new Error('AI chat conversation changed provider account');
    }
    if (identity && contexts.some(item => item.accountRef !== identity.accountRef)) throw new Error('AI chat context does not match saved identity');
    return {
      version: c.version === 1 ? 1 as const : (() => { throw new Error('Unsupported AI chat conversation version'); })(),
      id: conversationId, ownerId: expectedOwner,
      title: boundedString(c.title, CHAT_LIMITS.titleChars, true),
      draft: boundedString(c.draft, CHAT_LIMITS.draftChars, true),
      context: conversationContext, messages,
      activitySequence: integer(c.activitySequence, Number.MAX_SAFE_INTEGER),
      updatedAt: timestamp(c.updatedAt),
    };
  });
  if (conversations.some(conversation => conversation.activitySequence > activitySequence)) throw new Error('AI chat activity sequence is behind a conversation');
  if (identity && conversations.some(conversation => conversation.ownerId !== identity.localOwnerId)) throw new Error('Foreign AI chat identity');
  const parsed: ChatArchive = { version: v.version === 1 ? 1 as const : (() => { throw new Error('Unsupported AI chat archive version'); })(),
    ownerId: expectedOwner, activitySequence, identity, conversations };
  assertArchiveSize(parsed);
  return parsed;
}

/** Encode a validated archive using the repository's stable canonical JSON. */
export function encodeChatArchive(archive: ChatArchive): string {
  const input = object(archive, ['version', 'ownerId', 'activitySequence', 'identity', 'conversations']);
  const parsed = validateChatArchive(input, input.ownerId as string);
  const encoded = canonical(parsed);
  if (countBytes(encoded) > CHAT_LIMITS.archiveBytes) throw new Error('AI chat archive exceeds 16 MiB');
  return encoded;
}

/** Decode only byte-bounded canonical JSON; callers choose whether restore interrupts active attempts. */
export function decodeChatArchive(textValue: string, ownerId: string, options: ChatArchiveOptions = {}): ChatArchive {
  if (typeof textValue !== 'string' || countBytes(textValue) > CHAT_LIMITS.archiveBytes) throw new Error('AI chat archive exceeds 16 MiB');
  const parsedOptions = archiveOptions(options);
  const parsed: unknown = JSON.parse(textValue);
  const stored = validateChatArchive(parsed, ownerId);
  if (canonical(stored) !== textValue) throw new Error('AI chat archive is not canonical JSON');
  return validateChatArchive(stored, ownerId, parsedOptions);
}

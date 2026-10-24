import { canonical } from '@moflight/flight-logbook';
import { validateHistoricalProviderIdentity, type AiContext, type HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';
import { id, object } from '../../../../packages/ai-contracts/src/shape.ts';
import type { Connection, Driver } from '../../../../packages/local-data/src/index.ts';
import { CHAT_LIMITS, decodeChatArchive, encodeChatArchive, validateChatArchive,
  type ChatArchive, type ChatConversation, type ChatMessage } from './chat-model.ts';

const MANIFEST_SQL = 'CREATE TABLE ai_chat_manifest(singleton INTEGER PRIMARY KEY CHECK(singleton=1), owner_id TEXT NOT NULL, schema_version INTEGER NOT NULL CHECK(schema_version=1))';
const STATE_SQL = 'CREATE TABLE ai_chat_state(singleton INTEGER PRIMARY KEY CHECK(singleton=1), activity_sequence INTEGER NOT NULL CHECK(activity_sequence >= 0), archive_json TEXT NOT NULL)';
const CHAT_SCHEMA = `${MANIFEST_SQL}; ${STATE_SQL}; PRAGMA user_version=1;`;

interface SchemaObjectRow { type: string; name: string; tbl_name: string; sql: string | null }
interface ChatStateRow { singleton: number; activity_sequence: number; archive_json: string }
interface ManifestRow { singleton: number; owner_id: string; schema_version: number }

function normalizedSql(sql: string | null): string {
  if (typeof sql !== 'string') return '';
  return sql.toLowerCase().replace(/\s+/g, '').replace(/;$/, '');
}

async function verifySchema(tx: Connection): Promise<void> {
  const version = (await tx.first<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  if (version !== 1) throw new Error('Unsupported AI chat database schema; preserved');
  const objects = await tx.all<SchemaObjectRow>("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' ORDER BY name,type");
  const expected = new Map([
    ['ai_chat_manifest', normalizedSql(MANIFEST_SQL)],
    ['ai_chat_state', normalizedSql(STATE_SQL)],
  ]);
  if (objects.length !== expected.size) throw new Error('Unexpected AI chat database objects; preserved');
  for (const object of objects) {
    const sql = expected.get(object.name);
    if (object.type !== 'table' || object.tbl_name !== object.name || sql === undefined || normalizedSql(object.sql) !== sql) {
      throw new Error('Unsupported AI chat table schema; preserved');
    }
  }
}

function nextSequence(archive: ChatArchive): number {
  if (archive.activitySequence >= Number.MAX_SAFE_INTEGER) throw new Error('AI chat activity sequence exhausted');
  return archive.activitySequence + 1;
}

function setActivity(archive: ChatArchive, conversation: ChatConversation, at: string): void {
  const sequence = nextSequence(archive);
  archive.activitySequence = sequence;
  conversation.activitySequence = sequence;
  conversation.updatedAt = at;
}

function evictOldest(archive: ChatArchive): void {
  if (archive.conversations.length <= CHAT_LIMITS.conversations) return;
  const ordered = [...archive.conversations].sort((left, right) => {
    if (left.activitySequence < right.activitySequence) return -1;
    if (left.activitySequence > right.activitySequence) return 1;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const removed = new Set(ordered.slice(0, archive.conversations.length - CHAT_LIMITS.conversations).map(item => item.id));
  archive.conversations = archive.conversations.filter(item => !removed.has(item.id));
}

function validateTimestamp(value: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid AI chat timestamp');
  return value;
}

const TERMINAL_STATUSES = new Set<ChatMessage['status']>(['needs-clarification', 'complete', 'partial', 'interrupted', 'failed', 'cancelled']);

function updateIsAllowed(previous: ChatMessage, incoming: ChatMessage): boolean {
  if (TERMINAL_STATUSES.has(previous.status)) {
    return previous.status === incoming.status && canonical(previous.answer) === canonical(incoming.answer) &&
      canonical(previous.attempt) === canonical(incoming.attempt);
  }
  if (previous.status === 'running' && incoming.status === 'pending') return false;
  if (previous.attempt === null) {
    // The first admitted attempt may be attached to a persisted pre-dispatch pending message.
    if (incoming.attempt === null) return incoming.status === 'pending' || incoming.status === 'failed' || incoming.status === 'cancelled';
    return previous.status === 'pending' && (incoming.status === 'pending' || incoming.status === 'running');
  }
  if (incoming.attempt === null || incoming.attempt.attemptId !== previous.attempt.attemptId || incoming.attempt.runId !== previous.attempt.runId) return false;
  if (previous.attempt.policyId !== null && incoming.attempt.policyId !== previous.attempt.policyId) return false;
  if (incoming.attempt.round < previous.attempt.round) return false;
  return true;
}

function contextFor(ownerId: string, value: AiContext | null): AiContext | null {
  if (value === null) return null;
  const parsed = validateChatArchive({ version: 1, ownerId, activitySequence: 0, identity: null, conversations: [
    { version: 1, id: 'context-check', ownerId, title: '', draft: '', context: value, messages: [], activitySequence: 0, updatedAt: '2000-01-01T00:00:00.000Z' },
  ] }, ownerId);
  return parsed.conversations[0]!.context;
}

function normalizeIncomingMessage(ownerId: string, conversationId: string, message: ChatMessage, identity: HistoricalProviderIdentity | null,
  at: string): ChatMessage {
  const fields = object(message, ['id', 'input', 'context', 'status', 'answer', 'attempt', 'createdAt']);
  const parsed = validateChatArchive({ version: 1, ownerId, activitySequence: 0, identity, conversations: [
    { version: 1, id: conversationId, ownerId, title: '', draft: '', context: fields.context, messages: [fields as unknown as ChatMessage], activitySequence: 0, updatedAt: at },
  ] }, ownerId);
  return parsed.conversations[0]!.messages[0]!;
}

export class ChatStore {
  private closed = false;

  private constructor(private readonly db: Driver, private readonly ownerId: string, private readonly gate: () => Promise<void>) {}

  static async open(db: Driver, ownerId: string, gate: () => Promise<void>, create = true): Promise<ChatStore> {
    const parsedOwner = id(ownerId);
    const store = new ChatStore(db, parsedOwner, gate);
    try {
      await gate();
      await db.transaction(async tx => {
        await gate();
        const version = (await tx.first<{ user_version: number }>('PRAGMA user_version'))?.user_version;
        if (version === 0) {
          const existing = await tx.first<{ type: string; name: string }>("SELECT type,name FROM sqlite_master WHERE name NOT GLOB 'sqlite_*' LIMIT 1");
          if (existing) throw new Error('Unversioned database contains a SQL object; preserved');
          if (!create) throw new Error('AI chat database does not exist');
          await tx.exec(CHAT_SCHEMA);
          const empty: ChatArchive = { version: 1, ownerId: parsedOwner, activitySequence: 0, identity: null, conversations: [] };
          await tx.run('INSERT INTO ai_chat_manifest(singleton,owner_id,schema_version) VALUES (1,?,1)', parsedOwner);
          await tx.run('INSERT INTO ai_chat_state(singleton,activity_sequence,archive_json) VALUES (1,0,?)', encodeChatArchive(empty));
        } else if (version !== 1) throw new Error('Unsupported AI chat database schema; preserved');

        const current = await ChatStore.readState(tx, parsedOwner);
        validateChatArchive(current.archive, parsedOwner);
        const integrity = await tx.all<{ integrity_check: string }>('PRAGMA integrity_check');
        if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('AI chat database integrity check failed; preserved');
        await gate();
      });
      await gate();
      return store;
    } catch (error) {
      try { await db.close(); } catch { /* Preserve the original open failure. */ }
      throw error;
    }
  }

  private static async readState(tx: Connection, ownerId: string): Promise<{ archive: ChatArchive; archiveJson: string }> {
    await verifySchema(tx);
    const manifests = await tx.all<ManifestRow>('SELECT singleton,owner_id,schema_version FROM ai_chat_manifest ORDER BY singleton');
    if (manifests.length !== 1 || manifests[0]?.singleton !== 1 || manifests[0].schema_version !== 1) {
      throw new Error('Missing, extra or unsupported AI chat manifest rows; preserved');
    }
    const manifest = manifests[0];
    if (manifest.owner_id !== ownerId) throw new Error('AI chat database belongs to another owner');
    const states = await tx.all<ChatStateRow>('SELECT singleton,activity_sequence,archive_json FROM ai_chat_state ORDER BY singleton');
    if (states.length !== 1 || states[0]?.singleton !== 1) throw new Error('Missing or extra AI chat state rows; preserved');
    const row = states[0];
    if (!Number.isSafeInteger(row.activity_sequence) || row.activity_sequence < 0 || typeof row.archive_json !== 'string') {
      throw new Error('Invalid AI chat state; preserved');
    }
    const archive = decodeChatArchive(row.archive_json, ownerId);
    if (archive.activitySequence !== row.activity_sequence) throw new Error('AI chat sequence manifest mismatch; preserved');
    return { archive, archiveJson: row.archive_json };
  }

  private static async writeState(tx: Connection, archive: ChatArchive): Promise<void> {
    const archiveJson = encodeChatArchive(archive);
    await tx.run('UPDATE ai_chat_state SET activity_sequence=?,archive_json=? WHERE singleton=1', archive.activitySequence, archiveJson);
    const saved = await tx.first<ChatStateRow>('SELECT activity_sequence,archive_json FROM ai_chat_state WHERE singleton=1');
    if (!saved || saved.activity_sequence !== archive.activitySequence || saved.archive_json !== archiveJson) {
      throw new Error('AI chat state write did not persist exactly');
    }
  }

  private ensureOpen(): void {
    if (this.closed) throw new Error('AI chat store is closed');
  }

  private async transact<T>(work: (archive: ChatArchive) => Promise<{ result: T; changed: boolean }> | { result: T; changed: boolean }): Promise<T> {
    this.ensureOpen();
    await this.gate();
    let result!: T;
    await this.db.transaction(async tx => {
      await this.gate();
      const current = await ChatStore.readState(tx, this.ownerId);
      const outcome = await work(current.archive);
      if (outcome.changed) {
        const checked = validateChatArchive(current.archive, this.ownerId);
        await ChatStore.writeState(tx, checked);
      }
      result = outcome.result;
      await this.gate();
    });
    await this.gate();
    return result;
  }

  async archive(): Promise<ChatArchive> {
    return this.transact(archive => ({ result: validateChatArchive(archive, this.ownerId), changed: false }));
  }

  /** Explicit process-start recovery; ordinary store opens preserve an active live run. */
  async recoverActive(): Promise<void> {
    await this.transact(archive => {
      let changed = false;
      for (const conversation of archive.conversations) for (const message of conversation.messages) {
        if (message.status === 'pending' || message.status === 'running') {
          message.status = 'interrupted';
          changed = true;
        }
      }
      return { result: undefined, changed };
    });
  }

  async restore(archive: ChatArchive): Promise<void> {
    const parsed = validateChatArchive(archive, this.ownerId);
    await this.transact(current => {
      current.activitySequence = parsed.activitySequence;
      current.identity = parsed.identity;
      current.conversations = parsed.conversations;
      return { result: undefined, changed: true };
    });
  }

  async saveIdentity(identity: HistoricalProviderIdentity | null): Promise<void> {
    const parsedIdentity = identity === null ? null : validateHistoricalProviderIdentity(identity, this.ownerId);
    await this.transact(archive => {
      archive.identity = parsedIdentity;
      // Full archive validation binds an identity to every saved non-null context.
      validateChatArchive(archive, this.ownerId);
      return { result: undefined, changed: true };
    });
  }
  /** Atomic first historical receipt; concurrent observations cannot replace another account. */
  async rememberIdentity(identity: HistoricalProviderIdentity): Promise<HistoricalProviderIdentity> {
    const parsed = validateHistoricalProviderIdentity(identity, this.ownerId);
    return this.transact(archive => {
      if (archive.identity) {
        if (archive.identity.accountRef !== parsed.accountRef) throw new Error('Historical provider account changed');
        return { result: validateHistoricalProviderIdentity(archive.identity, this.ownerId), changed: false };
      }
      archive.identity = parsed;
      return { result: validateHistoricalProviderIdentity(parsed, this.ownerId), changed: true };
    });
  }

  async saveDraft(idValue: string, titleValue: string, textValue: string, contextValue: AiContext | null, atValue: string): Promise<void> {
    const conversationId = id(idValue);
    const title = typeof titleValue === 'string' && titleValue.length <= CHAT_LIMITS.titleChars && !titleValue.includes('\0') ? titleValue : (() => { throw new Error('Invalid AI chat title'); })();
    const draft = typeof textValue === 'string' && textValue.length <= CHAT_LIMITS.draftChars && !textValue.includes('\0') ? textValue : (() => { throw new Error('Invalid AI chat draft'); })();
    const at = validateTimestamp(atValue);
    const context = contextFor(this.ownerId, contextValue);
    await this.transact(archive => {
      let conversation = archive.conversations.find(item => item.id === conversationId);
      if (!conversation && !draft.trim()) return { result: undefined, changed: false };
      if (!conversation) {
        conversation = { version: 1, id: conversationId, ownerId: this.ownerId, title, draft, context, messages: [], activitySequence: 0, updatedAt: at };
        archive.conversations.push(conversation);
      } else {
        conversation.title = title;
        conversation.draft = draft;
        conversation.context = context;
      }
      setActivity(archive, conversation, at);
      evictOldest(archive);
      return { result: undefined, changed: true };
    });
  }

  async touch(idValue: string, atValue: string): Promise<void> {
    const conversationId = id(idValue);
    const at = validateTimestamp(atValue);
    await this.transact(archive => {
      const conversation = archive.conversations.find(item => item.id === conversationId);
      if (!conversation) throw new Error('AI chat conversation does not exist');
      setActivity(archive, conversation, at);
      return { result: undefined, changed: true };
    });
  }

  async appendMessage(conversationIdValue: string, message: ChatMessage, atValue: string): Promise<void> {
    const conversationId = id(conversationIdValue);
    const at = validateTimestamp(atValue);
    await this.transact(archive => {
      const normalized = normalizeIncomingMessage(this.ownerId, conversationId, message, archive.identity, at);
      let conversation = archive.conversations.find(item => item.id === conversationId);
      if (!conversation) {
        const title = normalized.input.trim().slice(0, CHAT_LIMITS.titleChars);
        conversation = { version: 1, id: conversationId, ownerId: this.ownerId, title, draft: '', context: normalized.context,
          messages: [], activitySequence: 0, updatedAt: at };
        archive.conversations.push(conversation);
      }
      if (conversation.messages.some(item => item.id === normalized.id)) throw new Error('Duplicate AI chat message ID');
      if (conversation.draft === normalized.input) conversation.draft = '';
      conversation.messages.push(normalized);
      setActivity(archive, conversation, at);
      evictOldest(archive);
      return { result: undefined, changed: true };
    });
  }

  async updateMessage(conversationIdValue: string, message: ChatMessage, atValue: string): Promise<boolean> {
    const conversationId = id(conversationIdValue);
    const at = validateTimestamp(atValue);
    return this.transact(archive => {
      const normalized = normalizeIncomingMessage(this.ownerId, conversationId, message, archive.identity, at);
      const conversation = archive.conversations.find(item => item.id === conversationId);
      const found = conversation?.messages.find(item => item.id === normalized.id);
      if (!conversation || !found) return { result: false, changed: false };
      if (normalized.id !== found.id || normalized.input !== found.input || canonical(normalized.context) !== canonical(found.context) || normalized.createdAt !== found.createdAt) {
        throw new Error('AI chat message identity, input or context cannot be changed');
      }
      if (!updateIsAllowed(found, normalized)) return { result: false, changed: false };
      if (TERMINAL_STATUSES.has(found.status)) return { result: true, changed: false };
      conversation.messages = conversation.messages.map(item => item.id === found.id ? normalized : item);
      setActivity(archive, conversation, at);
      return { result: true, changed: true };
    });
  }

  async delete(idValue: string): Promise<void> {
    const conversationId = id(idValue);
    await this.transact(archive => {
      const found = archive.conversations.some(item => item.id === conversationId);
      if (!found) return { result: undefined, changed: false };
      archive.conversations = archive.conversations.filter(item => item.id !== conversationId);
      archive.activitySequence = nextSequence(archive);
      return { result: undefined, changed: true };
    });
  }

  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.db.close();
  }
}

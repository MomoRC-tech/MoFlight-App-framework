import { canonical } from '@moflight/flight-logbook';
import type { Connection, Driver } from '@moflight/local-data';
import { validateScope, type ProviderScope } from './scope-store';

const taskListUrl = 'https://vereinsflieger.de/member/community/tasklist/tasklist';
const selectors = {
  allopen: 'Alle nicht beendeten Aufgaben',
  myopen: 'Meine nicht beendeten Aufgaben',
  all: 'Alle Aufgaben',
} as const;

export type TaskSelector = keyof typeof selectors;
export interface TaskSelectionRecovery {
  version: 1;
  attemptId: string;
  scope: ProviderScope;
  selector: TaskSelector;
  restoreUrl: string;
}

export const TASK_SELECTION_RECOVERY_SCHEMA = `
CREATE TABLE task_selector_recovery_manifest_v1 (
  id INTEGER PRIMARY KEY CHECK(id=1),
  family TEXT NOT NULL CHECK(family='moflight-task-selector-recovery'),
  version INTEGER NOT NULL CHECK(version=1),
  scope TEXT NOT NULL
);
CREATE TABLE pending_task_selector_restore_v1 (
  id INTEGER PRIMARY KEY CHECK(id=1),
  payload TEXT NOT NULL CHECK(json_valid(payload))
);
PRAGMA user_version=1;`;

function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Unsupported task selector recovery fields.');
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid task selector recovery.');
  return value as Record<string, unknown>;
}
function strictScope(value: unknown): ProviderScope {
  const input = record(value); exact(input, ['version', 'owner', 'connectionId', 'context']);
  const context = record(input.context); exact(context, ['accountNumber', 'clubLabel', 'clubIdentity', 'verification']);
  const validated = validateScope(input);
  if (canonical(validated) !== canonical(input)) throw new Error('Unsupported task selector recovery scope.');
  return validated;
}
function selector(value: unknown): TaskSelector {
  if (typeof value !== 'string' || !Object.hasOwn(selectors, value)) throw new Error('Unsupported task selector.');
  return value as TaskSelector;
}
function restoreUrl(value: unknown, selected: TaskSelector): string {
  const expected = taskListUrl + '?gselect=' + selected;
  if (value !== expected) throw new Error('Task selector recovery URL did not match its allowlisted selector.');
  return expected;
}
function attemptId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid task selector recovery attempt.');
  return value;
}

/** Converts the already DOM-validated selection into its small durable form. */
export function createTaskSelectionRecovery(scope: ProviderScope, selected: string, url: string, id: string): TaskSelectionRecovery {
  const chosen = Object.entries(selectors).find(([, label]) => label === selected)?.[0];
  if (!chosen) throw new Error('Unsupported original task selector.');
  const selectedCode = selector(chosen);
  return {
    version: 1,
    attemptId: attemptId(id),
    scope: strictScope(scope),
    selector: selectedCode,
    restoreUrl: restoreUrl(url, selectedCode),
  };
}

export function validateTaskSelectionRecovery(value: unknown, expectedScope?: ProviderScope): TaskSelectionRecovery {
  const input = record(value); exact(input, ['version', 'attemptId', 'scope', 'selector', 'restoreUrl']);
  if (input.version !== 1) throw new Error('Unsupported task selector recovery version.');
  const selected = selector(input.selector);
  const checked: TaskSelectionRecovery = {
    version: 1,
    attemptId: attemptId(input.attemptId),
    scope: strictScope(input.scope),
    selector: selected,
    restoreUrl: restoreUrl(input.restoreUrl, selected),
  };
  if (expectedScope && canonical(checked.scope) !== canonical(strictScope(expectedScope))) throw new Error('Task selector recovery scope mismatch.');
  return checked;
}

export function taskSelectionFromRecovery(input: TaskSelectionRecovery): { selected: string; restoreUrl: string } {
  const checked = validateTaskSelectionRecovery(input);
  return { selected: selectors[checked.selector], restoreUrl: checked.restoreUrl };
}

async function readPending(db: Connection, expectedScope: ProviderScope, gate: () => void): Promise<TaskSelectionRecovery | null> {
  gate();
  const row = await db.first<{ payload: string }>('SELECT payload FROM pending_task_selector_restore_v1 WHERE id=1');
  gate();
  if (!row) return null;
  if (row.payload.length > 4096) throw new Error('Task selector recovery record is oversized.');
  let value: unknown;
  try { value = JSON.parse(row.payload); } catch { throw new Error('Task selector recovery record is corrupt.'); }
  if (canonical(value) !== row.payload) throw new Error('Task selector recovery record is not canonical.');
  return validateTaskSelectionRecovery(value, expectedScope);
}

const expectedObjects = ['table:pending_task_selector_restore_v1', 'table:task_selector_recovery_manifest_v1'];
async function inspect(db: Connection, scope: ProviderScope): Promise<'empty' | 'ready'> {
  const version = (await db.first<{ user_version: number }>('PRAGMA user_version'))?.user_version;
  const objects = await db.all<{ type: string; name: string }>("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name");
  if (version === 0 && objects.length === 0) return 'empty';
  if (version !== 1 || canonical(objects.map(value => `${value.type}:${value.name}`)) !== canonical(expectedObjects)) throw new Error('Unsupported task selector recovery database; preserved for review.');
  const manifest = await db.first<{ id: number; family: string; version: number; scope: string }>('SELECT id,family,version,scope FROM task_selector_recovery_manifest_v1 WHERE id=1');
  if (!manifest || manifest.id !== 1 || manifest.family !== 'moflight-task-selector-recovery' || manifest.version !== 1 || manifest.scope !== canonical(scope)) throw new Error('Task selector recovery scope or manifest mismatch; preserved for review.');
  if ((await db.first('SELECT id FROM task_selector_recovery_manifest_v1 WHERE id<>1')) || (await db.first('SELECT id FROM pending_task_selector_restore_v1 WHERE id<>1'))) throw new Error('Unsupported task selector recovery rows; preserved for review.');
  return 'ready';
}

async function initialize(db: Driver, scope: ProviderScope, create: boolean): Promise<boolean> {
  const state = await inspect(db, scope);
  if (state === 'ready') return true;
  if (!create) return false; // A reserved empty file is preserved until an explicit observed selector can be journaled.
  await db.transaction(async tx => {
    const current = await inspect(tx, scope);
    if (current === 'ready') return;
    await tx.exec(TASK_SELECTION_RECOVERY_SCHEMA);
    await tx.run('INSERT INTO task_selector_recovery_manifest_v1(id,family,version,scope) VALUES (1,?,?,?)', 'moflight-task-selector-recovery', 1, canonical(scope));
    if (await inspect(tx, scope) !== 'ready') throw new Error('Task selector recovery database initialization was not verified.');
  });
  if (await inspect(db, scope) !== 'ready') throw new Error('Task selector recovery database initialization was not verified.');
  return true;
}

export async function loadPendingTaskSelectionRecovery(db: Driver, scope: ProviderScope, gate: () => void = () => {}): Promise<TaskSelectionRecovery | null> {
  const checkedScope = strictScope(scope);
  if (!await initialize(db, checkedScope, false)) return null;
  return readPending(db, checkedScope, gate);
}

/** One local transaction writes and verifies the checkpoint before provider navigation. */
export async function rememberTaskSelectionRecovery(db: Driver, input: TaskSelectionRecovery, gate: () => void = () => {}): Promise<TaskSelectionRecovery> {
  const checked = validateTaskSelectionRecovery(input);
  const payload = canonical(checked);
  if (payload.length > 4096) throw new Error('Task selector recovery record is oversized.');
  if (!await initialize(db, checked.scope, true)) throw new Error('Task selector recovery database initialization failed.');
  let saved!: TaskSelectionRecovery;
  await db.transaction(async tx => {
    gate();
    const pending = await readPending(tx, checked.scope, gate);
    if (pending && canonical(pending) !== payload) throw new Error('A different task selector recovery is still pending.');
    if (!pending) {
      gate();
      await tx.run('INSERT INTO pending_task_selector_restore_v1(id,payload) VALUES (1,?)', payload);
    }
    gate();
    const verified = await readPending(tx, checked.scope, gate);
    if (!verified || canonical(verified) !== payload) throw new Error('Task selector recovery was not verified.');
    saved = verified;
    gate();
  });
  return saved;
}

/** Clear only the exact same-scope checkpoint, after provider selection readback. */
export async function clearTaskSelectionRecovery(db: Driver, scope: ProviderScope, expected: TaskSelectionRecovery, gate: () => void = () => {}): Promise<void> {
  const checked = validateTaskSelectionRecovery(expected, strictScope(scope));
  const payload = canonical(checked);
  if (!await initialize(db, checked.scope, false)) throw new Error('Task selector recovery record is unavailable.');
  await db.transaction(async tx => {
    gate();
    const pending = await readPending(tx, checked.scope, gate);
    if (!pending || canonical(pending) !== payload) throw new Error('Task selector recovery changed before acknowledgement.');
    gate();
    await tx.run('DELETE FROM pending_task_selector_restore_v1 WHERE id=1 AND payload=?', payload);
    gate();
    if (await tx.first('SELECT id FROM pending_task_selector_restore_v1 WHERE id=1')) throw new Error('Task selector recovery was not cleared.');
    gate();
  });
}

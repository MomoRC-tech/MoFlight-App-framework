import { canonical } from '@moflight/flight-logbook';
import type { Connection } from '@moflight/local-data';
import { sameContext, validateContext, type ObservedContext } from './context';

/** Local ownership only: a label is never promoted to stable club identity. */
export interface ProviderScope { version: 1; owner: string; connectionId: string; context: ObservedContext }
export const SCOPE_SCHEMA = 'CREATE TABLE IF NOT EXISTS provider_scopes(owner TEXT PRIMARY KEY, payload TEXT NOT NULL);';
export function validateOwner(owner: string): void {
  if (typeof owner !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(owner)) throw new Error('Invalid local provider owner.');
}
export function validateScope(input: unknown): ProviderScope {
  const s = input as ProviderScope;
  if (!s || s.version !== 1) throw new Error('Unsupported provider scope.');
  validateOwner(s.owner);
  if (typeof s.connectionId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(s.connectionId)) throw new Error('Invalid provider connection.');
  return { version: 1, owner: s.owner, connectionId: s.connectionId, context: validateContext(s.context) };
}
export async function readScope(db: Connection, owner: string): Promise<ProviderScope | null> {
  validateOwner(owner);
  const row = await db.first<{ payload: string }>('SELECT payload FROM provider_scopes WHERE owner=?', owner);
  if (!row) return null;
  if (row.payload.length > 2000) throw new Error('Invalid provider scope size.');
  const scope = validateScope(JSON.parse(row.payload));
  if (scope.owner !== owner) throw new Error('Provider owner mismatch.');
  return scope;
}
export async function bindScope(db: Connection, input: ProviderScope): Promise<ProviderScope> {
  const scope = validateScope(input);
  // Immutable first association. Never overwrite an earlier account after restart.
  await db.run('INSERT INTO provider_scopes(owner,payload) VALUES (?,?) ON CONFLICT(owner) DO NOTHING', scope.owner, canonical(scope));
  const saved = await readScope(db, scope.owner);
  if (!saved || !sameContext(saved.context, scope.context)) throw new Error('Provider association mismatch.');
  return saved;
}
export async function authorizeScope(db: Connection, input: ProviderScope): Promise<ProviderScope> {
  const scope = validateScope(input), saved = await readScope(db, scope.owner);
  if (!saved || canonical(saved) !== canonical(scope)) throw new Error('Unowned provider scope.');
  return saved;
}

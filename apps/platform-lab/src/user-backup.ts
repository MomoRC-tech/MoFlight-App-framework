import { canonical } from '@moflight/flight-logbook';
import type { Hash } from '@moflight/local-data';
import { normalizedDisplayName } from './mobile/local-profile';
import { informationBackupCategories, informationBackupExcludedCategories } from './vereinsflieger/information';
import { validateInformationBackup } from './vereinsflieger/information-store';
import type { ProviderScope } from './vereinsflieger/scope-store';
import { validateScope } from './vereinsflieger/scope-store';
import { validateRealFlightBackup } from './vereinsflieger/real-flight-library-model';

export const USER_BACKUP_FORMAT = 'moflight-supported-user-backup';
export const USER_BACKUP_VERSION = 1;
export const USER_BACKUP_LIMIT = 260 * 1024 * 1024;
export const USER_BACKUP_INCLUDED = [
  'the synthetic pilot library: books, sources, memberships, writing state and snapshots',
  'the synthetic pilot display name and selected book',
  'the selected real owner/store flight history',
  'owner-scoped information captures in the declared supported category allowlist',
] as const;
export const USER_BACKUP_EXCLUSIONS = [
  'provider credentials and saved-login secrets',
  'native WebView sessions and cookies',
  'duty-roster cache and raw duty captures that can name other assignees',
  'billing/member-account captures and training captures that can name instructors',
  'diagnostic exports',
  'owner and selection registries',
  'unresolved command journals',
] as const;

export function selectedPilotBookForBackup(books: readonly { id: string }[], remembered: string | null): string | null {
  if (!books.length) return null;
  if (!remembered || !books.some(book => book.id === remembered)) throw new Error('Selected pilot book is unavailable.');
  return remembered;
}

export interface UserBackupInputV1 {
  createdAt: string;
  ownerId: string;
  storeId: string;
  pilot: { ownerId: 'synthetic-pilot'; backup: string; displayName: string; selectedBookId: string | null };
  realFlights: { backup: string };
  information: { scope: ProviderScope; backup: string } | null;
}

export interface UserBackupPayloadV1 extends UserBackupInputV1 { version: 1 }
export interface UserBackupEnvelopeV1 {
  format: typeof USER_BACKUP_FORMAT;
  version: typeof USER_BACKUP_VERSION;
  payload: string;
  checksum: string;
}

const bytes = (text: string) => new TextEncoder().encode(text).length;
function exact(value: unknown, keys: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getOwnPropertyNames(value).length !== Object.keys(value).length || Object.getOwnPropertySymbols(value).length ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error(`Invalid ${label} fields.`);
}
function timestamp(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) ||
      !Number.isFinite(Date.parse(value)) || new Date(value).toISOString() !== value) throw new Error('Invalid user backup timestamp.');
}
function uuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid user backup ${label}.`);
  }
}

async function validatePilotBackup(text: string, selectedBookId: string | null, displayName: string, hash: Hash) {
  if (typeof text !== 'string' || bytes(text) > 2_000_000) throw new Error('Pilot backup size limit exceeded.');
  const envelope: unknown = JSON.parse(text);
  exact(envelope, ['format', 'payload', 'checksum'], 'pilot backup envelope');
  const e = envelope as Record<string, unknown>;
  if (e.format !== 'moflight-pilot-proof-v1' || typeof e.payload !== 'string' || typeof e.checksum !== 'string' ||
      await hash(e.payload) !== e.checksum || canonical(e) !== text) throw new Error('Unsupported or corrupt pilot backup.');
  const body: unknown = JSON.parse(e.payload);
  exact(body, ['owner', 'version', 'books', 'sources', 'memberships', 'state', 'snapshots', 'entries'], 'pilot backup payload');
  const p = body as Record<string, unknown>;
  if (p.owner !== 'synthetic-pilot' || p.version !== 1 ||
      ['books', 'sources', 'memberships', 'state', 'snapshots', 'entries'].some(key => !Array.isArray(p[key])) ||
      canonical(p) !== e.payload || normalizedDisplayName(displayName) !== displayName) throw new Error('Unsupported pilot backup contents.');
  const books = p.books as Array<{ id?: unknown; payload?: unknown }>;
  if (books.some(book => typeof book.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(book.id) || typeof book.payload !== 'string') ||
      selectedBookId !== null && !/^[a-zA-Z0-9_-]{1,100}$/.test(selectedBookId) ||
      selectedBookId !== null && !books.some(book => book.id === selectedBookId)) throw new Error('Selected book is not included in the pilot backup.');
}

/**
 * Build the currently supported owner-bound archive from already captured store snapshots.
 * The caller must hold the app's owner/write guard while reading all included stores.
 */
export async function createUserBackup(input: UserBackupInputV1, hash: Hash): Promise<string> {
  exact(input, ['createdAt', 'ownerId', 'storeId', 'pilot', 'realFlights', 'information'], 'user backup input');
  timestamp(input.createdAt); uuid(input.ownerId, 'owner'); uuid(input.storeId, 'store');
  exact(input.pilot, ['ownerId', 'backup', 'displayName', 'selectedBookId'], 'pilot backup section');
  exact(input.realFlights, ['backup'], 'real flight backup section');
  if (input.pilot.ownerId !== 'synthetic-pilot' || typeof input.pilot.backup !== 'string' ||
      typeof input.pilot.displayName !== 'string') {
    throw new Error('Invalid pilot backup section.');
  }
  if (input.pilot.selectedBookId !== null && (typeof input.pilot.selectedBookId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.pilot.selectedBookId))) {
    throw new Error('Invalid selected book.');
  }
  if (typeof input.realFlights.backup !== 'string') throw new Error('Invalid real flight backup section.');
  await validatePilotBackup(input.pilot.backup, input.pilot.selectedBookId, input.pilot.displayName, hash);
  await validateRealFlightBackup(input.realFlights.backup, input.ownerId, input.storeId, hash);
  let information: UserBackupInputV1['information'] = null;
  if (input.information !== null) {
    exact(input.information, ['scope', 'backup'], 'information backup section');
    const scope = validateScope(input.information.scope);
    if (scope.owner !== input.ownerId || typeof input.information.backup !== 'string') throw new Error('Foreign information backup scope.');
    await validateInformationBackup(input.information.backup, scope, hash);
    information = { scope, backup: input.information.backup };
  }
  const payload = canonical({ version: 1, includes: USER_BACKUP_INCLUDED, excludes: USER_BACKUP_EXCLUSIONS,
    informationCategories: { included: informationBackupCategories, excluded: informationBackupExcludedCategories },
    createdAt: input.createdAt, ownerId: input.ownerId, storeId: input.storeId,
    pilot: { ownerId: input.pilot.ownerId, backup: input.pilot.backup,
      displayName: normalizedDisplayName(input.pilot.displayName), selectedBookId: input.pilot.selectedBookId },
    realFlights: { backup: input.realFlights.backup }, information });
  const text = canonical({ format: USER_BACKUP_FORMAT, version: USER_BACKUP_VERSION, payload, checksum: await hash(payload) });
  if (bytes(text) > USER_BACKUP_LIMIT) throw new Error('User backup size limit exceeded.');
  await validateUserBackup(text, { ownerId: input.ownerId, storeId: input.storeId,
    informationScope: input.information?.scope ?? null }, hash);
  return text;
}

/** Validate all supported sections before any restore caller creates or selects a candidate. */
export async function validateUserBackup(text: string, target: { ownerId: string; storeId: string; informationScope: ProviderScope | null }, hash: Hash): Promise<UserBackupPayloadV1> {
  if (typeof text !== 'string' || bytes(text) > USER_BACKUP_LIMIT) throw new Error('User backup size limit exceeded.');
  uuid(target.ownerId, 'target owner'); uuid(target.storeId, 'target store');
  const envelope: unknown = JSON.parse(text);
  exact(envelope, ['format', 'version', 'payload', 'checksum'], 'user backup envelope');
  const e = envelope as Record<string, unknown>;
  if (e.format !== USER_BACKUP_FORMAT || e.version !== USER_BACKUP_VERSION || typeof e.payload !== 'string' ||
      typeof e.checksum !== 'string' || !/^[0-9a-f]{64}$/.test(e.checksum) || await hash(e.payload) !== e.checksum ||
      bytes(e.payload) > USER_BACKUP_LIMIT || canonical(e) !== text) throw new Error('Unsupported or corrupt user backup.');
  const value: unknown = JSON.parse(e.payload);
  exact(value, ['version', 'includes', 'excludes', 'informationCategories', 'createdAt', 'ownerId', 'storeId', 'pilot', 'realFlights', 'information'], 'user backup payload');
  const p = value as Record<string, unknown>;
  if (p.version !== 1 || canonical(p) !== e.payload || canonical(p.includes) !== canonical(USER_BACKUP_INCLUDED) ||
      canonical(p.excludes) !== canonical(USER_BACKUP_EXCLUSIONS)) throw new Error('Unsupported user backup payload version or coverage.');
  exact(p.informationCategories, ['included', 'excluded'], 'information category coverage');
  const categoryCoverage = p.informationCategories as Record<string, unknown>;
  if (canonical(categoryCoverage.included) !== canonical(informationBackupCategories) ||
      canonical(categoryCoverage.excluded) !== canonical(informationBackupExcludedCategories)) throw new Error('Unsupported information backup coverage.');
  timestamp(p.createdAt); uuid(p.ownerId, 'owner'); uuid(p.storeId, 'store');
  if (p.ownerId !== target.ownerId || p.storeId !== target.storeId) throw new Error('Foreign user backup owner or store.');
  exact(p.pilot, ['ownerId', 'backup', 'displayName', 'selectedBookId'], 'pilot backup section');
  const pilot = p.pilot as Record<string, unknown>;
  if (pilot.ownerId !== 'synthetic-pilot' || typeof pilot.backup !== 'string' || typeof pilot.displayName !== 'string' ||
      pilot.selectedBookId !== null && typeof pilot.selectedBookId !== 'string') throw new Error('Invalid pilot backup section.');
  await validatePilotBackup(pilot.backup, pilot.selectedBookId as string | null, pilot.displayName, hash);
  exact(p.realFlights, ['backup'], 'real flight backup section');
  const realFlights = p.realFlights as Record<string, unknown>;
  if (typeof realFlights.backup !== 'string') throw new Error('Invalid real flight backup section.');
  await validateRealFlightBackup(realFlights.backup, target.ownerId, target.storeId, hash);
  let information: UserBackupPayloadV1['information'] = null;
  if (p.information !== null) {
    exact(p.information, ['scope', 'backup'], 'information backup section');
    const section = p.information as Record<string, unknown>;
    const scope = validateScope(section.scope);
    if (scope.owner !== target.ownerId || !target.informationScope || canonical(scope) !== canonical(validateScope(target.informationScope)) || typeof section.backup !== 'string') {
      throw new Error('Foreign or unavailable information backup scope.');
    }
    await validateInformationBackup(section.backup, scope, hash);
    information = { scope, backup: section.backup };
  } else if (target.informationScope && target.informationScope.owner !== target.ownerId) {
    throw new Error('Foreign current information scope.');
  }
  return { version: 1, createdAt: p.createdAt, ownerId: p.ownerId, storeId: p.storeId,
    pilot: { ownerId: 'synthetic-pilot', backup: pilot.backup, displayName: normalizedDisplayName(pilot.displayName),
      selectedBookId: pilot.selectedBookId as string | null },
    realFlights: { backup: realFlights.backup }, information };
}

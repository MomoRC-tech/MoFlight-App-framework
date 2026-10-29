import { canonical } from '@moflight/flight-logbook';

export interface DutyTargetScope { ownerId: string; storeId: string; accountRef: string }
export interface DutyCalculation { hours: number; retrievedAt: string }
export interface DutyTargetArchive { scope: DutyTargetScope | null; targets: Array<{ year: number; hours: number }> }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function exact(value: unknown, keys: string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    canonical(Object.keys(value).sort()) !== canonical(keys.sort())) throw new Error('Invalid duty target fields.');
}
export function validateDutyTargetScope(value: unknown): DutyTargetScope {
  exact(value, ['ownerId', 'storeId', 'accountRef']);
  if (typeof value.ownerId !== 'string' || !uuid.test(value.ownerId) || typeof value.storeId !== 'string' || !uuid.test(value.storeId) ||
    typeof value.accountRef !== 'string' || !/^[0-9]{1,20}$/.test(value.accountRef)) throw new Error('Invalid duty target scope.');
  return { ownerId: value.ownerId, storeId: value.storeId, accountRef: value.accountRef };
}
export function validDutyTargetYear(year: unknown): year is number { return Number.isInteger(year) && (year as number) >= 1901 && (year as number) <= 9999; }
export function validDutyTargetHours(hours: unknown): hours is number {
  return typeof hours === 'number' && Number.isFinite(hours) && hours >= 0 && hours <= 999 && /^\d{1,3}(?:\.\d{1,2})?$/.test(String(hours));
}
export function dutyTargetScopeKey(scope: DutyTargetScope): string {
  const s = validateDutyTargetScope(scope); return JSON.stringify([s.ownerId, s.storeId, s.accountRef]);
}
export function dutyTargetKey(scope: string, year: number): string {
  if (!validDutyTargetYear(year)) throw new Error('Invalid duty target year.');
  return JSON.stringify([scope, year]);
}
export function decodeDutyTarget(text: string): { key: string; scope: DutyTargetScope; year: number; hours: number } {
  if (text.length > 2048) throw new Error('Duty target size limit exceeded.');
  const value: unknown = JSON.parse(text); exact(value, ['version', 'key', 'hours']);
  if (value.version !== 1 || typeof value.key !== 'string' || !validDutyTargetHours(value.hours)) throw new Error('Invalid duty target.');
  const key: unknown = JSON.parse(value.key);
  if (!Array.isArray(key) || key.length !== 2 || typeof key[0] !== 'string' || !validDutyTargetYear(key[1])) throw new Error('Invalid duty target key.');
  const parts: unknown = JSON.parse(key[0]);
  if (!Array.isArray(parts) || parts.length !== 3) throw new Error('Invalid duty target scope key.');
  const scope = validateDutyTargetScope({ ownerId: parts[0], storeId: parts[1], accountRef: parts[2] });
  if (dutyTargetKey(dutyTargetScopeKey(scope), key[1]) !== value.key) throw new Error('Noncanonical duty target key.');
  return { key: value.key, scope, year: key[1], hours: value.hours };
}
/** Separate derived memo; the strict v1 manual-target and archive v3 shapes stay unchanged. */
export function decodeDutyCalculation(text: string): DutyCalculation & { key: string } {
  if (text.length > 2048) throw new Error('Duty calculation size limit exceeded.');
  const value: unknown = JSON.parse(text); exact(value, ['version', 'key', 'hours', 'retrievedAt']);
  const target = decodeDutyTarget(JSON.stringify({ version: value.version, key: value.key, hours: value.hours }));
  if (typeof value.retrievedAt !== 'string' || !Number.isFinite(Date.parse(value.retrievedAt)) ||
    new Date(value.retrievedAt).toISOString() !== value.retrievedAt) throw new Error('Invalid duty calculation date.');
  return { key: target.key, hours: target.hours, retrievedAt: value.retrievedAt };
}
export function validateDutyTargetArchive(value: unknown, ownerId: string, storeId: string, accountRef: string | null): DutyTargetArchive {
  exact(value, ['scope', 'targets']);
  const scope = value.scope === null ? null : validateDutyTargetScope(value.scope);
  if (scope ? scope.ownerId !== ownerId || scope.storeId !== storeId || scope.accountRef !== accountRef : accountRef !== null) throw new Error('Foreign duty target archive scope.');
  if (!Array.isArray(value.targets) || value.targets.length > 8099 || !scope && value.targets.length) throw new Error('Invalid duty target archive.');
  const years = new Set<number>();
  const targets = value.targets.map(row => {
    exact(row, ['year', 'hours']);
    if (!validDutyTargetYear(row.year) || !validDutyTargetHours(row.hours) || years.has(row.year)) throw new Error('Invalid or duplicate duty target year.');
    years.add(row.year); return { year: row.year, hours: row.hours };
  });
  if (targets.some((row, index) => index > 0 && targets[index - 1]!.year >= row.year)) throw new Error('Unsorted duty targets.');
  return { scope, targets };
}

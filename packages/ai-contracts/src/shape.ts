// Reject accessors, symbols, class instances, sparse arrays and hidden fields before
// reading values. Parsers construct fresh DTOs and never return untrusted objects.
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid AI object');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key))) throw new Error('Unsupported AI fields');
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (!d?.enumerable || !('value' in d)) throw new Error('Invalid AI property');
  }
  return value as Record<string, unknown>;
}
export function array(value: unknown, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max || Reflect.ownKeys(value).length !== value.length + 1) throw new Error('Invalid AI array');
  for (let i = 0; i < value.length; i++) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (!d?.enumerable || !('value' in d)) throw new Error('Invalid AI array entry');
  }
  return value;
}
export function text(value: unknown, max = 16000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\u0000/.test(value)) throw new Error('Invalid AI text');
  return value;
}
export function id(value: unknown): string {
  const result = text(value, 100);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(result)) throw new Error('Invalid AI identifier');
  return result;
}
export function account(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw new Error('Invalid AI provider account');
  return value;
}
export function integer(value: unknown, max: number, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new Error('Invalid AI integer');
  return value;
}
export function literal<T extends string | number | boolean>(value: unknown, expected: T): T {
  if (value !== expected) throw new Error('Incompatible AI contract');
  return expected;
}
export function choice<const T extends readonly string[]>(value: unknown, choices: T): T[number] {
  if (typeof value !== 'string' || !choices.includes(value)) throw new Error('Unsupported AI value');
  return value as T[number];
}
export function nullable<T>(value: unknown, parse: (input: unknown) => T): T | null { return value === null ? null : parse(value); }
export function date(value: unknown): string {
  const result = text(value, 10);
  if (!/^\d{4}-\d\d-\d\d$/.test(result) || !Number.isFinite(Date.parse(result)) || new Date(result).toISOString().slice(0, 10) !== result) throw new Error('Invalid AI date');
  return result;
}
export function unique<T>(values: T[]): T[] {
  if (new Set(values).size !== values.length) throw new Error('Duplicate AI values');
  return values;
}
export function wire(value: string): unknown {
  if (new TextEncoder().encode(value).length > 512000) throw new Error('AI payload too large');
  return JSON.parse(value) as unknown;
}
export function tag(value: unknown, key: string): unknown {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) throw new Error('Invalid AI object');
  const d = Object.getOwnPropertyDescriptor(value, key);
  if (!d?.enumerable || !('value' in d)) throw new Error('Invalid AI discriminator');
  return d.value as unknown;
}

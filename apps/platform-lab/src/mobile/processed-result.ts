/** Structural reuse for immutable JSON-like read models, after source validation.
 * Non-plain objects are atomic. No count/generation/hash shortcut establishes equality.
 */
export function reuseEqualData<T>(previous: T, next: T): T {
  if (Object.is(previous, next)) return previous;
  if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object') return next;
  const arrays = Array.isArray(next);
  if (arrays !== Array.isArray(previous)) return next;
  const plain = (value: object) => { const prototype = Object.getPrototypeOf(value); return prototype === null || Object.getPrototypeOf(prototype) === null; };
  if (!arrays && (!plain(previous) || !plain(next))) return next;
  const old = previous as Record<string, unknown>, fresh = next as Record<string, unknown>;
  const keys = Object.keys(fresh);
  let result: Record<string, unknown> | undefined;
  const changed = () => {
    if (!result) {
      result = arrays ? (previous as unknown[]).slice() as unknown as Record<string, unknown> : { ...old };
      if (!arrays) Object.setPrototypeOf(result, Object.getPrototypeOf(next));
    }
    return result;
  };
  for (const key of keys) {
    const exists = Object.hasOwn(old, key);
    const value = exists ? reuseEqualData(old[key], fresh[key]) : fresh[key];
    if (!exists || !Object.is(value, old[key])) {
      Object.defineProperty(changed(), key, { value, enumerable: true, writable: true, configurable: true });
    }
  }
  for (const key of Object.keys(old)) {
    if (!Object.hasOwn(fresh, key)) delete changed()[key];
  }
  if (arrays && (previous as unknown[]).length !== (next as unknown[]).length) changed().length = (next as unknown[]).length;
  return result ? result as T : previous;
}

/** One result per consumer, scoped to its owner/store/account. Inputs are immutable.
 * A temporarily unavailable input publishes nothing but retains already processed
 * work for a subsequent verified read. Failed processing never replaces the cache.
 */
export function createProcessedSelector<Input, Result>(process: (input: Input) => Result) {
  let cached: { scope: string; input: Input; result: Result } | undefined;
  return (scope: string | null, input: Input | null): Result | null => {
    if (scope === null || input === null) return null;
    const shared = cached?.scope === scope ? reuseEqualData(cached.input, input) : input;
    if (cached?.scope === scope && Object.is(shared, cached.input)) return cached.result;
    const result = process(shared);
    cached = { scope, input: shared, result };
    return result;
  };
}

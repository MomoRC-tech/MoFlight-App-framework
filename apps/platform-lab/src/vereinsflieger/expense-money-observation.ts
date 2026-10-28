/** E1 isolated source-grammar proof. Not wired to retrieval, storage or Statistics.
 * Parsing a signed observation establishes neither liability nor expense kind. */
export type ObservedMoney =
  | { state: 'value'; minorUnits: number }
  | { state: 'missing' }
  | { state: 'unsupported-currency' }
  | { state: 'invalid'; reason: 'type' | 'length' | 'grammar' | 'overflow' };

/** EUR only, exactly two decimal places, optional German thousands grouping.
 * Preserve the original source separately; do not round or guess a locale. */
export function parseObservedEuro(raw: unknown, currency: unknown): ObservedMoney {
  if (currency !== 'EUR') return { state: 'unsupported-currency' };
  if (typeof raw !== 'string') return { state: 'invalid', reason: 'type' };
  if (raw.length > 128) return { state: 'invalid', reason: 'length' };
  const value = raw.trim();
  if (!value) return { state: 'missing' };
  if (!/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+),\d{2}$/.test(value)) {
    return { state: 'invalid', reason: 'grammar' };
  }
  const minor = BigInt(value.replace(/[.,]/g, ''));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER) || minor < -BigInt(Number.MAX_SAFE_INTEGER)) {
    return { state: 'invalid', reason: 'overflow' };
  }
  return { state: 'value', minorUnits: Number(minor) };
}

export type ObservedDate = { state: 'value'; date: string } | { state: 'missing' } | { state: 'invalid' };

/** Source calendar date, with no device-timezone conversion or service-date inference. */
export function parseObservedFinancialDate(raw: unknown): ObservedDate {
  if (typeof raw !== 'string' || raw.length > 128) return { state: 'invalid' };
  const value = raw.trim();
  if (!value) return { state: 'missing' };
  if (!/^\d{2}\.\d{2}\.(?:19|20|21)\d{2}$/.test(value)) return { state: 'invalid' };
  const [day, month, year] = value.split('.').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { state: 'invalid' };
  }
  return { state: 'value', date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` };
}

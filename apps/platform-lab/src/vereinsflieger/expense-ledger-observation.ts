import { canonical } from '@moflight/flight-logbook';
import { sameContext, validateContext, type ObservedContext } from './context';
import { validateInformationCapture, type InformationCapture } from './information';
import { validateScope, type ProviderScope } from './scope-store';

/** Isolated E2 preparation. These are observed account coordinates, not attested
 * identities, financial kinds, stable charge IDs or source revision proofs.
 * No ordinary capture, persistence, backup or expense projection uses this yet. */
export interface FinancialLedgerObservation {
  version: 1;
  storeId: string;
  scope: ProviderScope;
  contextBefore: ObservedContext;
  contextAfter: ObservedContext;
  sourceAccount: { label: string; selector: string };
  ownNavigation: { label: string; url: string };
  pageAccountLabel: string;
  sourceUrl: string;
  capture: InformationCapture;
  reportedRowCount: number | null;
}

export interface FinancialObservationTarget { storeId: string; scope: ProviderScope }

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) {
    throw new Error('Invalid financial observation fields.');
  }
  return value as Record<string, unknown>;
}

function storeId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('Invalid financial store identity.');
  }
}

function label(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || value !== value.trim() || /[\r\n\u0000-\u001f]/.test(value)) {
    throw new Error('Invalid observed financial account label.');
  }
}

function accountUrl(value: unknown, selector: string): asserts value is string {
  if (typeof value !== 'string' || value.length > 512) throw new Error('Invalid own financial account route.');
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid own financial account route.'); }
  if (url.protocol !== 'https:' || !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(url.hostname) ||
      url.username || url.password || url.port || url.hash || url.pathname !== '/member/profile/account.php' ||
      [...url.searchParams.keys()].join(',') !== 'caid' || url.searchParams.get('caid') !== selector || url.href !== value) {
    throw new Error('Financial account route does not match observed own navigation.');
  }
}

/** Structural/scope validation only. A future trusted reader must establish the
 * actual own navigation, heading and before/after context with its nonce guards.
 * A self-asserted JSON payload is not authenticated by these comparisons. */
export function validateFinancialLedgerObservation(input: unknown, target: FinancialObservationTarget): FinancialLedgerObservation {
  const p = object(input, ['version', 'storeId', 'scope', 'contextBefore', 'contextAfter', 'sourceAccount',
    'ownNavigation', 'pageAccountLabel', 'sourceUrl', 'capture', 'reportedRowCount']);
  object(target, ['storeId', 'scope']); storeId(target.storeId); storeId(p.storeId);
  const scope = validateScope(p.scope), expectedScope = validateScope(target.scope);
  if (p.version !== 1 || p.storeId !== target.storeId || canonical(p.scope) !== canonical(scope) ||
      canonical(scope) !== canonical(expectedScope)) throw new Error('Foreign financial observation scope.');
  const before = validateContext(p.contextBefore), after = validateContext(p.contextAfter);
  if (!sameContext(before, scope.context) || !sameContext(after, scope.context) ||
      canonical(p.contextBefore) !== canonical(before) || canonical(p.contextAfter) !== canonical(after)) {
    throw new Error('Financial source context changed.');
  }
  const account = object(p.sourceAccount, ['label', 'selector']); label(account.label);
  if (typeof account.selector !== 'string' || !/^\d{1,20}$/.test(account.selector)) throw new Error('Unsupported financial account selector.');
  const navigation = object(p.ownNavigation, ['label', 'url']); label(navigation.label); label(p.pageAccountLabel);
  accountUrl(navigation.url, account.selector); accountUrl(p.sourceUrl, account.selector);
  if (navigation.label !== account.label || p.pageAccountLabel !== account.label || navigation.url !== p.sourceUrl) {
    throw new Error('Selected financial account changed.');
  }
  const capture = validateInformationCapture(p.capture);
  if (capture.category !== 'ledger' || capture.path !== '/member/profile/account.php' ||
      capture.owner !== scope.owner || capture.connectionId !== scope.connectionId) {
    throw new Error('Financial capture is outside its selected account scope.');
  }
  if (p.reportedRowCount !== null && (typeof p.reportedRowCount !== 'number' || !Number.isSafeInteger(p.reportedRowCount) ||
      p.reportedRowCount < capture.rows.length || p.reportedRowCount > 10_000_000)) {
    throw new Error('Invalid financial source row count.');
  }
  return { version: 1, storeId: p.storeId, scope, contextBefore: before, contextAfter: after,
    sourceAccount: { label: account.label, selector: account.selector },
    ownNavigation: { label: navigation.label, url: navigation.url }, pageAccountLabel: p.pageAccountLabel,
    sourceUrl: p.sourceUrl, capture, reportedRowCount: p.reportedRowCount as number | null };
}

/** Local observation partition only. Never use a booking number by itself or
 * treat this key/selector as proof of durable provider account/club identity. */
export function financialObservationAccountKey(input: unknown, target: FinancialObservationTarget): string {
  const value = validateFinancialLedgerObservation(input, target);
  return canonical({ version: value.version, storeId: value.storeId, scope: value.scope, sourceAccount: value.sourceAccount });
}

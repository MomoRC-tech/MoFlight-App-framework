import { canonical } from '@moflight/flight-logbook';
import { sameContext, validateContext, type ObservedContext } from './context';
import { detailReference } from './details';
import { parseObservedFinancialDate } from './expense-money-observation';
import { validateScope, type ProviderScope } from './scope-store';

export interface FlightBillingTarget {
  storeId: string;
  scope: ProviderScope;
  /** Must be read from the selected own profile, never inferred from crew. */
  ownRecipientLabel: string;
  /** Exact link freshly observed in that account's own flight list. */
  observedDetailUrl: string;
}

export interface FlightBillingRead {
  url: string;
  sourceFlightId: string;
  registrationRaw: string;
  dateRaw: string;
  billingModeRaw: string;
  billedRaw: 'Ja';
  clubLabel: string;
  lines: { position: number; recipientRaw: string; descriptionRaw: string; amountRaw: string }[];
  statedTotalRaw: string;
}

export interface FlightBillingObservation {
  version: 1;
  storeId: string;
  scope: ProviderScope;
  contextBefore: ObservedContext;
  contextAfter: ObservedContext;
  ownRecipientLabel: string;
  retrievedAt: string;
  source: FlightBillingRead;
  coverage: 'single-flight';
  interpretation: 'raw-source-only';
}

/** Isolated read-only E1 proof for the observed billed HTML layout. No navigation,
 * bridge, session/form access, writes, money calculation or PDF handling.
 * Unknown/unbilled/mixed-recipient layouts fail without returning private rows. */
export const FLIGHT_BILLING_READER_SOURCE = String.raw`(expected) => {
  const url = location.href, u = new URL(url);
  if (window.top !== window || url !== expected.observedDetailUrl || u.protocol !== 'https:' ||
      !['vereinsflieger.de', 'www.vereinsflieger.de'].includes(u.hostname) || u.username || u.password || u.port ||
      u.hash || u.pathname !== '/member/profile/viewflight.php' ||
      [...u.searchParams.keys()].join(',') !== 'flid' || !/^\d{1,20}$/.test(u.searchParams.get('flid') || '')) return { error: 'unexpected-page' };
  const shown = e => e.getClientRects().length > 0;
  const text = e => e?.innerText ?? e?.textContent ?? '';
  const tables = [...document.querySelectorAll('table.view')].filter(shown);
  if (tables.length !== 1 || tables[0].rows.length > 120) return { error: 'detail-table' };
  const rows = [...tables[0].rows].filter(shown);
  const headings = ['Allgemeine Daten', 'Flugdaten', 'Abrechnungsdaten'];
  const starts = headings.map(h => rows.map((r, i) => text(r.cells[0]).trim() === h ? i : -1).filter(i => i >= 0));
  if (starts.some(a => a.length !== 1) || !(starts[0][0] < starts[1][0] && starts[1][0] < starts[2][0])) return { error: 'sections' };
  const field = (label, from, to) => {
    const matches = rows.slice(from, to).filter(r => text(r.cells[0]).trim() === label);
    if (matches.length !== 1 || matches[0].cells.length !== 2 || matches[0].cells[1].querySelector('table')) throw new Error('field');
    const value = text(matches[0].cells[1]);
    if (!value.trim() || value.length > 2048) throw new Error('field');
    return value;
  };
  try {
    const sourceFlightId = field('Eintrag', starts[0][0], starts[1][0]).trim();
    const clubLabel = field('Verein', starts[0][0], starts[1][0]).trim();
    const registrationRaw = field('CallSign', starts[1][0], starts[2][0]);
    const dateRaw = field('Datum', starts[1][0], starts[2][0]);
    if (sourceFlightId !== u.searchParams.get('flid') || clubLabel !== expected.clubLabel) return { error: 'source-context' };
    if (field('Abgerechnet', starts[2][0], rows.length).trim() !== 'Ja') return { error: 'not-billed' };
    const billingModeRaw = field('Abrechnungsart', starts[2][0], rows.length);
    const groups = rows.slice(starts[2][0] + 1).filter(r => [...r.cells].some(c => c.querySelector('table')));
    if (groups.length !== 1 || groups[0].cells.length !== 2 || text(groups[0].cells[0]).trim() !== clubLabel) return { error: 'billing-group' };
    const nested = [...groups[0].cells[1].querySelectorAll('table')].filter(shown);
    if (nested.length !== 1) return { error: 'billing-table' };
    const feeRows = [...nested[0].rows];
    if (feeRows.length < 2 || feeRows.length > 21 || feeRows.some(r => !shown(r))) return { error: 'line-limit' };
    const lines = [];
    let statedTotalRaw;
    for (let position = 0; position < feeRows.length; position++) {
      const cells = [...feeRows[position].cells];
      if (cells.length !== 4 || cells.some(c => c.colSpan !== 1 || c.rowSpan !== 1 || c.querySelector('table')) || text(cells[3]).trim()) return { error: 'line-shape' };
      const [recipientRaw, descriptionRaw, amountRaw] = cells.map(text);
      if (descriptionRaw.trim() === 'Summe:') {
        if (position !== feeRows.length - 1 || recipientRaw.trim()) return { error: 'total-shape' };
        statedTotalRaw = amountRaw;
      } else {
        if (recipientRaw.trim() !== expected.ownRecipientLabel || !descriptionRaw.trim()) return { error: 'recipient-or-line' };
        lines.push({ position, recipientRaw, descriptionRaw, amountRaw });
      }
      if (!amountRaw.trim() || amountRaw.length > 128 || descriptionRaw.length > 2048 || recipientRaw.length > 200) return { error: 'field-limit' };
    }
    if (!statedTotalRaw || !lines.length) return { error: 'total-shape' };
    return { url, sourceFlightId, registrationRaw, dateRaw, billingModeRaw, billedRaw: 'Ja', clubLabel, lines, statedTotalRaw };
  } catch { return { error: 'unsupported-fields' }; }
}`;

function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      canonical(Object.keys(value).sort()) !== canonical([...keys].sort())) throw new Error('Unsupported flight billing fields.');
  return value as Record<string, unknown>;
}
function raw(value: unknown, max = 2048): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /\u0000/.test(value)) throw new Error('Invalid flight billing source text.');
}

/** Structural/scope validation, not authentication. A future trusted collector
 * must supply fresh profile/link evidence and native URL/stage/nonce guards.
 * Fee positions and invoice-labelled descriptions are observation addresses,
 * not proved charge keys/revisions. No E2 fact is created here. */
export function decodeFlightBillingObservation(
  input: unknown, target: FlightBillingTarget, selected: Pick<FlightBillingTarget, 'storeId' | 'scope'>,
  contextBefore: unknown, contextAfter: unknown, retrievedAt: string,
): FlightBillingObservation {
  object(target, ['storeId', 'scope', 'ownRecipientLabel', 'observedDetailUrl']);
  object(selected, ['storeId', 'scope']);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.storeId)) throw new Error('Invalid financial store identity.');
  const scope = validateScope(target.scope), before = validateContext(contextBefore), after = validateContext(contextAfter);
  const currentScope = validateScope(selected.scope);
  if (target.storeId !== selected.storeId || canonical(scope) !== canonical(currentScope) || canonical(currentScope) !== canonical(selected.scope) ||
      canonical(scope) !== canonical(target.scope) || canonical(before) !== canonical(contextBefore) ||
      canonical(after) !== canonical(contextAfter) || !sameContext(before, scope.context) || !sameContext(after, scope.context)) {
    throw new Error('Flight billing account context changed.');
  }
  raw(target.ownRecipientLabel, 200);
  if (target.ownRecipientLabel !== target.ownRecipientLabel.trim() || /[\r\n\u0000-\u001f]/.test(target.ownRecipientLabel)) throw new Error('Invalid own recipient label.');
  const id = detailReference(target.observedDetailUrl);
  if (!id || typeof retrievedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(retrievedAt) ||
      !Number.isFinite(Date.parse(retrievedAt)) || new Date(retrievedAt).toISOString() !== retrievedAt) throw new Error('Invalid flight billing provenance.');
  const p = object(input, ['url', 'sourceFlightId', 'registrationRaw', 'dateRaw', 'billingModeRaw', 'billedRaw', 'clubLabel', 'lines', 'statedTotalRaw']);
  if (p.url !== target.observedDetailUrl || p.sourceFlightId !== id || p.clubLabel !== scope.context.clubLabel || p.billedRaw !== 'Ja') {
    throw new Error('Mismatched billed flight source.');
  }
  raw(p.registrationRaw, 200); raw(p.dateRaw, 128); raw(p.billingModeRaw); raw(p.statedTotalRaw, 128);
  if (parseObservedFinancialDate(p.dateRaw).state !== 'value' || !Array.isArray(p.lines) || !p.lines.length || p.lines.length > 20) throw new Error('Unsupported billed flight rows.');
  const lines = Array.from(p.lines, (value, position) => {
    const line = object(value, ['position', 'recipientRaw', 'descriptionRaw', 'amountRaw']);
    raw(line.recipientRaw, 200); raw(line.descriptionRaw); raw(line.amountRaw, 128);
    if (line.position !== position || line.recipientRaw.trim() !== target.ownRecipientLabel || line.descriptionRaw.trim() === 'Summe:') throw new Error('Foreign or incomplete flight billing lines.');
    return { position, recipientRaw: line.recipientRaw, descriptionRaw: line.descriptionRaw, amountRaw: line.amountRaw };
  });
  return { version: 1, storeId: target.storeId, scope, contextBefore: before, contextAfter: after,
    ownRecipientLabel: target.ownRecipientLabel, retrievedAt,
    source: { url: target.observedDetailUrl, sourceFlightId: id, registrationRaw: p.registrationRaw, dateRaw: p.dateRaw,
      billingModeRaw: p.billingModeRaw, billedRaw: 'Ja', clubLabel: scope.context.clubLabel, lines, statedTotalRaw: p.statedTotalRaw },
    coverage: 'single-flight', interpretation: 'raw-source-only' };
}

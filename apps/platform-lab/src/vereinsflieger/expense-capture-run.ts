import { canonical } from '@moflight/flight-logbook';
import { CONTEXT_READER_SOURCE, PROFILE_URL, scopedBridge, validateContext, type ObservedContext } from './context';
import { detailReference } from './details';
import { decodeFlightBillingObservation, FLIGHT_BILLING_READER_SOURCE, validateFlightBillingObservation, type FlightBillingObservation, type FlightBillingRead } from './expense-flight-billing';
import { FinancialObservationStore, validateFinancialObservationTarget, type FinancialObservationReceipt } from './expense-observation-store';
import type { FinancialObservationTarget } from './expense-ledger-observation';

export const FINANCIAL_PROFILE_READER_SOURCE = String.raw`() => {
  const context = (${CONTEXT_READER_SOURCE})();
  if (context.error) return { error: 'profile-unavailable' };
  const rows = [...document.querySelectorAll('table.tablelist.alternative tr')];
  const field = label => {
    const found = rows.filter(r => r.cells[0]?.textContent.trim() === label);
    if (found.length !== 1 || found[0].cells.length !== 2) throw Error('profile');
    return found[0].cells[1].textContent.trim();
  };
  try {
    const first = field('Vorname'), last = field('Nachname'), ownRecipientLabel = last + ', ' + first;
    if (!first || !last || ownRecipientLabel.length > 200 || /[\r\n\u0000-\u001f]/.test(ownRecipientLabel)) return { error: 'profile-unavailable' };
    return { context, ownRecipientLabel };
  } catch { return { error: 'profile-unavailable' }; }
}`;

export const FINANCIAL_LINK_READER_SOURCE = String.raw`(expected) => {
  if (window.top !== window || location.href !== expected.listUrl) return { error: 'unexpected-page' };
  const tables = [...document.querySelectorAll('table#tablelist_20')].filter(t => t.getClientRects().length > 0);
  if (tables.length !== 1 || tables[0].rows.length > 502) return { error: 'list-unavailable' };
  const matches = [...tables[0].querySelectorAll('a[href]')].filter(a => a.getClientRects().length > 0 && a.href === expected.detailUrl);
  if (matches.length !== 1) return { error: 'link-unavailable' };
  return { url: location.href, detailUrl: matches[0].href };
}`;

type Profile = { context: ObservedContext; ownRecipientLabel: string };
type Stage = 'before' | 'list' | 'detail' | 'after' | 'ready' | 'saving' | 'save-uncertain' | 'done' | 'cancelled' | 'failed';
function exact(input: unknown, keys: string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input) || canonical(Object.keys(input).sort()) !== canonical(keys.sort())) throw Error('Unsupported financial capture response.');
  return input as Record<string, unknown>;
}
function profile(input: unknown): Profile {
  const p = exact(input, ['context', 'ownRecipientLabel']), context = validateContext(p.context);
  if (canonical(context) !== canonical(p.context) || typeof p.ownRecipientLabel !== 'string' || !p.ownRecipientLabel.trim() ||
      p.ownRecipientLabel !== p.ownRecipientLabel.trim() || p.ownRecipientLabel.length > 200 || /[\r\n\u0000-\u001f]/.test(p.ownRecipientLabel)) throw Error('Unverified financial profile.');
  return { context, ownRecipientLabel: p.ownRecipientLabel };
}

/** One explicitly requested billed detail, through the existing native bridge
 * ownership model. The adapter must detach other renderer owners, supply fresh
 * navigation/load events and an active current-owner lease guard. No filters,
 * pagination, provider writes, inference or ordinary-app activation here. */
export class FinancialCaptureRun {
  stage: Stage = 'before';
  failure: 'source-unavailable' | 'save-uncertain' | null = null;
  private readonly identity: string;
  private readonly detailUrl: string;
  private readonly listUrl: string;
  private seenNavigation = false;
  private before: Profile | null = null;
  private read: FlightBillingRead | null = null;
  private readAt: string | null = null;
  private value: FlightBillingObservation | null = null;
  constructor(selected: FinancialObservationTarget, readonly id: string, observedListUrl: string, observedDetailUrl: string) {
    this.identity = canonical(validateFinancialObservationTarget(selected));
    if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id) || !detailReference(observedDetailUrl)) throw Error('Invalid financial capture request.');
    const list = new URL(observedListUrl), detail = new URL(observedDetailUrl), origin = new URL(PROFILE_URL).origin;
    if (list.origin !== origin || detail.origin !== origin || list.username || list.password || list.hash || list.port ||
        list.pathname !== '/member/profile/flightlog.php' || list.href !== observedListUrl || observedListUrl.length > 2048 ||
        list.search) throw Error('Financial capture requires the current query-free own-list view.');
    this.detailUrl = observedDetailUrl; this.listUrl = observedListUrl;
  }
  get target(): FinancialObservationTarget { return JSON.parse(this.identity) as FinancialObservationTarget; }
  get url() { return this.stage === 'list' ? this.listUrl : this.stage === 'detail' ? this.detailUrl : PROFILE_URL; }
  get messageNonce() { return this.id + '-' + this.stage; }
  private get kind() { return this.stage === 'list' ? 'vf-financial-link-v1' : this.stage === 'detail' ? 'vf-financial-billing-v1' : 'vf-financial-profile-v1'; }
  get script(): string {
    if (!['before', 'list', 'detail', 'after'].includes(this.stage)) throw Error('Financial capture is not reading.');
    const source = this.stage === 'list' ? `(${FINANCIAL_LINK_READER_SOURCE})(${JSON.stringify({ listUrl: this.listUrl, detailUrl: this.detailUrl })})`
      : this.stage === 'detail' ? `(${FLIGHT_BILLING_READER_SOURCE})(${JSON.stringify({ observedDetailUrl: this.detailUrl,
        clubLabel: this.target.scope.context.clubLabel, ownRecipientLabel: this.before?.ownRecipientLabel })})` : `(${FINANCIAL_PROFILE_READER_SOURCE})()`;
    const field = this.stage === 'before' || this.stage === 'after' ? 'profile' : 'page';
    return `(()=>{let sent=false;const send=()=>{if(sent||document.readyState!=='complete')return;sent=true;window.ReactNativeWebView?.postMessage(JSON.stringify({kind:${JSON.stringify(this.kind)},nonce:${JSON.stringify(this.messageNonce)},url:location.href,${field}:${source}}));};if(document.readyState==='complete')send();else window.addEventListener('load',send,{once:true});})();true;`;
  }
  observeNavigation(url: string) { if (url === this.url && ['before', 'list', 'detail', 'after'].includes(this.stage)) this.seenNavigation = true; }
  private assertTarget(selected: FinancialObservationTarget) {
    if (canonical(validateFinancialObservationTarget(selected)) !== this.identity) throw Error('Expired financial capture target.');
  }
  accept(sender: string, documentUrl: string, input: unknown, selected: FinancialObservationTarget, at: string): 'ignored' | 'navigate' | 'save' {
    this.assertTarget(selected);
    if (!this.seenNavigation || !['before', 'list', 'detail', 'after'].includes(this.stage) ||
        !scopedBridge(sender, documentUrl, this.url) || !input || typeof input !== 'object') return 'ignored';
    const p = input as Record<string, unknown>;
    if (p.nonce !== this.messageNonce || p.url !== this.url || p.kind !== this.kind) return 'ignored';
    try {
      if (this.stage === 'before' || this.stage === 'after') {
        const observed = profile(p.profile);
        if (canonical(observed.context) !== canonical(this.target.scope.context)) throw Error('profile');
        if (this.stage === 'before') { this.before = observed; this.stage = 'list'; }
        else {
          if (!this.before || !this.read || !this.readAt || canonical(observed) !== canonical(this.before)) throw Error('profile');
          this.value = decodeFlightBillingObservation(this.read, { ...this.target, ownRecipientLabel: this.before.ownRecipientLabel,
            observedDetailUrl: this.detailUrl }, selected, this.before.context, observed.context, this.readAt);
          this.stage = 'ready';
        }
      } else if (this.stage === 'list') {
        const page = exact(p.page, ['url', 'detailUrl']);
        if (page.url !== this.listUrl || page.detailUrl !== this.detailUrl) throw Error('link');
        this.stage = 'detail';
      } else {
        if (!this.before) throw Error('profile');
        const checked = decodeFlightBillingObservation(p.page, { ...this.target, ownRecipientLabel: this.before.ownRecipientLabel,
          observedDetailUrl: this.detailUrl }, selected, this.before.context, this.before.context, at);
        this.read = checked.source; this.readAt = checked.retrievedAt; this.stage = 'after';
      }
      this.seenNavigation = false; return this.stage === 'ready' ? 'save' : 'navigate';
    } catch {
      this.stage = 'failed'; this.failure = 'source-unavailable'; this.before = null; this.read = null; this.value = null;
      throw Error('Financial source could not be verified; saved observations are preserved.');
    }
  }
  cancel(): boolean {
    if (this.stage === 'saving' || this.stage === 'done') return false;
    this.stage = 'cancelled'; this.before = null; this.read = null; this.value = null; return true;
  }
  /** Explicit save/retry only. A caller must provide the same current-owner
   * guard used by the store; losing acknowledgement is reconciled by receipt ID. */
  async save(store: FinancialObservationStore, current: () => FinancialObservationTarget, authorize: () => Promise<void>): Promise<FinancialObservationReceipt> {
    if (!['ready', 'save-uncertain'].includes(this.stage) || !this.value || canonical(store.target) !== this.identity) throw Error('Financial capture is not ready to save.');
    const value = validateFlightBillingObservation(this.value, this.target); this.stage = 'saving';
    const guard = async () => { await authorize(); this.assertTarget(current()); };
    try {
      await guard(); const existing = await store.find(this.id); await guard();
      if (existing && (existing.kind !== 'billed-flight' || canonical(existing.value) !== canonical(value))) throw Error('receipt');
      const receipt = existing ?? await store.save(this.id, 'billed-flight', value); await guard();
      this.stage = 'done'; return receipt;
    } catch { this.stage = 'save-uncertain'; this.failure = 'save-uncertain'; throw Error('Financial save acknowledgement unavailable; reconcile the original receipt before retrying.'); }
  }
  /** The native adapter/caller may lose acknowledgement after this inner save
   * completed. Reconciliation still uses this original value/ID, never recapture. */
  markSaveAcknowledgementUncertain(): void {
    if (this.stage === 'done') { this.stage = 'save-uncertain'; this.failure = 'save-uncertain'; }
  }
}

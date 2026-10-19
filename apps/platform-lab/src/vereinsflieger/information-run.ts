import { canonical } from '@moflight/flight-logbook';
import { PROFILE_URL, sameContext, scopedBridge, validateContext } from './context';
import { validateScope, type ProviderScope } from './scope-store';
import { informationCategoryUrl, validateInformationPage, type InformationCapture, type InformationCategory } from './information';

/** Fresh context -> original selected page -> fresh context -> explicit immutable save.
 * No provider writes/automatic traversal; stale/background/cancel events cannot publish.
 */
export class InformationRun {
  stage: 'before' | 'read' | 'after' | 'saving' | 'done' | 'cancelled' = 'before';
  private page: ReturnType<typeof validateInformationPage> | null = null;
  private navigationObserved = false;
  readonly scope: ProviderScope;
  constructor(scope: ProviderScope, readonly category: InformationCategory, readonly sourceUrl: string, readonly nonce: string) {
    this.scope = validateScope(scope);
    if (!informationCategoryUrl(category, sourceUrl) || !/^[a-zA-Z0-9_-]{1,100}$/.test(nonce)) throw new Error('Unsupported information request');
  }
  get url() { return this.stage === 'read' ? this.sourceUrl : PROFILE_URL; }
  get messageNonce() { return this.nonce + '-' + this.stage; }
  observeNavigation(url: string) { if (url === this.url && ['before','read','after'].includes(this.stage)) this.navigationObserved = true; }
  cancel() { if (this.stage !== 'saving' && this.stage !== 'done') { this.stage = 'cancelled'; this.page = null; } }
  assertScope(scope: ProviderScope) { if (canonical(validateScope(scope)) !== canonical(this.scope) || this.stage === 'cancelled' || this.stage === 'done') throw new Error('Expired information operation'); }
  accept(nativeUrl: string, currentUrl: string, input: unknown): 'navigate' | 'save' | 'ignored' {
    if (!this.navigationObserved || !['before','read','after'].includes(this.stage) || !scopedBridge(nativeUrl, currentUrl, this.url) || !input || typeof input !== 'object') return 'ignored';
    const p = input as Record<string, unknown>;
    if (p.nonce !== this.messageNonce || p.url !== this.url || p.kind !== (this.stage === 'read' ? 'vf-information-v1' : 'vf-context-v1')) return 'ignored';
    if (this.stage === 'read') {
      const page = validateInformationPage(p.page);
      if (page.category !== this.category || page.path !== new URL(this.sourceUrl).pathname) throw new Error('Information source changed');
      this.page = page; this.stage = 'after'; this.navigationObserved = false; return 'navigate';
    }
    if (!sameContext(validateContext(p.context), this.scope.context)) throw new Error('Provider context mismatch');
    this.stage = this.stage === 'before' ? 'read' : 'saving'; this.navigationObserved = false;
    return this.stage === 'saving' ? 'save' : 'navigate';
  }
  capture(at: string): InformationCapture {
    if (this.stage !== 'saving' || !this.page) throw new Error('Information is not verified for capture');
    return { ...this.page, version: 1, id: this.nonce, retrievedAt: at, owner: this.scope.owner, connectionId: this.scope.connectionId, sourceIdentity: 'provisional-observed-profile' };
  }
}

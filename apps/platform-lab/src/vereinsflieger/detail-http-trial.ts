import { PROFILE_URL, contextScript, sameContext, scopedBridge, validateContext, type ObservedContext } from './context';
import { DETAIL_LABELS, DETAIL_READER_SOURCE, decodeDetail, type DetailObservation } from './details';
import { compareDetailReads, decodeHttpDetail, detailHttpScript, detailListShape, type HttpDetailRead } from './detail-http-poc';

export interface DetailHttpEvidence {
  version: 1; id: string; startedAt: string; outcome: 'complete' | 'stopped';
  context?: ObservedContext; http?: HttpDetailRead; navigation?: DetailObservation;
  navigationMs?: number; comparison?: ReturnType<typeof compareDetailReads>;
  stages: Partial<Record<'profile' | 'http' | 'navigation' | 'verify', number>>;
  listShape?: ReturnType<typeof detailListShape>;
  failure?: { stage: 'profile' | 'http' | 'navigation' | 'verify' | 'confirmation'; reason: 'context-changed' | 'session-required' | 'response-rejected' | 'list-unsupported' | 'cancelled' | 'unavailable' | 'invalid-response' | 'stopped' };
  limit: 'development-only; visible-own-list; navigation-includes-renderer-creation; no-speedup-claim';
}
type Step = { kind: 'profile' | 'http' | 'navigation' | 'verify'; url: string; nonce: string; started: number };
export interface DetailHttpState { phase: 'idle' | 'running' | 'confirm' | 'complete' | 'stopped'; context?: ObservedContext; message: string; evidence?: DetailHttpEvidence }
/** One renderer owner and one bounded job. Revocation precedes persistence and retry. */
export class DetailHttpTrial {
  private step: Step | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private evidence: DetailHttpEvidence | null = null;
  private state: DetailHttpState = { phase: 'idle', message: 'Ein Flugdetail per HTTP und normaler Seitennavigation vergleichen.' };
  constructor(private ports: { uuid(): string; now(): number; active(): boolean; navigate(url: string): void;
    inject(script: string): void; revoke(): void; changed(state: DetailHttpState): void; save(evidence: DetailHttpEvidence): Promise<void>;
    schedule?(fn: () => void, ms: number): ReturnType<typeof setTimeout>; clear?(timer: ReturnType<typeof setTimeout>): void }, private expected?: ObservedContext) {}
  start() {
    if (this.state.phase === 'running' || this.state.phase === 'confirm' || !this.ports.active()) return;
    this.evidence = { version: 1, id: this.ports.uuid(), startedAt: new Date(this.ports.now()).toISOString(), outcome: 'stopped', stages: {}, limit: 'development-only; visible-own-list; navigation-includes-renderer-creation; no-speedup-claim' };
    this.update({ phase: 'running', message: 'Geschütztes Profil wird geprüft …' }); this.request('profile', PROFILE_URL);
  }
  confirm() {
    if (this.state.phase !== 'confirm' || !this.evidence?.context || !this.ports.active()) return;
    this.update({ ...this.state, phase: 'running', message: 'Frische eigene Liste und ein Detail werden per HTTP gelesen …' });
    this.request('http', PROFILE_URL, false);
    this.ports.inject(detailHttpScript(this.step!.nonce, this.evidence.context));
  }
  loaded(url: string) {
    const step = this.step;
    if (!step || !this.ports.active()) return;
    if (url !== step.url) { this.stop('Anmeldung oder andere Seite erkannt. Über Sync anmelden und erneut starten.'); return; }
    if (step.kind === 'http') return;
    this.ports.inject(step.kind === 'navigation' ? `window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-detail-navigation-v1',nonce:${JSON.stringify(step.nonce)},url:location.href,result:(${DETAIL_READER_SOURCE})(${JSON.stringify(DETAIL_LABELS)})}));true;` : contextScript(step.nonce));
  }
  receive(sender: string, document: string, raw: string) {
    const step = this.step;
    if (!step || !this.evidence || !this.ports.active() || raw.length > 200000 || !scopedBridge(sender, document, step.url)) return;
    let p: Record<string, unknown>;
    try { p = JSON.parse(raw); } catch { return; }
    if (!p || p.nonce !== step.nonce || p.url !== step.url) return;
    const kind = step.kind === 'http' ? 'vf-detail-http-v1' : step.kind === 'navigation' ? 'vf-detail-navigation-v1' : 'vf-context-v1';
    if (p.kind !== kind) return;
    this.clearTimer(); this.step = null;
    this.evidence.stages[step.kind] = Math.max(0, this.ports.now() - step.started);
    if (step.kind === 'http') this.evidence.listShape = detailListShape(p.listShape);
    try {
      if (step.kind === 'profile' || step.kind === 'verify') {
        const context = validateContext(p.context), previous = this.evidence.context ?? this.expected;
        if (previous && !sameContext(previous, context)) throw new Error('context-changed');
        if (step.kind === 'profile') {
          this.evidence.context = context;
          this.update({ phase: 'confirm', context, message: 'Beobachtetes Konto und aktuellen Verein für diesen einzelnen Versuch bestätigen.' });
        } else {
          this.evidence.outcome = 'complete';
          this.evidence.comparison = compareDetailReads(this.evidence.http!.observation, this.evidence.navigation!);
          this.finish('complete', 'Vergleich abgeschlossen. Einzelversuch; daraus folgt kein Geschwindigkeitsnachweis.');
        }
      } else if (step.kind === 'http') {
        this.evidence.http = decodeHttpDetail(p, this.evidence.context!, new Date(this.ports.now()).toISOString());
        this.update({ ...this.state, message: 'Dasselbe beobachtete Detail wird über die normale Seite gelesen …' });
        this.request('navigation', this.evidence.http.detailUrl);
      } else {
        this.evidence.navigation = decodeDetail(p.result, step.url, new Date(this.ports.now()).toISOString());
        this.evidence.navigationMs = Math.max(0, this.ports.now() - step.started);
        this.update({ ...this.state, message: 'Konto nach dem Seitenabruf wird erneut geprüft …' });
        this.request('verify', PROFILE_URL);
      }
    } catch(error) {
      const reason = ['context-changed','session-required','response-rejected','list-unsupported','cancelled','unavailable'].find(reason => reason === p.error || error instanceof Error && reason === error.message) as NonNullable<DetailHttpEvidence['failure']>['reason'] | undefined;
      this.evidence.failure = { stage: step.kind, reason: reason ?? 'invalid-response' };
      this.stop(`Versuch abgebrochen (${step.kind}: ${this.evidence.failure.reason}). Sitzung, Konto oder Antwort nicht bestätigt. Bibliothek bleibt erhalten.`);
    }
  }
  stop(message = 'Versuch gestoppt. Für einen neuen Versuch erneut starten.') {
    if (this.state.phase !== 'running' && this.state.phase !== 'confirm') return;
    if (this.step && this.evidence) this.evidence.stages[this.step.kind] = Math.max(0, this.ports.now() - this.step.started);
    if (this.evidence && !this.evidence.failure) this.evidence.failure = { stage: this.step?.kind ?? 'confirmation', reason: 'stopped' };
    this.finish('stopped', message);
  }
  dispose() { this.clearTimer(); this.step = null; this.ports.revoke(); }
  private request(kind: Step['kind'], url: string, navigate = true) {
    this.clearTimer(); const step = { kind, url, nonce: this.ports.uuid(), started: this.ports.now() }; this.step = step;
    this.timer = (this.ports.schedule ?? setTimeout)(() => { if (this.step === step) this.stop('Zeitlimit erreicht. Browser wurde getrennt; erneut starten möglich.'); }, kind === 'http' ? 12000 : 25000);
    if (navigate) this.ports.navigate(url);
  }
  private clearTimer() { if (this.timer !== null) (this.ports.clear ?? clearTimeout)(this.timer); this.timer = null; }
  private update(state: DetailHttpState) { this.state = state; this.ports.changed(state); }
  private finish(phase: 'complete' | 'stopped', message: string) {
    this.clearTimer(); this.step = null; this.ports.revoke();
    const evidence = JSON.parse(JSON.stringify(this.evidence)) as DetailHttpEvidence;
    this.update({ phase, message: message + ' Nachweis wird lokal gespeichert …', context: evidence.context, evidence });
    // A stale persistence completion cannot change a later run's state.
    const owner = this.evidence;
    void this.ports.save(evidence).then(() => { if (this.evidence === owner) this.update({ ...this.state, message }); }, () => {
      if (this.evidence === owner) this.update({ ...this.state, message: message + ' Nachweis konnte nicht gespeichert werden; nur im Arbeitsspeicher verfügbar.' });
    });
  }
}

/** Fixed categories/counters only: no identity, IDs, URLs, raw fields or error text. */
export function summarizeDetailHttpEvidence(e: DetailHttpEvidence) {
  return { kind: 'vf-detail-http-summary-v1', outcome: e.outcome,
    contextVerified: !!e.context, httpCaptured: !!e.http, navigationCaptured: !!e.navigation,
    ...(e.failure ? { failure: e.failure } : {}), stages: { ...e.stages },
    ...(e.listShape ? { listShape: e.listShape } : {}),
    ...(e.http ? { detailMs: e.http.detailMs, httpTotalMs: e.http.totalMs } : {}),
    ...(e.navigationMs !== undefined ? { navigationMs: e.navigationMs } : {}),
    ...(e.comparison ? { comparison: e.comparison } : {}),
  };
}

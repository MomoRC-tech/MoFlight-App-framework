import { canonical } from '@moflight/flight-logbook';
import { FinancialCaptureRun } from './expense-capture-run';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import type { FinancialObservationReceipt } from './expense-observation-store';

type Gate = () => Promise<void>;
export interface FinancialCaptureOptions {
  target: FinancialObservationTarget;
  observedListUrl: string;
  observedDetailUrl: string;
  authorize(gate: Gate): Promise<void>;
  save(run: FinancialCaptureRun, gate: Gate): Promise<FinancialObservationReceipt>;
}
export interface FinancialCaptureState {
  phase: 'idle' | 'reading' | 'saving' | 'save-uncertain';
  failure: 'source' | 'access' | 'cancelled' | 'timeout' | 'save-uncertain' | null;
}
interface Pending {
  run: FinancialCaptureRun; options: FinancialCaptureOptions; epoch: number;
  navigation: boolean; injected: boolean; injecting: boolean; processing: boolean; revoked: boolean; saving: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  resolve(receipt: FinancialObservationReceipt): void; reject(error: Error): void;
}
export interface FinancialCaptureRequestPorts {
  canStart(): boolean;
  current(target: FinancialObservationTarget): boolean;
  epoch(): number;
  navigate(url: string): void;
  inject(script: string): void;
  /** Stop loading and invalidate the native renderer epoch before releasing ownership. */
  revoke(): void;
  uuid(): string;
  now(): string;
  changed(state: FinancialCaptureState): void;
  schedule?(run: () => void, ms: number): ReturnType<typeof setTimeout>;
  clear?(timer: ReturnType<typeof setTimeout>): void;
}

/** One native renderer reservation. The parent owns admission, lifecycle and
 * native events; the run owns source validation, and the adapter owns storage.
 * A dispatched write holds the reservation until its acknowledgement settles. */
export class FinancialCaptureRequest {
  private pending: Pending | null = null;
  private uncertain: { run: FinancialCaptureRun; options: FinancialCaptureOptions } | null = null;
  constructor(private readonly ports: FinancialCaptureRequestPorts) {}
  active() { return this.pending !== null; }
  hasUncertainSave() { return this.uncertain !== null; }
  start(input: FinancialCaptureOptions): Promise<FinancialObservationReceipt> {
    if (this.pending || this.uncertain || !this.ports.canStart()) return Promise.reject(Error('Financial capture is unavailable.'));
    let run: FinancialCaptureRun;
    try { run = new FinancialCaptureRun(input.target, this.ports.uuid(), input.observedListUrl, input.observedDetailUrl); }
    catch { return Promise.reject(Error('Financial source request could not be verified.')); }
    return this.reserve(run, { ...input, target: run.target }, false);
  }
  /** No provider replay: reconcile the original captured value and receipt ID. */
  retrySave(): Promise<FinancialObservationReceipt> {
    const prior = this.uncertain;
    if (this.pending || !prior || !this.ports.canStart() || !this.ports.current(prior.run.target)) return Promise.reject(Error('Financial save reconciliation is unavailable.'));
    this.uncertain = null;
    return this.reserve(prior.run, prior.options, true);
  }
  private reserve(run: FinancialCaptureRun, options: FinancialCaptureOptions, saving: boolean): Promise<FinancialObservationReceipt> {
    return new Promise((resolve, reject) => {
      const p: Pending = { run, options, epoch: this.ports.epoch(), navigation: false, injected: false, injecting: false,
        processing: false, revoked: false, saving, timer: null, resolve, reject };
      this.pending = p;
      this.ports.changed({ phase: saving ? 'saving' : 'reading', failure: null });
      p.timer = (this.ports.schedule ?? setTimeout)(() => { if (this.pending === p) this.interrupt('timeout'); }, 90_000);
      void (async () => {
        try { if (saving) await this.save(p); else await this.advance(p); }
        catch { this.fail(p, 'access'); }
      })();
    });
  }
  private current(p: Pending) {
    return this.pending === p && !p.revoked && this.ports.current(p.run.target) && p.epoch === this.ports.epoch();
  }
  private async gate(p: Pending) {
    if (!this.current(p)) throw Error('Expired financial request.');
    await p.options.authorize(async () => { if (!this.current(p)) throw Error('Expired financial request.'); });
    if (!this.current(p)) throw Error('Expired financial request.');
  }
  private async advance(p: Pending) {
    await this.gate(p);
    p.navigation = false; p.injected = false; p.injecting = false;
    this.ports.navigate(p.run.url); p.epoch = this.ports.epoch();
    if (!this.current(p)) throw Error('Expired financial navigation.');
  }
  /** False blocks unexpected top-level navigation while this renderer is held. */
  allowNavigation(url: string, epoch: number): boolean {
    const p = this.pending;
    if (!p) return true;
    if (epoch !== p.epoch || epoch !== this.ports.epoch()) return false;
    if (!this.current(p) || p.saving || url !== p.run.url) { this.interrupt('source'); return false; }
    return true;
  }
  navigationStarted(url: string, epoch: number): void {
    const p = this.pending;
    if (!p || epoch !== p.epoch || epoch !== this.ports.epoch()) return;
    if (!this.allowNavigation(url, epoch)) return;
    p.navigation = true; p.run.observeNavigation(url);
  }
  /** Consumes owned load events; repeated load-end cannot inject twice. */
  pageLoaded(url: string, epoch: number): boolean {
    const p = this.pending;
    if (!p) return false;
    if (epoch !== p.epoch || epoch !== this.ports.epoch()) return true;
    if (!this.current(p) || !p.navigation || url !== p.run.url) { this.interrupt('source'); return true; }
    if (p.saving) return true;
    if (!p.injected && !p.injecting) {
      p.injecting = true;
      void (async () => {
        try { await this.gate(p); p.injected = true; this.ports.inject(p.run.script); }
        catch { this.fail(p, 'access'); }
        finally { p.injecting = false; }
      })();
    }
    return true;
  }
  async receive(sender: string, document: string, raw: string, epoch: number): Promise<boolean> {
    const p = this.pending;
    if (!p) return false;
    if (epoch !== p.epoch || epoch !== this.ports.epoch() || p.saving || p.processing || !p.injected || raw.length > 300_000) return true;
    let packet: unknown;
    try { packet = JSON.parse(raw); } catch { return true; }
    p.processing = true;
    try {
      await this.gate(p);
      const action = p.run.accept(sender, document, packet, p.run.target, this.ports.now());
      if (action === 'navigate') await this.advance(p);
      else if (action === 'save') await this.save(p);
    } catch { this.fail(p, 'source'); }
    finally { p.processing = false; }
    return true;
  }
  private async save(p: Pending) {
    // From here a failed guard/acknowledgement may hide a committed receipt.
    p.saving = true; this.ports.changed({ phase: 'saving', failure: null });
    try {
      await this.gate(p);
      const receipt = await p.options.save(p.run, () => this.gate(p));
      await this.gate(p);
      if (receipt.id !== p.run.id || canonical(receipt.value.scope) !== canonical(p.run.target.scope) || receipt.value.storeId !== p.run.target.storeId) throw Error('Foreign financial save result.');
      this.finish(p); this.ports.changed({ phase: 'idle', failure: null }); p.resolve(receipt);
    } catch {
      if (this.pending !== p) return;
      p.run.markSaveAcknowledgementUncertain();
      this.uncertain = { run: p.run, options: p.options };
      this.revoke(p); this.finish(p);
      this.ports.changed({ phase: 'save-uncertain', failure: 'save-uncertain' });
      p.reject(Error('Financial save acknowledgement unavailable; reconcile the original receipt explicitly.'));
    }
  }
  /** User dismissal cannot release a write that has already been dispatched. */
  cancel(): boolean {
    if (this.pending?.saving) return false;
    if (this.pending) this.interrupt('cancelled');
    return true;
  }
  /** Lifecycle/owner/renderer revocation; in-flight writes settle under revoked guards. */
  interrupt(reason: Exclude<FinancialCaptureState['failure'], 'save-uncertain' | null> = 'access') {
    const p = this.pending;
    if (!p) return;
    this.revoke(p);
    if (!p.saving) {
      p.run.cancel(); this.finish(p); this.ports.changed({ phase: 'idle', failure: reason });
      p.reject(Error('Financial capture stopped; saved observations are preserved.'));
    }
  }
  private revoke(p: Pending) {
    if (p.revoked) return;
    p.revoked = true;
    try { this.ports.revoke(); } catch { /* Revoked request checks still reject every late callback. */ }
  }
  private fail(p: Pending, failure: 'source' | 'access') {
    if (this.pending !== p) return;
    this.interrupt(failure);
  }
  private finish(p: Pending) {
    if (this.pending !== p) return;
    this.pending = null;
    if (p.timer !== null) (this.ports.clear ?? clearTimeout)(p.timer);
  }
}

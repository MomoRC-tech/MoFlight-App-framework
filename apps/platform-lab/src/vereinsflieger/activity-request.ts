import { activityProbeScript, decodeActivityProbe, type ActivityProbeResult } from './activity-probe';
import { PROFILE_URL, scopedBridge, type ObservedContext } from './context';

export interface ActivityRead extends ActivityProbeResult { observedAt: number }
/** A reservation survives cancellation until the script settles or its renderer is replaced. */
export class ActivityRequest {
  private pending: { nonce: string; cancelled: boolean; current: () => boolean; terminate: () => void;
    resolve: (value: ActivityRead | null) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  constructor(private ports: { inject(script: string): void; uuid(): string; now(): number;
    changed(active: boolean): void; schedule?(run: () => void, ms: number): ReturnType<typeof setTimeout>;
    clear?(timer: ReturnType<typeof setTimeout>): void }) {}
  active() { return this.pending !== null; }
  start(expected: ObservedContext, options: { current(): boolean; terminate(): void; beforeStart?(): Promise<void> }): Promise<ActivityRead | null> {
    if (this.pending || !options.current()) return Promise.resolve(null);
    return new Promise(resolve => {
      const pending = { nonce: this.ports.uuid(), cancelled: false, current: options.current, terminate: options.terminate, resolve,
        timer: undefined as unknown as ReturnType<typeof setTimeout> };
      this.pending = pending; this.ports.changed(true);
      pending.timer = (this.ports.schedule ?? setTimeout)(() => {
        if (this.pending !== pending) return;
        // No new provider job can start while the timed-out renderer remains owned.
        try { pending.terminate(); } catch { /* Renderer revocation is best effort; stale callbacks remain rejected. */ } finally { this.finish(null); }
      }, 12_000);
      void (async () => {
        try {
          await options.beforeStart?.();
          if (this.pending !== pending || pending.cancelled || !pending.current()) { if (this.pending === pending) this.finish(null); return; }
          this.ports.inject(activityProbeScript(pending.nonce, expected));
        } catch { if (this.pending === pending) this.finish(null); }
      })();
    });
  }
  receive(sender: string, document: string, raw: string): boolean {
    if (raw.length > 12_000) return false;
    let value: { kind?: string; nonce?: string };
    try { value = JSON.parse(raw); } catch { return false; }
    if (!value || value.kind !== 'vf-activity-v1') return false;
    const pending = this.pending;
    if (!pending || value.nonce !== pending.nonce || !scopedBridge(sender, document, PROFILE_URL)) return true;
    if (pending.cancelled || !pending.current()) { this.finish(null); return true; }
    try { this.finish({ ...decodeActivityProbe(value), observedAt: this.ports.now() }); }
    catch { this.finish(null); }
    return true;
  }
  cancel(): Promise<void> {
    const pending = this.pending;
    if (!pending) return Promise.resolve();
    pending.cancelled = true;
    const settled = new Promise<void>(resolve => {
      const previous = pending.resolve;
      pending.resolve = value => { previous(value); resolve(); };
    });
    try { this.ports.inject('window.__moflightActivityAbort?.();true;'); } catch { try { pending.terminate(); } catch { /* Renderer revocation is best effort; stale callbacks remain rejected. */ } finally { this.finish(null); } }
    return settled;
  }
  /** Caller has unmounted/replaced the renderer or otherwise revoked its native epoch. */
  abandon() { this.finish(null); }
  private finish(value: ActivityRead | null) {
    const pending = this.pending; if (!pending) return;
    this.pending = null; (this.ports.clear ?? clearTimeout)(pending.timer);
    this.ports.changed(false); pending.resolve(value);
  }
}

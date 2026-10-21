/** Support data is constructed from fixed vocabulary, never redacted from raw logs. */
export const diagnosticActions = ['update-flights', 'open-flight-tools', 'library-operation', 'read-flights', 'read-flight-detail'] as const;
export const diagnosticCodes = ['none', 'operation-failed', 'owner-setup', 'provider-handoff', 'account-verification', 'account-mismatch', 'recovery-required', 'source-timeout', 'source-failed', 'cancelled', 'background', 'closed', 'interrupted', 'medical-failed', 'medical-skipped', 'stale-selection'] as const;
export const diagnosticStages = ['owner-registry-open', 'owner-selection', 'owner-setup', 'restore-inspection', 'stored-view', 'receipt-recovery', 'source-retrieval', 'source-review', 'command-prepare', 'explicit-save', 'command-resolve', 'medical', 'local-read', 'detail-read', 'provider-view-snapshot', 'provider-view-backup', 'provider-view-backup-load', 'provider-view-backup-verify', 'provider-view-restore', 'provider-view-verify', 'provider-export-reset', 'provider-export-columns', 'provider-export-clear', 'provider-export-participation', 'provider-export-period', 'provider-export-read', 'provider-other-stage'] as const;
export type DiagnosticAction = typeof diagnosticActions[number];
export type DiagnosticCode = typeof diagnosticCodes[number];
export type DiagnosticOutcome = 'running' | 'success' | 'partial' | 'failed' | 'blocked' | 'cancelled' | 'interrupted';
export interface DiagnosticEntry {
  sequence: number;
  action: DiagnosticAction;
  outcome: DiagnosticOutcome;
  code: DiagnosticCode;
  milliseconds: number;
  stages: { name: typeof diagnosticStages[number]; calls: number; failures: number; milliseconds: number }[];
}
export interface DiagnosticOperation {
  running(): boolean;
  finish(outcome: Exclude<DiagnosticOutcome, 'running'>, code?: DiagnosticCode): void;
}
interface Storage { read(): string | null; write(text: string): void }
const outcomes: DiagnosticOutcome[] = ['running', 'success', 'partial', 'failed', 'blocked', 'cancelled', 'interrupted'];
const member = <T extends string>(values: readonly T[], value: unknown): value is T => typeof value === 'string' && values.includes(value as T);
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(86_400_000, Math.max(0, Math.round(value))) : 0;

export class DiagnosticJournal {
  private entries: DiagnosticEntry[] = [];
  private starts = new Map<number, number>();
  private sequence = 0;
  private listeners = new Set<() => void>();
  private storage: Storage | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  storageFailed = false;
  constructor(private readonly now = () => performance.now()) {}

  /** Bounded, reconstructed allowlist on load. Never copy unknown fields. */
  connect(storage: Storage) {
    if (this.storage) return;
    this.storage = storage;
    try {
      const text = storage.read();
      if (text && text.length > 65536) throw new Error('Oversize diagnostic journal');
      const parsed: unknown = text ? JSON.parse(text) : null;
      if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1 && 'entries' in parsed && Array.isArray(parsed.entries)) {
        const loaded: DiagnosticEntry[] = [];
        for (const raw of parsed.entries.slice(-5)) {
          if (!raw || !member(diagnosticActions, raw.action) || !member(outcomes, raw.outcome)) continue;
          const stages: DiagnosticEntry['stages'] = [];
          for (const stage of Array.isArray(raw.stages) ? raw.stages.slice(0, diagnosticStages.length) : []) {
            if (!stage || !member(diagnosticStages, stage.name) || stages.some(s => s.name === stage.name)) continue;
            stages.push({ name: stage.name, calls: number(stage.calls), failures: number(stage.failures), milliseconds: number(stage.milliseconds) });
          }
          loaded.push({ sequence: loaded.length + 1, action: raw.action, outcome: raw.outcome === 'running' ? 'interrupted' : raw.outcome,
            code: raw.outcome === 'running' ? 'interrupted' : member(diagnosticCodes, raw.code) ? raw.code : 'none', milliseconds: number(raw.milliseconds), stages });
        }
        // Child effects can start a local read before the root connects storage.
        // Preserve those live handles/clocks while placing restored history first.
        const previousStarts=new Map(this.starts); this.starts.clear();
        for (const entry of this.entries) {
          const start = previousStarts.get(entry.sequence);
          entry.sequence += loaded.length; if (start !== undefined) this.starts.set(entry.sequence, start);
        }
        this.sequence += loaded.length;
        this.entries = [...loaded, ...this.entries].slice(-5);
      }
    } catch { this.storageFailed = true; }
    this.changed(true);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot(): DiagnosticEntry[] {
    return this.entries.map(entry => ({ ...entry, milliseconds: this.starts.has(entry.sequence) ? number(this.now() - this.starts.get(entry.sequence)!) : entry.milliseconds,
      stages: entry.stages.map(stage => ({ ...stage })) }));
  }
  export() { return JSON.stringify({ format: 'MoFlight support diagnostics', version: 1, timing: 'milliseconds; nested phases overlap; no wall-clock timestamps', entries: this.snapshot() }, null, 2); }
  clear() { this.entries = []; this.starts.clear(); this.changed(true); }
  begin(action: DiagnosticAction): DiagnosticOperation {
    // Runtime guard also protects JS callers and future unsafe casts.
    if (!member(diagnosticActions, action)) throw new Error('Unsupported diagnostic action');
    const entry: DiagnosticEntry = { sequence: ++this.sequence, action, outcome: 'running', code: 'none', milliseconds: 0, stages: [] };
    this.entries.push(entry); this.entries = this.entries.slice(-5);
    for (const id of this.starts.keys()) if (!this.entries.some(item => item.sequence === id)) this.starts.delete(id);
    this.starts.set(entry.sequence, this.now()); this.changed(true);
    return { running: () => this.entries.includes(entry) && entry.outcome === 'running', finish: (outcome, code = 'none') => {
      if (!this.entries.includes(entry) || entry.outcome !== 'running' || !member(['success','partial','failed','blocked','cancelled','interrupted'], outcome)) return;
      entry.milliseconds = number(this.now() - this.starts.get(entry.sequence)!); this.starts.delete(entry.sequence);
      entry.outcome = outcome; entry.code = member(diagnosticCodes, code) ? code : 'operation-failed'; this.changed(true);
    } };
  }
  /** Capture ownership at span start; late completions cannot enter a later action. */
  span(rawName: string): (succeeded: boolean) => void {
    const entry = [...this.entries].reverse().find(item => item.outcome === 'running');
    const name = member(diagnosticStages, rawName) ? rawName : rawName.startsWith('provider-') ? 'provider-other-stage' : null;
    const start = this.now(); let finished = false;
    return succeeded => {
      if (finished) return; finished = true;
      if (!entry || !name || !this.entries.includes(entry)) return;
      let stage = entry.stages.find(item => item.name === name);
      if (!stage) { stage = { name, calls: 0, failures: 0, milliseconds: 0 }; entry.stages.push(stage); }
      stage.calls = number(stage.calls + 1); stage.failures = number(stage.failures + (succeeded ? 0 : 1)); stage.milliseconds = number(stage.milliseconds + this.now() - start);
      this.changed(false);
    };
  }
  private changed(immediate: boolean) {
    const persist = () => {
      this.timer = undefined;
      if (this.storage) { try { this.storage.write(this.export()); this.storageFailed = false; } catch { this.storageFailed = true; } }
    };
    if (immediate) { clearTimeout(this.timer); persist(); }
    else if (!this.timer && this.storage) this.timer = setTimeout(persist, 250);
    for (const listener of this.listeners) listener();
  }
}
export const diagnosticJournal = new DiagnosticJournal();

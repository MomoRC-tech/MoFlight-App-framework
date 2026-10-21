import { diagnosticActions, diagnosticCodes, diagnosticStages, journeyKinds, journeyTargets, counterNames, outcomes, member, boundedNumber as number, object, array, utf8Bytes,
  type DiagnosticAction, type DiagnosticCode, type DiagnosticStage, type DiagnosticOutcome } from './diagnostic-vocabulary';
export { diagnosticActions, diagnosticCodes, diagnosticStages, journeyKinds, journeyTargets, counterNames, utf8Bytes } from './diagnostic-vocabulary';
export type { DiagnosticAction, DiagnosticCode, DiagnosticStage, DiagnosticOutcome } from './diagnostic-vocabulary';

/** Decimal MB, across journal and managed export; no temporary file duplication. */
export const DIAGNOSTIC_STORAGE_BYTES = 1_000_000;
export const DIAGNOSTIC_FILE_BYTES = 490_000;
export const DIAGNOSTIC_RETENTION_MS = 14 * 86_400_000;
type Counter = { calls: number; failures: number; milliseconds: number };
const stateNames = ['library','save','provider'] as const;
const stateValues = ['unknown','ready','read-only','pending','receipt-confirmed','account-verified','failed'] as const;
type ObservedState = Partial<Record<typeof stateNames[number], typeof stateValues[number]>>;
type Checkpoint = { name: DiagnosticStage; state: 'start' | 'success' | 'failed'; offset: number };
export interface DiagnosticEntry {
  sequence: number; session: number; action: DiagnosticAction; outcome: DiagnosticOutcome; code: DiagnosticCode; milliseconds: number;
  trigger: 'user' | 'automatic'; offset: number;
  stages: { name: DiagnosticStage; calls: number; failures: number; milliseconds: number; maximum: number; counters?: Partial<Record<typeof counterNames[number], Counter>> }[];
  activeStages: DiagnosticStage[]; checkpoints: Checkpoint[];
  observedState: ObservedState;
}
export interface JourneyEvent { sequence: number; session: number; offset: number; kind: typeof journeyKinds[number]; target: typeof journeyTargets[number] }
type Dated<T> = T & { retainedAt: number };
interface Failure { operation: DiagnosticEntry; preceding: JourneyEvent[] }
export interface DiagnosticOperation {
  running(): boolean;
  finish(outcome: Exclude<DiagnosticOutcome, 'running'>, code?: DiagnosticCode): void;
  span(name: string): (succeeded: boolean, counters?: unknown) => void;
  note(key: typeof stateNames[number], state: typeof stateValues[number]): void;
}
interface Storage { read(): string | null; write(text: string): void | Promise<void>; clearExport?(): void | Promise<void> }
type Context = { appVersion?: string; buildVersion?: string; buildSource?: string; androidApi?: number; webViewVersion?: string; platform?: 'android' | 'ios'; buildMode?: 'development' | 'release' };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const failures: DiagnosticOutcome[] = ['failed', 'blocked', 'partial', 'interrupted'];
const cleanCounters = (value: unknown) => {
  const result: Partial<Record<typeof counterNames[number], Counter>> = {}, source = object(value);
  for (const key of counterNames) if (source[key]) { const c = object(source[key]); result[key] = { calls: number(c.calls), failures: number(c.failures), milliseconds: number(c.milliseconds) }; }
  return result;
};
const cleanContext = (value: unknown): Context => {
  const raw=object(value), next:Context={};
  for(const key of ['appVersion','buildVersion','webViewVersion'] as const)if(typeof raw[key]==='string'&&/^[0-9]{1,10}(?:\.[0-9]{1,10}){0,4}$/.test(raw[key] as string)&&(raw[key] as string).length<=40)next[key]=raw[key] as string;
  if(typeof raw.buildSource==='string'&&/^[a-f0-9]{7,40}$/.test(raw.buildSource))next.buildSource=raw.buildSource;
  if(typeof raw.androidApi==='number'&&raw.androidApi>=24&&raw.androidApi<=100)next.androidApi=number(raw.androidApi);
  if(member(['android','ios'],raw.platform))next.platform=raw.platform;
  if(member(['development','release'],raw.buildMode))next.buildMode=raw.buildMode;
  return next;
};

export class DiagnosticJournal {
  private entries: Dated<DiagnosticEntry>[] = [];
  private events: Dated<JourneyEvent>[] = [];
  private protectedFailures: Dated<Failure>[] = [];
  private starts = new Map<DiagnosticEntry, number>();
  private sizes = new WeakMap<object, number>();
  private sequence = 0; private session = 1; private origin: number;
  private foreground = true;
  private currentScreen: typeof journeyTargets[number] | null = null;
  private lastCheckpointWrite = -Infinity;
  private context: Context = {};
  private contexts: Dated<{session:number;context:Context}>[]=[];
  private listeners = new Set<() => void>();
  private storage: Storage | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private writing: Promise<void> | null = null;
  private pending: string | null = null;
  private exportClearFailed = false;
  clearVersion = 0;
  storageFailed = false;
  constructor(private readonly now = () => performance.now(), private readonly wall = () => Date.now()) { this.origin = now(); }
  setContext(value: unknown) {
    this.context = { ...this.context, ...cleanContext(value) };
    this.contexts=this.contexts.filter(c=>c.session!==this.session);this.contexts.push({session:this.session,context:{...this.context},retainedAt:this.wall()});this.changed(false);
  }
  private date(value: unknown, legacy = false) {
    const date = legacy ? this.wall() : number(value, Number.MAX_SAFE_INTEGER);
    return date <= this.wall() && date > this.wall() - DIAGNOSTIC_RETENTION_MS ? date : null;
  }
  private cleanEntry(value: unknown, legacy: boolean): Dated<DiagnosticEntry> | null {
    const raw = object(value), retainedAt = this.date(raw.retainedAt, legacy);
    if (retainedAt === null || !member(diagnosticActions, raw.action) || !member(outcomes, raw.outcome)) return null;
    const stages: DiagnosticEntry['stages'] = [];
    for (const item of array(raw.stages).slice(0, diagnosticStages.length)) {
      const s = object(item); if (!member(diagnosticStages, s.name) || stages.some(stage => stage.name === s.name)) continue;
      stages.push({ name: s.name, calls: number(s.calls), failures: number(s.failures), milliseconds: number(s.milliseconds), maximum: number(s.maximum), counters: cleanCounters(s.counters) });
    }
    const checkpoints: Checkpoint[] = [];
    for (const item of array(raw.checkpoints).slice(-32)) { const c = object(item); if (member(diagnosticStages, c.name) && member(['start','success','failed'], c.state)) checkpoints.push({ name: c.name, state: c.state, offset: number(c.offset) }); }
    const observedState: ObservedState={}, states=object(raw.observedState);
    for(const key of stateNames)if(member(stateValues,states[key]))observedState[key]=states[key];
    return { sequence: number(raw.sequence, 1e12), session: number(raw.session, 1e12), action: raw.action, outcome: raw.outcome === 'running' ? 'interrupted' : raw.outcome,
      code: raw.outcome === 'running' ? 'interrupted' : member(diagnosticCodes, raw.code) ? raw.code : 'none', milliseconds: number(raw.milliseconds), trigger: raw.trigger === 'user' ? 'user' : 'automatic', offset: number(raw.offset),
      stages, activeStages: array(raw.activeStages).filter((v): v is DiagnosticStage => member(diagnosticStages, v)).slice(-8), checkpoints, observedState, retainedAt };
  }
  private cleanEvent(value: unknown): Dated<JourneyEvent> | null {
    const raw = object(value), retainedAt = this.date(raw.retainedAt);
    return retainedAt !== null && member(journeyKinds, raw.kind) && member(journeyTargets, raw.target) ? { sequence: number(raw.sequence, 1e12), session: number(raw.session, 1e12), offset: number(raw.offset), kind: raw.kind, target: raw.target, retainedAt } : null;
  }
  connect(storage: Storage) {
    if (this.storage) return; this.storage = storage;
    try {
      const text = storage.read(); if (text && utf8Bytes(text) > DIAGNOSTIC_FILE_BYTES) throw new Error('Oversize journal');
      const parsed = object(text ? JSON.parse(text) : null), legacy = parsed.version === 1;
      if (legacy || parsed.version === 2) {
        const loaded = array(parsed.entries).slice(-600).map(v => this.cleanEntry(v, legacy)).filter((v): v is Dated<DiagnosticEntry> => v !== null);
        const events = array(parsed.events).slice(-2000).map(v => this.cleanEvent(v)).filter((v): v is Dated<JourneyEvent> => v !== null);
        const preserved: Dated<Failure>[] = [];
        for (const value of array(parsed.failures).slice(-5)) {
          const raw = object(value), operation = this.cleanEntry(raw.operation, false), retainedAt = this.date(raw.retainedAt);
          if (!operation || retainedAt === null || !failures.includes(operation.outcome)) continue;
          const preceding = array(raw.preceding).slice(-12).map(v => this.cleanEvent(v)).filter((v): v is Dated<JourneyEvent> => v !== null);
          preserved.push({ operation, preceding, retainedAt });
        }
        const contexts:Dated<{session:number;context:Context}>[]=[];
        for(const value of array(parsed.sessions).slice(-32)){const raw=object(value),retainedAt=this.date(raw.retainedAt);if(retainedAt!==null)contexts.push({session:number(raw.session,1e12),context:cleanContext(raw.context),retainedAt});}
        let seq = 0, session = 0;
        for(const value of contexts)session=Math.max(session,value.session);
        for (const value of [...loaded, ...events, ...preserved.map(f => f.operation)]) { seq = Math.max(seq, value.sequence); session = Math.max(session, value.session); }
        for (const entry of loaded) if (entry.sequence === 0) entry.sequence = ++seq;
        for (const entry of this.entries) { entry.sequence += seq; entry.session += session; this.sizes.delete(entry); }
        for (const event of this.events) { event.sequence += seq; event.session += session; this.sizes.delete(event); }
        for(const failure of this.protectedFailures){failure.operation.sequence+=seq;failure.operation.session+=session;for(const event of failure.preceding){event.sequence+=seq;event.session+=session;}this.sizes.delete(failure);}
        for(const context of this.contexts){context.session+=session;this.sizes.delete(context);}
        this.sequence += seq; this.session += session;
        this.contexts=[...contexts,...this.contexts];
        this.entries = [...loaded, ...this.entries]; this.events = [...events, ...this.events]; this.protectedFailures = [...preserved,...this.protectedFailures];
        for (const entry of loaded) if (failures.includes(entry.outcome)&&!this.protectedFailures.some(f=>f.operation.sequence===entry.sequence&&f.operation.session===entry.session)) this.protect(entry);
      }
    } catch { this.storageFailed = true; }
    this.record('lifecycle', 'start'); this.changed(true);
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private trim<T extends { retainedAt: number }>(values: T[], count: number, bytes: number): T[] {
    values = values.filter(value => this.date(value.retainedAt) !== null).slice(-count);
    let used = 0;
    for (let i = values.length - 1; i >= 0; i--) { const value = values[i]!; let size = this.sizes.get(value); if (size === undefined) { size = utf8Bytes(JSON.stringify(value)) + 1; this.sizes.set(value, size); } used += size; if (used > bytes) return values.slice(i + 1); }
    return values;
  }
  private prune() {
    this.entries = this.trim(this.entries, 600, 240_000); this.events = this.trim(this.events, 2000, 180_000); this.protectedFailures = this.trim(this.protectedFailures, 5, 48_000);
    this.contexts=this.trim(this.contexts,32,8000);
    for (const entry of this.starts.keys()) if (!this.entries.includes(entry as Dated<DiagnosticEntry>)) this.starts.delete(entry);
  }
  private view(entry: DiagnosticEntry): DiagnosticEntry {
    const { sequence, session, action, outcome, code, trigger, offset, stages, activeStages, checkpoints, observedState } = entry;
    return clone({ sequence, session, action, outcome, code, trigger, offset, milliseconds: this.starts.has(entry) ? number(this.now() - this.starts.get(entry)!) : entry.milliseconds, stages, activeStages, checkpoints, observedState });
  }
  snapshot(): DiagnosticEntry[] { this.prune(); return this.entries.map(entry => this.view(entry)); }
  journey(): JourneyEvent[] { this.prune(); return this.events.map(({ sequence, session, offset, kind, target }) => ({ sequence, session, offset, kind, target })); }
  failureSnapshot(): Failure[] { this.prune(); return this.protectedFailures.map(f => ({ operation: this.view(f.operation), preceding: f.preceding.map(({ sequence, session, offset, kind, target }) => ({ sequence, session, offset, kind, target })) })); }
  journeySummary() {
    const paths = new Map<string, { path: string; occurrences: number }>(); let previous: JourneyEvent | null = null;
    for (const event of this.journey()) { if(event.kind==='lifecycle'){previous=null;continue;} if (event.kind === 'screen') { if (previous && previous.session === event.session && previous.target !== event.target) { const path = `${previous.target} → ${event.target}`, known = paths.get(path); if (known) known.occurrences++; else paths.set(path, { path, occurrences: 1 }); } previous = event; } }
    return [...paths.values()].sort((a,b) => b.occurrences - a.occurrences).slice(0,20);
  }
  private report() { return { format: 'MoFlight support diagnostics', version: 2, timing: 'milliseconds; session-relative offsets; nested/counter measurements overlap; no wall-clock timestamps', context: this.context,
    entries: this.snapshot(), events: this.journey(), failures: this.failureSnapshot(), sessions:this.contexts.map(({session,context})=>({session,context})), observedTransitions: this.journeySummary() }; }
  export() { const text = JSON.stringify(this.report()); if (utf8Bytes(text) > DIAGNOSTIC_FILE_BYTES) throw new Error('Diagnostic export limit'); return text; }
  shortReport() {
    const full = this.report(), short = { ...full, entries: full.entries.slice(-3), events: full.events.slice(-20), failures: full.failures.slice(-1), observedTransitions: full.observedTransitions.slice(0,5), scope: 'bounded excerpt; full report available as file' };
    while (utf8Bytes(JSON.stringify(short)) > 32_000) { if (short.entries.length) short.entries.shift(); else if (short.failures.length) short.failures.shift(); else short.events.shift(); }
    return JSON.stringify(short);
  }
  stats() { const text = this.export(); return { bytes: utf8Bytes(text), maxStorageBytes: DIAGNOSTIC_STORAGE_BYTES, operations: this.entries.length, actions: this.events.length, failures: this.protectedFailures.length }; }
  record(kind: typeof journeyKinds[number], target: typeof journeyTargets[number]) {
    if (!member(journeyKinds, kind) || !member(journeyTargets, target)) return;
    if(kind==='screen'){this.currentScreen=target;if(!this.foreground)return;}
    if(kind==='lifecycle'&&(target==='background'||target==='inactive'))this.foreground=false;
    if(kind==='lifecycle'&&target==='active')this.foreground=true;
    const previous = this.events.at(-1);
    if (previous?.session === this.session && previous.kind === kind && previous.target === target && (kind === 'screen' || kind === 'filter') && this.now() - this.origin - previous.offset < 1000) return;
    this.events.push({ sequence: ++this.sequence, session: this.session, offset: number(this.now() - this.origin), kind, target, retainedAt: this.wall() }); this.changed(kind==='lifecycle');
    if(kind==='lifecycle'&&(target==='active'||target==='start')&&this.currentScreen)this.record('screen',this.currentScreen);
  }
  private protect(entry: Dated<DiagnosticEntry>) {
    const old=this.protectedFailures.find(f=>f.operation.sequence===entry.sequence&&f.operation.session===entry.session);
    const copy = clone(entry); this.protectedFailures = this.protectedFailures.filter(f => f!==old);
    this.protectedFailures.push({ operation: copy, preceding: old?.preceding??clone(this.events.filter(e=>e.sequence<=entry.sequence).slice(-12)), retainedAt: entry.retainedAt });
  }
  clear() { this.clearVersion++; this.exportClearFailed=false; this.entries = []; this.events = []; this.protectedFailures = []; this.contexts=[]; this.starts.clear();
    try { const result = this.storage?.clearExport?.(); if (result) void result.catch(() => { this.exportClearFailed=true;this.storageFailed = true; this.emit(); }); } catch { this.exportClearFailed=true;this.storageFailed = true; }
    this.changed(true);
  }
  begin(action: DiagnosticAction): DiagnosticOperation {
    if (!member(diagnosticActions, action)) throw new Error('Unsupported diagnostic action');
    const entry: Dated<DiagnosticEntry> = { sequence: ++this.sequence, session: this.session, action, outcome: 'running', code: 'none', milliseconds: 0, stages: [], activeStages: [], checkpoints: [], observedState:{}, offset: number(this.now() - this.origin), trigger: action.startsWith('read-') ? 'automatic' : 'user', retainedAt: this.wall() };
    this.entries.push(entry); this.starts.set(entry, this.now()); this.changed(true);
    return { running: () => this.entries.includes(entry) && entry.outcome === 'running', span: name => this.openSpan(name, entry), note:(key,state)=>{if(!this.entries.includes(entry)||!member(stateNames,key)||!member(stateValues,state))return;entry.observedState[key]=state;this.sizes.delete(entry);this.changed(false);}, finish: (outcome, code = 'none') => {
      if (!this.entries.includes(entry) || entry.outcome !== 'running' || !member(['success','partial','failed','blocked','cancelled','interrupted'], outcome)) return;
      entry.milliseconds = number(this.now() - this.starts.get(entry)!); this.starts.delete(entry); entry.outcome = outcome; entry.code = member(diagnosticCodes, code) ? code : 'operation-failed';
      if (failures.includes(outcome)) this.protect(entry); this.sizes.delete(entry); this.changed(true);
    } };
  }
  span(name: string) { return this.openSpan(name, [...this.entries].reverse().find(entry => entry.outcome === 'running')); }
  private openSpan(rawName: string, entry?: Dated<DiagnosticEntry>) {
    if(entry?.outcome!=='running')entry=undefined;
    const name = member(diagnosticStages, rawName) ? rawName : rawName.startsWith('provider-') ? 'provider-other-stage' : null;
    const start = this.now(); let finished = false;
    const operationStart=entry?this.starts.get(entry)??start:start;
    const checkpoint = (state: Checkpoint['state']) => { if (!entry || !name) return; entry.checkpoints.push({ name, state, offset: number(this.now() - operationStart) }); entry.checkpoints = entry.checkpoints.slice(-32); this.sizes.delete(entry); };
    if (entry && name) { entry.activeStages.push(name); entry.activeStages = entry.activeStages.slice(-8); checkpoint('start'); const immediate=this.now()-this.lastCheckpointWrite>=100;if(immediate)this.lastCheckpointWrite=this.now();this.changed(immediate); }
    return (succeeded: boolean, counters?: unknown) => {
      if (finished) return; finished = true; if (!entry || !name || !this.entries.includes(entry)) return;
      const at = entry.activeStages.indexOf(name); if (at >= 0) entry.activeStages.splice(at,1);
      let stage = entry.stages.find(s => s.name === name); if (!stage) { stage = { name, calls: 0, failures: 0, milliseconds: 0, maximum: 0 }; entry.stages.push(stage); }
      const elapsed = number(this.now() - start); stage.calls = number(stage.calls + 1); stage.failures = number(stage.failures + (succeeded ? 0 : 1)); stage.milliseconds = number(stage.milliseconds + elapsed); stage.maximum = Math.max(stage.maximum, elapsed);
      if (counters) { stage.counters ??= {}; for (const [key, value] of Object.entries(cleanCounters(counters))) { const name = key as typeof counterNames[number], prior = stage.counters[name] ?? { calls: 0, failures: 0, milliseconds: 0 }; stage.counters[name] = { calls: number(prior.calls + value.calls), failures: number(prior.failures + value.failures), milliseconds: number(prior.milliseconds + value.milliseconds) }; } }
      checkpoint(succeeded ? 'success' : 'failed'); this.sizes.delete(entry); if (failures.includes(entry.outcome)) this.protect(entry); this.changed(false);
    };
  }
  private emit() { for (const listener of this.listeners) listener(); }
  private persist() {
    this.timer = undefined; this.prune();
    // Retention timestamps remain private to storage and never enter exported reports.
    const entries = this.entries.map(entry => ({ ...this.view(entry), retainedAt: entry.retainedAt }));
    this.pending = JSON.stringify({ version: 2, entries, events: this.events, failures: this.protectedFailures, sessions:this.contexts });
    if (utf8Bytes(this.pending) > DIAGNOSTIC_FILE_BYTES) { this.storageFailed = true; this.pending = null; this.emit(); return; }
    this.drain();
  }
  private drain() {
    if (!this.storage || this.writing || this.pending === null) return;
    const text = this.pending; this.pending = null;
    try { const work = this.storage.write(text);
      if (work) this.writing = Promise.resolve(work).then(() => { this.storageFailed = this.exportClearFailed; }, () => { this.storageFailed = true; }).finally(() => { this.writing = null; this.emit(); this.drain(); });
      else this.storageFailed = this.exportClearFailed;
    } catch { this.storageFailed = true; }
  }
  async flush() { clearTimeout(this.timer); this.persist(); while (this.writing) await this.writing; }
  private changed(immediate: boolean) { this.prune(); if (this.storage) { if (immediate) { clearTimeout(this.timer); this.persist(); } else if (!this.timer) this.timer = setTimeout(() => this.persist(), 500); } this.emit(); }
}
export const diagnosticJournal = new DiagnosticJournal();

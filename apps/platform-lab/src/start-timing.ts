import { diagnosticJournal, type DiagnosticJournal, type DiagnosticSpanStarter } from './diagnostics';

/** JS instrumentation entry, not native process launch or proof of presented pixels. */
export function createStartTiming(journal: DiagnosticJournal) {
  const operation = journal.begin('start-screen');
  const shell = operation.span('start-js-to-shell'), data = operation.span('start-js-to-data');
  const commit = operation.span('start-js-to-commit'), settled = operation.span('start-js-to-settled');
  let committed = false, finished = false, partial = false;
  const finish = () => { if (committed && finished) operation.finish(partial ? 'partial' : 'success'); };
  return {
    reference: () => operation.reference(),
    shell: () => shell(true),
    data: () => data(true),
    commit: () => { commit(true); committed = true; finish(); },
    settled: (failed: boolean) => { settled(true); partial = failed; finished = true; finish(); },
    cancel: () => { shell(false); data(false); commit(false); settled(false); operation.finish('cancelled', 'background'); },
    noData: () => { data(false); commit(false); settled(true); operation.finish('success', 'no-saved-data'); },
    fail: () => { shell(false); data(false); commit(false); settled(false); operation.finish('failed', 'operation-failed'); },
    initialization: () => operation.span('start-diagnostics-init'),
  };
}

export const startTiming = createStartTiming(diagnosticJournal);

// Rendering carries the originating read's observer; never select a concurrent operation globally.
const renderObservers = new WeakMap<object, DiagnosticSpanStarter>();
export function bindStartRenderTiming(view: object, span: DiagnosticSpanStarter) { renderObservers.set(view, span); }
export function startRenderSpan(view: object | null, name: string) { return view ? renderObservers.get(view)?.(name) : undefined; }

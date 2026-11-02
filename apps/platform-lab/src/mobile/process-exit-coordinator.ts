import type { DiagnosticJournal } from '../diagnostics';

export interface ProcessExitNative {
  processExitAsync(previousMarker: string|null, currentMarker: string): Promise<unknown>;
}

/** Optional startup/clear work only. Never blocks ordinary data access or dispatches uploads. */
export function connectProcessExitDiagnostics(journal: DiagnosticJournal, native: ProcessExitNative|null|undefined, createMarker: ()=>string) {
  if (typeof native?.processExitAsync !== 'function') return;
  let active=true, generation=journal.clearVersion, pending=Promise.resolve();
  const refresh=()=>{
    const requested=journal.clearVersion;
    pending=pending.catch(()=>{}).then(async()=>{
      if(!active||journal.clearVersion!==requested)return;
      const state=journal.processExitState();
      let marker='',observation:unknown={category:'unknown',registered:false};
      try { marker=createMarker(); observation=await native.processExitAsync(state.previousMarker?.token??null,marker); }
      catch { /* Unsupported APIs, throttling and failures remain unknown. */ }
      if(active)journal.recordProcessExit(state.previousMarker,marker,observation,requested);
    });
  };
  const unsubscribe=journal.subscribe(()=>{if(generation!==journal.clearVersion){generation=journal.clearVersion;refresh();}});
  refresh();
  return {
    dispose(){active=false;unsubscribe();},
    async idle(){let observed:Promise<void>;do{observed=pending;await observed;}while(observed!==pending);},
  };
}

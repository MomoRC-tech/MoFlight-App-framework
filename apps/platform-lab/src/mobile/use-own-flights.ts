import { startTiming, bindStartRenderTiming } from '../start-timing';
import { localReadFailureCode } from '../local-read-diagnostics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { diagnosticJournal } from '../diagnostics';
import { reuseEqualData } from './processed-result';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { readOwnFlightDetail, readOwnFlightView, OwnFlightChangedError, OwnFlightReadCancelled, type OwnFlightReadPorts, type OwnFlightView } from './own-flight-reader';

export function useOwnFlights(ports: OwnFlightReadPorts, active: boolean, reloadKey: number, retainWhilePaused=false, startVisible=true) {
  const processedView = useRef<OwnFlightView | null>(null);
  const [view, setView] = useState<OwnFlightView | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [detail, setDetail] = useState<RealFlightDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState<string | null>(null);
  const alive = useRef(false), enabled = useRef(active), foreground = useRef(AppState.currentState === 'active');
  const sequence = useRef(0), locked = useRef(false), queued = useRef(false);
  const queuedQuiet = useRef(false), readingDetail = useRef(false);
  const pendingDetail = useRef<RealFlightListItem | null>(null);
  const retainedPause=useRef(false);
  const presented = useRef(-1), beganRead = useRef(false), visible = useRef(startVisible);
  visible.current = startVisible;
  const presentation = useRef<{ id: number; view: OwnFlightView; operation: ReturnType<typeof diagnosticJournal.begin>; finish: (ok: boolean) => void } | null>(null);
  const cancelPresentation = () => {
    const pending = presentation.current;
    if (pending) { pending.finish(false); pending.operation.finish('cancelled', 'stale-selection'); presentation.current = null; }
  };
  const detailReader = useRef<(selected: RealFlightListItem) => Promise<void>>(async () => {});
  enabled.current = active;
  const current = (id: number) => alive.current && enabled.current && foreground.current && sequence.current === id;
  const clearDetail = useCallback(() => {
    // Back cancels a detail request, not a concurrent quiet list refresh.
    if (readingDetail.current) sequence.current++;
    pendingDetail.current = null; setDetail(null); setDetailBusy(false); setDetailError(null);
  }, []);
  const reload: (quiet?: boolean) => Promise<void> = useCallback(async (quiet = false) => {
    if (!alive.current || !enabled.current || !foreground.current) return;
    if (locked.current) {
      queuedQuiet.current = queued.current ? queuedQuiet.current && quiet : quiet;
      queued.current = true; sequence.current++; return;
    }
    queued.current = false; locked.current = true;
    cancelPresentation();
    const id = ++sequence.current;
    const diagnosis = diagnosticJournal.begin('read-flights', !beganRead.current ? startTiming.reference() : undefined), stage = diagnosis.span('local-read');
    diagnosis.span(!beganRead.current?'local-trigger-initial':quiet?'local-trigger-resume':'local-trigger-refresh')(true); beganRead.current=true;
    if (!quiet) { setPhase('loading'); pendingDetail.current = null; setDetail(null); setDetailBusy(false); setDetailError(null); }
    const publish = (next: OwnFlightView | null) => {
      if (current(id)) {
        const finishReuse = diagnosis.span('local-view-reuse');
        let reused = false;
        try {
          const prior = processedView.current;
          const sameScope = prior && next && prior.snapshot.ownerId === next.snapshot.ownerId &&
            prior.snapshot.storeId === next.snapshot.storeId && prior.snapshot.account?.accountRef === next.snapshot.account?.accountRef;
          const shared = sameScope ? reuseEqualData(prior, next) : next;
          if (!sameScope) { pendingDetail.current = null; setDetailBusy(false); }
          // Details include capture/history evidence beyond the visible facts revision.
          if (!sameScope || shared?.snapshot !== prior?.snapshot || shared?.flights !== prior?.flights) setDetail(null);
          processedView.current = shared;
          if (shared && !presentation.current && presented.current !== id) {
            const operation = diagnosticJournal.begin('start-presentation', diagnosis.reference());
            const retained=shared===prior && visible.current && presented.current>=0;
            presentation.current = { id, view: shared, operation, finish: operation.span(retained?'start-retained-data':'start-render-wait') };
            if(retained){presentation.current.finish(true);operation.finish('success');presentation.current=null;presented.current=id;}
            startTiming.data();
          } else if (shared && presentation.current) presentation.current.view = shared;
          if (shared && presentation.current) bindStartRenderTiming(shared, presentation.current.operation.span);
          setView(shared); setPhase(shared ? 'ready' : 'missing');
          reused = true;
        } finally { finishReuse(reused); }
      }
    };
    try {
      const next = await readOwnFlightView(ports, diagnosis, { publish, current: () => current(id) });
      publish(next);
      const partial = !!(next?.medicalReadFailed || next?.dutiesReadFailed || next?.featureInformationReadFailed);
      if (current(id)) { if (next) startTiming.settled(partial); else startTiming.noData(); }
      stage(true); diagnosis.finish(current(id) ? partial ? 'partial' : 'success' : 'cancelled',current(id)?'none':'stale-selection');
    } catch (error) {
      stage(false); cancelPresentation(); diagnosis.finish(current(id) && !(error instanceof OwnFlightReadCancelled)?'failed':'cancelled',current(id)?'operation-failed':'stale-selection');
      if (current(id)) { startTiming.fail(); console.warn('Own-flight local read failed', localReadFailureCode(error)); processedView.current = null; pendingDetail.current = null; setView(null); setDetail(null); setDetailBusy(false); setPhase('failed'); }
    } finally {
      locked.current = false;
      if (queued.current && alive.current && enabled.current && foreground.current) void reload(queuedQuiet.current);
      else if (pendingDetail.current && alive.current && enabled.current && foreground.current) { const selected = pendingDetail.current; pendingDetail.current = null; void detailReader.current(selected); }
    }
  }, [ports]);
  useEffect(() => {
    const pending = presentation.current;
    if (!pending || !startVisible || !view || pending.view !== view || pending.id !== sequence.current || !active) return;
    // Passive effect confirms React commit only. Native frame presentation is a separate checkpoint.
    presented.current = pending.id; pending.finish(true); pending.operation.finish('success'); startTiming.commit(); presentation.current = null;
  }, [view, phase, active, startVisible]);
  const openDetail = async (selected: RealFlightListItem) => {
    const latest = processedView.current;
    if (!alive.current || !foreground.current) return;
    if(!enabled.current){
      if(retainedPause.current){pendingDetail.current=selected;setDetail(null);setDetailBusy(true);setDetailError(null);}
      return;
    }
    if (!latest ||
      !latest.flights.some(f => f.flightId === selected.flightId && f.accountRef === selected.accountRef &&
        f.bindingId === selected.bindingId && f.sourceFlightRef === selected.sourceFlightRef && f.factsRevision === selected.factsRevision)) { setDetailBusy(false); return; }
    if (locked.current) {
      if (readingDetail.current) sequence.current++;
      pendingDetail.current = selected; setDetail(null); setDetailBusy(true); setDetailError(null);
      return;
    }
    locked.current = true; readingDetail.current = true; const id = ++sequence.current;
    const diagnosis = diagnosticJournal.begin('read-flight-detail'), stage = diagnosis.span('detail-read');
    setDetail(null); setDetailBusy(true); setDetailError(null);
    try {
      const next = await readOwnFlightDetail(ports, latest.snapshot, selected);
      stage(true); diagnosis.finish(current(id)?'success':'cancelled',current(id)?'none':'stale-selection');
      if (current(id)) setDetail(next);
    } catch (error) {
      stage(false); diagnosis.finish(current(id)?'failed':'cancelled',error instanceof OwnFlightChangedError?'stale-selection':'operation-failed');
      if (current(id)) {
        console.warn('Own-flight local detail failed', localReadFailureCode(error));
        // No previous owner's detail survives an unconfirmed or changed scope.
        setDetail(null); processedView.current = null; setView(null); setPhase('failed');
        setDetailError(error instanceof OwnFlightChangedError ? 'Die gespeicherte Auswahl hat sich geändert. Bitte die lokale Liste erneut laden.' : 'Flugdetails konnten nicht geprüft werden. Gespeicherte Daten bleiben erhalten.');
      }
    } finally {
      locked.current = false; readingDetail.current = false;
      if (current(id)) setDetailBusy(false);
      if (queued.current && alive.current && enabled.current && foreground.current) void reload(queuedQuiet.current);
      else if (pendingDetail.current && alive.current && enabled.current && foreground.current) { const next = pendingDetail.current; pendingDetail.current = null; void detailReader.current(next); }
    }
  };
  detailReader.current = openDetail;
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => {
      const nextForeground = state === 'active';
      // Native surfaces can repeat an active notification without leaving the app.
      // A real transition cancels unfinished work, retaining the last verified
      // local screen. Account/writer changes still invalidate through active/reloadKey.
      if (foreground.current === nextForeground) return;
      foreground.current = nextForeground;
      if (!foreground.current) { cancelPresentation(); startTiming.cancel(); sequence.current++; pendingDetail.current = null; setDetailBusy(false); }
      else if (enabled.current) void reload(true);
    });
    return () => { cancelPresentation(); alive.current = false; sequence.current++; queued.current = false; pendingDetail.current = null; subscription.remove(); };
  }, [reload]);
  useEffect(() => {
    const returning=retainedPause.current;
    retainedPause.current=!active&&retainWhilePaused;
    if (active) void reload(returning);
    else if(retainWhilePaused){startTiming.cancel();cancelPresentation();sequence.current++;setDetailBusy(false);}
    else { startTiming.cancel();cancelPresentation();sequence.current++; processedView.current = null; pendingDetail.current = null; setView(null); setDetail(null); setDetailBusy(false); setPhase('loading'); }
  }, [active, reloadKey, reload,retainWhilePaused]);
  return { view, phase, detail, detailBusy, detailError, openDetail, clearDetail, reload };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { diagnosticJournal } from '../diagnostics';
import { reuseEqualData } from './processed-result';
import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import { readOwnFlightDetail, readOwnFlightView, OwnFlightChangedError, type OwnFlightReadPorts, type OwnFlightView } from './own-flight-reader';

export function useOwnFlights(ports: OwnFlightReadPorts, active: boolean, reloadKey: number) {
  const processedView = useRef<OwnFlightView | null>(null);
  const [view, setView] = useState<OwnFlightView | null>(null);
  const [phase, setPhase] = useState<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  const [detail, setDetail] = useState<RealFlightDetail | null>(null);
  const [detailBusy, setDetailBusy] = useState(false), [detailError, setDetailError] = useState<string | null>(null);
  const alive = useRef(false), enabled = useRef(active), foreground = useRef(AppState.currentState === 'active');
  const sequence = useRef(0), locked = useRef(false), queued = useRef(false);
  enabled.current = active;
  const current = (id: number) => alive.current && enabled.current && foreground.current && sequence.current === id;
  const clearDetail = useCallback(() => { sequence.current++; setDetail(null); setDetailBusy(false); setDetailError(null); }, []);
  const reload: () => Promise<void> = useCallback(async () => {
    if (!alive.current || !enabled.current || !foreground.current) return;
    if (locked.current) { queued.current = true; sequence.current++; return; }
    queued.current = false; locked.current = true;
    const id = ++sequence.current;
    const diagnosis = diagnosticJournal.begin('read-flights'), stage = diagnosis.span('local-read');
    setPhase('loading'); setDetail(null); setDetailBusy(false); setDetailError(null);
    try {
      const next = await readOwnFlightView(ports);
      stage(true); diagnosis.finish(current(id)?'success':'cancelled',current(id)?'none':'stale-selection');
      if (current(id)) {
        const prior = processedView.current;
        const sameScope = prior && next && prior.snapshot.ownerId === next.snapshot.ownerId &&
          prior.snapshot.storeId === next.snapshot.storeId && prior.snapshot.account?.accountRef === next.snapshot.account?.accountRef;
        const shared = sameScope ? reuseEqualData(prior, next) : next;
        processedView.current = shared;
        setView(shared); setPhase(shared ? 'ready' : 'missing');
      }
    } catch (error) {
      stage(false); diagnosis.finish(current(id)?'failed':'cancelled',current(id)?'operation-failed':'stale-selection');
      if (current(id)) { console.warn('Own-flight local read failed', error instanceof Error ? error.message : 'Unknown read failure'); processedView.current = null; setView(null); setPhase('failed'); }
    } finally {
      locked.current = false;
      if (queued.current && alive.current && enabled.current && foreground.current) void reload();
    }
  }, [ports]);
  const openDetail = async (selected: RealFlightListItem) => {
    if (!view || locked.current || !alive.current || !enabled.current || !foreground.current ||
      !view.flights.some(f => f.flightId === selected.flightId && f.factsRevision === selected.factsRevision)) return;
    locked.current = true; const id = ++sequence.current;
    const diagnosis = diagnosticJournal.begin('read-flight-detail'), stage = diagnosis.span('detail-read');
    setDetail(null); setDetailBusy(true); setDetailError(null);
    try {
      const next = await readOwnFlightDetail(ports, view.snapshot, selected);
      stage(true); diagnosis.finish(current(id)?'success':'cancelled',current(id)?'none':'stale-selection');
      if (current(id)) setDetail(next);
    } catch (error) {
      stage(false); diagnosis.finish(current(id)?'failed':'cancelled',error instanceof OwnFlightChangedError?'stale-selection':'operation-failed');
      if (current(id)) {
        console.warn('Own-flight local detail failed', error instanceof Error ? error.message : 'Unknown detail failure');
        // No previous owner's detail survives an unconfirmed or changed scope.
        setDetail(null); processedView.current = null; setView(null); setPhase('failed');
        setDetailError(error instanceof OwnFlightChangedError ? 'Die gespeicherte Auswahl hat sich geändert. Bitte die lokale Liste erneut laden.' : 'Flugdetails konnten nicht geprüft werden. Gespeicherte Daten bleiben erhalten.');
      }
    } finally {
      locked.current = false;
      if (current(id)) setDetailBusy(false);
      if (queued.current && alive.current && enabled.current && foreground.current) void reload();
    }
  };
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (!foreground.current) { sequence.current++; setView(null); setDetail(null); setDetailBusy(false); setPhase('loading'); }
      else if (enabled.current) void reload();
    });
    return () => { alive.current = false; sequence.current++; queued.current = false; subscription.remove(); };
  }, [reload]);
  useEffect(() => {
    if (active) void reload();
    else { sequence.current++; setView(null); setDetail(null); setDetailBusy(false); setPhase('loading'); }
  }, [active, reloadKey, reload]);
  return { view, phase, detail, detailBusy, detailError, openDetail, clearDetail, reload };
}

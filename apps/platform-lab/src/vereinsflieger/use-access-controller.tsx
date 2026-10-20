import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { startFlightSpan } from './flight-diagnostics';
import { bridgeSource, flightUrl, FLIGHT_URL, LOGIN_URL, providerUrl, type ProbeSnapshot } from './probe';
import { clearOriginalView, latestCapture, readOriginalView, saveCapture, saveOriginalView } from './storage';
import { loginPage } from './login';
import { useSavedLogin } from './use-saved-login';
import { acceptExportMessage, beginExport, calendarYearRequest, recentCaptureRequest, exportScript, type ExportRun } from './export';
import { decodeView, VIEW_PHASES, viewScript, viewProtectionMessage, type ViewPhase, type ViewPreferences } from './view';
import { canonical } from '@moflight/flight-logbook';
import { legacyViewNeedsChoice, type LegacyRecoveryCopy } from './legacy-recovery-store';
import { Retrieval } from './retrieval';
import { PROFILE_URL, contextScript, loginRequiredScript, sameContext, scopedBridge, validateContext, type ObservedContext } from './context';
import { ConnectionSession } from './connection-state';
import { loadProviderScope, confirmProviderScope, loadScopedCapture, loadScopedView, saveScopedCapture, saveScopedView, clearScopedView, prepareScopedLegacy, saveLegacySafety, legacyQuarantined, finishScopedLegacy } from './scoped-storage';
import { clearProviderStore, proveSyntheticStore, sessionClearingAvailable, sessionProofAvailable, legacyRecoveryAvailable, legacyRecoveryFingerprint, readReviewedRecovery } from './session-store';
import type { ProviderScope } from './scope-store';
import { INFORMATION_TYPES, retrievableInformationCategories, informationRouteShape, informationScript, informationSelectionScript, type InformationCategory, type InformationCapture, type InformationHistory } from './information';
import { InformationRun } from './information-run';
import { loadInformation, readInformationCapture, readInformationHistory, saveInformation } from './information-native';
import type { RealFlightSourceInput } from './real-flight-source';

type InformationRetryTarget = { category: InformationCategory; sourceUrl: string; scopeKey: string };
type FlightSourceAttempt = {
  owner: string;
  contextBefore: ObservedContext;
  requestedWindow: { from: string; to: string; participation: 'Pilot oder Fluglehrer' };
};
type PendingFlightSource = { owner: string; input: RealFlightSourceInput };

export function useAccessController(product = false, localOwner?: string) {
  const activeOwner = useRef(localOwner); activeOwner.current = localOwner;
  const owner = useRef(localOwner), scope = useRef<ProviderScope | null>(null);
  const informationRun = useRef<InformationRun | null>(null);
  const informationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [informationCategory, setInformationCategory] = useState<InformationCategory>('work-hours');
  const [informationCaptures, setInformationCaptures] = useState<InformationCapture[]>([]);
  const [informationNotice, setInformationNotice] = useState('');
  const [informationBusy, setInformationBusy] = useState(false);
  const [informationSaving, setInformationSaving] = useState(false);
  const informationRetry = useRef<InformationRetryTarget | null>(null);
  const informationFailedProfile = useRef<{ target: InformationRetryTarget; epoch: number } | null>(null);
  const informationNavigation = useRef<{ run: InformationRun; nonce: string } | null>(null);
  const [informationRetryReady, setInformationRetryReady] = useState(false);
  const informationUncertain = useRef<string | null>(null);
  const [informationNeedsReload, setInformationNeedsReload] = useState(false);
  const informationLoadRequest = useRef(0);
  const [informationLoading, setInformationLoading] = useState(false);
  const historyRequest = useRef(0);
  const [informationHistory, setInformationHistory] = useState<InformationHistory | null>(null);
  const [informationHistoryBusy, setInformationHistoryBusy] = useState(false);
  const [informationHistoryNotice, setInformationHistoryNotice] = useState('');
  const clearingStore = useRef(false), documentDetached = useRef<(() => void) | null>(null);
  const [clearing, setClearing] = useState(false), [clearNotice, setClearNotice] = useState<'none' | 'cleared' | 'failed'>('none');
  const [proofNotice, setProofNotice] = useState<'none' | 'passed' | 'failed'>('none');
  const [documentId, setDocumentId] = useState(0);
  const bindingBusy = useRef(false), legacyPending = useRef(false);
  const legacyFingerprint = useRef<string | null>(null);
  const legacyRequest = useRef<{ fingerprint: string; acceptedCurrent: ViewPreferences | null } | null>(null);
  const legacyAttempt = useRef<{ copy: LegacyRecoveryCopy; safety: ViewPreferences | null; acceptedCurrent: ViewPreferences | null } | null>(null);
  const [legacyChoice, setLegacyChoice] = useState<{ fingerprint: string; target: ViewPreferences; current: ViewPreferences } | null>(null);
  const [binding, setBinding] = useState(false);
  const foreground = useRef(AppState.currentState === undefined || AppState.currentState === 'active');
  const session = useRef(new ConnectionSession());
  const [connection, setConnection] = useState(session.current.state);
  const contextRequest = useRef<{ nonce: string; action: 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect' | 'legacy'; navigationObserved: boolean } | null>(null);
  const disconnectMode = useRef(false), recoveryKnown = useRef(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectedAt, setDisconnectedAt] = useState<string | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<'none' | 'verified' | 'failed' | 'cancelled'>('none');
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCapture = useRef<ProbeSnapshot | null>(null);
  const flightSourceAttempt = useRef<FlightSourceAttempt | null>(null);
  const pendingFlightSource = useRef<PendingFlightSource | null>(null);
  const completedFlightSourceRef = useRef<RealFlightSourceInput | null>(null);
  const [completedFlightSource, setCompletedFlightSource] = useState<RealFlightSourceInput | null>(null);
  const afterConfirmation = useRef<'retrieve' | 'recover' | null>(null);
  const [lastSuccessfulCaptureAt, setLastSuccessfulCaptureAt] = useState<string | null>(null);
  const [result, setResult] = useState<'none' | 'captured' | 'cancelled' | 'failed' | 'review-required' | 'recovered'>('none');
  const captureSaved = useRef(false), cancelled = useRef(false);
  const [showRun, setShowRun] = useState(false);
  const [showWindow, setShowWindow] = useState(false);
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL);
  const pendingNavigation = useRef<{ url: string; nativeReload?: boolean } | null>(null);
  const retrieval = useRef(new Retrieval()), epoch = useRef(0), mounted = useRef(true);
  const bridgeTiming=useRef<((succeeded:boolean)=>void)|null>(null);
  const run = useRef<ExportRun | null>(null), command = useRef(''), reading = useRef(false);
  const original = useRef<ViewPreferences | null>(null), viewPhase = useRef<ViewPhase | null>(null), restoring = useRef(false), restoreSteps = useRef(0), outcome = useRef('');
  const [recovery, setRecovery] = useState(false), [viewReady, setViewReady] = useState(false);
  const [viewStrategy, setViewStrategy] = useState<'reset' | 'reserved backup' | null>(null);
  const [captureRequest] = useState(() => product ? recentCaptureRequest() : calendarYearRequest());
  const [from, setFrom] = useState(captureRequest.from), [to, setTo] = useState(captureRequest.to);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [browserActive, setBrowserActive] = useState(!product);
  const [canGoBack, setCanGoBack] = useState(false);
  const [providerExpanded, setProviderExpanded] = useState(false);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const testPauseEnabled = useRef(false), testPaused = useRef(false);
  const preBackupPauseEnabled = useRef(false);
  const [pauseEnabled, setPauseEnabled] = useState(false), [paused, setPaused] = useState<string | null>(null);
  const [preBackupPause, setPreBackupPause] = useState(false);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. Choose an inclusive period; configuration is verified before capture.');
  const [captureLoadState, setCaptureLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const login = useSavedLogin({
    product,
    canStart: action => owner.current === activeOwner.current && !clearingStore.current && !bindingBusy.current &&
      !contextRequest.current && !disconnectMode.current && retrieval.current.state.phase === 'idle' &&
      (action !== 'forget' || !busy && !saving) && (action !== 'use' || foreground.current && !busy),
    isCurrent: pageEpoch => mounted.current && pageEpoch === epoch.current,
    currentUrl: () => currentUrl.current,
    beforeUse: () => { afterConfirmation.current = null; if (product) { session.current.invalidate(); syncConnection(); setResult('none'); } },
    navigate, inject: script => web.current?.injectJavaScript(script), setStatus, setVisible, uuid: Crypto.randomUUID,
  });
  const { loginAttempt, loginStorageBusy, endLogin, setLoginNotice, loginNotice, credentialNotice,
    hasLogin, editingLogin, setEditingLogin, loginBusy, username, setUsername, password, setPassword,
    saveLogin, forgetLogin, useLogin } = login;
  useEffect(() => { let active = true; mounted.current = true; if (!product) void latestCapture().then(s => { if (active) setSnapshot(old => old ?? s); }).catch(() => { if (active && retrieval.current.state.phase === 'idle') setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; mounted.current = false; epoch.current++; if (timeout.current) clearTimeout(timeout.current); retrieval.current.dispose(); }; }, []);
  useEffect(() => { let active = true; const initialInformationRequest = ++informationLoadRequest.current; setInformationLoading(product); void (async () => {
    if (product && owner.current !== activeOwner.current) throw new Error('Owner changed; create a new controller.');
    if (product && !owner.current) throw new Error('Explicit local owner required.');
    // Saved review needs no provider session or successful recovery diagnostic.
    // Authorize its local scope before opening any capture file.
    const saved = product ? await loadProviderScope(owner.current!) : null;
    if (!active) return;
    if (product) {
      scope.current = saved;
      if (saved) session.current.restoreAssociation(saved.context);
      try {
        const capture = saved ? await loadScopedCapture(saved) : null;
        if (!active) return;
        setSnapshot(capture); setCaptureLoadState('ready');
      } catch { if (active) setCaptureLoadState('failed'); }
      try {
        const gate = () => { if (!active || !foreground.current || initialInformationRequest !== informationLoadRequest.current || owner.current !== activeOwner.current || saved && canonical(requireScope()) !== canonical(saved)) throw new Error('Expired initial information read'); };
        const records = saved ? await loadInformation(saved, gate) : [];
        gate(); setInformationCaptures(records);
      } catch { if (active && foreground.current && initialInformationRequest === informationLoadRequest.current && owner.current === activeOwner.current) setInformationNotice('Gespeicherte Informationen konnten nicht geöffnet werden. Vorhandene Daten bleiben erhalten.'); }
      finally { if (active && initialInformationRequest === informationLoadRequest.current) setInformationLoading(false); }
    }
    const nativeLegacy = product && legacyRecoveryAvailable;
    const fingerprint = nativeLegacy ? await legacyRecoveryFingerprint() : null;
    const legacy = nativeLegacy ? null : await readOriginalView();
    let v = product ? null : legacy;
    if (product) {
      if (!owner.current) throw new Error('Explicit local owner required.');
      if (!active) return;
      legacyFingerprint.current = fingerprint;
      legacyPending.current = nativeLegacy ? await legacyQuarantined(saved, fingerprint) : !!legacy;
      // Never infer ownership of the historical global journal or capture.
      v = saved ? await loadScopedView(saved) : null;
    }
    if (!active) return;
    original.current = v; recoveryKnown.current = true; setRecovery(!!v || legacyPending.current);
    setViewStrategy(v ? v.reset ? 'reset' : 'reserved backup' : null); setViewReady(true);
    if (v || legacyPending.current) setStatus('An earlier export left view restoration pending. Sign into the same provider account, then restore the original view before another export.');
  })().catch(() => { if(active) { if (initialInformationRequest === informationLoadRequest.current) setInformationLoading(false); setCaptureLoadState(state => state === 'ready' ? state : 'failed'); setRecovery(true); setStatus('Original view recovery could not be opened. Exports are blocked to preserve preferences.'); } }); return () => { active = false; }; }, [localOwner]);
  useEffect(() => {
    if (!product || localOwner === owner.current) return;
    clearContextRequest(); afterConfirmation.current = null; pendingCapture.current = null; pendingNavigation.current = null;
    flightSourceAttempt.current = null; pendingFlightSource.current = null; clearCompletedFlightSource();
    session.current.disconnected(); session.current.invalidate(); syncConnection(); web.current?.stopLoading();
    // A write already dispatched remains durable, but its late completion must
    // never publish old-account data or restore preferences in a new owner UI.
    retrieval.current.dispose(); epoch.current++; setGeneration(epoch.current);
    legacyRequest.current = null; legacyAttempt.current = null; legacyFingerprint.current = null; setLegacyChoice(null);
    recoveryKnown.current = false; original.current = null; scope.current = null;
    informationRun.current?.cancel(); informationRun.current = null;
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null; setInformationBusy(false); setInformationSaving(false);
    informationRetry.current = null; setInformationRetryReady(false); informationUncertain.current = null; setInformationNeedsReload(false);
    informationLoadRequest.current++; setInformationLoading(false);
    historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice('');
    setSnapshot(null); setLastSuccessfulCaptureAt(null); setBrowserActive(false); setCanGoBack(false); setVisible(false); setBusy(false); setRecovery(true); setViewReady(false);
    if (loginAttempt.current) endLogin('Local owner changed. Saved sign-in cancelled.', 'cancelled');
  }, [localOwner]);
  useEffect(() => { if (!browserActive && clearing) { documentDetached.current?.(); documentDetached.current = null; } }, [browserActive, clearing]);
  useEffect(() => () => { documentDetached.current?.(); documentDetached.current = null; }, []);
  function requireScope(): ProviderScope {
    if (!scope.current || scope.current.owner !== localOwner || owner.current !== activeOwner.current) throw new Error('Provider scope unavailable.');
    return scope.current;
  }
  function clearCompletedFlightSource() {
    completedFlightSourceRef.current = null; setCompletedFlightSource(null);
  }
  function makeFlightSourceInput(attempt: FlightSourceAttempt | null, observedAfter: unknown,
    capture: ProbeSnapshot): RealFlightSourceInput | null {
    try {
      if (!product || !attempt || attempt.owner !== owner.current || attempt.owner !== activeOwner.current ||
          capture.coverage !== 'complete-requested-list' || !capture.exportContext) return null;
      const contextBefore = validateContext(attempt.contextBefore), contextAfter = validateContext(observedAfter);
      if (!sameContext(contextBefore, contextAfter) || capture.exportContext.from !== attempt.requestedWindow.from ||
          capture.exportContext.to !== attempt.requestedWindow.to || capture.exportContext.participation !== attempt.requestedWindow.participation) return null;
      const input: RealFlightSourceInput = {
        version: 1,
        binding: { provider: 'vereinsflieger', accountRef: contextBefore.accountNumber },
        contextBefore,
        contextAfter,
        requestedWindow: { ...attempt.requestedWindow },
        capture: JSON.parse(canonical(capture)) as ProbeSnapshot,
      };
      return JSON.parse(canonical(input)) as RealFlightSourceInput;
    } catch { return null; }
  }
  async function reloadInformation() {
    if (!product || !mounted.current || !foreground.current || owner.current !== activeOwner.current || informationRun.current || clearingStore.current || bindingBusy.current) return;
    const request = ++informationLoadRequest.current;
    try {
      const selectedScope = requireScope(), selectedKey = canonical(selectedScope), selectedHistoryRequest = historyRequest.current;
      const gate = () => {
        if (!mounted.current || !foreground.current || request !== informationLoadRequest.current || canonical(requireScope()) !== selectedKey) throw new Error('Expired information reload');
      };
      gate(); setInformationLoading(true);
      const records = await loadInformation(selectedScope, gate);
      gate();
      if (informationUncertain.current) {
        const saved = await readInformationCapture(selectedScope, informationUncertain.current, gate); gate();
        if (saved && (saved.id !== informationUncertain.current || saved.owner !== selectedScope.owner || saved.connectionId !== selectedScope.connectionId || !records.some(record => record.category === saved.category))) throw new Error('Uncertain capture recovery incomplete');
      }
      if ((!records.length && informationCaptures.length) || records.some(record => record.owner !== selectedScope.owner || record.connectionId !== selectedScope.connectionId)) throw new Error('Saved information scope or completeness changed');
      setInformationCaptures(records);
      informationUncertain.current = null; setInformationNeedsReload(false);
      if (historyRequest.current === selectedHistoryRequest) { historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice(''); }
      setInformationNotice('Gespeicherte Informationen lokal neu geladen.');
    } catch {
      if (mounted.current && foreground.current && request === informationLoadRequest.current && owner.current === activeOwner.current) setInformationNotice('Gespeicherte Informationen konnten nicht neu geladen werden. Vorhandene Belege bleiben erhalten.');
    } finally {
      if (mounted.current && request === informationLoadRequest.current) setInformationLoading(false);
    }
  }
  async function loadInformationHistory(category: InformationCategory, index: number) {
    const request = ++historyRequest.current;
    try {
      const selectedScope = requireScope();
      const selectedScopeKey = canonical(selectedScope);
      const gate = () => {
        if (!mounted.current || !foreground.current || request !== historyRequest.current || canonical(requireScope()) !== selectedScopeKey) throw new Error('Expired information history request');
      };
      gate(); setInformationHistoryBusy(true); setInformationHistoryNotice('');
      const result = await readInformationHistory(selectedScope, category, index, gate);
      if (result.category !== category || result.index !== index || !result.capture && informationCaptures.some(c => c.category === category)) throw new Error('Saved information history unavailable');
      gate(); setInformationHistory(result);
    } catch {
      if (mounted.current && foreground.current && request === historyRequest.current && owner.current === activeOwner.current) setInformationHistoryNotice('Dieser gespeicherte Quellenbeleg konnte nicht geöffnet werden. Vorhandene Belege bleiben erhalten.');
    } finally {
      if (mounted.current && request === historyRequest.current) setInformationHistoryBusy(false);
    }
  }
  function stopInformation(message = 'Informationsabruf abgebrochen. Gespeicherte Belege bleiben erhalten.', retryable = false) {
    const run = informationRun.current;
    if (run?.stage === 'saving') return;
    run?.cancel(); informationRun.current = null;
    if (!retryable) informationRetry.current = null;
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null;
    if (mounted.current) { setInformationRetryReady(retryable && !!informationRetry.current); setInformationBusy(false); setInformationSaving(false); setBusy(false); setInformationNotice(message); }
  }
  function startInformation(retry = false) {
    if (!product || !visible || !loaded && !retry || !foreground.current || busy || saving || loginBusy || contextRequest.current || recovery || !viewReady || disconnectMode.current || informationRun.current || informationHistoryBusy || informationUncertain.current) return;
    try {
      const selectedScope = requireScope(), target = retry ? informationRetry.current : null;
      if (retry && (!informationRetryReady || !target || target.category !== informationCategory || target.scopeKey !== canonical(selectedScope))) return;
      const reloadFailedProfile = !!(retry && target && informationFailedProfile.current?.target === target && informationFailedProfile.current.epoch === epoch.current && currentUrl.current === PROFILE_URL);
      const run = new InformationRun(selectedScope, informationCategory, target?.sourceUrl ?? currentUrl.current, Crypto.randomUUID());
      informationRetry.current = { category: run.category, sourceUrl: run.sourceUrl, scopeKey: canonical(run.scope) }; setInformationRetryReady(false);
      informationLoadRequest.current++; setInformationLoading(false);
      informationRun.current = run; setInformationBusy(true); setBusy(true); setInformationNotice('Konto wird vor und nach der Erfassung geprüft…');
      informationTimer.current = setTimeout(() => stopInformation('Informationsabruf hat das Zeitlimit erreicht. Gespeicherte Belege bleiben erhalten. Quelle und Anmeldung prüfen und erneut versuchen.', true), 90_000);
      if (run.stage === 'selection') void loadedPage(run.url);
      else {
        navigate(run.url);
        if (reloadFailedProfile && pendingNavigation.current?.url === PROFILE_URL) pendingNavigation.current.nativeReload = true;
      }
    } catch {
      console.info('MoFlight information route shape', JSON.stringify(informationRouteShape(currentUrl.current)));
      setInformationNotice('Diese Quellseite kann nicht erfasst werden. Erst auf der Originalseite zum ausgewählten Bereich wechseln.');
    }
  }
  function retryInformation() { startInformation(true); }
  async function receiveInformation(event: WebViewMessageEvent) {
    const run = informationRun.current;
    if (!run || event.nativeEvent.data.length > 1_000_000) return;
    const gate = () => {
      if (!mounted.current || !foreground.current || informationRun.current !== run) throw new Error('Expired information request');
      run.assertScope(requireScope());
    };
    try {
      gate(); const action = run.accept(event.nativeEvent.url, currentUrl.current, JSON.parse(event.nativeEvent.data));
      if (action === 'navigate') { navigate(run.url); return; }
      if (action !== 'save') return;
      if (informationTimer.current) clearTimeout(informationTimer.current);
      informationTimer.current = null; setInformationSaving(true);
      informationUncertain.current = run.nonce;
      await saveInformation(run.scope, run.capture(new Date().toISOString()), gate);
      const records = await loadInformation(run.scope, gate); gate();
      if (!records.some(record => record.id === run.nonce && record.owner === run.scope.owner && record.connectionId === run.scope.connectionId)) throw new Error('Saved capture readback missing');
      informationUncertain.current = null; setInformationNeedsReload(false); informationRetry.current = null; setInformationRetryReady(false);
      informationLoadRequest.current++; setInformationLoading(false);
      setInformationCaptures(records); historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice(''); run.stage = 'done'; informationRun.current = null;
      setInformationBusy(false); setInformationSaving(false); setBusy(false); setVisible(false);
      setInformationNotice(`${INFORMATION_TYPES[run.category].title}: lokal gespeichert. Nur die sichtbare Quellseite, keine vollständige Historie.`);
      navigate(run.sourceUrl);
    } catch {
      // A commit may precede readback/lease failure. Do not claim rollback or publish old-owner rows.
      if (informationRun.current === run) {
        const uncertain = !!informationUncertain.current;
        run.stage = 'cancelled'; informationRun.current = null;
        if (informationTimer.current) clearTimeout(informationTimer.current);
        informationTimer.current = null; setInformationBusy(false); setInformationSaving(false); setBusy(false);
        setInformationNeedsReload(uncertain); setInformationRetryReady(!uncertain);
        setInformationNotice('Erfassung nicht bestätigt. ' + (uncertain ? 'Zuerst gespeicherte Informationen lokal neu laden, bevor erneut erfasst wird. Eine eventuell bereits gespeicherte Erfassung bleibt erhalten.' : (run.failureMessage ?? 'Quelle, Spalten oder Konto nicht unterstützt.') + ' Quelle und Anmeldung prüfen, dann ausdrücklich erneut versuchen. Gespeicherte Belege bleiben erhalten.'));
      }
    }
  }
  function nextInformationCategory() { if (!informationRun.current) { informationRetry.current = null; setInformationRetryReady(false); setInformationCategory(old => retrievableInformationCategories[(retrievableInformationCategories.indexOf(old) + 1) % retrievableInformationCategories.length]!); } }
  useEffect(() => () => { informationLoadRequest.current++; informationRun.current?.cancel(); informationRun.current = null; if (informationTimer.current) clearTimeout(informationTimer.current); }, []);
  async function refreshRecovery() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !product || retrieval.current.state.phase !== 'idle' || contextRequest.current) return;
    recoveryKnown.current = false; setViewReady(false);
    try {
      const fingerprint = legacyRecoveryAvailable ? await legacyRecoveryFingerprint() : null;
      const fallbackPending = !legacyRecoveryAvailable && !!await readOriginalView();
      const saved = scope.current ? await loadScopedView(scope.current) : null;
      const unresolved = fallbackPending || await legacyQuarantined(scope.current, fingerprint);
      if (!mounted.current || owner.current !== activeOwner.current) return;
      legacyFingerprint.current = fingerprint; legacyPending.current = unresolved;
      original.current = saved; recoveryKnown.current = true; setRecovery(!!saved || unresolved); setViewReady(true);
    } catch { if (mounted.current) setRecovery(true); }
  }
  function syncConnection() { setConnection(session.current.state); }
  function endDisconnect(verdict: 'verified' | 'failed' | 'cancelled' = 'cancelled') {
    if (disconnectMode.current) setDisconnectNotice(verdict);
    disconnectMode.current = false; setDisconnecting(false);
  }
  async function clearLocalSession(proof = false) {
    if (owner.current !== activeOwner.current || !product || !foreground.current || clearingStore.current || bindingBusy.current || !recoveryKnown.current || !viewReady || recovery || original.current ||
      retrieval.current.state.phase !== 'idle' || busy || saving || loginBusy || loginStorageBusy.current || loginAttempt.current || contextRequest.current || disconnectMode.current ||
      (proof ? !sessionProofAvailable : !sessionClearingAvailable)) return;
    clearingStore.current = true; setClearing(true); setClearNotice('none'); setProofNotice('none');
    afterConfirmation.current = null; pendingCapture.current = null; clearContextRequest();
    session.current.invalidate(); syncConnection(); web.current?.stopLoading();
    pendingNavigation.current = null; epoch.current++; setGeneration(epoch.current);
    // Unmount the old document before touching the process-wide WebView store.
    setBrowserActive(false); setCanGoBack(false); setVisible(false); setLoaded(false);
    try {
      // Let React commit the unmount before native deletion; a stale renderer
      // must never write cookies/storage back after the clearing callback.
      await new Promise<void>(resolve => { documentDetached.current = resolve; });
      if (proof) { setProofNotice(await proveSyntheticStore() ? 'passed' : 'failed'); }
      else { await clearProviderStore(); if (mounted.current) setClearNotice('cleared'); }
    } catch { if (mounted.current) { if (proof) setProofNotice('failed'); else setClearNotice('failed'); } }
    finally {
      // Once begun this stage is uncancellable, including while backgrounded.
      clearingStore.current = false;
      if (mounted.current) { setDocumentId(id => id + 1); setSource({ uri: LOGIN_URL }); currentUrl.current = LOGIN_URL; setUrl(LOGIN_URL); setClearing(false); }
    }
  }
  function startDisconnect() {
    // Never end the provider session while its original view may still need it.
    // A save is uncancellable; cancel/restore first, then explicitly retry here.
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !product || !foreground.current || !recoveryKnown.current || !viewReady || recovery || original.current ||
      retrieval.current.state.phase !== 'idle' || busy || saving || loginBusy || loginStorageBusy.current || loginAttempt.current || contextRequest.current || disconnectMode.current) return;
    disconnectMode.current = true; setDisconnecting(true); setDisconnectNotice('none'); setLoginNotice('none'); afterConfirmation.current = null;
    pendingCapture.current = null; session.current.invalidate(); syncConnection(); setResult('none');
    setStatus('Use Abmelden on the original provider page, then verify sign-out. Closing alone does not sign out.');
    setVisible(true); navigate(PROFILE_URL);
  }
  function checkDisconnection() {
    if (disconnectMode.current) checkConnection('disconnect');
  }
  function clearContextRequest() {
    contextRequest.current = null;
    if (contextTimer.current) clearTimeout(contextTimer.current);
    contextTimer.current = null;
  }
  function contextFailed(loginRequired = false) {
    const request = contextRequest.current;
    endDisconnect('failed'); afterConfirmation.current = null;
    if (request) session.current.fail(request.nonce, loginRequired ? 'login-required' : 'error');
    else session.current.invalidate();
    clearContextRequest(); pendingCapture.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null; syncConnection();
    if (loginRequired) setVisible(true);
    const active = retrieval.current.state;
    if (active.phase === 'loading') stop('Provider context unavailable. Earlier captures and recovery journal retained.', active.nonce);
  }
  function checkConnection(action: 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect' | 'legacy' = 'check') {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current || loginBusy || loginStorageBusy.current || loginAttempt.current || disconnectMode.current !== (action === 'disconnect') || contextRequest.current || !viewReady || saving || busy && action !== 'capture' && action !== 'restored') return;
    const nonce = Crypto.randomUUID();
    if (!session.current.start(nonce)) return;
    setLoginNotice('none');
    contextRequest.current = { nonce, action, navigationObserved: false }; syncConnection();
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    contextTimer.current = setTimeout(() => contextFailed(), 25_000);
    navigate(PROFILE_URL);
  }
  function connect() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current || disconnectMode.current || retrieval.current.state.phase !== 'idle' || loginBusy || loginStorageBusy.current || loginAttempt.current || busy || contextRequest.current || saving) return;
    afterConfirmation.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null; setLoginNotice('none');
    session.current.invalidate(); syncConnection(); setVisible(true); setResult('none');
    navigate(LOGIN_URL);
  }
  function suspendBrowserForOwnerSwitch(): boolean {
    const retrievalActive = retrieval.current.state.phase !== 'idle' || busy || saving || restoring.current;
    const informationActive = !!informationRun.current || !!informationTimer.current || !!informationNavigation.current ||
      informationBusy || informationSaving || informationLoading || informationHistoryBusy || !!informationUncertain.current;
    if (!product || owner.current !== activeOwner.current || !foreground.current || clearingStore.current || clearing ||
        bindingBusy.current || binding || contextRequest.current || disconnectMode.current || disconnecting ||
        retrievalActive || informationActive || loginAttempt.current || loginBusy || loginStorageBusy.current || editingLogin) return false;

    // Invalidate old-document callbacks before asking native code to stop or
    // unmount the WebView. Keep the account association, captures and recovery
    // journal intact so connect() can resume the same account on return.
    clearContextRequest();
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = null;
    login.clearTimer();
    pendingNavigation.current = null;
    pendingCapture.current = null;
    afterConfirmation.current = null;
    flightSourceAttempt.current = null;
    pendingFlightSource.current = null;
    command.current = '';
    reading.current = false;
    epoch.current++;
    setGeneration(epoch.current);
    session.current.invalidate();
    syncConnection();
    web.current?.stopLoading();
    setBrowserActive(false);
    setCanGoBack(false);
    setVisible(false);
    setLoaded(false);
    return true;
  }
  function backWithinProvider() {
    // Browser history is an explicit navigation action, never an interrupt for
    // a session check, saved-login submission, capture, save or restoration.
    if (generation !== epoch.current || owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current ||
      !visible || !browserActive || !canGoBack || !viewReady || disconnectMode.current ||
      retrieval.current.state.phase !== 'idle' || busy || saving || loginBusy || loginStorageBusy.current || loginAttempt.current || contextRequest.current || !web.current) return false;
    informationFailedProfile.current = null; session.current.invalidate(); syncConnection(); web.current.goBack(); return true;
  }
  function dismissLogin() {
    if (informationRun.current) { if (informationRun.current.stage === 'saving') return; stopInformation(); }
    if (clearingStore.current) { setVisible(false); return; }
    setVisible(false);
    // Dismissing a presentation must not orphan an owned capture/restoration check.
    if (retrieval.current.state.phase !== 'idle') return;
    const invalidate = !!contextRequest.current || disconnectMode.current || !!loginAttempt.current ||
      session.current.state.phase === 'observed' || session.current.state.phase === 'checking';
    afterConfirmation.current = null; endDisconnect();
    clearContextRequest(); pendingNavigation.current = null; web.current?.stopLoading();
    epoch.current++; setGeneration(epoch.current);
    if (loginAttempt.current) endLogin('Sign-in presentation closed. No further saved-login attempt will run.', 'cancelled');
    if (invalidate) session.current.cancel();
    syncConnection();
  }
  async function confirmConnection() {
    const observed = session.current.state.observed;
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || disconnectMode.current || !foreground.current || !viewReady || !observed || session.current.state.phase !== 'observed') return;
    const started = epoch.current;
    bindingBusy.current = true; setBinding(true);
    try {
      if (product) {
        if (!owner.current) throw new Error('Explicit local owner required.');
        const saved = await confirmProviderScope(owner.current, observed);
        scope.current = saved; session.current.restoreAssociation(saved.context);
      }
      // Persistence may finish after dismissal/backgrounding. Never resume an
      // operation from that stale observation; the durable association remains.
      if (!mounted.current || owner.current !== activeOwner.current || started !== epoch.current || !foreground.current) return;
      if (!session.current.confirm()) return;
      syncConnection();
      bindingBusy.current = false; setBinding(false);
      const next = afterConfirmation.current; afterConfirmation.current = null;
      if (next === 'retrieve') retrieve();
      if (next === 'recover') recoverView();
    } catch { afterConfirmation.current = null; session.current.invalidate(); syncConnection(); setStatus('Provider association could not be saved. Capture remains blocked.'); }
    finally { bindingBusy.current = false; if (mounted.current) setBinding(false); }
  }
  async function receiveContext(event: WebViewMessageEvent) {
    const request = contextRequest.current;
    const expected = loginPage(currentUrl.current) ? LOGIN_URL : PROFILE_URL;
    if (!request || !request.navigationObserved || !session.current.owns(request.nonce) || !scopedBridge(event.nativeEvent.url, currentUrl.current, expected) || event.nativeEvent.data.length > 2000) return;
    try {
      const message = JSON.parse(event.nativeEvent.data);
      const expectedKind = expected === LOGIN_URL ? 'vf-login-required-v1' : 'vf-context-v1';
      if (message.kind !== expectedKind || message.nonce !== request.nonce || message.url !== expected) return;
      if (request.action === 'disconnect') {
        clearContextRequest(); afterConfirmation.current = null;
        if (message.context?.error === 'session-required') {
          endDisconnect('verified');
          session.current.disconnected(); setDisconnectedAt(new Date().toISOString()); setVisible(false);
          flightSourceAttempt.current = null; pendingFlightSource.current = null; clearCompletedFlightSource();
          setStatus('Provider sign-out verified by a fresh protected-profile request. Saved credentials and local data remain unchanged. Cookie clearing and other sessions are not verified.');
        } else {
          endDisconnect('failed');
          session.current.invalidate();
          setStatus('Provider sign-out could not be verified. Use Abmelden on the original provider page, then retry. Saved data and credentials are preserved.');
        }
        syncConnection(); return;
      }
      if (expected !== PROFILE_URL && message.context?.error !== 'session-required') { contextFailed(); return; }
      if (message.context?.error === 'session-required') { contextFailed(true); return; }
      const accepted = session.current.observe(request.nonce, message.context, new Date().toISOString());
      clearContextRequest(); syncConnection();
      if (!accepted) {
        pendingCapture.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null;
        if (session.current.state.phase === 'mismatch') clearCompletedFlightSource();
        const active = retrieval.current.state;
        // Never restore preferences into an account which failed the context check.
        if (active.phase !== 'idle') stop('Provider context mismatch. Capture rejected; original view recovery retained.', active.nonce);
        return;
      }
      const acceptedContext = session.current.state.observed;
      if (acceptedContext) {
        if (completedFlightSourceRef.current &&
            (!sameContext(completedFlightSourceRef.current.contextBefore, acceptedContext) ||
             !sameContext(completedFlightSourceRef.current.contextAfter, acceptedContext))) clearCompletedFlightSource();
        if (pendingFlightSource.current && !sameContext(pendingFlightSource.current.input.contextAfter, acceptedContext)) pendingFlightSource.current = null;
        if (flightSourceAttempt.current && !sameContext(flightSourceAttempt.current.contextBefore, acceptedContext)) flightSourceAttempt.current = null;
      }
      setVisible(false);
      if (request.action === 'capture') {
        const captured = pendingCapture.current; pendingCapture.current = null;
        if (!captured || !session.current.state.confirmed) { finish('Provider association not confirmed. Capture rejected.'); return; }
        await persistCompletedCapture(captured, session.current.state.observed);
      } else if (request.action === 'restored') {
        await completeRestoration();
      } else if (request.action === 'legacy') {
        if (session.current.state.confirmed) await beginLegacyRecovery();
        else { legacyRequest.current = null; setStatus('Confirm the provisional account, then explicitly retry recovery.'); }
      } else if (request.action === 'retrieve' || request.action === 'recover') {
        if (session.current.state.confirmed) { if (request.action === 'retrieve') retrieve(); else recoverView(); }
        else afterConfirmation.current = request.action;
      }
    } catch { contextFailed(); }
  }
  useEffect(() => {
    if (!product) return;
    const listener = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state === 'active') return;
      informationLoadRequest.current++; setInformationLoading(false);
      informationRetry.current = null; setInformationRetryReady(false);
      historyRequest.current++; setInformationHistoryBusy(false); setInformationHistoryNotice('');
      if (informationRun.current) stopInformation('App im Hintergrund. Informationsabruf beendet; gespeicherte Belege bleiben erhalten.');
      clearContextRequest(); pendingNavigation.current = null; pendingCapture.current = null; afterConfirmation.current = null; endDisconnect(); session.current.invalidate(); syncConnection();
      flightSourceAttempt.current = null; pendingFlightSource.current = null;
      web.current?.stopLoading(); epoch.current++; setGeneration(epoch.current);
      if (loginAttempt.current) endLogin('App left the foreground. Sign-in stopped; retry explicitly.', 'cancelled');
      if (retrieval.current.state.phase === 'loading') finish('App left the foreground. Recovery may be required.');
    });
    return () => { listener.remove(); clearContextRequest(); session.current.cancel(); };
  }, [product]);
  async function loadedPage(page: string) {
    if (product && page !== currentUrl.current) return;
    const pageEpoch = epoch.current;
    phase.current.loaded = true; currentUrl.current = page; setUrl(page); setLoaded(true);
    if (informationRun.current) {
      const run = informationRun.current;
      if (page !== run.url) { stopInformation('Quellseite oder Anmeldung nicht verfügbar. Gespeicherte Informationen bleiben erhalten.', true); return; }
      // A failed previous request can report load-end for this same URL after
      // the new run starts. Require this leg's native load-start before reading.
      if (run.stage !== 'selection' && (informationNavigation.current?.run !== run || informationNavigation.current.nonce !== run.messageNonce)) return;
      run.observeNavigation(page);
      web.current?.injectJavaScript(run.stage === 'selection' ? informationSelectionScript(run.messageNonce) : run.stage === 'read' ? informationScript(run.category, run.messageNonce) : contextScript(run.messageNonce));
      return;
    }
    if (product && contextRequest.current) {
      if (!contextRequest.current.navigationObserved) { contextFailed(); return; }
      if (page === PROFILE_URL) web.current?.injectJavaScript(contextScript(contextRequest.current.nonce));
      else if (loginPage(page)) web.current?.injectJavaScript(loginRequiredScript(contextRequest.current.nonce));
      else contextFailed();
      return;
    }
    const loginLoad = login.pageLoaded(page, pageEpoch);
    if (loginLoad) { await loginLoad; return; }
    if (retrieval.current.state.phase === 'loading' && !flightUrl(page)) {
      if (product) {
        session.current.cancel();
        const nonce = Crypto.randomUUID(); session.current.start(nonce);
        session.current.fail(nonce, loginPage(page) ? 'login-required' : 'error'); syncConnection();
        const active = retrieval.current.state;
        stop('Provider left the expected flight document. Recovery retained.', active.nonce);
        if (loginPage(page)) setVisible(true);
      } else finish('Complete provider login, then tap Retrieve flights again. Previous captures preserved.');
    }
  }
  function stop(message: string, nonce?: string) {
    const state = retrieval.current.state;
    if (nonce ? !retrieval.current.finish(nonce) : state.phase === 'saving') return;
    bridgeTiming.current?.(false);bridgeTiming.current=null;
    if (!nonce && state.phase === 'loading') retrieval.current.finish(state.nonce);
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    pendingNavigation.current = null;
    flightSourceAttempt.current = null;
    if (legacyAttempt.current) { original.current = null; legacyAttempt.current = null; }
    run.current = null; command.current = ''; reading.current = false; viewPhase.current = null; restoring.current = false;
    testPaused.current = false; setPaused(null);
    epoch.current++; setGeneration(epoch.current); if (!product) setBrowserActive(false); setLoaded(false); setVisible(false);
    if (mounted.current) { setBusy(false); setSaving(false); setStatus(message); if (product) setResult(captureSaved.current ? 'captured' : cancelled.current ? 'cancelled' : 'failed'); }
  }
  function startRestoration(message: string, nonce: string) {
    if (!original.current || !retrieval.current.owns(nonce)) return;
    if (retrieval.current.state.phase === 'saving') retrieval.current.resume(nonce);
    outcome.current = message; restoring.current = true; restoreSteps.current = 0; viewPhase.current = 'restore';
    testPaused.current = false; setPaused(null);
    run.current = null; reading.current = false; command.current = ''; setSaving(false); setBusy(true); if (!product) setVisible(true);
    web.current?.stopLoading(); armTimeout(nonce); navigate(FLIGHT_URL);
  }
  function finish(message: string, nonce?: string) {
    const state = retrieval.current.state;
    if (nonce && !retrieval.current.owns(nonce)) return;
    if (!nonce && state.phase === 'saving') return;
    if (legacyAttempt.current) { setRecovery(true); stop('Reviewed recovery stopped. Legacy source and safety evidence retained; retry explicitly.', nonce ?? (state.phase === 'loading' ? state.nonce : undefined)); return; }
    if (product && !foreground.current && state.phase !== 'idle') {
      stop('App left foreground. Original view recovery retained when required.', nonce ?? state.nonce); return;
    }
    if (state.phase !== 'idle' && original.current && !restoring.current) { startRestoration(message, state.nonce); return; }
    if (restoring.current) { setRecovery(true); message = `${outcome.current} Original view restoration is pending. Sign into the original account and retry restoration.`; }
    stop(message, nonce);
  }
  function recoverView() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || legacyPending.current || disconnectMode.current || product && !session.current.state.confirmed || !original.current || !viewReady || busy || loginBusy || loginAttempt.current) return;
    const nonce = Crypto.randomUUID(); if (!retrieval.current.start(nonce)) return;
    startRestoration('Earlier export recovery.', nonce);
  }
  function requestLegacyRecovery(fingerprint: string, acceptedCurrent: ViewPreferences | null = null) {
    if (!product || !legacyRecoveryAvailable || !legacyPending.current || fingerprint !== legacyFingerprint.current ||
      owner.current !== activeOwner.current || !foreground.current || clearingStore.current || bindingBusy.current || !viewReady ||
      contextRequest.current || disconnectMode.current || busy || saving || loginBusy || loginStorageBusy.current || loginAttempt.current ||
      retrieval.current.state.phase !== 'idle' || original.current) return;
    // An acceptance can only refer to the exact private difference already displayed.
    if (acceptedCurrent && (!legacyChoice || legacyChoice.fingerprint !== fingerprint || canonical(legacyChoice.current) !== canonical(acceptedCurrent))) return;
    legacyRequest.current = { fingerprint, acceptedCurrent };
    checkConnection('legacy');
  }
  async function beginLegacyRecovery() {
    const request = legacyRequest.current; legacyRequest.current = null;
    if (!request || !legacyPending.current || !session.current.state.confirmed || !foreground.current) return;
    const started = epoch.current, authorizedScope = requireScope();
    bindingBusy.current = true; setBinding(true);
    try {
      const target = await readReviewedRecovery(request.fingerprint);
      if (!mounted.current || owner.current !== activeOwner.current || epoch.current !== started || !foreground.current) return;
      const copy = await prepareScopedLegacy(authorizedScope, request.fingerprint, target);
      if (!mounted.current || owner.current !== activeOwner.current || epoch.current !== started || !foreground.current) return;
      const nonce = Crypto.randomUUID(); if (!retrieval.current.start(nonce)) return;
      legacyAttempt.current = { copy, safety: null, acceptedCurrent: request.acceptedCurrent };
      original.current = copy.target; setLegacyChoice(null);
      viewPhase.current = 'snapshot'; restoreSteps.current = 0; reading.current = false; command.current = '';
      captureSaved.current = false; cancelled.current = false; setBusy(true); setResult('none');
      armTimeout(nonce); navigate(FLIGHT_URL);
    } catch { setStatus('Reviewed recovery could not be prepared. Quarantine retained.'); }
    finally { bindingBusy.current = false; if (mounted.current) setBinding(false); }
  }
  function openCaptureLab(kind: 'run' | 'window') {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !viewReady || recovery || original.current || busy || loginBusy || loginAttempt.current || retrieval.current.state.phase !== 'idle') return;
    if (kind === 'run') setShowRun(true); else setShowWindow(true);
  }
  function cancelRetrieval() {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || restoring.current) return;
    cancelled.current = true; clearContextRequest(); pendingCapture.current = null;
    flightSourceAttempt.current = null; pendingFlightSource.current = null;
    session.current.cancel(); if (product) syncConnection();
    web.current?.stopLoading();
    finish('Retrieval cancelled. Previous captures preserved.', state.nonce);
  }
  function armTimeout(nonce: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => finish('Export step timed out. Previous captures preserved; retry after checking provider login.', nonce), 30_000);
  }
  function extract() {
    const state = retrieval.current.state, active = run.current;
    if (contextRequest.current || state.phase !== 'loading' || (!active && !viewPhase.current) || reading.current || testPaused.current || !flightUrl(currentUrl.current)) return;
    if (viewPhase.current) {
      if (++restoreSteps.current > 30) { finish('View verification navigation limit reached.', state.nonce); return; }
      reading.current = true; command.current = Crypto.randomUUID(); armTimeout(state.nonce);
      setStatus(viewPhase.current === 'snapshot' ? 'Saving your original provider view before any export changes…' : `Restoring original provider view: ${viewPhase.current}…`);
      bridgeTiming.current?.(false);bridgeTiming.current=startFlightSpan(`provider-view-${viewPhase.current}`);
      web.current?.injectJavaScript(viewScript(command.current, viewPhase.current, original.current)); return;
    }
    if (!active) return;
    if (++active.commands > 4100) { finish('Export navigation limit reached. Narrow the period; previous captures preserved.', state.nonce); return; }
    reading.current = true; command.current = Crypto.randomUUID(); phase.current.injections++;
    armTimeout(state.nonce);
    setStatus(`Verifying export: ${active.phase}; ${active.pages.length} pages read.`);
    bridgeTiming.current?.(false);bridgeTiming.current=startFlightSpan(`provider-export-${active.phase}`);
    web.current?.injectJavaScript(exportScript(command.current, active));
  }
  // Commit the page-scoped bridge before executing the explicit table reader.
  useEffect(() => { if ((product || visible) && loaded && busy && flightUrl(url)) extract(); }, [visible, loaded, busy, url]);
  useEffect(() => {
    const destination = pendingNavigation.current; pendingNavigation.current = null;
    // Commit this generation's native event handlers before initiating navigation.
    if (destination && product) {
      if (destination.nativeReload && destination.url === PROFILE_URL) web.current?.reload();
      else web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(destination.url)});true;`);
    }
  }, [generation]);
  function navigate(uri: string) {
    if (!providerUrl(uri)) return;
    informationFailedProfile.current = null;
    setLoaded(false); currentUrl.current = uri; setUrl(uri); epoch.current++; setGeneration(epoch.current);
    if (product && browserActive) {
      // Navigate the existing document; changing a key would discard the controller's browser.
      web.current?.stopLoading();
      pendingNavigation.current = { url: uri };
    } else { setBrowserActive(true); setSource({ uri }); }
  }
  function toggleTestPause() {
    if (!viewReady || recovery || busy || loginBusy || loginAttempt.current || retrieval.current.state.phase !== 'idle') return;
    testPauseEnabled.current = !testPauseEnabled.current; setPauseEnabled(testPauseEnabled.current);
  }
  function togglePreBackupPause() {
    if (!viewReady || recovery || busy || loginBusy || loginAttempt.current || retrieval.current.state.phase !== 'idle') return;
    preBackupPauseEnabled.current = !preBackupPauseEnabled.current; setPreBackupPause(preBackupPauseEnabled.current);
  }
  function continueTestRetrieval(nonce: string) {
    if (!testPaused.current || restoring.current || !retrieval.current.owns(nonce) || retrieval.current.state.phase !== 'loading') return;
    const beforeBackup = viewPhase.current === 'backup' && run.current?.phase === 'reset';
    const afterReset = !viewPhase.current && run.current?.phase === 'columns';
    if (!beforeBackup && !afterReset) return;
    testPaused.current = false; setPaused(null); extract();
  }
  function toggleProviderPage() {
    if (!visible || (!providerExpanded && retrieval.current.state.phase === 'saving')) return;
    setProviderExpanded(expanded => !expanded);
  }
  function retrieve() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || legacyPending.current || disconnectMode.current || contextRequest.current || loginAttempt.current || loginBusy || !viewReady || recovery || product && !session.current.state.confirmed) return;
    let prepared: ExportRun;
    try { prepared = beginExport({ from, to }); } catch { setStatus('Use valid inclusive dates in YYYY-MM-DD order.'); if (product) setResult('failed'); return; }
    let contextBefore: ObservedContext | null = null;
    if (product) {
      try { contextBefore = validateContext(session.current.state.observed); }
      catch { setStatus('Provider profile must be freshly observed before retrieval.'); setResult('failed'); return; }
    }
    const nonce = Crypto.randomUUID();
    if (!retrieval.current.start(nonce)) return;
    flightSourceAttempt.current = product && contextBefore ? {
      owner: owner.current!, contextBefore,
      requestedWindow: { from: prepared.request.from, to: prepared.request.to, participation: 'Pilot oder Fluglehrer' },
    } : null;
    pendingFlightSource.current = null;
    if (product) clearCompletedFlightSource();
    setViewStrategy(null);
    run.current = prepared; reading.current = false; viewPhase.current = 'snapshot'; restoreSteps.current = 0;
    testPaused.current = false; setPaused(null);
    captureSaved.current = false; cancelled.current = false; setResult('none');
    setBusy(true); setVisible(!product);
    phase.current = { loaded: false, progress: 0, injections: 0 };
    setStatus('Opening your personal flightbook automatically. If asked, complete provider login, then tap Retrieve again.');
    armTimeout(nonce);
    // Every retrieval requests the page again, rather than recapturing stale DOM.
    // Remounting also installs the flight-scoped bridge before that page loads;
    // provider cookies stay in the same native browser store.
    navigate(FLIGHT_URL);
  }
  async function receive(event: WebViewMessageEvent) {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || !bridgeSource(event.nativeEvent.url, currentUrl.current)) return;
    const nonce = state.nonce;
    try {
      if (event.nativeEvent.data.length > 2_000_000) throw new Error('Oversized response.');
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (!message || typeof message !== 'object' || (message as Record<string, unknown>).token !== command.current) return;
      if (!reading.current) return;
      bridgeTiming.current?.(true);bridgeTiming.current=null;
      if (viewPhase.current) {
        const stage = viewPhase.current;
        const captured = decodeView(event.nativeEvent.data, event.nativeEvent.url, currentUrl.current, command.current, stage, original.current);
        if (stage === 'snapshot') {
          if (!captured || !retrieval.current.beginSave(nonce)) return;
          setSaving(true); if(timeout.current) clearTimeout(timeout.current); timeout.current = null;
          if (legacyAttempt.current) {
            const attempt = legacyAttempt.current;
            const safetyEpoch = epoch.current;
            try {
              await saveLegacySafety(requireScope(), attempt.copy.fingerprint, captured);
              if (!mounted.current || !retrieval.current.owns(nonce) || owner.current !== activeOwner.current) return;
              attempt.safety = captured; retrieval.current.resume(nonce); setSaving(false);
              if (!foreground.current || epoch.current !== safetyEpoch || !session.current.state.confirmed) { finish('Recovery interrupted before replay.', nonce); return; }
              if (legacyViewNeedsChoice(attempt.copy.target, captured) && (!attempt.acceptedCurrent || canonical(attempt.acceptedCurrent) !== canonical(captured))) {
                setLegacyChoice({ fingerprint: attempt.copy.fingerprint, target: attempt.copy.target, current: captured });
                stop('Current provider view differs from the reviewed target. Safety evidence saved; choose privately before replay.', nonce); setResult('review-required'); return;
              }
              restoring.current = true; outcome.current = 'Reviewed legacy recovery.';
              viewPhase.current = 'restore'; reading.current = false; command.current = ''; extract(); return;
            } catch { finish('Safety view could not be preserved. No replay started.', nonce); return; }
          }
          try { await (product ? saveScopedView(requireScope(), captured) : saveOriginalView(captured)); }
          catch { setRecovery(true); stop('Original view could not be journaled. No export settings changed; recovery must be checked before another export.', nonce); return; }
          if (!mounted.current || !retrieval.current.owns(nonce)) return;
          original.current = captured; setRecovery(true); setViewStrategy(captured.reset ? 'reset' : 'reserved backup'); retrieval.current.resume(nonce); setSaving(false);
          if (product && !foreground.current) { finish('App interrupted after journaling.', nonce); return; }
          if(run.current) run.current.accountLabel = captured.accountLabel;
          viewPhase.current = 'backup';
          if (preBackupPauseEnabled.current) {
            reading.current = false; command.current = '';
            testPaused.current = true; setPaused(nonce);
            if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
            setStatus('Test checkpoint: original view journaled before backup changes. Continue or cancel.');
            return;
          }
        } else if (stage === 'backup') {
          viewPhase.current = 'backup-load';
          if ((message as Record<string, unknown>).status === 'saved-request') {
            // The submit acknowledgement precedes navigation; never inject into
            // that old document or advance again until the new page loads.
            command.current = ''; return;
          }
        } else if (stage === 'backup-load') {
          viewPhase.current = 'backup-verify';
          if ((message as Record<string, unknown>).status === 'load-request') { command.current = ''; return; }
        } else if (stage === 'backup-verify') {
          if (!original.current) return;
          viewPhase.current = null;
        } else if (stage === 'verify') {
          if (product) { reading.current = false; command.current = ''; checkConnection('restored'); }
          else await completeRestoration();
          return;
        } else { viewPhase.current = VIEW_PHASES[VIEW_PHASES.indexOf(stage) + 1]!; }
        reading.current = false; command.current = ''; extract(); return;
      }
      if (!run.current) return;
      const completedPhase = run.current.phase;
      const result = acceptExportMessage(run.current, event.nativeEvent.data, event.nativeEvent.url, currentUrl.current, command.current);
      reading.current = false; command.current = '';
      if (completedPhase === 'reset' && run.current.phase === 'columns' && testPauseEnabled.current) {
        testPaused.current = true; setPaused(nonce);
        if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
        setStatus('Test checkpoint: export reset verified; original view recovery is pending. Continue or cancel, or force-stop to test recovery.');
        return;
      }
      if (result.nextUrl) { armTimeout(nonce); navigate(result.nextUrl); return; }
      if (!result.complete) { extract(); return; }
      const data = result.complete;
      if (product) { pendingCapture.current = data; checkConnection('capture'); return; }
      await persistCompletedCapture(data);
    } catch (error) {
      // Report only our owned stage, never provider payloads or exception text.
      const stage = viewPhase.current ? `view-${viewPhase.current}` : run.current ? `export-${run.current.phase}` : 'capture';
      finish(viewPhase.current === 'snapshot' ? viewProtectionMessage(error) ?? 'Original view could not be protected because provider settings are unsupported. No export settings changed.' : `Retrieval validation failed at ${stage}. Previous captures preserved.`, nonce);
    }
  }
  async function completeRestoration() {
    const active = retrieval.current.state;
    if (active.phase !== 'loading' || !original.current || !retrieval.current.beginSave(active.nonce)) return;
    setSaving(true); if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    const reviewedRecovery = !!legacyAttempt.current;
    try {
      if (legacyAttempt.current) {
        const attempt = legacyAttempt.current;
        const verificationEpoch = epoch.current;
        if (!attempt.safety || !foreground.current || !session.current.state.confirmed || await legacyRecoveryFingerprint() !== attempt.copy.fingerprint ||
          !foreground.current || epoch.current !== verificationEpoch || !session.current.state.confirmed) throw new Error('Recovery evidence changed.');
        await finishScopedLegacy(requireScope(), attempt.copy.fingerprint, original.current, attempt.safety);
        if (!mounted.current || owner.current !== activeOwner.current || !retrieval.current.owns(active.nonce)) return;
        legacyPending.current = false; legacyAttempt.current = null; setLegacyChoice(null);
      } else await (product ? clearScopedView(requireScope(), original.current) : clearOriginalView(original.current));
      if (!mounted.current || !retrieval.current.owns(active.nonce)) return;
      original.current = null; setRecovery(false); restoring.current = false;
      const pendingSource = pendingFlightSource.current; pendingFlightSource.current = null;
      if (product && pendingSource && captureSaved.current && foreground.current && owner.current === activeOwner.current &&
          pendingSource.owner === owner.current) {
        try {
          const restoredContext = validateContext(session.current.state.observed);
          if (sameContext(pendingSource.input.contextBefore, restoredContext) &&
              sameContext(pendingSource.input.contextAfter, restoredContext)) {
            const completed = JSON.parse(canonical(pendingSource.input)) as RealFlightSourceInput;
            completedFlightSourceRef.current = completed; setCompletedFlightSource(completed);
          }
        } catch { /* An unverified final profile cannot publish the captured context. */ }
      }
      stop(`${outcome.current} Original provider view restored and verified.`, active.nonce);
      if (reviewedRecovery) setResult('recovered');
    } catch { finish('Original view journal could not be cleared. Recovery retained.', active.nonce); }
  }
  async function persistCompletedCapture(data: ProbeSnapshot, observedAfter: ObservedContext | null = null) {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || !retrieval.current.beginSave(state.nonce)) return;
    const nonce = state.nonce;
    setSaving(true); setStatus('Saving validated capture locally…');
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    try {
      await (product ? saveScopedCapture(requireScope(), data) : saveCapture(data));
      if (!mounted.current || !retrieval.current.owns(nonce)) return;
      const attempt = flightSourceAttempt.current;
      const sourceInput = product ? makeFlightSourceInput(attempt, observedAfter, data) : null;
      pendingFlightSource.current = sourceInput && attempt ? { owner: attempt.owner, input: sourceInput } : null;
      flightSourceAttempt.current = null;
      setSnapshot(data); setCaptureLoadState('ready'); captureSaved.current = true;
      if (product) setLastSuccessfulCaptureAt(data.retrievedAt);
      finish(`Saved ${data.rows.length} flights across ${data.exportContext?.pageCount} pages for the requested period. Account identity and time basis remain unverified.`, nonce);
    } catch { finish('Local saving failed. Earlier captures retained.', nonce); }
  }

  // Android may report synthetic history/error-document callbacks after failure.
  // Preserve its exact-profile evidence until an explicit navigation/request;
  // callbacks alone cannot authorize reload, which still requires PROFILE_URL.
  const browser = browserActive && <WebView key={product ? `retained-provider-${documentId}` : generation} ref={web} source={source} originWhitelist={['*']}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { if (generation !== epoch.current) return false; const allowed = providerUrl(request.url); if (allowed && request.isTopFrame !== false && request.url !== PROFILE_URL) informationFailedProfile.current = null; if (product && contextRequest.current && request.isTopFrame !== false && request.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => { if (generation === epoch.current) finish('New browser window blocked in this bounded PoC.'); }}
        onLoadStart={event => { if (generation !== epoch.current) return; if (informationRun.current && event.nativeEvent.url === informationRun.current.url) informationNavigation.current = { run: informationRun.current, nonce: informationRun.current.messageNonce }; if (product && contextRequest.current && event.nativeEvent.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (retrieval.current.state.phase === 'loading') {
          // Native load-start can beat the bridge acknowledgement. Advance only
          // a still-owned, outstanding save/load command; acknowledged commands
          // already cleared their token and must not advance a second time.
          if (reading.current && command.current && original.current && !original.current.reset) {
            if (viewPhase.current === 'backup') viewPhase.current = 'backup-load';
            else if (viewPhase.current === 'backup-load') viewPhase.current = 'backup-verify';
          }
          reading.current = false; command.current = '';
        } currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(false); }}
        onNavigationStateChange={state => { if (generation !== epoch.current) return; currentUrl.current = state.url; setUrl(state.url); setCanGoBack(state.canGoBack); }}
        onLoadProgress={event => { if (generation === epoch.current) phase.current.progress = event.nativeEvent.progress; }}
        onLoadEnd={event => { if (generation === epoch.current) void loadedPage(event.nativeEvent.url); }}
        onMessage={event => {
          if (generation !== epoch.current) return;
          if (informationRun.current) { void receiveInformation(event); return; }
          if (product && contextRequest.current) { void receiveContext(event); return; }
          if (login.receiveMessage(event.nativeEvent)) return;
          if(flightUrl(url))void receive(event);
        }}
        onError={event => { if (generation !== epoch.current) return; if (informationRun.current) { if (event?.nativeEvent.url === PROFILE_URL && currentUrl.current === PROFILE_URL && informationRetry.current && ['before', 'after'].includes(informationRun.current.stage)) informationFailedProfile.current = { target: informationRetry.current, epoch: epoch.current }; stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return; } if (product && contextRequest.current) { contextFailed(); return; } if (product) { endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login page failed to load. Saved login and captures preserved.') : finish('Provider page failed to load. Previous captures preserved.'); }}
        onHttpError={() => { if (generation !== epoch.current) return; if (informationRun.current) { stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return; } if (product && contextRequest.current) { contextFailed(); return; } if (product) { endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login returned an HTTP error. Saved login and captures preserved.') : finish('Provider returned an HTTP error. Previous captures preserved.'); }}
        onContentProcessDidTerminate={() => { if (generation !== epoch.current) return; if (informationRun.current) { stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return; } if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
        onRenderProcessGone={() => { if (generation !== epoch.current) return; if (informationRun.current) { stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return; } if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
      />;
  return { retryInformation, informationRetryReady: informationRetryReady && owner.current === localOwner, informationNeedsReload, reloadInformation, informationLoading, informationCanReload: product && mounted.current && !!scope.current && scope.current.owner === localOwner && owner.current === activeOwner.current && foreground.current && !informationRun.current && !clearingStore.current && !bindingBusy.current, informationHistory: owner.current === localOwner ? informationHistory : null, informationHistoryBusy, informationHistoryNotice, loadInformationHistory, informationCategory, informationCaptures: owner.current === localOwner ? informationCaptures : [], informationNotice, informationBusy, informationSaving, startInformation, stopInformation, nextInformationCategory, captureLoadState, canGoBack, backWithinProvider, legacyChoice, requestLegacyRecovery, legacyRecoveryAvailable, clearing, clearNotice, proofNotice, clearLocalSession, sessionClearingAvailable, sessionProofAvailable, binding, legacyRecovery: legacyPending.current, loginNotice, disconnectNotice, credentialNotice, startDisconnect, checkDisconnection, disconnecting, disconnectedAt, refreshRecovery, connection, checkConnection, connect, suspendBrowserForOwnerSwitch, dismissLogin, confirmConnection, lastSuccessfulCaptureAt, result, browser, showRun, setShowRun, showWindow, setShowWindow, viewReady, recovery, original, editingLogin, loginBusy, username, setUsername, password, setPassword, saveLogin, setEditingLogin, providerExpanded, visible, status, busy, openCaptureLab, pauseEnabled, toggleTestPause, preBackupPause, togglePreBackupPause, from, setFrom, to, setTo, saving, restoring, navigate, setVisible, cancelRetrieval, retrieve, hasLogin, useLogin, forgetLogin, recoverView, paused, continueTestRetrieval, viewStrategy, url, toggleProviderPage, browserActive, snapshot: product && owner.current !== localOwner ? null : snapshot, completedFlightSource: product && owner.current === localOwner && !busy && !recovery ? completedFlightSource : null, setProviderExpanded, web, currentUrl, retrieval, loaded, source, generation, epoch };
}

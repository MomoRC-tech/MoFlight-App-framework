import { ActivityRequest } from './activity-request';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { startFlightSpan } from './flight-diagnostics';
import { recordProviderDocument, recordProviderEvent, loginDiagnosticScript, readLoginDiagnostic } from './provider-diagnostics';
import { bridgeSource, flightUrl, FLIGHT_URL, LOGIN_URL, providerUrl, type ProbeSnapshot } from './probe';
import { clearOriginalView, latestCapture, readOriginalView, saveCapture, saveOriginalView } from './storage';
import { loginPage } from './login';
import { useSavedLogin } from './use-saved-login';
import { acceptExportMessage, exportProgress, beginExport, calendarYearRequest, recentCaptureRequest, exportScript, type ExportRun } from './export';
import { HTTP_FLIGHT_READ_ENABLED, decodeHttpExportReply, exportHttpScript } from './export-http';
import { decodeView, VIEW_PHASES, viewScript, viewProtectionMessage, type ViewPhase, type ViewPreferences } from './view';
import { canonical } from '@moflight/flight-logbook';
import { legacyViewNeedsChoice, type LegacyRecoveryCopy } from './legacy-recovery-store';
import { Retrieval } from './retrieval';
import { PROFILE_URL, contextScript, loginRequiredScript, loginDocumentScript, sameContext, scopedBridge, validateContext, type ObservedContext } from './context';
import { ConnectionSession } from './connection-state';
import { connectionFlow, type ConnectionFlow } from './connection-flow';
import { loadProviderScope, confirmProviderScope, loadScopedCapture, loadScopedView, saveScopedCapture, saveScopedView, clearScopedView, supersedeScopedView, prepareScopedLegacy, saveLegacySafety, legacyQuarantined, finishScopedLegacy } from './scoped-storage';
import { clearProviderStore, proveSyntheticStore, sessionClearingAvailable, sessionProofAvailable, legacyRecoveryAvailable, legacyRecoveryFingerprint, readReviewedRecovery } from './session-store';
import type { ProviderScope } from './scope-store';
import { useInformationController, type FeatureInformationCategory } from './use-information-controller';
import type { RealFlightSourceInput } from './real-flight-source';
import { rememberAuthenticatedProfileNative } from '../ai/historical-provider-identity-native';

type FlightSourceAttempt = {
  owner: string;
  contextBefore: ObservedContext;
  requestedWindow: { from: string; to: string; participation: 'Pilot oder Fluglehrer' };
};
type PendingFlightSource = { owner: string; input: RealFlightSourceInput };

type DevelopmentCheckpoint = 'journal-armed' | 'journal-paused' | 'recovery-armed' | 'recovery-paused' | null;

export function useAccessController(product = false, localOwner?: string, developmentRecoveryCheckpoints = false) {
  const activeOwner = useRef(localOwner); activeOwner.current = localOwner;
  const owner = useRef(localOwner), scope = useRef<ProviderScope | null>(null);
  const [activityChecking, setActivityChecking] = useState(false);
  const activityRequest = useRef<ActivityRequest | null>(null);
  if (!activityRequest.current) activityRequest.current = new ActivityRequest({
    inject: script => { if (!web.current) throw new Error('Provider document unavailable.'); web.current.injectJavaScript(script); },
    uuid: Crypto.randomUUID, now: Date.now, changed: active => { if (mounted.current) setActivityChecking(active); },
  });
  useEffect(() => () => activityRequest.current?.abandon(), []);
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
  const contextRequest = useRef<{ nonce: string; action: 'status' | 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect' | 'legacy'; navigationObserved: boolean } | null>(null);
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
  const guidedFlightLogin = useRef(false);
  const guidedLoginResume = useRef<{ owner: string | undefined; retainedLoginDocument: boolean } | null>(null);
  const signInDocument = useRef<string | null>(null);
  const loginObservation = useRef<{ nonce: string; url: string; epoch: number } | null>(null);
  const [lastSuccessfulCaptureAt, setLastSuccessfulCaptureAt] = useState<string | null>(null);
  const [result, setResult] = useState<'none' | 'captured' | 'cancelled' | 'failed' | 'review-required' | 'recovered'>('none');
  const captureSaved = useRef(false), cancelled = useRef(false);
  const [showRun, setShowRun] = useState(false);
  const [showWindow, setShowWindow] = useState(false);
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL);
  const pendingNavigation = useRef<{ url: string; nativeReload?: boolean } | null>(null);
  const retrieval = useRef(new Retrieval()), epoch = useRef(0), mounted = useRef(true);
  const bridgeTiming=useRef<((succeeded:boolean)=>void)|null>(null);
  const loginPageTiming=useRef<((succeeded:boolean)=>void)|null>(null), userWaitTiming=useRef<((succeeded:boolean)=>void)|null>(null), contextTiming=useRef<((succeeded:boolean)=>void)|null>(null);
  function stopDiagnosticLogin(succeeded=false) { loginPageTiming.current?.(succeeded);loginPageTiming.current=null;userWaitTiming.current?.(succeeded);userWaitTiming.current=null;contextTiming.current?.(succeeded);contextTiming.current=null; }
  useEffect(()=>()=>stopDiagnosticLogin(false),[]);
  const run = useRef<ExportRun | null>(null), command = useRef(''), reading = useRef(false);
  const httpRead = useRef<{ token: string; anchor: string; target: string; expected: ObservedContext; owner: string; nonce: string; epoch: number } | null>(null);
  const httpNext = useRef<string | null>(null), httpFallback = useRef(false);
  function abortHttpRead() {
    if (httpRead.current) web.current?.injectJavaScript('window.__moflightExportHttpAbort?.();true;');
    httpRead.current = null; httpNext.current = null;
  }
  useEffect(() => () => abortHttpRead(), []);
  const original = useRef<ViewPreferences | null>(null), viewPhase = useRef<ViewPhase | null>(null), restoring = useRef(false), restoreSteps = useRef(0), outcome = useRef('');
  const restorationOnly = useRef(false);
  const [recovery, setRecovery] = useState(false), [viewReady, setViewReady] = useState(false);
  const freshFlightAttempt=useRef(false);
  const [viewReadFailed,setViewReadFailed]=useState(false);
  const [viewStrategy, setViewStrategy] = useState<'reset' | 'reserved backup' | null>(null);
  const [captureRequest] = useState(() => product ? recentCaptureRequest() : calendarYearRequest());
  const [from, setFrom] = useState(captureRequest.from), [to, setTo] = useState(captureRequest.to);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const diagnosticMessages = useRef(0);
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [browserActive, setBrowserActive] = useState(!product);
  const [canGoBack, setCanGoBack] = useState(false);
  const [providerExpanded, setProviderExpanded] = useState(false);
  const [flow,setFlow] = useState<ConnectionFlow>({phase:'idle'});
  const visible=flow.phase==='sign-in';
  function setVisible(show:boolean){setFlow(previous=>connectionFlow(previous,{type:show?'show-login':'hide-login'}));}
  const [busy, setBusyState] = useState(false), [loaded, setLoaded] = useState(false);
  // React state is the rendered indicator, while admission checks also need
  // the latest transition before React commits the render. Information jobs
  // resolve their promises in the same turn that they release browser busy;
  // the combined refresh may start the next job before a new closure exists.
  const busyRef = useRef(false);
  function setBusy(value: boolean) { busyRef.current = value; setBusyState(value); }
  const failedDocument=useRef<string|null>(null);
  const resumeConnection=useRef<()=>boolean>(()=>false);resumeConnection.current=resumeGuidedFlightConnection;
  useEffect(() => { if (!browserActive) return; recordProviderEvent('provider-mounted'); return () => recordProviderEvent('provider-unmounted'); }, [browserActive, documentId]);
  const [saving, setSavingState] = useState(false);
  const savingRef = useRef(false);
  function setSaving(value: boolean) { savingRef.current = value; setSavingState(value); }
  const testPauseEnabled = useRef(false), testPaused = useRef(false);
  const preBackupPauseEnabled = useRef(false);
  const [pauseEnabled, setPauseEnabled] = useState(false), [paused, setPaused] = useState<string | null>(null);
  const [preBackupPause, setPreBackupPause] = useState(false);
  const developmentAllowed = useRef(false); developmentAllowed.current = product && developmentRecoveryCheckpoints;
  const developmentCheckpointRef = useRef<DevelopmentCheckpoint>(null);
  const [developmentCheckpoint, setDevelopmentCheckpoint] = useState<DevelopmentCheckpoint>(null);
  function checkpoint(next: DevelopmentCheckpoint) {
    developmentCheckpointRef.current = next; setDevelopmentCheckpoint(next);
  }
  function clearDevelopmentCheckpoints() {
    if (!developmentCheckpointRef.current) return;
    const held = developmentCheckpointRef.current.endsWith('-paused');
    checkpoint(null);
    if (held) { testPaused.current = false; setPaused(null); }
  }
  function armDevelopmentCheckpoint(kind: 'journal' | 'recovery') {
    if (!developmentAllowed.current || !mounted.current || !foreground.current ||
      owner.current !== activeOwner.current || !scope.current || !viewReady || clearingStore.current || bindingBusy.current ||
      legacyPending.current || disconnectMode.current || contextRequest.current || loginAttempt.current || loginBusy ||
      busy || saving || information.active() || retrieval.current.state.phase !== 'idle') return;
    if (kind === 'journal' ? recovery || !!original.current : !recovery || !original.current) return;
    checkpoint(kind === 'journal' ? 'journal-armed' : 'recovery-armed');
  }
  useEffect(() => () => { developmentCheckpointRef.current = null; }, []);
  useEffect(() => {
    if (developmentAllowed.current || !developmentCheckpointRef.current) return;
    if (developmentCheckpointRef.current.endsWith('-paused')) stop('Development checkpoint revoked. Original view recovery retained.');
    else clearDevelopmentCheckpoints();
  }, [developmentRecoveryCheckpoints]);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. Choose an inclusive period; configuration is verified before capture.');
  const [flightProgress,setFlightProgress]=useState<{done:number;total:number|null}>({done:0,total:null});
  const [captureLoadState, setCaptureLoadState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const login = useSavedLogin({
    product,
    canStart: action => owner.current === activeOwner.current && !clearingStore.current && !bindingBusy.current &&
      !activityRequest.current?.active() && !contextRequest.current && !disconnectMode.current && retrieval.current.state.phase === 'idle' &&
      (action !== 'forget' || !busy && !saving) && (action !== 'use' || foreground.current && !busy),
    isCurrent: pageEpoch => mounted.current && pageEpoch === epoch.current,
    currentUrl: () => currentUrl.current,
    beforeUse: () => { afterConfirmation.current = null; if (product) { session.current.invalidate(); syncConnection(); setResult('none'); } },
    navigate, inject: script => web.current?.injectJavaScript(script), setStatus, setVisible, uuid: Crypto.randomUUID,
  });
  const { loginAttempt, loginStorageBusy, endLogin, setLoginNotice, loginNotice, credentialNotice,
    hasLogin, editingLogin, setEditingLogin, loginBusy, username, setUsername, password, setPassword,
    saveLogin, forgetLogin, useLogin } = login;
  const information = useInformationController({
    product, mounted: () => mounted.current, foreground: () => foreground.current,
    ownerCurrent: () => owner.current === activeOwner.current, scope: requireScope,
    canStart: retry => !activityRequest.current?.active() && product && visible && (loaded || retry) && foreground.current && !busyRef.current && !savingRef.current && !loginBusy &&
      !contextRequest.current && !recovery && viewReady && !disconnectMode.current,
    // A failed optional source invalidates the cached session observation. Each
    // independent job must still be allowed to obtain its own fresh profile
    // proof; InformationRun verifies the saved scope before and after reading.
    canStartMedical: () => !activityRequest.current?.active() && product && mounted.current && owner.current===activeOwner.current && foreground.current &&
      !!scope.current && scope.current.owner===owner.current && !busyRef.current && !savingRef.current && !loginBusy && !loginStorageBusy.current && !loginAttempt.current &&
      !contextRequest.current && !recovery && viewReady && !disconnectMode.current && !clearingStore.current && !bindingBusy.current &&
      retrieval.current.state.phase==='idle',
    canReload: () => product && mounted.current && foreground.current && owner.current === activeOwner.current &&
      !clearingStore.current && !bindingBusy.current,
    currentUrl: () => currentUrl.current, epoch: () => epoch.current, uuid: Crypto.randomUUID,
    setBusy, setVisible, navigate, loadPage: loadedPage, inject: script => web.current?.injectJavaScript(script),
    requestNativeReload: url => { if (pendingNavigation.current?.url === url) pendingNavigation.current.nativeReload = true; },
  });
  useEffect(() => { let active = true; mounted.current = true; if (!product) void latestCapture().then(s => { if (active) setSnapshot(old => old ?? s); }).catch(() => { if (active && retrieval.current.state.phase === 'idle') setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; mounted.current = false; epoch.current++; if (timeout.current) clearTimeout(timeout.current); retrieval.current.dispose(); }; }, []);
  useEffect(() => { let active = true; const initialInformationRequest = information.beginInitialLoad(); void (async () => {
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
      await information.loadInitial(saved, initialInformationRequest, () => active);
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
  })().catch(() => { if(active) { information.initialLoadFailed(initialInformationRequest); setCaptureLoadState(state => state === 'ready' ? state : 'failed'); setViewReadFailed(true);setRecovery(true); setStatus('Original view recovery could not be opened. Exports are blocked to preserve preferences.'); } }); return () => { active = false; }; }, [localOwner]);
  useEffect(() => {
    if (!product || localOwner === owner.current) return;
    abortHttpRead();
    activityRequest.current?.abandon();
    clearDevelopmentCheckpoints();
    endGuidedFlightConnection();
    clearContextRequest(); afterConfirmation.current = null; pendingCapture.current = null; pendingNavigation.current = null;
    flightSourceAttempt.current = null; pendingFlightSource.current = null; clearCompletedFlightSource();
    session.current.disconnected(); session.current.invalidate(); syncConnection(); web.current?.stopLoading();
    // A write already dispatched remains durable, but its late completion must
    // never publish old-account data or restore preferences in a new owner UI.
    retrieval.current.dispose(); epoch.current++; setGeneration(epoch.current);
    legacyRequest.current = null; legacyAttempt.current = null; legacyFingerprint.current = null; setLegacyChoice(null);
    recoveryKnown.current = false; original.current = null; scope.current = null;
    information.ownerChanged();
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
      original.current = saved; recoveryKnown.current = true;setViewReadFailed(false); setRecovery(!!saved || unresolved); setViewReady(true);
    } catch { if (mounted.current) {setViewReadFailed(true);setRecovery(true);} }
  }
  function syncConnection() { const next=session.current.state;if(next.phase!=='checking'){contextTiming.current?.(next.phase==='observed');contextTiming.current=null;}setConnection(next);setFlow(previous=>connectionFlow(previous,{type:'proof',state:next})); }
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
  function contextFailed(loginRequired = false, reason: 'context-response' | 'navigation-unobserved' | 'unexpected-document' | 'timeout' | 'page-error' | 'http-error' = 'context-response') {
    const request = contextRequest.current;
    recordProviderEvent(`provider-verification-${reason}`);
    // Fixed technical categories only; never log URLs, profile fields or errors.
    console.info('MOFLIGHT_PROVIDER_VERIFICATION ' + JSON.stringify({ reason, loginRequired,
      document: currentUrl.current === PROFILE_URL ? 'profile' : loginPage(currentUrl.current) ? 'login' : flightUrl(currentUrl.current) ? 'flight-list' : providerUrl(currentUrl.current) ? 'other-provider' : 'other',
      navigationObserved: request?.navigationObserved ?? false }));
    endDisconnect('failed'); afterConfirmation.current = null;
    if (request) {
      // The browser reservation can outlive observe() while local preparation
      // finishes. Publish its failure even though observe released session ownership.
      if(!session.current.owns(request.nonce))session.current.start(request.nonce);
      session.current.fail(request.nonce, loginRequired ? 'login-required' : 'error');
    }
    else session.current.invalidate();
    clearContextRequest(); pendingCapture.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null; syncConnection();
    if (loginRequired) { signInDocument.current = currentUrl.current; setVisible(request?.action!=='status'); if(request?.action!=='status')continueGuidedLogin(); }
    const active = retrieval.current.state;
    if (active.phase === 'loading') stop('Provider context unavailable. Earlier captures and recovery journal retained.', active.nonce);
  }
  function checkConnection(action: 'status' | 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect' | 'legacy' = 'check') {
    if (activityRequest.current?.active() || owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current || loginBusy || loginStorageBusy.current || loginAttempt.current || disconnectMode.current !== (action === 'disconnect') || contextRequest.current || !viewReady || saving || busy && action !== 'capture' && action !== 'restored') return false;
    // An already observed, loaded profile needs a real new native request.
    // Android may not produce fresh document callbacks for same-URL JS assign.
    const reloadObservedProfile=product&&browserActive&&loaded&&currentUrl.current===PROFILE_URL&&session.current.state.phase==='observed';
    const nonce = Crypto.randomUUID();
    if (!session.current.start(nonce)) return false;
    recordProviderEvent('provider-check');
    contextTiming.current?.(false);contextTiming.current=startFlightSpan('session-verification');
    setLoginNotice('none');
    contextRequest.current = { nonce, action, navigationObserved: false }; syncConnection();
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    contextTimer.current = setTimeout(() => contextFailed(false, 'timeout'), 25_000);
    navigate(PROFILE_URL);
    if(reloadObservedProfile&&pendingNavigation.current?.url===PROFILE_URL)pendingNavigation.current.nativeReload=true;
    return true;
  }
  function checkActivity(beforeStart?: () => Promise<void>) {
    const bound = scope.current, ownedEpoch = epoch.current;
    const current = () => !!bound && scope.current === bound && epoch.current === ownedEpoch && product && mounted.current &&
      owner.current === activeOwner.current && bound.owner === owner.current && foreground.current && recoveryKnown.current &&
      viewReady && browserActive && loaded && currentUrl.current === PROFILE_URL && !pendingNavigation.current &&
      !visible && !guidedFlightLogin.current && !guidedLoginResume.current && !recovery && !original.current && !restoring.current &&
      !information.active() && !editingLogin && !clearingStore.current && !bindingBusy.current && !contextRequest.current &&
      !busyRef.current && !savingRef.current && !loginBusy && !loginStorageBusy.current && !loginAttempt.current && !disconnectMode.current &&
      retrieval.current.state.phase === 'idle' && session.current.state.phase === 'observed' && session.current.state.confirmed &&
      !!session.current.state.observed && sameContext(session.current.state.observed!, bound.context) &&
      Date.now() >= Date.parse(session.current.state.lastCheckedAt ?? '') && Date.now() - Date.parse(session.current.state.lastCheckedAt ?? '') < 90_000;
    if (!bound || !current()) return Promise.resolve(null);
    return activityRequest.current!.start(bound.context, { current, beforeStart, terminate: () => {
      if (epoch.current !== ownedEpoch) return;
      try { web.current?.stopLoading(); } finally { epoch.current++; setGeneration(epoch.current); setLoaded(false);
        session.current.invalidate(); syncConnection(); }
    } });
  }
  function checkSession() {
    if(activityRequest.current?.active()||!product||!mounted.current||!scope.current||!recoveryKnown.current||visible||guidedFlightLogin.current||guidedLoginResume.current||
      recovery||original.current||restoring.current||information.active()||editingLogin||retrieval.current.state.phase!=='idle')return false;
    return checkConnection('status');
  }
  function connect() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current || disconnectMode.current || retrieval.current.state.phase !== 'idle' || loginBusy || loginStorageBusy.current || loginAttempt.current || busy || contextRequest.current || saving) return;
    recordProviderEvent('provider-connect');
    afterConfirmation.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null; setLoginNotice('none');
    session.current.invalidate(); syncConnection(); setVisible(true); setResult('none');
    stopDiagnosticLogin(false);loginPageTiming.current=startFlightSpan('login-page');
    navigate(LOGIN_URL);
  }
  // First use follows the same visible login route as Connect. A saved
  // association uses the protected profile to check retained cookies first.
  function beginGuidedFlightConnection() {
    // Explicit interaction takes priority over a quiet status request.
    if(contextRequest.current?.action==='status'){
      clearContextRequest();pendingNavigation.current=null;web.current?.stopLoading();epoch.current++;setGeneration(epoch.current);
      session.current.invalidate();syncConnection();
    }
    if (!product || !viewReady || !foreground.current || contextRequest.current || busy || saving || recovery&&!freshFlightAttempt.current || bindingBusy.current || clearingStore.current || disconnectMode.current) return;
    guidedLoginResume.current = null; guidedFlightLogin.current = true;
    clearCompletedFlightSource(); setResult('none');
    if (scope.current&&session.current.state.phase!=='login-required') checkConnection();
    else connect();
  }
  function beginFreshFlightConnection() {
    if(!product||!recoveryKnown.current||!viewReady||!foreground.current||busy||saving||bindingBusy.current||clearingStore.current||disconnectMode.current)return false;
    freshFlightAttempt.current=true;
    recordProviderEvent('provider-fresh-attempt');
    beginGuidedFlightConnection();return true;
  }
  function endGuidedFlightConnection() { freshFlightAttempt.current=false; guidedFlightLogin.current = false; guidedLoginResume.current = null; loginObservation.current = null; }
  function continueGuidedLogin() {
    if (!guidedFlightLogin.current || !product || !foreground.current || owner.current !== activeOwner.current ||
        contextRequest.current || busy || saving || recovery&&!freshFlightAttempt.current || bindingBusy.current || clearingStore.current ||
        disconnectMode.current || retrieval.current.state.phase !== 'idle' || !providerUrl(currentUrl.current)) return;
    setVisible(true);
    // Returning from a credential Activity is never itself a reason to navigate.
    if (!phase.current.loaded || loginObservation.current?.url === currentUrl.current) return;
    const observation = { nonce: Crypto.randomUUID(), url: currentUrl.current, epoch: epoch.current };
    loginObservation.current = observation;
    web.current?.injectJavaScript(loginDocumentScript(observation.nonce));
  }
  function receiveLoginDocument(event: WebViewMessageEvent): boolean {
    const observation = loginObservation.current;
    if (!observation || event.nativeEvent.data.length > 2000) return false;
    try {
      const message = JSON.parse(event.nativeEvent.data);
      if (message.kind !== 'vf-login-document-v1') return false;
      if (!guidedFlightLogin.current || !foreground.current || !mounted.current || owner.current !== activeOwner.current ||
          observation.epoch !== epoch.current || message.nonce !== observation.nonce || message.url !== observation.url ||
          currentUrl.current !== observation.url || !phase.current.loaded || failedDocument.current === observation.url ||
          !scopedBridge(event.nativeEvent.url, currentUrl.current, observation.url) || typeof message.loginForm !== 'boolean') return true;
      if (message.loginForm) { signInDocument.current = observation.url; setVisible(true); }
      else { loginObservation.current=null; signInDocument.current=null; recordProviderEvent('provider-resume-check'); checkConnection(); }
      return true;
    } catch { return false; }
  }
  function resumeGuidedFlightConnection(): boolean {
    if(guidedFlightLogin.current)return true;
    const paused = guidedLoginResume.current;
    if (!paused || paused.owner !== owner.current || owner.current !== activeOwner.current || !product || !viewReady || !foreground.current ||
        contextRequest.current || busy || saving || recovery&&!freshFlightAttempt.current || bindingBusy.current || clearingStore.current || disconnectMode.current ||
        retrieval.current.state.phase !== 'idle') return false;
    guidedLoginResume.current = null; guidedFlightLogin.current = true;
    clearCompletedFlightSource(); setResult('none');
    // Keep the original login form and Android Autofill values in the same
    // native WebView. A later authenticated navigation still needs fresh proof.
    // Autofill can submit before Android reports the activity as active. Do not
    // replace an unfinished authentication POST/redirect with a profile GET.
    if (paused.retainedLoginDocument) { recordProviderEvent('provider-resume-wait'); continueGuidedLogin(); }
    else { recordProviderEvent('provider-resume-check'); checkConnection(); }
    return true;
  }
  function suspendBrowserForOwnerSwitch(): boolean {
    const retrievalActive = retrieval.current.state.phase !== 'idle' || busy || saving || restoring.current;
    const informationActive = information.active();
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
    information.navigationStarted(); session.current.invalidate(); syncConnection(); web.current.goBack(); return true;
  }
  function dismissLogin() {
    // A held development run must end through the normal guarded interruption
    // path; merely hiding its marker would leave an unresumable operation.
    const held = developmentCheckpointRef.current?.endsWith('-paused');
    clearDevelopmentCheckpoints();
    if (held) { stop('Development checkpoint dismissed. Original view recovery retained.'); }
    stopDiagnosticLogin(false);
    endGuidedFlightConnection();
    if (!information.dismiss()) return;
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
    syncConnection();setFlow(previous=>connectionFlow(previous,{type:'cancel'}));
  }
  async function rememberHistoricalProfile(observed: ObservedContext, at: string, started: number) {
    if (!product) return;
    const savedOwner = owner.current;
    const gate = async () => {
      const current = session.current.state;
      if (!savedOwner || !mounted.current || !foreground.current || clearingStore.current ||
          owner.current !== savedOwner || activeOwner.current !== savedOwner || epoch.current !== started ||
          current.phase !== 'observed' || !current.confirmed || current.lastCheckedAt !== at ||
          !current.observed || !sameContext(current.observed, observed) || scope.current?.owner !== savedOwner ||
          !sameContext(scope.current.context, observed)) throw new Error('Historical profile observation superseded');
    };
    try {
      await gate(); await rememberAuthenticatedProfileNative(savedOwner!, observed, at, gate);
    } catch {
      // AI attribution failure must not destroy a valid provider association.
      // AI admission later reads only a persisted receipt, never this UI state.
      recordProviderEvent('provider-historical-identity-save-failed');
      if (mounted.current && owner.current === savedOwner && epoch.current === started) {
        setStatus('Historical AI account evidence could not be saved. Provider data is preserved.');
      }
    }
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
      await rememberHistoricalProfile(observed, session.current.state.lastCheckedAt!, started);
      if (!mounted.current || owner.current !== activeOwner.current || started !== epoch.current || !foreground.current) return;
      bindingBusy.current = false; setBinding(false);
      const next = afterConfirmation.current; afterConfirmation.current = null;
      if (next === 'retrieve') retrieve();
      if (next === 'recover') recoverView();
    } catch { afterConfirmation.current = null; session.current.invalidate(); syncConnection(); setStatus('Provider association could not be saved. Capture remains blocked.'); }
    finally { bindingBusy.current = false; if (mounted.current) setBinding(false); }
  }
  async function receiveContext(event: WebViewMessageEvent) {
    const request = contextRequest.current;
    const requestEpoch = epoch.current;
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
      // Matching proof can render before local fresh-attempt preparation ends.
      // Retain the request's browser admission until that preparation completes.
      if(contextTimer.current)clearTimeout(contextTimer.current);contextTimer.current=null;
      syncConnection();
      if (!accepted) {
        clearContextRequest();
        endGuidedFlightConnection();
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
      if (acceptedContext && session.current.state.confirmed) {
        await rememberHistoricalProfile(acceptedContext, session.current.state.lastCheckedAt!, requestEpoch);
        if (contextRequest.current !== request || epoch.current !== requestEpoch) return;
      }
      setVisible(false);
      if (guidedFlightLogin.current && request.action === 'check') {
        // observe() already fences a different persisted account or club.
        if (!session.current.state.confirmed) await confirmConnection();
        if(freshFlightAttempt.current){
          const started=epoch.current,bound=requireScope();
          if(!foreground.current||!session.current.state.confirmed)throw new Error('Fresh context unavailable.');
          if(original.current?.rowsPerPage!==undefined){
            // Preserve the pre-export global preference across an interrupted
            // attempt; the existing explicit recovery path verifies restoration.
            guidedFlightLogin.current=false;freshFlightAttempt.current=false;
            clearContextRequest();syncConnection();setRecovery(true);setResult('failed');
            setStatus('Original provider page size needs restoration. Use Restore original view, then retry retrieval.');return;
          }
          // Archive old scoped evidence locally; do not replay preferences into the provider.
          const finishPreparation=startFlightSpan('provider-view-supersede');
          try{await supersedeScopedView(bound,original.current);finishPreparation(true);}
          catch(error){finishPreparation(false);throw error;}
          if(!mounted.current||!foreground.current||epoch.current!==started||scope.current!==bound||!session.current.state.confirmed)throw new Error('Fresh attempt superseded.');
          original.current=null;legacyPending.current=false;setRecovery(false);
          recordProviderEvent('provider-previous-view-retained');
        }
        guidedFlightLogin.current = false;
      }
      if(contextRequest.current!==request||epoch.current!==requestEpoch)return;
      clearContextRequest();syncConnection();
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
    } catch {
      // A cancelled/superseded async preparation must not fail a newer request.
      if(contextRequest.current===request)contextFailed();
      else recordProviderEvent('provider-verification-superseded');
    }
  }
  useEffect(() => {
    if (!product) return;
    const listener = AppState.addEventListener('change', state => {
      foreground.current = state === 'active';
      if (state === 'active') { if(guidedLoginResume.current)resumeConnection.current(); return; }
      clearDevelopmentCheckpoints();
      // Credential pickers/authentication activities background Android. Leave
      // the passive sign-in document AND any automatic submission/redirect alone.
      // Verification/retrieval and app-owned secret attempts still invalidate.
      const retainLoginDocument = owner.current === activeOwner.current &&
        (guidedFlightLogin.current || guidedLoginResume.current?.retainedLoginDocument === true) &&
        providerUrl(currentUrl.current) && !contextRequest.current && !pendingNavigation.current &&
        retrieval.current.state.phase === 'idle' && !bindingBusy.current && !clearingStore.current &&
        !loginAttempt.current && !loginStorageBusy.current && !disconnectMode.current && !information.active();
      if (guidedFlightLogin.current && owner.current === activeOwner.current && retrieval.current.state.phase === 'idle' && !bindingBusy.current && !information.active()) {
        guidedLoginResume.current = { owner: owner.current, retainedLoginDocument: retainLoginDocument };
      }
      stopDiagnosticLogin(false);
      loginObservation.current = null;
      guidedFlightLogin.current = false;
      information.backgrounded();
      clearContextRequest(); pendingNavigation.current = null; pendingCapture.current = null; afterConfirmation.current = null; endDisconnect(); session.current.invalidate(); syncConnection();
      flightSourceAttempt.current = null; pendingFlightSource.current = null;
      if (web.current) recordProviderEvent(retainLoginDocument ? 'provider-keep-background' : 'provider-stop-background');
      if (!retainLoginDocument) { web.current?.stopLoading(); epoch.current++; setGeneration(epoch.current); activityRequest.current?.abandon(); }
      if (loginAttempt.current) endLogin('App left the foreground. Sign-in stopped; retry explicitly.', 'cancelled');
      if (retrieval.current.state.phase === 'loading') finish('App left the foreground. Recovery may be required.');
    });
    return () => { listener.remove(); clearContextRequest(); session.current.cancel(); };
  }, [product]);
  async function loadedPage(page: string) {
    if (product && page !== currentUrl.current) return;
    if(failedDocument.current===page){if(information.running())information.pageLoaded(page);return;}
    recordProviderDocument('end', page);
    if(loginPage(page)){loginPageTiming.current?.(true);loginPageTiming.current=null;if(!userWaitTiming.current)userWaitTiming.current=startFlightSpan('user-sign-in-wait');}else{userWaitTiming.current?.(true);userWaitTiming.current=null;}
    const pageEpoch = epoch.current;
    phase.current.loaded = true; currentUrl.current = page; setUrl(page); setLoaded(true);
    if (information.pageLoaded(page)) return;
    if (product && contextRequest.current) {
      if (!contextRequest.current.navigationObserved) { contextFailed(false, 'navigation-unobserved'); return; }
      if (page === PROFILE_URL) web.current?.injectJavaScript(contextScript(contextRequest.current.nonce));
      else if (loginPage(page)) web.current?.injectJavaScript(loginRequiredScript(contextRequest.current.nonce));
      else contextFailed(false, 'unexpected-document');
      return;
    }
    const loginLoad = login.pageLoaded(page, pageEpoch);
    if (loginLoad) { await loginLoad; continueGuidedLogin(); return; }
    if (guidedFlightLogin.current && product && foreground.current && providerUrl(page) &&
        !contextRequest.current && retrieval.current.state.phase === 'idle') {
      continueGuidedLogin(); return;
    }
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
    abortHttpRead(); httpFallback.current = false;
    clearDevelopmentCheckpoints();
    bridgeTiming.current?.(false);bridgeTiming.current=null;
    if (!nonce && state.phase === 'loading') retrieval.current.finish(state.nonce);
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    pendingNavigation.current = null;
    flightSourceAttempt.current = null;
    if (legacyAttempt.current) { original.current = null; legacyAttempt.current = null; }
    run.current = null; command.current = ''; reading.current = false; viewPhase.current = null; restoring.current = false;
    restorationOnly.current = false;
    testPaused.current = false; setPaused(null);
    epoch.current++; setGeneration(epoch.current); if (!product) setBrowserActive(false); setLoaded(false); setVisible(false);
    if (mounted.current) { setBusy(false); setSaving(false); setStatus(message); if (product) setResult(captureSaved.current ? 'captured' : cancelled.current ? 'cancelled' : 'failed'); }
  }
  function startRestoration(message: string, nonce: string, developmentPause = false) {
    if (!original.current || !retrieval.current.owns(nonce)) return;
    if (retrieval.current.state.phase === 'saving') retrieval.current.resume(nonce);
    outcome.current = message; restoring.current = true; restoreSteps.current = 0; viewPhase.current = 'restore';
    testPaused.current = false; setPaused(null);
    run.current = null; reading.current = false; command.current = ''; setSaving(false); setBusy(true); if (!product) setVisible(true);
    web.current?.stopLoading();
    if (developmentPause) {
      testPaused.current = true; setPaused(nonce); checkpoint('recovery-paused');
      if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
      setStatus('Development checkpoint: matching recovery admitted before replay.');
      return;
    }
    armTimeout(nonce); navigate(FLIGHT_URL);
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
    restorationOnly.current = true;
    const developmentPause = developmentAllowed.current && developmentCheckpointRef.current === 'recovery-armed';
    startRestoration('Earlier export recovery.', nonce, developmentPause);
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
    timeout.current = setTimeout(() => {
      if (httpRead.current?.nonce === nonce) {
        session.current.invalidate(); syncConnection();
        stop('HTTP flight read timed out. Saved data and original-view recovery retained; verify the account before retrying.', nonce);
      } else finish('Export step timed out. Previous captures preserved; retry after checking provider login.', nonce);
    }, 30_000);
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
    const attempt = flightSourceAttempt.current;
    if (product && Platform?.OS === 'android' && (HTTP_FLIGHT_READ_ENABLED || developmentAllowed.current) && !httpFallback.current && active.phase === 'read' && attempt) {
      const target = httpNext.current ?? new URL(FLIGHT_URL).pathname;
      const absolute = new URL(target, currentUrl.current).href;
      httpRead.current = { token: command.current, anchor: currentUrl.current, target: absolute, expected: attempt.contextBefore,
        owner: attempt.owner, nonce: state.nonce, epoch: epoch.current };
      web.current?.injectJavaScript(exportHttpScript(command.current, active, attempt.contextBefore, currentUrl.current, absolute)); return;
    }
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
    abortHttpRead();
    recordProviderDocument('command', uri);
    information.navigationStarted();
    signInDocument.current = null; loginObservation.current = null;
    phase.current.loaded = false; setLoaded(false); currentUrl.current = uri; setUrl(uri); epoch.current++; setGeneration(epoch.current);
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
    if (developmentCheckpointRef.current?.endsWith('-paused')) return;
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
    httpFallback.current = false; httpNext.current = null;
    flightSourceAttempt.current = product && contextBefore ? {
      owner: owner.current!, contextBefore,
      requestedWindow: { from: prepared.request.from, to: prepared.request.to, participation: 'Pilot oder Fluglehrer' },
    } : null;
    pendingFlightSource.current = null;
    if (product) clearCompletedFlightSource();
    setViewStrategy(null);
    setFlightProgress({done:0,total:null});
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
          const developmentPause = developmentAllowed.current && developmentCheckpointRef.current === 'journal-armed';
          if (preBackupPauseEnabled.current || developmentPause) {
            reading.current = false; command.current = '';
            testPaused.current = true; setPaused(nonce);
            if (developmentPause) checkpoint('journal-paused');
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
      setFlightProgress(exportProgress(run.current));
      reading.current = false; command.current = '';
      if (completedPhase === 'reset' && run.current.phase === 'columns' && testPauseEnabled.current) {
        testPaused.current = true; setPaused(nonce);
        if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
        setStatus('Test checkpoint: export reset verified; original view recovery is pending. Continue or cancel, or force-stop to test recovery.');
        return;
      }
      if (result.nextUrl) {
        armTimeout(nonce);
        if (product && Platform?.OS === 'android' && (HTTP_FLIGHT_READ_ENABLED || developmentAllowed.current) && !httpFallback.current) { httpNext.current = result.nextUrl; extract(); }
        else navigate(result.nextUrl);
        return;
      }
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
  function receiveHttpExport(event: WebViewMessageEvent): boolean {
    let kind: unknown;
    try { if (event.nativeEvent.data.length > 2100000) return false; kind = JSON.parse(event.nativeEvent.data)?.kind; } catch { return false; }
    if (kind !== 'vf-export-http-v1') return false;
    const pending = httpRead.current;
    if (!pending || !mounted.current || !foreground.current || pending.owner !== owner.current || owner.current !== activeOwner.current ||
      pending.epoch !== epoch.current || pending.token !== command.current || !retrieval.current.owns(pending.nonce) || !reading.current) return true;
    const reply = decodeHttpExportReply(event.nativeEvent.data, event.nativeEvent.url, currentUrl.current, pending);
    if (!reply) return true;
    httpRead.current = null;
    if (reply.kind === 'page') {
      recordProviderEvent('provider-flight-http-page');
      console.info('MOFLIGHT_FLIGHT_HTTP', JSON.stringify({ outcome: 'page', page: (run.current?.pages.length ?? 0) + 1, milliseconds: reply.milliseconds }));
      void receive({ ...event, nativeEvent: { ...event.nativeEvent, data: reply.payload } }); return true;
    }
    if (reply.kind === 'fallback') {
      recordProviderEvent('provider-flight-http-fallback');
      console.info('MOFLIGHT_FLIGHT_HTTP', JSON.stringify({ outcome: 'fallback', milliseconds: reply.milliseconds }));
      bridgeTiming.current?.(false); bridgeTiming.current = null;
      httpFallback.current = true; reading.current = false; command.current = '';
      navigate(pending.target); return true;
    }
    recordProviderEvent('provider-flight-http-rejected');
    console.info('MOFLIGHT_FLIGHT_HTTP', JSON.stringify({ outcome: 'rejected', reason: reply.reason, ...(reply.milliseconds === undefined ? {} : { milliseconds: reply.milliseconds }) }));
    session.current.invalidate(); syncConnection();
    pendingCapture.current = null; flightSourceAttempt.current = null; pendingFlightSource.current = null;
    stop('HTTP flight read could not confirm the provider context. Saved data and original-view recovery retained; use Sync to verify the account before retrying.', pending.nonce);
    return true;
  }
  async function completeRestoration() {
    const active = retrieval.current.state;
    if (active.phase !== 'loading' || !original.current || !retrieval.current.beginSave(active.nonce)) return;
    setSaving(true); if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    const reviewedRecovery = !!legacyAttempt.current;
    const recovered = reviewedRecovery || restorationOnly.current;
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
      if (recovered) setResult('recovered');
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
      if(freshFlightAttempt.current&&sourceInput&&foreground.current&&owner.current===activeOwner.current){
        completedFlightSourceRef.current=sourceInput;setCompletedFlightSource(sourceInput);
        recordProviderEvent('provider-capture-before-cleanup');
      }
      setSnapshot(data); setCaptureLoadState('ready'); captureSaved.current = true;
      if (product) setLastSuccessfulCaptureAt(data.retrievedAt);
      finish(`Saved ${data.rows.length} flights across ${data.exportContext?.pageCount} pages for the requested period. Account identity and time basis remain unverified.`, nonce);
    } catch { finish('Local saving failed. Earlier captures retained.', nonce); }
  }

  // Android may report synthetic history/error-document callbacks after failure.
  // Preserve its exact-profile evidence until an explicit navigation/request;
  // callbacks alone cannot authorize reload, which still requires PROFILE_URL.
  const browser = browserActive && <WebView key={product ? `retained-provider-${documentId}` : generation} ref={web} source={source} originWhitelist={['*']}
        injectedJavaScript={loginDiagnosticScript(generation)}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { if (generation !== epoch.current) return false; const allowed = providerUrl(request.url); if (allowed && request.isTopFrame !== false && request.url !== PROFILE_URL) information.navigationStarted(); if (product && contextRequest.current && request.isTopFrame !== false && request.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => { if (generation === epoch.current) finish('New browser window blocked in this bounded PoC.'); }}
        onLoadStart={event => { if (generation !== epoch.current) return; signInDocument.current=null; loginObservation.current=null; failedDocument.current=null; diagnosticMessages.current = 0; recordProviderDocument('start', event.nativeEvent.url); phase.current.loaded = false; information.loadStarted(event.nativeEvent.url); if (product && contextRequest.current && event.nativeEvent.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (retrieval.current.state.phase === 'loading') {
          // Native load-start can beat the bridge acknowledgement. Advance only
          // a still-owned, outstanding save/load command; acknowledged commands
          // already cleared their token and must not advance a second time.
          if (reading.current && command.current && original.current && !original.current.reset) {
            if (viewPhase.current === 'backup') viewPhase.current = 'backup-load';
            else if (viewPhase.current === 'backup-load') viewPhase.current = 'backup-verify';
          }
          reading.current = false; command.current = '';
        } currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(false); }}
        onNavigationStateChange={state => { if (generation !== epoch.current) return; currentUrl.current = state.url; setUrl(state.url); setCanGoBack(state.canGoBack);
          if(state.loading===false&&guidedFlightLogin.current&&!contextRequest.current)void loadedPage(state.url);
        }}
        onLoadProgress={event => { if (generation === epoch.current) phase.current.progress = event.nativeEvent.progress; }}
        onLoadEnd={event => { if (generation === epoch.current) void loadedPage(event.nativeEvent.url); }}
        onMessage={event => {
          if (generation !== epoch.current) return;
          const observation = readLoginDiagnostic(event.nativeEvent.url, currentUrl.current, event.nativeEvent.data, generation);
          if (observation) { if (diagnosticMessages.current++ < 32) recordProviderEvent(observation); return; }
          if (activityRequest.current?.receive(event.nativeEvent.url, currentUrl.current, event.nativeEvent.data)) return;
          if (receiveHttpExport(event)) return;
          if (receiveLoginDocument(event)) return;
          if (information.running()) { void information.receiveInformation(event); return; }
          if (product && contextRequest.current) { void receiveContext(event); return; }
          if (login.receiveMessage(event.nativeEvent)) return;
          if(flightUrl(url))void receive(event);
        }}
        onError={event => { if (generation !== epoch.current) return;failedDocument.current=event?.nativeEvent.url??currentUrl.current;stopDiagnosticLogin(false); if (information.pageFailed(event?.nativeEvent.url, true)) return; setFlow(previous=>connectionFlow(previous,{type:'page-error'})); if (product && contextRequest.current) { contextFailed(false, 'page-error'); return; } if (product) { endGuidedFlightConnection(); endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login page failed to load. Saved login and captures preserved.') : finish('Provider page failed to load. Previous captures preserved.'); }}
        onHttpError={event => { if (generation !== epoch.current || event?.nativeEvent?.url&&event.nativeEvent.url!==currentUrl.current) return;failedDocument.current=event?.nativeEvent?.url??currentUrl.current;stopDiagnosticLogin(false); if (information.pageFailed()) return; setFlow(previous=>connectionFlow(previous,{type:'page-error'})); if (product && contextRequest.current) { contextFailed(false, 'http-error'); return; } if (product) { endGuidedFlightConnection(); endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login returned an HTTP error. Saved login and captures preserved.') : finish('Provider returned an HTTP error. Previous captures preserved.'); }}
        onContentProcessDidTerminate={() => { if (generation !== epoch.current) return; if (information.pageFailed()) return; if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
        onRenderProcessGone={() => { if (generation !== epoch.current) return; if (information.pageFailed()) return; if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
      />;
  return { flightProgress: product && owner.current === localOwner && busy && run.current ? flightProgress : null, ...information.public, retrieveFeatureInformation: async (category:FeatureInformationCategory) => {
    try { return await information.public.retrieveFeatureInformation(category); }
    catch(error) { session.current.invalidate(); syncConnection(); throw error; }
  }, retrieveDutyPage: async (source:'own'|'club') => {
    try { return await information.public.retrieveDutyPage(source); }
    catch(error) { session.current.invalidate(); syncConnection(); throw error; }
  }, retrieveMedical: async () => {
    try { return await information.public.retrieveMedical(); }
    catch(error) { session.current.invalidate(); syncConnection(); throw error; }
  }, checkActivity, cancelActivity: () => activityRequest.current!.cancel(), activityChecking, activityScope: scope.current, checkSession, developmentCheckpoint, armDevelopmentJournalCheckpoint: () => armDevelopmentCheckpoint('journal'), armDevelopmentRecoveryCheckpoint: () => armDevelopmentCheckpoint('recovery'), viewReadFailed,beginFreshFlightConnection, beginGuidedFlightConnection, resumeGuidedFlightConnection, endGuidedFlightConnection, captureLoadState, canGoBack, backWithinProvider, legacyChoice, requestLegacyRecovery, legacyRecoveryAvailable, clearing, clearNotice, proofNotice, clearLocalSession, sessionClearingAvailable, sessionProofAvailable, binding, legacyRecovery: legacyPending.current, loginNotice, disconnectNotice, credentialNotice, startDisconnect, checkDisconnection, disconnecting, disconnectedAt, refreshRecovery, connection, checkConnection, connect, suspendBrowserForOwnerSwitch, dismissLogin, confirmConnection, lastSuccessfulCaptureAt, result, browser, showRun, setShowRun, showWindow, setShowWindow, viewReady, recovery, original, editingLogin, loginBusy, username, setUsername, password, setPassword, saveLogin, setEditingLogin, providerExpanded, visible, status, busy, openCaptureLab, pauseEnabled, toggleTestPause, preBackupPause, togglePreBackupPause, from, setFrom, to, setTo, saving, restoring, navigate, setVisible, cancelRetrieval, retrieve, hasLogin, useLogin, forgetLogin, recoverView, paused, continueTestRetrieval, viewStrategy, url, toggleProviderPage, browserActive, snapshot: product && owner.current !== localOwner ? null : snapshot, completedFlightSource: product && owner.current === localOwner && !busy && (!recovery||freshFlightAttempt.current) ? completedFlightSource : null, setProviderExpanded, flow, web, currentUrl, retrieval, loaded, source, generation, epoch };
}

import React, { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { bridgeSource, flightUrl, FLIGHT_URL, LOGIN_URL, providerUrl, type ProbeSnapshot } from './probe';
import { clearOriginalView, latestCapture, readOriginalView, saveCapture, saveOriginalView } from './storage';
import { loginPage, savedLoginScript } from './login';
import { readSavedLogin, writeSavedLogin, forgetSavedLogin } from './login-storage';
import { acceptExportMessage, beginExport, calendarYearRequest, exportScript, type ExportRun } from './export';
import { decodeView, VIEW_PHASES, viewScript, viewProtectionMessage, type ViewPhase, type ViewPreferences } from './view';
import { Retrieval } from './retrieval';
import { PROFILE_URL, contextScript, loginRequiredScript, scopedBridge } from './context';
import { ConnectionSession } from './connection-state';
import { loadProviderScope, confirmProviderScope, loadScopedCapture, loadScopedView, saveScopedCapture, saveScopedView, clearScopedView } from './scoped-storage';
import { clearProviderStore, proveSyntheticStore, sessionClearingAvailable, sessionProofAvailable } from './session-store';
import type { ProviderScope } from './scope-store';

export function useAccessController(product = false, localOwner?: string) {
  const activeOwner = useRef(localOwner); activeOwner.current = localOwner;
  const owner = useRef(localOwner), scope = useRef<ProviderScope | null>(null);
  const clearingStore = useRef(false), documentDetached = useRef<(() => void) | null>(null);
  const [clearing, setClearing] = useState(false), [clearNotice, setClearNotice] = useState<'none' | 'cleared' | 'failed'>('none');
  const [proofNotice, setProofNotice] = useState<'none' | 'passed' | 'failed'>('none');
  const [documentId, setDocumentId] = useState(0);
  const bindingBusy = useRef(false), legacyPending = useRef(false);
  const [binding, setBinding] = useState(false);
  const foreground = useRef(AppState.currentState === undefined || AppState.currentState === 'active');
  const session = useRef(new ConnectionSession());
  const [connection, setConnection] = useState(session.current.state);
  const contextRequest = useRef<{ nonce: string; action: 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect'; navigationObserved: boolean } | null>(null);
  const disconnectMode = useRef(false), recoveryKnown = useRef(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectedAt, setDisconnectedAt] = useState<string | null>(null);
  const [disconnectNotice, setDisconnectNotice] = useState<'none' | 'verified' | 'failed' | 'cancelled'>('none');
  const contextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCapture = useRef<ProbeSnapshot | null>(null);
  const afterConfirmation = useRef<'retrieve' | 'recover' | null>(null);
  const [lastSuccessfulCaptureAt, setLastSuccessfulCaptureAt] = useState<string | null>(null);
  const [result, setResult] = useState<'none' | 'captured' | 'cancelled' | 'failed'>('none');
  const captureSaved = useRef(false), cancelled = useRef(false);
  const [showRun, setShowRun] = useState(false);
  const [showWindow, setShowWindow] = useState(false);
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL);
  const pendingNavigation = useRef<string | null>(null);
  const retrieval = useRef(new Retrieval()), epoch = useRef(0), mounted = useRef(true);
  const run = useRef<ExportRun | null>(null), command = useRef(''), reading = useRef(false);
  const original = useRef<ViewPreferences | null>(null), viewPhase = useRef<ViewPhase | null>(null), restoring = useRef(false), restoreSteps = useRef(0), outcome = useRef('');
  const [recovery, setRecovery] = useState(false), [viewReady, setViewReady] = useState(false);
  const [viewStrategy, setViewStrategy] = useState<'reset' | 'reserved backup' | null>(null);
  const [from, setFrom] = useState(calendarYearRequest().from), [to, setTo] = useState(calendarYearRequest().to);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const loginAttempt = useRef<'waiting' | 'reading' | 'submitted' | null>(null);
  const loginNonce = useRef('');
  const loginStorageBusy = useRef(false);
  const [loginNotice, setLoginNotice] = useState<'none' | 'response' | 'unavailable' | 'failed' | 'cancelled'>('none');
  const [credentialNotice, setCredentialNotice] = useState<'none' | 'forgotten' | 'error'>('none');
  const loginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasLogin, setHasLogin] = useState(false), [editingLogin, setEditingLogin] = useState(false), [loginBusy, setLoginBusy] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [browserActive, setBrowserActive] = useState(!product);
  const [providerExpanded, setProviderExpanded] = useState(false);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const testPauseEnabled = useRef(false), testPaused = useRef(false);
  const preBackupPauseEnabled = useRef(false);
  const [pauseEnabled, setPauseEnabled] = useState(false), [paused, setPaused] = useState<string | null>(null);
  const [preBackupPause, setPreBackupPause] = useState(false);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. Choose an inclusive period; configuration is verified before capture.');
  useEffect(() => { let active = true; mounted.current = true; if (!product) void latestCapture().then(s => { if (active) setSnapshot(old => old ?? s); }).catch(() => { if (active && retrieval.current.state.phase === 'idle') setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; mounted.current = false; epoch.current++; if (timeout.current) clearTimeout(timeout.current); retrieval.current.dispose(); }; }, []);
  useEffect(() => { let active = true; if (!product) void readSavedLogin().then(login => { if (active) setHasLogin(!!login); }).catch(() => { if (active) setStatus('Protected login storage could not be opened. Existing captures remain available.'); }); return () => { active = false; loginAttempt.current = null; if (loginTimer.current) clearTimeout(loginTimer.current); }; }, []);
  useEffect(() => { let active = true; void (async () => {
    if (product && owner.current !== activeOwner.current) throw new Error('Owner changed; create a new controller.');
    const legacy = await readOriginalView();
    let v = legacy;
    if (product) {
      if (!owner.current) throw new Error('Explicit local owner required.');
      const saved = await loadProviderScope(owner.current);
      if (!active) return;
      scope.current = saved;
      if (saved) session.current.restoreAssociation(saved.context);
      legacyPending.current = !!legacy;
      // Never infer ownership of the historical global journal or capture.
      v = saved ? await loadScopedView(saved) : null;
      if (saved) { const capture = await loadScopedCapture(saved); if (active) setSnapshot(capture); }
    }
    if (!active) return;
    original.current = v; recoveryKnown.current = true; setRecovery(!!v || legacyPending.current);
    setViewStrategy(v ? v.reset ? 'reset' : 'reserved backup' : null); setViewReady(true);
    if (v || legacyPending.current) setStatus('An earlier export left view restoration pending. Sign into the same provider account, then restore the original view before another export.');
  })().catch(() => { if(active) { setRecovery(true); setStatus('Original view recovery could not be opened. Exports are blocked to preserve preferences.'); } }); return () => { active = false; }; }, [localOwner]);
  useEffect(() => {
    if (!product || localOwner === owner.current) return;
    clearContextRequest(); afterConfirmation.current = null; pendingCapture.current = null; pendingNavigation.current = null;
    session.current.disconnected(); session.current.invalidate(); syncConnection(); web.current?.stopLoading();
    // A write already dispatched remains durable, but its late completion must
    // never publish old-account data or restore preferences in a new owner UI.
    retrieval.current.dispose(); epoch.current++; setGeneration(epoch.current);
    recoveryKnown.current = false; original.current = null; scope.current = null;
    setSnapshot(null); setLastSuccessfulCaptureAt(null); setBrowserActive(false); setVisible(false); setBusy(false); setRecovery(true); setViewReady(false);
    if (loginAttempt.current) endLogin('Local owner changed. Saved sign-in cancelled.', 'cancelled');
  }, [localOwner]);
  useEffect(() => { if (!browserActive && clearing) { documentDetached.current?.(); documentDetached.current = null; } }, [browserActive, clearing]);
  useEffect(() => () => { documentDetached.current?.(); documentDetached.current = null; }, []);
  function requireScope(): ProviderScope {
    if (!scope.current || scope.current.owner !== localOwner || owner.current !== activeOwner.current) throw new Error('Provider scope unavailable.');
    return scope.current;
  }
  function endLogin(message: string, verdict: 'response' | 'unavailable' | 'failed' | 'cancelled' = 'failed') { setLoginNotice(verdict); loginAttempt.current = null; if (loginTimer.current) clearTimeout(loginTimer.current); loginTimer.current = null; setLoginBusy(false); setStatus(message); }
  async function refreshRecovery() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !product || retrieval.current.state.phase !== 'idle' || contextRequest.current) return;
    recoveryKnown.current = false; setViewReady(false);
    try {
      const legacy = await readOriginalView();
      const saved = scope.current ? await loadScopedView(scope.current) : null;
      if (!mounted.current || owner.current !== activeOwner.current) return;
      legacyPending.current = !!legacy;
      original.current = saved; recoveryKnown.current = true; setRecovery(!!saved || !!legacy); setViewReady(true);
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
    setBrowserActive(false); setVisible(false); setLoaded(false);
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
    clearContextRequest(); pendingCapture.current = null; syncConnection();
    if (loginRequired) setVisible(true);
    const active = retrieval.current.state;
    if (active.phase === 'loading') stop('Provider context unavailable. Earlier captures and recovery journal retained.', active.nonce);
  }
  function checkConnection(action: 'check' | 'retrieve' | 'capture' | 'recover' | 'restored' | 'disconnect' = 'check') {
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
    afterConfirmation.current = null; setLoginNotice('none');
    session.current.invalidate(); syncConnection(); setVisible(true); setResult('none');
    navigate(LOGIN_URL);
  }
  function dismissLogin() {
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
        pendingCapture.current = null;
        const active = retrieval.current.state;
        // Never restore preferences into an account which failed the context check.
        if (active.phase !== 'idle') stop('Provider context mismatch. Capture rejected; original view recovery retained.', active.nonce);
        return;
      }
      setVisible(false);
      if (request.action === 'capture') {
        const captured = pendingCapture.current; pendingCapture.current = null;
        if (!captured || !session.current.state.confirmed) { finish('Provider association not confirmed. Capture rejected.'); return; }
        await persistCompletedCapture(captured);
      } else if (request.action === 'restored') {
        await completeRestoration();
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
      clearContextRequest(); pendingNavigation.current = null; pendingCapture.current = null; afterConfirmation.current = null; endDisconnect(); session.current.invalidate(); syncConnection();
      web.current?.stopLoading(); epoch.current++; setGeneration(epoch.current);
      if (loginAttempt.current) endLogin('App left the foreground. Sign-in stopped; retry explicitly.', 'cancelled');
      if (retrieval.current.state.phase === 'loading') finish('App left the foreground. Recovery may be required.');
    });
    return () => { listener.remove(); clearContextRequest(); session.current.cancel(); };
  }, [product]);
  async function saveLogin() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || loginStorageBusy.current || loginBusy || loginAttempt.current || contextRequest.current || disconnectMode.current || retrieval.current.state.phase !== 'idle') return;
    loginStorageBusy.current = true; setCredentialNotice('none'); setLoginBusy(true);
    try { await writeSavedLogin({ username, password }); setUsername(''); setPassword(''); setEditingLogin(false); setHasLogin(true); setStatus('Login saved only on this device. Use saved login when the provider asks you to sign in.'); }
    catch { setStatus('Login could not be saved. Check the fields and try again.'); }
    finally { loginStorageBusy.current = false; setLoginBusy(false); }
  }
  async function forgetLogin() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || loginStorageBusy.current || loginBusy || loginAttempt.current || contextRequest.current || disconnectMode.current || retrieval.current.state.phase !== 'idle' || busy || saving) return;
    loginStorageBusy.current = true; setCredentialNotice('none'); setLoginBusy(true);
    try { await forgetSavedLogin(); setCredentialNotice('forgotten'); setHasLogin(false); setUsername(''); setPassword(''); setStatus('Saved username and password forgotten. Existing browser session and captured flights are preserved.'); }
    catch { setCredentialNotice('error'); setStatus('Saved login could not be removed. Try again.'); }
    finally { loginStorageBusy.current = false; setLoginBusy(false); }
  }
  function useLogin() {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !foreground.current || disconnectMode.current || contextRequest.current || loginStorageBusy.current || retrieval.current.state.phase !== 'idle' || busy || loginBusy || loginAttempt.current) return;
    afterConfirmation.current = null; setLoginNotice('none');
    if (product) { session.current.invalidate(); syncConnection(); setResult('none'); }
    loginAttempt.current = 'waiting'; setLoginBusy(true); setVisible(true); setEditingLogin(false);
    loginNonce.current = Crypto.randomUUID();
    setStatus('Opening the original provider page for one saved-login attempt.');
    loginTimer.current = setTimeout(() => endLogin('Saved sign-in did not finish. Provider interaction may be required; no retry loop was started.'), 30_000);
    navigate(LOGIN_URL);
  }
  async function loadedPage(page: string) {
    if (product && page !== currentUrl.current) return;
    const pageEpoch = epoch.current;
    phase.current.loaded = true; currentUrl.current = page; setUrl(page); setLoaded(true);
    if (product && contextRequest.current) {
      if (!contextRequest.current.navigationObserved) { contextFailed(); return; }
      if (page === PROFILE_URL) web.current?.injectJavaScript(contextScript(contextRequest.current.nonce));
      else if (loginPage(page)) web.current?.injectJavaScript(loginRequiredScript(contextRequest.current.nonce));
      else contextFailed();
      return;
    }
    if (loginAttempt.current === 'waiting') {
      if (!loginPage(page)) { endLogin('Provider session page opened. Verify the account and retrieve flights.', 'response'); return; }
      // Duplicate native load-end events must not start a second secret read.
      loginAttempt.current = 'reading';
      try {
        const login = await readSavedLogin();
        if (!mounted.current || pageEpoch !== epoch.current) return;
        if (!login || !loginPage(currentUrl.current) || loginAttempt.current !== 'reading') { endLogin('Saved login unavailable or page changed. No credentials submitted.', 'unavailable'); return; }
        loginAttempt.current = 'submitted';
        web.current?.injectJavaScript(savedLoginScript(login,loginNonce.current));
        setStatus('Saved login attempted once on the original provider page. Complete verification there if requested.');
      } catch { if (mounted.current && pageEpoch === epoch.current) endLogin('Saved login could not be used. Existing captures preserved.'); }
      return;
    }
    if (loginAttempt.current === 'submitted') { endLogin('Provider response opened after the saved-login attempt. Verify the account, then retrieve flights; any provider verification remains on this page.', 'response'); return; }
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
    if (!nonce && state.phase === 'loading') retrieval.current.finish(state.nonce);
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    pendingNavigation.current = null;
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
  function openCaptureLab(kind: 'run' | 'window') {
    if (owner.current !== activeOwner.current || clearingStore.current || bindingBusy.current || !viewReady || recovery || original.current || busy || loginBusy || loginAttempt.current || retrieval.current.state.phase !== 'idle') return;
    if (kind === 'run') setShowRun(true); else setShowWindow(true);
  }
  function cancelRetrieval() {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || restoring.current) return;
    cancelled.current = true; clearContextRequest(); pendingCapture.current = null; session.current.cancel(); if (product) syncConnection();
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
      web.current?.injectJavaScript(viewScript(command.current, viewPhase.current, original.current)); return;
    }
    if (!active) return;
    if (++active.commands > 4100) { finish('Export navigation limit reached. Narrow the period; previous captures preserved.', state.nonce); return; }
    reading.current = true; command.current = Crypto.randomUUID(); phase.current.injections++;
    armTimeout(state.nonce);
    setStatus(`Verifying export: ${active.phase}; ${active.pages.length} pages read.`);
    web.current?.injectJavaScript(exportScript(command.current, active));
  }
  // Commit the page-scoped bridge before executing the explicit table reader.
  useEffect(() => { if ((product || visible) && loaded && busy && flightUrl(url)) extract(); }, [visible, loaded, busy, url]);
  useEffect(() => {
    const destination = pendingNavigation.current; pendingNavigation.current = null;
    // Commit this generation's native event handlers before initiating navigation.
    if (destination && product) web.current?.injectJavaScript(`window.location.assign(${JSON.stringify(destination)});true;`);
  }, [generation]);
  function navigate(uri: string) {
    if (!providerUrl(uri)) return;
    setLoaded(false); currentUrl.current = uri; setUrl(uri); epoch.current++; setGeneration(epoch.current);
    if (product && browserActive) {
      // Navigate the existing document; changing a key would discard the controller's browser.
      web.current?.stopLoading();
      pendingNavigation.current = uri;
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
    const nonce = Crypto.randomUUID();
    if (!retrieval.current.start(nonce)) return;
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
      if (viewPhase.current) {
        const stage = viewPhase.current;
        const captured = decodeView(event.nativeEvent.data, event.nativeEvent.url, currentUrl.current, command.current, stage, original.current);
        if (stage === 'snapshot') {
          if (!captured || !retrieval.current.beginSave(nonce)) return;
          setSaving(true); if(timeout.current) clearTimeout(timeout.current); timeout.current = null;
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
    try {
      await (product ? clearScopedView(requireScope(), original.current) : clearOriginalView(original.current));
      if (!mounted.current || !retrieval.current.owns(active.nonce)) return;
      original.current = null; setRecovery(false); restoring.current = false;
      stop(`${outcome.current} Original provider view restored and verified.`, active.nonce);
    } catch { finish('Original view journal could not be cleared. Recovery retained.', active.nonce); }
  }
  async function persistCompletedCapture(data: ProbeSnapshot) {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || !retrieval.current.beginSave(state.nonce)) return;
    const nonce = state.nonce;
    setSaving(true); setStatus('Saving validated capture locally…');
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    try {
      await (product ? saveScopedCapture(requireScope(), data) : saveCapture(data));
      if (!mounted.current || !retrieval.current.owns(nonce)) return;
      setSnapshot(data); captureSaved.current = true;
      if (product) setLastSuccessfulCaptureAt(data.retrievedAt);
      finish(`Saved ${data.rows.length} flights across ${data.exportContext?.pageCount} pages for the requested period. Account identity and time basis remain unverified.`, nonce);
    } catch { finish('Local saving failed. Earlier captures retained.', nonce); }
  }

  const browser = browserActive && <WebView key={product ? `retained-provider-${documentId}` : generation} ref={web} source={source} originWhitelist={['*']}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { if (generation !== epoch.current) return false; const allowed = providerUrl(request.url); if (product && contextRequest.current && request.isTopFrame !== false && request.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => { if (generation === epoch.current) finish('New browser window blocked in this bounded PoC.'); }}
        onLoadStart={event => { if (generation !== epoch.current) return; if (product && contextRequest.current && event.nativeEvent.url === PROFILE_URL) contextRequest.current.navigationObserved = true; if (retrieval.current.state.phase === 'loading') {
          // Native load-start can beat the bridge acknowledgement. Advance only
          // a still-owned, outstanding save/load command; acknowledged commands
          // already cleared their token and must not advance a second time.
          if (reading.current && command.current && original.current && !original.current.reset) {
            if (viewPhase.current === 'backup') viewPhase.current = 'backup-load';
            else if (viewPhase.current === 'backup-load') viewPhase.current = 'backup-verify';
          }
          reading.current = false; command.current = '';
        } currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(false); }}
        onNavigationStateChange={state => { if (generation !== epoch.current) return; currentUrl.current = state.url; setUrl(state.url); }}
        onLoadProgress={event => { if (generation === epoch.current) phase.current.progress = event.nativeEvent.progress; }}
        onLoadEnd={event => { if (generation === epoch.current) void loadedPage(event.nativeEvent.url); }}
        onMessage={event => {
          if (generation !== epoch.current) return;
          if (product && contextRequest.current) { void receiveContext(event); return; }
          if(loginAttempt.current==='submitted'&&loginPage(currentUrl.current)&&scopedBridge(event.nativeEvent.url,currentUrl.current,LOGIN_URL)&&event.nativeEvent.data.length<2000){
            try{const m=JSON.parse(event.nativeEvent.data);if(m.kind==='vf-login-result-v1'&&m.nonce===loginNonce.current&&m.url===LOGIN_URL){if(m.result==='submitted'){setStatus('Original provider submit control invoked once. Waiting for its response; sign-in is not yet verified.');return;}if(m.result==='provider-script-error'){endLogin('Saved sign-in stopped because the original provider form raised an error. Submission was not confirmed. Complete sign-in on the original page.');return;}if(['wrong-page','username-control','password-control','submit-control','form-binding','form-target'].includes(m.result)){endLogin(`Saved sign-in stopped: unsupported original ${m.result}. No credentials submitted. Use the original provider page.`);return;}}}catch{/* Ignore unrelated bridge messages. */}
          }
          if(flightUrl(url))void receive(event);
        }}
        onError={() => { if (generation !== epoch.current) return; if (product && contextRequest.current) { contextFailed(); return; } if (product) { endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login page failed to load. Saved login and captures preserved.') : finish('Provider page failed to load. Previous captures preserved.'); }}
        onHttpError={() => { if (generation !== epoch.current) return; if (product && contextRequest.current) { contextFailed(); return; } if (product) { endDisconnect('failed'); afterConfirmation.current = null; session.current.invalidate(); syncConnection(); } loginAttempt.current ? endLogin('Provider login returned an HTTP error. Saved login and captures preserved.') : finish('Provider returned an HTTP error. Previous captures preserved.'); }}
        onContentProcessDidTerminate={() => { if (generation !== epoch.current) return; if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
        onRenderProcessGone={() => { if (generation !== epoch.current) return; if (loginAttempt.current) endLogin('Provider renderer stopped. Saved sign-in cancelled.', 'cancelled'); if (product) contextFailed(); finish('Provider renderer stopped. Recovery journal retained.'); }}
      />;
  return { clearing, clearNotice, proofNotice, clearLocalSession, sessionClearingAvailable, sessionProofAvailable, binding, legacyRecovery: legacyPending.current, loginNotice, disconnectNotice, credentialNotice, startDisconnect, checkDisconnection, disconnecting, disconnectedAt, refreshRecovery, connection, checkConnection, connect, dismissLogin, confirmConnection, lastSuccessfulCaptureAt, result, browser, showRun, setShowRun, showWindow, setShowWindow, viewReady, recovery, original, editingLogin, loginBusy, username, setUsername, password, setPassword, saveLogin, setEditingLogin, providerExpanded, visible, status, busy, openCaptureLab, pauseEnabled, toggleTestPause, preBackupPause, togglePreBackupPause, from, setFrom, to, setTo, saving, restoring, navigate, setVisible, cancelRetrieval, retrieve, hasLogin, useLogin, forgetLogin, recoverView, paused, continueTestRetrieval, viewStrategy, url, toggleProviderPage, browserActive, snapshot, setProviderExpanded, web, currentUrl, retrieval, loaded, source, generation, epoch };
}

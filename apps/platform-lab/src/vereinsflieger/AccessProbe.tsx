import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { bridgeSource, flightUrl, FLIGHT_URL, LOGIN_URL, providerUrl, type ProbeSnapshot } from './probe';
import { clearOriginalView, latestCapture, readOriginalView, saveCapture, saveOriginalView, readBackupOwner, saveBackupOwner } from './storage';
import { loginPage, savedLoginScript } from './login';
import { readSavedLogin, writeSavedLogin, forgetSavedLogin } from './login-storage';
import { acceptExportMessage, beginExport, calendarYearRequest, exportScript, type ExportRun } from './export';
import { decodeView, VIEW_PHASES, viewScript, viewProtectionMessage, type ViewPhase, type ViewPreferences } from './view';
import { Retrieval } from './retrieval';
import { CaptureRun } from './CaptureRun';
import { WindowCapture } from './WindowCapture';
import { scopedBridge } from './context';

function Button({ title, press, disabled = false }: { title: string; press: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={[styles.button, disabled && { opacity: .45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function AccessProbe({ close }: { close: () => void }) {
  const [showRun, setShowRun] = useState(false);
  const [showWindow, setShowWindow] = useState(false);
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL);
  const retrieval = useRef(new Retrieval()), epoch = useRef(0), mounted = useRef(true);
  const run = useRef<ExportRun | null>(null), command = useRef(''), reading = useRef(false);
  const original = useRef<ViewPreferences | null>(null), viewPhase = useRef<ViewPhase | null>(null), restoring = useRef(false), restoreSteps = useRef(0), outcome = useRef('');
  const [recovery, setRecovery] = useState(false), [viewReady, setViewReady] = useState(false);
  const backupOwner = useRef<string | null>(null);
  const [from, setFrom] = useState(calendarYearRequest().from), [to, setTo] = useState(calendarYearRequest().to);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const loginAttempt = useRef<'waiting' | 'submitted' | null>(null);
  const loginNonce = useRef('');
  const loginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasLogin, setHasLogin] = useState(false), [editingLogin, setEditingLogin] = useState(false), [loginBusy, setLoginBusy] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [browserActive, setBrowserActive] = useState(true);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. Choose an inclusive period; configuration is verified before capture.');
  useEffect(() => { let active = true; mounted.current = true; void latestCapture().then(s => { if (active) setSnapshot(old => old ?? s); }).catch(() => { if (active && retrieval.current.state.phase === 'idle') setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; mounted.current = false; epoch.current++; if (timeout.current) clearTimeout(timeout.current); retrieval.current.dispose(); }; }, []);
  useEffect(() => { let active = true; void readSavedLogin().then(login => { if (active) setHasLogin(!!login); }).catch(() => { if (active) setStatus('Protected login storage could not be opened. Existing captures remain available.'); }); return () => { active = false; loginAttempt.current = null; if (loginTimer.current) clearTimeout(loginTimer.current); }; }, []);
  useEffect(() => { let active = true; void Promise.all([readOriginalView(), readBackupOwner()]).then(([v, owner]) => { if (!active) return; original.current = v; backupOwner.current = owner; setRecovery(!!v); setViewReady(true); if(v) setStatus('An earlier export left view restoration pending. Sign into the same provider account, then restore the original view before another export.'); }).catch(() => { if(active) { setRecovery(true); setStatus('Original view recovery could not be opened. Exports are blocked to preserve preferences.'); } }); return () => { active = false; }; }, []);
  function endLogin(message: string) { loginAttempt.current = null; if (loginTimer.current) clearTimeout(loginTimer.current); loginTimer.current = null; setLoginBusy(false); setStatus(message); }
  async function saveLogin() {
    setLoginBusy(true);
    try { await writeSavedLogin({ username, password }); setUsername(''); setPassword(''); setEditingLogin(false); setHasLogin(true); setStatus('Login saved only on this device. Use saved login when the provider asks you to sign in.'); }
    catch { setStatus('Login could not be saved. Check the fields and try again.'); }
    finally { setLoginBusy(false); }
  }
  async function forgetLogin() {
    setLoginBusy(true);
    try { await forgetSavedLogin(); setHasLogin(false); setUsername(''); setPassword(''); setStatus('Saved username and password forgotten. Existing browser session and captured flights are preserved.'); }
    catch { setStatus('Saved login could not be removed. Try again.'); }
    finally { setLoginBusy(false); }
  }
  function useLogin() {
    if (retrieval.current.state.phase !== 'idle' || busy || loginBusy || loginAttempt.current) return;
    loginAttempt.current = 'waiting'; setLoginBusy(true); setVisible(true); setEditingLogin(false);
    loginNonce.current = Crypto.randomUUID();
    setStatus('Opening the original provider page for one saved-login attempt.');
    loginTimer.current = setTimeout(() => endLogin('Saved sign-in did not finish. Provider interaction may be required; no retry loop was started.'), 30_000);
    navigate(LOGIN_URL);
  }
  async function loadedPage(page: string) {
    const pageEpoch = epoch.current;
    phase.current.loaded = true; currentUrl.current = page; setUrl(page); setLoaded(true);
    if (loginAttempt.current === 'waiting') {
      if (!loginPage(page)) { endLogin('Provider session page opened. Verify the account and retrieve flights.'); return; }
      try {
        const login = await readSavedLogin();
        if (!mounted.current || pageEpoch !== epoch.current) return;
        if (!login || !loginPage(currentUrl.current) || loginAttempt.current !== 'waiting') { endLogin('Saved login unavailable or page changed. No credentials submitted.'); return; }
        loginAttempt.current = 'submitted';
        web.current?.injectJavaScript(savedLoginScript(login,loginNonce.current));
        setStatus('Saved login attempted once on the original provider page. Complete verification there if requested.');
      } catch { if (mounted.current && pageEpoch === epoch.current) endLogin('Saved login could not be used. Existing captures preserved.'); }
      return;
    }
    if (loginAttempt.current === 'submitted') { endLogin('Provider response opened after the saved-login attempt. Verify the account, then retrieve flights; any provider verification remains on this page.'); return; }
    if (retrieval.current.state.phase === 'loading' && !flightUrl(page)) finish('Complete provider login, then tap Retrieve flights again. Previous captures preserved.');
  }
  function stop(message: string, nonce?: string) {
    const state = retrieval.current.state;
    if (nonce ? !retrieval.current.finish(nonce) : state.phase === 'saving') return;
    if (!nonce && state.phase === 'loading') retrieval.current.finish(state.nonce);
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    run.current = null; command.current = ''; reading.current = false; viewPhase.current = null; restoring.current = false;
    epoch.current++; setGeneration(epoch.current); setBrowserActive(false); setLoaded(false); setVisible(false);
    if (mounted.current) { setBusy(false); setSaving(false); setStatus(message); }
  }
  function startRestoration(message: string, nonce: string) {
    if (!original.current || !retrieval.current.owns(nonce)) return;
    if (retrieval.current.state.phase === 'saving') retrieval.current.resume(nonce);
    outcome.current = message; restoring.current = true; restoreSteps.current = 0; viewPhase.current = 'restore';
    run.current = null; reading.current = false; command.current = ''; setSaving(false); setBusy(true); setVisible(true);
    web.current?.stopLoading(); armTimeout(nonce); navigate(FLIGHT_URL);
  }
  function finish(message: string, nonce?: string) {
    const state = retrieval.current.state;
    if (nonce && !retrieval.current.owns(nonce)) return;
    if (!nonce && state.phase === 'saving') return;
    if (state.phase !== 'idle' && original.current && !restoring.current) { startRestoration(message, state.nonce); return; }
    if (restoring.current) { setRecovery(true); message = `${outcome.current} Original view restoration is pending. Sign into the original account and retry restoration.`; }
    stop(message, nonce);
  }
  function recoverView() {
    if (!original.current || !viewReady || busy || loginBusy || loginAttempt.current) return;
    const nonce = Crypto.randomUUID(); if (!retrieval.current.start(nonce)) return;
    startRestoration('Earlier export recovery.', nonce);
  }
  function cancelRetrieval() {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || restoring.current) return;
    web.current?.stopLoading();
    finish('Retrieval cancelled. Previous captures preserved.', state.nonce);
  }
  function armTimeout(nonce: string) {
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => finish('Export step timed out. Previous captures preserved; retry after checking provider login.', nonce), 30_000);
  }
  function extract() {
    const state = retrieval.current.state, active = run.current;
    if (state.phase !== 'loading' || (!active && !viewPhase.current) || reading.current || !flightUrl(currentUrl.current)) return;
    if (viewPhase.current) {
      if (++restoreSteps.current > 30) { finish('View verification navigation limit reached.', state.nonce); return; }
      reading.current = true; command.current = Crypto.randomUUID(); armTimeout(state.nonce);
      setStatus(viewPhase.current === 'snapshot' ? 'Saving your original provider view before any export changes…' : `Restoring original provider view: ${viewPhase.current}…`);
      web.current?.injectJavaScript(viewScript(command.current, viewPhase.current, original.current, backupOwner.current)); return;
    }
    if (!active) return;
    if (++active.commands > 4100) { finish('Export navigation limit reached. Narrow the period; previous captures preserved.', state.nonce); return; }
    reading.current = true; command.current = Crypto.randomUUID(); phase.current.injections++;
    armTimeout(state.nonce);
    setStatus(`Verifying export: ${active.phase}; ${active.pages.length} pages read.`);
    web.current?.injectJavaScript(exportScript(command.current, active));
  }
  // Commit the page-scoped bridge before executing the explicit table reader.
  useEffect(() => { if (visible && loaded && busy && flightUrl(url)) extract(); }, [visible, loaded, busy, url]);
  function navigate(uri: string) { setBrowserActive(true); setLoaded(false); currentUrl.current = uri; setUrl(uri); setSource({ uri }); epoch.current++; setGeneration(epoch.current); }
  function retrieve() {
    if (loginAttempt.current || loginBusy || !viewReady || recovery) return;
    let prepared: ExportRun;
    try { prepared = beginExport({ from, to }); } catch { setStatus('Use valid inclusive dates in YYYY-MM-DD order.'); return; }
    const nonce = Crypto.randomUUID();
    if (!retrieval.current.start(nonce)) return;
    run.current = prepared; reading.current = false; viewPhase.current = 'snapshot'; restoreSteps.current = 0;
    setBusy(true); setVisible(true);
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
          try { await saveOriginalView(captured); }
          catch { setRecovery(true); stop('Original view could not be journaled. No export settings changed; recovery must be checked before another export.', nonce); return; }
          if (!mounted.current || !retrieval.current.owns(nonce)) return;
          original.current = captured; setRecovery(true); retrieval.current.resume(nonce); setSaving(false);
          if(run.current) run.current.accountLabel = captured.accountLabel;
          viewPhase.current = 'backup';
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
          if (!original.current || !retrieval.current.beginSave(nonce)) return;
          setSaving(true); if(timeout.current) clearTimeout(timeout.current); timeout.current = null;
          if (!original.current.reset) { await saveBackupOwner(original.current); backupOwner.current = original.current.accountLabel; }
          if (!mounted.current || !retrieval.current.owns(nonce)) return;
          retrieval.current.resume(nonce); setSaving(false); viewPhase.current = null;
        } else if (stage === 'verify') {
          if (!original.current || !retrieval.current.beginSave(nonce)) return;
          setSaving(true); if(timeout.current) clearTimeout(timeout.current); timeout.current = null;
          if (!original.current.reset && (message as {view?: ViewPreferences}).view?.preset === 'MoFlight App user view backup') {
            await saveBackupOwner(original.current); backupOwner.current = original.current.accountLabel;
          }
          await clearOriginalView(original.current);
          if (!mounted.current || !retrieval.current.owns(nonce)) return;
          original.current = null; setRecovery(false); restoring.current = false;
          stop(`${outcome.current} Original provider view restored and verified.`, nonce); return;
        } else { viewPhase.current = VIEW_PHASES[VIEW_PHASES.indexOf(stage) + 1]!; }
        reading.current = false; command.current = ''; extract(); return;
      }
      if (!run.current) return;
      const result = acceptExportMessage(run.current, event.nativeEvent.data, event.nativeEvent.url, currentUrl.current, command.current);
      reading.current = false; command.current = '';
      if (result.nextUrl) { armTimeout(nonce); navigate(result.nextUrl); return; }
      if (!result.complete) { extract(); return; }
      const data = result.complete;
      if (!retrieval.current.beginSave(nonce)) return;
      setSaving(true); setStatus('Saving validated capture locally…');
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      await saveCapture(data);
      if (!mounted.current || !retrieval.current.owns(nonce)) return;
      setSnapshot(data);
      finish(`Saved ${data.rows.length} flights across ${data.exportContext?.pageCount} pages for the requested period. Account identity and time basis remain unverified.`, nonce);
    } catch (error) { finish(viewPhase.current === 'snapshot' ? viewProtectionMessage(error) ?? 'Original view could not be protected. Check for an existing MoFlight App user view backup configuration owned elsewhere or unsupported settings. No export settings changed.' : 'Retrieval or local saving failed. Previous captures preserved. Sign in again if needed, then retry.', nonce); }
  }
  if (showRun) return <CaptureRun close={() => setShowRun(false)} />;
  if (showWindow) return <WindowCapture close={() => setShowWindow(false)} />;
  if (editingLogin) return <View style={styles.screen}><Text style={styles.title}>Save Vereinsflieger login</Text><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}><View style={styles.row}><Text style={styles.body}>Optional login saved in protected device storage. Used only for Vereinsflieger sign-in; excluded from logbook backups. Forget it after development.</Text><TextInput accessibilityLabel="Saved login username" placeholder="Username or email" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername} editable={!loginBusy} style={styles.input} /><TextInput accessibilityLabel="Saved login password" placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" value={password} onChangeText={setPassword} editable={!loginBusy} style={styles.input} /><View style={styles.actions}><Button title="Save login" disabled={loginBusy} press={() => void saveLogin()} /><Button title="Cancel login entry" disabled={loginBusy} press={() => { setUsername(''); setPassword(''); setEditingLogin(false); }} /></View></View></ScrollView></View>;
  return <View style={styles.screen}>
    <Text style={styles.title}>Vereinsflieger access PoC</Text>
    <Text style={styles.body}>Configure all data columns, clear restrictions and select Pilot oder Fluglehrer before reading every page. Raw captures stay separate from your logbook.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.body}>{status}</Text>
    <Button title="Open bounded capture and resume" disabled={busy || loginBusy || recovery} press={() => setShowRun(true)} />
    <Button title="Open dated-window capture" disabled={busy || loginBusy || recovery} press={() => setShowWindow(true)} />
    <View style={styles.actions}><TextInput accessibilityLabel="Export start date" value={from} onChangeText={setFrom} editable={!busy} placeholder="YYYY-MM-DD" style={styles.input} /><TextInput accessibilityLabel="Export end date" value={to} onChangeText={setTo} editable={!busy} placeholder="YYYY-MM-DD" style={styles.input} /></View>
    <View style={styles.actions}><Button title="Show provider login" disabled={busy || loginBusy} press={() => { setVisible(true); navigate(LOGIN_URL); }} /><Button title="Retrieve flights" disabled={busy || loginBusy || !viewReady || recovery} press={retrieve} /><Button title="Close access PoC" disabled={busy || loginBusy} press={close} /></View>
    <View style={styles.actions}><Button title={hasLogin ? 'Replace saved login' : 'Save login on this device'} disabled={busy || loginBusy} press={() => { setEditingLogin(true); setVisible(false); }} />{hasLogin && <><Button title="Use saved login" disabled={busy || loginBusy} press={useLogin} /><Button title="Forget saved login" disabled={busy || loginBusy} press={() => void forgetLogin()} /></>}</View>
    {recovery && <Button title="Restore original provider view" disabled={busy || loginBusy || !viewReady || !original.current} press={recoverView} />}
    {busy && <ActivityIndicator />}
    {busy && <Button title="Cancel retrieval" disabled={saving || restoring.current} press={cancelRetrieval} />}
    {visible && <Text style={styles.origin}>{providerUrl(url) ? new URL(url).origin : 'Navigation blocked'} · verify that the visible provider account is yours</Text>}
    <View pointerEvents={saving ? 'none' : 'auto'} style={visible ? styles.browser : styles.hidden}>
      {/* Route all navigation through our exact-URL validator; a narrow library
          whitelist otherwise hands rejected URLs to the external OS browser. */}
      {browserActive && <WebView key={generation} ref={web} source={source} originWhitelist={['*']}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { if (generation !== epoch.current) return false; const allowed = providerUrl(request.url); if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => { if (generation === epoch.current) finish('New browser window blocked in this bounded PoC.'); }}
        onLoadStart={event => { if (generation !== epoch.current) return; if (retrieval.current.state.phase === 'loading') {
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
          if(loginAttempt.current==='submitted'&&loginPage(currentUrl.current)&&scopedBridge(event.nativeEvent.url,currentUrl.current,LOGIN_URL)&&event.nativeEvent.data.length<2000){
            try{const m=JSON.parse(event.nativeEvent.data);if(m.kind==='vf-login-result-v1'&&m.nonce===loginNonce.current&&m.url===LOGIN_URL){if(m.result==='submitted'){setStatus('Original provider submit control invoked once. Waiting for its response; sign-in is not yet verified.');return;}if(m.result==='provider-script-error'){endLogin('Saved sign-in stopped because the original provider form raised an error. Submission was not confirmed. Complete sign-in on the original page.');return;}if(['wrong-page','username-control','password-control','submit-control','form-binding','form-target'].includes(m.result)){endLogin(`Saved sign-in stopped: unsupported original ${m.result}. No credentials submitted. Use the original provider page.`);return;}}}catch{/* Ignore unrelated bridge messages. */}
          }
          if(flightUrl(url))void receive(event);
        }}
        onError={() => { if (generation === epoch.current) loginAttempt.current ? endLogin('Provider login page failed to load. Saved login and captures preserved.') : finish('Provider page failed to load. Previous captures preserved.'); }}
        onHttpError={() => { if (generation === epoch.current) loginAttempt.current ? endLogin('Provider login returned an HTTP error. Saved login and captures preserved.') : finish('Provider returned an HTTP error. Previous captures preserved.'); }}
      />}
    </View>
    {!visible && <FlatList contentContainerStyle={styles.results} data={snapshot?.rows ?? []} keyExtractor={(_, i) => String(i)}
      ListHeaderComponent={<><Button title="Show provider page" disabled={busy || loginBusy} press={() => { if (!browserActive) navigate(LOGIN_URL); setVisible(true); }} />{snapshot && <Text style={styles.body}>Last saved capture: {snapshot.retrievedAt}. Coverage: {snapshot.coverage}. {snapshot.exportContext ? `${snapshot.exportContext.from} through ${snapshot.exportContext.to}; ${snapshot.exportContext.preset}; ${snapshot.exportContext.pageCount} pages.` : 'Legacy bounded capture.'} Source identity unverified; time basis unknown.</Text>}</>}
      ListEmptyComponent={<Text style={styles.body}>{snapshot ? 'Verified requested list is empty.' : 'No live capture saved. Login session reuse and real retrieval still require a device test.'}</Text>}
      renderItem={({ item: r }) => <View style={styles.row}>{snapshot?.headers.map((h, n) => h ? <Text selectable key={n} style={styles.body}>{h}: {r.values[n] || '(blank)'}</Text> : null)}<Text style={styles.body}>Candidate source flight ID: {r.sourceFlightId ?? 'not supplied'}</Text></View>} />}

  </View>;
}
const styles = StyleSheet.create({ input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 10, borderRadius: 6, color: '#1f2937' }, screen: { flex: 1, padding: 12, gap: 8, backgroundColor: '#f5f7fb' }, title: { fontSize: 23, fontWeight: '700', color: '#173a57' }, body: { fontSize: 15, lineHeight: 21, color: '#1f2937' }, origin: { fontSize: 14, color: '#174c72' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, button: { backgroundColor: '#174c72', padding: 10, borderRadius: 6 }, buttonText: { color: '#fff', fontSize: 14 }, browser: { flex: 1, minHeight: 180 }, hidden: { height: 0, overflow: 'hidden' }, results: { gap: 10, paddingBottom: 20 }, row: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 12, gap: 4 } });

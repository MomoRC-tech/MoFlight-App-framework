import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { bridgeSource, decodeProbe, flightUrl, FLIGHT_URL, LOGIN_URL, probeScript, providerUrl, type ProbeSnapshot } from './probe';
import { latestCapture, saveCapture } from './storage';
import { loginPage, savedLoginScript } from './login';
import { readSavedLogin, writeSavedLogin, forgetSavedLogin } from './login-storage';
import { Retrieval } from './retrieval';

function Button({ title, press, disabled = false }: { title: string; press: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={[styles.button, disabled && { opacity: .45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function AccessProbe({ close }: { close: () => void }) {
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL);
  const retrieval = useRef(new Retrieval()), epoch = useRef(0), mounted = useRef(true);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const loginAttempt = useRef<'waiting' | 'submitted' | null>(null);
  const loginTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasLogin, setHasLogin] = useState(false), [editingLogin, setEditingLogin] = useState(false), [loginBusy, setLoginBusy] = useState(false);
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [browserActive, setBrowserActive] = useState(true);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. No date selection is needed.');
  useEffect(() => { let active = true; mounted.current = true; void latestCapture().then(s => { if (active) setSnapshot(old => old ?? s); }).catch(() => { if (active && retrieval.current.state.phase === 'idle') setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; mounted.current = false; epoch.current++; if (timeout.current) clearTimeout(timeout.current); retrieval.current.dispose(); }; }, []);
  useEffect(() => { let active = true; void readSavedLogin().then(login => { if (active) setHasLogin(!!login); }).catch(() => { if (active) setStatus('Protected login storage could not be opened. Existing captures remain available.'); }); return () => { active = false; loginAttempt.current = null; if (loginTimer.current) clearTimeout(loginTimer.current); }; }, []);
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
        web.current?.injectJavaScript(savedLoginScript(login));
        setStatus('Saved login attempted once on the original provider page. Complete verification there if requested.');
      } catch { if (mounted.current && pageEpoch === epoch.current) endLogin('Saved login could not be used. Existing captures preserved.'); }
      return;
    }
    if (loginAttempt.current === 'submitted') { endLogin('Provider response opened after the saved-login attempt. Verify the account, then retrieve flights; any provider verification remains on this page.'); return; }
    if (retrieval.current.state.phase === 'loading' && !flightUrl(page)) finish('Complete provider login, then tap Retrieve flights again. Previous captures preserved.');
  }
  function finish(message: string, nonce?: string) {
    const state = retrieval.current.state;
    if (nonce ? !retrieval.current.finish(nonce) : state.phase === 'saving') return;
    if (!nonce && state.phase === 'loading') retrieval.current.finish(state.nonce);
    if (timeout.current) clearTimeout(timeout.current); timeout.current = null;
    if (mounted.current) { setBusy(false); setSaving(false); setStatus(message); }
  }
  function cancelRetrieval() {
    if (!retrieval.current.cancel()) return;
    web.current?.stopLoading();
    // Invalidate callbacks from this page before another retrieval can start.
    epoch.current++; setGeneration(epoch.current); setBrowserActive(false); setLoaded(false); setVisible(false);
    finish('Retrieval cancelled. Previous captures preserved.');
  }
  function extract() {
    const state = retrieval.current.state;
    if (state.phase !== 'loading' || !flightUrl(currentUrl.current)) return;
    phase.current.injections++;
    web.current?.injectJavaScript(probeScript(state.nonce));
  }
  // Commit the page-scoped bridge before executing the explicit table reader.
  useEffect(() => { if (visible && loaded && busy && flightUrl(url)) extract(); }, [visible, loaded, busy, url]);
  function navigate(uri: string) { setBrowserActive(true); setLoaded(false); currentUrl.current = uri; setUrl(uri); setSource({ uri }); epoch.current++; setGeneration(epoch.current); }
  function retrieve() {
    if (loginAttempt.current || loginBusy) return;
    const nonce = Crypto.randomUUID();
    if (!retrieval.current.start(nonce)) return;
    setBusy(true); setVisible(true);
    phase.current = { loaded: false, progress: 0, injections: 0 };
    setStatus('Opening your personal flightbook automatically. If asked, complete provider login, then tap Retrieve again.');
    timeout.current = setTimeout(() => finish(`Retrieval timed out. Previous captures are preserved. Flight page: ${flightUrl(currentUrl.current) ? 'yes' : 'no'}; load completed: ${phase.current.loaded ? 'yes' : 'no'}; progress: ${Math.round(phase.current.progress * 100)}%; reader requests: ${phase.current.injections}.`, nonce), 20_000);
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
      // An old bridge message must not terminate the active request.
      if (event.nativeEvent.data.length > 200_000) throw new Error('Oversized flight response. Previous captures preserved.');
      const message: unknown = JSON.parse(event.nativeEvent.data);
      if (message && typeof message === 'object' && (message as Record<string, unknown>).nonce !== nonce) return;
      const data = decodeProbe(event.nativeEvent.data, event.nativeEvent.url, nonce, new Date().toISOString(), currentUrl.current);
      if (!retrieval.current.beginSave(nonce)) return;
      setSaving(true); setStatus('Saving validated capture locally…');
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      await saveCapture(data);
      if (!mounted.current || !retrieval.current.owns(nonce)) return;
      setSnapshot(data); setVisible(false);
      finish(`Saved ${data.rows.length} visible personal-list rows locally. Bounded access capture; account identity and time basis still need verification.`, nonce);
    } catch { finish('Retrieval or local saving failed. Previous captures preserved. Sign in again if needed, then retry.', nonce); }
  }
  if (editingLogin) return <View style={styles.screen}><Text style={styles.title}>Save Vereinsflieger login</Text><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.results}><View style={styles.row}><Text style={styles.body}>Optional login saved in protected device storage. Used only for Vereinsflieger sign-in; excluded from logbook backups. Forget it after development.</Text><TextInput accessibilityLabel="Saved login username" placeholder="Username or email" autoCapitalize="none" autoCorrect={false} autoComplete="username" value={username} onChangeText={setUsername} editable={!loginBusy} style={styles.input} /><TextInput accessibilityLabel="Saved login password" placeholder="Password" secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" value={password} onChangeText={setPassword} editable={!loginBusy} style={styles.input} /><View style={styles.actions}><Button title="Save login" disabled={loginBusy} press={() => void saveLogin()} /><Button title="Cancel login entry" disabled={loginBusy} press={() => { setUsername(''); setPassword(''); setEditingLogin(false); }} /></View></View></ScrollView></View>;
  return <View style={styles.screen}>
    <Text style={styles.title}>Vereinsflieger access PoC</Text>
    <Text style={styles.body}>Read-only test of the default personal list, at most 20 rows. No full-history or verified-account claim. Captures stay separate from your logbook.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.body}>{status}</Text>
    <View style={styles.actions}><Button title="Show provider login" disabled={busy || loginBusy} press={() => { setVisible(true); navigate(LOGIN_URL); }} /><Button title="Retrieve flights" disabled={busy || loginBusy} press={retrieve} /><Button title="Close access PoC" disabled={busy || loginBusy} press={close} /></View>
    <View style={styles.actions}><Button title={hasLogin ? 'Replace saved login' : 'Save login on this device'} disabled={busy || loginBusy} press={() => { setEditingLogin(true); setVisible(false); }} />{hasLogin && <><Button title="Use saved login" disabled={busy || loginBusy} press={useLogin} /><Button title="Forget saved login" disabled={busy || loginBusy} press={() => void forgetLogin()} /></>}</View>
    {busy && <ActivityIndicator />}
    {busy && <Button title="Cancel retrieval" disabled={saving} press={cancelRetrieval} />}
    {visible && <Text style={styles.origin}>{providerUrl(url) ? new URL(url).origin : 'Navigation blocked'} · verify that the visible provider account is yours</Text>}
    <View style={visible ? styles.browser : styles.hidden}>
      {/* Route all navigation through our exact-URL validator; a narrow library
          whitelist otherwise hands rejected URLs to the external OS browser. */}
      {browserActive && <WebView key={generation} ref={web} source={source} originWhitelist={['*']}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { if (generation !== epoch.current) return false; const allowed = providerUrl(request.url); if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => { if (generation === epoch.current) finish('New browser window blocked in this bounded PoC.'); }}
        onLoadStart={event => { if (generation !== epoch.current) return; currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(false); }}
        onNavigationStateChange={state => { if (generation !== epoch.current) return; currentUrl.current = state.url; setUrl(state.url); }}
        onLoadProgress={event => { if (generation === epoch.current) phase.current.progress = event.nativeEvent.progress; }}
        onLoadEnd={event => { if (generation === epoch.current) void loadedPage(event.nativeEvent.url); }}
        onMessage={flightUrl(url) ? event => { if (generation === epoch.current) void receive(event); } : undefined}
        onError={() => { if (generation === epoch.current) loginAttempt.current ? endLogin('Provider login page failed to load. Saved login and captures preserved.') : finish('Provider page failed to load. Previous captures preserved.'); }}
        onHttpError={() => { if (generation === epoch.current) loginAttempt.current ? endLogin('Provider login returned an HTTP error. Saved login and captures preserved.') : finish('Provider returned an HTTP error. Previous captures preserved.'); }}
      />}
    </View>
    {!visible && <ScrollView contentContainerStyle={styles.results}>
      <Button title="Show provider page" press={() => { if (!browserActive) navigate(LOGIN_URL); setVisible(true); }} />
      {snapshot ? <><Text style={styles.body}>Last saved capture: {snapshot.retrievedAt}. Coverage: visible list only; time basis unknown. Source identity unverified.</Text>{snapshot.rows.map((r, i) => <View style={styles.row} key={i}>{snapshot.headers.map((h, n) => h ? <Text selectable key={n} style={styles.body}>{h}: {r.values[n] || '(blank)'}</Text> : null)}<Text style={styles.body}>Candidate source flight ID: {r.sourceFlightId ?? 'not supplied'}</Text></View>)}</> : <Text style={styles.body}>No live capture saved. Login session reuse and real retrieval still require a device test.</Text>}
    </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({ input: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 10, borderRadius: 6, color: '#1f2937' }, screen: { flex: 1, padding: 12, gap: 8, backgroundColor: '#f5f7fb' }, title: { fontSize: 23, fontWeight: '700', color: '#173a57' }, body: { fontSize: 15, lineHeight: 21, color: '#1f2937' }, origin: { fontSize: 14, color: '#174c72' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, button: { backgroundColor: '#174c72', padding: 10, borderRadius: 6 }, buttonText: { color: '#fff', fontSize: 14 }, browser: { flex: 1, minHeight: 180 }, hidden: { height: 0, overflow: 'hidden' }, results: { gap: 10, paddingBottom: 20 }, row: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 12, gap: 4 } });

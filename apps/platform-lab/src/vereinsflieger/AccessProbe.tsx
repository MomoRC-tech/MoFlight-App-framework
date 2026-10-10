import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import { bridgeSource, decodeProbe, flightUrl, FLIGHT_URL, LOGIN_URL, probeScript, providerUrl, type ProbeSnapshot } from './probe';
import { latestCapture, saveCapture } from './storage';

function Button({ title, press, disabled = false }: { title: string; press: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={[styles.button, disabled && { opacity: .45 }]}><Text style={styles.buttonText}>{title}</Text></Pressable>;
}
export function AccessProbe({ close }: { close: () => void }) {
  const web = useRef<WebView>(null), currentUrl = useRef(LOGIN_URL), pending = useRef<string | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null), reading = useRef(false);
  const phase = useRef({ loaded: false, progress: 0, injections: 0 });
  const [source, setSource] = useState({ uri: LOGIN_URL }), [url, setUrl] = useState(LOGIN_URL);
  const [generation, setGeneration] = useState(0);
  const [visible, setVisible] = useState(false), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [snapshot, setSnapshot] = useState<ProbeSnapshot | null>(null), [status, setStatus] = useState('Sign in on the original provider page. No date selection is needed.');
  useEffect(() => { let active = true; void latestCapture().then(s => { if (active) setSnapshot(s); }).catch(() => { if (active) setStatus('Saved capture could not be opened. Synthetic logbook remains separate.'); }); return () => { active = false; if (timeout.current) clearTimeout(timeout.current); pending.current = null; }; }, []);
  function finish(message: string) { pending.current = null; reading.current = false; if (timeout.current) clearTimeout(timeout.current); timeout.current = null; setBusy(false); setStatus(message); }
  function extract() {
    if (!pending.current || reading.current || !flightUrl(currentUrl.current)) return;
    phase.current.injections++;
    web.current?.injectJavaScript(probeScript(pending.current));
  }
  // Commit the page-scoped bridge before executing the explicit table reader.
  useEffect(() => { if (visible && loaded && busy && flightUrl(url)) extract(); }, [visible, loaded, busy, url]);
  function navigate(uri: string) { setLoaded(false); currentUrl.current = uri; setUrl(uri); setSource({ uri }); setGeneration(n => n + 1); }
  function retrieve() {
    if (pending.current) return;
    pending.current = Crypto.randomUUID(); setBusy(true); setVisible(true);
    phase.current = { loaded: false, progress: 0, injections: 0 };
    setStatus('Opening your personal flightbook automatically. If asked, complete provider login, then tap Retrieve again.');
    timeout.current = setTimeout(() => finish(`Retrieval timed out. Previous captures are preserved. Flight page: ${flightUrl(currentUrl.current) ? 'yes' : 'no'}; load completed: ${phase.current.loaded ? 'yes' : 'no'}; progress: ${Math.round(phase.current.progress * 100)}%; reader requests: ${phase.current.injections}.`), 20_000);
    // Every retrieval requests the page again, rather than recapturing stale DOM.
    // Remounting also installs the flight-scoped bridge before that page loads;
    // provider cookies stay in the same native browser store.
    navigate(FLIGHT_URL);
  }
  async function receive(event: WebViewMessageEvent) {
    const nonce = pending.current;
    if (!nonce || reading.current || !bridgeSource(event.nativeEvent.url, currentUrl.current)) return;
    reading.current = true;
    try {
      const data = decodeProbe(event.nativeEvent.data, event.nativeEvent.url, nonce, new Date().toISOString(), currentUrl.current);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = null;
      await saveCapture(data);
      if (pending.current !== nonce) return;
      setSnapshot(data); setVisible(false);
      finish(`Saved ${data.rows.length} visible personal-list rows locally. Bounded access capture; account identity and time basis still need verification.`);
    } catch (e) { finish(e instanceof Error ? e.message : 'Retrieval failed. Previous captures preserved.'); }
  }
  return <View style={styles.screen}>
    <Text style={styles.title}>Vereinsflieger access PoC</Text>
    <Text style={styles.body}>Read-only test of the default personal list, at most 20 rows. No full-history or verified-account claim. Captures stay separate from your logbook.</Text>
    <Text accessibilityLiveRegion="polite" style={styles.body}>{status}</Text>
    <View style={styles.actions}><Button title="Show provider login" disabled={busy} press={() => { setVisible(true); navigate(LOGIN_URL); }} /><Button title="Retrieve flights" disabled={busy} press={retrieve} /><Button title="Close access PoC" disabled={busy} press={close} /></View>
    {busy && <ActivityIndicator />}
    {visible && <Text style={styles.origin}>{providerUrl(url) ? new URL(url).origin : 'Navigation blocked'} · verify that the visible provider account is yours</Text>}
    <View style={visible ? styles.browser : styles.hidden}>
      {/* Route all navigation through our exact-URL validator; a narrow library
          whitelist otherwise hands rejected URLs to the external OS browser. */}
      <WebView key={generation} ref={web} source={source} originWhitelist={['*']}
        incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} webviewDebuggingEnabled={false}
        cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
        allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never"
        javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
        onShouldStartLoadWithRequest={request => { const allowed = providerUrl(request.url); if (!allowed && request.isTopFrame !== false) finish('External navigation blocked. Previous captures preserved.'); return allowed; }}
        onOpenWindow={() => finish('New browser window blocked in this bounded PoC.')}
        onLoadStart={event => { currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(false); }}
        onNavigationStateChange={state => { currentUrl.current = state.url; setUrl(state.url); }}
        onLoadProgress={event => { phase.current.progress = event.nativeEvent.progress; }}
        onLoadEnd={event => { phase.current.loaded = true; currentUrl.current = event.nativeEvent.url; setUrl(event.nativeEvent.url); setLoaded(true); if (pending.current && !flightUrl(event.nativeEvent.url)) finish('Complete provider login, then tap Retrieve flights again. Previous captures preserved.'); }}
        onMessage={flightUrl(url) ? event => void receive(event) : undefined}
        onError={() => finish('Provider page failed to load. Previous captures preserved.')}
        onHttpError={() => finish('Provider returned an HTTP error. Previous captures preserved.')}
      />
    </View>
    {!visible && <ScrollView contentContainerStyle={styles.results}>
      <Button title="Show provider page" press={() => setVisible(true)} />
      {snapshot ? <><Text style={styles.body}>Last saved capture: {snapshot.retrievedAt}. Coverage: visible list only; time basis unknown. Source identity unverified.</Text>{snapshot.rows.map((r, i) => <View style={styles.row} key={i}>{snapshot.headers.map((h, n) => h ? <Text selectable key={n} style={styles.body}>{h}: {r.values[n] || '(blank)'}</Text> : null)}<Text style={styles.body}>Candidate source flight ID: {r.sourceFlightId ?? 'not supplied'}</Text></View>)}</> : <Text style={styles.body}>No live capture saved. Login session reuse and real retrieval still require a device test.</Text>}
    </ScrollView>}
  </View>;
}
const styles = StyleSheet.create({ screen: { flex: 1, padding: 12, gap: 8, backgroundColor: '#f5f7fb' }, title: { fontSize: 23, fontWeight: '700', color: '#173a57' }, body: { fontSize: 15, lineHeight: 21, color: '#1f2937' }, origin: { fontSize: 14, color: '#174c72' }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 }, button: { backgroundColor: '#174c72', padding: 10, borderRadius: 6 }, buttonText: { color: '#fff', fontSize: 14 }, browser: { flex: 1, minHeight: 180 }, hidden: { height: 0, overflow: 'hidden' }, results: { gap: 10, paddingBottom: 20 }, row: { backgroundColor: 'white', borderWidth: 1, borderColor: '#b9cadb', padding: 12, gap: 4 } });

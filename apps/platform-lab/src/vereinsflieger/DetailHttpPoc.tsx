import React, { useEffect, useRef, useState } from 'react';
import { AppState, BackHandler, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Action, Card, Label } from '../mobile/theme';
import { providerUrl } from './probe';
import type { ObservedContext } from './context';
import { DetailHttpTrial, summarizeDetailHttpEvidence, type DetailHttpState } from './detail-http-trial';
import { detailHttpFixtureHtml } from './detail-http-fixture';

async function saveEvidence(ownerId: string, id: string, value: unknown) {
  // Separate append-only lab database. No production account/book/library access.
  const ownerHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, ownerId);
  const db = await SQLite.openDatabaseAsync(`vereinsflieger-detail-http-poc-${ownerHash}.sqlite`);
  try {
    await db.execAsync('CREATE TABLE IF NOT EXISTS trials (id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL)');
    await db.runAsync('INSERT INTO trials (id,payload) VALUES (?,?)', id, JSON.stringify(value));
  } finally { await db.closeAsync(); }
}
export function DetailHttpPoc({ close, expected, ownerId }: { ownerId: string; close(): void; expected?: ObservedContext }) {
  const web = useRef<WebView>(null), mounted = useRef(true), foreground = useRef(AppState.currentState === 'active'), epoch = useRef(0);
  const currentUrl = useRef(''), synthetic = useRef<{ id: string; started: number } | null>(null);
  const [page, setPage] = useState<{ url?: string; html?: string; epoch: number } | null>(null);
  const [state, setState] = useState<DetailHttpState>({ phase: 'idle', message: 'Ein einzelnes eigenes Flugdetail vergleichen. Die Bibliothek wird nicht geändert.' });
  const revoke = () => { epoch.current++; web.current?.stopLoading(); if (mounted.current) setPage(null); };
  const [trial] = useState(() => new DetailHttpTrial({ uuid: Crypto.randomUUID, now: Date.now, active: () => mounted.current && foreground.current && !synthetic.current,
    navigate: url => { currentUrl.current = url; epoch.current++; setPage({ url, epoch: epoch.current }); },
    inject: script => web.current?.injectJavaScript(script), revoke,
    changed: value => { if (mounted.current) setState(value); }, save: async evidence => {
      console.info('MOFLIGHT_DETAIL_HTTP_TRIAL', JSON.stringify(summarizeDetailHttpEvidence(evidence)));
      await saveEvidence(ownerId, evidence.id, evidence);
    },
  }, expected));
  function stopSynthetic() {
    const owner = synthetic.current; if (!owner) return; synthetic.current = null; revoke();
    const report = { kind: 'vf-detail-http-synthetic-v1', passed: false, interrupted: true, elapsedMs: Date.now() - owner.started, samples: [] };
    console.info('MOFLIGHT_DETAIL_HTTP_SYNTHETIC', JSON.stringify(report));
    void saveEvidence(ownerId, owner.id, report).catch(() => { if (mounted.current) setState({ phase: 'stopped', message: 'Synthetischer Nachweis konnte nicht gespeichert werden.' }); });
    if (mounted.current) setState({ phase: 'stopped', message: 'Synthetischer Nachweis unterbrochen.' });
  }
  const stopRef = useRef(stopSynthetic); stopRef.current = stopSynthetic;
  useEffect(() => {
    mounted.current = true;
    const app = AppState.addEventListener('change', next => { foreground.current = next === 'active'; if (!foreground.current) { trial.stop('Im Hintergrund abgebrochen. Für einen neuen Versuch erneut starten.'); stopRef.current(); } });
    const back = BackHandler.addEventListener('hardwareBackPress', () => { trial.stop(); stopRef.current(); close(); return true; });
    return () => { trial.stop(); stopRef.current(); mounted.current = false; trial.dispose(); app.remove(); back.remove(); };
  }, [trial, close]);
  useEffect(() => { if (!page?.html) return; const timer = setTimeout(() => stopRef.current(), 15000); return () => clearTimeout(timer); }, [page]);
  const busy = state.phase === 'running' || state.phase === 'confirm';
  return <View style={{ flex: 1, padding: 12, gap: 10 }}>
    <Card><Label>Entwicklung · HTTP-Flugdetail</Label><Label muted>HTTP nutzt die bestehende WebView-Sitzung. Ein frischer eigener Listenlink, keine Buchzuordnung. Rohbelege bleiben in einer getrennten lokalen Testdatenbank. Der normale Sync ist währenddessen getrennt.</Label></Card>
    <View accessibilityLiveRegion="polite"><Label selectable>{state.message}</Label></View>
    {state.phase === 'confirm' && <Card><Label>Konto {state.context?.accountNumber} · {state.context?.clubLabel}</Label><Action onPress={() => trial.confirm()}>Beobachtetes Konto bestätigen und vergleichen</Action></Card>}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      <Action disabled={busy} onPress={() => trial.start()}>Eigenes Detail vergleichen</Action>
      <Action disabled={busy} onPress={() => { synthetic.current = { id: Crypto.randomUUID(), started: Date.now() }; epoch.current++; setState({ phase: 'running', message: 'Synthetischer WebView-Nachweis läuft …' }); setPage({ html: detailHttpFixtureHtml(), epoch: epoch.current }); }}>Synthetischen Nachweis starten</Action>
      {busy && <Action onPress={() => { trial.stop(); stopSynthetic(); }}>Stoppen</Action>}
      <Action onPress={() => { trial.stop(); stopSynthetic(); close(); }}>Zurück</Action>
    </View>
    {state.evidence?.comparison && <Label selectable>{state.evidence.comparison.exact}/{state.evidence.comparison.fields} Felder exakt; {state.evidence.comparison.normalized} nach Leerraum-Normalisierung. HTTP-Detail {Math.round(state.evidence.http!.detailMs)} ms; HTTP mit Kontoprüfung/Liste {Math.round(state.evidence.http!.totalMs)} ms; Seitennavigation mit Browseraufbau/Leser {state.evidence.navigationMs} ms. Unterschiedliche Messgrenzen; kein Geschwindigkeitsnachweis.</Label>}
    {page && <WebView key={page.epoch} ref={web} source={page.html ? { html: page.html, baseUrl: 'https://moflight.synthetic.invalid/' } : { uri: page.url! }} style={{ flex: 1, minHeight: 160 }} originWhitelist={['*']}
      incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} cacheEnabled={false} cacheMode="LOAD_NO_CACHE" webviewDebuggingEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
      onShouldStartLoadWithRequest={r => page.epoch === epoch.current && (page.html ? r.url === 'https://moflight.synthetic.invalid/' || r.url === 'about:blank' : providerUrl(r.url))}
      onLoadStart={e => { if (page.epoch === epoch.current) currentUrl.current = e.nativeEvent.url; }}
      onNavigationStateChange={e => { if (page.epoch === epoch.current) currentUrl.current = e.url; }}
      onLoadEnd={e => { if (page.epoch === epoch.current && !page.html) trial.loaded(e.nativeEvent.url); }}
      onMessage={e => {
        if (page.epoch !== epoch.current) return;
        if (!page.html) { trial.receive(e.nativeEvent.url, currentUrl.current, e.nativeEvent.data); return; }
        const owner = synthetic.current; if (!owner || e.nativeEvent.data.length > 20000) return;
        try { const result = JSON.parse(e.nativeEvent.data); if (result.kind !== 'vf-detail-http-synthetic-v1') return;
          synthetic.current = null; revoke(); const savedEpoch = epoch.current;
          // Android truncates a large single log record. Keep each synthetic
          // timing/counter record independently parseable; never log raw data.
          console.info('MOFLIGHT_HTTP_SYNTHETIC_SUMMARY', JSON.stringify({ passed: result.passed, checks: result.checks.length, userAgent: result.userAgent }));
          for (const sample of result.samples) {
            const check = result.checks.find((c: { scenario: string }) => c.scenario === sample.scenario);
            console.info('MOFLIGHT_HTTP_SYNTHETIC_SAMPLE', JSON.stringify({ ...sample, requests: check?.requests, rows: check?.rows, pages: check?.pages }));
          }
          void saveEvidence(ownerId, owner.id, result).then(() => { if (mounted.current && epoch.current === savedEpoch) setState({ phase: result.passed ? 'complete' : 'stopped', message: `Synthetischer WebView-Nachweis: ${result.passed ? 'bestanden' : 'fehlgeschlagen'} (${result.checks.length} Prüfungen). Keine Live-Sitzungsprüfung.` }); }, () => { if (mounted.current && epoch.current === savedEpoch) setState({ phase: 'stopped', message: 'Nachweis konnte nicht gespeichert werden.' }); });
        } catch { stopSynthetic(); }
      }} onOpenWindow={() => { if (page.epoch === epoch.current) trial.stop('Neues Fenster blockiert.'); }} onError={() => { if (page.epoch === epoch.current) { trial.stop('Seite konnte nicht geladen werden.'); stopSynthetic(); } }} onHttpError={() => { if (page.epoch === epoch.current) trial.stop('HTTP-Seitenfehler.'); }} />}
  </View>;
}

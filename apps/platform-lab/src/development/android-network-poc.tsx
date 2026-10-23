import React, { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import * as SQLite from 'expo-sqlite';
import { ACTIVITY_READER_SOURCE, decodeActivityProbe } from '../vereinsflieger/activity-probe';

// Build-only fixture entry, never imported by the normal app. Real WebView fetch,
// streams, AbortController and timers; only the provider origin is substituted.
export const NETWORK_ORIGIN = 'http://localhost:18765';
const profile = NETWORK_ORIGIN + '/member/profile/viewprofile';
export const networkReader = ACTIVITY_READER_SOURCE
  .replace("location.protocol!=='https:'", "location.protocol!=='http:'")
  .replace("!['vereinsflieger.de','www.vereinsflieger.de'].includes(location.hostname)", "location.hostname!=='localhost'")
  .replace('location.port ||', "location.port!=='18765' ||");
const expected = { accountNumber: '123', clubLabel: 'Synthetic club' };
type Saved = { count: number; writes: number };

export default function AndroidNetworkProof() {
  const web = useRef<WebView>(null), db = useRef<SQLite.SQLiteDatabase | null>(null);
  const active = useRef<string | null>(null), sequence = useRef(0);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [phase, setPhase] = useState('STARTING'), [loaded, setLoaded] = useState(false);
  const read = async () => {
    const row = await db.current!.getFirstAsync<Saved>('SELECT count, writes FROM snapshot WHERE id = 1');
    if (!row) throw new Error('MISSING_SYNTHETIC_SNAPSHOT');
    setSaved(row); return row;
  };
  useEffect(() => {
    let disposed = false;
    void (async () => {
      const connection = await SQLite.openDatabaseAsync('synthetic-network-proof-v1.db');
      if (disposed) { await connection.closeAsync(); return; }
      db.current = connection;
      await connection.execAsync('CREATE TABLE IF NOT EXISTS snapshot (id INTEGER PRIMARY KEY CHECK(id=1), count INTEGER NOT NULL, writes INTEGER NOT NULL); INSERT OR IGNORE INTO snapshot VALUES (1, 20, 0);');
      await read(); setPhase('READY');
    })().catch(() => setPhase('FATAL'));
    return () => { disposed = true; active.current = null; void db.current?.closeAsync(); };
  }, []);
  const probe = () => {
    if (!loaded || active.current || !db.current) return;
    const nonce = 'network-' + (++sequence.current); active.current = nonce;
    setPhase('RUNNING');
    web.current!.injectJavaScript(`(${networkReader})(${JSON.stringify(nonce)},${JSON.stringify(expected)});true;`);
  };
  const message = async (raw: string) => {
    const item: unknown = JSON.parse(raw);
    if (!item || typeof item !== 'object' || !('nonce' in item) || item.nonce !== active.current) return;
    active.current = null;
    try {
      const result = decodeActivityProbe(item);
      const flight = result.sources.find(source => source.source === 'flights');
      if (result.sources.length !== 2 || !flight) throw new Error('INCOMPLETE');
      await db.current!.runAsync('UPDATE snapshot SET count = ?, writes = writes + 1 WHERE id = 1', flight.markers.count!);
      await read(); setPhase('SUCCESS');
    } catch {
      await read(); setPhase('FAILED');
    }
  };
  return <View style={{ flex: 1, padding: 24 }}>
    <Text>Synthetic Android network proof</Text>
    <Text>{phase + ':SAVED=' + (saved?.count ?? '?') + ':WRITES=' + (saved?.writes ?? '?')}</Text>
    <Text>{loaded ? 'DOCUMENT_READY' : 'DOCUMENT_UNAVAILABLE'}</Text>
    <Button title="PROBE" disabled={!saved || !loaded || phase === 'RUNNING'} onPress={probe} />
    <Button title="RELOAD FIXTURE" disabled={phase === 'RUNNING'} onPress={() => web.current?.reload()} />
    <WebView ref={web} source={{ uri: profile }} style={{ flex: 1 }}
      originWhitelist={[NETWORK_ORIGIN]} cacheEnabled={false} cacheMode="LOAD_NO_CACHE"
      webviewDebuggingEnabled={false} mixedContentMode="never" thirdPartyCookiesEnabled={false}
      onShouldStartLoadWithRequest={request => request.url === profile}
      onLoadStart={() => setLoaded(false)} onLoadEnd={() => setLoaded(true)}
      onError={() => setLoaded(false)} onHttpError={() => setLoaded(false)}
      onMessage={event => { void message(event.nativeEvent.data).catch(() => setPhase('FATAL')); }} />
  </View>;
}

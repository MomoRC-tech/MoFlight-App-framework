import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { nextStartBoundary, readReminderSnooze, type ReminderSnooze } from './start-clock';

export function useStartClock(deadlines: readonly number[]) {
  const [, setNow] = useState(Date.now);
  // Provider observations can arrive between timer ticks. Use this render's
  // wall clock so a new proof is not mistaken for a future timestamp.
  const now = Date.now();
  const boundary = nextStartBoundary(now, deadlines);
  useEffect(() => {
    const timer = setTimeout(() => setNow(Date.now()), Math.max(1, boundary - Date.now()));
    const listener = AppState.addEventListener('change', state => { if (state === 'active') setNow(Date.now()); });
    return () => { clearTimeout(timer); listener.remove(); };
  }, [boundary]);
  return now;
}

/** Device-local preference only; no credentials or provider calls. */
export function useReminderSnooze(scopeKey: string | null) {
  const [snooze, setSnooze] = useState<ReminderSnooze | null>(null);
  const [error, setError] = useState(false);
  const current = useRef(scopeKey); current.current = scopeKey;
  const revision = useRef(0);
  const key = async (scope: string) => 'moflight-start-reminder.' + await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, scope);
  useEffect(() => {
    const request = ++revision.current;
    setSnooze(null); setError(false);
    if (scopeKey === null) return;
    void (async () => {
      try {
        const value = await SecureStore.getItemAsync(await key(scopeKey));
        if (current.current !== scopeKey || revision.current !== request) return;
        setSnooze(value ? readReminderSnooze(JSON.parse(value), scopeKey) : null);
      } catch { if (current.current === scopeKey && revision.current === request) setError(true); }
    })();
    return () => { revision.current++; };
  }, [scopeKey]);
  function save(scope: string, until: string) {
    if (scope !== current.current) return;
    const record = readReminderSnooze({ scopeKey: scope, until }, scope);
    if (!record) return;
    const request = ++revision.current;
    void (async () => {
      try {
        await SecureStore.setItemAsync(await key(scope), JSON.stringify(record));
        if (current.current === scope && revision.current === request) { setSnooze(record); setError(false); }
      } catch { if (current.current === scope && revision.current === request) setError(true); }
    })();
  }
  return { snooze: snooze?.scopeKey === scopeKey ? snooze : null, error, save };
}

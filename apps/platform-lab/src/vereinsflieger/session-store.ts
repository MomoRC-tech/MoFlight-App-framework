import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDriver } from '../storage';

interface SessionModule {
  clearAsync(): Promise<{ cookiesEmpty: boolean; webStorageDeletionRequested: boolean }>;
  syntheticProofAsync(): Promise<{ passed: boolean; cookie: boolean; localStorage: boolean; sessionStorage: boolean; indexedDB: boolean; documentRecreated: boolean }>;
}
const native = Platform.OS === 'android' ? requireOptionalNativeModule<SessionModule>('MoFlightProviderSession') : null;
// Enable only after the committed-source synthetic native proof is recorded.
const ANDROID_CLEARING_PROVED = false;
export const sessionClearingAvailable = !!native && ANDROID_CLEARING_PROVED;
export const sessionProofAvailable = !!native;
export async function clearProviderStore(): Promise<void> {
  if (!native || !ANDROID_CLEARING_PROVED) throw new Error('Local WebView clearing unsupported.');
  const result = await native.clearAsync();
  if (!result.cookiesEmpty || !result.webStorageDeletionRequested) throw new Error('Local WebView clearing unconfirmed.');
}

/** Native side refuses every device except the named synthetic AVD. */
export async function proveSyntheticStore(): Promise<boolean> {
  if (!native) return false;
  const key = `moflight-synthetic-session-proof-${Crypto.randomUUID()}`;
  const db = await openDriver('moflight-synthetic-session-proof.sqlite');
  try {
    await db.exec('CREATE TABLE IF NOT EXISTS sentinels(id TEXT PRIMARY KEY, value TEXT NOT NULL)');
    await db.run('INSERT INTO sentinels(id,value) VALUES (?,?)', key, 'synthetic');
    await SecureStore.setItemAsync(key, 'synthetic');
    const result = await native.syntheticProofAsync();
    const row = await db.first<{ value: string }>('SELECT value FROM sentinels WHERE id=?', key);
    return result.passed && result.cookie && result.localStorage && result.sessionStorage && result.indexedDB && result.documentRecreated &&
      row?.value === 'synthetic' && await SecureStore.getItemAsync(key) === 'synthetic';
  } finally {
    await db.run('DELETE FROM sentinels WHERE id=?', key);
    await db.close();
    await SecureStore.deleteItemAsync(key);
  }
}

import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { openDriver } from '../storage';
import { parseLegacyReview, type LegacyReview } from './legacy-review';
import { validateFingerprint, validateLegacyPayload } from './legacy-recovery-store';

interface SessionModule {
  legacyRecoveryStateAsync?(): Promise<unknown>;
  readReviewedRecoveryAsync?(fingerprint: string): Promise<unknown>;
  reviewLegacyRecoveryAsync?(): Promise<unknown>;
  clearAsync(): Promise<{ cookiesEmpty: boolean; webStorageDeletionRequested: boolean }>;
  syntheticProofAsync(): Promise<{ passed: boolean; cookie: boolean; localStorage: boolean; sessionStorage: boolean; indexedDB: boolean; documentRecreated: boolean }>;
}
const native = Platform.OS === 'android' ? requireOptionalNativeModule<SessionModule>('MoFlightProviderSession') : null;
// Enable only after the committed-source synthetic native proof is recorded.
// API 37 synthetic native proof on c272380, 2026-10-17; see verification report.
const ANDROID_CLEARING_PROVED = true;
export const sessionClearingAvailable = !!native && ANDROID_CLEARING_PROVED;
export const sessionProofAvailable = !!native;
export const legacyReviewAvailable = typeof native?.reviewLegacyRecoveryAsync === 'function';
export const legacyRecoveryAvailable = typeof native?.legacyRecoveryStateAsync === 'function' && typeof native?.readReviewedRecoveryAsync === 'function';
export async function legacyRecoveryFingerprint(): Promise<string | null> {
  if (!native?.legacyRecoveryStateAsync) throw new Error('Legacy recovery unavailable.');
  const value = await native.legacyRecoveryStateAsync();
  return value === null ? null : validateFingerprint(value as string);
}
export async function readReviewedRecovery(fingerprint: string) {
  if (!native?.readReviewedRecoveryAsync) throw new Error('Legacy recovery unavailable.');
  validateFingerprint(fingerprint);
  const payload = await native.readReviewedRecoveryAsync(fingerprint);
  if (typeof payload !== 'string') throw new Error('Legacy recovery unavailable.');
  return validateLegacyPayload(payload, fingerprint, text => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text));
}
export async function reviewLegacyRecovery(): Promise<LegacyReview> {
  if (!native?.reviewLegacyRecoveryAsync) throw new Error('Legacy review unavailable.');
  return parseLegacyReview(await native.reviewLegacyRecoveryAsync());
}
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

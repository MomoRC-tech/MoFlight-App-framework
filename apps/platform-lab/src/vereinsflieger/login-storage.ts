import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import { validateLogin, type SavedLogin } from './login';

const key = 'vereinsflieger.saved-login.v1';
const options: SecureStore.SecureStoreOptions = {
  keychainService: 'de.momorc.moflight.lab.vereinsflieger-login',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false,
};
let ready: Promise<void> | null = null;
function initialize(): Promise<void> {
  if (!ready) ready = (async () => {
    if (!await SecureStore.isAvailableAsync()) throw new Error('Protected device storage unavailable.');
    // iOS Keychain may survive uninstall. An app-sandbox marker prevents reuse
    // of a previous installation's login. It contains no credentials.
    const marker = new File(Paths.document, 'vereinsflieger-login-install-v1');
    if (!marker.exists) {
      await SecureStore.deleteItemAsync(key, options);
      marker.create(); marker.write('1');
    }
  })().catch(error => { ready = null; throw error; });
  return ready;
}
export async function readSavedLogin(): Promise<SavedLogin | null> {
  await initialize();
  const value = await SecureStore.getItemAsync(key, options);
  if (!value) return null;
  try { return validateLogin(JSON.parse(value) as SavedLogin); }
  catch { throw new Error('Saved login cannot be used. Forget it and save it again.'); }
}
export async function writeSavedLogin(login: SavedLogin): Promise<void> {
  const checked = validateLogin(login);
  await initialize();
  await SecureStore.setItemAsync(key, JSON.stringify(checked), options);
}
export async function forgetSavedLogin(): Promise<void> {
  await initialize();
  await SecureStore.deleteItemAsync(key, options);
}

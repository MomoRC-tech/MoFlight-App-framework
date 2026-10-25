import * as SecureStore from 'expo-secure-store';
import { HELP_CONTENT_VERSION } from './help-catalog';

// Generic installation preference. It contains no account, book or flight data.
const key = `moflight-help-flights-v${HELP_CONTENT_VERSION}`;
const enabledKey = 'moflight-context-help-enabled';

export async function readContextHelpEnabled(): Promise<boolean> {
  try { return (await SecureStore.getItemAsync(enabledKey)) !== 'off'; }
  catch { return false; } // Avoid showing prompts before the setting can be read.
}

export async function saveContextHelpEnabled(enabled: boolean): Promise<boolean> {
  try { await SecureStore.setItemAsync(enabledKey, enabled ? 'on' : 'off'); return true; }
  catch { return false; }
}

export async function hasSeenFlightHelpHint(): Promise<boolean> {
  try { return await SecureStore.getItemAsync(key) === 'seen'; }
  catch { return true; } // Keep help available manually without repeatedly interrupting the user.
}

export async function markFlightHelpHintSeen(): Promise<void> {
  try { await SecureStore.setItemAsync(key, 'seen'); }
  catch { /* An installation preference must never block the flight library. */ }
}

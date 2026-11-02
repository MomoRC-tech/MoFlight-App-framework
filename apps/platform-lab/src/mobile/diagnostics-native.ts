import { File, Paths } from 'expo-file-system';
import { writeAsStringAsync } from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Crypto from 'expo-crypto';
import { version } from '../../package.json';
import { diagnosticJournal, DIAGNOSTIC_FILE_BYTES, utf8Bytes } from '../diagnostics';
import { connectProcessExitDiagnostics, type ProcessExitNative } from './process-exit-coordinator';

const journalFile = () => new File(Paths.document, 'moflight-support-diagnostics-v1.json');
const exportFile = () => new File(Paths.document, 'moflight-support-report.json');
let exporting = false;
let initialized = false;

export function initializeDiagnostics() {
  if(initialized)return;
  initialized=true;
  try {
  const file = journalFile();
  // Old managed exports are disposable. No third file is created during writes.
  const old = exportFile(); if (old.exists) old.delete();
  diagnosticJournal.connect({
    read: () => { if (!file.exists) return null; if (file.size > DIAGNOSTIC_FILE_BYTES) { file.delete(); return null; } return file.textSync(); },
    write: async text => { if (utf8Bytes(text) > DIAGNOSTIC_FILE_BYTES) throw new Error('Diagnostic storage limit'); await writeAsStringAsync(file.uri,text); },
    clearExport: () => { const exported = exportFile(); if (exported.exists) exported.delete(); },
  });
  } catch { diagnosticJournal.storageFailed=true; }
  diagnosticJournal.setContext({ appVersion: version, buildSource:process.env.EXPO_PUBLIC_MOFLIGHT_SOURCE, platform: Platform.OS, androidApi: Platform.OS === 'android' ? Platform.Version : undefined, buildMode: __DEV__ ? 'development' : 'release' });
  if (Platform.OS === 'android') {
    try {
      connectProcessExitDiagnostics(diagnosticJournal,requireOptionalNativeModule<ProcessExitNative>('MoFlightSupportDiagnostics'),
        ()=>Array.from(Crypto.getRandomBytes(16),byte=>byte.toString(16).padStart(2,'0')).join(''));
    } catch { /* Optional local diagnostics never gate app access. */ }
    const native = requireOptionalNativeModule<{ diagnosticContextAsync?: () => Promise<unknown> }>('MoFlightProviderSession');
    void native?.diagnosticContextAsync?.().then(context => diagnosticJournal.setContext(context)).catch(() => { /* Metadata is optional, never an admission gate. */ });
  }
}

export async function shareDiagnosticFile() {
  if (exporting) return;
  exporting = true;
  const generation=diagnosticJournal.clearVersion;
  try {
    if (!await Sharing.isAvailableAsync()) throw new Error('Sharing unavailable');
    await diagnosticJournal.flush();
    if(generation!==diagnosticJournal.clearVersion)return;
    const text = diagnosticJournal.export(); if (utf8Bytes(text) > DIAGNOSTIC_FILE_BYTES) throw new Error('Diagnostic export limit');
    const file = exportFile(); await writeAsStringAsync(file.uri,text);
    if(generation!==diagnosticJournal.clearVersion){if(file.exists)file.delete();return;}
    await Sharing.shareAsync(file.uri,{ mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'MoFlight Diagnosebericht' });
  } finally { exporting = false; }
}

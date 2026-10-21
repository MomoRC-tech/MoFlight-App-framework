import { File, Paths } from 'expo-file-system';
import { diagnosticJournal } from '../diagnostics';

export function initializeDiagnostics() {
  const file = new File(Paths.document, 'moflight-support-diagnostics-v1.json');
  diagnosticJournal.connect({
    read: () => { if (!file.exists) return null; if (file.size > 65536) throw new Error('Oversize journal'); return file.textSync(); },
    write: text => file.write(text),
  });
}

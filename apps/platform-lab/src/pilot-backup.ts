import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import type { PilotBooks } from '../../../packages/local-data/src/books';
import { openBooks, rememberLibrary, rememberedBook, rememberBook } from './book-storage';

/** Existing pilot-proof format only. Provider captures, credentials and profile are separate. */
export async function sharePilotBackup(library: PilotBooks) {
  const text = await library.backup();
  const file = new File(Paths.document, `pilot-backup-${Crypto.randomUUID()}.json`);
  file.create(); file.write(text);
  const available = await Sharing.isAvailableAsync();
  if (available) await Sharing.shareAsync(file.uri, { mimeType: 'application/json' });
  // A completed share sheet does not establish that an external file was saved.
  return available ? 'prepared' as const : 'sharing-unavailable' as const;
}

export async function savePilotBackupToFolder(library: PilotBooks) {
  const permission = await StorageAccessFramework.requestDirectoryPermissionsAsync(StorageAccessFramework.getUriForDirectoryInRoot('Documents'));
  if (!permission.granted) return 'cancelled' as const;
  const text = await library.backup();
  const uri = await StorageAccessFramework.createFileAsync(permission.directoryUri, `moflight-pilot-backup-${Crypto.randomUUID()}`, 'application/json');
  await StorageAccessFramework.writeAsStringAsync(uri, text);
  if (await StorageAccessFramework.readAsStringAsync(uri) !== text) throw new Error('External pilot backup verification failed');
  return 'saved' as const;
}

export async function restorePilotBackup(current: PilotBooks) {
  const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
  if (picked.canceled) return { state: 'cancelled' as const };
  const asset = picked.assets[0]!;
  if ((asset.size ?? 0) > 2_000_000) throw new Error('Pilot backup too large');
  const text = await new File(asset.uri).text();
  const name = `pilot-restore-${Crypto.randomUUID()}.sqlite`;
  const next = await openBooks(name);
  try {
    await next.restore(text);
    const books = await next.books();
    for (const book of books) { await next.history(book.id); await next.snapshots(book.id); }
    const previousBook = await rememberedBook(current);
    const bookId = books.find(book => book.id === previousBook)?.id ?? books[0]?.id ?? null;
    if (bookId) await rememberBook(next, bookId);
    // Publish only after all readers and the chosen book are valid. The pointer
    // commit is the last fallible step; the previous library is never replaced.
    await rememberLibrary(name);
    return { state: 'restored' as const, library: next, books, bookId };
  } catch (error) {
    await next.db.close().catch(() => {});
    throw error;
  }
}

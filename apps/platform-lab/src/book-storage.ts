import { PilotBooks } from '../../../packages/local-data/src/books';
import { openDriver, hash } from './storage';
import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
export const PILOT = 'synthetic-pilot';
const validName = (s: string) => { if (!/^(pilot-synthetic-v1|pilot-restore-[0-9a-f-]{36})\.sqlite$/.test(s)) throw new Error('Invalid pilot library path'); };
export async function openBooks(name: string) { validName(name); const db = await openDriver(name), lib = new PilotBooks(db, PILOT, hash); try { await lib.initialize(); return lib; } catch (e) { await db.close(); throw e; } }
async function pointer() { const db = await openDriver('moflight-pilot-selection.sqlite'); try { await db.exec('PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS library_selection(seq INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL);'); return db; } catch (e) { await db.close(); throw e; } }
export async function rememberLibrary(name: string) { validName(name); const db = await pointer(); try { await db.transaction(tx => tx.run('INSERT INTO library_selection(name) VALUES (?)', name)); } finally { await db.close(); } }
export async function loadBooks() {
  const db = await pointer(); let choices: string[];
  try { choices = (await db.all<{name: string}>('SELECT name FROM library_selection ORDER BY seq DESC')).map(r => r.name); } finally { await db.close(); }
  if (!choices.length) choices = ['pilot-synthetic-v1.sqlite'];
  for (const name of [...new Set(choices)]) { let lib: PilotBooks | undefined; try { validName(name); if (name.startsWith('pilot-restore-') && !new File(SQLite.defaultDatabaseDirectory.startsWith('file:') ? SQLite.defaultDatabaseDirectory : 'file://' + SQLite.defaultDatabaseDirectory, name).exists) continue; lib = await openBooks(name); for (const b of await lib.books()) { await lib.history(b.id); await lib.snapshots(b.id); } return { lib, name }; } catch { await lib?.db.close(); } }
  throw new Error('No readable pilot library; databases preserved');
}

export async function rememberedBook(lib: PilotBooks) {
  await lib.db.exec('CREATE TABLE IF NOT EXISTS lab_book_selection(id INTEGER PRIMARY KEY CHECK(id=1), book_id TEXT NOT NULL);');
  return (await lib.db.first<{book_id: string}>('SELECT book_id FROM lab_book_selection WHERE id=1'))?.book_id ?? (await lib.books())[0]?.id ?? 'gliding-a';
}
export async function rememberBook(lib: PilotBooks, id: string) { await lib.book(id); await rememberedBook(lib); await lib.db.transaction(tx => tx.run('INSERT INTO lab_book_selection VALUES (1,?) ON CONFLICT(id) DO UPDATE SET book_id=excluded.book_id', id)); }

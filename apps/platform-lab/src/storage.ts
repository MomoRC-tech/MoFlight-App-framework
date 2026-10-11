import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { LocalLogbook, type Driver, type Connection, type Bind } from '@moflight/local-data';
import { persistSelection, selectionCandidates, SELECTION_SCHEMA, validateSelection, type Selection } from './selection-store';
export { validateSelection, type Selection } from './selection-store';

function connection(db: SQLite.SQLiteDatabase): Connection {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, ...params: Bind[]) => { await db.runAsync(sql, ...params); },
    all: <T>(sql: string, ...params: Bind[]) => db.getAllAsync<T>(sql, ...params),
    first: <T>(sql: string, ...params: Bind[]) => db.getFirstAsync<T>(sql, ...params),
  };
}
export async function openDriver(name: string): Promise<Driver> {
  const db = await SQLite.openDatabaseAsync(name);
  return { ...connection(db), close: () => db.closeAsync(), transaction: work => db.withExclusiveTransactionAsync(async tx => { await work(connection(tx)); }) };
}
export const hash = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
const selected = new File(Paths.document, 'moflight-lab-selection.json');
async function selectionDatabase(): Promise<Driver> {
  const db = await SQLite.openDatabaseAsync('moflight-selection-journal.sqlite');
  const driver: Driver = { ...connection(db), close: () => db.closeAsync(),
    transaction: work => db.withExclusiveTransactionAsync(async tx => { await work(connection(tx)); }) };
  try { await db.execAsync('PRAGMA synchronous=FULL; ' + SELECTION_SCHEMA); return driver; }
  catch (e) { await driver.close(); throw e; }
}
export async function loadSelections(): Promise<Selection[]> {
  const db = await selectionDatabase();
  try {
    const committed = await selectionCandidates(db);
    if (selected.exists) {
      try { const legacy: unknown = JSON.parse(await selected.text()); validateSelection(legacy); if (!committed.some(s => s.databaseName === legacy.databaseName)) committed.push(legacy); }
      catch { if (!committed.length) throw new Error('Legacy selection is unreadable; preserved for recovery'); }
    }
    if (committed.length) {
      const readablePaths=committed.filter(s=>new File(SQLite.defaultDatabaseDirectory,s.databaseName).exists);
      if(!readablePaths.length)throw new Error('Selected databases are missing; selection evidence preserved');
      return readablePaths;
    }
    return [{ datasetId: 'synthetic-lab-a', databaseName: 'lab-a.sqlite' }];
  } finally { await db.close(); }
}
export async function saveSelection(s: Selection): Promise<void> {
  const db = await selectionDatabase();
  try { await persistSelection(db, s); } finally { await db.close(); }
}
export async function open(s: Selection): Promise<LocalLogbook> {
  validateSelection(s);
  const db = await SQLite.openDatabaseAsync(s.databaseName);
  const driver: Driver = { ...connection(db), close: () => db.closeAsync(),
    transaction: work => db.withExclusiveTransactionAsync(async tx => { await work(connection(tx)); }) };
  const repo = new LocalLogbook(driver, s.datasetId, hash);
  try { await repo.initialize(); return repo; }
  catch (e) { await driver.close(); throw e; }
}

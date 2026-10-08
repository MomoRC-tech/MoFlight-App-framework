import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { LocalLogbook, type Driver, type Connection, type Bind } from '@moflight/local-data';

function connection(db: SQLite.SQLiteDatabase): Connection {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, ...params: Bind[]) => { await db.runAsync(sql, ...params); },
    all: <T>(sql: string, ...params: Bind[]) => db.getAllAsync<T>(sql, ...params),
    first: <T>(sql: string, ...params: Bind[]) => db.getFirstAsync<T>(sql, ...params),
  };
}
export const hash = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
export interface Selection { datasetId: string; databaseName: string }
const selected = new File(Paths.document, 'moflight-lab-selection.json');
export function validateSelection(s: Selection): void {
  if (!['synthetic-lab-a', 'synthetic-lab-b'].includes(s.datasetId) || !/^(lab-[ab]|restore-[0-9a-f-]{36})\.sqlite$/.test(s.databaseName)) throw new Error('Invalid lab dataset selection');
  if (s.databaseName.startsWith('lab-') && s.databaseName !== `lab-${s.datasetId.endsWith('a') ? 'a' : 'b'}.sqlite`) throw new Error('Dataset/path mismatch');
}
export async function loadSelection(): Promise<Selection> {
  const s = selected.exists ? JSON.parse(await selected.text()) as Selection : { datasetId: 'synthetic-lab-a', databaseName: 'lab-a.sqlite' };
  validateSelection(s); return s;
}
export function saveSelection(s: Selection): void {
  validateSelection(s);
  if (!selected.exists) selected.create();
  selected.write(JSON.stringify(s));
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

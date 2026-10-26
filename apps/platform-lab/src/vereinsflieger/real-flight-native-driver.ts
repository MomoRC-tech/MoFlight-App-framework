import { diagnoseLocalDriver } from '../local-read-diagnostics';
import type { Bind, Connection, Driver } from '@moflight/local-data';

export interface RealFlightNativeDatabase {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, ...params: Bind[]): Promise<unknown>;
  getAllAsync<T>(sql: string, ...params: Bind[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: Bind[]): Promise<T | null>;
  closeAsync(): Promise<void>;
}
export interface RealFlightNativeDatabaseOptions { useNewConnection?: boolean }
export type RealFlightNativeDatabaseOpener =
  (name: string, options?: RealFlightNativeDatabaseOptions) => Promise<RealFlightNativeDatabase>;

// Independent handles still contend for the same SQLite file. Include setup,
// root reads and close, not only BEGIN, in the same file's operation queue.
// Only scheduling is shared: connections, leases and validation stay private.
const databaseWork = new Map<string, Promise<void>>();
function serialize<T>(name: string, work: () => Promise<T>, observeWait?: () => (success: boolean) => void): Promise<T> {
  const preceding=databaseWork.get(name),endWait=preceding?observeWait?.():undefined;
  const result = (preceding ?? Promise.resolve()).then(()=>{endWait?.(true);return work();});
  const settled = result.then(() => {}, () => {});
  databaseWork.set(name, settled);
  void settled.then(() => {
    if (databaseWork.get(name) === settled) databaseWork.delete(name);
  });
  return result;
}

function connection(db: RealFlightNativeDatabase, allowed: () => void): Connection {
  return {
    exec: async sql => { allowed(); await db.execAsync(sql); },
    run: async (sql, ...params: Bind[]) => { allowed(); await db.runAsync(sql, ...params); },
    all: async <T>(sql: string, ...params: Bind[]) => { allowed(); return db.getAllAsync<T>(sql, ...params); },
    first: async <T>(sql: string, ...params: Bind[]) => { allowed(); return db.getFirstAsync<T>(sql, ...params); },
  };
}

async function configure(db: RealFlightNativeDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL;');
  const foreignKeys = await db.getFirstAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
  const synchronous = await db.getFirstAsync<{ synchronous: number }>('PRAGMA synchronous');
  if (foreignKeys?.foreign_keys !== 1 || synchronous?.synchronous !== 2) {
    throw new Error('Unsafe real flight SQLite connection.');
  }
}

/**
 * Opens an owner-scoped native database driver whose transaction connection
 * is configured independently before every BEGIN. Serial transactions reuse
 * this driver's connection; failures discard it and close drains accepted work.
 * Same-file operations across drivers serialize without sharing connection or
 * authorization state. Transaction callbacks must use their supplied connection.
 */
export async function openRealFlightNativeDriver(name: string, openDatabase: RealFlightNativeDatabaseOpener, observeWait?: () => (success: boolean) => void): Promise<Driver> {
  // Expo's default cache can share the underlying root with another driver.
  // Each driver closes its own handles; closing a concurrent inspector must
  // never invalidate a retained selection's root connection.
  const db = await serialize(name, async () => {
    const opened = await openDatabase(name, { useNewConnection: true });
    try { await configure(opened); return opened; }
    catch (error) {
      try { await opened.closeAsync(); } catch { /* Preserve the original connection setup failure. */ }
      throw error;
    }
  },observeWait);
  let transactionDb: RealFlightNativeDatabase | null = null;
  let closing: Promise<void> | null = null;
  function allowed() { if (closing) throw new Error('Real flight SQLite driver closed.'); }
  async function schedule<T>(work: () => Promise<T>): Promise<T> {
    allowed();
    return serialize(name, work, observeWait);
  }
  async function discardTransaction() {
    const current = transactionDb;
    transactionDb = null;
    await current?.closeAsync();
  }
  return diagnoseLocalDriver({
    exec: sql => schedule(() => db.execAsync(sql)),
    run: (sql, ...params: Bind[]) => schedule(async () => { await db.runAsync(sql, ...params); }),
    all: <T>(sql: string, ...params: Bind[]) => schedule(() => db.getAllAsync<T>(sql, ...params)),
    first: <T>(sql: string, ...params: Bind[]) => schedule(() => db.getFirstAsync<T>(sql, ...params)),
    close: () => {
      closing ??= serialize(name, async () => {
        try { await discardTransaction(); }
        finally { await db.closeAsync(); }
      },observeWait);
      return closing;
    },
    transaction: async work => {
      return schedule(async () => {
        let began = false;
        try {
          transactionDb ??= await openDatabase(name, { useNewConnection: true });
          await configure(transactionDb);
          await transactionDb.execAsync('BEGIN EXCLUSIVE TRANSACTION');
          began = true;
          let active = true;
          try {
            await work(connection(transactionDb, () => { if (!active) throw new Error('Real flight SQLite transaction ended.'); }));
          } finally { active = false; }
          await transactionDb.execAsync('COMMIT');
          began = false;
        } catch (error) {
          if (began) {
            try { await transactionDb?.execAsync('ROLLBACK'); } catch { /* Preserve the original or indeterminate commit failure. */ }
          }
          try { await discardTransaction(); } catch { /* Failed handles are never reused; preserve the operation error. */ }
          throw error;
        }
      });
    },
  }, 'real-flight');
}

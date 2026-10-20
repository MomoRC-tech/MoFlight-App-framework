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
 * No connection or authorization state is shared between drivers.
 */
export async function openRealFlightNativeDriver(name: string, openDatabase: RealFlightNativeDatabaseOpener): Promise<Driver> {
  const db = await openDatabase(name);
  try {
    await configure(db);
    let transactionDb: RealFlightNativeDatabase | null = null;
    let pending: Promise<void> = Promise.resolve();
    let closing: Promise<void> | null = null;
    function allowed() { if (closing) throw new Error('Real flight SQLite driver closed.'); }
    async function discardTransaction() {
      const current = transactionDb;
      transactionDb = null;
      await current?.closeAsync();
    }
    return {
      ...connection(db, allowed),
      close: () => {
        closing ??= pending.then(async () => {
          try { await discardTransaction(); }
          finally { await db.closeAsync(); }
        });
        return closing;
      },
      transaction: async work => {
        allowed();
        const result = pending.then(async () => {
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
        pending = result.catch(() => {});
        return result;
      },
    };
  } catch (error) {
    try { await db.closeAsync(); } catch { /* Preserve the original connection setup failure. */ }
    throw error;
  }
}

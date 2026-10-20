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

function connection(db: RealFlightNativeDatabase): Connection {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, ...params: Bind[]) => { await db.runAsync(sql, ...params); },
    all: <T>(sql: string, ...params: Bind[]) => db.getAllAsync<T>(sql, ...params),
    first: <T>(sql: string, ...params: Bind[]) => db.getFirstAsync<T>(sql, ...params),
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
 * is configured independently before BEGIN. Expo's exclusive transaction
 * connection does not inherit connection-local PRAGMAs from the opener.
 */
export async function openRealFlightNativeDriver(name: string, openDatabase: RealFlightNativeDatabaseOpener): Promise<Driver> {
  const db = await openDatabase(name);
  try {
    await configure(db);
    return {
      ...connection(db),
      close: () => db.closeAsync(),
      transaction: async work => {
        const transactionDb = await openDatabase(name, { useNewConnection: true });
        let began = false;
        try {
          await configure(transactionDb);
          await transactionDb.execAsync('BEGIN EXCLUSIVE TRANSACTION');
          began = true;
          await work(connection(transactionDb));
          await transactionDb.execAsync('COMMIT');
          began = false;
        } catch (error) {
          if (began) {
            try { await transactionDb.execAsync('ROLLBACK'); } catch { /* Preserve the original or indeterminate commit failure. */ }
          }
          throw error;
        } finally {
          await transactionDb.closeAsync();
        }
      },
    };
  } catch (error) {
    try { await db.closeAsync(); } catch { /* Preserve the original connection setup failure. */ }
    throw error;
  }
}

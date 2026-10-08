// Node's real SQLite is a test runner adapter only, never shipped in the app.
import { DatabaseSync } from 'node:sqlite';
import type { Driver, Connection, Bind } from '../../packages/local-data/src/index.ts';
export function nodeDriver(path: string): Driver {
  const db = new DatabaseSync(path);
  const sql: Connection = {
    exec: async text => { db.exec(text); },
    run: async (text, ...params: Bind[]) => { db.prepare(text).run(...params); },
    all: async <T>(text: string, ...params: Bind[]) => db.prepare(text).all(...params) as T[],
    first: async <T>(text: string, ...params: Bind[]) => (db.prepare(text).get(...params) ?? null) as T | null,
  };
  return { ...sql, close: async () => { db.close(); }, transaction: async work => {
    db.exec('BEGIN IMMEDIATE');
    try { await work(sql); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  } };
}

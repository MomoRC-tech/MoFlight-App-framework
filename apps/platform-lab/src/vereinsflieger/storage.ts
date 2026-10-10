import * as SQLite from 'expo-sqlite';
import type { ProbeSnapshot } from './probe';

// Separate database: captures cannot change synthetic history, decisions or backups.
async function database() {
  const db = await SQLite.openDatabaseAsync('vereinsflieger-access-probe.sqlite');
  await db.execAsync('CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, retrieved_at TEXT NOT NULL, payload TEXT NOT NULL)');
  return db;
}
export async function saveCapture(snapshot: ProbeSnapshot): Promise<void> {
  const db = await database();
  try { await db.runAsync('INSERT INTO captures (id, retrieved_at, payload) VALUES (?, ?, ?)', snapshot.captureId, snapshot.retrievedAt, JSON.stringify(snapshot)); }
  finally { await db.closeAsync(); }
}
export async function latestCapture(): Promise<ProbeSnapshot | null> {
  const db = await database();
  try { const row = await db.getFirstAsync<{ payload: string }>('SELECT payload FROM captures ORDER BY retrieved_at DESC, rowid DESC LIMIT 1'); return row ? JSON.parse(row.payload) as ProbeSnapshot : null; }
  finally { await db.closeAsync(); }
}

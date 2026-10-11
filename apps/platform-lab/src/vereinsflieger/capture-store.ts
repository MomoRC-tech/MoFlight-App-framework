import { canonical } from '@moflight/flight-logbook';
import type { Connection } from '@moflight/local-data';
import { validateCapture, type ProbeSnapshot } from './probe';

export const CAPTURE_SCHEMA = 'CREATE TABLE IF NOT EXISTS captures (id TEXT PRIMARY KEY, retrieved_at TEXT NOT NULL, payload TEXT NOT NULL)';
export async function persistCapture(db: Connection, input: unknown): Promise<void> {
  const snapshot = validateCapture(input), payload = canonical(snapshot);
  // A retry of the same capture is safe; never replace evidence for an existing ID.
  await db.run('INSERT INTO captures (id, retrieved_at, payload) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING', snapshot.captureId, snapshot.retrievedAt, payload);
  const row = await db.first<{ payload: string }>('SELECT payload FROM captures WHERE id=?', snapshot.captureId);
  if (!row || canonical(validateCapture(JSON.parse(row.payload))) !== payload) throw new Error('Capture identity conflict. Earlier evidence preserved.');
}
export async function readLatestCapture(db: Connection): Promise<ProbeSnapshot | null> {
  const row = await db.first<{ id: string; retrieved_at: string; payload: string }>('SELECT id, retrieved_at, payload FROM captures ORDER BY retrieved_at DESC, rowid DESC LIMIT 1');
  if (!row) return null;
  if (row.payload.length > 20_000_000) throw new Error('Oversized saved capture.');
  const snapshot = validateCapture(JSON.parse(row.payload));
  if (snapshot.captureId !== row.id || snapshot.retrievedAt !== row.retrieved_at) throw new Error('Saved capture identity mismatch.');
  return snapshot;
}

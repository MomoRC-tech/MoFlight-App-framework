import type { Driver } from '@moflight/local-data';
export interface Selection { datasetId: string; databaseName: string }
export function validateSelection(value: unknown): asserts value is Selection {
  if (!value || typeof value !== 'object') throw new Error('Invalid lab dataset selection');
  const s = value as Selection;
  if (!['synthetic-lab-a', 'synthetic-lab-b'].includes(s.datasetId) || typeof s.databaseName !== 'string' || !/^(lab-[ab]|restore-[0-9a-f-]{36})\.sqlite$/.test(s.databaseName)) throw new Error('Invalid lab dataset selection');
  if (s.databaseName.startsWith('lab-') && s.databaseName !== `lab-${s.datasetId.endsWith('a') ? 'a' : 'b'}.sqlite`) throw new Error('Dataset/path mismatch');
}
export const SELECTION_SCHEMA = `CREATE TABLE IF NOT EXISTS selections(seq INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL CHECK(json_valid(payload)));`;
export async function persistSelection(db: Driver, s: Selection): Promise<void> {
  validateSelection(s);
  await db.transaction(async tx => { const previous=await tx.first<{payload:string}>('SELECT payload FROM selections ORDER BY seq DESC LIMIT 1'); if(previous?.payload!==JSON.stringify(s)) await tx.run('INSERT INTO selections(payload) VALUES (?)', JSON.stringify(s)); });
}
export async function selectionCandidates(db: Driver): Promise<Selection[]> {
  const result: Selection[] = [];
  for (const row of await db.all<{ payload: string }>('SELECT payload FROM selections ORDER BY seq DESC')) {
    // A malformed entry does not discard older committed selections.
    try { const s: unknown = JSON.parse(row.payload); validateSelection(s); if (!result.some(x => x.databaseName === s.databaseName && x.datasetId === s.datasetId)) result.push(s); } catch { /* preserve corrupt evidence */ }
  }
  return result;
}

import type { Connection } from '../../../../packages/local-data/src/index';

// UI-only preferences in the selected synthetic library; excluded from flight/book backups.
async function prepare(db: Connection, owner: string) {
  if (!owner || (await db.first<{ id: string }>('SELECT id FROM pilot'))?.id !== owner) throw new Error('Foreign local profile');
  await db.exec('CREATE TABLE IF NOT EXISTS lab_ui_profile(owner TEXT PRIMARY KEY, display_name TEXT NOT NULL);');
}
export function normalizedDisplayName(value: string): string {
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length > 60 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Invalid display name');
  return name;
}
export async function readLocalDisplayName(db: Connection, owner: string): Promise<string> {
  await prepare(db, owner);
  return normalizedDisplayName((await db.first<{ display_name: string }>('SELECT display_name FROM lab_ui_profile WHERE owner=?', owner))?.display_name ?? '');
}
export async function saveLocalDisplayName(db: Connection, owner: string, value: string): Promise<string> {
  const name = normalizedDisplayName(value);
  await prepare(db, owner);
  await db.run('INSERT INTO lab_ui_profile(owner,display_name) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET display_name=excluded.display_name', owner, name);
  return name;
}

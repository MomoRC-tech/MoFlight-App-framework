import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import { hash, openDriver } from '../storage';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { FINANCIAL_PROOF_LIMITATION, reopenFinancialNativeProof, runFinancialNativeProof, type FinancialProofEnvironment, type FinancialProofReport } from './financial-native-proof';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const latest = new File(Paths.document, 'financial-native-proof-latest.json');
let running = false;
function write(file: File, text: string) {
  if (!file.exists) file.create({ overwrite: false, intermediates: true });
  file.write(text);
}
function environment(id: string, gate: () => Promise<void>): FinancialProofEnvironment {
  if (!uuid.test(id)) throw Error('Invalid synthetic financial run.');
  const prefix = `financial-proof-${id}-`;
  const checked = (name: string) => { if (!/^[a-zA-Z0-9_.-]{1,180}$/.test(name) || name.includes('..')) throw Error('Invalid synthetic financial filename.'); return prefix + name; };
  const dbFile = (name: string) => new File(SQLite.defaultDatabaseDirectory.startsWith('file:') ? SQLite.defaultDatabaseDirectory : 'file://' + SQLite.defaultDatabaseDirectory, checked(name));
  const textFile = (name: string) => new File(Paths.document, checked(name));
  return { id, hash, uuid: Crypto.randomUUID, clock: () => performance.now(),
    exists: name => dbFile(name).exists,
    reserve(name) { const f = dbFile(name); if (!f.exists) { f.create({ overwrite: false, intermediates: true }); if (!f.exists) throw Error('Synthetic financial reservation failed.'); } },
    async open(name, create) {
      await gate(); const f = dbFile(name);
      if (!f.exists && !create) return null;
      if (!f.exists) f.create({ overwrite: false, intermediates: true });
      const db = await openDriver(checked(name));
      try { await db.exec('PRAGMA synchronous=FULL;'); await gate(); return db; } catch (error) { await db.close(); throw error; }
    },
    async read(name) { await gate(); const f = textFile(name); return f.exists ? f.text() : null; },
    async write(name, text) { await gate(); const f = textFile(name); write(f, text); if (await f.text() !== text) throw Error('Synthetic financial text readback failed.'); await gate(); },
  };
}
function log(report: FinancialProofReport, kind: 'run' | 'reopen') {
  console.info('MOFLIGHT_FINANCIAL_PROOF_SUMMARY', JSON.stringify({ kind, id: report.id, state: report.state, checks: report.checks.length }));
  for (const sample of report.samples) console.info('MOFLIGHT_FINANCIAL_PROOF_SAMPLE', JSON.stringify({ kind, id: report.id, ...sample }));
}
/** Explicit Development action only; fixed synthetic namespace, no provider/selected-user writes. */
export async function runFinancialNativeProofNative(active: () => boolean): Promise<FinancialProofReport> {
  if (running) throw Error('Financial native proof is already running.'); running = true;
  const gate = async () => { if (!active()) throw Error('Synthetic financial proof was interrupted.'); await assertNoPendingUserBackupRestore(); if (!active()) throw Error('Synthetic financial proof was interrupted.'); };
  const env = environment(Crypto.randomUUID(), gate);
  try {
    // Never reuse a previous run, even if a supplied/random ID collides.
    const reservation = new File(Paths.document, `financial-proof-${env.id}-reservation.json`);
    reservation.create({ overwrite: false, intermediates: true });
    reservation.write(JSON.stringify({ version: 1, id: env.id }));
    const report = await runFinancialNativeProof(env, gate);
    // Keep failure diagnostics as well, even if lifecycle authority was lost.
    write(new File(Paths.document, `financial-proof-${env.id}-report.json`), JSON.stringify(report));
    if (report.state === 'passed') { await gate(); write(latest, JSON.stringify({ version: 1, id: env.id })); }
    log(report, 'run'); return report;
  } finally { running = false; }
}
/** After actual process restart this reopens the preserved candidate/archive/journal, with no network. */
export async function reopenFinancialNativeProofNative(active: () => boolean): Promise<FinancialProofReport> {
  if (running) throw Error('Financial native proof is already running.'); running = true;
  const began = performance.now();
  let id = 'unavailable';
  const gate = async () => { if (!active()) throw Error('Synthetic financial reopen interrupted.'); await assertNoPendingUserBackupRestore(); };
  const report: FinancialProofReport = { version: 1, id, state: 'failed', checks: [], samples: [], limitation: FINANCIAL_PROOF_LIMITATION };
  try {
    await gate(); if (!latest.exists) throw Error('No synthetic financial run available.');
    const pointer = JSON.parse(await latest.text());
    if (pointer?.version !== 1 || !uuid.test(pointer.id) || Object.keys(pointer).sort().join(',') !== 'id,version') throw Error('Invalid synthetic financial pointer.');
    id = pointer.id; report.id = id;
    await reopenFinancialNativeProof(environment(id, gate), gate);
    report.state = 'passed'; report.checks.push('preserved native candidate/v4 archive/journal verified after reopen');
  } catch { /* Fixed, non-private failure report only. */ }
  finally { running = false; }
  report.samples.push({ stage: 'process-reopen', elapsedMs: Math.max(0, performance.now() - began), outcome: report.state });
  write(new File(Paths.document, `financial-proof-reopen-${Crypto.randomUUID()}.json`), JSON.stringify(report));
  log(report, 'reopen'); return report;
}

import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { openDriver } from '../storage';
import { FlightReviewStore } from './flight-review-store';
import { validateFlightReviewTarget, type FlightAcknowledgment, type FlightReviewTarget } from './flight-source-review';

let tail: Promise<unknown> = Promise.resolve();
async function withStore<T>(input: FlightReviewTarget, create: boolean, gate: () => Promise<void>, work: (store: FlightReviewStore) => Promise<T>): Promise<T | null> {
  const target = { ...input }; validateFlightReviewTarget(target);
  const run = async () => {
    await gate();
    const directory = SQLite.defaultDatabaseDirectory;
    const name = `moflight-flight-review-${target.ownerId}-${target.storeId}-${target.accountRef}.sqlite`;
    const exists = new File(directory.startsWith('file:') ? directory : `file://${directory}`, name).exists;
    if (!exists && !create) { await gate(); return null; }
    const db = await openDriver(name);
    try {
      await db.exec('PRAGMA synchronous=FULL; PRAGMA secure_delete=ON;');
      const store = await (exists ? FlightReviewStore.open(db, target, gate) : FlightReviewStore.create(db, target, gate));
      const result = await work(store); await gate(); return result;
    } finally { await db.close(); }
  };
  const pending = tail.then(run); tail = pending.catch(() => {}); return pending;
}

/** Local UI acknowledgment only; no credentials, source writes or portable archive. */
export async function loadFlightAcknowledgments(target: FlightReviewTarget, gate: () => Promise<void>): Promise<FlightAcknowledgment[]> {
  return await withStore(target, false, gate, store => store.list()) ?? [];
}
export async function saveFlightAcknowledgment(target: FlightReviewTarget, acknowledgment: FlightAcknowledgment, gate: () => Promise<void>): Promise<void> {
  const pinned = { ...acknowledgment };
  await withStore(target, true, gate, store => store.acknowledge(pinned));
}

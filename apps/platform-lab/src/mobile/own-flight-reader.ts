import type { RealFlightDetail, RealFlightListItem } from '../vereinsflieger/real-flight-library';
import type { OwnFlightStoredSnapshot, RealFlightService } from '../vereinsflieger/real-flight-service';

export interface OwnFlightScope { ownerId: string; storeId: string }
export interface OwnFlightReadSession extends OwnFlightScope {
  service: Pick<RealFlightService, 'readStored' | 'detail'>;
  assertCurrent(): Promise<void>;
  pendingCommand(): Promise<boolean>;
  close(): Promise<void>;
}
export interface OwnFlightReadPorts { open(): Promise<OwnFlightReadSession | null> }

/** Keep native read transactions apart across hook unmount/remount, not just one hook's lock. */
export function serializeOwnFlightReads(ports: OwnFlightReadPorts): OwnFlightReadPorts & { suspend(): Promise<() => void> } {
  let tail = Promise.resolve();
  async function acquire() {
    const previous = tail;
    let release!: () => void;
    tail = new Promise<void>(resolve => { release = resolve; });
    await previous;
    return release;
  }
  return { suspend: acquire, async open() {
    const release = await acquire();
    try {
      // Select the current owner only after admission; never retain a queued lease.
      const session = await ports.open();
      if (!session) { release(); return null; }
      let closing: Promise<void> | null = null;
      return { ...session, close: () => closing ??= (async () => {
        try { await session.close(); } finally { release(); }
      })() };
    } catch (error) { release(); throw error; }
  } };
}
export interface OwnFlightView {
  snapshot: OwnFlightStoredSnapshot; flights: RealFlightListItem[]; pendingCommand: boolean;
}
export class OwnFlightChangedError extends Error {
  constructor() { super('Saved flight selection changed; reload the current library.'); }
}

/** No provider, creation, migration or receipt resolution occurs on this path. */
export async function readOwnFlightView(ports: OwnFlightReadPorts): Promise<OwnFlightView | null> {
  const session = await ports.open();
  if (!session) return null;
  try {
    await session.assertCurrent();
    const pendingCommand = await session.pendingCommand();
    const result = await session.service.readStored();
    await session.assertCurrent();
    if (result.snapshot.ownerId !== session.ownerId || result.snapshot.storeId !== session.storeId ||
      result.flights.some(flight => flight.accountRef !== result.snapshot.account?.accountRef)) {
      throw new Error('Foreign own-flight projection.');
    }
    return { ...result, pendingCommand };
  } finally { await session.close(); }
}

export async function readOwnFlightDetail(ports: OwnFlightReadPorts, scope: OwnFlightScope,
  selected: RealFlightListItem): Promise<RealFlightDetail> {
  const session = await ports.open();
  if (!session) throw new OwnFlightChangedError();
  try {
    await session.assertCurrent();
    if (session.ownerId !== scope.ownerId || session.storeId !== scope.storeId) throw new OwnFlightChangedError();
    const detail = await session.service.detail(selected.flightId);
    await session.assertCurrent();
    if (!detail || detail.flightId !== selected.flightId || detail.accountRef !== selected.accountRef ||
      detail.bindingId !== selected.bindingId || detail.sourceFlightRef !== selected.sourceFlightRef || detail.factsRevision !== selected.factsRevision) throw new OwnFlightChangedError();
    return detail;
  } finally { await session.close(); }
}

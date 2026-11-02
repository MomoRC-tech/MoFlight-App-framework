import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import { canonical } from '@moflight/flight-logbook';
import { loadFlightAcknowledgments, saveFlightAcknowledgment } from '../vereinsflieger/flight-review-native';
import { validateFlightAcknowledgment, validateFlightReviewTarget, type FlightAcknowledgment, type FlightReviewTarget } from '../vereinsflieger/flight-source-review';

type Entry = { target: FlightReviewTarget; acknowledgment: FlightAcknowledgment };
type Marker = { version: 1; phase: 'prepared' | 'seeded' | 'passed'; runId: string; a: Entry; b: Entry };
type Result = { phase: 'seeded' | 'passed'; checks: string[]; milliseconds: number };

const MARKER_NAME = 'native-flight-review-proof-v1.json';
const MARKER_PREFIX = 'moflight-native-flight-review-proof-v1';
const CANCELLED = 'Synthetic flight review proof cancellation';
let running = false;
const check = (ok: boolean, message: string): void => { if (!ok) throw new Error(message); };
const keysAre = (value: unknown, expected: string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join(',') === expected.sort().join(',');
const sha256 = (value: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, value);
const gate = async () => {};

async function createMarker(): Promise<Marker> {
  const runId = Crypto.randomUUID();
  const [flightId, digestA, digestB] = await Promise.all([
    sha256(`${MARKER_PREFIX}:${runId}:flight`), sha256(`${MARKER_PREFIX}:${runId}:a:1`), sha256(`${MARKER_PREFIX}:${runId}:b:2`),
  ]);
  return {
    version: 1, phase: 'prepared', runId,
    a: { target: { ownerId: Crypto.randomUUID(), storeId: Crypto.randomUUID(), accountRef: '999990001' }, acknowledgment: { flightId, revision: 1, payloadSha256: digestA } },
    b: { target: { ownerId: Crypto.randomUUID(), storeId: Crypto.randomUUID(), accountRef: '999990002' }, acknowledgment: { flightId, revision: 2, payloadSha256: digestB } },
  };
}

async function readMarker(file: File): Promise<Marker> {
  let value: unknown;
  try { value = JSON.parse(await file.text()); } catch { throw new Error('Invalid flight review proof marker.'); }
  check(keysAre(value, ['version', 'phase', 'runId', 'a', 'b']), 'Invalid flight review proof marker.');
  const marker = value as Marker;
  check(marker.version === 1 && ['prepared', 'seeded', 'passed'].includes(marker.phase) &&
    typeof marker.runId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(marker.runId), 'Invalid flight review proof marker.');
  for (const entry of [marker.a, marker.b]) {
    check(keysAre(entry, ['target', 'acknowledgment']) && keysAre(entry.target, ['ownerId', 'storeId', 'accountRef']) &&
      keysAre(entry.acknowledgment, ['flightId', 'revision', 'payloadSha256']), 'Invalid flight review proof marker.');
    validateFlightReviewTarget(entry.target);
    validateFlightAcknowledgment(entry.acknowledgment);
  }
  check(new Set([marker.a.target.ownerId, marker.a.target.storeId, marker.b.target.ownerId, marker.b.target.storeId]).size === 4 &&
    marker.a.target.accountRef !== marker.b.target.accountRef && marker.a.acknowledgment.flightId === marker.b.acknowledgment.flightId &&
    marker.a.acknowledgment.revision === 1 && marker.b.acknowledgment.revision === 2 &&
    marker.a.acknowledgment.payloadSha256 !== marker.b.acknowledgment.payloadSha256, 'Invalid flight review proof marker.');
  const [flightId, digestA, digestB] = await Promise.all([
    sha256(`${MARKER_PREFIX}:${marker.runId}:flight`), sha256(`${MARKER_PREFIX}:${marker.runId}:a:1`), sha256(`${MARKER_PREFIX}:${marker.runId}:b:2`),
  ]);
  check(marker.a.acknowledgment.flightId === flightId && marker.b.acknowledgment.flightId === flightId &&
    marker.a.acknowledgment.payloadSha256 === digestA && marker.b.acknowledgment.payloadSha256 === digestB, 'Flight review proof marker contents changed.');
  return marker;
}

function writeMarker(file: File, marker: Marker, create: boolean): void {
  if (create) file.create({ overwrite: false });
  file.write(JSON.stringify(marker));
}

async function verifyEntry(entry: Entry): Promise<void> {
  const values = await loadFlightAcknowledgments(entry.target, gate);
  check(canonical(values) === canonical([entry.acknowledgment]), 'Flight review proof readback mismatch.');
}

async function verifyBoth(marker: Marker): Promise<void> {
  await verifyEntry(marker.a);
  await verifyEntry(marker.b);
}

async function seedEntry(entry: Entry): Promise<void> {
  const current = await loadFlightAcknowledgments(entry.target, gate);
  if (current.length === 0) await saveFlightAcknowledgment(entry.target, entry.acknowledgment, gate);
  else check(canonical(current) === canonical([entry.acknowledgment]), 'Unexpected flight review proof state.');
}

async function verifyCancelledSave(marker: Marker): Promise<void> {
  const alternate = { ...marker.a.acknowledgment, revision: 3, payloadSha256: marker.b.acknowledgment.payloadSha256 };
  let rejected = false;
  try { await saveFlightAcknowledgment(marker.a.target, alternate, async () => { throw new Error(CANCELLED); }); }
  catch (error) { rejected = error instanceof Error && error.message === CANCELLED; }
  check(rejected, 'Cancelled flight review save was not rejected.');
  await verifyBoth(marker);
}

/** Synthetic build-entry proof only; it never accesses normal accounts or provider data. */
export async function runNativeFlightReviewProof(): Promise<Result> {
  if (running) throw new Error('Flight review proof is already running.');
  running = true;
  const started = performance.now();
  try {
    const file = new File(Paths.document, MARKER_NAME);
    const isNew = !file.exists;
    const marker = isNew ? await createMarker() : await readMarker(file);
    if (isNew) writeMarker(file, marker, true);

    if (marker.phase === 'prepared') {
      await seedEntry(marker.a);
      await seedEntry(marker.b);
      await verifyBoth(marker);
      marker.phase = 'seeded';
      writeMarker(file, marker, false);
      return { phase: 'seeded', checks: ['synthetic A/B targets persisted the same SHA flight ID with distinct exact revisions and digests', 'production save/load readback is exact and isolated per target'], milliseconds: Math.round(performance.now() - started) };
    }

    await verifyBoth(marker);
    if (marker.phase === 'seeded') {
      await verifyCancelledSave(marker);
      marker.phase = 'passed';
      writeMarker(file, marker, false);
      return { phase: 'passed', checks: ['process-restart readback is exact and isolated for A/B', 'rejected cancelled save preserved both original acknowledgments'], milliseconds: Math.round(performance.now() - started) };
    }
    return { phase: 'passed', checks: ['previous restart proof marker is pinned; exact A/B readback remains intact'], milliseconds: Math.round(performance.now() - started) };
  } finally { running = false; }
}

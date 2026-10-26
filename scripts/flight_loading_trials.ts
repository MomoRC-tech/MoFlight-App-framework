/** Fixed-byte synthetic host trials; copy this script unchanged into an older source checkout for comparison. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { canonical } from '../packages/flight-logbook/src/index.ts';
import { nodeDriver } from '../tests/mobile/sqlite-driver.ts';
import { diagnosticJournal } from '../apps/platform-lab/src/diagnostics.ts';
import { flightDiagnostics } from '../apps/platform-lab/src/vereinsflieger/flight-diagnostics.ts';
import { RealFlightLibrary } from '../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { RealFlightService } from '../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import { RealFlightCommandJournal } from '../apps/platform-lab/src/vereinsflieger/real-flight-command-journal.ts';
import type { RealFlightSourceInput } from '../apps/platform-lab/src/vereinsflieger/real-flight-source.ts';

const [output, countText = '101', runsText = '5', seedInput, ...extra] = process.argv.slice(2);
const count = Number(countText), runs = Number(runsText);
if (!output || extra.length || !Number.isSafeInteger(count) || count < 1 || count > 500 || !Number.isSafeInteger(runs) || runs < 5 || runs > 10) {
  throw new Error('Usage: node --import tsx scripts/flight_loading_trials.ts NEW_OUTPUT_DIR [1..500_FLIGHTS] [5..10_TRIALS] [EXISTING_SEED_DIRECTORY]');
}
await mkdir(output);
const directory = await mkdtemp(join(tmpdir(), 'moflight-fixed-trials-'));
const ownerId = '11111111-1111-4111-8111-111111111111', storeId = '22222222-2222-4222-8222-222222222222';
const leaseId = 'synthetic-fixed-trials', at = '2026-10-22T10:00:00.000Z';
const authorize = () => ({ ownerId, storeId, leaseId, writable: true });
const digest = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const hash = async (text: string) => flightDiagnostics.measure('hash', async () => digest(text));
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const driver = (path: string) => flightDiagnostics.driver(nodeDriver(path));
const paths = (folder: string) => ({ history: join(folder, 'history.sqlite'), commands: join(folder, 'commands.sqlite') });

function source(captureId: string, changed = false): RealFlightSourceInput {
  const context = { accountNumber: '101', clubLabel: 'Synthetic club', clubIdentity: 'display-label-only' as const, verification: 'observed-profile-number' as const };
  const window = { from: '2026-10-01', to: '2026-10-22' };
  return { version: 1, binding: { provider: 'vereinsflieger', accountRef: '101' }, contextBefore: context, contextAfter: context,
    requestedWindow: { ...window, participation: 'Pilot oder Fluglehrer' }, capture: { captureId, retrievedAt: at,
      headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'],
      rows: Array.from({ length: count }, (_, i) => ({ sourceFlightId: String(9000 + i), values: ['22.10.2026', i % 2 ? 'D-SYN1' : 'D-SYN2', '10:00', changed && i === 0 ? '10:14' : '10:12', changed && i === 0 ? '14' : '12', 'Synthetic pilot'] })),
      sourceIdentity: 'unverified', timeBasis: 'unknown', coverage: 'complete-requested-list', exportContext: { ...window,
        preset: 'Konfiguration laden', participation: 'Pilot oder Fluglehrer', accountLabel: 'Synthetic account', recordCount: count,
        pageCount: 1, columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } } };
}

function service(folder: string, captureId: string, changed: boolean) {
  const files = paths(folder); let sequence = 100;
  return new RealFlightService(ownerId, storeId, leaseId, {
    authorize, hash, uuid: () => uuid(++sequence), now: () => at,
    retrieve: async (_request, signal) => { assert.equal(signal.aborted, false); return source(captureId, changed); },
    repository: async () => {
      const library = await RealFlightLibrary.open(driver(files.history), ownerId, storeId, hash, authorize);
      return { library, writable: true, warning: null, close: () => library.close() };
    }, journal: () => RealFlightCommandJournal.open(driver(files.commands), ownerId, storeId, authorize, hash),
  });
}

async function seed(folder: string, imports: number) {
  await mkdir(folder); const files = paths(folder);
  const library = await RealFlightLibrary.create(driver(files.history), { singleton: 1, family: 'moflight-real-flight-history', schema_version: 1,
    payload_version: 1, store_id: storeId, owner_id: ownerId, created_at: at }, hash, authorize);
  try {
    if (imports) {
      await library.bindAccount({ kind: 'bind', commandId: uuid(1), baseGeneration: 0, source: source('seed-binding'), at });
      for (let i = 0; i < imports; i++) {
        const input = source(`seed-import-${i}`), plan = await library.prepareImport(input);
        await library.saveUnassigned({ kind: 'import-unassigned', commandId: uuid(2 + i), baseGeneration: plan.baseGeneration,
          bindingId: plan.bindingId, source: input, planToken: plan.planToken, at });
      }
    }
  } finally { await library.close(); }
  const journal = await RealFlightCommandJournal.open(driver(files.commands), ownerId, storeId, authorize, hash, true);
  await journal.close();
}

type Sample = { trial: number; milliseconds: number; cloneMilliseconds: number; counters: ReturnType<typeof flightDiagnostics.snapshot> };
const summary = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return { median: sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2, min: sorted[0]!, max: sorted.at(-1)! };
};
const scenarios = [
  { name: 'first-import', imports: 0, changed: false, readOnly: false },
  { name: 'repeat-after-one-import', imports: 1, changed: false, readOnly: false },
  { name: 'repeat-after-three-imports', imports: 3, changed: false, readOnly: false },
  { name: 'changed-after-three-imports', imports: 3, changed: true, readOnly: false },
  { name: 'reopened-read-after-three-imports', imports: 3, changed: false, readOnly: true },
];
const results: unknown[] = [];
diagnosticJournal.clear();
try {
  await mkdir(join(output, 'seeds'));
  for (const imports of [0, 1, 3]) {
    const folder = join(directory, `seed-${imports}`), files = paths(folder);
    if (seedInput) {
      await mkdir(folder); const existing = paths(join(seedInput, `seed-${imports}`));
      await copyFile(existing.history, files.history); await copyFile(existing.commands, files.commands);
    } else await seed(folder, imports);
    const savedFolder = join(output, 'seeds', `seed-${imports}`); await mkdir(savedFolder); const saved = paths(savedFolder);
    await copyFile(files.history, saved.history); await copyFile(files.commands, saved.commands);
  }
  for (const scenario of scenarios) {
    const initial = paths(join(directory, `seed-${scenario.imports}`));
    const seedHashes = { history: digest(await readFile(initial.history)), commands: digest(await readFile(initial.commands)) };
    const samples: Sample[] = []; let finalGraphHash = '', finalFlightsHash = '', receiptCount = 0, captureCount = 0;
    for (let trial = 0; trial < runs; trial++) {
      const cloneStarted = performance.now(), folder = join(directory, `${scenario.name}-${trial}`); await mkdir(folder);
      const files = paths(folder);
      await copyFile(initial.history, files.history); await copyFile(initial.commands, files.commands);
      assert.equal(digest(await readFile(files.history)), seedHashes.history); assert.equal(digest(await readFile(files.commands)), seedHashes.commands);
      const cloneMilliseconds = performance.now() - cloneStarted;
      const current = service(folder, `trial-${scenario.name}`, scenario.changed), before = flightDiagnostics.snapshot(), started = performance.now();
      let stored;
      try {
        if (!scenario.readOnly) {
          const review = await current.retrieve({ from: '2026-10-01', to: '2026-10-22' });
          const saved = await current.saveVerifiedReview(review, { accountNumber: '101', clubLabel: 'Synthetic club' });
          assert.equal(saved.counts.added, scenario.imports === 0 ? count : 0);
          assert.equal(saved.counts.changed, scenario.changed ? 1 : 0);
          assert.equal(saved.counts.unchanged, scenario.imports ? count - (scenario.changed ? 1 : 0) : 0);
        }
        stored = await current.readStored();
        assert.equal(stored.flights.length, count);
        assert.equal((await current.recoverPending()).status, 'none');
        samples.push({ trial, milliseconds: performance.now() - started, cloneMilliseconds, counters: flightDiagnostics.difference(before) });
      } finally { current.dispose(); }
      // Verification overhead is deliberately outside the measured operation.
      const reopened = await RealFlightLibrary.open(driver(files.history), ownerId, storeId, hash, authorize);
      try {
        const graph = await reopened.snapshot(), graphHash = digest(canonical(graph)), flightsHash = digest(canonical(stored.flights));
        receiptCount = (scenario.imports ? 1 + scenario.imports : 0) + (scenario.readOnly ? 0 : scenario.imports ? 1 : 2);
        assert.equal(graph.receipts.length, receiptCount); assert.equal(graph.generation, receiptCount);
        captureCount = graph.records.filter(row => row.kind === 'capture').length;
        if (!scenario.readOnly) assert.ok(graph.records.some(row => row.kind === 'capture' && row.id === `trial-${scenario.name}`));
        if (!finalGraphHash) { finalGraphHash = graphHash; finalFlightsHash = flightsHash; }
        else { assert.equal(graphHash, finalGraphHash, 'identical seed/input preserves complete graph and receipts'); assert.equal(flightsHash, finalFlightsHash); }
        if (scenario.changed) assert.ok(stored.flights.some(flight => flight.facts.assessment.durations.flight.minutes === 14));
      } finally { await reopened.close(); }
      diagnosticJournal.clear();
    }
    const wall = summary(samples.map(sample => sample.milliseconds));
    results.push({ ...scenario, seedHashes, finalGraphHash, finalFlightsHash, receiptCount, captureCount, samples, wall, clone: summary(samples.map(sample => sample.cloneMilliseconds)) });
    console.info(`${scenario.name}: median ${wall.median.toFixed(1)}ms range ${wall.min.toFixed(1)}..${wall.max.toFixed(1)} (${runs} independent seed clones)`);
  }
  const report = { version: 1, source: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    harnessSha256: digest(await readFile(new URL(import.meta.url))), seedOrigin: seedInput ? resolve(seedInput) : 'generated synthetic seeds retained under seeds/', environment: { node: process.version, platform: process.platform, arch: process.arch }, flights: count, trials: runs,
    boundary: 'Synthetic host SQLite. Each trial starts from exact identical closed DB bytes; new service/connections. No provider, model, React, native driver, device, OS cold-cache or native speed acceptance. Clone time and final complete-graph verification are outside operation wall time. Counter durations are inclusive and must not be summed/subtracted from wall time. Scenarios are run in fixed order; OS scheduling/cache effects remain.',
    assertions: { exactSeedBytes: true, completeGraphAndReceiptsEqualAcrossTrials: true, changedAndUnchangedCounts: true, noPendingCommands: true, reopenedLibrary: true }, scenarios: results };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
} finally {
  diagnosticJournal.clear();
  assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(basename(directory).startsWith('moflight-fixed-trials-'));
  await rm(directory, { recursive: true, force: true });
}

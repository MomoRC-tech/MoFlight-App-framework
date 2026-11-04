import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import { canonical } from '@moflight/flight-logbook';
import { openDriver, hash } from '../storage';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import { createRealFlightNativeAdapter, RealFlightCandidateMissingError, RealFlightUninitializedStoreError } from '../vereinsflieger/real-flight-native';
import type { RealFlightNativeAdapter, RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import { RealFlightLibrary } from '../vereinsflieger/real-flight-library';
import type { RealFlightSourceInput } from '../vereinsflieger/real-flight-source';
import { RealOwnerRegistry } from '../vereinsflieger/real-owner-registry';
import type { RealOwnerLease } from '../vereinsflieger/real-owner-registry';
import { continueRealFlightOwnerSetup } from '../vereinsflieger/real-flight-owner-setup';
import { REAL_FLIGHT_COMMAND_JOURNAL_FILE_NAME, REAL_FLIGHT_SELECTION_FILE_NAME } from '../vereinsflieger/real-flight-native';
import { REAL_OWNER_REGISTRY_FILE_NAME } from '../vereinsflieger/real-flight-native';
import { SCOPE_SCHEMA, bindScope, readScope } from '../vereinsflieger/scope-store';
import type { ProviderScope } from '../vereinsflieger/scope-store';
import { loadStartPreviewCache } from '../mobile/start-preview-native';
import { startDashboard } from '../mobile/start-preview';
import { createOwnFlightReadPorts } from '../mobile/own-flight-reader-native';
import type { OwnFlightReadPorts, OwnFlightView } from '../mobile/own-flight-reader';
import { readOwnFlightView } from '../mobile/own-flight-reader';
import { selectStatisticsFlights, statisticsDurationGroups, summarizeStatisticsFlights } from '../mobile/statistics-overlay-model';

const FIXTURE_DIRECTORY = 'moflight-statistics-isolation-v1';
const ACTIVE_MARKER = `${FIXTURE_DIRECTORY}-active.json`;
const SCOPE_REGISTRY = 'vereinsflieger-owner-registry.sqlite';
const AT = '2026-11-04T12:00:00.000Z';
const YEAR = 2026;
const TODAY = '2026-11-04';
const OWNER_KEYS = ['A', 'B'] as const;
export type StatisticsIsolationOwnerKey = typeof OWNER_KEYS[number];

interface FixtureRow { sourceFlightRef: string; date: string; registration: string; model: string; start: string; landing: string; duration: string }
interface FixtureAccountSpec {
  key: StatisticsIsolationOwnerKey;
  accountRef: string;
  label: string;
  clubLabel: string;
  rows: FixtureRow[];
  expectedYear: { count: number; knownMinutes: number; unknownDurationCount: number; contributorRefs: string[]; unknownDurationRefs: string[] };
  expectedAll: { count: number; knownMinutes: number; unknownDurationCount: number; unknownDateCount: number; contributorRefs: string[] };
}
export interface StatisticsIsolationAccount extends FixtureAccountSpec {
  ownerId: string;
  storeId: string;
  candidateName: string;
  scope: ProviderScope;
  providerScopeOwned: boolean;
  previewCacheOwned: boolean;
  flightIds: string[];
}
export interface StatisticsIsolationManifest {
  version: 1;
  runId: string;
  phase: 'seeding' | 'ready';
  selectedKey: StatisticsIsolationOwnerKey;
  providerRegistryExisted: boolean;
  accounts: StatisticsIsolationAccount[];
}
export interface StatisticsIsolationAccountReport {
  key: StatisticsIsolationOwnerKey;
  accountRef: string;
  ownerId: string;
  storeId: string;
  selectionSeq: number;
  year: { count: number; knownMinutes: number; durationLabel: string; unknownDurationCount: number; contributorRefs: string[]; unknownDurationRefs: string[]; flightIds: string[] };
  all: { count: number; knownMinutes: number; durationLabel: string; unknownDurationCount: number; unknownDateCount: number; contributorRefs: string[]; flightIds: string[] };
  emptyYear2025: true;
  preview: { ownerId: string; storeId: string; accountRef: string; selectionSeq: number; startValuesMatch: true; staleSelectionRejected: boolean };
}
export interface StatisticsIsolationProofReport {
  version: 1;
  mode: 'seed' | 'reopen';
  offline: true;
  selectedKey: StatisticsIsolationOwnerKey;
  accounts: StatisticsIsolationAccountReport[];
  coverage: 'actual native SQLite owner registry, account-bound real-flight source/capture/flight/facts graph, production reader, production Start cache and production MobileApp shell; synthetic fixture selector only';
  limits: 'Auxiliary provider sections are not part of this fixture. No provider login, network, iOS, phone or release acceptance.';
}

const SPECS: readonly FixtureAccountSpec[] = [
  {
    key: 'A', accountRef: '101', label: 'Fixturekonto A · 101', clubLabel: 'Synthetic Statistics Club A',
    rows: [
      { sourceFlightRef: '70101', date: '18.06.2026', registration: 'D-TA1', model: 'Synthetic Alpha', start: '09:00', landing: '10:12', duration: '72' },
      { sourceFlightRef: '70102', date: '21.07.2026', registration: 'D-TA2', model: 'Synthetic Alpha', start: '11:00', landing: '11:30', duration: '30' },
      { sourceFlightRef: '70103', date: '03.08.2026', registration: 'D-TA1', model: 'Synthetic Alpha', start: '13:00', landing: '13:45', duration: '' },
      { sourceFlightRef: '70104', date: '', registration: 'D-TA3', model: 'Synthetic Alpha', start: '14:00', landing: '14:15', duration: '15' },
    ],
    expectedYear: { count: 3, knownMinutes: 102, unknownDurationCount: 1, contributorRefs: ['70101', '70102', '70103'], unknownDurationRefs: ['70103'] },
    expectedAll: { count: 4, knownMinutes: 117, unknownDurationCount: 1, unknownDateCount: 1, contributorRefs: ['70101', '70102', '70103', '70104'] },
  },
  {
    key: 'B', accountRef: '202', label: 'Fixturekonto B · 202', clubLabel: 'Synthetic Statistics Club B',
    rows: [
      { sourceFlightRef: '80201', date: '19.06.2026', registration: 'D-TB2', model: 'Synthetic Bravo', start: '09:00', landing: '09:45', duration: '45' },
      { sourceFlightRef: '80202', date: '14.07.2026', registration: 'D-TB2', model: 'Synthetic Bravo', start: '11:00', landing: '11:30', duration: '' },
      { sourceFlightRef: '80203', date: '', registration: 'D-TB3', model: 'Synthetic Bravo', start: '13:00', landing: '13:30', duration: '30' },
    ],
    expectedYear: { count: 2, knownMinutes: 45, unknownDurationCount: 1, contributorRefs: ['80201', '80202'], unknownDurationRefs: ['80202'] },
    expectedAll: { count: 3, knownMinutes: 75, unknownDurationCount: 1, unknownDateCount: 1, contributorRefs: ['80201', '80202', '80203'] },
  },
];

function validateRunId(value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error('Invalid statistics fixture namespace.');
  return value;
}
function activeMarker(): File { return new File(Paths.document, ACTIVE_MARKER); }
function fixtureDirectory(runId: string): Directory { return new Directory(Paths.document, FIXTURE_DIRECTORY, validateRunId(runId)); }
function fixtureManifestFile(runId: string): File { return new File(fixtureDirectory(runId), 'manifest.json'); }
function defaultDatabaseFile(name: string): File {
  const directory = SQLite.defaultDatabaseDirectory;
  return new File(directory.startsWith('file:') ? directory : `file://${directory}`, name);
}
function previewCacheFile(storeId: string): File {
  return new File(new Directory(Paths.cache, 'moflight-start-preview-v1'), `start-${storeId}.sqlite`);
}
function accountSpec(key: StatisticsIsolationOwnerKey): FixtureAccountSpec {
  const spec = SPECS.find(value => value.key === key);
  if (!spec) throw new Error('Unknown fixture account.');
  return spec;
}
function accountRecord(manifest: StatisticsIsolationManifest, key: StatisticsIsolationOwnerKey): StatisticsIsolationAccount {
  const account = manifest.accounts.find(value => value.key === key);
  if (!account) throw new Error(`Fixture account ${key} is unavailable.`);
  return account;
}
function writeManifest(manifest: StatisticsIsolationManifest): void {
  const file = fixtureManifestFile(manifest.runId);
  if (!file.exists) file.create({ overwrite: false });
  file.write(JSON.stringify(manifest));
}
function fixtureUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
async function readManifest(runId: string): Promise<StatisticsIsolationManifest> {
  const file = fixtureManifestFile(runId);
  if (!file.exists) throw new Error('Statistics fixture marker has no matching manifest. Preserve the folder for review.');
  const value = JSON.parse(await file.text()) as StatisticsIsolationManifest;
  if (value.version !== 1 || value.runId !== runId || !['seeding', 'ready'].includes(value.phase) ||
      !OWNER_KEYS.includes(value.selectedKey) || typeof value.providerRegistryExisted !== 'boolean' ||
      !Array.isArray(value.accounts) || value.accounts.length > 2 || (value.phase === 'ready' && value.accounts.length !== 2)) {
    throw new Error('Statistics fixture manifest is unsupported. Preserve its files.');
  }
  const owners = new Set<string>(), stores = new Set<string>(), keys = new Set<StatisticsIsolationOwnerKey>();
  for (const account of value.accounts) {
    const spec = accountSpec(account?.key);
    if (keys.has(spec.key) || !fixtureUuid(account.ownerId) || !fixtureUuid(account.storeId) ||
        typeof account.candidateName !== 'string' || !/^[A-Za-z0-9_.-]{1,160}$/.test(account.candidateName) ||
        owners.has(account.ownerId) || stores.has(account.storeId) || typeof account.providerScopeOwned !== 'boolean' ||
        typeof account.previewCacheOwned !== 'boolean' || !Array.isArray(account.flightIds) ||
        account.accountRef !== spec.accountRef || canonical(account.rows) !== canonical(spec.rows) ||
        canonical(account.expectedYear) !== canonical(spec.expectedYear) || canonical(account.expectedAll) !== canonical(spec.expectedAll) ||
        account.scope?.owner !== account.ownerId || account.scope?.connectionId !== `stats-${runId.slice(0, 8)}-${spec.key.toLowerCase()}` ||
        account.scope?.context?.accountNumber !== spec.accountRef) {
      throw new Error('Statistics fixture account record is unsupported. Preserve its files.');
    }
    owners.add(account.ownerId); stores.add(account.storeId); keys.add(spec.key);
  }
  return value;
}
function realAdapter(runId: string): RealFlightNativeAdapter {
  const directory = fixtureDirectory(runId);
  const prefix = `stats-${runId.slice(0, 8)}-`;
  const dbName = (name: string) => {
    if (!/^[A-Za-z0-9_.-]{1,160}$/.test(name)) throw new Error('Invalid isolated statistics database name.');
    return `${prefix}${name}`;
  };
  return createRealFlightNativeAdapter({
    defaultDatabaseDirectory: directory.uri,
    file: (_base, name) => new File(directory, dbName(name)),
    openDriver: async name => openRealFlightNativeDriver(dbName(name), (path, options) => SQLite.openDatabaseAsync(path, options, directory.uri)),
    hash,
    uuid: Crypto.randomUUID,
    now: () => new Date().toISOString(),
  });
}
function sourceFor(account: FixtureAccountSpec, runId: string): RealFlightSourceInput {
  const context = { accountNumber: account.accountRef, clubLabel: account.clubLabel,
    clubIdentity: 'display-label-only' as const, verification: 'observed-profile-number' as const };
  const headers = ['Datum', 'Lfz.', 'Lfz.-Muster', 'Start', 'Landung', 'Flugzeit', 'Pilot'];
  const captureId = `statistics-${account.key.toLowerCase()}-${runId.slice(0, 8)}`;
  return {
    version: 1,
    binding: { provider: 'vereinsflieger', accountRef: account.accountRef },
    contextBefore: context,
    contextAfter: { ...context },
    requestedWindow: { from: '2026-01-01', to: '2026-11-04', participation: 'Pilot oder Fluglehrer' },
    capture: {
      captureId,
      retrievedAt: AT,
      headers,
      rows: account.rows.map(row => ({ sourceFlightId: row.sourceFlightRef,
        values: [row.date, row.registration, row.model, row.start, row.landing, row.duration, `Synthetic pilot ${account.key}`] })),
      sourceIdentity: 'unverified',
      timeBasis: 'unknown',
      coverage: 'complete-requested-list',
      exportContext: { from: '2026-01-01', to: '2026-11-04', preset: 'Synthetic isolation proof',
        participation: 'Pilot oder Fluglehrer', accountLabel: `Synthetic account ${account.accountRef}`,
        recordCount: account.rows.length, pageCount: 1, columnIds: headers.map((_, index) => String(index + 1)), adapterVersion: 2 },
    },
  };
}
function scopeFor(lease: RealOwnerLease, account: FixtureAccountSpec, runId: string): ProviderScope {
  return { version: 1, owner: lease.ownerId, connectionId: `stats-${runId.slice(0, 8)}-${account.key.toLowerCase()}`,
    context: { accountNumber: account.accountRef, clubLabel: account.clubLabel,
      clubIdentity: 'display-label-only', verification: 'observed-profile-number' } };
}
async function installProviderScope(scope: ProviderScope): Promise<void> {
  const db = await openDriver(SCOPE_REGISTRY);
  try {
    await db.exec(`PRAGMA synchronous=FULL; ${SCOPE_SCHEMA}`);
    await db.transaction(async tx => {
      if (await readScope(tx, scope.owner)) throw new Error('Existing provider scope collision; preserve it.');
      const saved = await bindScope(tx, scope);
      if (canonical(saved) !== canonical(scope)) throw new Error('Synthetic provider scope readback differed.');
    });
  } finally { await db.close(); }
}
async function seedOwner(adapter: RealFlightNativeAdapter, registry: RealOwnerRegistry, lease: RealOwnerLease, account: FixtureAccountSpec,
  runId: string): Promise<void> {
  const scope: RealFlightNativeScope = { registry, lease,
    authorize: () => ({ ownerId: lease.ownerId, storeId: lease.storeId, leaseId: lease.leaseId, writable: true }) };
  const ready = await continueRealFlightOwnerSetup({ ownerId: lease.ownerId, storeId: lease.storeId,
      candidateName: lease.candidateName, createdAt: lease.createdAt, selectedAt: lease.selectedAt }, {
      openCandidate: name => adapter.openRealFlightCandidate(scope, name),
      isMissingCandidate: error => error instanceof RealFlightCandidateMissingError,
      isUninitializedStore: error => error instanceof RealFlightUninitializedStoreError,
      resumeInitialCandidate: () => adapter.resumeInitialRealFlightCandidate(scope),
      openSelection: create => adapter.openRealFlightSelection(scope, create),
      openCommandJournal: create => adapter.openRealFlightCommandJournal(scope, create),
      uuid: Crypto.randomUUID,
  }, true);
  if (!ready) throw new Error(`Could not prepare fixture owner ${account.key}.`);
  const library = await adapter.openRealFlightCandidate(scope, lease.candidateName);
  try {
    const source = sourceFor(account, runId);
    await library.bindAccount({ kind: 'bind', commandId: commandId(1), baseGeneration: 0, source, at: AT });
    const plan = await library.prepareImport(source);
    await library.saveUnassigned({ kind: 'import-unassigned', commandId: commandId(2), baseGeneration: plan.baseGeneration,
      bindingId: plan.bindingId, source, planToken: plan.planToken, at: AT });
    const saved = await library.readStored();
    const refs = saved.flights.map(flight => flight.sourceFlightRef).sort();
    if (canonical(refs) !== canonical(account.rows.map(row => row.sourceFlightRef).sort()) ||
        saved.flights.some(flight => flight.accountRef !== account.accountRef)) throw new Error(`Saved flight graph differs for fixture account ${account.key}.`);
  } finally { await library.close(); }
}
function commandId(index: number): string { return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`; }
async function currentRegistry(adapter: RealFlightNativeAdapter): Promise<RealOwnerRegistry> {
  const registry = await adapter.openOwnerRegistry(false);
  if (!registry) throw new Error('Isolated real owner registry is missing.');
  return registry;
}
async function switchOwner(adapter: RealFlightNativeAdapter, ownerId: string): Promise<RealOwnerLease> {
  const registry = await currentRegistry(adapter);
  try {
    const current = await registry.currentOwner();
    if (!current) throw new Error('Isolated real owner selection is missing.');
    if (current.ownerId === ownerId) return current;
    return await registry.selectOwner(ownerId, new Date().toISOString(), current);
  } finally { await registry.close(); }
}
async function selectFixtureOwner(adapter: RealFlightNativeAdapter, ports: ReturnType<typeof createOwnFlightReadPorts>,
  account: StatisticsIsolationAccount): Promise<{ lease: RealOwnerLease; stalePreviewRejected: boolean }> {
  let previous: RealOwnerLease | null = null, selected: RealOwnerLease | null = null, cached: string | null = null;
  const release = await ports.suspend();
  try {
    const registry = await currentRegistry(adapter);
    try {
      previous = await registry.currentOwner();
      if (!previous) throw new Error('Isolated real owner selection is missing.');
      if (previous.ownerId !== account.ownerId) cached = await loadStartPreviewCache(account.storeId);
      selected = previous.ownerId === account.ownerId ? previous : await registry.selectOwner(account.ownerId, new Date().toISOString(), previous);
    } finally { await registry.close(); }
  } finally { release(); }
  if (!selected) throw new Error(`Fixture account ${account.key} could not be selected.`);
  let stalePreviewRejected = false;
  if (previous!.ownerId !== selected.ownerId && cached) {
    const old = JSON.parse(cached) as { ownerId?: unknown; storeId?: unknown; accountRef?: unknown; context?: { ownerSelectionSeq?: unknown } };
    if (old.ownerId !== account.ownerId || old.storeId !== account.storeId || old.accountRef !== account.accountRef ||
        !Number.isSafeInteger(old.context?.ownerSelectionSeq) || Number(old.context?.ownerSelectionSeq) >= selected.selectionSeq) {
      throw new Error(`Prior Start cache for account ${account.key} is not a valid stale-owner fixture.`);
    }
    const session = await ports.open();
    if (!session) throw new Error(`Production Start reader could not open switched account ${account.key}.`);
    try {
      if (session.ownerId !== account.ownerId || session.storeId !== account.storeId || !session.readStartPreview) {
        throw new Error(`Production Start reader selected a foreign account while checking ${account.key}.`);
      }
      if (await session.readStartPreview() !== null) throw new Error(`Stale Start preview was accepted after switching to ${account.key}.`);
      stalePreviewRejected = true;
    } finally { await session.close(); }
  }
  return { lease: selected, stalePreviewRejected };
}
function expectedReferences(rows: readonly FixtureRow[]): string[] { return rows.map(row => row.sourceFlightRef).sort(); }
function durationLabel(minutes: number): string { return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`; }
function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (canonical(actual) !== canonical(expected)) throw new Error(`Statistics fixture ${label} mismatch.`);
}
async function assertSelectedPreview(ports: OwnFlightReadPorts, adapter: RealFlightNativeAdapter,
  account: StatisticsIsolationAccount, view: OwnFlightView, stalePreviewRejected: boolean) {
  const registry = await currentRegistry(adapter);
  let lease: RealOwnerLease | null = null;
  try {
    lease = await registry.currentOwner();
    if (!lease || lease.ownerId !== account.ownerId || lease.storeId !== account.storeId || lease.selectionSeq < 1) {
      throw new Error(`Fixture owner ${account.key} was not selected for preview verification.`);
    }
    const text = await loadStartPreviewCache(account.storeId);
    if (!text) throw new Error(`Saved Start preview missing for fixture account ${account.key}.`);
    const session = await ports.open();
    if (!session) throw new Error(`Production Start reader could not reopen fixture account ${account.key}.`);
    let preview: Awaited<ReturnType<NonNullable<typeof session.readStartPreview>>>;
    try {
      if (session.ownerId !== lease.ownerId || session.storeId !== lease.storeId || !session.readStartPreview) {
        throw new Error(`Production Start reader selected a foreign fixture account ${account.key}.`);
      }
      preview = await session.readStartPreview();
    } finally { await session.close(); }
    if (!preview || preview.accountRef !== account.accountRef || preview.ownerId !== account.ownerId || preview.storeId !== account.storeId) {
      throw new Error(`Saved Start preview was rejected or crossed owners for fixture account ${account.key}.`);
    }
    const expected = startDashboard(view, Number(preview.day.slice(0, 4)), preview.day);
    assertEqual(preview.dashboard, expected, `Start preview values ${account.key}`);
    if (canonical(preview.providerScope) !== canonical(account.scope) || preview.context.ownerSelectionSeq !== lease.selectionSeq) {
      throw new Error(`Start preview provider scope or selection sequence crossed accounts for ${account.key}.`);
    }
    return { ownerId: preview.ownerId, storeId: preview.storeId, accountRef: preview.accountRef,
      selectionSeq: lease.selectionSeq, startValuesMatch: true as const, staleSelectionRejected: stalePreviewRejected };
  } finally { await registry.close(); }
}
async function inspectAccount(ports: OwnFlightReadPorts, adapter: RealFlightNativeAdapter,
  account: StatisticsIsolationAccount, stalePreviewRejected = false): Promise<StatisticsIsolationAccountReport> {
  const view = await readOwnFlightView(ports);
  if (!view) throw new Error(`No native saved view for fixture account ${account.key}.`);
  if (view.snapshot.ownerId !== account.ownerId || view.snapshot.storeId !== account.storeId ||
      view.snapshot.account?.accountRef !== account.accountRef || view.flights.some(flight => flight.accountRef !== account.accountRef)) {
    throw new Error(`Selected saved data crossed fixture accounts at ${account.key}.`);
  }
  const refs = view.flights.map(flight => flight.sourceFlightRef).sort();
  assertEqual(refs, expectedReferences(account.rows), `source references ${account.key}`);
  const currentYear = selectStatisticsFlights(view.flights, { kind: 'year', year: YEAR }, TODAY);
  const currentSummary = summarizeStatisticsFlights(currentYear.flights);
  const currentRefs = currentSummary.supportingIds.map(id => view.flights.find(flight => flight.flightId === id)?.sourceFlightRef ?? `missing:${id}`).sort();
  const unknownIds = statisticsDurationGroups(currentYear.flights).unknownIds;
  const unknownRefs = unknownIds.map(id => view.flights.find(flight => flight.flightId === id)?.sourceFlightRef ?? `missing:${id}`).sort();
  assertEqual({ count: currentSummary.count, knownMinutes: currentSummary.knownMinutes,
    unknownDurationCount: currentSummary.unknownDurationCount, contributorRefs: currentRefs, unknownDurationRefs: unknownRefs },
  account.expectedYear, `2026 statistics ${account.key}`);

  const allSelection = selectStatisticsFlights(view.flights, { kind: 'all' }, TODAY);
  const allSummary = summarizeStatisticsFlights(allSelection.flights);
  const allRefs = allSummary.supportingIds.map(id => view.flights.find(flight => flight.flightId === id)?.sourceFlightRef ?? `missing:${id}`).sort();
  assertEqual({ count: allSummary.count, knownMinutes: allSummary.knownMinutes, unknownDurationCount: allSummary.unknownDurationCount,
    unknownDateCount: allSelection.unknownDateCount, contributorRefs: allRefs }, account.expectedAll, `all-history statistics ${account.key}`);
  const emptyYear = summarizeStatisticsFlights(selectStatisticsFlights(view.flights, { kind: 'year', year: 2025 }, TODAY).flights);
  if (emptyYear.count !== 0 || emptyYear.knownMinutes !== 0) throw new Error(`2025 empty period was not empty for ${account.key}.`);
  const preview = await assertSelectedPreview(ports, adapter, account, view, stalePreviewRejected);
  const registry = await currentRegistry(adapter);
  try {
    const selected = await registry.currentOwner();
    if (!selected || selected.ownerId !== account.ownerId) throw new Error(`Owner changed during fixture ${account.key} inspection.`);
    return { key: account.key, accountRef: account.accountRef, ownerId: account.ownerId, storeId: account.storeId,
      selectionSeq: selected.selectionSeq,
      year: { count: currentSummary.count, knownMinutes: currentSummary.knownMinutes, durationLabel: durationLabel(currentSummary.knownMinutes),
        unknownDurationCount: currentSummary.unknownDurationCount, contributorRefs: currentRefs,
        unknownDurationRefs: unknownRefs, flightIds: currentSummary.supportingIds },
      all: { count: allSummary.count, knownMinutes: allSummary.knownMinutes, durationLabel: durationLabel(allSummary.knownMinutes),
        unknownDurationCount: allSummary.unknownDurationCount, unknownDateCount: allSelection.unknownDateCount,
        contributorRefs: allRefs, flightIds: allSummary.supportingIds },
      emptyYear2025: true, preview };
  } finally { await registry.close(); }
}
async function seedNewRun(runId: string, progress: (value: string) => void): Promise<StatisticsIsolationManifest> {
  const directory = fixtureDirectory(runId);
  directory.create({ idempotent: true, intermediates: true });
  const globalRegistryExisted = defaultDatabaseFile(SCOPE_REGISTRY).exists;
  const adapter = realAdapter(runId);
  const manifest: StatisticsIsolationManifest = { version: 1, runId, phase: 'seeding', selectedKey: 'A',
    providerRegistryExisted: globalRegistryExisted, accounts: [] };
  writeManifest(manifest);
  const registry = await adapter.openOwnerRegistry(true);
  if (!registry) throw new Error('Could not create the isolated synthetic owner registry.');
  try {
    for (const spec of SPECS) {
      progress(`STATISTICS_ISOLATION_SEEDING_${spec.key}`);
      const lease = await registry.createFreshOwner(AT);
      const cache = previewCacheFile(lease.storeId);
      const row: StatisticsIsolationAccount = { ...spec, ownerId: lease.ownerId, storeId: lease.storeId,
        candidateName: lease.candidateName, scope: scopeFor(lease, spec, runId),
        providerScopeOwned: false, previewCacheOwned: false, flightIds: [] };
      manifest.accounts.push(row);
      writeManifest(manifest);
      if (cache.exists) throw new Error(`Existing Start cache collision for synthetic owner ${spec.key}; preserve it.`);
      row.previewCacheOwned = true;
      writeManifest(manifest);
      await seedOwner(adapter, registry, lease, spec, runId);
      row.providerScopeOwned = true;
      writeManifest(manifest);
      await installProviderScope(row.scope);
    }
    const accountA = accountRecord(manifest, 'A');
    const current = await registry.currentOwner();
    if (!current) throw new Error('No selected fixture owner after seed.');
    if (current.ownerId !== accountA.ownerId) await registry.selectOwner(accountA.ownerId, new Date().toISOString(), current);
    manifest.selectedKey = 'A';
    const savedA = accountRecord(manifest, 'A');
    const savedB = accountRecord(manifest, 'B');
    // Keep actual deterministic IDs from each validated real-flight graph for contributor checks.
    for (const account of [savedA, savedB]) {
      const active = await registry.currentOwner();
      if (!active) throw new Error('Fixture owner selection disappeared during seed.');
      const lease = active.ownerId === account.ownerId ? active : await registry.selectOwner(account.ownerId, new Date().toISOString(), active);
      const scope: RealFlightNativeScope = { registry, lease, authorize: () => ({ ownerId: lease.ownerId, storeId: lease.storeId,
        leaseId: lease.leaseId, writable: false }) };
      const selection = await adapter.openRealFlightSelection(scope, false);
      if (!selection) throw new Error(`Missing selected real-flight graph for ${account.key}.`);
      try {
        const opened = await selection.select();
        try {
          const flights = await opened.candidate.list();
          account.flightIds = flights.map(flight => flight.flightId).sort();
          assertEqual(flights.map(flight => flight.sourceFlightRef).sort(), expectedReferences(account.rows), `stored source references ${account.key}`);
        } finally { await opened.candidate.close(); }
      } finally { await selection.close(); }
    }
    const selected = await registry.currentOwner();
    if (!selected) throw new Error('Fixture selection disappeared after source graph readback.');
    if (selected.ownerId !== accountA.ownerId) await registry.selectOwner(accountA.ownerId, new Date().toISOString(), selected);
    manifest.selectedKey = 'A';
    writeManifest(manifest);
  } finally { await registry.close(); }
  const ports = createOwnFlightReadPorts(adapter, { readAuxiliarySections: false });
  for (const key of OWNER_KEYS) {
    const account = accountRecord(manifest, key);
    const selectedForRead = await selectFixtureOwner(adapter, ports, account);
    await inspectAccount(ports, adapter, account, selectedForRead.stalePreviewRejected);
    manifest.selectedKey = key;
    writeManifest(manifest);
  }
  const accountAAfterSwitch = accountRecord(manifest, 'A');
  const finalOwner = await selectFixtureOwner(adapter, ports, accountAAfterSwitch);
  if (finalOwner.lease.ownerId !== accountAAfterSwitch.ownerId) throw new Error('Initial fixture account A selection was not restored.');
  await inspectAccount(ports, adapter, accountAAfterSwitch, finalOwner.stalePreviewRejected);
  manifest.selectedKey = 'A'; manifest.phase = 'ready'; writeManifest(manifest);
  return manifest;
}
function createAccountSelectionAdapter(adapter: RealFlightNativeAdapter, ports: ReturnType<typeof createOwnFlightReadPorts>, initial: StatisticsIsolationManifest) {
  const manifest = initial;
  return {
    manifest,
    adapter,
    ports,
    async select(key: StatisticsIsolationOwnerKey): Promise<StatisticsIsolationAccountReport> {
      const account = accountRecord(manifest, key);
      const selected = await selectFixtureOwner(adapter, ports, account);
      const report = await inspectAccount(ports, adapter, account, selected.stalePreviewRejected);
      if (report.key !== key || selected.lease.ownerId !== account.ownerId) throw new Error(`Fixture switch did not select owner ${key}.`);
      manifest.selectedKey = key;
      writeManifest(manifest);
      return report;
    },
    async cleanup(): Promise<void> {
      const release = await ports.suspend();
      try { await cleanupOwnedRun(manifest); } finally { release(); }
    },
  };
}
async function removeProviderScope(scope: ProviderScope, registryExisted: boolean): Promise<void> {
  const file = defaultDatabaseFile(SCOPE_REGISTRY);
  if (!file.exists) return;
  let removeCreatedDatabase = false;
  const db = await openDriver(SCOPE_REGISTRY);
  try {
    const saved = await readScope(db, scope.owner);
    if (saved && canonical(saved) !== canonical(scope)) throw new Error(`Provider scope ${scope.owner} changed; preserve it.`);
    if (saved) {
      await db.run('DELETE FROM provider_scopes WHERE owner=? AND payload=?', scope.owner, canonical(scope));
      if (await readScope(db, scope.owner)) throw new Error(`Provider scope cleanup was not confirmed for ${scope.owner}.`);
    }
    if (!registryExisted) {
      const remaining = await db.all('SELECT owner,payload FROM provider_scopes');
      const objects = await db.all<{ type: string; name: string }>("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'");
      if (remaining.length === 0 && objects.length === 1 && objects[0]?.type === 'table' && objects[0]?.name === 'provider_scopes') {
        await db.exec('DROP TABLE provider_scopes');
        removeCreatedDatabase = true;
      }
    }
  } finally { await db.close(); }
  if (removeCreatedDatabase) deleteDatabaseAndSidecars(SCOPE_REGISTRY, defaultDatabaseFile(SCOPE_REGISTRY));
}
function deleteDatabaseAndSidecars(name: string, file: File): void {
  if (file.exists) file.delete();
  const directory = SQLite.defaultDatabaseDirectory.startsWith('file:') ? SQLite.defaultDatabaseDirectory : `file://${SQLite.defaultDatabaseDirectory}`;
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = new File(directory, `${name}${suffix}`);
    if (sidecar.exists) sidecar.delete();
  }
}
function removePreviewCache(storeId: string): void {
  const directory = new Directory(Paths.cache, 'moflight-start-preview-v1');
  const file = new File(directory, `start-${storeId}.sqlite`);
  if (file.exists) file.delete();
  for (const suffix of ['-wal', '-shm', '-journal']) {
    const sidecar = new File(directory, `start-${storeId}.sqlite${suffix}`);
    if (sidecar.exists) sidecar.delete();
  }
}

async function cleanupOwnedRun(manifest: StatisticsIsolationManifest): Promise<void> {
  const marker = activeMarker();
  if (!marker.exists) throw new Error('Active fixture marker is missing; preserve all fixture files.');
  const pointer = JSON.parse(await marker.text()) as { version?: unknown; runId?: unknown };
  if (pointer.version !== 1 || pointer.runId !== manifest.runId) throw new Error('Active fixture marker changed; preserve it.');
  const latest = await readManifest(manifest.runId);
  if (canonical(latest) !== canonical(manifest)) throw new Error('Fixture manifest changed; preserve all fixture files.');
  const isolated = realAdapter(manifest.runId);
  const registry = await isolated.openOwnerRegistry(false);
  if (manifest.accounts.length && !registry) throw new Error('Owned fixture registry is missing; preserve all related cache files.');
  try {
    if (registry) {
      const current = await registry.currentOwner();
      const owners = current ? await registry.listOwners(current) : [];
      for (const account of manifest.accounts) {
        const owner = owners.find(value => value.ownerId === account.ownerId);
        if (!owner || owner.storeId !== account.storeId || owner.candidateName !== account.candidateName) {
          throw new Error(`Fixture owner ${account.key} no longer matches its isolated registry; preserve its cache.`);
        }
      }
    }
  } finally { await registry?.close(); }
  for (const account of manifest.accounts) {
    if (account.providerScopeOwned) await removeProviderScope(account.scope, manifest.providerRegistryExisted);
    if (account.previewCacheOwned) removePreviewCache(account.storeId);
  }
  const directory = fixtureDirectory(manifest.runId);
  if (directory.exists) directory.delete();
  if (!marker.exists) throw new Error('Active fixture marker disappeared during cleanup; review remaining files.');
  const finalPointer = JSON.parse(await marker.text()) as { version?: unknown; runId?: unknown };
  if (finalPointer.version !== 1 || finalPointer.runId !== manifest.runId) throw new Error('Active fixture marker changed during cleanup; review remaining files.');
  marker.delete();
}

/** Recover only the exact fixture namespace recorded by its active marker. */
export async function cleanupStatisticsIsolationProof(): Promise<boolean> {
  const marker = activeMarker();
  if (!marker.exists) return false;
  const pointer = JSON.parse(await marker.text()) as { version?: unknown; runId?: unknown };
  if (pointer.version !== 1 || typeof pointer.runId !== 'string') throw new Error('Unrecognized statistics fixture pointer; preserve it.');
  const runId = validateRunId(pointer.runId);
  await cleanupOwnedRun(await readManifest(runId));
  return true;
}

export interface PreparedStatisticsIsolationProof {
  mode: 'seed' | 'reopen';
  fixture: ReturnType<typeof createAccountSelectionAdapter>;
  report: StatisticsIsolationProofReport;
}

export async function prepareStatisticsIsolationProof(progress: (value: string) => void): Promise<PreparedStatisticsIsolationProof> {
  const marker = activeMarker();
  const existed = marker.exists;
  let runId: string;
  if (existed) {
    const pointer = JSON.parse(await marker.text()) as { version?: unknown; runId?: unknown };
    if (pointer.version !== 1 || typeof pointer.runId !== 'string') throw new Error('Unrecognized statistics fixture pointer; preserve it.');
    runId = validateRunId(pointer.runId);
  } else {
    runId = validateRunId(Crypto.randomUUID());
    const directory = fixtureDirectory(runId);
    if (directory.exists) throw new Error('New statistics fixture namespace unexpectedly exists; preserve it.');
    marker.create({ overwrite: false });
    marker.write(JSON.stringify({ version: 1, runId }));
  }
  progress(existed ? 'STATISTICS_ISOLATION_REOPENING' : 'STATISTICS_ISOLATION_SEEDING');
  let manifest: StatisticsIsolationManifest;
  if (existed) {
    manifest = await readManifest(runId);
    if (manifest.phase !== 'ready') throw new Error('A prior statistics fixture seed was interrupted. Preserve its files and review before cleanup.');
  } else {
    manifest = await seedNewRun(runId, progress);
  }
  const adapter = realAdapter(runId);
  const ports = createOwnFlightReadPorts(adapter, { readAuxiliarySections: false });
  const fixture = createAccountSelectionAdapter(adapter, ports, manifest);
  const firstCurrent = accountRecord(manifest, manifest.selectedKey);
  const activeRegistry = await currentRegistry(adapter);
  let current: RealOwnerLease | null = null;
  try { current = await activeRegistry.currentOwner(); }
  finally { await activeRegistry.close(); }
  if (!current || current.ownerId !== firstCurrent.ownerId) throw new Error('Persisted selected fixture owner differs from the manifest.');
  const reports: StatisticsIsolationAccountReport[] = [];
  for (const key of OWNER_KEYS) {
    const account = accountRecord(manifest, key);
    const selected = await selectFixtureOwner(adapter, ports, account);
    reports.push(await inspectAccount(ports, adapter, account, selected.stalePreviewRejected));
  }
  const selectedOriginal = await selectFixtureOwner(adapter, ports, firstCurrent);
  reports[OWNER_KEYS.indexOf(firstCurrent.key)] = await inspectAccount(ports, adapter, firstCurrent, selectedOriginal.stalePreviewRejected);
  manifest.selectedKey = firstCurrent.key;
  writeManifest(manifest);
  const report: StatisticsIsolationProofReport = { version: 1, mode: existed ? 'reopen' : 'seed', offline: true,
    selectedKey: manifest.selectedKey, accounts: reports,
    coverage: 'actual native SQLite owner registry, account-bound real-flight source/capture/flight/facts graph, production reader, production Start cache and production MobileApp shell; synthetic fixture selector only',
    limits: 'Auxiliary provider sections are not part of this fixture. No provider login, network, iOS, phone or release acceptance.' };
  console.info('MOFLIGHT_STATISTICS_ISOLATION ' + JSON.stringify(report));
  progress(existed ? 'STATISTICS_ISOLATION_REOPENED' : 'STATISTICS_ISOLATION_SEEDED');
  return { mode: report.mode, fixture, report };
}

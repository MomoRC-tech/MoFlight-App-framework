import React, { useEffect, useRef, useState } from 'react';
import { Button, Platform, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { canonical } from '@moflight/flight-logbook';
import { openDriver } from '../storage';
import { InformationRun } from '../vereinsflieger/information-run';
import { PROFILE_URL } from '../vereinsflieger/context';
import { OWN_OPEN_TASKS_URL, TASK_SELECTION_PROBE_URL, validateTaskSelection } from '../vereinsflieger/information';
import { SCOPE_SCHEMA, bindScope, readScope, validateScope, type ProviderScope } from '../vereinsflieger/scope-store';
import { clearTaskSelectionRecovery, loadTaskSelectionRecovery, saveTaskSelectionRecovery } from '../vereinsflieger/task-selection-recovery-native';
import { validateTaskSelectionRecovery, type TaskSelectionRecovery } from '../vereinsflieger/task-selection-recovery';

type ProofMode = 'seed' | 'verify';
type ProofPhase = 'preparing' | 'seeded' | 'resuming' | 'passed';
interface ProofMarker {
  version: 1;
  namespace: string;
  phase: ProofPhase;
  registryExistedBefore: boolean;
  scopeAAdded: boolean;
  scopeBAdded: boolean;
  journalAOwned: boolean;
  journalBOwned: boolean;
  providerViewOwned: boolean;
}
interface SimulatedProviderView { version: 1; namespace: string; selected: 'myopen' | 'allopen' }

const REGISTRY = 'vereinsflieger-owner-registry.sqlite';
const JOURNAL_PREFIX = 'vereinsflieger-task-selector-';
const runStage = (run: InformationRun): string => run.stage;
const selectors = [
  { label: 'Alle nicht beendeten Aufgaben', href: '?gselect=allopen' },
  { label: 'Meine nicht beendeten Aufgaben', href: '?gselect=myopen' },
  { label: 'Alle Aufgaben', href: '?gselect=all' },
] as const;
let namespace = '', mode: ProofMode = 'verify';

/** Build-only configuration. This module is never imported by the normal app entry. */
export function configureUpdateProof(value: string, operation: ProofMode) {
  if (!/^[a-z][a-z0-9-]{0,30}$/.test(value) || !['seed', 'verify'].includes(operation)) throw new Error('Invalid task selector proof configuration');
  namespace = value; mode = operation;
}

const check: (condition: unknown, code: string) => asserts condition = (condition, code) => { if (!condition) throw new Error(code); };
const scopeFor = (suffix: 'a' | 'b'): ProviderScope => validateScope({
  version: 1,
  owner: `taskselector-${namespace}-${suffix}`,
  connectionId: `taskselector-${namespace}-${suffix}`,
  context: {
    accountNumber: suffix === 'a' ? '990001' : '990002',
    clubLabel: `Synthetic task proof ${namespace} ${suffix.toUpperCase()}`,
    clubIdentity: 'display-label-only',
    verification: 'observed-profile-number',
  },
});
function namedFile(value: 'marker' | 'provider-view'): File {
  check(/^[a-z][a-z0-9-]{0,30}$/.test(namespace), 'NAMESPACE');
  const name = value === 'marker' ? `task-selector-proof-${namespace}.json` : `task-selector-provider-${namespace}.json`;
  return new File(Paths.document, name);
}
function databaseFile(name: string): File {
  check(/^(?:vereinsflieger-owner-registry\.sqlite(?:-wal|-shm)?|vereinsflieger-task-selector-[0-9a-f]{64}\.sqlite(?:-wal|-shm)?)$/.test(name), 'DATABASE_PATH');
  const directory = SQLite.defaultDatabaseDirectory;
  return new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
}
async function journalName(scope: ProviderScope): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, canonical(validateScope(scope)));
  check(/^[0-9a-f]{64}$/.test(digest), 'SCOPE_HASH');
  return JOURNAL_PREFIX + digest + '.sqlite';
}
function markerShape(value: unknown): ProofMarker {
  check(!!value && typeof value === 'object' && !Array.isArray(value), 'MARKER_SHAPE');
  const marker = value as ProofMarker;
  check(Object.keys(marker).sort().join(',') === 'journalAOwned,journalBOwned,namespace,phase,providerViewOwned,registryExistedBefore,scopeAAdded,scopeBAdded,version', 'MARKER_FIELDS');
  check(marker.version === 1 && marker.namespace === namespace, 'MARKER_SCOPE');
  check(['preparing', 'seeded', 'resuming', 'passed'].includes(marker.phase), 'MARKER_PHASE');
  for (const field of ['registryExistedBefore', 'scopeAAdded', 'scopeBAdded', 'journalAOwned', 'journalBOwned', 'providerViewOwned'] as const) check(typeof marker[field] === 'boolean', 'MARKER_FLAGS');
  return marker;
}
async function saveMarker(marker: ProofMarker): Promise<void> {
  const target = namedFile('marker'), text = canonical(markerShape(marker));
  if (!target.exists) target.create({ overwrite: false });
  target.write(text);
  check(await target.text() === text, 'MARKER_READBACK');
}
async function loadMarker(): Promise<ProofMarker> {
  const target = namedFile('marker'); check(target.exists, 'MARKER_MISSING');
  const text = await target.text(); check(text.length <= 4096, 'MARKER_SIZE');
  return markerShape(JSON.parse(text));
}
function initialMarker(registryExistedBefore: boolean): ProofMarker {
  return { version: 1, namespace, phase: 'preparing', registryExistedBefore, scopeAAdded: false, scopeBAdded: false,
    journalAOwned: false, journalBOwned: false, providerViewOwned: false };
}

async function readProviderView(): Promise<SimulatedProviderView> {
  const target = namedFile('provider-view'); check(target.exists, 'PROVIDER_VIEW_MISSING');
  const value: unknown = JSON.parse(await target.text());
  check(!!value && typeof value === 'object' && !Array.isArray(value), 'PROVIDER_VIEW_SHAPE');
  const view = value as SimulatedProviderView;
  check(Object.keys(view).sort().join(',') === 'namespace,selected,version' && view.version === 1 && view.namespace === namespace && ['myopen', 'allopen'].includes(view.selected), 'PROVIDER_VIEW_VALUE');
  return view;
}
async function writeProviderView(marker: ProofMarker, selected: SimulatedProviderView['selected']): Promise<void> {
  const target = namedFile('provider-view');
  if (!target.exists) {
    marker.providerViewOwned = true; await saveMarker(marker);
    target.create({ overwrite: false });
  } else check(marker.providerViewOwned, 'PROVIDER_VIEW_COLLISION');
  const value: SimulatedProviderView = { version: 1, namespace, selected }, text = canonical(value);
  target.write(text); check(await target.text() === text, 'PROVIDER_VIEW_READBACK');
}

async function appendSyntheticScopes(marker: ProofMarker, registryExistedBefore: boolean): Promise<void> {
  const registry = await openDriver(REGISTRY);
  try {
    const schema = await registry.first<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' AND name='provider_scopes'");
    if (registryExistedBefore) check(!!schema, 'REGISTRY_SCHEMA');
    if (!schema) await registry.exec(SCOPE_SCHEMA);
    const a = scopeFor('a'), b = scopeFor('b');
    check(await readScope(registry, a.owner) === null && await readScope(registry, b.owner) === null, 'SCOPE_COLLISION');
    marker.scopeAAdded = true; await saveMarker(marker); await bindScope(registry, a);
    marker.scopeBAdded = true; await saveMarker(marker); await bindScope(registry, b);
    check(canonical(await readScope(registry, a.owner)) === canonical(a) && canonical(await readScope(registry, b.owner)) === canonical(b), 'SCOPE_READBACK');
  } finally { await registry.close(); }
}

async function seedProof(): Promise<void> {
  const markerFile = namedFile('marker'), providerView = namedFile('provider-view');
  check(!markerFile.exists && !providerView.exists, 'NAMESPACE_ALREADY_USED');
  const scopeA = scopeFor('a'), scopeB = scopeFor('b'), nameA = await journalName(scopeA), nameB = await journalName(scopeB);
  check(!databaseFile(nameA).exists && !databaseFile(nameB).exists, 'JOURNAL_COLLISION');
  const registryExistedBefore = databaseFile(REGISTRY).exists;
  const marker = initialMarker(registryExistedBefore); await saveMarker(marker);
  await appendSyntheticScopes(marker, registryExistedBefore);

  const run = new InformationRun(scopeA, 'tasks', OWN_OPEN_TASKS_URL, `taskselector-${namespace}-seed`);
  run.observeNavigation(TASK_SELECTION_PROBE_URL);
  const selectionAction = run.accept(TASK_SELECTION_PROBE_URL, TASK_SELECTION_PROBE_URL, {
    kind: 'vf-information-task-selection-v1', nonce: run.messageNonce, url: TASK_SELECTION_PROBE_URL,
    selection: { selected: selectors[0].label, options: selectors },
  });
  check(selectionAction === 'navigate' && runStage(run) === 'before', 'SEED_SELECTOR');
  run.observeNavigation(PROFILE_URL);
  const profileAction = run.accept(PROFILE_URL, PROFILE_URL, { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scopeA.context });
  check(profileAction === 'navigate' && runStage(run) === 'read' && run.url === OWN_OPEN_TASKS_URL, 'SEED_PROFILE');

  marker.journalAOwned = true; await saveMarker(marker);
  const checkpoint = run.createTaskSelectionRecovery();
  const saved = await saveTaskSelectionRecovery(scopeA, checkpoint);
  run.recordTaskSelectionRecovery(saved);
  check(canonical(await loadTaskSelectionRecovery(scopeA)) === canonical(saved), 'SEED_JOURNAL_READBACK');
  await writeProviderView(marker, 'myopen');
  marker.phase = 'seeded'; await saveMarker(marker);
}

function recoveryRun(scopeA: ProviderScope): InformationRun {
  return new InformationRun(scopeA, 'tasks', OWN_OPEN_TASKS_URL, `taskselector-${namespace}-resume`);
}
function acceptProfile(run: InformationRun, scope: ProviderScope): 'navigate' | 'save' | 'restored' | 'ignored' {
  run.observeNavigation(PROFILE_URL);
  return run.accept(PROFILE_URL, PROFILE_URL, { kind: 'vf-context-v1', nonce: run.messageNonce, url: PROFILE_URL, context: scope.context });
}

async function removeOwnedFile(name: string): Promise<void> {
  const target = databaseFile(name);
  if (target.exists) target.delete();
  for (const suffix of ['-wal', '-shm']) { const sidecar = databaseFile(name + suffix); if (sidecar.exists) sidecar.delete(); }
}
async function cleanupOwned(marker: ProofMarker): Promise<void> {
  const scopeA = scopeFor('a'), scopeB = scopeFor('b');
  const registryFile = databaseFile(REGISTRY);
  if (!registryFile.exists) check(!marker.registryExistedBefore && !marker.scopeAAdded && !marker.scopeBAdded && marker.phase === 'passed', 'CLEANUP_REGISTRY_MISSING');
  else if (marker.scopeAAdded || marker.scopeBAdded)
    check(await loadTaskSelectionRecovery(scopeA) === null && await loadTaskSelectionRecovery(scopeB) === null, 'CLEANUP_PENDING');
  else check(marker.phase === 'passed', 'CLEANUP_SCOPE_OWNERSHIP');
  if (marker.journalAOwned) await removeOwnedFile(await journalName(scopeA));
  if (marker.journalBOwned) await removeOwnedFile(await journalName(scopeB));
  if (marker.providerViewOwned) { const view = namedFile('provider-view'); if (view.exists) view.delete(); marker.providerViewOwned = false; await saveMarker(marker); }

  let removeNewRegistry = false;
  if (databaseFile(REGISTRY).exists) {
    const registry = await openDriver(REGISTRY);
    try {
      await registry.transaction(async tx => {
        for (const [scope, owned] of [[scopeA, marker.scopeAAdded], [scopeB, marker.scopeBAdded]] as const) {
          if (!owned) continue;
          const row = await tx.first<{ payload: string }>('SELECT payload FROM provider_scopes WHERE owner=?', scope.owner);
          if (row) {
            check(row.payload === canonical(scope), 'CLEANUP_SCOPE_MISMATCH');
            await tx.run('DELETE FROM provider_scopes WHERE owner=? AND payload=?', scope.owner, canonical(scope));
          }
          check(await tx.first('SELECT owner FROM provider_scopes WHERE owner=?', scope.owner) === null, 'CLEANUP_SCOPE_REMAINS');
        }
      });
      marker.scopeAAdded = false; marker.scopeBAdded = false; await saveMarker(marker);
      if (!marker.registryExistedBefore) {
        const tables = await registry.all<{ type: string; name: string }>("SELECT type,name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name");
        const rows = await registry.first<{ count: number }>('SELECT count(*) AS count FROM provider_scopes');
        removeNewRegistry = canonical(tables) === canonical([{ type: 'table', name: 'provider_scopes' }]) && rows?.count === 0;
      }
    } finally { await registry.close(); }
  } else if (marker.registryExistedBefore) throw new Error('CLEANUP_REGISTRY_MISSING');

  if (removeNewRegistry) await removeOwnedFile(REGISTRY);
  const markerFile = namedFile('marker'); if (markerFile.exists) markerFile.delete();
}

async function resumeProof(input: ProofMarker): Promise<void> {
  const marker = markerShape(input);
  if (marker.phase === 'passed') { await cleanupOwned(marker); return; }
  check(marker.phase === 'seeded' || marker.phase === 'resuming', 'MARKER_NOT_SEEDED');
  marker.phase = 'resuming'; await saveMarker(marker);
  const scopeA = scopeFor('a'), scopeB = scopeFor('b'), nameA = await journalName(scopeA), nameB = await journalName(scopeB);
  const view = await readProviderView(); check(view.selected === 'myopen', 'SIMULATED_VIEW_NOT_ORIGINAL');
  const pending = await loadTaskSelectionRecovery(scopeA); check(!!pending, 'PENDING_A_MISSING');
  const expected = validateTaskSelectionRecovery(pending, scopeA);
  check(canonical(pending) === canonical(expected), 'PENDING_A_CHANGED');
  check(await loadTaskSelectionRecovery(scopeB) === null && !databaseFile(nameB).exists, 'SCOPE_B_NOT_EMPTY');

  const forged = { ...pending, attemptId: `forged-${namespace}` };
  let forgedClearRejected = false;
  try { await clearTaskSelectionRecovery(scopeA, forged); } catch { forgedClearRejected = true; }
  check(forgedClearRejected && canonical(await loadTaskSelectionRecovery(scopeA)) === canonical(pending), 'FORGED_CLEAR');
  let foreignClearRejected = false;
  try { await clearTaskSelectionRecovery(scopeB, pending); } catch { foreignClearRejected = true; }
  check(foreignClearRejected && canonical(await loadTaskSelectionRecovery(scopeA)) === canonical(pending) && !databaseFile(nameB).exists, 'FOREIGN_CLEAR');

  const foreignRun = recoveryRun(scopeA); foreignRun.resumeTaskSelectionRecovery(pending);
  let foreignProfileRejected = false;
  try { acceptProfile(foreignRun, scopeB); } catch { foreignProfileRejected = true; }
  check(foreignProfileRejected && runStage(foreignRun) === 'recovery-before' && foreignRun.url === PROFILE_URL, 'FOREIGN_PROFILE');
  check(canonical(await loadTaskSelectionRecovery(scopeA)) === canonical(pending), 'FOREIGN_PROFILE_CLEARED');

  const run = recoveryRun(scopeA); run.resumeTaskSelectionRecovery(pending);
  check(acceptProfile(run, scopeA) === 'navigate' && runStage(run) === 'recovery-restore' && run.url === pending.restoreUrl, 'RESTORE_ROUTE');
  const selection = { selected: selectors[0].label, options: selectors };
  const observed = validateTaskSelection(selection);
  check(observed.restoreUrl === pending.restoreUrl, 'ALLOWLISTED_RESTORE_URL');
  run.observeNavigation(observed.restoreUrl);
  const restoreAction = run.accept(observed.restoreUrl, observed.restoreUrl, {
    kind: 'vf-information-task-restore-v1', nonce: run.messageNonce, url: observed.restoreUrl, selection,
  });
  check(restoreAction === 'navigate' && runStage(run) === 'before', 'EXACT_SELECTOR_READBACK');

  await clearTaskSelectionRecovery(scopeA, pending);
  run.clearTaskSelectionRecovery(pending);
  check(await loadTaskSelectionRecovery(scopeA) === null, 'PENDING_A_NOT_CLEARED');
  check(await loadTaskSelectionRecovery(scopeB) === null && !databaseFile(nameB).exists, 'SCOPE_B_CHANGED');
  await writeProviderView(marker, 'allopen');
  check((await readProviderView()).selected === 'allopen', 'SIMULATED_VIEW_NOT_RESTORED');
  marker.phase = 'passed'; await saveMarker(marker);
  await cleanupOwned(marker);
}
let running = false;
export default function AndroidTaskSelectorRecoveryPoc() {
  const [status, setStatus] = useState('SYNTHETIC TASK_SELECTOR_PROOF_STARTING');
  const [ready, setReady] = useState<ProofMarker | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    void (async () => {
      check(Platform.OS === 'android', 'ANDROID_ONLY'); check(!!namespace, 'CONFIGURATION');
      if (!namedFile('marker').exists && mode === 'seed') {
        await seedProof(); setStatus('SYNTHETIC TASK_SELECTOR_PROOF_SEEDED action=force-stop-and-relaunch');
        return;
      }
      const marker = await loadMarker();
      check(['seeded', 'resuming', 'passed'].includes(marker.phase), 'MARKER_NOT_READY');
      setReady(marker); setStatus('SYNTHETIC TASK_SELECTOR_PROOF_READY action=explicit-resume');
    })().catch(() => setStatus('SYNTHETIC TASK_SELECTOR_PROOF_FAILED stage=initialization'));
  }, []);

  async function resume() {
    if (running || !ready) return; running = true; setReady(null); setStatus('SYNTHETIC TASK_SELECTOR_PROOF_RUNNING');
    try {
      const marker = await loadMarker();
      await resumeProof(marker);
      setStatus('SYNTHETIC TASK_SELECTOR_PROOF_PASSED scopeRows=2 foreignGuards=3 selectorReadback=1 cleanup=complete');
    } catch { setStatus('SYNTHETIC TASK_SELECTOR_PROOF_FAILED stage=resume evidence=preserved'); }
    finally { running = false; }
  }
  return <View style={{ padding: 24, gap: 16 }}>
    <Text accessibilityLabel={status}>{status}</Text>
    {ready && <Button title="Resume synthetic proof" onPress={() => { void resume(); }} />}
  </View>;
}

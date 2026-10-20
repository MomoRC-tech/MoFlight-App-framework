import React, { useEffect, useRef, useState } from 'react';
import { Button, Platform, ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { canonical } from '@moflight/flight-logbook';
import { RealFlightLibrary, type RealFlightFault } from '../vereinsflieger/real-flight-library';
import { RealFlightCommandJournal } from '../vereinsflieger/real-flight-command-journal';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import type { RealFlightCommand } from '../vereinsflieger/real-flight-library-model';
import { RECOVERY_AT, RECOVERY_CASES, RECOVERY_MANIFEST, RECOVERY_OWNER, RECOVERY_STORE,
  recoveryCommandId, recoveryFileName, recoveryPermit, recoverySource, type RecoveryCase } from './android-core-recovery-fixture';

/**
 * Unimported by the normal app. Build-only entry for the designated synthetic
 * Android application. No provider, owner registry, production paths or reset.
 * At READY_TO_STOP, force-stop the process and relaunch this same binary.
 * No timeout releases the paused transaction; recovery must run in a new process.
 */
const marker = () => new File(Paths.document, 'native-recovery-progress-v1.json');
const backupFile = () => new File(Paths.document, 'native-recovery-restore-record-backup.json');
const commandFile = (caseName: RecoveryCase) => new File(Paths.document, `native-recovery-${caseName}-expected-command.json`);
const hash = (text: string) => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text);
type Phase = 'idle' | 'running' | 'awaiting-stop' | 'passed' | 'failed';
interface Progress { version: 1; phase: Phase; passed: RecoveryCase[]; current: RecoveryCase | null }
const initial: Progress = { version: 1, phase: 'idle', passed: [], current: null };
const check: (condition: unknown, code: string) => asserts condition = (condition, code) => {
  if (!condition) throw new Error(code);
};
function validateProgress(value: unknown): Progress {
  check(!!value && typeof value === 'object' && !Array.isArray(value), 'MARKER_SHAPE');
  const item = value as Progress;
  check(Object.keys(item).sort().join(',') === 'current,passed,phase,version' && item.version === 1, 'MARKER_VERSION');
  check(['idle', 'running', 'awaiting-stop', 'passed', 'failed'].includes(item.phase), 'MARKER_PHASE');
  check(Array.isArray(item.passed) && item.passed.length <= RECOVERY_CASES.length &&
    item.passed.every((name, index) => name === RECOVERY_CASES[index]), 'MARKER_RESULTS');
  check(item.current === null || RECOVERY_CASES.includes(item.current), 'MARKER_CASE');
  if (item.phase === 'running' || item.phase === 'awaiting-stop') {
    check(item.current === RECOVERY_CASES[item.passed.length], 'MARKER_SEQUENCE');
  }
  if (item.phase === 'passed') check(item.current === item.passed.at(-1), 'MARKER_PASSED');
  return item;
}
async function saveProgress(progress: Progress): Promise<void> {
  validateProgress(progress);
  const file = marker(), text = canonical(progress);
  if (!file.exists) file.create({ overwrite: false });
  file.write(text);
  check(await file.text() === text, 'MARKER_READBACK');
}
const driver = (caseName: RecoveryCase, kind: 'library' | 'commands' | 'candidate') =>
  openRealFlightNativeDriver(recoveryFileName(caseName, kind), (name, options) => SQLite.openDatabaseAsync(name, options));
const openLibrary = async (caseName: RecoveryCase, kind: 'library' | 'candidate' = 'library', fault?: RealFlightFault) =>
  RealFlightLibrary.open(await driver(caseName, kind), RECOVERY_OWNER, RECOVERY_STORE, hash, recoveryPermit, fault);
const openJournal = async (caseName: RecoveryCase, create = false) => RealFlightCommandJournal.open(
  await driver(caseName, 'commands'), RECOVERY_OWNER, RECOVERY_STORE, recoveryPermit, hash, create);

async function seed(caseName: RecoveryCase): Promise<RealFlightLibrary> {
  // create refuses existing nonempty databases. A failed attempt is preserved.
  const library = await RealFlightLibrary.create(await driver(caseName, 'library'), RECOVERY_MANIFEST, hash, recoveryPermit);
  await library.bindAccount({ kind: 'bind', commandId: recoveryCommandId(1), baseGeneration: 0,
    source: recoverySource(`native-recovery-${caseName}-binding`), at: RECOVERY_AT });
  return library;
}
async function importCommand(library: RealFlightLibrary, caseName: RecoveryCase): Promise<RealFlightCommand> {
  const source = recoverySource(`native-recovery-${caseName}-import`), plan = await library.prepareImport(source);
  return { version: 1, kind: 'import-unassigned', ownerId: RECOVERY_OWNER, storeId: RECOVERY_STORE,
    commandId: recoveryCommandId(2), baseGeneration: plan.baseGeneration, bindingId: plan.bindingId,
    planToken: plan.planToken, source, at: RECOVERY_AT };
}
async function verifyOneFlight(library: RealFlightLibrary): Promise<void> {
  const graph = await library.snapshot(), flights = await library.list();
  check(graph.generation === 2 && graph.receipts.length === 2, 'GENERATION_OR_RECEIPTS');
  check(flights.length === 1, 'FLIGHT_COUNT');
  const detail = await library.detail(flights[0]!.flightId);
  check(detail?.factHistory.length === 1 && detail.facts.assessment.durations.flight.minutes === 12, 'FACT_HISTORY');
}
async function startCase(progress: Progress, publish: (text: string) => void): Promise<void> {
  const caseName = RECOVERY_CASES[progress.passed.length]; check(caseName, 'NO_NEXT_CASE');
  const running: Progress = { ...progress, current: caseName, phase: 'running' };
  await saveProgress(running);
  const pause: RealFlightFault = async stage => {
    if (stage !== caseName) return;
    await saveProgress({ ...running, phase: 'awaiting-stop' });
    publish(`READY_TO_STOP:${caseName}`);
    await new Promise<void>(() => { /* Only Android process termination may continue this trial. */ });
  };
  const original = await seed(caseName), command = await importCommand(original, caseName);
  if (caseName === 'restore-record') {
    await original.commit(command); await verifyOneFlight(original);
    const backup = await original.exportBackup(); await original.close();
    const file = backupFile(); check(!file.exists, 'BACKUP_COLLISION');
    file.create({ overwrite: false }); file.write(backup); check(await file.text() === backup, 'BACKUP_READBACK');
    const restored = await RealFlightLibrary.restoreIntoEmptyValidated(await driver(caseName, 'candidate'), backup,
      RECOVERY_OWNER, RECOVERY_STORE, hash, recoveryPermit, pause);
    await restored.close();
  } else {
    const expected = commandFile(caseName), text = canonical(command);
    check(!expected.exists, 'COMMAND_FILE_COLLISION'); expected.create({ overwrite: false }); expected.write(text);
    check(await expected.text() === text, 'COMMAND_FILE_READBACK');
    const journal = await openJournal(caseName, true);
    try { await journal.prepare(command); } finally { await journal.close(); }
    await original.close();
    const interrupted = await openLibrary(caseName, 'library', pause);
    try { await interrupted.commit(command); } finally { await interrupted.close(); }
  }
  throw new Error('INTERRUPTION_NOT_REACHED');
}
async function recoverCase(caseName: RecoveryCase): Promise<void> {
  if (caseName === 'restore-record') {
    const backup = await backupFile().text(), original = await openLibrary(caseName);
    try { check(await original.exportBackup() === backup, 'ORIGINAL_CHANGED'); await verifyOneFlight(original); }
    finally { await original.close(); }
    const candidate = await openLibrary(caseName, 'candidate');
    try {
      const graph = await candidate.snapshot();
      check(graph.generation === 0 && graph.records.length === 0 && graph.receipts.length === 0, 'PARTIAL_RESTORE_PUBLISHED');
    } finally { await candidate.close(); }
    const restored = await RealFlightLibrary.restoreIntoEmptyValidated(await driver(caseName, 'candidate'), backup,
      RECOVERY_OWNER, RECOVERY_STORE, hash, recoveryPermit);
    try { check(await restored.exportBackup() === backup, 'RESTORE_MISMATCH'); await verifyOneFlight(restored); }
    finally { await restored.close(); }
    const reopened = await openLibrary(caseName, 'candidate');
    try { check(await reopened.exportBackup() === backup, 'RESTORE_REOPEN_MISMATCH'); }
    finally { await reopened.close(); }
    return;
  }
  const library = await openLibrary(caseName), journal = await openJournal(caseName);
  try {
    const command = await journal.pending();
    check(command?.commandId === recoveryCommandId(2) && command.source.capture.captureId === `native-recovery-${caseName}-import`, 'PENDING_COMMAND');
    check(canonical(command) === await commandFile(caseName).text(), 'PENDING_COMMAND_CHANGED');
    const receipt = await library.recoverReceipt(command.commandId);
    check(receipt.status === (caseName === 'after-commit' ? 'found' : 'not-found'), 'RECEIPT_BOUNDARY');
    if (caseName === 'after-facts') {
      const graph = await library.snapshot();
      check(graph.generation === 1 && graph.receipts.length === 1 && (await library.list()).length === 0, 'ROLLBACK_FAILED');
      check(!graph.records.some(record => record.kind === 'facts' || record.kind === 'flight' || record.kind === 'coverage'), 'UNCOMMITTED_RECORDS');
    }
    const result = await library.commit(command);
    if (receipt.status === 'found') check(canonical(receipt.result) === canonical(result), 'RECEIPT_CHANGED');
    await journal.resolve(command.commandId, 'committed'); check(await journal.pending() === null, 'JOURNAL_NOT_RESOLVED');
    await verifyOneFlight(library);
  } finally { await journal.close(); await library.close(); }
  const reopened = await openLibrary(caseName), reopenedJournal = await openJournal(caseName);
  try { await verifyOneFlight(reopened); check(await reopenedJournal.pending() === null, 'JOURNAL_REOPEN'); }
  finally { await reopenedJournal.close(); await reopened.close(); }
}

export default function AndroidCoreRecoveryPoc() {
  const [status, setStatus] = useState('INITIALIZING');
  const [progress, setProgress] = useState<Progress>(initial);
  const [busy, setBusy] = useState(true);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return; started.current = true;
    void (async () => {
      check(Platform.OS === 'android', 'ANDROID_ONLY');
      const file = marker(); const current = file.exists ? validateProgress(JSON.parse(await file.text())) : initial;
      setProgress(current);
      check(current.phase !== 'running' && current.phase !== 'failed', 'INCOMPLETE_OR_FAILED_ATTEMPT_PRESERVED');
      if (current.phase === 'awaiting-stop') {
        check(current.current, 'MISSING_CASE'); setStatus(`RECOVERING:${current.current}`);
        await recoverCase(current.current);
        const passed: Progress = { ...current, phase: 'passed', passed: [...current.passed, current.current] };
        await saveProgress(passed); setProgress(passed); setStatus(`PASS:${current.current}`);
      } else setStatus(current.phase === 'passed' ? `PASS:${current.current}` : 'READY');
      setBusy(false);
    })().catch(error => { setStatus(`FAIL:${error instanceof Error ? error.message : 'UNKNOWN'}`); });
  }, []);
  const run = () => {
    if (busy) return; setBusy(true); setStatus('STARTING');
    void startCase(progress, setStatus).catch(async error => {
      setStatus(`FAIL:${error instanceof Error ? error.message : 'UNKNOWN'}`);
      const file = marker();
      if (file.exists) {
        const current = validateProgress(JSON.parse(await file.text())); await saveProgress({ ...current, phase: 'failed' });
      }
    });
  };
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 56, gap: 20 }}>
    <Text accessibilityRole="header">Synthetic Android core recovery PoC</Text>
    <Text>Fixture-only files. Force-stop only the designated synthetic application at READY_TO_STOP.</Text>
    <Text selectable accessibilityLabel={status}>{status}</Text>
    <Text>{`PASSED_CASES:${progress.passed.join(',') || 'none'}`}</Text>
    {progress.passed.length === RECOVERY_CASES.length ? <Text>ALL_CASES_PASSED</Text> :
      <View><Button title="Run next case" disabled={busy} onPress={run} /></View>}
  </ScrollView>;
}

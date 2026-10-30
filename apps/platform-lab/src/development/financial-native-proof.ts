import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import { PilotBooks } from '../../../../packages/local-data/src/books';
import { RealFlightLibrary } from '../vereinsflieger/real-flight-library';
import { decodeFlightBillingObservation } from '../vereinsflieger/expense-flight-billing';
import { createFinancialNativeAdapter } from '../vereinsflieger/expense-native-adapter';
import type { FinancialObservationTarget } from '../vereinsflieger/expense-ledger-observation';
import type { RealFlightNativeScope } from '../vereinsflieger/real-flight-native';
import { createUserBackup, createUserBackupV4, emptyUserChatArchive, validateUserBackup, type UserBackupInputV3 } from '../user-backup';
import { encodeChatArchive } from '../ai/chat-model';
import { restoreUserBackup, type UserBackupServicePorts } from '../user-backup-service';
import { UserBackupRestoreJournal } from '../user-backup-restore-journal';

const ownerId = 'f1aace00-1111-4111-8111-111111111111';
const connectionId = 'f1aace00-2222-4222-8222-222222222222';
const leaseId = 'f1aace00-3333-4333-8333-333333333333';
const at = '2026-10-30T12:00:00.000Z';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const noop = async () => {};
export const FINANCIAL_PROOF_LIMITATION = 'Synthetic native files and production codecs/financial selector/journal; injected owner registry and non-financial restore ports. No provider/WebView, SAF, production activation, update, phone or iOS acceptance.';
export interface FinancialProofEnvironment {
  /** A fresh UUID per run; every path below is inside this synthetic namespace. */
  id: string;
  open(name: string, create: boolean): Promise<Driver | null>;
  exists(name: string): boolean;
  reserve(name: string): void;
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  hash: Hash;
  uuid(): string;
  clock(): number;
}
export interface FinancialProofSample { stage: string; elapsedMs: number; outcome: 'passed' | 'failed' }
export interface FinancialProofReport {
  version: 1; id: string; state: 'passed' | 'failed'; checks: string[]; samples: FinancialProofSample[]; limitation: string;
}
function targetFor(id: string): FinancialObservationTarget {
  if (!uuid.test(id)) throw Error('Invalid synthetic financial proof identity.');
  return { storeId: id, scope: { version: 1, owner: ownerId, connectionId, context: {
    accountNumber: '999990101', clubLabel: 'Synthetic financial proof', clubIdentity: 'display-label-only', verification: 'observed-profile-number',
  } } };
}
function observation(target: FinancialObservationTarget) {
  const detail = 'https://vereinsflieger.de/member/profile/viewflight.php?flid=999990101';
  return decodeFlightBillingObservation({ url: detail, sourceFlightId: '999990101', registrationRaw: 'D-TEST', dateRaw: '31.05.2026',
    billingModeRaw: 'Pilot', billedRaw: 'Ja', clubLabel: target.scope.context.clubLabel,
    lines: [{ position: 0, recipientRaw: 'Example, Alex', descriptionRaw: 'SYNTHETIC - Flight fee', amountRaw: '6,40 EUR' }], statedTotalRaw: '6,40 EUR',
  }, { ...target, ownRecipientLabel: 'Example, Alex', observedDetailUrl: detail }, target, target.scope.context, target.scope.context, at);
}
function setup(env: FinancialProofEnvironment, gate: () => Promise<void>) {
  const target = targetFor(env.id);
  const scope: RealFlightNativeScope = { lease: { version: 1, ownerId, storeId: env.id, leaseId, selectionSeq: 1, selectedAt: at,
    createdAt: at, candidateName: 'synthetic-financial-proof.sqlite' },
    authorize: () => ({ ownerId, storeId: env.id, leaseId, writable: true }),
    registry: { async assertCurrent(lease, owner, store) {
      await gate(); if (lease.ownerId !== ownerId || lease.storeId !== env.id || lease.leaseId !== leaseId || owner !== ownerId || store !== env.id) throw Error('Foreign synthetic financial lease.');
    } },
  };
  async function openJournal(create: boolean) {
    const db = await env.open('journal.sqlite', create); return db ? UserBackupRestoreJournal.open(db, create) : null;
  }
  const adapter = () => createFinancialNativeAdapter({
    file(name) { return { get exists() { return env.exists(name); }, create() { env.reserve(name); } }; },
    openDriver: async name => { const db = await env.open(name, true); if (!db) throw Error('Synthetic financial file unavailable.'); return db; },
    hash: env.hash, currentProviderScope: async () => target.scope,
    async assertRecovery(permit) {
      await gate(); const journal = await openJournal(false);
      try {
        const pending = await journal?.pending();
        if (permit && (!pending || permit.operationId !== pending.operationId || permit.ownerId !== pending.ownerId || permit.storeId !== pending.storeId) || pending && !permit) throw Error('Synthetic aggregate recovery is pending.');
      } finally { await journal?.close(); }
    },
  });
  return { target, scope, adapter, openJournal };
}
async function requiredDb(env: FinancialProofEnvironment, name: string) {
  const db = await env.open(name, true); if (!db) throw Error('Synthetic proof database unavailable.'); return db;
}
/** Every file is newly namespaced; no registry, selected-user store or provider is changed. */
export async function runFinancialNativeProof(env: FinancialProofEnvironment, gate: () => Promise<void>): Promise<FinancialProofReport> {
  const report: FinancialProofReport = { version: 1, id: env.id, state: 'failed', checks: [], samples: [], limitation: FINANCIAL_PROOF_LIMITATION };
  const started = env.clock();
  async function step<T>(stage: string, work: () => Promise<T>): Promise<T> {
    const began = env.clock();
    try { await gate(); const result = await work(); await gate(); report.samples.push({ stage, elapsedMs: Math.max(0, env.clock() - began), outcome: 'passed' }); return result; }
    catch (error) { report.samples.push({ stage, elapsedMs: Math.max(0, env.clock() - began), outcome: 'failed' }); throw error; }
  }
  try {
    const { target, scope, adapter, openJournal } = setup(env, gate); let native = adapter();
    await step('raw-save-reopen', async () => {
      await native.withCurrentStore(scope, target, gate, async store => { await store.save('synthetic-billed-1', 'billed-flight', observation(target)); });
      const saved = await adapter().exportSection(scope, gate);
      if (saved.state !== 'present') throw Error('Synthetic receipt was not reopened.');
    }); report.checks.push('native raw receipt persists across closed SQLite handles');
    const section = await native.exportSection(scope, gate); if (section.state === 'absent') throw Error('Missing synthetic financial section.');
    const sourceArchiveHash = await env.hash(section.archive);
    const input = await step('fixture-libraries', async (): Promise<UserBackupInputV3> => {
      const pilot = new PilotBooks(await requiredDb(env, 'pilot-source.sqlite'), 'synthetic-pilot', env.hash);
      let pilotBackup: string;
      try { await pilot.initialize(); await pilot.createBook({ id: 'proof-book', owner: 'synthetic-pilot', name: 'Synthetic preservation',
        format: 'synthetic-powered-five-row-v1', classes: ['glider'], from: '2026-01-01', through: null });
        await pilot.saveState('proof-book', 'pending', { syntheticDraft: true }); pilotBackup = await pilot.backup();
      } finally { await pilot.db.close(); }
      const real = await RealFlightLibrary.create(await requiredDb(env, 'real-source.sqlite'), { singleton: 1, family: 'moflight-real-flight-history',
        schema_version: 1, payload_version: 1, owner_id: ownerId, store_id: env.id, created_at: at }, env.hash,
      () => ({ ownerId, storeId: env.id, leaseId, writable: true }));
      let realBackup: string; try { realBackup = await real.exportBackup(); } finally { await real.close(); }
      return { createdAt: at, ownerId, storeId: env.id,
        pilot: { ownerId: 'synthetic-pilot', backup: pilotBackup, displayName: 'Synthetic financial proof', selectedBookId: 'proof-book' },
        realFlights: { backup: realBackup }, information: null, ai: { archive: encodeChatArchive(emptyUserChatArchive(ownerId)) }, dutyTargets: { scope: null, targets: [] } };
    });
    const text = await step('archive-file-roundtrip', async () => {
      const text = await createUserBackupV4({ ...input, financial: section }, env.hash);
      await env.write('archive.json', text);
      if (await env.read('archive.json') !== text) throw Error('Synthetic archive file readback differs.');
      await validateUserBackup(text, { ownerId, storeId: env.id, informationScope: null, financialTarget: target }, env.hash);
      return text;
    });
    report.checks.push('v4 text archive file verifies exact financial and pending pilot data');
    await native.withCurrentStore(scope, target, gate, async store => { const next = observation(target); next.source.lines[0]!.amountRaw = '7,40 EUR'; next.source.statedTotalRaw = '7,40 EUR'; await store.save('synthetic-billed-2', 'billed-flight', next); });
    const original = await native.exportSection(scope, gate); if (original.state === 'absent') throw Error('Synthetic original disappeared.');
    const originalHash = await env.hash(original.archive);
    let pickedText = text, loseAck = true, resume: string | undefined, financialCalls = 0;
    const ports: UserBackupServicePorts = {
      hash: env.hash, uuid: env.uuid, now: () => at, openJournal,
      io: { pickBackup: async () => ({ canceled: false, assets: [{ uri: 'synthetic-proof://archive' }] }), readPickedFile: async () => pickedText },
      currentInformationScope: async () => null,
      async stagePilot(p) { const pilot = new PilotBooks(await requiredDb(env, p.candidateName), 'synthetic-pilot', env.hash);
        try { await pilot.initialize(); if (await pilot.backup() !== p.backup) await pilot.restore(p.backup); if (await pilot.backup() !== p.backup) throw Error('Synthetic pilot readback differs.'); } finally { await pilot.db.close(); } },
      async activatePilot() {}, async restoreRealFlights() { return 'already-activated'; }, async restoreInformation() { throw Error('Unexpected synthetic information.'); },
      preflightDutyTargets: noop, restoreDutyTargets: noop, restoreAi: noop,
      financial: {
        currentTarget: async () => { financialCalls++; return native.currentTarget({ ...scope, backupRestoreOperationId: resume }, gate); },
        preflight: (s, guard) => native.preflight({ ...scope, backupRestoreOperationId: resume }, s, guard),
        async restore({ section: s, permit }, guard) { financialCalls++; await native.restore(scope, s, permit, guard); if (loseAck) { loseAck = false; throw Error('Synthetic lost acknowledgement'); } },
      },
    };
    const first = await step('restore-interrupted-ack', () => restoreUserBackup(ownerId, env.id, gate, ports));
    if (first.state !== 'recovery-required') throw Error('Synthetic acknowledgement loss did not retain recovery.');
    await step('pending-read-gate', async () => {
      let rejected = false; try { await native.exportSection(scope, gate); } catch { rejected = true; }
      if (!rejected) throw Error('Synthetic aggregate read gate was bypassed.');
    }); report.checks.push('lost activation acknowledgement leaves native financial reads gated');
    native = adapter(); resume = first.operationId;
    await step('restore-identical-retry', async () => { const result = await restoreUserBackup(ownerId, env.id, gate, ports, resume); if (result.state !== 'restored') throw Error('Synthetic restore did not resume.'); });
    const restored = await native.exportSection(scope, gate);
    if (restored.state === 'absent' || await env.hash(restored.archive) !== sourceArchiveHash) throw Error('Synthetic restored graph differs.');
    report.checks.push('fresh adapter resumes exact v4 candidate and receipt without duplication');
    // The original default file remains intact after selecting the candidate.
    const originalName = `moflight-financial-${await env.hash(canonical(target))}.sqlite`;
    const { FinancialObservationStore } = await import('../vereinsflieger/expense-observation-store');
    const originalStore = new FinancialObservationStore(await requiredDb(env, originalName), target, env.hash, noop);
    try { await originalStore.initialize(); if (await env.hash(await originalStore.exportBackup()) !== originalHash || (await originalStore.assessFlight('999990101')).state !== 'conflict') throw Error('Synthetic original was changed.'); }
    finally { await originalStore.db.close(); }
    report.checks.push('selected candidate preserves the original conflicting two-receipt file');
    await step('legacy-absence', async () => {
      pickedText = await createUserBackup(input, env.hash); const calls = financialCalls;
      const result = await restoreUserBackup(ownerId, env.id, gate, ports);
      if (result.state !== 'restored' || calls !== financialCalls) throw Error('Legacy archive accessed finances.');
      const current = await native.exportSection(scope, gate);
      if (current.state === 'absent' || await env.hash(current.archive) !== sourceArchiveHash) throw Error('Legacy archive changed finances.');
    }); report.checks.push('v3 absence preserves selected native financial state');
    await step('foreign-archive', async () => {
      let rejected = false; try { await validateUserBackup(text, { ownerId, storeId: env.id, informationScope: null,
        financialTarget: { ...target, scope: { ...target.scope, context: { ...target.scope.context, accountNumber: '999990102' } } } }, env.hash); } catch { rejected = true; }
      if (!rejected) throw Error('Foreign financial archive was accepted.');
    }); report.checks.push('foreign provider-account archive rejects before staging');
    await env.write('checkpoint.json', canonical({ version: 1, id: env.id, financialSha256: sourceArchiveHash, archiveSha256: await env.hash(text) }));
    await step('offline-reopen', async () => { await reopenFinancialNativeProof(env, gate); });
    report.checks.push('checkpoint reopens raw candidate and v4 archive without provider/network work');
    report.state = 'passed';
  } catch { /* Fixed report only; raw/native/provider errors never enter diagnostics. */ }
  report.samples.push({ stage: 'total', elapsedMs: Math.max(0, env.clock() - started), outcome: report.state });
  return report;
}

export async function reopenFinancialNativeProof(env: FinancialProofEnvironment, gate: () => Promise<void>): Promise<void> {
  await gate(); const text = await env.read('checkpoint.json'); if (!text) throw Error('Synthetic financial checkpoint is unavailable.');
  const checkpoint = JSON.parse(text);
  if (canonical(checkpoint) !== text || Object.keys(checkpoint).sort().join(',') !== 'archiveSha256,financialSha256,id,version' || checkpoint.version !== 1 ||
      checkpoint.id !== env.id || !/^[0-9a-f]{64}$/.test(checkpoint.financialSha256) || !/^[0-9a-f]{64}$/.test(checkpoint.archiveSha256)) throw Error('Invalid synthetic financial checkpoint.');
  const { target, scope, adapter, openJournal } = setup(env, gate), archive = await env.read('archive.json');
  if (!archive || await env.hash(archive) !== checkpoint.archiveSha256) throw Error('Synthetic v4 archive file changed.');
  const payload = await validateUserBackup(archive, { ownerId, storeId: env.id, informationScope: null, financialTarget: target }, env.hash);
  if (payload.version !== 4 || payload.financial.state === 'absent' || await env.hash(payload.financial.archive) !== checkpoint.financialSha256) throw Error('Synthetic financial archive checkpoint differs.');
  const saved = await adapter().exportSection(scope, gate);
  if (saved.state === 'absent' || await env.hash(saved.archive) !== checkpoint.financialSha256) throw Error('Synthetic native financial candidate changed.');
  const journal = await openJournal(false); if (!journal) throw Error('Synthetic recovery journal missing.');
  try { if (await journal.pending()) throw Error('Synthetic aggregate recovery remains pending.'); } finally { await journal.close(); }
  await gate();
}

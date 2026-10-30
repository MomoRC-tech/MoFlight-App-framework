import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { closeSync, existsSync, openSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { canonical } from '../../packages/flight-logbook/src/index.ts';
import { PilotBooks } from '../../packages/local-data/src/books.ts';
import { RealFlightLibrary } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import { FinancialObservationStore, validateFinancialObservationBackup } from '../../apps/platform-lab/src/vereinsflieger/expense-observation-store.ts';
import type { FinancialLedgerObservation } from '../../apps/platform-lab/src/vereinsflieger/expense-ledger-observation.ts';
import { createUserBackup, createUserBackupV4, emptyUserChatArchive, USER_BACKUP_VERSION, validateUserBackup,
  type UserBackupInputV3, type UserFinancialBackup } from '../../apps/platform-lab/src/user-backup.ts';
import { encodeChatArchive } from '../../apps/platform-lab/src/ai/chat-model.ts';
import { FinancialCaptureRun } from '../../apps/platform-lab/src/vereinsflieger/expense-capture-run.ts';
import { createFinancialNativeAdapter } from '../../apps/platform-lab/src/vereinsflieger/expense-native-adapter.ts';
import type { RealFlightNativeScope } from '../../apps/platform-lab/src/vereinsflieger/real-flight-native.ts';
import { restoreUserBackup, type UserBackupServicePorts } from '../../apps/platform-lab/src/user-backup-service.ts';
import { UserBackupRestoreJournal, assertUserBackupReadAllowed } from '../../apps/platform-lab/src/user-backup-restore-journal.ts';
import { nodeDriver } from './sqlite-driver.ts';
import { financialAt as at, financialHash as hash, financialTarget as target, financialObservation as observation,
  financialListUrl as listUrl, financialDetailUrl as detailUrl, financialProfile as profile, financialRead as read } from './fixtures/expense-capture.ts';

const ownerId = target.scope.owner, storeId = target.storeId;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
async function finance(populated = true) {
  const db = nodeDriver(':memory:'), store = new FinancialObservationStore(db, target, hash, async () => {});
  await store.initialize(true);
  if (populated) await store.save('raw-first', 'billed-flight', observation());
  return { db, store };
}
async function base(bindingAccount?: string): Promise<UserBackupInputV3> {
  const db = nodeDriver(':memory:'), real = await RealFlightLibrary.create(db, { singleton: 1, family: 'moflight-real-flight-history',
    schema_version: 1, payload_version: 1, owner_id: ownerId, store_id: storeId, created_at: at }, hash,
  () => ({ ownerId, storeId, leaseId: uuid(999), writable: true }));
  let realBackup: string;
  try {
    if (bindingAccount) {
      const context = { ...target.scope.context, accountNumber: bindingAccount };
      const window = { from: '2026-05-01', to: '2026-05-31', participation: 'Pilot oder Fluglehrer' as const };
      await real.bindAccount({ kind: 'bind', commandId: uuid(90), baseGeneration: 0, at, source: {
        version: 1, binding: { provider: 'vereinsflieger', accountRef: bindingAccount }, contextBefore: context, contextAfter: context,
        requestedWindow: window, capture: { captureId: 'synthetic-binding', retrievedAt: at,
          headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit', 'Pilot'], rows: [{ sourceFlightId: '54321', values: ['31.05.2026', 'D-TEST', '09:00', '09:10', '0:10', 'Synthetic pilot'] }],
          sourceIdentity: 'unverified', coverage: 'complete-requested-list', timeBasis: 'unknown',
          exportContext: { ...window, preset: 'Konfiguration laden', accountLabel: 'Synthetic account', recordCount: 1, pageCount: 1,
            columnIds: ['1', '2', '3', '4', '5', '6'], adapterVersion: 2 } },
      } });
    }
    realBackup = await real.exportBackup();
  } finally { await real.close(); }
  const pilot = new PilotBooks(nodeDriver(':memory:'), 'synthetic-pilot', hash); await pilot.initialize();
  let pilotBackup: string;
  try { pilotBackup = await pilot.backup(); } finally { await pilot.db.close(); }
  return { createdAt: at, ownerId, storeId,
    pilot: { ownerId: 'synthetic-pilot', backup: pilotBackup, displayName: 'Synthetic pilot', selectedBookId: null },
    realFlights: { backup: realBackup }, information: null, ai: { archive: encodeChatArchive(emptyUserChatArchive(ownerId)) },
    dutyTargets: { scope: bindingAccount ? { ownerId, storeId, accountRef: bindingAccount } : null, targets: [] } };
}
async function rehash(text: string, change: (value: Record<string, unknown>) => void) {
  const envelope = JSON.parse(text), value = JSON.parse(envelope.payload); change(value);
  envelope.payload = canonical(value); envelope.checksum = await hash(envelope.payload); return canonical(envelope);
}

test('financial archive preserves exact receipt sequence gaps, raw values and conflicts through candidate reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-archive-')), f = await finance();
  let db = nodeDriver(join(directory, 'candidate.sqlite'));
  try {
    await f.store.save('raw-first', 'billed-flight', observation()); // Harmless idempotent retry can leave a sequence gap.
    const changed = observation(); changed.source.statedTotalRaw = 'unknown'; await f.store.save('raw-changed', 'billed-flight', changed);
    const original = await f.store.exportBackup(), decoded = await validateFinancialObservationBackup(original, target, hash);
    assert.deepEqual(decoded.receipts.map(r => r.sequence), [1, 3]);
    let candidate = new FinancialObservationStore(db, target, hash, async () => {}); await candidate.initialize(true);
    await candidate.restoreBackup(original); await candidate.restoreBackup(original);
    assert.equal(await candidate.exportBackup(), original);
    await db.close(); db = nodeDriver(join(directory, 'candidate.sqlite'));
    candidate = new FinancialObservationStore(db, target, hash, async () => {}); await candidate.initialize();
    assert.equal(await candidate.exportBackup(), original); assert.equal((await candidate.assessFlight('54321')).state, 'conflict');
    assert.equal(await f.store.exportBackup(), original, 'original data remains unchanged');
    const empty = await finance(false);
    try { await assert.rejects(candidate.restoreBackup(await empty.store.exportBackup()), /empty candidate/); }
    finally { await empty.db.close(); }
  } finally {
    await f.db.close(); await db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true });
  }
});

test('interrupted financial candidate restore rolls back every inserted receipt and safely retries', async () => {
  const f = await finance(), candidate = await finance(false);
  try {
    await f.store.save('second', 'billed-flight', observation()); const text = await f.store.exportBackup();
    await assert.rejects(candidate.store.restoreBackup(text, async stage => { if (stage === 'after-receipt') throw Error('synthetic interruption'); }));
    assert.equal((await candidate.store.history()).total, 0);
    await candidate.store.restoreBackup(text); assert.equal(await candidate.store.exportBackup(), text);
  } finally { await candidate.db.close(); await f.db.close(); }
});

test('financial archive round-trips separate ledger accounts with the same booking number', async () => {
  const f = await finance(false), candidate = await finance(false);
  const ledger = (selector: string, label: string): FinancialLedgerObservation => {
    const url = `https://vereinsflieger.de/member/profile/account.php?caid=${selector}`;
    return { version: 1, storeId, scope: structuredClone(target.scope), contextBefore: structuredClone(target.scope.context),
      contextAfter: structuredClone(target.scope.context), sourceAccount: { selector, label }, ownNavigation: { label, url },
      sourceUrl: url, pageAccountLabel: label, reportedRowCount: 1,
      capture: { version: 1, id: `ledger-${selector}`, retrievedAt: at, owner: ownerId, connectionId: target.scope.connectionId,
        sourceIdentity: 'provisional-observed-profile', category: 'ledger', path: '/member/profile/account.php',
        columns: [{ key: 'date', label: 'Datum', index: 0 }, { key: 'booking', label: 'BuchungsNr.', index: 1 },
          { key: 'information', label: 'Informationen', index: 2 }, { key: 'value', label: 'Wert (EUR)', index: 3 }, { key: 'balance', label: 'Saldo (EUR)', index: 4 }],
        rows: [{ position: 0, values: ['30.06.2026', 'same-booking', 'Uninterpreted movement', selector === '101' ? '-10,00' : '4,00', '90,00'] }],
        filters: ['Jahr 2026'], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } } };
  };
  try {
    const first = await f.store.save('member', 'ledger', ledger('101', 'Synthetic member'));
    const second = await f.store.save('allowance', 'ledger', ledger('202', 'Synthetic allowance'));
    assert.notEqual(first.sourceKey, second.sourceKey);
    const archive = await f.store.exportBackup(); await candidate.store.restoreBackup(archive);
    assert.deepEqual(await candidate.store.find('member'), first); assert.deepEqual(await candidate.store.find('allowance'), second);
    assert.equal(await candidate.store.exportBackup(), archive);
  } finally { await f.db.close(); await candidate.db.close(); }
});

test('foreign, reordered, duplicate, future and smuggled financial archives reject before staging', async () => {
  const f = await finance();
  try {
    await f.store.save('second', 'billed-flight', observation()); const text = await f.store.exportBackup();
    const mutations: ((value: Record<string, unknown>) => void)[] = [
      p => { (p.target as typeof target).scope.owner = 'other'; },
      p => { (p.receipts as unknown[]).reverse(); },
      p => { (p.receipts as unknown[]).push((p.receipts as unknown[])[0]); },
      p => { p.version = 2; },
      p => { ((p.receipts as Array<{ value: Record<string, unknown> }>)[0]!.value).cookie = 'EXCLUDED'; },
    ];
    for (const change of mutations) await assert.rejects(validateFinancialObservationBackup(await rehash(text, change), target, hash));
    const foreign = structuredClone(target); foreign.scope.context.accountNumber = '99999';
    await assert.rejects(validateFinancialObservationBackup(text, foreign, hash));
    const envelope = JSON.parse(text); envelope.version = 2;
    await assert.rejects(validateFinancialObservationBackup(canonical(envelope), target, hash));
    assert.equal((await f.store.history()).total, 2);
  } finally { await f.db.close(); }
});

test('explicit aggregate v4 distinguishes absent, empty and present while legacy export remains v3', async () => {
  const input = await base(), f = await finance(), empty = await finance(false);
  try {
    const legacy = await createUserBackup(input, hash); assert.equal(JSON.parse(legacy).version, 3); assert.equal(USER_BACKUP_VERSION, 3);
    const sections: UserFinancialBackup[] = [{ state: 'absent' }, { state: 'empty', target, archive: await empty.store.exportBackup() },
      { state: 'present', target, archive: await f.store.exportBackup() }];
    for (const financial of sections) {
      const text = await createUserBackupV4({ ...input, financial }, hash);
      const decoded = await validateUserBackup(text, { ownerId, storeId, informationScope: null, financialTarget: target }, hash);
      assert.equal(decoded.version, 4); if (decoded.version !== 4) throw Error('Expected4');
      assert.deepEqual(decoded.financial, financial); assert.deepEqual(decoded.dutyTargets, input.dutyTargets);
      if (financial.state !== 'absent') {
        await assert.rejects(validateUserBackup(text, { ownerId, storeId, informationScope: null }, hash));
        const wrongState = await rehash(text, p => { (p.financial as { state: string }).state = financial.state === 'empty' ? 'present' : 'empty'; });
        await assert.rejects(validateUserBackup(wrongState, { ownerId, storeId, informationScope: null, financialTarget: target }, hash));
      }
    }
    await assert.rejects(createUserBackup({ ...input, financial: sections[2] } as UserBackupInputV3, hash));
    const v4 = await createUserBackupV4({ ...input, financial: sections[2]! }, hash);
    const envelope = JSON.parse(v4); envelope.version = 5;
    await assert.rejects(validateUserBackup(canonical(envelope), { ownerId, storeId, informationScope: null, financialTarget: target }, hash));
    assert.equal(await createUserBackup(input, hash), legacy, 'issued v3 bytes/inventory remain unchanged');
  } finally { await f.db.close(); await empty.db.close(); }
});

function portsFor(directory: string, text: string) {
  let next = 1, failFinancialAck = false; const events: string[] = [];
  const journalPath = join(directory, 'journal.sqlite');
  const ports: UserBackupServicePorts = {
    io: { pickBackup: async () => ({ canceled: false, assets: [{ uri: 'archive.json' }] }), readPickedFile: async () => text }, hash,
    uuid: () => uuid(next++), now: () => at,
    async openJournal(create) { return !create && !existsSync(journalPath) ? null : UserBackupRestoreJournal.open(nodeDriver(journalPath), create); },
    currentInformationScope: async () => null,
    async stagePilot() { events.push('pilot-candidate'); }, async activatePilot() { events.push('pilot-active'); },
    async restoreRealFlights() { events.push('real'); return 'already-activated'; },
    async restoreInformation() { events.push('information'); return 'already-activated'; },
    async preflightDutyTargets() { events.push('duty-preflight'); }, async restoreDutyTargets() { events.push('duty'); },
    async restoreAi() { events.push('ai'); },
    financial: {
      currentTarget: async () => target,
      async preflight(section) { await validateFinancialObservationBackup(section.archive, target, hash); events.push('finance-preflight'); },
      async restore({ section, permit }, gate) {
        await gate(); const db = nodeDriver(join(directory, `financial-${permit.operationId}.sqlite`));
        try {
          const candidate = new FinancialObservationStore(db, target, hash, async () => { await gate(); }); await candidate.initialize(true);
          await candidate.restoreBackup(section.archive); assert.equal(await candidate.exportBackup(), section.archive); events.push('finance-verified');
        } finally { await db.close(); }
        if (failFinancialAck) { failFinancialAck = false; throw Error('synthetic lost finance acknowledgement'); }
      },
    },
  };
  return { ports, events, loseFinancialAck: () => { failFinancialAck = true; } };
}

test('v4 unavailable financial ports stop before any candidate/journal mutation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-v4-unavailable-')), f = await finance();
  try {
    const text = await createUserBackupV4({ ...await base(), financial: { state: 'present', target, archive: await f.store.exportBackup() } }, hash);
    const p = portsFor(directory, text); delete p.ports.financial;
    await assert.rejects(restoreUserBackup(ownerId, storeId, async () => {}, p.ports));
    assert.deepEqual(p.events, []); assert.equal(await p.ports.openJournal(false), null);
  } finally { await f.db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

test('v4 financial account must match an independently saved flight binding', async () => {
  const f = await finance();
  try {
    await assert.rejects(createUserBackupV4({ ...await base('99999'),
      financial: { state: 'present', target, archive: await f.store.exportBackup() } }, hash), /provider binding/);
    assert.equal((await f.store.history()).total, 1);
  } finally { await f.db.close(); }
});

test('guarded capture through v4 aggregate restore preserves the exact receipt in a reopened candidate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-pipeline-')), f = await finance(false);
  try {
    const job = new FinancialCaptureRun(target, 'captured-pipeline', listUrl, detailUrl);
    for (let i = 0; i < 4; i++) {
      const isProfile = job.stage === 'before' || job.stage === 'after', url = job.url;
      const kind = isProfile ? 'vf-financial-profile-v1' : job.stage === 'list' ? 'vf-financial-link-v1' : 'vf-financial-billing-v1';
      const p = { kind, nonce: job.messageNonce, url, ...(isProfile ? { profile: profile() }
        : { page: job.stage === 'list' ? { url: listUrl, detailUrl } : read() }) };
      job.observeNavigation(url); job.accept(url, url, p, target, at);
    }
    const captured = await job.save(f.store, () => target, async () => {});
    const text = await createUserBackupV4({ ...await base('12345'), financial: { state: 'present', target, archive: await f.store.exportBackup() } }, hash);
    const p = portsFor(directory, text); assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, p.ports)).state, 'restored');
    const db = nodeDriver(join(directory, `financial-${uuid(1)}.sqlite`));
    try {
      const restored = new FinancialObservationStore(db, target, hash, async () => {}); await restored.initialize();
      assert.deepEqual(await restored.find(job.id), captured); assert.equal((await restored.history()).total, 1);
    } finally { await db.close(); }
  } finally { await f.db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

test('v4 aggregate journal blocks reads after lost financial acknowledgement and resumes the identical candidate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-v4-resume-')), f = await finance();
  try {
    const text = await createUserBackupV4({ ...await base(), financial: { state: 'present', target, archive: await f.store.exportBackup() } }, hash);
    const p = portsFor(directory, text); p.loseFinancialAck();
    const first = await restoreUserBackup(ownerId, storeId, async () => {}, p.ports);
    assert.deepEqual(first, { state: 'recovery-required', operationId: uuid(1), phase: 'real-flight' });
    await assert.rejects(assertUserBackupReadAllowed(() => p.ports.openJournal(false)), /incomplete/);
    assert.ok(!p.events.includes('pilot-active'));
    const before = [...p.events], different = await rehash(text, value => { value.createdAt = '2026-10-31T12:00:00.000Z'; });
    p.ports.io.readPickedFile = async () => different;
    await assert.rejects(restoreUserBackup(ownerId, storeId, async () => {}, p.ports, uuid(1)), /differs/);
    assert.deepEqual(p.events, before, 'different-file retry cannot stage or run financial preflight');
    p.ports.io.readPickedFile = async () => text;
    assert.deepEqual(await restoreUserBackup(ownerId, storeId, async () => {}, p.ports, uuid(1)), { state: 'restored', operationId: uuid(1) });
    await assertUserBackupReadAllowed(() => p.ports.openJournal(false));
    assert.equal(p.events.filter(v => v === 'finance-verified').length, 2);
    assert.deepEqual(await restoreUserBackup(ownerId, storeId, async () => {}, p.ports, uuid(1)), { state: 'already-restored', operationId: uuid(1) });
  } finally { await f.db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

test('legacy v1-v3 and explicit v4 absence preserve existing financial records without calling finance ports', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-absence-')), f = await finance();
  try {
    const input = await base(), original = await f.store.exportBackup();
    const { ai, dutyTargets, ...v1 } = input;
    const texts = [await createUserBackup(v1, hash), await createUserBackup({ ...v1, ai }, hash), await createUserBackup({ ...v1, ai, dutyTargets }, hash),
      await createUserBackupV4({ ...input, financial: { state: 'absent' } }, hash)];
    for (let i = 0; i < texts.length; i++) {
      const dir = join(directory, String(i)); const { mkdir } = await import('node:fs/promises'); await mkdir(dir);
      const p = portsFor(dir, texts[i]!);
      p.ports.financial!.currentTarget = async () => { throw Error('Absent archive accessed finance'); };
      p.ports.financial!.restore = async () => { throw Error('Absent section erased financial data'); };
      assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, p.ports)).state, 'restored');
      assert.ok(!p.events.some(v => v.startsWith('finance'))); assert.equal(await f.store.exportBackup(), original);
    }
  } finally { await f.db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

test('aggregate recovery journal resumes the native financial selection after a lost activation acknowledgement', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'moflight-financial-native-pipeline-')), f = await finance();
  try {
    const financial = { state: 'present' as const, target, archive: await f.store.exportBackup() };
    const text = await createUserBackupV4({ ...await base('12345'), financial }, hash), p = portsFor(directory, text);
    const scope: RealFlightNativeScope = { lease: { version: 1, ownerId, storeId, leaseId: uuid(99), selectionSeq: 1,
      selectedAt: at, createdAt: at, candidateName: 'synthetic-owner.sqlite' }, registry: { async assertCurrent() {} },
      authorize: () => ({ ownerId, storeId, leaseId: uuid(99), writable: true }) };
    const deps = {
      file(name: string) { const path = join(directory, name); return { get exists() { return existsSync(path); }, create() { closeSync(openSync(path, 'wx')); } }; },
      openDriver: async (name: string) => nodeDriver(join(directory, name)), hash, currentProviderScope: async () => target.scope,
      async assertRecovery(allowed?: { operationId: string; ownerId: string; storeId: string }) {
        const journal = await p.ports.openJournal(false);
        try {
          const pending = await journal?.pending();
          if (allowed && (!pending || pending.operationId !== allowed.operationId || pending.ownerId !== allowed.ownerId || pending.storeId !== allowed.storeId) ||
              pending && !allowed) throw Error('Aggregate read gate');
        } finally { await journal?.close(); }
      },
    };
    let native = createFinancialNativeAdapter(deps), loseAck = true, resumeOperationId: string | undefined;
    p.ports.financial = {
      currentTarget: () => native.currentTarget({ ...scope, backupRestoreOperationId: resumeOperationId }, async () => {}),
      preflight: (section, gate) => native.preflight({ ...scope, backupRestoreOperationId: resumeOperationId }, section, gate),
      async restore({ section, permit }, gate) {
        await native.restore(scope, section, permit, gate);
        if (loseAck) { loseAck = false; throw Error('Lost activation acknowledgement'); }
      },
    };
    const first = await restoreUserBackup(ownerId, storeId, async () => {}, p.ports);
    assert.deepEqual(first, { state: 'recovery-required', operationId: uuid(1), phase: 'real-flight' });
    await assert.rejects(native.exportSection(scope, async () => {}), /Aggregate read gate/);
    native = createFinancialNativeAdapter(deps); resumeOperationId = uuid(1);
    assert.equal((await restoreUserBackup(ownerId, storeId, async () => {}, p.ports, resumeOperationId)).state, 'restored');
    assert.deepEqual(await native.exportSection(scope, async () => {}), financial);
    await assertUserBackupReadAllowed(() => p.ports.openJournal(false));
  } finally { await f.db.close(); assert.equal(dirname(resolve(directory)), resolve(tmpdir())); await rm(directory, { recursive: true, force: true }); }
});

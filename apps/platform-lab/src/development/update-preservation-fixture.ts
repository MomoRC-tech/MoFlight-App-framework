import { canonical, type Flight } from '@moflight/flight-logbook';
import { PilotBooks, sourceId, type SourceFlight } from '../../../../packages/local-data/src/books';
import type { Driver, Hash } from '@moflight/local-data';
import { RealFlightLibrary } from '../vereinsflieger/real-flight-library';
import { RealFlightCommandJournal } from '../vereinsflieger/real-flight-command-journal';
import { InformationStore } from '../vereinsflieger/information-store';
import { validateInformationCapture } from '../vereinsflieger/information';
import { saveLocalDisplayName, readLocalDisplayName } from '../mobile/local-profile';
import { createUserBackup, validateUserBackup } from '../user-backup';
import { restoreUserBackup, type UserBackupServicePorts } from '../user-backup-service';
import { UserBackupRestoreJournal, assertUserBackupReadAllowed } from '../user-backup-restore-journal';
import { recoverySource } from './android-core-recovery-fixture';
import type { ProviderScope } from '../vereinsflieger/scope-store';

/** Build/test-only fixture. Never imported by normal app entry or owner registries. */
export interface UpdateProofPorts {
  open(name: string): Promise<Driver>;
  exists(name: string): Promise<boolean>;
  read(name: string): Promise<string>;
  write(name: string, value: string): Promise<void>;
  hash: Hash;
}
export const UPDATE_AT = '2026-10-23T10:00:00.000Z';
export const updateId = (n: number) => `84848484-8484-4484-8484-${String(n).padStart(12, '0')}`;
export const UPDATE_ACCOUNTS = [0, 1].map(index => ({
  key: index === 0 ? 'a' : 'b', ownerId: updateId(index + 1), storeId: updateId(index + 11),
  account: String(101 + index), connectionId: updateId(index + 21),
}));
export type UpdateAccount = typeof UPDATE_ACCOUNTS[number];
const scopeFor = (a: UpdateAccount): ProviderScope => ({ version: 1, owner: a.ownerId, connectionId: a.connectionId,
  context: { accountNumber: a.account, clubLabel: 'Synthetic upgrade club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } });
const permit = (a: UpdateAccount) => () => ({ ownerId: a.ownerId, storeId: a.storeId, leaseId: 'synthetic-upgrade-proof', writable: true });
const manifest = (a: UpdateAccount) => ({ singleton: 1 as const, family: 'moflight-real-flight-history' as const,
  schema_version: 1 as const, payload_version: 1 as const, owner_id: a.ownerId, store_id: a.storeId, created_at: UPDATE_AT });

function source(a: UpdateAccount, id: string) {
  const value = recoverySource(`upgrade-${a.key}-${id}`), scope = scopeFor(a);
  value.binding.accountRef = a.account;
  value.contextBefore = scope.context; value.contextAfter = { ...scope.context };
  value.capture.rows.push({ sourceFlightId: '9002', values: ['19.10.2026', 'D-PROOF', '11:00', '11:20', '20', 'Synthetic second pilot'] });
  if (!value.capture.exportContext) throw new Error('Synthetic upgrade source requires its known export context.');
  value.capture.exportContext.recordCount = 2;
  return value;
}
async function real(p: UpdateProofPorts, a: UpdateAccount) {
  return RealFlightLibrary.open(await p.open(`${a.key}-real.sqlite`), a.ownerId, a.storeId, p.hash, permit(a));
}
async function pilot(p: UpdateProofPorts, name: string) {
  const result = new PilotBooks(await p.open(name), 'synthetic-pilot', p.hash);
  await result.initialize(); return result;
}
async function information(p: UpdateProofPorts, a: UpdateAccount, name = `${a.key}-information.sqlite`, create = false) {
  const result = new InformationStore(await p.open(name), scopeFor(a), async () => {});
  await result.initialize(create); return result;
}

export async function captureUpdateProof(p: UpdateProofPorts) {
  const accounts = [];
  for (const a of UPDATE_ACCOUNTS) {
    const library = await real(p, a);
    let realBackup: string, flightIds: string[];
    try { realBackup = await library.exportBackup(); flightIds = (await library.list()).map(f => f.flightId); }
    finally { await library.close(); }
    const journal = await RealFlightCommandJournal.open(await p.open(`${a.key}-commands.sqlite`), a.ownerId, a.storeId, permit(a), p.hash);
    let pending;
    try { pending = await journal.pending(); } finally { await journal.close(); }
    const books = await pilot(p, `${a.key}-books.sqlite`);
    let pilotBackup: string, displayName: string;
    try { pilotBackup = await books.backup(); displayName = await readLocalDisplayName(books.db, books.owner); }
    finally { await books.db.close(); }
    const info = await information(p, a); let informationBackup: string;
    try { informationBackup = await info.exportBackup(p.hash); } finally { await info.db.close(); }
    accounts.push({ key: a.key, ownerId: a.ownerId, storeId: a.storeId, realBackup, flightIds, pending,
      pilotBackup, displayName, informationBackup, settings: JSON.parse(await p.read(`${a.key}-settings.json`)),
      attachmentSha256: await p.hash(await p.read(`${a.key}-attachment.txt`)) });
  }
  return { version: 1, accounts };
}

export async function seedUpdateProof(p: UpdateProofPorts): Promise<void> {
  if (await p.exists('expected.json')) throw new Error('Existing upgrade proof preserved; choose a fresh namespace.');
  for (const a of UPDATE_ACCOUNTS) {
    const library = await RealFlightLibrary.create(await p.open(`${a.key}-real.sqlite`), manifest(a), p.hash, permit(a));
    const journal = await RealFlightCommandJournal.open(await p.open(`${a.key}-commands.sqlite`), a.ownerId, a.storeId, permit(a), p.hash, true);
    try {
      await library.bindAccount({ kind: 'bind', commandId: updateId(100), baseGeneration: 0, source: source(a, 'binding'), at: UPDATE_AT });
      const input = source(a, 'saved'), plan = await library.prepareImport(input);
      await library.saveUnassigned({ kind: 'import-unassigned', commandId: updateId(101), baseGeneration: plan.baseGeneration,
        bindingId: plan.bindingId, planToken: plan.planToken, source: input, at: UPDATE_AT });
      const pendingInput = source(a, 'pending'), pendingPlan = await library.prepareImport(pendingInput);
      await journal.prepare({ version: 1, kind: 'import-unassigned', commandId: updateId(102), ownerId: a.ownerId, storeId: a.storeId,
        baseGeneration: pendingPlan.baseGeneration, bindingId: pendingPlan.bindingId, planToken: pendingPlan.planToken,
        source: pendingInput, at: UPDATE_AT });
    } finally { await journal.close(); await library.close(); }
    const books = await pilot(p, `${a.key}-books.sqlite`);
    try {
      for (const suffix of ['one', 'two']) await books.createBook({ id: `${a.key}-${suffix}`, owner: books.owner,
        name: `Synthetic ${a.key} ${suffix}`, format: 'synthetic-powered-five-row-v1', classes: ['glider'], from: '2020-01-01', through: null });
      const id = sourceId(books.owner, `upgrade-${a.key}`, 'one');
      const flight: Flight = { id, date: '2026-10-20', start: '10:00', landing: '10:12', time_basis: 'UTC', minutes: 12,
        registration: 'D-PROOF', aircraft_model: 'Synthetic glider', pilot_role: 'PIC', crew: [], launch: 'winch',
        start_place: 'SYNTHETIC', landing_place: 'SYNTHETIC', landings: 1, remarks: null };
      const input: SourceFlight = { id, owner: books.owner, transport: 'synthetic-proof', connection: `upgrade-${a.key}`,
        reference: 'one', aircraftClass: 'glider', duplicate: false, flight, raw: `Retained original ${a.key}` };
      await books.ingest([input]); await books.associate(`${a.key}-one`, id, true); await books.associate(`${a.key}-two`, id, false);
      await books.saveState(`${a.key}-one`, 'decision', [{ id: `${id}:registration`, action: 'ignore', value: null,
        evidence: 'synthetic retained decision', reason: 'Synthetic preservation witness', at: UPDATE_AT, author: books.owner }]);
      const snapshot = await books.prepare(`${a.key}-one`); await books.confirm(`${a.key}-one`, snapshot.id, [id]);
      await books.saveState(`${a.key}-two`, 'pending', { text: `Unsynchronized draft ${a.key}` });
      const attachment = `Synthetic opaque attachment ${a.key}\n`;
      await p.write(`${a.key}-attachment.txt`, attachment);
      await books.saveState(`${a.key}-one`, 'photo', { reference: `${a.key}-attachment.txt`, sha256: await p.hash(attachment) });
      await saveLocalDisplayName(books.db, books.owner, `Synthetic pilot ${a.key}`);
    } finally { await books.db.close(); }
    await p.write(`${a.key}-settings.json`, canonical({ selectedBook: `${a.key}-two`, owner: a.ownerId, provisionalTargetHours: 30 }));
    const info = await information(p, a, undefined, true);
    try { await info.save(validateInformationCapture({ version: 1, id: `upgrade-${a.key}-medical`, retrievedAt: UPDATE_AT,
      owner: a.ownerId, connectionId: a.connectionId, sourceIdentity: 'provisional-observed-profile', category: 'medical',
      path: '/member/profile/viewprofile', columns: [{ key: 'kind', label: 'Medical-Art', index: 0 },
        { key: 'expiry', label: 'Gültig bis · Originaltext', index: 1 }], rows: [{ position: 1, values: ['Synthetic class', '31.12.2027'] }],
      filters: [], empty: false, coverage: { kind: 'visible-page', truncated: false, pagination: 'unverified' } })); }
    finally { await info.db.close(); }
  }
  const expected = await captureUpdateProof(p), a = expected.accounts[0]!;
  const archive = await createUserBackup({ createdAt: UPDATE_AT, ownerId: a.ownerId, storeId: a.storeId,
    pilot: { ownerId: 'synthetic-pilot', backup: a.pilotBackup, displayName: a.displayName, selectedBookId: 'a-two' },
    realFlights: { backup: a.realBackup }, information: { scope: scopeFor(UPDATE_ACCOUNTS[0]!), backup: a.informationBackup } }, p.hash);
  await p.write('archive.json', archive);
  const j = await UserBackupRestoreJournal.open(await p.open('restore.sqlite'));
  try {
    await j.prepare({ operationId: updateId(201), ownerId: a.ownerId, storeId: a.storeId, archiveSha256: await p.hash(archive),
      pilotCandidateName: `pilot-restore-${updateId(201)}.sqlite`, realCandidateId: updateId(202), realOperationId: updateId(203),
      informationOperationId: updateId(204), informationScope: scopeFor(UPDATE_ACCOUNTS[0]!), selectedBookId: 'a-two', createdAt: UPDATE_AT, updatedAt: UPDATE_AT });
    await j.advance(updateId(201), 'real-flight', UPDATE_AT); await j.advance(updateId(201), 'information', UPDATE_AT);
  } finally { await j.close(); }
  await p.write('expected.json', canonical(expected));
}

/** Validate all retained stores, then exercise the existing aggregate recovery coordinator. */
export async function verifyUpdateProof(p: UpdateProofPorts, recover = true): Promise<void> {
  if (canonical(await captureUpdateProof(p)) !== await p.read('expected.json')) throw new Error('Populated upgrade state mismatch.');
  const a = UPDATE_ACCOUNTS[0]!, text = await p.read('archive.json');
  const payload = await validateUserBackup(text, { ownerId: a.ownerId, storeId: a.storeId, informationScope: scopeFor(a) }, p.hash);
  if (!recover) return;
  const openJournal = async () => UserBackupRestoreJournal.open(await p.open('restore.sqlite'), false);
  let gated = false;
  try { await assertUserBackupReadAllowed(openJournal); } catch { gated = true; }
  if (!gated) throw new Error('Incomplete restore did not retain its read gate.');
  const ports: UserBackupServicePorts = {
    io: { pickBackup: async () => ({ canceled: false, assets: [{ uri: 'synthetic-archive', size: new TextEncoder().encode(text).length }] }), readPickedFile: async () => text },
    hash: p.hash, uuid: () => { throw new Error('Resume must retain its durable operation identities.'); }, now: () => UPDATE_AT,
    openJournal, currentInformationScope: async () => scopeFor(a),
    async stagePilot(input) {
      const books = await pilot(p, 'recovered-books.sqlite');
      try { if (!(await books.books()).length) await books.restore(input.backup);
        if (await books.backup() !== input.backup) throw new Error('Pilot candidate differs from archive.'); }
      finally { await books.db.close(); }
    },
    async restoreRealFlights(input) {
      let candidate;
      if (await p.exists('recovered-real.sqlite')) candidate = await RealFlightLibrary.open(await p.open('recovered-real.sqlite'), a.ownerId, a.storeId, p.hash, permit(a));
      else candidate = await RealFlightLibrary.restoreIntoEmptyValidated(await p.open('recovered-real.sqlite'), input.backup, a.ownerId, a.storeId, p.hash, permit(a));
      try { if (await candidate.exportBackup() !== input.backup) throw new Error('Real candidate differs from archive.'); }
      finally { await candidate.close(); }
      return 'already-activated';
    },
    async restoreInformation(input) {
      const info = await information(p, a, 'recovered-information.sqlite', true);
      try { await info.restoreBackup(input.backup, p.hash); await info.verifyBackup(input.backup, p.hash); }
      finally { await info.db.close(); }
      return 'already-activated';
    },
    async activatePilot() {
      await p.write('recovered-selection.json', canonical({ ownerId: a.ownerId, storeId: a.storeId, selectedBook: payload.pilot.selectedBookId }));
    },
    async preflightDutyTargets() { throw new Error('This bounded fixture uses backup v1/v2 only.'); },
    async restoreDutyTargets() { throw new Error('This bounded fixture uses backup v1/v2 only.'); },
    async restoreAi(input) {
      // This historical-writer proof has no AI store. Keep the overlay usable
      // on old source checkouts which predate the AI modules.
      if (input.archive.conversations.length || input.archive.identity) throw new Error('Historical fixture has unexpected AI content.');
    },
  };
  const result = await restoreUserBackup(a.ownerId, a.storeId, async () => {}, ports, updateId(201));
  if (result.state !== 'restored') throw new Error('Late-phase aggregate recovery remains incomplete.');
  await assertUserBackupReadAllowed(openJournal);
  if ((await restoreUserBackup(a.ownerId, a.storeId, async () => {}, ports, updateId(201))).state !== 'already-restored') throw new Error('Recovery retry was not idempotent.');
  if (canonical(await captureUpdateProof(p)) !== await p.read('expected.json')) throw new Error('Recovery modified the original populated stores.');
}

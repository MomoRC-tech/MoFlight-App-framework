import { canonical } from '@moflight/flight-logbook';
import type { Driver, Hash } from '@moflight/local-data';
import { assertOwnFlightDetailOwner, readOwnFlightDetail, readOwnFlightView, type OwnFlightDetailContext, type OwnFlightReadPorts } from '../mobile/own-flight-reader';
import { RealFlightLibrary, type RealFlightAuthorization, type RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { RealOwnerRegistry } from '../vereinsflieger/real-owner-registry';
import { RealFlightSelection } from '../vereinsflieger/real-flight-selection';
import { RealFlightCommandJournal } from '../vereinsflieger/real-flight-command-journal';
import { RealFlightService } from '../vereinsflieger/real-flight-service';
import { realHistoryUuid } from '../vereinsflieger/real-history-contract';
import { RECOVERY_AT, RECOVERY_MANIFEST, RECOVERY_OWNER, RECOVERY_STORE, recoveryPermit } from './android-core-recovery-fixture';
import { responsivenessSource } from './android-flight-responsiveness';

export interface DetailRenderProxy { renderCommitMilliseconds: number; nextFrameCallbackMilliseconds: number }
export interface DetailProofPorts {
  open(name: string): Promise<Driver>; hash: Hash; uuid(): string; now(): number;
  /** Diagnostic rendering only; these callbacks do not establish tap-to-visible latency. */
  display?(detail: RealFlightDetail, label: string): Promise<DetailRenderProxy>;
}
export interface DetailProofSample {
  index: number; fullDetailEqual: boolean;
  fresh: { milliseconds: number; hashCalls: number; render?: DetailRenderProxy };
  retained: { milliseconds: number; hashCalls: number; guardChecks: number; render?: DetailRenderProxy };
}
export interface DetailProofReport {
  version: 1; mode: 'seed' | 'reopen'; samples: DetailProofSample[];
  initialGeneration: number; finalGeneration: number; flightCount: number;
  changedSelectionRejected: boolean; refreshedListChanged: boolean; persistedReadback: boolean | null;
  distinctReadLeases: number; changedOwnerSelectionRejected: boolean;
  renderMetric: 'diagnostic React layout effect and following requestAnimationFrame callback; not tap-to-visible or physical frame presentation';
}

/** Bounded synthetic-only proof. All files, including its owner registry, are isolated by run ID. */
export async function runFlightDetailProof(ports: DetailProofPorts, runId: string, seed: boolean): Promise<DetailProofReport> {
  realHistoryUuid(runId);
  const candidate = `moflight-real-history-${runId}.sqlite`;
  const selectionName = `native-detail-v2-${runId}-selection.sqlite`;
  const journalName = `native-detail-v2-${runId}-commands.sqlite`;
  const registryName = `native-detail-v2-${runId}-owners.sqlite`;
  let hashCalls = 0, guardChecks = 0;
  const hash: Hash = async text => { hashCalls++; return ports.hash(text); };
  const openCandidate = async (name: string, authorize: RealFlightAuthorization = recoveryPermit, gate?: (write: boolean) => Promise<void>) => {
    if (name !== candidate) throw new Error('Foreign detail proof candidate');
    const db = await ports.open(name);
    try { return await RealFlightLibrary.open(db, RECOVERY_OWNER, RECOVERY_STORE, hash, authorize, undefined, gate); }
    catch (error) { await db.close(); throw error; }
  };
  const selection = async (create = false, authorize: RealFlightAuthorization = recoveryPermit) => {
    const db = await ports.open(selectionName);
    try { return await RealFlightSelection.open(db, RECOVERY_OWNER, RECOVERY_STORE, authorize,
      (name, authorize, gate) => openCandidate(name, () => {
        const permit = authorize(); if (!permit) throw new Error('Expired proof'); return permit;
      }, gate), hash, create); }
    catch (error) { await db.close(); throw error; }
  };
  const journal = async (create = false, authorize: RealFlightAuthorization = recoveryPermit) => {
    const db = await ports.open(journalName);
    try { return await RealFlightCommandJournal.open(db, RECOVERY_OWNER, RECOVERY_STORE, authorize, hash, create); }
    catch (error) { await db.close(); throw error; }
  };
  if (seed) {
    const initialIds = [RECOVERY_OWNER, RECOVERY_STORE, runId];
    const registry = await RealOwnerRegistry.create(await ports.open(registryName), () => initialIds.shift() ?? ports.uuid(), RECOVERY_AT);
    try { await registry.createFreshOwner(RECOVERY_AT); } finally { await registry.close(); }
    const library = await RealFlightLibrary.create(await ports.open(candidate), RECOVERY_MANIFEST, hash, recoveryPermit);
    try {
      await library.bindAccount({kind: 'bind', commandId: ports.uuid(), baseGeneration: 0, source: responsivenessSource('detail-bind', 5), at: RECOVERY_AT});
      for (const [index, count] of [5, 5, 0, 5, 101].entries()) {
        const source = responsivenessSource(`detail-seed-${index}`, count), plan = await library.prepareImport(source);
        await library.saveUnassigned({kind: 'import-unassigned', commandId: ports.uuid(), baseGeneration: plan.baseGeneration,
          bindingId: plan.bindingId, source, planToken: plan.planToken, at: RECOVERY_AT});
      }
    } finally { await library.close(); }
    const selected = await selection(true);
    try { await selected.activate(ports.uuid(), candidate, null, RECOVERY_AT); } finally { await selected.close(); }
    await (await journal(true)).close();
  }
  let nextRegistration = 'D-NEWW';
  const createService = (onContext: (context: OwnFlightDetailContext) => void = () => {},
    authorize: RealFlightAuthorization = recoveryPermit, ownerSelectionSeq = 1) => new RealFlightService(
    RECOVERY_OWNER, RECOVERY_STORE, authorize()!.leaseId, {
      authorize, hash, uuid: ports.uuid, now: () => RECOVERY_AT, journal: () => journal(false, authorize),
      retrieve: async () => {
        const source = responsivenessSource(`detail-refresh-${ports.uuid()}`);
        // A real observable fact change establishes fresh readback, beyond generation alone.
        source.capture.rows[0]!.values[1] = nextRegistration;
        return source;
      },
      repository: async () => {
        const opened = await selection(false, authorize);
        try {
          const selected = await opened.select();
          onContext({ownerSelectionSeq, selectionIdentity: selected.selectionIdentity});
          return {library: selected.candidate, writable: !selected.recoveryRequired, warning: selected.warning,
            close: async () => { try { await selected.candidate.close(); } finally { await opened.close(); } }};
        } catch (error) { await opened.close(); throw error; }
      },
    });
  const readPorts: OwnFlightReadPorts = {open: async () => {
    const registry = await RealOwnerRegistry.open(await ports.open(registryName), ports.uuid);
    const lease = await registry.currentOwner();
    if (!lease || lease.ownerId !== RECOVERY_OWNER || lease.storeId !== RECOVERY_STORE) {
      await registry.close(); throw new Error('Foreign synthetic owner');
    }
    readLeases.add(lease.leaseId);
    let closed = false, context: OwnFlightDetailContext | undefined;
    const authorize: RealFlightAuthorization = () => closed ? null : {
      ownerId: lease.ownerId, storeId: lease.storeId, leaseId: lease.leaseId, writable: false,
    };
    let guard: Awaited<ReturnType<typeof selection>> | undefined;
    const service = createService(value => { context = value; }, authorize, lease.selectionSeq);
    return {ownerId: RECOVERY_OWNER, storeId: RECOVERY_STORE,
      assertCurrent: async () => { if (closed) throw new Error('Closed synthetic lease'); await registry.assertCurrent(lease); },
      pendingCommand: async () => { const opened = await journal(); try { return !!await opened.pending(); } finally { await opened.close(); } },
      detailContext: () => context,
      assertDetailContext: async expected => {
        if (closed) throw new Error('Closed synthetic lease');
        await registry.assertCurrent(lease);
        assertOwnFlightDetailOwner(expected, lease.selectionSeq);
        guard ??= await selection(false, authorize);
        await guard.assertIdentity(expected.selectionIdentity); guardChecks++;
        await registry.assertCurrent(lease);
      },
      service: {readStored: (initial, timing) => service.readStored(initial, timing, true), detail: id => service.detail(id)},
      close: async () => { closed = true; service.dispose(); try { await guard?.close(); } finally { await registry.close(); } },
    };
  }};
  const readLeases = new Set<string>();
  const stored = await readOwnFlightView(readPorts);
  if (!stored?.detailSource || !stored.detailContext || stored.flights.length !== 101) throw new Error('Missing synthetic displayed list');
  const selected = stored.flights.find(row => row.sourceFlightRef === '9001');
  if (!selected) throw new Error('Missing selected synthetic flight');
  const initialRegistration = selected.facts.assessment.observation.row.values[1];
  const persistedReadback = seed ? null : ['D-NEWW', 'D-NEXT'].includes(initialRegistration!);
  nextRegistration = initialRegistration === 'D-NEWW' ? 'D-NEXT' : 'D-NEWW';
  if (persistedReadback === false) throw new Error('Persisted post-write detail did not survive reopen');
  const samples: DetailProofSample[] = [];
  for (let index = 0; index < 5; index++) {
    const beforeFresh = hashCalls, freshStart = ports.now();
    const fresh = await readOwnFlightDetail(readPorts, stored.snapshot, selected);
    const freshResult = {milliseconds: ports.now() - freshStart, hashCalls: hashCalls - beforeFresh,
      render: await ports.display?.(fresh, `fresh-${index + 1}`)};
    const beforeRetained = hashCalls, beforeGuard = guardChecks, retainedStart = ports.now();
    const retained = await readOwnFlightDetail(readPorts, stored.snapshot, selected, stored);
    const retainedResult = {milliseconds: ports.now() - retainedStart, hashCalls: hashCalls - beforeRetained,
      guardChecks: guardChecks - beforeGuard, render: await ports.display?.(retained, `retained-${index + 1}`)};
    const fullDetailEqual = canonical(fresh) === canonical(retained);
    if (!fullDetailEqual || retainedResult.guardChecks !== 2) throw new Error('Detail equality or fresh guard failed');
    samples.push({index: index + 1, fullDetailEqual, fresh: freshResult, retained: retainedResult});
  }
  // Actual append-only selection activation invalidates the displayed context, without touching its candidate.
  const changed = await selection();
  try {
    const current = await changed.select();
    try { await changed.activate(ports.uuid(), candidate, current.sequence, RECOVERY_AT); }
    finally { await current.candidate.close(); }
  } finally { await changed.close(); }
  let changedSelectionRejected = false;
  try { await readOwnFlightDetail(readPorts, stored.snapshot, selected, stored); }
  catch (error) { if (/selection changed/.test(String(error))) changedSelectionRejected = true; else throw error; }
  if (!changedSelectionRejected) throw new Error('Changed selection was accepted');
  const ownerControl = await RealOwnerRegistry.open(await ports.open(registryName), ports.uuid);
  try {
    const other = await ownerControl.createFreshOwner(RECOVERY_AT);
    await ownerControl.selectOwner(RECOVERY_OWNER, RECOVERY_AT, other);
  } finally { await ownerControl.close(); }
  let changedOwnerSelectionRejected = false;
  try { await readOwnFlightDetail(readPorts, stored.snapshot, selected, stored); }
  catch (error) { if (/owner selection changed/.test(String(error))) changedOwnerSelectionRejected = true; else throw error; }
  if (!changedOwnerSelectionRejected) throw new Error('Changed owner selection was accepted');
  const writer = createService();
  try { await writer.saveUnassigned(await writer.retrieve({from: '2026-10-01', to: '2026-10-20'})); }
  finally { writer.dispose(); }
  const refreshed = await readOwnFlightView(readPorts);
  const changedFlight = refreshed?.flights.find(row => row.flightId === selected.flightId);
  const refreshedListChanged = !!refreshed && refreshed.snapshot.generation === stored.snapshot.generation + 1 &&
    changedFlight?.facts.assessment.observation.row.values[1] === nextRegistration && changedFlight.factsRevision > selected.factsRevision;
  if (!refreshedListChanged || !changedFlight || !refreshed) throw new Error('Fresh post-write list did not refresh');
  const freshAfterWrite = await readOwnFlightDetail(readPorts, refreshed.snapshot, changedFlight);
  const retainedAfterWrite = await readOwnFlightDetail(readPorts, refreshed.snapshot, changedFlight, refreshed);
  if (canonical(freshAfterWrite) !== canonical(retainedAfterWrite)) throw new Error('Fresh post-write detail mismatch');
  return {version: 1, mode: seed ? 'seed' : 'reopen', samples, initialGeneration: stored.snapshot.generation,
    finalGeneration: refreshed.snapshot.generation, flightCount: refreshed.flights.length, changedSelectionRejected,
    refreshedListChanged, persistedReadback, distinctReadLeases: readLeases.size, changedOwnerSelectionRejected,
    renderMetric: 'diagnostic React layout effect and following requestAnimationFrame callback; not tap-to-visible or physical frame presentation'};
}

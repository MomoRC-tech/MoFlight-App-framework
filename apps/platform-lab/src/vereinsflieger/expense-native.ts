import { File } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { hash, openDriver } from '../storage';
import { assertNoPendingUserBackupRestore, openUserBackupRestoreJournal } from '../user-backup-restore-journal-native';
import { createFinancialNativeAdapter } from './expense-native-adapter';
import { loadProviderScope } from './scoped-storage';
import { canonical } from '@moflight/flight-logbook';
import { validateFinancialObservationTarget } from './expense-observation-store';
import type { FinancialCaptureOptions } from './expense-capture-request';
import type { FinancialObservationTarget } from './expense-ledger-observation';
import { openRealFlightSelection, type RealFlightNativeScope } from './real-flight-native';
import { FinancialCollectionRun } from './expense-collection-run';

/** Existing Expo file/SQLite primitives; no provider sessions or credentials. */
export const financialNative = createFinancialNativeAdapter({
  file(name) {
    const directory = SQLite.defaultDatabaseDirectory;
    return new File(directory.startsWith('file:') ? directory : 'file://' + directory, name);
  },
  openDriver, hash, currentProviderScope: loadProviderScope,
  async assertRecovery(permit) {
    await assertNoPendingUserBackupRestore(permit);
    if (!permit) return;
    const journal = await openUserBackupRestoreJournal(false);
    if (!journal) throw Error('Financial restore requires a pending aggregate operation.');
    try {
      const pending = await journal.pending();
      if (!pending || pending.status !== 'pending' || pending.operationId !== permit.operationId ||
          pending.ownerId !== permit.ownerId || pending.storeId !== permit.storeId) throw Error('Foreign or completed financial restore permit.');
    } finally { await journal.close(); }
  },
});

/** Bind one explicit capture to its original native owner lease and raw target. */
export function nativeFinancialCaptureOptions(scope: RealFlightNativeScope, selected: FinancialObservationTarget,
  observedListUrl: string, observedDetailUrl: string): FinancialCaptureOptions {
  const held = { ...scope, lease: Object.freeze({ ...scope.lease }) }, target = validateFinancialObservationTarget(selected);
  const identity = canonical(target);
  if (target.scope.owner !== held.lease.ownerId || target.storeId !== held.lease.storeId || held.backupRestoreOperationId) throw Error('Foreign financial capture owner.');
  return { target, observedListUrl, observedDetailUrl,
    async authorize(gate) {
      await gate();
      if (!held.authorize()?.writable || canonical(await financialNative.currentTarget(held, gate)) !== identity) throw Error('Financial capture ownership is unavailable.');
      await gate();
    },
    save: (run, gate) => financialNative.withCurrentStore(held, JSON.parse(identity) as FinancialObservationTarget, gate,
      store => run.save(store, () => JSON.parse(identity) as FinancialObservationTarget, gate)),
  };
}

/** Resolve source references from the current verified local own-flight graph.
 * No caller-supplied identifiers or provider view/filter changes are needed. */
export async function nativeFinancialCollectionOptions(scope:RealFlightNativeScope,selected:FinancialObservationTarget):Promise<FinancialCaptureOptions>{
  const held={...scope,lease:Object.freeze({...scope.lease})},target=validateFinancialObservationTarget(selected),identity=canonical(target);
  if(target.scope.owner!==held.lease.ownerId||target.storeId!==held.lease.storeId||held.backupRestoreOperationId)throw Error('Foreign financial collection.');
  const check=async(gate:()=>Promise<void>)=>{await gate();if(!held.authorize()?.writable||canonical(await financialNative.currentTarget(held,gate))!==identity)throw Error('Financial collection owner unavailable.');await gate();};
  await check(async()=>{});const selection=await openRealFlightSelection(held,false);if(!selection)throw Error('Own flight selection unavailable.');
  let refs:string[];
  try{const selectedLibrary=await selection.select();try{if(selectedLibrary.recoveryRequired)throw Error('Own flight recovery pending.');const flights=await selectedLibrary.candidate.list();if(flights.some(row=>row.accountRef!==target.scope.context.accountNumber))throw Error('Foreign financial source flight.');refs=[...new Set(flights.map(row=>row.sourceFlightRef))].sort();if(refs.length>500)throw Error('Financial source selection exceeds 500 observed flights.');}finally{await selectedLibrary.candidate.close();}}finally{await selection.close();}
  return {target,observedListUrl:'https://vereinsflieger.de/member/profile/flightlog.php',observedDetailUrl:'',timeoutMs:300000,messageLimit:5000000,
    authorize:check,
    createRun:id=>new FinancialCollectionRun(target,id,refs,{hash,prepare:async gate=>{
      await check(gate);await financialNative.withCurrentStore(held,target,gate,async()=>{});
      await financialNative.withEvidence(held,target,gate,true,async store=>{if(!store)throw Error('Financial evidence journal unavailable.');await store.prepare(id,{source:'verified-own-flight-library',sourceFlightRefs:refs},new Date().toISOString());});
    }}),
    save:async(run,gate)=>{const receipt=await financialNative.withCurrentStore(held,target,gate,store=>run.save(store,()=>JSON.parse(identity) as FinancialObservationTarget,gate));
      if(!(run instanceof FinancialCollectionRun))throw Error('Unexpected financial workflow.');
      await financialNative.withEvidence(held,target,gate,true,async store=>{if(!store)throw Error('Financial evidence store unavailable.');await run.saveEvidence(store,gate);});return receipt;},
  };
}

import { traceLocalRead } from '../local-read-diagnostics';
import { canonical } from '@moflight/flight-logbook';
import * as Crypto from 'expo-crypto';
import { hash } from '../storage';
import { openOwnerRegistry, openRealFlightSelection, openRealFlightCommandJournal } from '../vereinsflieger/real-flight-native';
import { RealFlightService } from '../vereinsflieger/real-flight-service';
import { assertOwnFlightDetailOwner, serializeOwnFlightReads, type OwnFlightDetailContext } from './own-flight-reader';
import { loadProviderScope } from '../vereinsflieger/scoped-storage';
import { loadInformation } from '../vereinsflieger/information-native';
import { medicalSource } from './medical-source';
import { loadDutyRoster } from '../vereinsflieger/duty-native';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { canCacheStartView, makeStartPreview, readStartPreview, startDay, type StartPreview } from './start-preview';
import { loadStartPreviewCache, saveStartPreviewCache, clearStartPreviewCache } from './start-preview-native';

/** Read the selected real owner. Missing files stay missing; no fallback to the lab library. */
export const ownFlightReadPorts = serializeOwnFlightReads({
  async open(timing) {
    const timed = async <T>(name: string, work: () => Promise<T>): Promise<T> => {
      const finish = timing?.(name);
      try { const result = await work(); finish?.(true); return result; }
      catch (error) { finish?.(false); throw error; }
    };
    await timed('local-restore-gate', () => traceLocalRead('restore-gate', () => assertNoPendingUserBackupRestore()));
    const registry = await timed('owner-registry-open', () => traceLocalRead('registry-open', () => openOwnerRegistry(false)));
    if (!registry) return null;
    try {
      const lease = await timed('owner-selection', () => registry.currentOwner());
      if (!lease) { await registry.close(); return null; }
      let closed = false;
      let detailContext: OwnFlightDetailContext | undefined;
      let detailSelection: Awaited<ReturnType<typeof openRealFlightSelection>> = null;
      const scope = { registry, lease, authorize: () => closed ? null : {
        ownerId: lease.ownerId, storeId: lease.storeId, leaseId: lease.leaseId, writable: false,
      } };
      const journal = async () => {
        const opened = await timed('local-journal-open', () => openRealFlightCommandJournal(scope, false));
        if (!opened) throw new Error('Own-flight setup or recovery is incomplete.');
        return opened;
      };
      const service = new RealFlightService(lease.ownerId, lease.storeId, lease.leaseId, {
        authorize: scope.authorize, hash, uuid: Crypto.randomUUID, now: () => new Date().toISOString(),
        retrieve: async () => { throw new Error('Provider retrieval requires the explicit reviewed flow.'); },
        journal,
        repository: async serviceTiming => {
          const selection = await openRealFlightSelection(scope, false, undefined, timing ?? serviceTiming);
          if (!selection) throw new Error('Own-flight selection is unavailable.');
          try {
            const selected = await selection.select();
            detailContext = {ownerSelectionSeq: lease.selectionSeq, selectionIdentity: selected.selectionIdentity};
            return { library: selected.candidate, writable: !selected.recoveryRequired, warning: selected.warning,
              close: async () => { try { await selected.candidate.close(); } finally { await selection.close(); } } };
          } catch (error) { await selection.close(); throw error; }
        },
      });
      let informationRead: Promise<{scope: NonNullable<Awaited<ReturnType<typeof loadProviderScope>>>;captures:Awaited<ReturnType<typeof loadInformation>>}|null>|null=null;
      let informationAccount:string|null=null;
      async function readInformation(accountRef:string) {
        if(closed)throw new Error('Information reader closed');
        await registry!.assertCurrent(lease!);
        if(informationAccount!==null&&informationAccount!==accountRef)throw new Error('Information account changed');
        informationAccount=accountRef;
        informationRead??=(async()=>{
          const selected=await loadProviderScope(lease!.ownerId);
          if(!selected)return null;
          if(selected.owner!==lease!.ownerId||selected.context.accountNumber!==accountRef)throw new Error('Foreign information scope');
          const captures=await timed('local-information-load', () => loadInformation(selected,()=>{if(closed)throw new Error('Information reader closed');}));
          return {scope:selected,captures};
        })();
        const result=await informationRead;
        await registry!.assertCurrent(lease!);
        const current=await loadProviderScope(lease!.ownerId);
        if(closed||canonical(result?.scope??null)!==canonical(current))throw new Error('Information scope changed');
        return result;
      }
      let admittedPreview:StartPreview|null=null;
      async function previewGate(context:OwnFlightDetailContext) {
        await assertNoPendingUserBackupRestore();
        await registry!.assertCurrent(lease!);
        if(closed)throw new Error('Start preview reader closed');
        assertOwnFlightDetailOwner(context,lease!.selectionSeq);
        const opened=await journal();
        try { if(await opened.pending())throw new Error('Start preview blocked by pending save'); }
        finally { await opened.close(); }
        detailSelection??=await openRealFlightSelection(scope,false);
        if(!detailSelection)throw new Error('Start preview selection missing');
        await detailSelection.assertIdentity(context.selectionIdentity);
        if((await detailSelection.listRestorePreparations()).some(item=>item.status==='pending'))throw new Error('Start preview blocked by restore');
        await registry!.assertCurrent(lease!);
        await assertNoPendingUserBackupRestore();
      }
      return { ownerId: lease.ownerId, storeId: lease.storeId,
        readStartPreview:async()=>{
          const text=await loadStartPreviewCache(lease.storeId);
          if(!text)return null;
          const selected=await loadProviderScope(lease.ownerId);
          if(!selected)return null;
          const preview=readStartPreview(text,{ownerId:lease.ownerId,storeId:lease.storeId,scope:selected,selectionSeq:lease.selectionSeq},Date.now());
          if(!preview)return null;
          await previewGate(preview.context);
          if(canonical(await loadProviderScope(lease.ownerId))!==canonical(selected))return null;
          await registry.assertCurrent(lease);
          admittedPreview=preview;
          return preview;
        },
        saveStartPreview:async view=>{
          if(!canCacheStartView(view)){await clearStartPreviewCache(lease.storeId);return;}
          const selected=await loadProviderScope(lease.ownerId);
          if(!selected||selected.context.accountNumber!==view.snapshot.account?.accountRef||view.snapshot.ownerId!==lease.ownerId||view.snapshot.storeId!==lease.storeId)return;
          const now=Date.now();
          const revision=await hash(canonical([startDay(now),view.snapshot.generation,view.snapshot.savedRetrievals,view.medical??null,view.duties??null,view.featureInformation?.workSummary??null]));
          if(admittedPreview?.revision===revision)return;
          const preview=makeStartPreview(view,selected,now,revision);
          if(!preview){await clearStartPreviewCache(lease.storeId);return;}
          const gate=async()=>{
            await previewGate(preview.context);
            if(canonical(await loadProviderScope(lease.ownerId))!==canonical(selected))throw new Error('Start preview provider scope changed');
          };
          await saveStartPreviewCache(lease.storeId,canonical(preview),gate);
        },
        clearStartPreview:()=>clearStartPreviewCache(lease.storeId),
        service: {
          readStored: (initial, span) => service.readStored(initial, span, true),
          detail: id => service.detail(id),
          readReviewEvidence: () => service.readReviewEvidence(),
          readBindingEvidence: () => service.readBindingEvidence(),
        },
        detailContext: () => detailContext,
        assertDetailContext: async context => {
          await assertNoPendingUserBackupRestore();
          await registry.assertCurrent(lease);
          if (closed) throw new Error('Displayed flight reader closed');
          assertOwnFlightDetailOwner(context, lease.selectionSeq);
          detailSelection ??= await openRealFlightSelection(scope, false);
          if (!detailSelection) throw new Error('Displayed flight selection is unavailable');
          await detailSelection.assertIdentity(context.selectionIdentity);
          await registry.assertCurrent(lease);
          await assertNoPendingUserBackupRestore();
        },
        readDuties:async(accountRef:string)=>{
          await registry.assertCurrent(lease);
          const selected=await loadProviderScope(lease.ownerId);
          if(!selected)return null;
          if(selected.owner!==lease.ownerId||selected.context.accountNumber!==accountRef)throw new Error('Foreign duty scope');
          const snapshot=await loadDutyRoster(selected,()=>{if(closed)throw new Error('Duty reader closed');});
          await registry.assertCurrent(lease);
          return {scope:selected,snapshot};
        },
        readFeatureInformation:readInformation,
        readMedical:async(accountRef:string)=>{
          const source=await readInformation(accountRef);
          return source?medicalSource(source.captures,lease.ownerId):null;
        },
        assertCurrent: () => registry.assertCurrent(lease),
        pendingCommand: async () => { const opened = await journal(); try { return !!await timed('local-journal-read', () => opened.pending()); } finally { await timed('local-journal-close', () => opened.close()); } },
        close: async () => { if (!closed) { closed = true; service.dispose(); try { await detailSelection?.close(); } finally { await registry.close(); } } },
      };
    } catch (error) { await registry.close(); throw error; }
  },
});

import * as Crypto from 'expo-crypto';
import { openOwnerRegistry } from '../vereinsflieger/real-flight-native';
import { assertNoPendingUserBackupRestore } from '../user-backup-restore-journal-native';
import { ownFlightReadPorts } from '../mobile/own-flight-reader-native';
import { openOwnerChatStoreNative } from './chat-native';
import { loadHistoricalIdentityNative } from './historical-provider-identity-native';
import { readAiFlightSnapshot, assertAiFlightSnapshotCurrent, type AiFlightContextPorts } from './flight-context';
import { AiFlightTools } from './flight-tools';
import type { AiRunTools } from './run-controller';
import type { HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index';

/** Opens only the already selected owner, never a synthetic fallback or a provider session. */
export async function openAiWorkspaceNative(gate:()=>Promise<void>) {
  await gate();await assertNoPendingUserBackupRestore();
  const registry=await openOwnerRegistry(false);if(!registry)return null;
  let closed=false;
  try {
    const lease=await registry.currentOwner();if(!lease){await registry.close();return null;}
    const check=async()=>{await gate();if(closed)throw new Error('AI workspace closed');await registry.assertCurrent(lease);await assertNoPendingUserBackupRestore();};
    const store=await openOwnerChatStoreNative({registry,lease,authorize:()=>closed?null:{ownerId:lease.ownerId,storeId:lease.storeId,leaseId:lease.leaseId,writable:true}},check);
    const ports:AiFlightContextPorts={flights:ownFlightReadPorts,currentOwner:async()=>{await check();return lease.ownerId;}};
    return {store,ownerId:lease.ownerId,assertCurrent:check,
      identity:async()=>{await check();const identity=await loadHistoricalIdentityNative(check);await check();return identity;},
      tools:async(identity:HistoricalProviderIdentity,maximumCalls:number):Promise<AiRunTools>=>{
        await check();const snapshot=await readAiFlightSnapshot(ports,identity,1);await check();
        const assertCurrent=async()=>{await check();await assertAiFlightSnapshotCurrent(ports,identity,snapshot);await check();};
        const tools=new AiFlightTools(snapshot,{assertCurrent,token:()=>Crypto.randomUUID().replace(/-/g,'')+Crypto.randomUUID().replace(/-/g,'')},new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Berlin'}),maximumCalls);
        return {context:snapshot.context,references:[...(snapshot.projection?.references??[]),...(snapshot.sourceReview?.references??[])],metrics:tools.metrics,
          assertCurrent,execute:call=>tools.execute(call),dispose:()=>tools.dispose()};
      },
      async close(){if(closed)return;closed=true;try{await store.close();}finally{await registry.close();}},
    };
  }catch(error){closed=true;await registry.close();throw error;}
}
export type AiNativeWorkspace=NonNullable<Awaited<ReturnType<typeof openAiWorkspaceNative>>>;

import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import type {Directory} from 'expo-file-system';
import {canonical} from '@moflight/flight-logbook';
import {hash} from '../storage';
import {RealFlightLibrary} from '../vereinsflieger/real-flight-library';
import {RealFlightCommandJournal} from '../vereinsflieger/real-flight-command-journal';
import {RealFlightService} from '../vereinsflieger/real-flight-service';
import {openRealFlightNativeDriver} from '../vereinsflieger/real-flight-native-driver';
import type {ProviderScope} from '../vereinsflieger/scope-store';
import {makeStartPreview} from '../mobile/start-preview';
import {responsivenessSource} from './android-flight-responsiveness';
import {RECOVERY_AT} from './android-core-recovery-fixture';

/** Test-only native history, below a fresh caller-owned cache directory. */
export async function createNativeStartCacheFixture(directory:Directory,storeId:string,count:number,accountNumber:string) {
 const ownerId=Crypto.randomUUID(),leaseId=Crypto.randomUUID();
 const authorize=()=>({ownerId,storeId,leaseId,writable:true});
 const open=(name:string)=>openRealFlightNativeDriver(name,(file,options)=>SQLite.openDatabaseAsync(file,options,directory.uri));
 const libraryName=`history-${storeId}.sqlite`,journalName=`commands-${storeId}.sqlite`;
 const initial=await RealFlightLibrary.create(await open(libraryName),{singleton:1,family:'moflight-real-flight-history',schema_version:1,payload_version:1,owner_id:ownerId,store_id:storeId,created_at:RECOVERY_AT},hash,authorize);
 await initial.close();
 await (await RealFlightCommandJournal.open(await open(journalName),ownerId,storeId,authorize,hash,true)).close();
 const source=responsivenessSource(`native-cache-${storeId}`,count);
 source.binding.accountRef=accountNumber;source.contextBefore.accountNumber=accountNumber;source.contextAfter.accountNumber=accountNumber;
 const service=new RealFlightService(ownerId,storeId,leaseId,{
  authorize,hash,uuid:Crypto.randomUUID,now:()=>RECOVERY_AT,retrieve:async()=>source,
  repository:async()=>{const library=await RealFlightLibrary.open(await open(libraryName),ownerId,storeId,hash,authorize);return{library,writable:true,warning:null,close:()=>library.close()};},
  journal:async()=>RealFlightCommandJournal.open(await open(journalName),ownerId,storeId,authorize,hash),
 });
 try {
  await service.saveVerifiedReview(await service.retrieveUpdate(new Date(RECOVERY_AT)),{accountNumber,clubLabel:source.contextBefore.clubLabel});
  const scope:ProviderScope={version:1,owner:ownerId,connectionId:Crypto.randomUUID(),context:{...source.contextBefore}};
  const read=async()=>({...await service.readStored(),pendingCommand:false,detailContext:{ownerSelectionSeq:1,selectionIdentity:'synthetic-cache-selection'}});
  const view=await read(),revision=await hash(canonical(view.snapshot));
  const preview=makeStartPreview(view,scope,Date.parse(RECOVERY_AT),revision);
  if(!preview||view.flights.length!==count)throw new Error('Synthetic native history preparation failed');
  return{preview,read,close:()=>service.dispose(),flights:count};
 }catch(error){service.dispose();throw error;}
}

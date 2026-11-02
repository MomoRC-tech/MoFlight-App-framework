import { AppState } from 'react-native';
import { canonical } from '@moflight/flight-logbook';
import { hash } from '../storage';
import { openOwnerRegistry } from './real-flight-native';
import { financialNative } from './expense-native';
import { decodeFinancialEvidence, financialProofsFor } from './expense-evidence-store';
import { readCapturedFinancialSnapshot } from './expense-projection-adapter';
import type { FinancialAnalysisData } from '../mobile/financial-analysis-model';

export interface FinancialExpectedOwner{ownerId:string;storeId:string;accountRef:string}
/** Offline read only. Absent financial stores are never initialized; every
 * result is pinned to the UI's already verified own-flight owner/account. */
export async function readFinancialAnalysisNative(expected:FinancialExpectedOwner,current:()=>void):Promise<FinancialAnalysisData|null>{
  current();const registry=await openOwnerRegistry(false);if(!registry)return null;
  try{const lease=await registry.currentOwner();if(!lease||lease.ownerId!==expected.ownerId||lease.storeId!==expected.storeId)throw Error('Financial owner selection changed.');
    let closed=false;const scope={registry,lease,authorize:()=>!closed&&AppState.currentState==='active'?{ownerId:lease.ownerId,storeId:lease.storeId,leaseId:lease.leaseId,writable:false}:null};
    const gate=async()=>{current();if(AppState.currentState!=='active')throw Error('Financial reader backgrounded.');await registry.assertCurrent(lease);current();};
    const target=await financialNative.currentTarget(scope,gate);if(!target||target.scope.context.accountNumber!==expected.accountRef)throw Error('Financial provider account changed.');
    const section=await financialNative.exportSection(scope,gate);await gate();if(section.state==='absent')return null;
    const evidence=section.evidence&&section.evidence.state!=='absent'?await decodeFinancialEvidence(section.evidence.archive,target,hash):[];
    const expectedEvidence=section.evidence&&section.evidence.state!=='absent'?await Promise.all(evidence.map(async value=>({id:value.id,checksum:await hash(canonical(value))}))):null;
    const read=await readCapturedFinancialSnapshot(section.archive,target,{hash,
      async gate(_target,inventory){await gate();const actual=await financialNative.inventory(scope,target,gate);if(!actual||inventory&&canonical(actual.raw)!==canonical(inventory)||canonical(actual.evidence?.map(({id,checksum})=>({id,checksum}))??null)!==canonical(expectedEvidence))throw Error('Financial source changed during reading.');await gate();},
      readInvoiceBookingEvidence:(_target,receipts)=>financialProofsFor(target,evidence,receipts,hash),
    });
    await read.checkCurrent();await gate();const result={snapshot:read.snapshot,evidence,receipts:read.receipts};closed=true;return result;
  }finally{await registry.close();}
}

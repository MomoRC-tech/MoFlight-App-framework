import React,{useEffect,useState} from 'react';
import {ScrollView,View,Text} from 'react-native';
import * as Crypto from 'expo-crypto';
import {Directory,File,Paths} from 'expo-file-system';
import {openDriver} from '../storage';
import {RealOwnerRegistry} from '../vereinsflieger/real-owner-registry';
import type {RealFlightNativeScope} from '../vereinsflieger/real-flight-native';
import {readSyncEstimateHistory,saveSyncEstimateHistory} from '../mobile/sync-estimate-native';
import {createSyncEstimate,reduceSyncEstimate,SYNC_ESTIMATE_MODEL_VERSION,type SyncEstimateHistory} from '../mobile/sync-estimate';
import {SyncActivityIndicator,SyncProgress} from '../mobile/SyncProgress';
import type {SyncProgress as Progress} from '../mobile/sync-progress';
import {colors} from '../mobile/theme';

const context='synthetic-native-sync-proof';
const history:SyncEstimateHistory={version:SYNC_ESTIMATE_MODEL_VERSION,scope:context,samples:[{mode:'repeat',volume:'small',stage:'flights',durationsMs:[1000]}]};
function sample(percent:number):Progress{
  let estimate=createSyncEstimate({runId:`proof-${percent}`,scope:context,mode:'repeat',volume:'small',stages:['flights'],history,now:0});
  estimate=reduceSyncEstimate(estimate,{runId:estimate.runId,type:'start',stage:'flights',at:0});
  estimate=reduceSyncEstimate(estimate,{runId:estimate.runId,type:'count',stage:'flights',done:percent,total:100,at:0});
  estimate=reduceSyncEstimate(estimate,{runId:estimate.runId,type:'pause',reason:'sign-in',at:0});
  return {state:'active',last:'account',current:'flights',count:{done:percent,total:100,unit:'flights'},estimate};
}
/** Build-only component proving real native rendering/cache; no production routing or provider. */
export default function SyncProgressProof(){
  const [status,setStatus]=useState('CACHE_CHECKING'),[progress,setProgress]=useState(sample(50));
  useEffect(()=>{void (async()=>{
    const directory=new Directory(Paths.cache,'moflight-sync-native-proof');directory.create({idempotent:true,intermediates:true});
    const file=new File(directory,'registry.sqlite'),existed=file.exists;
    const driver=await openDriver('registry.sqlite',directory.uri);
    const registry=existed?await RealOwnerRegistry.open(driver,Crypto.randomUUID):await RealOwnerRegistry.create(driver,Crypto.randomUUID,'2026-10-26T00:00:00.000Z');
    try{
      const lease=await registry.currentOwner()??await registry.createFreshOwner('2026-10-26T00:00:00.000Z');
      const scope:RealFlightNativeScope={registry,lease,authorize:()=>({ownerId:lease.ownerId,storeId:lease.storeId,leaseId:lease.leaseId,writable:true})};
      if(existed){const read=await readSyncEstimateHistory(scope,context);if(JSON.stringify(read.samples)!==JSON.stringify(history.samples))throw new Error('Hints did not survive process restart');}
      await saveSyncEstimateHistory(scope,history);
      if((await readSyncEstimateHistory(scope,'incompatible-model')).samples.length)throw new Error('Incompatible context reused');
      let rejected=false;try{await readSyncEstimateHistory({...scope,authorize:()=>({...scope.authorize()!,ownerId:Crypto.randomUUID()})},context);}catch{rejected=true;}
      if(!rejected)throw new Error('Foreign scope accepted');
      const result={cacheSeeded:true,reopened:existed,foreignScopeRejected:true,incompatibleContextDiscarded:true};
      console.info('MOFLIGHT_SYNC_NATIVE_PROOF '+JSON.stringify(result));setStatus(existed?'CACHE_REOPEN_PASSED':'CACHE_SEEDED');
    }finally{await registry.close();}
  })().catch(error=>{setStatus('CACHE_FAILED '+String(error));console.error('MOFLIGHT_SYNC_NATIVE_FAILED '+String(error));});},[]);
  return <ScrollView style={{flex:1,backgroundColor:colors.background}} contentContainerStyle={{padding:18,gap:16}}>
    <Text style={{color:colors.text}}>Synthetic Sync component and native cache proof</Text>
    <Text style={{color:colors.text}}>{status}</Text>
    {[0,25,50,75,99].map(percent=><View key={percent} style={{flexDirection:'row',gap:16,alignItems:'center'}}><SyncActivityIndicator progress={sample(percent)}/><Text style={{color:colors.text}}>{percent}% · paused estimate</Text></View>)}
    <SyncProgress progress={progress} retry={()=>setProgress(sample(50))} details={()=>{}} canCancel cancel={()=>setProgress({state:'failed',last:'account',current:null,message:'Synthetic cancellation preserved data.'})}/>
    <SyncProgress progress={{state:'active',last:'review',current:'save',estimate:{...sample(50).estimate!,runId:'overrun',status:'active',current:'flights',now:performance.now(),units:[{stage:'flights',expectedMs:1000,elapsedMs:2000,done:false}],fraction:.9}}} retry={()=>{}} details={()=>{}}/>
  </ScrollView>;
}

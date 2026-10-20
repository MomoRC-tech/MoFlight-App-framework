import React, { useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import { realHistoryUuid } from '../vereinsflieger/real-history-contract';
import { runFlightResponsiveness } from './android-flight-responsiveness';

/** Build-entry override only. Install exclusively on the designated synthetic AVD. */
export default function AndroidFlightResponsivenessPoc() {
  const [status,setStatus]=useState('RUNNING');
  useEffect(()=>{
    let active=true;
    const timer={last:performance.now(),maximum:0};
    const heartbeat=setInterval(()=>{const now=performance.now();timer.maximum=Math.max(timer.maximum,now-timer.last);timer.last=now;},50);
    void (async()=>{
      const marker=new File(Paths.document,'native-responsiveness-run.txt');
      const seed=!marker.exists, runId=seed?Crypto.randomUUID():(await marker.text()).trim();
      realHistoryUuid(runId);
      if(seed){marker.create({overwrite:false});marker.write(runId);}
      const report=await runFlightResponsiveness({
        open:name=>openRealFlightNativeDriver(name,(databaseName,options)=>SQLite.openDatabaseAsync(databaseName,options)),
        hash:text=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text),uuid:Crypto.randomUUID,now:()=>performance.now(),
      },runId,seed,stage=>console.info('MOFLIGHT_PROBE_STAGE '+JSON.stringify(stage)));
      // Let the heartbeat observe any final synchronous work before summarizing.
      await new Promise(resolve=>{setTimeout(resolve,60);});
      const result={...report,maxHeartbeatIntervalMilliseconds:timer.maximum};
      const file=new File(Paths.document,`native-responsiveness-${report.mode}-${Crypto.randomUUID()}.json`);
      file.create({overwrite:false});file.write(JSON.stringify(result));
      console.info('MOFLIGHT_PROBE_RESULT '+JSON.stringify(result));
      if(active)setStatus('PROBE_PASSED');
    })().catch(error=>{console.error('MOFLIGHT_PROBE_FAILED '+String(error));if(active)setStatus('PROBE_FAILED');})
      .finally(()=>clearInterval(heartbeat));
    return()=>{active=false;clearInterval(heartbeat);};
  },[]);
  return <ScrollView><Text>Synthetic flight responsiveness probe</Text><Text>{status}</Text></ScrollView>;
}

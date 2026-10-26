import React, { useEffect, useLayoutEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { openRealFlightNativeDriver } from '../vereinsflieger/real-flight-native-driver';
import { realHistoryUuid } from '../vereinsflieger/real-history-contract';
import { runFlightDetailProof, type DetailRenderProxy } from './android-flight-detail-proof';
import type { RealFlightDetail } from '../vereinsflieger/real-flight-library';
import { FlightDetails } from '../mobile/FlightDetails';
import { colors } from '../mobile/theme';
import { runNativeSourceReadbackProof } from './native-source-readback-proof';

/** Build-entry override only. Install exclusively on the designated synthetic AVD. */
export default function AndroidFlightResponsivenessPoc() {
  const [status,setStatus]=useState('RUNNING');
  const [display,setDisplay]=useState<{detail:RealFlightDetail;label:string;start:number;resolve:(result:DetailRenderProxy)=>void}|null>(null);
  const [rawPage,setRawPage]=useState(0);
  useLayoutEffect(()=>{
    if(!display)return;
    const commit=performance.now()-display.start;
    const frame=requestAnimationFrame(()=>display.resolve({renderCommitMilliseconds:commit,nextFrameCallbackMilliseconds:performance.now()-display.start}));
    return()=>cancelAnimationFrame(frame);
  },[display]);
  useEffect(()=>{
    let active=true;
    const timer={last:performance.now(),maximum:0};
    const heartbeat=setInterval(()=>{const now=performance.now();timer.maximum=Math.max(timer.maximum,now-timer.last);timer.last=now;},50);
    void (async()=>{
      const marker=new File(Paths.document,'native-detail-reuse-v1-run.txt');
      const seed=!marker.exists, runId=seed?Crypto.randomUUID():(await marker.text()).trim();
      realHistoryUuid(runId);
      if(seed){marker.create({overwrite:false});marker.write(runId);}
      const report=await runFlightDetailProof({
        open:name=>openRealFlightNativeDriver(name,(databaseName,options)=>SQLite.openDatabaseAsync(databaseName,options)),
        hash:text=>Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,text),uuid:Crypto.randomUUID,now:()=>performance.now(),
        display:(detail,label)=>new Promise(resolve=>{setDisplay({detail,label,start:performance.now(),resolve});}),
      },runId,seed);
      const sourceReadback=await runNativeSourceReadbackProof();
      // Let the heartbeat observe any final synchronous work before summarizing.
      await new Promise(resolve=>{setTimeout(resolve,60);});
      const result={...report,sourceReadback,maxHeartbeatIntervalMilliseconds:timer.maximum};
      const file=new File(Paths.document,`native-detail-v1-${report.mode}-${Crypto.randomUUID()}.json`);
      file.create({overwrite:false});file.write(JSON.stringify(result));
      for(const sample of report.samples)console.info('MOFLIGHT_PROBE_SAMPLE '+JSON.stringify(sample));
      const {samples,...summary}=result;
      console.info('MOFLIGHT_PROBE_RESULT '+JSON.stringify({...summary,sampleCount:samples.length,reportFile:file.name}));
      if(active)setStatus('PROBE_PASSED');
    })().catch(error=>{console.error('MOFLIGHT_PROBE_FAILED '+String(error));if(active)setStatus('PROBE_FAILED');})
      .finally(()=>clearInterval(heartbeat));
    return()=>{active=false;clearInterval(heartbeat);};
  },[]);
  return <ScrollView style={{backgroundColor:colors.background}} contentContainerStyle={{padding:16,gap:12}}>
    <Text style={{color:colors.text}}>Synthetic displayed-flight detail proof</Text><Text style={{color:colors.text}}>{status}</Text>
    <Text style={{color:colors.text}}>Render metric: React commit / next frame callback; not tap-to-visible.</Text>
    {display&&<View><Text style={{color:colors.text}}>{display.label}</Text><FlightDetails detail={display.detail} rawPage={rawPage} onRawPage={setRawPage}/></View>}
  </ScrollView>;
}

import React,{useEffect,useState} from 'react';
import {ScrollView,Text} from 'react-native';
import {runSyncNativeBenchmark} from './sync-native-benchmark';
/** Synthetic entry override only; never routed from the ordinary application. */
export default function SyncBenchmarkProof(){
  const [status,setStatus]=useState('RUNNING');
  useEffect(()=>{void runSyncNativeBenchmark(setStatus).then(()=>setStatus('SYNC_BENCHMARK_PASSED'),error=>{console.error('MOFLIGHT_SYNC_BENCHMARK_FAILED '+String(error));setStatus('SYNC_BENCHMARK_FAILED '+String(error));});},[]);
  return <ScrollView><Text>Synthetic fixed-state Sync benchmark</Text><Text>{status}</Text></ScrollView>;
}

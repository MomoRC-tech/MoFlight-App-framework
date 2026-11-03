import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import {runNativeStartCacheProof} from './native-start-cache-proof';
/** Unimported by the ordinary app; designated synthetic AVD only. */
export default function StartCacheProof(){
 const [status,setStatus]=useState('RUNNING');
 useEffect(()=>{void runNativeStartCacheProof().then(result=>{
  console.info('MOFLIGHT_START_CACHE_RESULT '+JSON.stringify(result));setStatus(result.status==='passed'?'START_CACHE_PASSED':'START_CACHE_FAILED');
 },error=>{console.error('MOFLIGHT_START_CACHE_FAILED '+String(error));setStatus('START_CACHE_FAILED');});},[]);
 return <View><Text>Synthetic native Start cache proof</Text><Text>{status}</Text></View>;
}

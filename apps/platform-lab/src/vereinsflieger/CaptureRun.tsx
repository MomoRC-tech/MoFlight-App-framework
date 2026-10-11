import React, {useEffect,useRef,useState} from 'react';
import {Text,Pressable,View,ScrollView,StyleSheet} from 'react-native';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import {PROFILE_URL,contextScript,validateContext,sameContext,scopedBridge,type ObservedContext} from './context';
import {FLIGHT_URL,LOGIN_URL,providerUrl,decodeProbe,probeScript,type ProbeSnapshot} from './probe';
import {DETAIL_LABELS,DETAIL_READER_SOURCE} from './details';
import {createRun,nextDetail,completeDetail,type CaptureRun as Run} from './capture-run';
import {saveRun,readRun} from './storage';
type Step={kind:'profile'|'list'|'detail';url:string;nonce:string};
function Button({title,press,disabled}:{title:string;press:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={styles.button}><Text style={{color:'white'}}>{title}</Text></Pressable>;}
export function CaptureRun({close}:{close:()=>void}) {
  const web=useRef<WebView>(null),run=useRef<Run|null>(null),step=useRef<Step|null>(null),context=useRef<ObservedContext|null>(null),fresh=useRef<ProbeSnapshot|null>(null),alive=useRef(true),receiving=useRef(false),resuming=useRef(false),timer=useRef<ReturnType<typeof setTimeout>|null>(null),epoch=useRef(0),currentUrl=useRef(LOGIN_URL);
  const [ready,setReady]=useState(false);
  const [source,setSource]=useState(LOGIN_URL),[generation,setGeneration]=useState(0),[busy,setBusy]=useState(false),[saved,setSaved]=useState<Run|null>(null),[status,setStatus]=useState('Sign in on the original provider page. Then start a bounded capture.'),[confirmed,setConfirmed]=useState(false),[shownContext,setShownContext]=useState<ObservedContext|null>(null);
  function stop(message:string){step.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;web.current?.stopLoading();if(alive.current){setBusy(false);setStatus(message);}}
  useEffect(()=>{alive.current=true;void readRun().then(r=>{if(alive.current){run.current=r;setSaved(r);}}).catch(()=>{if(alive.current)setStatus('Saved checkpoint is unreadable; preserved for review.');}).finally(()=>{if(alive.current)setReady(true);});return()=>{alive.current=false;epoch.current++;if(timer.current)clearTimeout(timer.current);};},[]);
  function navigate(next:Step){if(timer.current)clearTimeout(timer.current);step.current=next;currentUrl.current=next.url;setSource(next.url);epoch.current++;setGeneration(epoch.current);timer.current=setTimeout(()=>{if(step.current?.nonce===next.nonce)stop('Provider request timed out. Saved detail successes remain available; retry after sign-in.');},20_000);}
  function request(kind:Step['kind'],url:string){navigate({kind,url,nonce:Crypto.randomUUID()});}
  function start(resume:boolean){if(!ready||busy||receiving.current)return;resuming.current=resume;context.current=null;fresh.current=null;setConfirmed(false);setShownContext(null);setBusy(true);request('profile',PROFILE_URL);setStatus('Reading your provider user number and current club label…');}
  async function persist(r:Run){await saveRun(r);run.current=r;if(alive.current)setSaved(r);}
  function proceed(){const r=run.current;if(!r||!context.current||!fresh.current)return;const next=nextDetail(r,context.current,fresh.current);if(!next){stop('Bounded detail capture complete. Full history, stable club identity and time mapping remain unverified.');return;}request('profile',PROFILE_URL);}
  async function receive(event:WebViewMessageEvent){
    const owner=step.current;if(!owner||receiving.current||!scopedBridge(event.nativeEvent.url,currentUrl.current,owner.url)||event.nativeEvent.data.length>200_000)return;
    const pageEpoch=epoch.current;receiving.current=true;
    try{const message=JSON.parse(event.nativeEvent.data);if(message.nonce!==owner.nonce||message.url!==owner.url)return;if(timer.current)clearTimeout(timer.current);
      if(owner.kind==='profile'){
        if(message.kind!=='vf-context-v1')throw new Error('Unexpected context response');const observed=validateContext(message.context);
        if(context.current&&!sameContext(context.current,observed)||resuming.current&&run.current&&!sameContext(run.current.context,observed)){if(run.current)await persist({...run.current,revision:run.current.revision+1,stop:'context-changed'});stop('Account or club context changed. Existing checkpoint retained; start a separate run after reviewing the account.');return;}
        context.current=observed;
        if(!fresh.current){setShownContext(observed);step.current=null;setStatus('Confirm this observed account and club for the bounded capture. Club label is not a verified stable club ID.');setBusy(false);return;}
        const next=nextDetail(run.current!,observed,fresh.current);if(next)request('detail',next);else stop('Bounded detail capture complete.');
      }else if(owner.kind==='list'){
        const list=decodeProbe(event.nativeEvent.data,event.nativeEvent.url,owner.nonce,new Date().toISOString(),currentUrl.current);fresh.current=list;
        if(!resuming.current){await persist(createRun(Crypto.randomUUID(),context.current!,list));}
        if(!alive.current||pageEpoch!==epoch.current)return;proceed();
      }else{
        if(message.kind!=='vf-detail-v1')throw new Error('Unexpected detail response');const next=completeDetail(run.current!,context.current!,owner.url,message.result,new Date().toISOString());await persist(next);if(!alive.current||pageEpoch!==epoch.current)return;if(next.stop!=='none'){stop('Detail unavailable or session expired. Successful details preserved; sign in and resume.');return;}proceed();
      }
    }catch{if(alive.current&&pageEpoch===epoch.current)stop('Unsupported provider response or checkpoint write failure. Earlier evidence preserved.');}finally{receiving.current=false;}
  }
  function loaded(url:string){const owner=step.current;if(!owner)return;if(url!==owner.url){stop('Provider login or another page opened. Complete sign-in, then resume.');return;}
    const script=owner.kind==='profile'?contextScript(owner.nonce):owner.kind==='list'?probeScript(owner.nonce):`window.ReactNativeWebView?.postMessage(JSON.stringify({kind:'vf-detail-v1',nonce:${JSON.stringify(owner.nonce)},url:location.href,result:(${DETAIL_READER_SOURCE})(${JSON.stringify(DETAIL_LABELS)})}));true;`;web.current?.injectJavaScript(script);}
  return <View style={styles.container}><Text style={styles.title}>Bounded capture and resume</Text><Text accessibilityLiveRegion="polite">{status}</Text><Text>Account number observed; club uses a display label. Recent visible list only, up to three details. No canonical import.</Text><View style={styles.actions}><Button title="Start bounded capture" disabled={busy||receiving.current} press={()=>start(false)}/><Button title="Resume saved details" disabled={busy||receiving.current||!saved} press={()=>start(true)}/><Button title="Close capture and resume" disabled={busy||receiving.current} press={close}/></View>
    {shownContext&&!confirmed&&<View><Text>Observed account: {shownContext.accountNumber} · club: {shownContext.clubLabel}</Text><Button title="Confirm observed account and retrieve bounded list" disabled={receiving.current} press={()=>{setConfirmed(true);setBusy(true);request('list',FLIGHT_URL);}}/></View>}
    {busy&&<Button title="Stop bounded capture" disabled={receiving.current} press={()=>{epoch.current++;setGeneration(epoch.current);stop('Stopped. Every committed detail remains available for resume.');}}/>}
    <WebView key={generation} ref={web} source={{uri:source}} style={styles.browser} originWhitelist={['*']} incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} cacheEnabled={false} cacheMode="LOAD_NO_CACHE" webviewDebuggingEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
      onShouldStartLoadWithRequest={r=>generation===epoch.current&&providerUrl(r.url)} onLoadStart={e=>{if(generation===epoch.current)currentUrl.current=e.nativeEvent.url;}} onNavigationStateChange={s=>{if(generation===epoch.current)currentUrl.current=s.url;}} onLoadEnd={e=>{if(generation===epoch.current)loaded(e.nativeEvent.url);}} onMessage={e=>{if(generation===epoch.current)void receive(e);}} onOpenWindow={()=>stop('New window blocked; capture retained.')} onError={()=>{if(generation===epoch.current)stop('Provider page failed; checkpoint retained.');}} onHttpError={()=>{if(generation===epoch.current)stop('Provider HTTP error; checkpoint retained.');}}/>
    {saved&&<ScrollView style={{maxHeight:180}}><Text>Saved list: {saved.list.rows.length} rows · list coverage: bounded visible list · details: {saved.details.length}/{saved.detailScope.length} · stop: {saved.stop}</Text>{saved.details.map(d=><Text key={d.sourceFlightId}>Detail {d.sourceFlightId}: {d.fields.length} preserved fields, {d.retrievedAt}</Text>)}</ScrollView>}
  </View>;
}
const styles=StyleSheet.create({container:{flex:1,padding:12,gap:10},title:{fontSize:22,fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:6},button:{backgroundColor:'#174c72',padding:12,borderRadius:6},browser:{flex:1,minHeight:180}});

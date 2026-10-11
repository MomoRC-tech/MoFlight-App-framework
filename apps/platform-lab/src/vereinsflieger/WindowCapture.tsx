import React,{useEffect,useRef,useState} from 'react';
import {Pressable,Text,View,StyleSheet} from 'react-native';
import {WebView,type WebViewMessageEvent} from 'react-native-webview';
import * as Crypto from 'expo-crypto';
import {PROFILE_URL,contextScript,contextFailure,scopedBridge,sameContext,validateContext,type ObservedContext} from './context';
import {FLIGHT_URL,LOGIN_URL,flightUrl,providerUrl} from './probe';
import {createWindow,appendWindow,decodeWindow,resumeWindow,windowProgress,windowScript,type WindowRun,type WindowScope,type WindowPage} from './window';
import {selectionScript,submitBatchScript,submitWindowScript,validateSelection} from './window-selection';
import {readWindow,saveWindow} from './storage';

type Step={kind:'profile'|'selection'|'page'|'resume';url:string;nonce:string;formResult?:boolean};
function Button({title,press,disabled=false}:{title:string;press:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={title} disabled={disabled} onPress={press} style={styles.button}><Text style={{color:'white'}}>{title}</Text></Pressable>;}
export function WindowCapture({close}:{close:()=>void}){
  const web=useRef<WebView>(null),step=useRef<Step|null>(null),run=useRef<WindowRun|null>(null),context=useRef<ObservedContext|null>(null),current=useRef(LOGIN_URL),alive=useRef(true),receiving=useRef(false),epoch=useRef(0),timer=useRef<ReturnType<typeof setTimeout>|null>(null),mode=useRef<'new'|'append'|'resume'>('new'),pending=useRef<string|null>(null);
  const pendingEvidence=useRef<{page:WindowPage;at:string;resume:boolean}|null>(null);
  const batch=useRef<5|200|undefined>(undefined),batchAttempted=useRef(false);
  const [batchSize,setBatchSize]=useState<5|200|undefined>(undefined);
  const year=new Date().getUTCFullYear(),planned=useRef<WindowScope>({from:`${year}-01-01`,through:`${year}-12-31`,participation:'pilot-or-companion'});
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[source,setSource]=useState(LOGIN_URL),[generation,setGeneration]=useState(0),[saved,setSaved]=useState<WindowRun|null>(null),[association,setAssociation]=useState<ObservedContext|null>(null),[status,setStatus]=useState('Sign in on the original page, then capture the current calendar year. Dates and participation are selected automatically.');
  function stop(message:string){const active=!!step.current;step.current=null;pendingEvidence.current=null;if(timer.current)clearTimeout(timer.current);timer.current=null;web.current?.stopLoading();if(alive.current){if(active){epoch.current++;setGeneration(epoch.current);setSource(current.current);}setBusy(false);setStatus(message);}}
  function arm(s:Step){if(timer.current)clearTimeout(timer.current);step.current=s;timer.current=setTimeout(()=>{if(step.current?.nonce===s.nonce)stop('Provider request timed out. Committed pages remain available for resume.');},25_000);}
  function request(kind:Step['kind'],url:string){arm({kind,url,nonce:Crypto.randomUUID()});current.current=url;epoch.current++;setGeneration(epoch.current);setSource(url);}
  useEffect(()=>{alive.current=true;void readWindow().then(r=>{if(alive.current){run.current=r;setSaved(r);}}).catch(()=>{if(alive.current)setStatus('Saved window is unreadable and preserved. A new capture uses a separate checkpoint.');}).finally(()=>{if(alive.current)setReady(true);});return()=>{alive.current=false;epoch.current++;if(timer.current)clearTimeout(timer.current);};},[]);
  function begin(resume:boolean){if(!ready||busy||receiving.current||resume&&!run.current)return;batch.current=batchSize;batchAttempted.current=false;mode.current=resume?'resume':'new';pending.current=null;pendingEvidence.current=null;context.current=null;setAssociation(null);setBusy(true);request('profile',PROFILE_URL);setStatus('Checking provider account and club context…');}
  function associated(){setAssociation(null);setBusy(true);if(mode.current==='resume')request('resume',run.current!.pages.at(-1)!.url);else request('selection',FLIGHT_URL);}
  async function persist(next:WindowRun){await saveWindow(next);run.current=next;if(alive.current)setSaved(next);}
  function proceed(){const r=run.current!,progress=windowProgress(r);if(progress.state!=='partial'){stop(`${progress.state==='bounded-limit'?'Bounded capture limit reached.':'Selected window captured.'} ${progress.records}/${progress.total} records; ${progress.detailGaps} lack a detail link. Source identity and flight-time mapping remain unverified.`);return;}pending.current=r.pages.at(-1)!.next;request('profile',PROFILE_URL);}
  async function receive(event:WebViewMessageEvent){
    const owner=step.current,document=current.current;if(!owner||receiving.current||event.nativeEvent.data.length>4_000_000||!scopedBridge(event.nativeEvent.url,document,document)||new URL(document).origin!==new URL(owner.url).origin)return;
    const pageEpoch=epoch.current;receiving.current=true;
    try{
      const message=JSON.parse(event.nativeEvent.data);if(message.nonce!==owner.nonce||message.url!==document)return;
      if(!owner.formResult&&document!==owner.url)return;
      if(timer.current)clearTimeout(timer.current);
      if(owner.kind==='profile'){
        if(message.kind!=='vf-context-v1')throw new Error('Wrong context response');const failure=contextFailure(message.context);if(failure){stop(failure);return;}const c=validateContext(message.context);
        if(context.current&&!sameContext(context.current,c)||mode.current!=='new'&&run.current&&!sameContext(run.current.context,c))throw new Error('Provider context changed');
        context.current=c;
        if(pendingEvidence.current){
          const evidence=pendingEvidence.current;pendingEvidence.current=null;
          if(evidence.resume){const next=resumeWindow(run.current!,c,evidence.page);mode.current='append';if(next)request('page',next);else proceed();return;}
          const next=mode.current==='new'?createWindow(Crypto.randomUUID(),c,evidence.page,evidence.at):appendWindow(run.current!,c,evidence.page,evidence.at);
          await persist(next);if(!alive.current||pageEpoch!==epoch.current)return;mode.current='append';proceed();return;
        }
        if(pending.current){const next=pending.current;pending.current=null;request('page',next);return;}
        if(run.current&&sameContext(run.current.context,c)){associated();return;}
        step.current=null;setBusy(false);setAssociation(c);setStatus('Confirm this local account association once. The club label is not a stable club ID.');
      }else if(owner.kind==='selection'){
        if(message.kind!=='vf-window-selection-v1')throw new Error('Wrong selection response');const action=validateSelection(message.result,document);
        if(action.action==='participation'){request('selection',action.target);return;}
        if(action.action==='batch-size'){
          if(batchAttempted.current||batch.current===undefined)throw new Error('Batch preference was not applied');batchAttempted.current=true;
          const next:Step={kind:'selection',url:action.target,nonce:Crypto.randomUUID(),formResult:true};arm(next);web.current?.injectJavaScript(submitBatchScript(batch.current,action.target,next.nonce));setStatus('Selecting the requested provider page size…');return;
        }
        const next:Step={kind:'page',url:action.target,nonce:Crypto.randomUUID(),formResult:true};arm(next);web.current?.injectJavaScript(submitWindowScript(planned.current,action.target,next.nonce));setStatus('Selecting the calendar year and inclusive own-flight scope…');
      }else{
        if(message.kind==='vf-window-submit-error')throw new Error('Date form changed');
        const at=new Date().toISOString(),page=decodeWindow(event.nativeEvent.data,event.nativeEvent.url,document,owner.nonce,at),expected=mode.current==='new'?planned.current:run.current!.pages[0]!.scope;
        if(page.scope.from!==expected.from||page.scope.through!==expected.through)throw new Error('Selected date window changed');
        pendingEvidence.current={page,at,resume:owner.kind==='resume'};request('profile',PROFILE_URL);
      }
    }catch{if(alive.current&&pageEpoch===epoch.current)stop('Sign-in, page scope, provider controls or saved evidence could not be verified. Earlier committed pages are preserved.');}finally{receiving.current=false;}
  }
  function loaded(url:string){const owner=step.current;if(!owner)return;
    if((owner.formResult?!flightUrl(url):url!==owner.url)){stop('Provider opened another page. Sign in again, then resume the saved window.');return;}
    current.current=url;const script=owner.kind==='profile'?contextScript(owner.nonce):owner.kind==='selection'?selectionScript(owner.nonce,batch.current):windowScript(owner.nonce);web.current?.injectJavaScript(script);
  }
  const progress=saved?windowProgress(saved):null;
  return <View style={styles.container}><Text style={styles.title}>Dated-window capture</Text><Text accessibilityLiveRegion="polite">{status}</Text><Text>Current calendar year only. Up to 1,000 records or 100 pages. Saved raw evidence stays separate from logbooks. No costs or canonical import.</Text>
    <View style={styles.actions}><Button title="Start dated-window capture" disabled={!ready||busy} press={()=>begin(false)}/><Button title="Resume saved window" disabled={!ready||busy||!saved} press={()=>begin(true)}/><Button title="Close dated-window capture" disabled={busy||receiving.current} press={close}/></View>
    <Button title={batchSize===undefined?'Capture batches: provider preference':batchSize===5?'Capture batches: 5 records':'Capture batches: 200 records'} disabled={busy||receiving.current} press={()=>setBatchSize(batchSize===undefined?5:batchSize===5?200:undefined)}/>
    <Text>Tap to choose smaller batches or 200 records for new captures. This changes the original provider list preference; resume keeps the saved page layout.</Text>
    {association&&<View><Text>Observed account: {association.accountNumber} · club: {association.clubLabel}</Text><Button title="Confirm account and capture dated window" press={associated}/></View>}
    {busy&&<Button title="Stop dated-window capture" disabled={receiving.current} press={()=>{if(receiving.current)return;stop('Stopped. Every committed page is retained. Resume rechecks the saved page and account.');}}/>}
    {saved&&progress&&<Text>Saved window {saved.pages[0]!.scope.from} to {saved.pages[0]!.scope.through}: {progress.records}/{progress.total} records · {progress.state} · saved pages {saved.pages.length} · accessible detail links {progress.detailLinks} · detail gaps {progress.detailGaps}.</Text>}
    <WebView key={generation} ref={web} source={{uri:source}} style={styles.browser} originWhitelist={['*']} incognito={false} thirdPartyCookiesEnabled={false} sharedCookiesEnabled={false} cacheEnabled={false} cacheMode="LOAD_NO_CACHE" webviewDebuggingEnabled={false} allowFileAccess={false} allowFileAccessFromFileURLs={false} allowUniversalAccessFromFileURLs={false} mixedContentMode="never" javaScriptCanOpenWindowsAutomatically={false} setSupportMultipleWindows={true}
      onShouldStartLoadWithRequest={r=>generation===epoch.current&&providerUrl(r.url)} onLoadStart={e=>{if(generation===epoch.current)current.current=e.nativeEvent.url;}} onNavigationStateChange={s=>{if(generation===epoch.current)current.current=s.url;}} onLoadEnd={e=>{if(generation===epoch.current)loaded(e.nativeEvent.url);}} onMessage={e=>{if(generation===epoch.current)void receive(e);}} onOpenWindow={()=>stop('New window blocked. Checkpoint retained.')} onError={()=>{if(generation===epoch.current)stop('Provider page failed. Checkpoint retained.');}} onHttpError={()=>{if(generation===epoch.current)stop('Provider HTTP error. Checkpoint retained.');}}/>
  </View>;
}
const styles=StyleSheet.create({container:{flex:1,padding:12,gap:10},title:{fontSize:22,fontWeight:'700'},actions:{flexDirection:'row',flexWrap:'wrap',gap:6},button:{backgroundColor:'#174c72',padding:12,borderRadius:6},browser:{flex:1,minHeight:180}});

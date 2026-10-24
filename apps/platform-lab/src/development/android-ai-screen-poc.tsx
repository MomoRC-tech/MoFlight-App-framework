import React,{useEffect,useRef,useState} from 'react';
import {Keyboard,KeyboardAvoidingView,Platform,ScrollView,Text,View,useWindowDimensions} from 'react-native';
import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import {File,Paths} from 'expo-file-system';
import {ChatStore} from '../ai/chat-store';
import type {ChatArchive} from '../ai/chat-model';
import {openRealFlightNativeDriver} from '../vereinsflieger/real-flight-native-driver';
import {AiChat} from '../mobile/AiChat';
import {colors} from '../mobile/theme';
// Explicit committed-source synthetic entry only. Never imported by the ordinary app.
let namespace='',mode:'seed'|'verify'='verify';
export function configureUpdateProof(value:string,operation:'seed'|'verify') {
  if(!/^[a-z][a-z0-9-]{0,30}$/.test(value)||!['seed','verify'].includes(operation))throw new Error('Invalid AI screen proof');
  namespace=value;mode=operation;
}
const owner='ai-screen-synthetic',at='2026-10-24T12:00:00.000Z',draft='Synthetic native draft, preserved offline.';
export default function AiScreenProof() {
  const [status,setStatus]=useState('UPDATE_PROOF_STARTING'),[archive,setArchive]=useState<ChatArchive|null>(null),[selected,setSelected]=useState('chat1'),[notice,setNotice]=useState<string|null>('Synthetic isolated UI. No model or provider connection.');
  const scroll=useRef<ScrollView|null>(null),[keyboardTop,setKeyboardTop]=useState<number|null>(null);const {height}=useWindowDimensions();
  const overlap=Platform.OS==='android'&&keyboardTop!==null?Math.max(0,height-keyboardTop):0;
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>|undefined;const show=Keyboard.addListener('keyboardDidShow',event=>{setKeyboardTop(event.endCoordinates.screenY);timer=setTimeout(()=>scroll.current?.scrollToEnd({animated:true}),120);});const hide=Keyboard.addListener('keyboardDidHide',()=>{setKeyboardTop(null);clearTimeout(timer);});return()=>{show.remove();hide.remove();clearTimeout(timer);};},[]);
  const draftSequence=useRef(0);const store=useRef<ChatStore|null>(null),writes=useRef(Promise.resolve()),running=useRef(false);
  useEffect(()=>{
    if(running.current)return;running.current=true;
    void(async()=>{
      if(!namespace)throw new Error('Missing AI screen namespace');
      const name=`ai-proof-${namespace}-screen.sqlite`,marker=new File(Paths.document,`ai-proof-${namespace}-screen.json`);
      const db=await openRealFlightNativeDriver(name,(path,options)=>SQLite.openDatabaseAsync(path,options));
      await db.exec('PRAGMA synchronous=FULL;');
      const chat=await ChatStore.open(db,owner,async()=>{});store.current=chat;
      if(mode==='seed') {
        if(!marker.exists){
          if((await chat.archive()).conversations.length)throw new Error('Existing synthetic screen file preserved');
          await chat.saveDraft('chat1','Offline draft',draft,null,at);
          await chat.appendMessage('chat1',{id:'message1',input:'Explain this synthetic aviation term.',context:null,status:'partial',answer:{version:1,text:'Synthetic partial answer. Unknown information stays unknown.',evidence:[],actions:[],metrics:[]},attempt:null,createdAt:at},at);
          await chat.saveDraft('chat2','Interrupted question','Another saved synthetic draft.',null,at);
          await chat.appendMessage('chat2',{id:'message2',input:'Synthetic interrupted question',context:null,status:'interrupted',answer:null,attempt:null,createdAt:at},at);
          marker.create({overwrite:false});marker.write(JSON.stringify({phase:'seeded',draftSha256:await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,draft)}));
        }
        setArchive(await chat.archive());setStatus('UPDATE_PROOF_SEEDED AI screen isolated drafts=durable');
      } else {
        if(!marker.exists)throw new Error('Missing isolated AI screen seed');
        const saved=await chat.archive(),conversation=saved.conversations.find(c=>c.id==='chat1');
        if(!conversation?.draft.startsWith(draft)||conversation.messages[0]?.status!=='partial'||saved.conversations.length!==2)throw new Error('AI screen restart data differs');
        const phase=JSON.parse(await marker.text()) as {phase:string;draftSha256:string};
        if(phase.draftSha256!==await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,conversation.draft))throw new Error('AI screen draft readback differs');
        await chat.close();store.current=null;
        if(phase.phase==='passed') {await SQLite.deleteDatabaseAsync(name);marker.delete();setStatus('UPDATE_PROOF_REOPENED AI screen offline=passed cleanup=complete');}
        else {marker.write(JSON.stringify({...phase,phase:'passed'}));setStatus('UPDATE_PROOF_PASSED AI screen drafts=durable partial=preserved');}
      }
    })().catch(()=>setStatus('UPDATE_PROOF_FAILED isolated AI screen'));
    return()=>{void writes.current.finally(async()=>{await store.current?.close();store.current=null;});};
  },[]);
  function mutate(work:(chat:ChatStore)=>Promise<void>,sequence?:number) {writes.current=writes.current.then(async()=>{const chat=store.current;if(!chat)return;await work(chat);const saved=await chat.archive();if(sequence===undefined||sequence===draftSequence.current)setArchive(saved);}).catch(()=>setNotice('Synthetic draft save failed.'));}
  return <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined} style={{flex:1,backgroundColor:colors.background,paddingTop:28,paddingBottom:overlap}}>
    <Text accessibilityLabel={status} style={{color:colors.text,fontSize:10,padding:6}}>{status}</Text>
    <ScrollView ref={scroll} onContentSizeChange={()=>{if(keyboardTop!==null)scroll.current?.scrollToEnd({animated:false});}} keyboardShouldPersistTaps="handled" contentContainerStyle={{padding:16}}>
      {archive&&<View><AiChat conversations={archive.conversations} selectedId={selected} enabled={false} busy={false} loading={false} notice={notice} usage={null} feature="question"
        onCreate={()=>{const next=Crypto.randomUUID();setSelected(next);mutate(chat=>chat.saveDraft(next,'New synthetic draft','Synthetic draft',null,at));}}
        onSelect={setSelected} onDelete={conversationId=>mutate(chat=>chat.delete(conversationId))} onDraft={value=>{const sequence=++draftSequence.current;setArchive(previous=>previous?{...previous,conversations:previous.conversations.map(c=>c.id===selected?{...c,draft:value}:c)}:previous);mutate(async chat=>{await chat.saveDraft(selected,'Offline draft',value,null,at);if(selected==='chat1'){const marker=new File(Paths.document,`ai-proof-${namespace}-screen.json`);marker.write(JSON.stringify({phase:'seeded',draftSha256:await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256,value)}));}},sequence);}}
        onSend={()=>setNotice('Unavailable: no network/model port in this isolated proof. Draft retained.')} onCancel={()=>{}} onToggle={()=>setNotice('Unavailable: no model/provider port.')} onFeature={()=>{}} onEvidence={()=>setNotice('Synthetic evidence preview only.')}/></View>}
    </ScrollView>
  </KeyboardAvoidingView>;
}

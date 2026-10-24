import React,{useEffect,useRef,useState} from 'react';
import {Alert,AppState} from 'react-native';
import * as Crypto from 'expo-crypto';
import {AiChat} from './AiChat';
import {AiRunController} from '../ai/run-controller';
import {openAiWorkspaceNative,type AiNativeWorkspace} from '../ai/workspace-native';
import type {ChatArchive,ChatMessage} from '../ai/chat-model';
import type {AiBudget,AiFeature} from '../../../../packages/ai-contracts/src/index';

const unavailable='Der AI-Dienst ist noch nicht freigeschaltet. Entwürfe und Gespräche bleiben lokal; es wird nichts gesendet.';
/** Ordinary route uses real owner storage and a closed transport until live gates pass. */
export function AiChatRoute({active,reload,onEvidence}:{active:boolean;reload:number|string;onEvidence:(message:ChatMessage,referenceIds:string[])=>Promise<void>}) {
  const [archive,setArchive]=useState<ChatArchive|null>(null),[selected,setSelected]=useState<string|null>(null);
  const [feature,setFeature]=useState<AiFeature>('question'),[notice,setNotice]=useState<string|null>(unavailable),[loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[usage,setUsage]=useState<AiBudget|null>(null);
  const workspace=useRef<AiNativeWorkspace|null>(null),controller=useRef<AiRunController|null>(null),alive=useRef(false),foreground=useRef(AppState.currentState==='active');
  const draftSequence=useRef(0),unsavedDraft=useRef(false);const writes=useRef(Promise.resolve());
  const refresh=async(w:AiNativeWorkspace,sequence?:number)=>{const next=await w.store.archive();if(alive.current&&workspace.current===w&&(sequence===undefined||sequence===draftSequence.current)){setArchive(next);setSelected(previous=>previous&&next.conversations.some(c=>c.id===previous)?previous:next.conversations[0]?.id??null);}};
  useEffect(()=>{
    alive.current=true;let revoked=false;
    const gate=async()=>{if(revoked||!foreground.current)throw new Error('AI-Auswahl ist nicht aktiv.');};
    const load=async()=>{
      setLoading(true);setArchive(null);setUsage(null);
      try {
        const w=await openAiWorkspaceNative(gate);if(revoked){await w?.close();return;}
        if(!w){setNotice('Noch keine eigene lokale Bibliothek. Melde dich über Daten in der Kopfzeile an.');return;}
        workspace.current=w;await w.store.recoverActive();
        controller.current=new AiRunController({store:w.store,identity:w.identity,tools:w.tools,enabled:()=>false,
          configuration:async()=>{throw new Error(unavailable);},transmit:async()=>{throw new Error(unavailable);},
          now:()=>new Date().toISOString(),token:()=>Crypto.randomUUID(),changed:budget=>{if(!alive.current||workspace.current!==w)return;if(budget)setUsage(budget);setBusy(controller.current?.busy??false);void refresh(w).catch(()=>{});}});
        await refresh(w);setNotice(unavailable);
      }catch{if(!revoked)setNotice('Gespeicherte Gespräche konnten nicht geöffnet werden. Daten bleiben erhalten.');}
      finally{if(!revoked)setLoading(false);}
    };
    void load();
    const listener=AppState.addEventListener('change',state=>{foreground.current=state==='active';if(state!=='active')void controller.current?.cancel().catch(()=>{});else if(workspace.current)void refresh(workspace.current).catch(()=>{});});
    return()=>{alive.current=false;revoked=true;listener.remove();const w=workspace.current;workspace.current=null;const c=controller.current;controller.current=null;
      void (async()=>{try{await c?.cancel();await writes.current;}finally{await w?.close();}})();};
  },[reload]);
  useEffect(()=>{if(!active)void controller.current?.cancel().catch(()=>{});},[active]);
  function mutate(work:(w:AiNativeWorkspace)=>Promise<void>,refreshResult=true) {
    const w=workspace.current;if(!w){setNotice('Entwürfe benötigen eine ausgewählte eigene Bibliothek.');return;}
    writes.current=writes.current.then(async()=>{await w.assertCurrent();await work(w);if(refreshResult)await refresh(w);}).catch(()=>{if(alive.current)setNotice('Änderung konnte nicht gespeichert werden. Bitte erneut prüfen.');});
  }
  const draft=(value:string)=>{
    const conversationId=selected??Crypto.randomUUID(),sequence=++draftSequence.current;
    unsavedDraft.current=true;
    setSelected(conversationId);
    // Optimistic text stays visible; writes retain keystroke order and Send awaits them.
    setArchive(previous=>previous?{...previous,conversations:previous.conversations.some(c=>c.id===conversationId)?previous.conversations.map(c=>c.id===conversationId?{...c,draft:value}:c):[
      {version:1,id:conversationId,ownerId:previous.ownerId,title:'Neues Gespräch',draft:value,context:null,messages:[],activitySequence:0,updatedAt:new Date().toISOString()},...previous.conversations]}:previous);
    mutate(async w=>{const current=await w.store.archive(),conversation=current.conversations.find(c=>c.id===conversationId);
      await w.store.saveDraft(conversationId,conversation?.title??'Neues Gespräch',value,conversation?.context??null,new Date().toISOString());
      // Refresh only the latest edit, avoiding older write acknowledgements replacing new text.
      if(sequence===draftSequence.current){unsavedDraft.current=false;await refresh(w,sequence);}},false);
  };
  return <AiChat conversations={archive?.conversations??[]} selectedId={selected} enabled={false} busy={busy} loading={loading} notice={notice} usage={usage} feature={feature}
    onCreate={()=>{const conversationId=Crypto.randomUUID();setSelected(conversationId);setArchive(previous=>previous?{...previous,conversations:[{version:1,id:conversationId,ownerId:previous.ownerId,title:'Neues Gespräch',draft:'',context:null,messages:[],activitySequence:0,updatedAt:new Date().toISOString()},...previous.conversations]}:previous);setNotice('Schreibe die erste Nachricht für ein neues Gespräch.');}}
    onSelect={conversationId=>{setSelected(conversationId);mutate(w=>w.store.touch(conversationId,new Date().toISOString()));}}
    onDelete={conversationId=>{Alert.alert('Gespräch löschen?','Der lokale Verlauf und Entwurf werden gelöscht. Bereits exportierte Sicherungen bleiben bestehen.',[
      {text:'Behalten',style:'cancel'},{text:'Löschen',style:'destructive',onPress:()=>{void controller.current?.cancel().catch(()=>{});mutate(w=>w.store.delete(conversationId));}},
    ]);}}
    onDraft={draft} onFeature={setFeature} onToggle={()=>setNotice(unavailable)}
    onSend={()=>{void (async()=>{try{await writes.current;if(unsavedDraft.current)throw new Error('Der aktuelle Entwurf ist noch nicht gespeichert. Bitte erneut bearbeiten und prüfen.');if(selected)await controller.current?.send(selected,feature);else setNotice('Bitte zuerst eine Frage eingeben.');}catch(error){if(alive.current)setNotice(error instanceof Error?error.message:unavailable);}})();}}
    onCancel={()=>{void controller.current?.cancel().catch(()=>setNotice('Anfrage unterbrochen. Unklare Kosten bleiben reserviert.'));}}
    onEvidence={(message,ids)=>{void onEvidence(message,ids).catch(()=>setNotice('Beleg ist historisch oder nicht mehr verfügbar. Öffne die aktuellen Flüge.'));}}/>;
}

import {AI_LIMITS,validateAiCapabilities,validateAiRequest,type AiRequest} from '../../../../packages/ai-contracts/src/index.ts';
import {object,text} from '../../../../packages/ai-contracts/src/shape.ts';
/** Transport factory only. Ordinary composition deliberately supplies no endpoint until live gates pass. */
export function createAiRelayClient(endpoint:string,fetcher:typeof fetch,timeoutMs=45000) {
  const url=new URL(endpoint);
  if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>45000)throw new Error('Invalid AI relay endpoint');
  const handles=new Map<string,{accountRef:string;capability:string}>();
  const key=(attempt:string,run:string)=>JSON.stringify([attempt,run]);
  async function post(action:string,accountRef:string,payload:unknown,signal?:AbortSignal) {
    const body=JSON.stringify({action,accountRef,payload});
    if(new TextEncoder().encode(body).length>AI_LIMITS.wireBytes||signal?.aborted)throw new Error('AI transport unavailable');
    const abort=new AbortController(),cancel=()=>abort.abort();signal?.addEventListener('abort',cancel,{once:true});
    const timer=setTimeout(cancel,timeoutMs);
    try {
      const response=await fetcher(url.href,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body,signal:abort.signal,redirect:'error',credentials:'omit',cache:'no-store'});
      if(!response.ok||response.redirected||response.url&&response.url!==url.href)throw new Error('AI transport unavailable');
      const json=await response.text();if(new TextEncoder().encode(json).length>AI_LIMITS.wireBytes)throw new Error('AI response too large');
      return JSON.parse(json) as unknown;
    }catch{throw new Error('AI-Dienst nicht erreichbar. Keine automatische Wiederholung; unklare Kosten bleiben reserviert.');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  return {
    async configuration(accountRef:string) {return validateAiCapabilities(await post('capabilities',accountRef,{clientVersion:1,toolVersion:1}));},
    async transmit(value:AiRequest,signal:AbortSignal) {
      const request=validateAiRequest(value),p=object(await post('round',request.accountRef,request,signal),['reply','continuation','runCapability']);
      if(p.runCapability!==null){if(handles.size>=50&&!handles.has(key(request.attemptId,request.runId)))throw new Error('AI handles exceed bound');handles.set(key(request.attemptId,request.runId),{accountRef:request.accountRef,capability:text(p.runCapability,2048)});}
      else handles.delete(key(request.attemptId,request.runId));
      return p;
    },
    async stop(attemptId:string,runId:string) {
      const selected=key(attemptId,runId),handle=handles.get(selected);if(!handle)return;
      try{await post('stop',handle.accountRef,{runCapability:handle.capability});}finally{handles.delete(selected);}
    },
    dispose(){handles.clear();},
  };
}

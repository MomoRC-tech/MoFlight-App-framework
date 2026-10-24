import {AI_LIMITS} from '../../../packages/ai-contracts/src/index.ts';
import {account,integer,object,text} from '../../../packages/ai-contracts/src/shape.ts';
import type {createRelayService} from './relay-service.ts';
export interface RelayHttpControls {
  operationalReady():boolean;
  /** Must enforce reviewed durable per-origin/account quotas. No permissive default.
   * Do not trust a caller-supplied forwarded IP without deployment proxy validation. */
  admit(request:Request,accountRef:string):Promise<boolean>;
}
/** Native JSON transport boundary; no CORS wildcard, operator route, logs or env/key loading. */
export function createAiHttpHandler(service:ReturnType<typeof createRelayService>,controls:RelayHttpControls) {
  const response=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return async(request:Request):Promise<Response>=>{
    if(!controls.operationalReady())return response(503,{error:'unavailable'});
    if(request.method!=='POST')return response(405,{error:'method'});
    if(request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()!=='application/json')return response(415,{error:'format'});
    const length=request.headers.get('content-length');if(length&&(!/^\d+$/.test(length)||Number(length)>AI_LIMITS.wireBytes))return response(413,{error:'size'});
    try {
      const reader=request.body?.getReader();if(!reader)return response(400,{error:'request'});
      const chunks:Uint8Array[]=[];let bytes=0;
      try{for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>AI_LIMITS.wireBytes){await reader.cancel();return response(413,{error:'size'});}chunks.push(next.value);}}
      finally{reader.releaseLock();}
      const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.length;}
      const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined)) as unknown;
      const p=object(raw,['action','accountRef','payload']),accountRef=account(p.accountRef);
      if(!await controls.admit(request,accountRef))return response(429,{error:'unavailable'});
      if(p.action==='capabilities') {
        const args=object(p.payload,['clientVersion','toolVersion']);
        return response(200,await service.capabilities(accountRef,integer(args.clientVersion,1,1),integer(args.toolVersion,1,1)));
      }
      if(p.action==='usage') {object(p.payload,[]);return response(200,await service.usage(accountRef));}
      if(p.action==='round') {
        if(!p.payload||typeof p.payload!=='object'||Object.getOwnPropertyDescriptor(p.payload,'accountRef')?.value!==accountRef)throw new Error('Foreign AI account');
        return response(200,await service.round(p.payload,request.signal));
      }
      if(p.action==='stop') {const args=object(p.payload,['runCapability']);await service.stop(accountRef,text(args.runCapability,AI_LIMITS.protocolChars));return response(200,{stopped:true});}
      if(p.action==='reconcile') {const args=object(p.payload,['runCapability']);return response(200,await service.reconcile(accountRef,text(args.runCapability,2048)));}
      return response(400,{error:'request'});
    }catch{return response(503,{error:'unavailable'});}
  };
}

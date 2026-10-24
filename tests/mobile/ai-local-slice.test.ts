import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ChatStore} from '../../apps/platform-lab/src/ai/chat-store.ts';
import {AiRunController} from '../../apps/platform-lab/src/ai/run-controller.ts';
import {readAiFlightSnapshot,assertAiFlightSnapshotCurrent,type AiFlightContextPorts} from '../../apps/platform-lab/src/ai/flight-context.ts';
import {AiFlightTools} from '../../apps/platform-lab/src/ai/flight-tools.ts';
import {createAiLedger} from '../../supabase/functions/ai-relay/ledger.ts';
import {createRelayService,type RelayModelResponse} from '../../supabase/functions/ai-relay/relay-service.ts';
import {createContinuityCodec} from '../../supabase/functions/ai-relay/continuity.ts';
import {validateAiPolicy,type AiToolResult} from '../../packages/ai-contracts/src/index.ts';
import {aiSourceContext,aiSourceIdentity,aiSourceFlight,AI_SOURCE_OWNER,AI_SOURCE_STORE} from './fixtures/ai-source.ts';
import {nodeDriver} from './sqlite-driver.ts';
test('local vertical slice reads actual parser/flight tools, seals three relay rounds, saves grounded answer and reopens offline without replay',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'moflight-ai-slice-')),path=join(directory,'chat.sqlite'),at='2026-10-24T12:00:00.000Z';
 let store=await ChatStore.open(await nodeDriver(path),AI_SOURCE_OWNER,async()=>{});let submitted=0,sequence=0;
 const admitted=new Set<number>(),intents:string[]=[];
 try {
  await store.rememberIdentity(aiSourceIdentity);await store.saveDraft('c1','Synthetic saved flights','How many known minutes?',null,at);
  const policy=validateAiPolicy({version:1,id:'p1',enabled:true,model:'openai/gpt-6-luna',reasoning:'max',zdrOnly:true,store:false,automaticRetries:0,routes:['azure'],features:['question'],tools:['aggregateFlights','queryFlights'],systemPrompt:'Synthetic fixture policy.',personalCapMicroEur:1000000,globalCapMicroEur:1000000,questionCapMicroEur:50000,reviewCapMicroEur:100000,inputTokens:32000,outputTokens:16384,questionTurns:6,reviewTurns:16,questionTools:12,reviewTools:48,rowsPerRead:200});
  const budget={period:'2026-10',timezone:'Europe/Berlin',capMicroEur:1000000,settledMicroEur:3,reservedMicroEur:0,unknownMicroEur:0,remainingMicroEur:999997};
  const ledger=createAiLedger({async rpc(name,args){let data:unknown=null;
    if(name.endsWith('snapshot'))data={policy,billingTag:'mf_'+'a'.repeat(43),epoch:3,enabled:true};
    if(name.endsWith('usage'))data=budget;
    if(name.endsWith('reserve')){const round=args.round_number as number;assert.ok(!admitted.has(round));admitted.add(round);intents.push(args.request_digest as string);data={disposition:'new',state:'intent',boundMicroEur:1000,policyId:'p1',period:'2026-10',priceId:'synthetic',policy};}
    if(name.endsWith('settle'))data={actualMicroEur:1,halted:false};if(name.endsWith('finish'))data=true;
    return {data,error:null};
  }});
  const flights=[aiSourceFlight('1','01.08.2026','1:00'),aiSourceFlight('2','02.08.2026','1:30')];
  const flightPorts:AiFlightContextPorts={currentOwner:async()=>AI_SOURCE_OWNER,flights:{open:async()=>({ownerId:AI_SOURCE_OWNER,storeId:AI_SOURCE_STORE,
    assertCurrent:async()=>{},pendingCommand:async()=>false,service:{readStored:async()=>({flights,snapshot:{version:1,ownerId:AI_SOURCE_OWNER,storeId:AI_SOURCE_STORE,generation:4,account:{provider:'vereinsflieger',accountRef:'10001'},coverage:[],savedRetrievals:[],pending:[],latestSavedResult:null,recovery:{readOnly:false,warning:null}}}),detail:async()=>{throw new Error('Not used');}},close:async()=>{}})}};
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  const filter={from:null,to:null,registrationAlias:null,crewAlias:null,crewSlot:null};let metrics:AiToolResult['metrics']=[];
  const service=createRelayService({ledger,codec:createContinuityCodec(key,()=>Date.parse(at)),now:()=>Date.parse(at),inputTokenUpperBound:async()=>100,
    verifiedCost:async responseId=>({responseId,receiptId:'usage-'+responseId,usdDecimal:'0.000001'}),
    submit:async body=>{
      const round=submitted++;assert.equal(admitted.size,submitted);assert.equal(body.store,false);
      const response:RelayModelResponse={id:'response'+round,status:'completed',output:[]};
      if(round===0)response.output=[{type:'reasoning',id:'rs1',encrypted_content:'synthetic-encrypted-reasoning',summary:[]},{type:'function_call',call_id:'aggregate1',name:'aggregateFlights',arguments:JSON.stringify({filter,measures:['count','knownMinutes']})}];
      else {
        const result=JSON.parse((body.input.at(-1) as {output:string}).output) as AiToolResult;
        if(round===1){metrics=result.metrics;assert.equal(metrics.find(m=>m.measure==='knownMinutes')?.value,150);response.output=[{type:'function_call',call_id:'query1',name:'queryFlights',arguments:JSON.stringify({filter,limit:20,pageToken:null})}];}
        else response.output=[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({status:'answer',answer:{text:'150 known saved minutes across two flights; saved coverage only.',evidenceIds:result.rows.map(r=>r.referenceId),actions:[{kind:'show-flights',referenceIds:result.rows.map(r=>r.referenceId)}],metrics}})}]}];
      }
      return response;
    }});
  const controller=new AiRunController({store,identity:async()=>aiSourceIdentity,configuration:account=>service.capabilities(account,1,1),enabled:()=>true,now:()=>at,token:()=>`id-${++sequence}`,changed:()=>{},transmit:(request,signal)=>service.round(request,signal),
    tools:async(identity,maximumCalls)=>{const snapshot=await readAiFlightSnapshot(flightPorts,identity,1),assertCurrent=()=>assertAiFlightSnapshotCurrent(flightPorts,identity,snapshot);
      const tools=new AiFlightTools(snapshot,{assertCurrent,token:()=>('t'+sequence++).padEnd(43,'a')},'2026-10-24',maximumCalls);
      return {context:snapshot.context,references:snapshot.projection!.references,metrics:tools.metrics,assertCurrent,execute:call=>tools.execute(call),dispose:()=>tools.dispose()};}});
  await controller.send('c1','question');assert.equal(submitted,3);assert.equal(new Set(intents).size,3);
  const message=(await store.archive()).conversations[0]!.messages[0]!;assert.equal(message.status,'complete');assert.equal(message.answer!.metrics.find(m=>m.measure==='knownMinutes')!.value,150);assert.equal(message.answer!.evidence.length,2);
  assert.equal(JSON.stringify(message).includes('synthetic-encrypted-reasoning'),false);assert.deepEqual(message.context,aiSourceContext);
  await store.close();store=await ChatStore.open(await nodeDriver(path),AI_SOURCE_OWNER,async()=>{});await store.recoverActive();
  assert.equal((await store.archive()).conversations[0]!.messages[0]!.answer!.text,message.answer!.text);assert.equal(submitted,3);
 }finally{await store.close();await rm(directory,{recursive:true,force:true});}
});

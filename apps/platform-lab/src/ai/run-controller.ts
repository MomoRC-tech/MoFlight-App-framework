import { AI_LIMITS, capabilitiesReplyPolicy, validateAiCapabilities, validateAiReply, validateAiRequest, validateAiToolResult,
  type AiBudget, type AiCapabilities, type AiContext, type AiEvidenceReference, type AiFeature, type AiRequest, type AiToolCall, type AiToolResult,
  type HistoricalProviderIdentity } from '../../../../packages/ai-contracts/src/index.ts';
import { id, object, text } from '../../../../packages/ai-contracts/src/shape.ts';
import type { ChatStore } from './chat-store.ts';
import type { ChatMessage } from './chat-model.ts';
export interface AiRunTools {
  context:AiContext; references:readonly AiEvidenceReference[]; metrics:Map<string,AiToolResult['metrics'][number]>;
  assertCurrent():Promise<void>; execute(call:AiToolCall):Promise<AiToolResult>; dispose():void;
}
export interface AiRoundEnvelope {reply:unknown; continuation:string|null; runCapability:string|null}
export interface AiRunPorts {
  store:Pick<ChatStore,'archive'|'appendMessage'|'updateMessage'>;
  identity():Promise<HistoricalProviderIdentity|null>;
  configuration(accountRef:string):Promise<unknown>;
  tools(identity:HistoricalProviderIdentity,maximumCalls:number):Promise<AiRunTools>;
  transmit(request:AiRequest,signal:AbortSignal):Promise<unknown>;
  /** Status/cancel must never submit inference; a transport failure keeps server holds. */
  stop?(attemptId:string,runId:string):Promise<void>;
  now():string; token():string; enabled():boolean;
  changed(budget?:AiBudget):void;
}
/** Phone-local explicit-send state machine. No retry/resume/reconnect worker or SDK. */
export class AiRunController {
  private active:{abort:AbortController;conversationId:string;message:ChatMessage;tools:AiRunTools|null;appending:Promise<void>|null}|null=null;
  constructor(private readonly ports:AiRunPorts) {}
  get busy(){return this.active!==null;}
  async cancel():Promise<void> {
    const run=this.active;if(!run)return;
    this.active=null;run.abort.abort();run.tools?.dispose();
    await run.appending;
    if(run.message?.context)await this.ports.store.updateMessage(run.conversationId,{...run.message,status:'cancelled'},this.ports.now());
    this.ports.changed();
    if(run.message?.attempt)void this.ports.stop?.(run.message.attempt.attemptId,run.message.attempt.runId).catch(()=>{/* Unknown holds remain. */});
  }
  async send(conversationId:string,feature:AiFeature):Promise<void> {
    if(this.active)throw new Error('Eine Anfrage läuft bereits.');
    if(!this.ports.enabled())throw new Error('AI ist nicht freigegeben. Dein Entwurf bleibt gespeichert.');
    const run={abort:new AbortController(),conversationId:id(conversationId),message:null as unknown as ChatMessage,tools:null as AiRunTools|null,appending:null as Promise<void>|null};
    this.active=run;
    let appended=false;
    const current=async()=>{if(this.active!==run||run.abort.signal.aborted||!this.ports.enabled())throw new Error('AI-Anfrage unterbrochen.');await run.tools?.assertCurrent();if(this.active!==run||run.abort.signal.aborted)throw new Error('AI-Anfrage unterbrochen.');};
    try {
      const archive=await this.ports.store.archive(),conversation=archive.conversations.find(c=>c.id===conversationId);
      if(!conversation?.draft.trim())throw new Error('Bitte zuerst eine Frage eingeben.');
      const identity=await this.ports.identity();await current();
      if(!identity||identity.localOwnerId!==archive.ownerId)throw new Error('Eine frühere erfolgreiche Vereinsflieger-Anmeldung fehlt. Dein Entwurf bleibt gespeichert.');
      const capabilities:AiCapabilities=validateAiCapabilities(await this.ports.configuration(identity.accountRef));await current();
      const policy=capabilitiesReplyPolicy(capabilities);
      if(!capabilities.enabled||!capabilities.features.includes(feature))throw new Error('Der AI-Dienst ist derzeit nicht verfügbar. Dein Entwurf bleibt gespeichert.');
      const maxTools=feature==='review'?policy.reviewTools:policy.questionTools,maxTurns=feature==='review'?policy.reviewTurns:policy.questionTurns;
      run.tools=await this.ports.tools(identity,maxTools);await current();
      const tools=run.tools;
      if(tools.context.localOwnerId!==identity.localOwnerId||tools.context.accountRef!==identity.accountRef)throw new Error('AI-Konto hat sich geändert.');
      run.message={id:id(this.ports.token()),input:conversation.draft,context:tools.context,status:'pending',answer:null,
        attempt:{attemptId:id(this.ports.token()),runId:id(this.ports.token()),policyId:policy.id,round:0},createdAt:this.ports.now()};
      run.appending=this.ports.store.appendMessage(conversationId,run.message,this.ports.now());await run.appending;appended=true;await current();
      const attempt=run.message.attempt!;
      const history=conversation.messages.filter(m=>m.status==='complete'&&m.answer&&m.context?.accountRef===identity.accountRef&&m.context.localOwnerId===identity.localOwnerId)
        .slice(-AI_LIMITS.historyExchanges).map(m=>({user:m.input,assistant:m.answer!.text}));
      let request:AiRequest=validateAiRequest({version:1,toolVersion:1,provider:identity.provider,accountRef:identity.accountRef,conversationId,
        messageId:run.message.id,attemptId:attempt.attemptId,runId:attempt.runId,feature,kind:'start',round:0,text:run.message.input,history});
      let toolCount=0;const seen=new Set<string>();
      const issued=new Set<string>();const evidence:AiEvidenceReference[]=[];
      for(let round=0;round<maxTurns;round++) {
        await current();
        run.message={...run.message,status:'running',attempt:{...attempt,round}};
        if(!await this.ports.store.updateMessage(conversationId,run.message,this.ports.now()))throw new Error('Gespräch wurde geändert oder gelöscht.');
        this.ports.changed();await current();
        const envelope=object(await this.ports.transmit(request,run.abort.signal),['reply','continuation','runCapability']);await current();
        const reply=validateAiReply(envelope.reply,{context:tools.context,policy,attemptId:attempt.attemptId,runId:attempt.runId,round,references:evidence,metrics:tools.metrics});
        this.ports.changed(reply.receipt.budget);
        if(reply.status==='needs-tools') {
          if(round+1>=maxTurns||toolCount+reply.tools.length>maxTools)throw new Error('AI-Anfrage hat ihre Grenze erreicht.');
          const continuation=text(envelope.continuation,AI_LIMITS.protocolChars),runCapability=text(envelope.runCapability,AI_LIMITS.protocolChars);
          const outputs=[];
          for(const call of reply.tools) {
            if(seen.has(call.id)||('limit' in call.arguments&&call.arguments.limit>policy.rowsPerRead))throw new Error('Ungültige oder wiederholte AI-Werkzeuganfrage.');
            seen.add(call.id);toolCount++;await current();
            const result=validateAiToolResult(await tools.execute(call));await current();
            if(result.callId!==call.id||result.name!==call.name)throw new Error('AI-Werkzeugantwort passt nicht.');
            for(const referenceId of [...result.rows,...result.sourceRows].map(r=>r.referenceId)) {
              const reference=tools.references.find(r=>r.id===referenceId);
              if(!reference)throw new Error('Unbekannter AI-Beleg.');
              if(!issued.has(reference.id)){issued.add(reference.id);evidence.push(reference);}
            }
            outputs.push({callId:call.id,payload:JSON.stringify(result)});
          }
          request=validateAiRequest({version:1,toolVersion:1,provider:identity.provider,accountRef:identity.accountRef,conversationId,
            messageId:run.message.id,attemptId:attempt.attemptId,runId:attempt.runId,feature,kind:'continue',round:round+1,policyId:policy.id,runCapability,continuation,outputs});
        } else {
          const hasAnswer='answer' in reply;
          run.message={...run.message,status:reply.status==='answer'?'complete':reply.status==='unavailable'?'failed':reply.status,
            answer:hasAnswer?{version:1,text:reply.answer.text,evidence:evidence.filter(r=>reply.answer.evidenceIds.includes(r.id)),actions:reply.answer.actions,metrics:reply.answer.metrics}:null};
          await current();if(!await this.ports.store.updateMessage(conversationId,run.message,this.ports.now()))throw new Error('Antwort konnte nicht gespeichert werden.');this.ports.changed();return;
        }
      }
    } catch(error) {
      if(appended&&this.active===run)try{await this.ports.store.updateMessage(conversationId,{...run.message,status:'interrupted'},this.ports.now());}catch{/* Owner/recovery gates preserve prior state. */}
      if(appended&&run.message.attempt)void this.ports.stop?.(run.message.attempt.attemptId,run.message.attempt.runId).catch(()=>{/* Unknown exposure remains held. */});
      throw error;
    } finally {
      run.tools?.dispose();
      if(this.active===run){this.active=null;this.ports.changed();}
    }
  }
}

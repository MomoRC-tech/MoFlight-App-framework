import {createBackendRpc,createOpenRouterReceiptLookup} from './backend-ports.ts';
import {createAiLedger} from './ledger.ts';
import {createContinuityCodec} from './continuity.ts';
import {createRelayService,type RelayServicePorts} from './relay-service.ts';
import {createSdkRoundSubmitter} from './sdk-adapter.ts';
import {createAiHttpHandler} from './http-handler.ts';
/** Deployment composition, invoked only after explicit service/input/funding review.
 * No module-level env/key loading or Deno.serve call; default readiness is closed. */
export function createConfiguredRelay(options:{backendUrl:string;serviceRoleKey:string;openRouterKey:string;continuityKey:CryptoKey;fetch:typeof fetch;
 operationalReady?:()=>boolean;inputTokenUpperBound:RelayServicePorts['inputTokenUpperBound']}) {
 if(typeof options.inputTokenUpperBound!=='function')throw new Error('Verified AI token bound unavailable');
 const ledger=createAiLedger(createBackendRpc(options.backendUrl,options.serviceRoleKey,options.fetch));
 const service=createRelayService({ledger,codec:createContinuityCodec(options.continuityKey,Date.now),now:Date.now,
  inputTokenUpperBound:options.inputTokenUpperBound,submit:createSdkRoundSubmitter({apiKey:options.openRouterKey,fetch:options.fetch}),
  verifiedCost:createOpenRouterReceiptLookup(options.openRouterKey,options.fetch)});
 return createAiHttpHandler(service,{operationalReady:options.operationalReady??(()=>false),admit:(_request,accountRef)=>ledger.admitRequest(accountRef)});
}

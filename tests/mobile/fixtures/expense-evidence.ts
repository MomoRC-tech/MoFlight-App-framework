import { canonical } from '../../../packages/flight-logbook/src/index.ts';
import { financialAt, financialHash, financialObservation, financialTarget } from './expense-capture.ts';
import type { FinancialEvidenceSnapshot } from '../../../apps/platform-lab/src/vereinsflieger/expense-evidence-store.ts';
export function evidenceBilled() {
  const value=financialObservation();value.source.lines.forEach(line=>{line.descriptionRaw='500000001 - Synthetic invoice - Fee';});return value;
}
export async function evidenceSnapshot(id='evidence-a'):Promise<FinancialEvidenceSnapshot> {
  const billed=evidenceBilled(),url='https://vereinsflieger.de/member/profile/printuserinvoice.php?uiid=99999';
  return {version:1,id,target:structuredClone(financialTarget),retrievedAt:financialAt,ownRecipientLabel:billed.ownRecipientLabel,
    contextBefore:structuredClone(financialTarget.scope.context),contextAfter:structuredClone(financialTarget.scope.context),
    selection:{source:'verified-own-flight-library',sourceFlightRefs:[billed.source.sourceFlightId]},
    sources:[{sourceFlightRef:billed.source.sourceFlightId,sourceHash:await financialHash(canonical(billed.source))}],unknown:[],
    summary:{evidenceRef:'summary-a',sourceUrl:'https://vereinsflieger.de/member/profile/userinvoice.php',rows:[{position:0,numberRaw:'500000001',recipientRaw:billed.ownRecipientLabel,url,dateRaw:'01.06.2026',amountRaw:'6,40'}],coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}},
    ledgers:[{evidenceRef:'ledger-a',observation:{version:1,...structuredClone(financialTarget),contextBefore:structuredClone(financialTarget.scope.context),contextAfter:structuredClone(financialTarget.scope.context),
      sourceAccount:{label:'Synthetic member',selector:'101'},ownNavigation:{label:'Synthetic member',url:'https://vereinsflieger.de/member/profile/account.php?caid=101'},pageAccountLabel:'Synthetic member',sourceUrl:'https://vereinsflieger.de/member/profile/account.php?caid=101',reportedRowCount:1,
      capture:{version:1,id:'capture-a',retrievedAt:financialAt,owner:financialTarget.scope.owner,connectionId:financialTarget.scope.connectionId,sourceIdentity:'provisional-observed-profile',category:'ledger',path:'/member/profile/account.php',
        columns:[{key:'date',label:'Datum',index:0},{key:'booking',label:'BuchungsNr.',index:1},{key:'invoice',label:'Abrechnung',index:2},{key:'information',label:'Informationen',index:3},{key:'value',label:'Wert (EUR)',index:4},{key:'balance',label:'Saldo (EUR)',index:5}],
        rows:[{position:0,values:['01.06.2026','booking-1','500000001','Synthetic fee','-6,40','0,00']}],filters:['Jahr 2026'],empty:false,coverage:{kind:'visible-page',truncated:false,pagination:'unverified'}}},invoiceLinks:[{rowPosition:0,url}]}]};
}

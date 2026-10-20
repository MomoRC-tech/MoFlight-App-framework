import { adaptHistoryFacts } from '../../apps/platform-lab/src/vereinsflieger/history-facts.ts';
import type { RealFlightDetail, RealFlightListItem } from '../../apps/platform-lab/src/vereinsflieger/real-flight-library.ts';
import type { OwnFlightStoredSnapshot } from '../../apps/platform-lab/src/vereinsflieger/real-flight-service.ts';
import type { OwnFlightReadPorts, OwnFlightReadSession } from '../../apps/platform-lab/src/mobile/own-flight-reader.ts';
import { captureFixture } from './capture-review-fixture.ts';
export function ownFlightFixture() {
  const capture = captureFixture(3);
  capture.rows[1]!.values[0] = '01.01.2025'; capture.rows[2]!.values[0] = 'invalid';
  capture.rows[2]!.values[1] = ''; capture.rows[2]!.values[4] = ''; capture.rows[2]!.values[9] = '';
  const flights: RealFlightListItem[] = capture.rows.map((row,i) => ({
    flightId:`flight-${i}`, bindingId:'binding', accountRef:'101', sourceFlightRef:row.sourceFlightId!, firstCaptureId:capture.captureId,
    factsRevision:1, facts:adaptHistoryFacts({ownerId:'synthetic-owner',scopeId:'synthetic-binding'},capture,i),unassigned:true,
  }));
  const snapshot: OwnFlightStoredSnapshot = {version:1,ownerId:'owner',storeId:'store',generation:2,account:{provider:'vereinsflieger',accountRef:'101'},
    coverage:[],savedRetrievals:[],pending:[],latestSavedResult:null,recovery:{readOnly:false,warning:null}};
  const detail: RealFlightDetail = {...flights[0]!,factHistory:[],captures:[],pending:[]};
  let assertions=0,closes=0;
  const session: OwnFlightReadSession = {ownerId:'owner',storeId:'store',service:{readStored:async()=>({snapshot,flights}),detail:async()=>detail},
    assertCurrent:async()=>{assertions++;},pendingCommand:async()=>false,close:async()=>{closes++;}};
  const ports: OwnFlightReadPorts = {open:async()=>session};
  return {flights,snapshot,detail,session,ports,assertions:()=>assertions,closes:()=>closes};
}

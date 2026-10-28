import { ownFlightFixture } from './own-flight-fixture';
import { makeStartPreview } from '../../apps/platform-lab/src/mobile/start-preview';
import type { ProviderScope } from '../../apps/platform-lab/src/vereinsflieger/scope-store';
export function startPreviewFixture(now=new Date(2026,9,28,12).getTime()) {
  const f=ownFlightFixture();
  f.flights[0]!.facts.assessment.date={...f.flights[0]!.facts.assessment.date,state:'parsed',value:'2026-10-01'};
  f.flights[0]!.facts.assessment.durations.flight={state:'known',minutes:120,evidence:[]};
  const scope:ProviderScope={version:1,owner:'owner',connectionId:'connection',context:{accountNumber:'101',clubLabel:'Synthetic Club',clubIdentity:'display-label-only',verification:'observed-profile-number'}};
  const view={snapshot:f.snapshot,flights:f.flights,pendingCommand:false,detailContext:{ownerSelectionSeq:1,selectionIdentity:'verified-activation-chain'},medical:null,duties:null};
  const preview=makeStartPreview(view,scope,now,'a'.repeat(64))!;
  return {...f,view,scope,preview,now,expected:{ownerId:'owner',storeId:'store',scope,selectionSeq:1}};
}

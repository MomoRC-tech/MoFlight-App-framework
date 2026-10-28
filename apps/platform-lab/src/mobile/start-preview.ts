import type { OwnFlightView, OwnFlightDetailContext } from './own-flight-reader';
import { summarizeRealFlights, formatReportedMinutes } from './real-flight-statistics';
import { cockpitRoleMetrics, cockpitSeasonValues } from './cockpit-season';
import { latestSavedFlights, latestFlightOrderUnknown, abbreviatedCrew } from './season-dashboard-model';
import { seasonWorkHours } from './season-work-hours';
import { planFlightRetrieval } from '../vereinsflieger/retrieval-policy';
import { validateInformationCapture } from '../vereinsflieger/information';
import { validateDutyRosterSnapshot } from '../vereinsflieger/duties';
import { validateScope, type ProviderScope } from '../vereinsflieger/scope-store';
import { canonical } from '@moflight/flight-logbook';

export function startDay(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

/** Display values only: never a flight list, detail source or authorization. */
export function startFlightDashboard(flights: OwnFlightView['flights'], year: number, today: string) {
  const latest = latestSavedFlights(flights)[0], a = latest?.facts.assessment;
  const raw = (key: 'model' | 'registration') => a?.fields[key].state === 'value' ? a.fields[key].raw : '—';
  return { current: summarizeRealFlights(flights,year), prior: summarizeRealFlights(flights,year-1),
    roles: cockpitRoleMetrics(flights,year,today).map(({key,count,knownMinutes,knownDurationCount,unknownDurationCount}) =>
      ({key,count,knownMinutes,knownDurationCount,unknownDurationCount})),
    latest: latest && a ? { flightId:latest.flightId,date:a.date.value!.split('-').reverse().join('.'),
      duration:a.durations.flight.state==='known'?`${formatReportedMinutes(a.durations.flight.minutes)} h`:'— h',
      model:raw('model'),registration:raw('registration'),pic:abbreviatedCrew(a.fields.pic),
      orderUnknown:latestFlightOrderUnknown(flights,latest) } : null,
  };
}
export function startDashboardValues(processed: ReturnType<typeof startFlightDashboard>, saved: OwnFlightView['snapshot']['savedRetrievals'], year: number, today: string, workSummary?: NonNullable<OwnFlightView['featureInformation']>['workSummary']) {
  const season=(summary:typeof processed.current,value:number)=>{
    const facts=cockpitSeasonValues(summary,saved,value,today);
    return {time:facts.time,starts:facts.starts,unknownDurationCount:facts.season.unknownDurationCount,unknownDateCount:facts.unknownDateCount};
  };
  return {current:season(processed.current,year),prior:season(processed.prior,year-1),roles:processed.roles,latest:processed.latest,
    workHours:seasonWorkHours(workSummary,year)};
}
export function startDashboard(view:OwnFlightView,year:number,today:string) {
  return startDashboardValues(startFlightDashboard(view.flights,year,today),view.snapshot.savedRetrievals,year,today,view.featureInformation?.workSummary);
}
export type StartDashboard = ReturnType<typeof startDashboard>;
export interface StartPreview {
  version: 1;
  ownerId: string; storeId: string; accountRef: string;
  providerScope: ProviderScope;
  context: OwnFlightDetailContext;
  revision: string; day: string; savedAt: string; retrievedAt: string | null;
  dashboard: StartDashboard;
  medical: OwnFlightView['medical'];
  duties: OwnFlightView['duties'];
}
export const START_PREVIEW_LIMIT = 256_000;
export function canCacheStartView(view: OwnFlightView): boolean {
  return !!view.snapshot.account && !!view.detailContext && !view.pendingCommand && !view.snapshot.recovery.readOnly &&
    !view.medicalReadFailed && !view.dutiesReadFailed && !view.featureInformationReadFailed;
}
export function makeStartPreview(view: OwnFlightView, scope: ProviderScope, now: number, revision: string): StartPreview | null {
  if (!canCacheStartView(view) || !view.snapshot.account || !view.detailContext) return null;
  const day=startDay(now);
  return {version:1,ownerId:view.snapshot.ownerId,storeId:view.snapshot.storeId,accountRef:view.snapshot.account.accountRef,
    providerScope:scope,context:view.detailContext,revision,day,savedAt:new Date(now).toISOString(),
    retrievedAt:planFlightRetrieval(view.snapshot.savedRetrievals).lastSuccessfulRetrievalAt,
    dashboard:startDashboard(view,Number(day.slice(0,4)),day),medical:view.medical??null,duties:view.duties??null};
}

/** Corrupt/old/foreign cache is a miss. Small bounded JSON never enters domain state. */
export function readStartPreview(text: string, expected: {ownerId:string;storeId:string;scope:ProviderScope;selectionSeq:number}, now: number): StartPreview | null {
  try {
    if (encodeURIComponent(text).replace(/%[A-F\d]{2}|./g,'x').length>START_PREVIEW_LIMIT) return null;
    const value=JSON.parse(text) as StartPreview;
    const string=(v:unknown):v is string=>typeof v==='string'&&v.length<=2000;
    const count=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
    if (!value || value.version!==1 || value.ownerId!==expected.ownerId || value.storeId!==expected.storeId ||
        value.accountRef!==expected.scope.context.accountNumber || canonical(validateScope(value.providerScope))!==canonical(expected.scope) ||
        value.context?.ownerSelectionSeq!==expected.selectionSeq || !(typeof value.context.selectionIdentity==='string'&&value.context.selectionIdentity.length<=64000) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value.day)||value.day.slice(0,4)!==startDay(now).slice(0,4)||value.day>startDay(now)||!/^([0-9a-f]{64})$/.test(value.revision) || !string(value.savedAt) || !Number.isFinite(Date.parse(value.savedAt)) || Date.parse(value.savedAt)>now ||
        (value.retrievedAt!==null&&(!string(value.retrievedAt)||!Number.isFinite(Date.parse(value.retrievedAt))))) return null;
    if(startDay(Date.parse(value.savedAt))!==value.day||!('medical' in value)||!('duties' in value))return null;
    const d=value.dashboard;
    if (!d || ![d.current,d.prior].every(s=>s&&string(s.time)&&string(s.starts)&&count(s.unknownDurationCount)&&count(s.unknownDateCount)) ||
        !Array.isArray(d.roles) || d.roles.length!==3 || new Set(d.roles.map(r=>r.key)).size!==3 ||
        !d.roles.every(r=>['solo','dualInstruction','picWithCompanion'].includes(r.key)&&[r.count,r.knownMinutes,r.knownDurationCount,r.unknownDurationCount].every(count)) ||
        (d.workHours!==null&&!string(d.workHours))) return null;
    if (d.latest!==null && (!d.latest || !['flightId','date','duration','model','registration','pic'].every(k=>string(d.latest![k as keyof typeof d.latest])) || typeof d.latest.orderUnknown!=='boolean')) return null;
    if(value.medical){
      value.medical=validateInformationCapture(value.medical);
      if(value.medical.category!=='medical'||value.medical.owner!==value.ownerId||value.medical.connectionId!==expected.scope.connectionId) return null;
    }
    if(value.duties){
      if(canonical(validateScope(value.duties.scope))!==canonical(expected.scope))return null;
      if(value.duties.snapshot){
        value.duties.snapshot=validateDutyRosterSnapshot(value.duties.snapshot);
        if(canonical(value.duties.snapshot.scope)!==canonical(expected.scope))return null;
      }
    }
    if(value.day!==startDay(now)&&value.dashboard.current.starts==='0'){
      value.dashboard.current={...value.dashboard.current,starts:'—',time:'—'};
    }
    return value;
  } catch { return null; }
}

import { decodeActivityProbe, type ActivityProbeSource } from './activity-probe';
import { useEffect, useRef, useState } from 'react';
import type { WebViewMessageEvent } from 'react-native-webview';
import { canonical } from '@moflight/flight-logbook';
import { PROFILE_URL, contextScript } from './context';
import type { ProviderScope } from './scope-store';
import { INFORMATION_TYPES, retrievableInformationCategories, informationRouteShape, informationScript,
  informationSelectionScript, taskSelectionScript, OWN_OPEN_TASKS_URL, type InformationCategory, type InformationCapture, type InformationHistory } from './information';
import { InformationRun } from './information-run';
import { recordProviderEvent } from './provider-diagnostics';
import { loadInformation, readInformationCapture, readInformationHistory, saveInformation } from './information-native';

export type FeatureInformationCategory = 'events' | 'document-notices' | 'work-summary' | 'work-hours' | 'tasks';
const featureSources: Record<FeatureInformationCategory, string> = {
  events: 'https://vereinsflieger.de/member/community/appointment/',
  'document-notices': 'https://vereinsflieger.de/member/overview/overview',
  'work-summary': PROFILE_URL,
  'work-hours': 'https://vereinsflieger.de/member/profile/workhours/list',
  // The own/open link is allowlisted; InformationRun first probes the current
  // selector on the query-free page so it can restore the member's preference.
  tasks: OWN_OPEN_TASKS_URL,
};

type InformationRetryTarget = { category: InformationCategory; sourceUrl: string; scopeKey: string };
export interface InformationControllerPorts {
  product: boolean;
  mounted(): boolean;
  foreground(): boolean;
  ownerCurrent(): boolean;
  scope(): ProviderScope;
  canStart(retry: boolean): boolean;
  canStartMedical(): boolean;
  canReload(): boolean;
  currentUrl(): string;
  epoch(): number;
  uuid(): string;
  setBusy(busy: boolean): void;
  setVisible(visible: boolean): void;
  navigate(url: string): void;
  loadPage(url: string): Promise<void>;
  inject(script: string): void;
  requestNativeReload(url: string): void;
}

/** Owns information requests and results; browser/account admission stays with the parent. */
export function useInformationController(ports: InformationControllerPorts) {
  const informationRun = useRef<InformationRun | null>(null);
  const dutyActivityByRun = useRef(new WeakMap<InformationRun, ActivityProbeSource>());
  const savedDutyActivity = useRef(new Map<string, ActivityProbeSource>());
  function takeDutyActivity(id:string): ActivityProbeSource | null {
    const value = ports.ownerCurrent() ? savedDutyActivity.current.get(id) ?? null : null;
    savedDutyActivity.current.delete(id); return value;
  }
  const medicalRequest=useRef<{run:InformationRun;resolve:(capture:InformationCapture)=>void;reject:(error:Error)=>void}|null>(null);
  const featureRequest=useRef<{run:InformationRun;resolve:(capture:InformationCapture)=>void;reject:(error:Error)=>void}|null>(null);
  function finishFeature(error?:Error,capture?:InformationCapture) {
    const pending=featureRequest.current;featureRequest.current=null;
    if(error)pending?.reject(error);else if(capture)pending?.resolve(capture);
  }
  const dutyRequest=useRef<{run:InformationRun;resolve:(capture:InformationCapture)=>void;reject:(error:Error)=>void}|null>(null);
  function finishDuty(error?:Error,capture?:InformationCapture) {
    const pending=dutyRequest.current;dutyRequest.current=null;
    if(error)pending?.reject(error);else if(capture)pending?.resolve(capture);
  }
  function finishMedical(error?:Error,capture?:InformationCapture) {
    const pending=medicalRequest.current;medicalRequest.current=null;
    if(error)pending?.reject(error);else if(capture)pending?.resolve(capture);
  }
  const informationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [informationCategory, setInformationCategory] = useState<InformationCategory>('work-hours');
  const [informationCaptures, setInformationCaptures] = useState<InformationCapture[]>([]);
  const [informationNotice, setInformationNotice] = useState('');
  const [informationBusy, setInformationBusy] = useState(false);
  const [informationSaving, setInformationSaving] = useState(false);
  const informationRetry = useRef<InformationRetryTarget | null>(null);
  const informationFailedProfile = useRef<{ target: InformationRetryTarget; epoch: number } | null>(null);
  const informationNavigation = useRef<{ run: InformationRun; nonce: string } | null>(null);
  function clearInformationNavigation(run?: InformationRun | null) {
    if (!run || informationNavigation.current?.run === run) informationNavigation.current = null;
  }
  const [informationRetryReady, setInformationRetryReady] = useState(false);
  const informationUncertain = useRef<string | null>(null);
  const [informationNeedsReload, setInformationNeedsReload] = useState(false);
  const informationLoadRequest = useRef(0);
  const [informationLoading, setInformationLoading] = useState(false);
  const historyRequest = useRef(0);
  const [informationHistory, setInformationHistory] = useState<InformationHistory | null>(null);
  const [informationHistoryBusy, setInformationHistoryBusy] = useState(false);
  const [informationHistoryNotice, setInformationHistoryNotice] = useState('');

  async function reloadInformation() {
    if (!ports.canReload() || informationRun.current) return;
    const request = ++informationLoadRequest.current;
    try {
      const selectedScope = ports.scope(), selectedKey = canonical(selectedScope), selectedHistoryRequest = historyRequest.current;
      const gate = () => {
        if (!ports.mounted() || !ports.foreground() || request !== informationLoadRequest.current || canonical(ports.scope()) !== selectedKey) throw new Error('Expired information reload');
      };
      gate(); setInformationLoading(true);
      const records = await loadInformation(selectedScope, gate);
      gate();
      if (informationUncertain.current) {
        const saved = await readInformationCapture(selectedScope, informationUncertain.current, gate); gate();
        if (saved && (saved.id !== informationUncertain.current || saved.owner !== selectedScope.owner || saved.connectionId !== selectedScope.connectionId || !records.some(record => record.category === saved.category))) throw new Error('Uncertain capture recovery incomplete');
      }
      if ((!records.length && informationCaptures.length) || records.some(record => record.owner !== selectedScope.owner || record.connectionId !== selectedScope.connectionId)) throw new Error('Saved information scope or completeness changed');
      setInformationCaptures(records);
      informationUncertain.current = null; setInformationNeedsReload(false);
      if (historyRequest.current === selectedHistoryRequest) { historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice(''); }
      setInformationNotice('Gespeicherte Informationen lokal neu geladen.');
    } catch {
      if (ports.mounted() && ports.foreground() && request === informationLoadRequest.current && ports.ownerCurrent()) setInformationNotice('Gespeicherte Informationen konnten nicht neu geladen werden. Vorhandene Belege bleiben erhalten.');
    } finally {
      if (ports.mounted() && request === informationLoadRequest.current) setInformationLoading(false);
    }
  }
  async function loadInformationHistory(category: InformationCategory, index: number) {
    const request = ++historyRequest.current;
    try {
      const selectedScope = ports.scope();
      const selectedScopeKey = canonical(selectedScope);
      const gate = () => {
        if (!ports.mounted() || !ports.foreground() || request !== historyRequest.current || canonical(ports.scope()) !== selectedScopeKey) throw new Error('Expired information history request');
      };
      gate(); setInformationHistoryBusy(true); setInformationHistoryNotice('');
      const result = await readInformationHistory(selectedScope, category, index, gate);
      if (result.category !== category || result.index !== index || !result.capture && informationCaptures.some(c => c.category === category)) throw new Error('Saved information history unavailable');
      gate(); setInformationHistory(result);
    } catch {
      if (ports.mounted() && ports.foreground() && request === historyRequest.current && ports.ownerCurrent()) setInformationHistoryNotice('Dieser gespeicherte Quellenbeleg konnte nicht geöffnet werden. Vorhandene Belege bleiben erhalten.');
    } finally {
      if (ports.mounted() && request === historyRequest.current) setInformationHistoryBusy(false);
    }
  }
  function stopInformation(message = 'Informationsabruf abgebrochen. Gespeicherte Belege bleiben erhalten.', retryable = false) {
    const run = informationRun.current;
    if (run?.stage === 'saving') return;
    const restoreTaskUrl = run?.stage !== 'restore' && run?.taskRestoreAuthorized ? run.taskRestoreUrl : null;
    run?.cancel(); informationRun.current = null;
    clearInformationNavigation(run);
    finishMedical(new Error('Medical capture did not complete.'));
    finishFeature(new Error('Feature capture did not complete.'));
    finishDuty(new Error('Duty capture did not complete.'));
    if (!retryable) informationRetry.current = null;
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null;
    if (ports.mounted()) { setInformationRetryReady(retryable && !!informationRetry.current); setInformationBusy(false); setInformationSaving(false); ports.setBusy(false); setInformationNotice(message); }
    if (restoreTaskUrl && ports.mounted() && ports.ownerCurrent()) ports.navigate(restoreTaskUrl);
  }
  function beginInformation(retry = false, medical = false, dutyUrl?:string, feature?:FeatureInformationCategory): InformationRun | null {
    if (!(medical||dutyUrl||feature?ports.canStartMedical():ports.canStart(retry)) || informationRun.current || informationHistoryBusy || informationUncertain.current) {recordProviderEvent('provider-information-admission-blocked');return null;}
    try {
      const selectedScope = ports.scope(), target = retry ? informationRetry.current : null;
      if (retry && (!informationRetryReady || !target || target.category !== informationCategory || target.scopeKey !== canonical(selectedScope))) return null;
      const reloadFailedProfile = !!(retry && target && informationFailedProfile.current?.target === target && informationFailedProfile.current.epoch === ports.epoch() && ports.currentUrl() === PROFILE_URL);
      const run = new InformationRun(selectedScope, medical?'medical':dutyUrl?'duties':feature??informationCategory, medical?PROFILE_URL:dutyUrl??(feature?featureSources[feature]:target?.sourceUrl ?? ports.currentUrl()), ports.uuid());
      informationRetry.current = { category: run.category, sourceUrl: run.sourceUrl, scopeKey: canonical(run.scope) }; setInformationRetryReady(false);
      informationLoadRequest.current++; setInformationLoading(false);
      clearInformationNavigation();
      informationRun.current = run; setInformationBusy(true); ports.setBusy(true); setInformationNotice('Konto wird vor und nach der Erfassung geprüft…');
      informationTimer.current = setTimeout(() => {recordProviderEvent('provider-information-timeout');stopInformation('Informationsabruf hat das Zeitlimit erreicht. Gespeicherte Belege bleiben erhalten. Quelle und Anmeldung prüfen und erneut versuchen.', true);}, 90_000);
      if (run.stage === 'selection' && ports.currentUrl() === run.url) void ports.loadPage(run.url);
      else if (run.stage === 'selection') ports.navigate(run.url);
      else {
        ports.navigate(run.url);
        if (reloadFailedProfile) ports.requestNativeReload(PROFILE_URL);
      }
      return run;
    } catch {
      recordProviderEvent('provider-information-route-rejected');
      console.info('MoFlight information route shape', JSON.stringify(informationRouteShape(ports.currentUrl())));
      setInformationNotice('Diese Quellseite kann nicht erfasst werden. Erst auf der Originalseite zum ausgewählten Bereich wechseln.');
      return null;
    }
  }
  function startInformation(retry=false) { beginInformation(retry); }
  function retrieveMedical():Promise<InformationCapture> {
    return new Promise((resolve,reject)=>{
      const run=beginInformation(false,true);
      if(!run){reject(new Error('Medical capture is unavailable.'));return;}
      medicalRequest.current={run,resolve,reject};
    });
  }
  /** Explicit combined update only. No filters, forms, pagination or provider writes. */
  function retrieveDutyPage(source:'own'|'club'):Promise<InformationCapture> {
    return new Promise((resolve,reject)=>{
      const url='https://vereinsflieger.de'+(source==='own'?'/member/profile/myservices.php':'/member/community/serviceshedulelist.php');
      const run=beginInformation(false,false,url);
      if(!run){reject(new Error('Duty capture is unavailable.'));return;}
      dutyRequest.current={run,resolve,reject};
    });
  }
  /** Bounded existing readers only; original selection and fresh account checks remain mandatory. */
  function retrieveFeatureInformation(category:FeatureInformationCategory):Promise<InformationCapture> {
    return new Promise((resolve,reject)=>{
      if (!Object.hasOwn(featureSources,category)) { reject(new Error('Unsupported feature source.')); return; }
      const run=beginInformation(false,false,undefined,category);
      if(!run){reject(new Error('Feature capture is unavailable.'));return;}
      featureRequest.current={run,resolve,reject};
    });
  }
  function retryInformation() { startInformation(true); }
  async function receiveInformation(event: WebViewMessageEvent) {
    const run = informationRun.current;
    if (!run || event.nativeEvent.data.length > 1_000_000) return;
    const gate = () => {
      if (!ports.mounted() || !ports.foreground() || informationRun.current !== run) throw new Error('Expired information request');
      run.assertScope(ports.scope());
    };
    try {
      gate(); const message = JSON.parse(event.nativeEvent.data), wasRead = run.stage === 'read';
      const action = run.accept(event.nativeEvent.url, ports.currentUrl(), message);
      if (wasRead && action === 'navigate' && dutyRequest.current?.run === run && message.activity) {
        try {
          const metadata = decodeActivityProbe({kind:'vf-activity-v1',nonce:'duty-metadata',sources:[message.activity]}).sources[0];
          if (metadata && metadata.source === 'own-duties' && run.sourceUrl === 'https://vereinsflieger.de/member/profile/myservices.php')
            dutyActivityByRun.current.set(run,metadata);
        } catch { /* Optional metadata never changes the canonical capture outcome. */ }
      }
      if (action === 'navigate') { ports.navigate(run.url); return; }
      if (action !== 'save') return;
      if (informationTimer.current) clearTimeout(informationTimer.current);
      informationTimer.current = null; setInformationSaving(true);
      if(dutyRequest.current?.run===run){
        // The expiring duty cache is deliberately separate from immutable
        // information history, which cannot honour the selected 30-day policy.
        const capture=run.capture(new Date().toISOString());gate();
        const activity = dutyActivityByRun.current.get(run);
        if (activity) { savedDutyActivity.current.clear(); savedDutyActivity.current.set(capture.id,activity); }
        run.stage='done';informationRun.current=null;informationRetry.current=null;setInformationRetryReady(false);
        clearInformationNavigation(run);
        setInformationBusy(false);setInformationSaving(false);ports.setBusy(false);ports.setVisible(false);
        // Combined jobs already finished on a freshly proven profile. A return
        // navigation after resolving can arrive during the next source job.
        recordProviderEvent('provider-information-complete');finishDuty(undefined,capture);return;
      }
      informationUncertain.current = run.nonce;
      await saveInformation(run.scope, run.capture(new Date().toISOString()), gate);
      const records = await loadInformation(run.scope, gate); gate();
      if (!records.some(record => record.id === run.nonce && record.owner === run.scope.owner && record.connectionId === run.scope.connectionId)) throw new Error('Saved capture readback missing');
      informationUncertain.current = null; setInformationNeedsReload(false); informationRetry.current = null; setInformationRetryReady(false);
      informationLoadRequest.current++; setInformationLoading(false);
      setInformationCaptures(records); historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice(''); run.stage = 'done'; informationRun.current = null;
      clearInformationNavigation(run);
      setInformationBusy(false); setInformationSaving(false); ports.setBusy(false); ports.setVisible(false);
      setInformationNotice(`${INFORMATION_TYPES[run.category].title}: lokal gespeichert. Nur die sichtbare Quellseite, keine vollständige Historie.`);
      const combined=medicalRequest.current?.run===run||featureRequest.current?.run===run;
      recordProviderEvent('provider-information-complete');
      if(medicalRequest.current?.run===run)finishMedical(undefined,records.find(record=>record.id===run.nonce)!);
      if(featureRequest.current?.run===run)finishFeature(undefined,records.find(record=>record.id===run.nonce)!);
      // Keep manual source browsing; hidden combined requests need no extra
      // result navigation. Task preference restoration was verified before save.
      if(!combined)ports.navigate(run.resultUrl);
    } catch {
      // A commit may precede readback/lease failure. Do not claim rollback or publish old-owner rows.
      if (informationRun.current === run) {
        const uncertain = !!informationUncertain.current;
        recordProviderEvent(uncertain?'provider-information-save-unconfirmed':'provider-information-validation-failed');
        const restoreTaskUrl = run.stage !== 'restore' && run.taskRestoreAuthorized ? run.taskRestoreUrl : null;
        const taskRestoreFailed = run.category === 'tasks' && run.stage === 'restore';
        run.stage = 'cancelled'; informationRun.current = null;
        clearInformationNavigation(run);
        if (informationTimer.current) clearTimeout(informationTimer.current);
        informationTimer.current = null; setInformationBusy(false); setInformationSaving(false); ports.setBusy(false);
        setInformationNeedsReload(uncertain); setInformationRetryReady(!uncertain);
        setInformationNotice(taskRestoreFailed
          ? 'Erfassung nicht bestätigt. Der vorherige Aufgabenfilter konnte nicht bestätigt werden. Aufgabenfilter auf der Vereinsflieger-Seite prüfen. Gespeicherte Belege bleiben erhalten.'
          : 'Erfassung nicht bestätigt. ' + (uncertain ? 'Zuerst gespeicherte Informationen lokal neu laden, bevor erneut erfasst wird. Eine eventuell bereits gespeicherte Erfassung bleibt erhalten.' : (run.failureMessage ?? 'Quelle, Spalten oder Konto nicht unterstützt.') + ' Quelle und Anmeldung prüfen, dann ausdrücklich erneut versuchen. Gespeicherte Belege bleiben erhalten.'));
        if (restoreTaskUrl && ports.mounted() && ports.ownerCurrent()) ports.navigate(restoreTaskUrl);
        if(medicalRequest.current?.run===run)finishMedical(new Error('Medical capture was not verified.'));
        if(dutyRequest.current?.run===run)finishDuty(new Error('Duty capture was not verified.'));
        if(featureRequest.current?.run===run)finishFeature(new Error('Feature capture was not verified.'));
      }
    }
  }
  function nextInformationCategory() { if (!informationRun.current) { informationRetry.current = null; setInformationRetryReady(false); setInformationCategory(old => retrievableInformationCategories[(retrievableInformationCategories.indexOf(old) + 1) % retrievableInformationCategories.length]!); } }
  useEffect(() => () => { informationLoadRequest.current++; informationRun.current?.cancel(); informationRun.current = null; clearInformationNavigation(); finishMedical(new Error('Medical reader closed.')); finishFeature(new Error('Feature reader closed.')); finishDuty(new Error('Duty reader closed.')); if (informationTimer.current) clearTimeout(informationTimer.current); }, []);
  function beginInitialLoad() {
    const request = ++informationLoadRequest.current; setInformationLoading(ports.product); return request;
  }
  async function loadInitial(saved: ProviderScope | null, request: number, active: () => boolean) {
    try {
      const gate = () => {
        if (!active() || !ports.foreground() || request !== informationLoadRequest.current || !ports.ownerCurrent() ||
            saved && canonical(ports.scope()) !== canonical(saved)) throw new Error('Expired initial information read');
      };
      const records = saved ? await loadInformation(saved, gate) : [];
      gate(); setInformationCaptures(records);
    } catch {
      if (active() && ports.foreground() && request === informationLoadRequest.current && ports.ownerCurrent())
        setInformationNotice('Gespeicherte Informationen konnten nicht geöffnet werden. Vorhandene Daten bleiben erhalten.');
    } finally { if (active() && request === informationLoadRequest.current) setInformationLoading(false); }
  }
  function initialLoadFailed(request: number) {
    if (request === informationLoadRequest.current) setInformationLoading(false);
  }
  function ownerChanged() {
    finishMedical(new Error('Medical owner changed.'));
    finishFeature(new Error('Feature owner changed.'));
    finishDuty(new Error('Duty owner changed.'));
    informationRun.current?.cancel(); informationRun.current = null;
    clearInformationNavigation();
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null; setInformationBusy(false); setInformationSaving(false);
    informationRetry.current = null; setInformationRetryReady(false); informationUncertain.current = null; setInformationNeedsReload(false);
    informationLoadRequest.current++; setInformationLoading(false);
    historyRequest.current++; setInformationHistory(null); setInformationHistoryBusy(false); setInformationHistoryNotice('');
  }
  function backgrounded() {
    informationLoadRequest.current++; setInformationLoading(false);
    informationRetry.current = null; setInformationRetryReady(false);
    historyRequest.current++; setInformationHistoryBusy(false); setInformationHistoryNotice('');
    if (informationRun.current) stopInformation('App im Hintergrund. Informationsabruf beendet; gespeicherte Belege bleiben erhalten.');
  }
  function active() {
    return !!informationRun.current || !!informationTimer.current || !!informationNavigation.current ||
      informationBusy || informationSaving || informationLoading || informationHistoryBusy || !!informationUncertain.current;
  }
  function pageLoaded(page: string): boolean {
    const run = informationRun.current;
    if (!run) return false;
    if (page !== run.url) { recordProviderEvent('provider-information-unexpected-document');stopInformation('Quellseite oder Anmeldung nicht verfügbar. Gespeicherte Informationen bleiben erhalten.', true); return true; }
    // A previous same-URL load-end cannot advance a new request without its own load-start.
    if (run.stage !== 'selection' && (informationNavigation.current?.run !== run || informationNavigation.current.nonce !== run.messageNonce)) return true;
    run.observeNavigation(page);
    ports.inject(run.stage === 'selection'
      ? run.category === 'tasks' ? taskSelectionScript(run.messageNonce, 'probe') : informationSelectionScript(run.messageNonce)
      : run.stage === 'restore' ? taskSelectionScript(run.messageNonce, 'restore')
      : run.stage === 'read' ? informationScript(run.category, run.messageNonce) : contextScript(run.messageNonce));
    return true;
  }
  function loadStarted(url: string) {
    if (informationRun.current && url === informationRun.current.url)
      informationNavigation.current = { run: informationRun.current, nonce: informationRun.current.messageNonce };
  }
  function navigationStarted() { informationFailedProfile.current = null; }
  function pageFailed(url?: string, recordProfileFailure = false): boolean {
    const run = informationRun.current;
    if (!run) return false;
    recordProviderEvent('provider-information-page-failed');
    if (run.category === 'tasks' && run.stage === 'restore') {
      stopInformation('Der vorherige Aufgabenfilter konnte nicht bestätigt werden. Aufgabenfilter auf der Vereinsflieger-Seite prüfen. Gespeicherte Belege bleiben erhalten.'); return true;
    }
    if (recordProfileFailure && url === PROFILE_URL && ports.currentUrl() === PROFILE_URL && informationRetry.current && ['before', 'after'].includes(run.stage))
      informationFailedProfile.current = { target: informationRetry.current, epoch: ports.epoch() };
    stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return true;
  }
  function dismiss(): boolean {
    if (informationRun.current?.stage === 'saving') return false;
    if (informationRun.current) stopInformation();
    return true;
  }
  function canReload(): boolean {
    if (!ports.canReload() || informationRun.current) return false;
    try { ports.scope(); return true; } catch { return false; }
  }
  return {
    beginInitialLoad, loadInitial, initialLoadFailed, ownerChanged, backgrounded, active, pageLoaded, loadStarted,
    navigationStarted, pageFailed, dismiss, running: () => !!informationRun.current, receiveInformation,
    public: {
      takeDutyActivity, retrieveMedical, retrieveDutyPage, retrieveFeatureInformation, retryInformation, informationRetryReady: informationRetryReady && ports.ownerCurrent(), informationNeedsReload,
      reloadInformation, informationLoading, informationCanReload: canReload(),
      informationHistory: ports.ownerCurrent() ? informationHistory : null, informationHistoryBusy, informationHistoryNotice,
      loadInformationHistory, informationCategory, informationCaptures: ports.ownerCurrent() ? informationCaptures : [],
      informationNotice, informationBusy, informationSaving, startInformation, stopInformation, nextInformationCategory,
    },
  };
}

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
import { loadInformation, readInformationCapture, readInformationHistory, saveAndLoadInformation } from './information-native';
import { clearTaskSelectionRecovery, loadTaskSelectionRecovery, saveTaskSelectionRecovery } from './task-selection-recovery-native';

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
  const taskRecoveryTransition = useRef<{ run: InformationRun; document: string; epoch: number; stale: boolean } | null>(null);
  const taskRecoveryStop = useRef<{ run: InformationRun; message: string; retryable: boolean; deadlineExpired: boolean } | null>(null);
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

  function informationRunGate(run: InformationRun) {
    if (!ports.mounted() || !ports.foreground() || informationRun.current !== run || !ports.ownerCurrent()) throw new Error('Expired information request');
    run.assertScope(ports.scope());
    const transition = taskRecoveryTransition.current;
    if (transition?.run === run && (transition.stale || ports.currentUrl() !== transition.document || ports.epoch() !== transition.epoch)) throw new Error('Task recovery document changed during local persistence.');
  }

  function beginTaskRecoveryTransition(run: InformationRun) {
    const transition = { run, document: ports.currentUrl(), epoch: ports.epoch(), stale: false };
    taskRecoveryTransition.current = transition;
    return transition;
  }

  function finishTaskRecoveryTransition(transition: { run: InformationRun; document: string; epoch: number; stale: boolean }) {
    if (taskRecoveryTransition.current === transition) taskRecoveryTransition.current = null;
  }

  async function withTaskRecoveryTransition<T>(run: InformationRun, work: () => Promise<T>): Promise<T> {
    const transition = beginTaskRecoveryTransition(run);
    try {
      informationRunGate(run);
      const value = await work();
      informationRunGate(run);
      return value;
    } finally { finishTaskRecoveryTransition(transition); }
  }

  function finishTaskRunWithoutCapture(run: InformationRun, message: string, retryable = false) {
    if (informationRun.current !== run) return;
    const failure = new Error('Task capture was not verified.');
    const taskFailure = run.taskFailureEvent;
    if (taskFailure) recordProviderEvent(taskFailure);
    recordProviderEvent('provider-information-validation-failed');
    run.cancel(); informationRun.current = null; clearInformationNavigation(run);
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null; setInformationBusy(false); setInformationSaving(false); ports.setBusy(false);
    if (taskRecoveryStop.current?.run === run) taskRecoveryStop.current = null;
    setInformationRetryReady(retryable && !!informationRetry.current);
    setInformationNotice(message);
    if (featureRequest.current?.run === run) finishFeature(failure);
    if (dutyRequest.current?.run === run) finishDuty(failure);
  }

  function beginTaskRestoreOnly(run: InformationRun, message: string): boolean {
    if (informationRun.current !== run || !run.taskRecoveryPending || !ports.mounted() || !ports.foreground() || !ports.ownerCurrent()) return false;
    try { if (canonical(ports.scope()) !== canonical(run.scope)) return false; } catch { return false; }
    if (!run.beginTaskRestoreOnly()) return false;
    setInformationSaving(false); setInformationBusy(true); ports.setBusy(true); setInformationNotice(message);
    ports.navigate(run.url);
    return true;
  }

  async function prepareTaskSelection(run: InformationRun) {
    const transition = beginTaskRecoveryTransition(run);
    let destination: string;
    try {
      const gate = () => informationRunGate(run);
      gate();
      const pending = await loadTaskSelectionRecovery(run.scope, gate); gate();
      if (pending) run.resumeTaskSelectionRecovery(pending);
      gate(); destination = run.url;
    } catch {
      // A corrupt, foreign or unavailable checkpoint is retained. No provider
      // navigation occurs until this explicit task request can read it safely.
      finishTaskRunWithoutCapture(run, 'Aufgabenfilter konnte nicht sicher geprüft werden. Konto und Aufgabenfilter prüfen.');
      return;
    } finally {
      finishTaskRecoveryTransition(transition);
    }
    if (taskRecoveryStop.current?.run === run) { const stop = taskRecoveryStop.current; taskRecoveryStop.current = null; finishTaskRunWithoutCapture(run, stop.message, stop.retryable); return; }
    informationRunGate(run);
    if (ports.currentUrl() === destination) void ports.loadPage(destination);
    else ports.navigate(destination);
  }

  function stopInformation(message = 'Informationsabruf abgebrochen. Gespeicherte Belege bleiben erhalten.', retryable = false, deadlineExpired = false) {
    const run = informationRun.current;
    if (run && taskRecoveryTransition.current?.run === run) { taskRecoveryStop.current = { run, message, retryable, deadlineExpired }; return; }
    if (run?.stage === 'saving' && !(deadlineExpired && run.category === 'tasks' && run.taskRestoreOnly)) return;
    if (deadlineExpired && run?.category === 'tasks' && run.taskRecoveryPending) {
      finishTaskRunWithoutCapture(run, message, retryable);
      return;
    }
    if (run?.taskRestoreOnly) {
      finishTaskRunWithoutCapture(run, 'Aufgabenfilter-Wiederherstellung nicht bestätigt. Aufgabenfilter auf der Vereinsflieger-Seite prüfen.');
      return;
    }
    if (run?.category === 'tasks' && run.taskRecoveryPending) {
      if (beginTaskRestoreOnly(run, 'Aufgabenabruf beendet. Aufgabenfilter wird geprüft und wiederhergestellt…')) return;
      finishTaskRunWithoutCapture(run, 'Aufgabenfilter bleibt zur Wiederherstellung vorgemerkt. Auf der Vereinsflieger-Seite prüfen.');
      return;
    }
    run?.cancel(); informationRun.current = null;
    clearInformationNavigation(run);
    finishMedical(new Error('Medical capture did not complete.'));
    finishFeature(new Error('Feature capture did not complete.'));
    finishDuty(new Error('Duty capture did not complete.'));
    if (!retryable) informationRetry.current = null;
    if (informationTimer.current) clearTimeout(informationTimer.current);
    informationTimer.current = null;
    if (ports.mounted()) { setInformationRetryReady(retryable && !!informationRetry.current); setInformationBusy(false); setInformationSaving(false); ports.setBusy(false); setInformationNotice(message); }
  }
  function beginInformation(retry = false, medical = false, dutyUrl?:string, feature?:FeatureInformationCategory): InformationRun | null {
    if (!(medical||dutyUrl||feature?ports.canStartMedical():ports.canStart(retry)) || informationRun.current || informationHistoryBusy || informationUncertain.current) {recordProviderEvent('provider-information-admission-blocked');return null;}
    try {
      taskRecoveryStop.current = null;
      const selectedScope = ports.scope(), target = retry ? informationRetry.current : null;
      if (retry && (!informationRetryReady || !target || target.category !== informationCategory || target.scopeKey !== canonical(selectedScope))) return null;
      const reloadFailedProfile = !!(retry && target && informationFailedProfile.current?.target === target && informationFailedProfile.current.epoch === ports.epoch() && ports.currentUrl() === PROFILE_URL);
      const run = new InformationRun(selectedScope, medical?'medical':dutyUrl?'duties':feature??informationCategory, medical?PROFILE_URL:dutyUrl??(feature?featureSources[feature]:target?.sourceUrl ?? ports.currentUrl()), ports.uuid());
      informationRetry.current = { category: run.category, sourceUrl: run.sourceUrl, scopeKey: canonical(run.scope) }; setInformationRetryReady(false);
      informationLoadRequest.current++; setInformationLoading(false);
      clearInformationNavigation();
      informationRun.current = run; setInformationBusy(true); ports.setBusy(true); setInformationNotice('Konto wird vor und nach der Erfassung geprüft…');
      informationTimer.current = setTimeout(() => {
        if (informationRun.current !== run) return;
        recordProviderEvent('provider-information-timeout');
        stopInformation('Informationsabruf hat das Zeitlimit erreicht. Gespeicherte Belege bleiben erhalten. Quelle und Anmeldung prüfen und erneut versuchen.', true, true);
      }, 90_000);
      if (run.category === 'tasks') void prepareTaskSelection(run);
      else if (run.stage === 'selection' && ports.currentUrl() === run.url) void ports.loadPage(run.url);
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
    const gate = () => informationRunGate(run);
    try {
      gate(); const message = JSON.parse(event.nativeEvent.data), wasRead = run.stage === 'read', previousStage = run.stage;
      const action = run.accept(event.nativeEvent.url, ports.currentUrl(), message);
      if (wasRead && action === 'navigate' && dutyRequest.current?.run === run && message.activity) {
        try {
          const metadata = decodeActivityProbe({kind:'vf-activity-v1',nonce:'duty-metadata',sources:[message.activity]}).sources[0];
          if (metadata && metadata.source === 'own-duties' && run.sourceUrl === 'https://vereinsflieger.de/member/profile/myservices.php')
            dutyActivityByRun.current.set(run,metadata);
        } catch { /* Optional metadata never changes the canonical capture outcome. */ }
      }
      if (action === 'navigate') {
        let taskJournalTransition = false;
        if (run.category === 'tasks' && previousStage === 'before') {
          await withTaskRecoveryTransition(run, async () => {
            const checkpoint = run.createTaskSelectionRecovery();
            const saved = await saveTaskSelectionRecovery(run.scope, checkpoint, gate); gate();
            run.recordTaskSelectionRecovery(saved);
          });
          taskJournalTransition = true;
        } else if (run.category === 'tasks' && previousStage === 'recovery-restore') {
          await withTaskRecoveryTransition(run, async () => {
            const previous = run.pendingTaskSelectionRecovery;
            if (!previous) throw new Error('Pending task selector recovery is unavailable.');
            await clearTaskSelectionRecovery(run.scope, previous, gate); gate(); run.clearTaskSelectionRecovery(previous);
          });
          taskJournalTransition = true;
        }
        if (taskJournalTransition && taskRecoveryStop.current?.run === run) {
          const deferredStop = taskRecoveryStop.current; taskRecoveryStop.current = null;
          if (!deferredStop.deadlineExpired && beginTaskRestoreOnly(run, deferredStop.message)) return;
          finishTaskRunWithoutCapture(run, deferredStop.message, deferredStop.retryable);
          return;
        }
        gate(); ports.navigate(run.url); return;
      }
      if (action === 'restored') {
        const checkpoint = run.pendingTaskSelectionRecovery;
        if (!checkpoint) throw new Error('Pending task selector recovery is unavailable.');
        run.stage = 'saving';
        await withTaskRecoveryTransition(run, async () => {
          await clearTaskSelectionRecovery(run.scope, checkpoint, gate); gate(); run.clearTaskSelectionRecovery(checkpoint);
        });
        run.completeTaskRestoreOnly(); informationRun.current = null; clearInformationNavigation(run);
        if (informationTimer.current) clearTimeout(informationTimer.current);
        informationTimer.current = null; setInformationBusy(false); setInformationSaving(false); ports.setBusy(false);
        setInformationNotice('Aufgabenabruf beendet. Aufgabenfilter wiederhergestellt.');
        if (featureRequest.current?.run === run) finishFeature(new Error('Task capture was not verified.'));
        if (dutyRequest.current?.run === run) finishDuty(new Error('Task capture was not verified.'));
        return;
      }
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
      if (run.category === 'tasks') {
        const checkpoint = run.pendingTaskSelectionRecovery;
        if (!checkpoint) throw new Error('Pending task selector recovery is unavailable.');
        await withTaskRecoveryTransition(run, async () => {
          await clearTaskSelectionRecovery(run.scope, checkpoint, gate); gate(); run.clearTaskSelectionRecovery(checkpoint);
        });
      }
      informationUncertain.current = run.nonce;
      const records = await saveAndLoadInformation(run.scope, run.capture(new Date().toISOString()), gate); gate();
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
        const deferredStop = taskRecoveryStop.current?.run === run ? taskRecoveryStop.current : null;
        if (deferredStop) taskRecoveryStop.current = null;
        recordProviderEvent(uncertain?'provider-information-save-unconfirmed':'provider-information-validation-failed');
        const taskFailure = run.taskFailureEvent;
        if (taskFailure) recordProviderEvent(taskFailure);
        const taskRestoreFailed = run.category === 'tasks' && run.taskRecoveryPending && ['restore','recovery-restore','restore-only','restore-acknowledged','saving'].includes(run.stage);
        const taskCanRestore = run.category === 'tasks' && run.taskRecoveryPending && run.taskRestoreAuthorized &&
          !run.taskRestoreOnly && !['restore','recovery-restore','restore-acknowledged','saving'].includes(run.stage);
        if (!deferredStop && taskCanRestore && beginTaskRestoreOnly(run, 'Erfassung nicht bestätigt. Aufgabenfilter wird geprüft und wiederhergestellt…')) return;
        run.stage = 'cancelled'; informationRun.current = null;
        clearInformationNavigation(run);
        if (informationTimer.current) clearTimeout(informationTimer.current);
        informationTimer.current = null; setInformationBusy(false); setInformationSaving(false); ports.setBusy(false);
        setInformationNeedsReload(uncertain); setInformationRetryReady(!uncertain);
        setInformationNotice(deferredStop?.message ?? (taskRestoreFailed || run.category === 'tasks' && run.taskRecoveryPending
          ? 'Erfassung nicht bestätigt. Aufgabenfilter-Wiederherstellung auf der Vereinsflieger-Seite prüfen.'
          : 'Erfassung nicht bestätigt. ' + (uncertain ? 'Zuerst gespeicherte Informationen lokal neu laden, bevor erneut erfasst wird. Eine eventuell bereits gespeicherte Erfassung bleibt erhalten.' : (run.failureMessage ?? 'Quelle, Spalten oder Konto nicht unterstützt.') + ' Quelle und Anmeldung prüfen, dann ausdrücklich erneut versuchen. Gespeicherte Belege bleiben erhalten.')));
        if(medicalRequest.current?.run===run)finishMedical(new Error('Medical capture was not verified.'));
        if(dutyRequest.current?.run===run)finishDuty(new Error('Duty capture was not verified.'));
        if(featureRequest.current?.run===run)finishFeature(new Error('Feature capture was not verified.'));
      }
    }
  }
  function nextInformationCategory() { if (!informationRun.current) { informationRetry.current = null; setInformationRetryReady(false); setInformationCategory(old => retrievableInformationCategories[(retrievableInformationCategories.indexOf(old) + 1) % retrievableInformationCategories.length]!); } }
  useEffect(() => () => { informationLoadRequest.current++; const run = informationRun.current; if (taskRecoveryStop.current?.run === run) taskRecoveryStop.current = null; run?.cancel(); informationRun.current = null; clearInformationNavigation(); finishMedical(new Error('Medical reader closed.')); finishFeature(new Error('Feature reader closed.')); finishDuty(new Error('Duty reader closed.')); if (informationTimer.current) clearTimeout(informationTimer.current); }, []);
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
    const run = informationRun.current;
    if (taskRecoveryStop.current?.run === run) taskRecoveryStop.current = null;
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
    const transition = taskRecoveryTransition.current;
    if (transition?.run === run) {
      if (page !== transition.document || ports.currentUrl() !== transition.document || ports.epoch() !== transition.epoch) transition.stale = true;
      return true;
    }
    if (run.category === 'tasks' && run.stage === 'saving' && page === run.taskRestoreUrl && ports.currentUrl() === page) return true;
    if (page !== run.url) { recordProviderEvent('provider-information-unexpected-document');stopInformation('Quellseite oder Anmeldung nicht verfügbar. Gespeicherte Informationen bleiben erhalten.', true); return true; }
    // A previous same-URL load-end cannot advance a new request without its own load-start.
    if (run.stage !== 'selection' && (informationNavigation.current?.run !== run || informationNavigation.current.nonce !== run.messageNonce)) return true;
    run.observeNavigation(page);
    ports.inject(run.stage === 'selection'
      ? run.category === 'tasks' ? taskSelectionScript(run.messageNonce, 'probe') : informationSelectionScript(run.messageNonce)
      : ['restore','recovery-restore','restore-only'].includes(run.stage) ? taskSelectionScript(run.messageNonce, 'restore')
      : run.stage === 'read' ? informationScript(run.category, run.messageNonce) : contextScript(run.messageNonce));
    return true;
  }
  function loadStarted(url: string) {
    const run = informationRun.current;
    if (!run) return;
    if (taskRecoveryTransition.current?.run === run) {
      taskRecoveryTransition.current.stale = true;
      return;
    }
    if (url === run.url) informationNavigation.current = { run, nonce: run.messageNonce };
  }
  function navigationStarted() { informationFailedProfile.current = null; }
  function pageFailed(url?: string, recordProfileFailure = false): boolean {
    const run = informationRun.current;
    if (!run) return false;
    recordProviderEvent('provider-information-page-failed');
    if (recordProfileFailure && url === PROFILE_URL && ports.currentUrl() === PROFILE_URL && informationRetry.current && ['before', 'after'].includes(run.stage))
      informationFailedProfile.current = { target: informationRetry.current, epoch: ports.epoch() };
    stopInformation('Informationsquelle nicht verfügbar. Gespeicherte Belege bleiben erhalten.', true); return true;
  }
  function dismiss(): boolean {
    if (informationRun.current?.stage === 'saving' || informationRun.current && taskRecoveryTransition.current?.run === informationRun.current) return false;
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

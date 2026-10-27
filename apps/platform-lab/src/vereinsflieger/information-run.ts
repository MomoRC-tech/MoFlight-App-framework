import { canonical } from '@moflight/flight-logbook';
import { PROFILE_URL, sameContext, scopedBridge, validateContext } from './context';
import { validateScope, type ProviderScope } from './scope-store';
import type { ProviderDiagnosticEvent } from './provider-diagnostics';
import { eventSelectionFilters, retrievableInformationCategories, informationCategoryUrl, TASK_SELECTION_PROBE_URL, validateTaskSelection, validateInformationPage, type InformationCapture, type InformationCategory } from './information';

/** Fresh context -> original selected page -> fresh context -> explicit immutable save.
 * No provider writes/automatic traversal; stale/background/cancel events cannot publish.
 */
export class InformationRun {
  stage: 'selection' | 'before' | 'read' | 'after' | 'restore' | 'saving' | 'done' | 'cancelled' = 'before';
  private page: ReturnType<typeof validateInformationPage> | null = null;
  private selectedFilters: string[] | null = null;
  private taskSelection: { selected: string; restoreUrl: string } | null = null;
  private taskRestoreAllowed = false;
  private navigationObserved = false;
  private readFailureEvent: ProviderDiagnosticEvent | null = null;
  failureMessage: string | null = null;
  readonly scope: ProviderScope;
  constructor(scope: ProviderScope, readonly category: InformationCategory, readonly sourceUrl: string, readonly nonce: string) {
    this.scope = validateScope(scope);
    if (!retrievableInformationCategories.includes(category) || !informationCategoryUrl(category, sourceUrl) || !/^[a-zA-Z0-9_-]{1,100}$/.test(nonce)) throw new Error('Unsupported information request');
    if (category === 'tasks' && sourceUrl !== 'https://vereinsflieger.de/member/community/tasklist/tasklist?gselect=myopen') throw new Error('Unsupported own-task request');
    if (category === 'events' || category === 'tasks') this.stage = 'selection';
  }
  get url() {
    if (this.stage === 'selection') return this.category === 'tasks' ? TASK_SELECTION_PROBE_URL : this.sourceUrl;
    if (this.stage === 'read') return this.sourceUrl;
    if (this.stage === 'restore') {
      if (!this.taskSelection) throw new Error('Task selection was not captured');
      return this.taskSelection.restoreUrl;
    }
    return PROFILE_URL;
  }
  get messageNonce() { return this.nonce + '-' + this.stage; }
  get taskRestoreUrl() { return this.taskSelection?.restoreUrl ?? null; }
  get taskRestoreAuthorized() { return this.category === 'tasks' && !!this.taskSelection && this.taskRestoreAllowed; }
  get taskSelectedFilter() { return this.taskSelection?.selected ?? null; }
  /** Fixed reason/stage only: never publish provider text, IDs or exception messages. */
  get taskFailureEvent(): ProviderDiagnosticEvent | null {
    if (this.category !== 'tasks') return null;
    switch (this.stage) {
      case 'selection': return 'provider-task-selection-failed';
      case 'before': return 'provider-task-context-before-failed';
      case 'read': return this.readFailureEvent ?? 'provider-task-read-validation-failed';
      case 'after': return 'provider-task-context-after-failed';
      case 'restore': return 'provider-task-restore-failed';
      case 'saving': return 'provider-task-save-failed';
      default: return null;
    }
  }
  get resultUrl() { return this.taskSelection?.restoreUrl ?? this.sourceUrl; }
  observeNavigation(url: string) { if (url === this.url && ['selection','before','read','after','restore'].includes(this.stage)) this.navigationObserved = true; }
  cancel() { if (this.stage !== 'saving' && this.stage !== 'done') { this.stage = 'cancelled'; this.page = null; } }
  assertScope(scope: ProviderScope) { if (canonical(validateScope(scope)) !== canonical(this.scope) || this.stage === 'cancelled' || this.stage === 'done') throw new Error('Expired information operation'); }
  accept(nativeUrl: string, currentUrl: string, input: unknown): 'navigate' | 'save' | 'ignored' {
    if (!this.navigationObserved || !['selection','before','read','after','restore'].includes(this.stage) || !scopedBridge(nativeUrl, currentUrl, this.url) || !input || typeof input !== 'object') return 'ignored';
    const p = input as Record<string, unknown>;
    const kind = this.stage === 'selection' ? this.category === 'tasks' ? 'vf-information-task-selection-v1' : 'vf-information-selection-v1' : this.stage === 'read' ? 'vf-information-v1' : this.stage === 'restore' ? 'vf-information-task-restore-v1' : 'vf-context-v1';
    if (p.nonce !== this.messageNonce || p.url !== this.url || p.kind !== kind) return 'ignored';
    if (this.stage === 'selection') {
      if (this.category === 'tasks') {
        try { this.taskSelection = validateTaskSelection(p.selection); }
        catch { this.failureMessage = 'Die aktuelle Aufgabenfilter-Auswahl und die zugelassenen Filterlinks konnten nicht eindeutig bestätigt werden.'; throw new Error('Unverified task selection'); }
      } else this.selectedFilters = eventSelectionFilters(p.selection);
      this.stage = 'before'; this.navigationObserved = false; return 'navigate';
    }
    if (this.stage === 'read') {
      const pageValue = p.page as { error?: unknown; shape?: unknown } | null;
      if (pageValue && typeof pageValue === 'object' && typeof pageValue.error === 'string') {
        const reasons: Record<string, ProviderDiagnosticEvent> = {
          'task-scope-unverified': 'provider-task-scope-unverified',
          'source-table-unverified': 'provider-task-table-unverified',
          'row-shape': 'provider-task-row-shape',
          'nested-source-row': 'provider-task-nested-row',
          'duplicate-column': 'provider-task-duplicate-column',
          'empty-scope-unverified': 'provider-task-empty-unverified',
          'conflicting-empty-state': 'provider-task-conflicting-empty',
        };
        this.readFailureEvent = Object.hasOwn(reasons, pageValue.error)
          ? reasons[pageValue.error]! : 'provider-task-source-unsupported';
        if (pageValue.error === 'source-table-unverified' && typeof pageValue.shape === 'string' && /^[\d,;]{1,240}$/.test(pageValue.shape)) console.info('MoFlight information table dimensions', pageValue.shape);
        if (pageValue.error === 'event-source-unverified' && typeof pageValue.shape === 'string' && /^[\d,]{1,80}$/.test(pageValue.shape)) console.info('MoFlight information event structure', pageValue.shape);
        const messages: Record<string, string> = {
          'source-table-unverified': 'Keine eindeutige Tabelle für den ausgewählten Quelltyp.',
          'task-scope-unverified': 'Die Quelle ist nicht als eigene offene Aufgaben bestätigt.',
          'notice-source-unverified': 'Diese Übersicht wird in dieser Form noch nicht unterstützt.',
          'training-summary-unverified': 'Die ausgewählte Ausbildungsübersicht wird in dieser Form noch nicht unterstützt.',
          'medical-source-unverified': 'Medical-Abschnitt nicht eindeutig erkannt.',
          'profile-source-unverified': 'Die ausgewählten eigenen Profilfelder sind nicht eindeutig erkannt.',
          'licence-source-unverified': 'Die Struktur der ausgewählten Lizenzangaben ist nicht bestätigt.',
          'event-source-unverified': 'Die ausgewählte Terminliste ist nicht eindeutig erkannt.',
          'event-selection-unverified': 'Datum und Ansicht des Kalenders sind nicht bestätigt.',
          'row-shape': 'Die Struktur der Quellzeilen wird noch nicht unterstützt.',
          'nested-source-row': 'Eine verschachtelte Quellzeile wird noch nicht unterstützt.',
          'duplicate-column': 'Die Quellspalten sind mehrdeutig.',
          'empty-scope-unverified': 'Eine leere Quelle ist nicht bestätigt.',
          'source-unavailable': 'Die angemeldete Quellseite ist nicht verfügbar.',
        };
        this.failureMessage = messages[pageValue.error] ?? 'Diese Quellseite wird noch nicht unterstützt.';
        throw new Error('Unsupported information source');
      }
      const page = validateInformationPage(p.page);
      if (page.category !== this.category || page.path !== new URL(this.sourceUrl).pathname) throw new Error('Information source changed');
      if (this.category === 'events' && canonical(page.filters) !== canonical(this.selectedFilters)) {
        this.failureMessage = 'Datum oder Kalenderansicht hat sich während der Erfassung geändert.';
        throw new Error('Event selection changed');
      }
      this.page = page; this.stage = 'after'; this.navigationObserved = false; return 'navigate';
    }
    if (this.stage === 'restore') {
      let restored: ReturnType<typeof validateTaskSelection>;
      try { restored = validateTaskSelection(p.selection); }
      catch { this.failureMessage = 'Der vorherige Aufgabenfilter konnte nicht bestätigt werden.'; throw new Error('Task selector restoration was not verified'); }
      if (!this.taskSelection || restored.selected !== this.taskSelection.selected || restored.restoreUrl !== this.taskSelection.restoreUrl) {
        this.failureMessage = 'Der vorherige Aufgabenfilter konnte nicht bestätigt werden.';
        throw new Error('Task selector restoration mismatch');
      }
      this.stage = 'saving'; this.navigationObserved = false; return 'save';
    }
    if (p.context && typeof p.context === 'object' && (p.context as { error?: unknown }).error === 'session-required') {
      if (this.category === 'tasks' && this.stage === 'after') this.taskRestoreAllowed = false;
      this.failureMessage = 'Anbietersitzung abgelaufen. Auf der Originalseite erneut anmelden und Konto sowie Verein prüfen.';
      throw new Error('Provider session required');
    }
    let observedContext: ReturnType<typeof validateContext>;
    try { observedContext = validateContext(p.context); }
    catch (error) { if (this.category === 'tasks' && this.stage === 'after') this.taskRestoreAllowed = false; throw error; }
    if (!sameContext(observedContext, this.scope.context)) {
      if (this.category === 'tasks' && this.stage === 'after') this.taskRestoreAllowed = false;
      this.failureMessage = 'Konto oder Verein stimmt nicht mit der bestätigten Zuordnung überein.';
      throw new Error('Provider context mismatch');
    }
    if (this.stage === 'before') {
      if (this.category === 'tasks') this.taskRestoreAllowed = true;
      this.stage = 'read'; this.navigationObserved = false; return 'navigate';
    }
    this.stage = this.category === 'tasks' ? 'restore' : 'saving'; this.navigationObserved = false;
    return this.stage === 'saving' ? 'save' : 'navigate';
  }
  capture(at: string): InformationCapture {
    if (this.stage !== 'saving' || !this.page) throw new Error('Information is not verified for capture');
    return { ...this.page, version: 1, id: this.nonce, retrievedAt: at, owner: this.scope.owner, connectionId: this.scope.connectionId, sourceIdentity: 'provisional-observed-profile' };
  }
}

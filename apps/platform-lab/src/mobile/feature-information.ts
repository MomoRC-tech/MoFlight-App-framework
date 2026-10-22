import { validateInformationCapture, type InformationCapture } from '../vereinsflieger/information';
import { validateScope, type ProviderScope } from '../vereinsflieger/scope-store';

export interface FeatureSource<T> {
  status: 'partial' | 'unavailable'; retrievedAt: string | null;
  filters: string[]; truncated: boolean; items: T[]; empty?: boolean;
}
export interface EventSourceItem { key: string; date: string; time: string; kind: string; title: string; location: string | null }
export interface DocumentNoticeItem { key: string; text: string }
export interface WorkSummaryItem { key: string; period: string; obligation: string; performed: string; hours: string }
export interface WorkHourItem { key: string; date: string; activity: string; hours: string; status: string; category?: string }
export interface OwnTaskItem { key: string; title: string; due: string; status: string; days?: string; priority?: string }
export interface FeatureInformation {
  events: FeatureSource<EventSourceItem>;
  documentNotices: FeatureSource<DocumentNoticeItem>;
  workSummary?: FeatureSource<WorkSummaryItem>;
  workHours?: FeatureSource<WorkHourItem>;
  tasks?: FeatureSource<OwnTaskItem>;
}
const unavailable = <T>(): FeatureSource<T> => ({ status: 'unavailable', retrievedAt: null, filters: [], truncated: false, items: [] });
/** Projects stored source text only. No inferred completeness, event timezone or document downloads. */
export function buildFeatureInformation(input: ProviderScope, captures: readonly InformationCapture[]): FeatureInformation {
  const scope = validateScope(input);
  function source<T>(category: 'events' | 'document-notices' | 'work-summary' | 'work-hours' | 'tasks', project: (capture: InformationCapture) => T[]): FeatureSource<T> {
    const matches = captures.filter(c => c.category === category && c.owner === scope.owner && c.connectionId === scope.connectionId);
    // The store returns one latest capture per category. Ambiguity is not resolved by guessing.
    if (matches.length !== 1) return unavailable<T>();
    try {
      const capture = validateInformationCapture(matches[0]);
      return { status: 'partial', retrievedAt: capture.retrievedAt, filters: [...capture.filters], truncated: capture.coverage.truncated, empty: capture.empty, items: project(capture) };
    } catch { return unavailable<T>(); }
  }
  const rowValue = (capture: InformationCapture, row: InformationCapture['rows'][number], key: string) =>
    row.values[capture.columns.findIndex(column => column.key === key)]!;
  const optionalRowValue = (capture: InformationCapture, row: InformationCapture['rows'][number], key: string) => {
    const index = capture.columns.findIndex(column => column.key === key);
    return index < 0 ? undefined : row.values[index]!;
  };
  return {
    events: source('events', capture => capture.rows.map(row => {
      const [title, location] = rowValue(capture, row, 'info').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      return { key: `${capture.id}:${row.position}`, date: rowValue(capture, row, 'date'), time: rowValue(capture, row, 'time'), kind: rowValue(capture, row, 'kind'), title: title!, location: location?.replace(/^Ort:\s*/, '') ?? null };
    })),
    documentNotices: source('document-notices', capture => capture.rows.map(row => ({ key: `${capture.id}:${row.position}`, text: rowValue(capture, row, 'notice') }))),
    workSummary: source('work-summary', capture => capture.rows.map(row => ({
      key: `${capture.id}:${row.position}`, period: rowValue(capture, row, 'period'), obligation: rowValue(capture, row, 'obligation'),
      performed: rowValue(capture, row, 'performed'), hours: rowValue(capture, row, 'hours'),
    }))),
    workHours: source('work-hours', capture => capture.rows.map(row => {
      const category = optionalRowValue(capture, row, 'category');
      return { key: `${capture.id}:${row.position}`, date: rowValue(capture, row, 'date'), activity: rowValue(capture, row, 'activity'),
        hours: rowValue(capture, row, 'hours'), status: rowValue(capture, row, 'status'), ...(category !== undefined ? { category } : {}) };
    })),
    tasks: source('tasks', capture => capture.rows.map(row => {
      const days = optionalRowValue(capture, row, 'days'), priority = optionalRowValue(capture, row, 'priority');
      return { key: `${capture.id}:${row.position}`, title: rowValue(capture, row, 'title'), due: rowValue(capture, row, 'due'), status: rowValue(capture, row, 'status'),
        ...(days !== undefined ? { days } : {}), ...(priority !== undefined ? { priority } : {}) };
    })),
  };
}

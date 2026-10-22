import { validateInformationCapture, type InformationCapture } from '../vereinsflieger/information';
import { validateScope, type ProviderScope } from '../vereinsflieger/scope-store';

export interface FeatureSource<T> {
  status: 'partial' | 'unavailable'; retrievedAt: string | null;
  filters: string[]; truncated: boolean; items: T[];
}
export interface EventSourceItem { key: string; date: string; time: string; kind: string; title: string; location: string | null }
export interface DocumentNoticeItem { key: string; text: string }
export interface FeatureInformation {
  events: FeatureSource<EventSourceItem>;
  documentNotices: FeatureSource<DocumentNoticeItem>;
}
const unavailable = <T>(): FeatureSource<T> => ({ status: 'unavailable', retrievedAt: null, filters: [], truncated: false, items: [] });
/** Projects stored source text only. No inferred completeness, event timezone or document downloads. */
export function buildFeatureInformation(input: ProviderScope, captures: readonly InformationCapture[]): FeatureInformation {
  const scope = validateScope(input);
  function source<T>(category: 'events' | 'document-notices', project: (capture: InformationCapture) => T[]): FeatureSource<T> {
    const matches = captures.filter(c => c.category === category && c.owner === scope.owner && c.connectionId === scope.connectionId);
    // The store returns one latest capture per category. Ambiguity is not resolved by guessing.
    if (matches.length !== 1) return unavailable<T>();
    try {
      const capture = validateInformationCapture(matches[0]);
      return { status: 'partial', retrievedAt: capture.retrievedAt, filters: [...capture.filters], truncated: capture.coverage.truncated, items: project(capture) };
    } catch { return unavailable<T>(); }
  }
  return {
    events: source('events', capture => capture.rows.map(row => {
      const value = (key: string) => row.values[capture.columns.findIndex(column => column.key === key)]!;
      const [title, location] = value('info').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      return { key: `${capture.id}:${row.position}`, date: value('date'), time: value('time'), kind: value('kind'), title: title!, location: location?.replace(/^Ort:\s*/, '') ?? null };
    })),
    documentNotices: source('document-notices', capture => capture.rows.map(row => ({ key: `${capture.id}:${row.position}`, text: row.values[capture.columns.findIndex(column => column.key === 'notice')]! }))),
  };
}

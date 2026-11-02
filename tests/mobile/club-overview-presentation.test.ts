import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import type { DutyOverview } from '../../apps/platform-lab/src/vereinsflieger/duties';
import type { FeatureInformation } from '../../apps/platform-lab/src/mobile/feature-information';
import type { ClubOverviewProps } from '../../apps/platform-lab/src/mobile/ClubOverview';

type Element = { type: unknown; props: Record<string, any>; children: any[] };

function fixture() {
  const react = { createElement: (type: any, props: any, ...children: any[]): Element => typeof type === 'function'
    ? type({ ...props, children }) : { type, props: props ?? {}, children: children.flat(Infinity) } };
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/ClubOverview.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const exports: Record<string, (props: ClubOverviewProps) => Element> = {};
  const modules: Record<string, unknown> = {
    react: { default: react, ...react },
    'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (value: unknown) => value } },
    './theme': { Card: 'Card', Label: 'Label', colors: { border: 'border', raised: 'raised', text: 'text', cyan: 'cyan', muted: 'muted' } },
    './SymbolIcon': { SymbolIcon: 'SymbolIcon' },
  };
  runInNewContext(source, { exports, require: (id: string) => { assert.ok(id in modules, id); return modules[id]; } });
  const nodes = (node: any): Element[] => !node || typeof node !== 'object' ? [] : [node, ...(node.children ?? []).flatMap(nodes)];
  const text = (node: any): string => (typeof node === 'string' || typeof node === 'number' ? String(node) : (node?.children ?? []).map(text).join(' ')).replace(/\s+/g, ' ').trim();
  return { exports, nodes, text };
}

function information(): FeatureInformation {
  return {
    events: { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: ['Ansicht: 3 Monate'], truncated: false, empty: false,
      items: [0, 1].map(i => ({ key: `event-${i}`, date: '03.11.2026', time: 'Ganztags', kind: 'Termin', title: `Synthetic event ${i}`, location: 'Synthetic field' })) },
    documentNotices: { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: false, empty: false,
      items: [{ key: 'document', text: 'Synthetic document notice' }] },
    workSummary: { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: false, empty: false,
      items: [{ key: 'summary', period: '2026', obligation: '90,00 €', performed: '21,50 €', hours: '03:45' }] },
    workHours: { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: true, empty: false,
      items: [{ key: 'work-1', date: '31.10.2026', activity: 'Synthetic repair', hours: '01:30', status: 'Erfasst' }, { key: 'work-2', date: '30.10.2026', activity: 'Second detail row', hours: '02:15', status: 'Offen' }] },
    tasks: { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: ['Meine nicht beendeten Aufgaben'], truncated: false, empty: false,
      items: [{ key: 'task-1', title: 'Synthetic task one', due: '05.11.2026', status: 'Offen' }, { key: 'task-2', title: 'Second task detail', due: '06.11.2026', status: 'Offen' }] },
  };
}

function duties(): DutyOverview {
  const own = { key: 'own-1', duty: 'Synthetic duty', period: '03.11.2026 09:00 - 03.11.2026 17:00', start: '2026-11-03', end: '2026-11-03', people: ['Pilot A.'], ownState: 'own' as const, coAssignees: [], sourcePath: '/synthetic', identity: 'source-row-only' as const, periodBasis: 'displayed-calendar-days' as const };
  return { status: 'partial', window: { start: '2026-11-02', end: '2026-11-15' }, items: [own], ownItems: [own], laterOwn: [], unplaced: [],
    retrievedAt: '2026-11-01T10:00:00.000Z', clubLabel: 'Synthetic club', coverageMessage: 'Erfasster Seitenausschnitt · Vollständigkeit ungeprüft.',
    sources: [{ source: 'own', state: 'partial', rowCount: 1, inWindowCount: 1, unknownPeriodCount: 0, displayedInterval: { start: '2026-11-03', end: '2026-11-03' }, pagination: 'unverified', complete: false }] };
}

test('overview presents five compact destinations and routes each row to the existing detail section', () => {
  const f = fixture(), opened: string[] = [];
  const view = f.exports.ClubOverview!({ clubLabel: 'Synthetic club', dutyOverview: duties(), information: information(), onOpen: section => opened.push(section) });
  const rows = f.nodes(view).filter(node => node.type === 'Pressable' && String(node.props.testID).startsWith('club-overview-'));
  assert.deepEqual(rows.map(row => row.props.testID), [
    'club-overview-Dienste', 'club-overview-Termine', 'club-overview-Arbeitsstunden', 'club-overview-Aufgaben', 'club-overview-Dokumente',
  ]);
  assert.match(f.text(view), /Synthetic club/);
  for (const row of rows) row.props.onPress();
  assert.deepEqual(opened, ['Dienste', 'Termine', 'Arbeitsstunden', 'Aufgaben', 'Dokumente']);
  const shown = f.text(view);
  for (const expected of ['Eigener Dienst · Synthetic duty · 03.11.2026 · Ausschnitt', '2 Termine · 03.11.2026 · Synthetic event 0 · Ausschnitt', '2026: 03:45 Std. · 2 Einzelposten · gekürzt',
    '2 Aufgaben · Synthetic task one · bis 05.11.2026 · Ausschnitt', '1 Hinweis · Synthetic document notice · Ausschnitt']) assert.ok(shown.includes(expected), expected);
  assert.match(rows[0]!.props.accessibilityLabel, /Nächster eigener Dienst.*Vollständigkeit|unvollständig/);
  assert.match(rows[1]!.props.accessibilityLabel, /Vollständigkeit ungeprüft.*keine vollständige Zukunftsvorschau/);
  assert.match(rows[2]!.props.accessibilityLabel, /Vollständigkeit ungeprüft.*keine Summe abgeleitet/);
  assert.doesNotMatch(shown, /Ansicht: 3 Monate|Second detail row|Second task detail|Zu erledigen bis|Priorität|31\.10\.2026|Personen laut Quellzeile/);
  assert.doesNotMatch(shown, /Gesamtstunden|Summe|Quote/);
  assert.doesNotMatch(shown, /09:00|17:00/);
});

test('read failures retain stale summaries with an explicit warning; missing sources remain unknown', () => {
  const f = fixture();
  const stale = f.text(f.exports.ClubOverview!({ information: information(), informationReadFailed: true, dutyOverview: duties(), dutiesReadFailed: true, onOpen: () => {} }));
  assert.match(stale, /Synthetic task one/);
  assert.match(stale, /letzter Stand · Ladefehler/);
  const missing = f.text(f.exports.ClubOverview!({ information: null, informationReadFailed: true, dutiesReadFailed: true, onOpen: () => {} }));
  const missingRows = f.nodes(f.exports.ClubOverview!({ information: null, informationReadFailed: true, dutiesReadFailed: true, onOpen: () => {} }))
    .filter(node => node.type === 'Pressable' && String(node.props.testID).startsWith('club-overview-'));
  assert.match(missingRows.find(row => row.props.testID === 'club-overview-Termine')!.props.accessibilityLabel, /Termine unbekannt.*lokales Laden fehlgeschlagen/);
  assert.match(missingRows.find(row => row.props.testID === 'club-overview-Aufgaben')!.props.accessibilityLabel, /Eigene Aufgaben unbekannt.*lokales Laden fehlgeschlagen/);
  assert.match(missingRows[0]!.props.accessibilityLabel, /Nächster eigener Dienst unbekannt.*lokales Laden fehlgeschlagen/);
  assert.doesNotMatch(missing, /Keine Termine|Keine eigenen Aufgaben/);
});

test('partial empty sources stay qualified to their captured excerpts and menu actions respect busy state', () => {
  const f = fixture(), source = information();
  source.events = { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: false, empty: true, items: [] };
  source.documentNotices = { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: false, empty: true, items: [] };
  source.tasks = { status: 'partial', retrievedAt: '2026-11-01T10:00:00.000Z', filters: [], truncated: false, empty: true, items: [] };
  const noOwn = duties();
  noOwn.ownItems = [];
  noOwn.laterOwn = [];
  noOwn.items = [];
  noOwn.sources = [{ source: 'own', state: 'empty-page', rowCount: 0, inWindowCount: 0, unknownPeriodCount: 0, displayedInterval: null, pagination: 'unverified', complete: false }];
  const view = f.exports.ClubOverview!({ information: source, dutyOverview: noOwn, disabled: true, onOpen: () => assert.fail('disabled row invoked') });
  const shown = f.text(view);
  assert.match(shown, /Keine Termine · Ausschnitt/);
  assert.match(shown, /Keine Aufgaben · Ausschnitt/);
  assert.match(shown, /Kein eigener Dienst · Ausschnitt/);
  const labels = f.nodes(view).filter(node => node.type === 'Pressable' && String(node.props.testID).startsWith('club-overview-')).map(node => node.props.accessibilityLabel).join(' ');
  assert.match(labels, /Keine Termine im erfassten Ausschnitt; weitere Einträge bleiben unbekannt/);
  assert.match(labels, /Keine eigenen Aufgaben im erfassten Ausschnitt; weitere Aufgaben bleiben unbekannt/);
  assert.match(labels, /Kein eigener Dienst im erfassten Ausschnitt; weitere Dienstpläne und Seiten bleiben unbekannt/);
  assert.doesNotMatch(shown, /Keine Termine insgesamt|Keine offenen Aufgaben insgesamt|dienstfrei/);
  for (const row of f.nodes(view).filter(node => node.type === 'Pressable' && String(node.props.testID).startsWith('club-overview-'))) {
    assert.equal(row.props.disabled, true);
    assert.equal(row.props.accessibilityState.disabled, true);
  }
});

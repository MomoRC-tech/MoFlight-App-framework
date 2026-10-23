import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dataFreshness, dataUpdateStatus, DATA_FRESHNESS_REMINDER_MS, DATA_UPDATE_FRESH_MS } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { createSessionPresentation } from '../../apps/platform-lab/src/mobile/data-update-presentation.ts';
import { ConnectionSession, type ConnectionState } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';
import { nextStartBoundary } from '../../apps/platform-lab/src/mobile/start-clock.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';

const at = '2026-10-22T12:00:00.000Z', received = Date.parse(at);
test('saved age changes units without conflating it with a login or a sync recommendation', () => {
  assert.equal(dataUpdateStatus(at, 'ready', received).caption, 'gerade');
  assert.equal(dataUpdateStatus(at, 'ready', received + DATA_UPDATE_FRESH_MS - 1).state, 'fresh');
  assert.deepEqual(dataUpdateStatus(at, 'ready', received + DATA_UPDATE_FRESH_MS), {
    state: 'older', caption: 'vor 1 Std.', description: `Letzter gespeicherter Flugdatenabruf von Vereinsflieger: ${new Date(received).toLocaleString('de-DE')}.`,
  });
  assert.equal(dataUpdateStatus(at, 'ready', received + 60_000).caption, 'vor 1 Min.');
  assert.equal(dataUpdateStatus(at, 'ready', received + 2 * 86_400_000).caption, 'vor 2 Tg.');
  assert.equal(nextStartBoundary(received + 59 * 60_000, [received + DATA_UPDATE_FRESH_MS]), received + DATA_UPDATE_FRESH_MS);
});

test('missing, unreadable, malformed or future data cannot claim a recent update', () => {
  for (const value of [null, 'invalid', '2026-10-22T12:00:00Z', '2026-10-23T12:00:00.000Z']) {
    assert.equal(dataUpdateStatus(value, 'ready', received).state, 'unknown');
  }
  assert.equal(dataUpdateStatus(null, 'ready', received).caption, 'Noch nie');
  assert.equal(dataUpdateStatus(null, 'loading', received).caption, 'Lädt…');
  assert.equal(dataUpdateStatus(null, 'failed', received).caption, 'Unklar');
  assert.equal(dataUpdateStatus(at, 'ready', NaN).state, 'unknown');
});

test('a durably saved empty or unchanged retrieval advances data age without depending on flight count', () => {
  const saved = [{ from: '2026-01-01', to: '2026-10-22', retrievedAt: at, savedAt: at }];
  const plan = planFlightRetrieval(saved, new Date(received));
  assert.equal(dataUpdateStatus(plan.lastSuccessfulRetrievalAt, 'ready', received).state, 'fresh');
  assert.equal(dataUpdateStatus(planFlightRetrieval([], new Date(received)).lastSuccessfulRetrievalAt, 'ready', received).state, 'unknown');
});

function fixture() {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/DataUpdateIndicator.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
  }).outputText;
  let presentation: ReturnType<typeof createSessionPresentation> | undefined;
  const react = { createElement: (type: unknown, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }),
    useMemo: (make: () => ReturnType<typeof createSessionPresentation>) => presentation ??= make() };
  const modules: Record<string, unknown> = {
    react: { default: react, ...react }, 'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (v: unknown) => v } },
    './theme': { Label: 'Label', colors: { muted: '#adbed5' } }, './SyncProgress':{SyncShine:'SyncShine'},'./SymbolIcon': { SymbolIcon: 'SymbolIcon' }, './data-freshness': { dataFreshness, dataUpdateStatus },
    './data-update-presentation': { createSessionPresentation },
  };
  const exports: any = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return exports.DataUpdateIndicator as (props: Record<string, unknown>) => any;
}
const text = (node: any): string => typeof node === 'string' ? node : (node?.children ?? []).map(text).join(' ').replace(/\s+/g, ' ');
const context = { accountNumber: '123', clubLabel: 'Synthetic', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const proof: ConnectionState = { phase: 'observed', confirmed: true, observed: context, lastCheckedAt: at };

test('header visibly shows saved age and retains one accessible sync action', () => {
  const render = fixture();
  let calls = 0;
  for (const disabled of [false, true]) {
    const tree = render({ receivedAt: at, readState: 'ready', now: received + 3_600_000, disabled, onPress: () => calls++ });
    assert.match(tree.props.accessibilityLabel, /^Daten synchronisieren\./);
    assert.ok(tree.props.accessibilityLabel.includes(new Date(received).toLocaleString('de-DE')));
    assert.match(tree.props.accessibilityHint, /Falls nötig.*Anmeldung/);
    assert.equal(tree.props.disabled, disabled);
    assert.equal(tree.props.accessibilityState.disabled, disabled);
    assert.match(text(tree), /Daten.*vor 1 Std\./);
    if (!disabled) tree.props.onPress();
  }
  assert.equal(calls, 1);
});

test('a real session recheck keeps its bounded display proof without restoring authorization', () => {
  const display = createSessionPresentation(), session = new ConnectionSession();
  session.restoreAssociation(context);
  session.start('initial'); session.observe('initial', context, at);
  assert.equal(display('owner/store/123', session.state, received).state, 'connected');
  for (const minute of [1, 2]) {
    const now = received + minute * 60_000;
    session.start(`check-${minute}`);
    assert.equal(session.state.confirmed, false);
    assert.equal(display('owner/store/123', session.state, now).state, 'connected');
    assert.equal(session.state.confirmed, false, 'Presentation must never grant controller authorization');
    session.observe(`check-${minute}`, context, new Date(now).toISOString());
    assert.equal(display('owner/store/123', session.state, now).state, 'connected');
  }
});

test('checking alone, prior unconfirmed evidence, invalid time and expired proof cannot claim login', () => {
  const checking: ConnectionState = { ...proof, phase: 'checking', confirmed: false };
  assert.equal(createSessionPresentation()('scope', checking, received).state, 'unknown');
  const display = createSessionPresentation();
  display('scope', { ...proof, confirmed: false }, received);
  assert.equal(display('scope', checking, received).state, 'unknown');
  for (const now of [received - 1, received + 90_000, NaN]) {
    const display = createSessionPresentation(); display('scope', proof, received);
    assert.equal(display('scope', checking, now).state, 'unknown');
  }
  for (const lastCheckedAt of [null, 'invalid', at.replace('.000Z', 'Z')]) {
    assert.equal(createSessionPresentation()('scope', { ...proof, lastCheckedAt }, received).state, 'unknown');
  }
});

test('scope, club, timestamp and terminal state changes revoke cached session display', () => {
  const checking: ConnectionState = { ...proof, phase: 'checking', confirmed: false };
  for (const state of ['unknown', 'disconnected', 'error', 'mismatch', 'login-required'] as const) {
    const display = createSessionPresentation(); display('scope', proof, received);
    assert.notEqual(display('scope', { ...proof, phase: state }, received).state, 'connected');
    assert.equal(display('scope', checking, received).state, 'unknown');
  }
  for (const changed of [
    { ...checking, observed: { ...context, clubLabel: 'Other club' } },
    { ...checking, observed: { ...context, accountNumber: '456' } },
    { ...checking, lastCheckedAt: new Date(received + 1).toISOString() },
  ]) {
    const display = createSessionPresentation(); display('scope', proof, received);
    assert.equal(display('scope', changed, received + 2).state, 'unknown');
  }
  for (const scope of ['other-owner/store/123', 'owner/other-store/123', 'owner/store/456', null]) {
    const display = createSessionPresentation(); display('owner/store/123', proof, received);
    assert.equal(display(scope, checking, received).state, 'unknown');
  }
});

test('amber advice starts strictly after 72 hours and can coexist with a green login', () => {
  const render = fixture(), now = received + DATA_FRESHNESS_REMINDER_MS;
  const currentProof = { ...proof, lastCheckedAt: new Date(now).toISOString() };
  const props = { scopeKey: 'owner/store/123', connection: currentProof, receivedAt: at, readState: 'ready', onPress() {} };
  assert.doesNotMatch(render({ ...props, now }).props.accessibilityLabel, /Synchronisieren empfohlen/);
  const tree = render({ ...props, now: now + 1 });
  assert.match(tree.props.accessibilityLabel, /Angemeldet.*Synchronisieren empfohlen/);
  assert.match(text(tree), /vor 3 Tg\. !/);
  assert.match(text(tree), /Daten ✓/);
  const loggedOut = render({ ...props, now: now + 1, connection: { ...currentProof, phase: 'login-required' } });
  assert.match(loggedOut.props.accessibilityLabel, /Anmeldung erforderlich.*Synchronisieren empfohlen/);
  assert.match(text(loggedOut), /→.*vor 3 Tg\. !/);
});

test('quick activity uses amber guidance while keeping fresh saved age and session evidence independent', () => {
  const render = fixture(), now = received + 60_000;
  const tree = render({ scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, activityChanged: true, onPress() {} });
  assert.match(text(tree), /Daten ✓ vor 1 Min\. Änderungen möglich/);
  assert.match(tree.props.accessibilityLabel, /Änderungen möglich/);
  assert.doesNotMatch(tree.props.accessibilityLabel, /Synchronisieren empfohlen|älter als drei Tage/);
  assert.ok(tree.children[0].props.style.some((style: any) => style?.borderColor === '#ffc477'));
});

test('quick activity and stale saved age announce both amber reasons', () => {
  const render = fixture(), now = received + DATA_FRESHNESS_REMINDER_MS + 1;
  const tree = render({ scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, activityChanged: true, onPress() {} });
  assert.match(text(tree), /Daten ✓ vor 3 Tg\. ! Änderungen möglich/);
  assert.match(tree.props.accessibilityLabel, /Änderungen möglich.*Synchronisieren empfohlen: Flugdaten älter als drei Tage/);
  assert.ok(tree.children[0].props.style.some((style: any) => style?.borderColor === '#ffc477'));
});

test('activity defaults off and explicit false preserves the ordinary fresh header', () => {
  const render = fixture(), now = received + 60_000;
  const props = { scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, onPress() {} };
  const defaultTree = render(props), falseTree = render({ ...props, activityChanged: false });
  assert.equal(text(defaultTree), text(falseTree));
  assert.equal(defaultTree.props.accessibilityLabel, falseTree.props.accessibilityLabel);
  assert.match(text(falseTree), /Daten ✓ vor 1 Min\./);
  assert.doesNotMatch(text(falseTree), /Änderungen möglich/);
  assert.equal(defaultTree.children[0].props.style.some((style: any) => style?.borderColor === '#ffc477'), false);
});

test('rendering a newly received proof uses current wall time between timer ticks', () => {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/use-start-clock.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText;
  let now = received;
  const exports: any = {};
  const modules: Record<string, unknown> = { react: { useState: () => [received, () => {}], useEffect() {} },
    'react-native': {}, 'expo-crypto': {}, 'expo-secure-store': {}, './start-clock': { nextStartBoundary } };
  class Clock extends Date { static now() { return now; } }
  runInNewContext(source, { exports, Date: Clock, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  assert.equal(exports.useStartClock([]), received);
  now += 12_000;
  assert.equal(exports.useStartClock([]), now, 'A status-triggered render must not reuse the last timer tick');
});

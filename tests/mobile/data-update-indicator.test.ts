import test from 'node:test';
import { syncStatus } from '../../apps/platform-lab/src/mobile/sync-status.ts';
import { idleSyncProgress } from '../../apps/platform-lab/src/mobile/sync-progress.ts';
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
    react: { default: react, ...react }, 'react-native': { Pressable: 'Pressable', Text:'Text', View: 'View', StyleSheet: { create: (v: unknown) => v } },
    './theme': { Label: 'Label', colors: { muted: '#adbed5' }, ui:{headerAction:{width:48,height:48}} }, './SyncProgress':{SyncActivityIndicator:'SyncActivityIndicator'}, './StatusBadge':{StatusBadge:'StatusBadge'}, './sync-status':{syncStatus}, './sync-progress':{idleSyncProgress},'./SymbolIcon': { SymbolIcon: 'SymbolIcon' }, './data-freshness': { dataFreshness, dataUpdateStatus },
    './data-update-presentation': { createSessionPresentation },
  };
  const exports: any = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  return exports.DataUpdateIndicator as (props: Record<string, unknown>) => any;
}
const text = (node: any): string => typeof node === 'string' ? node : (node?.children ?? []).map(text).join(' ').replace(/\s+/g, ' ');
const context = { accountNumber: '123', clubLabel: 'Synthetic', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;

test('icon-only active sync blocks duplicate taps and preserves accessible activity/age',()=>{
 const render=fixture(),button=render({scopeKey:'scope',receivedAt:at,readState:'ready',now:received+60000,syncing:true,onPress(){assert.fail('disabled');}});
 assert.doesNotMatch(text(button),/Lädt|Sync/);assert.match(button.props.accessibilityLabel,/Synchronisierung läuft/);assert.match(button.props.accessibilityLabel,/22/);
 assert.equal(button.props.accessibilityState.busy,true);assert.equal(button.props.disabled,true);
 assert.match(button.props.accessibilityLabel,/Daten synchronisieren/);
});
const proof: ConnectionState = { phase: 'observed', confirmed: true, observed: context, lastCheckedAt: at };

test('header keeps age in its accessible sync action without visible text', () => {
  const render = fixture();
  let calls = 0;
  for (const disabled of [false, true]) {
    const tree = render({ receivedAt: at, readState: 'ready', now: received + 3_600_000, disabled, onPress: () => calls++ });
    assert.match(tree.props.accessibilityLabel, /^Daten synchronisieren\./);
    assert.ok(tree.props.accessibilityLabel.includes(new Date(received).toLocaleString('de-DE')));
    assert.match(tree.props.accessibilityHint, /Falls nötig.*Anmeldung/);
    assert.equal(tree.props.disabled, disabled);
    assert.equal(tree.props.accessibilityState.disabled, disabled);
    assert.doesNotMatch(text(tree), /Sync|Lädt/);
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
  assert.match(tree.props.accessibilityLabel, /Synchronisieren empfohlen.*Angemeldet/);
  assert.doesNotMatch(text(tree), /Sync|Lädt/);
  assert.match(tree.props.accessibilityLabel, /Angemeldet/);
  const loggedOut = render({ ...props, now: now + 1, connection: { ...currentProof, phase: 'login-required' } });
  assert.match(loggedOut.props.accessibilityLabel, /Synchronisieren empfohlen.*Anmeldung erforderlich/);
  assert.match(loggedOut.props.accessibilityLabel, /Anmeldung erforderlich/);
});

test('quick activity uses amber guidance while keeping fresh saved age and session evidence independent', () => {
  const render = fixture(), now = received + 60_000;
  const tree = render({ scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, activityChanged: true, onPress() {} });
  assert.doesNotMatch(text(tree), /Sync|Lädt/);
  assert.match(tree.props.accessibilityLabel, /Änderungen möglich/);
  assert.doesNotMatch(tree.props.accessibilityLabel, /Synchronisieren empfohlen|älter als drei Tage/);
  assert.ok(tree.children.flat().some((node:any)=>node?.props?.testID==='sync-status-badge'));
});

test('quick activity and stale saved age announce both amber reasons', () => {
  const render = fixture(), now = received + DATA_FRESHNESS_REMINDER_MS + 1;
  const tree = render({ scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, activityChanged: true, onPress() {} });
  assert.doesNotMatch(text(tree), /Sync|Lädt/);
  assert.match(tree.props.accessibilityLabel, /Änderungen möglich.*Synchronisieren empfohlen: Flugdaten älter als drei Tage/);
  assert.ok(tree.children.flat().some((node:any)=>node?.props?.testID==='sync-status-badge'));
});

test('activity defaults off and explicit false preserves the ordinary fresh header', () => {
  const render = fixture(), now = received + 60_000;
  const props = { scopeKey: 'owner/store/123', connection: { ...proof, lastCheckedAt: new Date(now).toISOString() }, receivedAt: at, readState: 'ready', now, onPress() {} };
  const defaultTree = render(props), falseTree = render({ ...props, activityChanged: false });
  assert.equal(text(defaultTree), text(falseTree));
  assert.equal(defaultTree.props.accessibilityLabel, falseTree.props.accessibilityLabel);
  assert.doesNotMatch(text(falseTree), /Sync|Lädt/);
  assert.doesNotMatch(text(falseTree), /Änderungen möglich/);
  assert.equal(defaultTree.children.flat().find((node:any)=>node?.props?.testID==='sync-status-badge').props.mark,'✓');
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


test('partial-sync attention keeps accessible session proof without a tiny visible session mark',()=>{
 const tree=fixture()({scopeKey:'scope',connection:proof,receivedAt:at,readState:'ready',now:received,incomplete:true,onPress(){}});
 assert.match(tree.props.accessibilityLabel,/Teilweise aktualisiert.*Angemeldet/);
 assert.ok(tree.children.flat().some((n:any)=>n?.props?.testID==='sync-status-badge'));
 assert.equal(tree.children.flat().find((n:any)=>n?.props?.testID==='sync-status-badge').props.mark,'!');assert.doesNotMatch(text(tree),/✓|→|\?|Sync|Lädt/);assert.equal(tree.props.disabled,false);
});

test('local read failure retains the verified receipt age and explicitly announces the read problem',()=>{
 const now=received+4*86_400_000;
 const status=dataUpdateStatus(at,'failed',now);
 assert.equal(status.caption,dataUpdateStatus(at,'ready',now).caption);
 assert.match(status.description,/22.*nicht erneut gelesen.*Frühere Daten bleiben erhalten/);
 const button=fixture()({receivedAt:at,readState:'failed',now,onPress(){}});
 assert.match(button.props.accessibilityLabel,/nicht erneut gelesen/);
});

test('attention is visible for never, invalid and unreadable data and suppressed during actual work',()=>{
 const render=fixture();
 for(const props of [{receivedAt:null,readState:'ready'},{receivedAt:'invalid',readState:'ready'},{receivedAt:at,readState:'failed'},{receivedAt:at,readState:'ready',incomplete:true}]){
   const button=render({...props,now:received,onPress(){}});
   const mark=button.children.flat().find((n:any)=>n?.props?.testID==='sync-status-badge');
   assert.equal(mark.props.mark,props.readState==='failed'||props.incomplete?'!':'?');
   const busy=render({...props,now:received,syncing:true,onPress(){}});
   assert.equal(busy.children.flat().find((n:any)=>n?.props?.testID==='sync-status-badge').props.mark,'');
   assert.equal(busy.props.accessibilityState.busy,true);
 }
 assert.doesNotMatch(text(render({receivedAt:null,readState:'loading',now:received,onPress(){}})),/!/);
});

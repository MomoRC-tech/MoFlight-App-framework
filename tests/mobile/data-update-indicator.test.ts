import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dataUpdateStatus, DATA_UPDATE_FRESH_MS } from '../../apps/platform-lab/src/mobile/data-freshness.ts';
import { nextStartBoundary } from '../../apps/platform-lab/src/mobile/start-clock.ts';
import { planFlightRetrieval } from '../../apps/platform-lab/src/vereinsflieger/retrieval-policy.ts';

const at = '2026-10-22T12:00:00.000Z', received = Date.parse(at);
test('data age switches from green to older exactly one hour after the saved retrieval', () => {
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

test('update control labels the action and saved time, with an explicit login-if-needed hint', () => {
  const source = ts.transpileModule(readFileSync(new URL('../../apps/platform-lab/src/mobile/DataUpdateIndicator.tsx', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: false },
  }).outputText;
  const react = { createElement: (type: unknown, props: any, ...children: any[]) => ({ type, props: props ?? {}, children }) };
  const modules: Record<string, unknown> = {
    react: { default: react }, 'react-native': { Pressable: 'Pressable', View: 'View', StyleSheet: { create: (v: unknown) => v } },
    './theme': { Label: 'Label', colors: { muted: '#adbed5' } }, './SymbolIcon': { SymbolIcon: 'SymbolIcon' }, './data-freshness': { dataUpdateStatus },
  };
  const exports: any = {};
  runInNewContext(source, { exports, require: (name: string) => { assert.ok(name in modules, name); return modules[name]; } });
  let calls = 0;
  for (const disabled of [false, true]) {
    const tree = exports.DataUpdateIndicator({ receivedAt: at, readState: 'ready', now: received, disabled, onPress: () => calls++ });
    assert.match(tree.props.accessibilityLabel, /Bei Vereinsflieger anmelden/);
    assert.ok(tree.props.accessibilityLabel.includes(new Date(received).toLocaleString('de-DE')));
    assert.match(tree.props.accessibilityHint, /Falls nötig.*Anmeldung/);
    assert.equal(tree.props.disabled, disabled);
    assert.equal(tree.props.accessibilityState.disabled, disabled);
    if (!disabled) tree.props.onPress();
  }
  assert.equal(calls, 1);
  const proof={phase:'observed',confirmed:true,observed:{accountNumber:'123'},lastCheckedAt:at};
  for(const [connection,now,green] of [
    [undefined,received,false],[proof,received,true],[proof,received+90_000,false],
    [{...proof,confirmed:false},received,false],[{...proof,phase:'error'},received,false],
    [{...proof,phase:'login-required'},received,false],[{...proof,phase:'checking'},received,false],
  ] as const){
    const tree=exports.DataUpdateIndicator({connection,receivedAt:at,readState:'ready',now,onPress(){}});
    assert.equal(tree.children[0].children[1].children[1].props.style[1].color,green?'#74dfba':'#adbed5');
    assert.equal(tree.props.accessibilityLabel.startsWith('Daten synchronisieren'),green);
    assert.equal(tree.children[0].children[1].children[1].children[0],green?'synchronisieren':connection?.phase==='checking'?'Verbinden …':'Anmelden');
    assert.ok(tree.props.accessibilityLabel.includes(dataUpdateStatus(at,'ready',now).description));
  }
});

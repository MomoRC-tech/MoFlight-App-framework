import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionSession, connectionLabel, retrievalFailureHint } from '../../apps/platform-lab/src/vereinsflieger/connection-state.ts';

const context = { accountNumber: '123', clubLabel: 'Synthetic Club', clubIdentity: 'display-label-only', verification: 'observed-profile-number' } as const;
const at = '2026-10-17T12:00:00.000Z';
const later = '2026-10-17T12:10:00.000Z';

test('retrieval failure feedback distinguishes protected-view failures without exposing arbitrary provider content', () => {
  const unsupported = 'Original view could not be read: provider filter controls are unsupported. No export settings changed.';
  assert.match(retrievalFailureHint(unsupported), /Filter/);
  assert.match(retrievalFailureHint(unsupported), /nicht geändert/);
  assert.match(retrievalFailureHint('Export step timed out. Previous captures preserved; retry after checking provider login.'), /zu lange/);
  assert.equal(retrievalFailureHint(unsupported + ' Original provider view restored and verified.'), retrievalFailureHint(unsupported));
  assert.match(retrievalFailureHint('Synthetic failure. Original view restoration is pending. Sign into the original account and retry restoration.'), /noch nicht wiederhergestellt/);
  const fallback = retrievalFailureHint('unknown');
  for (const privateValue of ['PRIVATE ACCOUNT / password / https://example.test/?token=secret', '__proto__', 'constructor', 'toString']) {
    assert.equal(retrievalFailureHint(privateValue), fallback);
  }
});

test('connection requires owned context observation and deliberate provisional association', () => {
  const session = new ConnectionSession();
  assert.equal(connectionLabel(session.state), 'Nicht verbunden');
  assert.equal(session.confirm(), false);
  assert.equal(session.start(''), false);
  assert.equal(session.start('check'), true);
  assert.equal(session.start('other'), false);
  assert.equal(session.owns('check'), true);
  assert.equal(session.state.phase, 'checking');
  assert.equal(session.state.lastCheckedAt, null);
  assert.equal(session.observe('forged', context, at), false);
  assert.equal(session.state.phase, 'checking');
  assert.equal(session.observe('check', context, at), true);
  assert.equal(session.state.confirmed, false);
  assert.match(connectionLabel(session.state), /Zuordnung prüfen/);
  assert.equal(session.confirm(), true);
  assert.match(connectionLabel(session.state), /vorläufig/);
  assert.equal(session.state.confirmed, true);
  assert.equal(session.observe('check', context, later), false);
  assert.equal(session.state.lastCheckedAt, at);
  assert.equal('lastSuccessfulCaptureAt' in session.state, false);
});

test('malformed context, cookie-like evidence and invalid timestamps never establish a session', () => {
  for (const [input, time] of [[{ cookie: true }, at], [{ ...context, accountNumber: '../123' }, at], [{ ...context, verification: 'cookie' }, at], [context, '2026-02-30T12:00:00.000Z']] as const) {
    const session = new ConnectionSession();
    session.start('check');
    assert.equal(session.observe('check', input, time), false);
    assert.equal(session.state.phase, 'error');
    assert.equal(session.state.confirmed, false);
    assert.equal(session.state.lastCheckedAt, null);
    assert.equal(session.owns('check'), false);
  }
});

test('cancel invalidates late results without losing prior informational check', () => {
  const session = new ConnectionSession();
  session.cancel();
  assert.equal(session.state.phase, 'disconnected');
  session.start('initial'); session.observe('initial', context, at); session.confirm();
  session.start('cancelled'); session.cancel();
  assert.equal(session.state.phase, 'unknown');
  assert.equal(session.state.confirmed, false);
  assert.equal(session.state.lastCheckedAt, at);
  assert.equal(session.observe('cancelled', context, later), false);
  assert.equal(session.fail('cancelled', 'error'), false);
  session.start('new');
  assert.equal(session.observe('cancelled', context, later), false);
  assert.equal(session.owns('new'), true);
  assert.equal(session.observe('new', context, later), true);
  assert.equal(session.state.confirmed, true);
});

test('account and club mismatches stay blocked across invalidation and cannot be confirmed', () => {
  for (const changed of [{ ...context, accountNumber: '456' }, { ...context, clubLabel: 'Another Club' }]) {
    const session = new ConnectionSession();
    session.start('initial'); session.observe('initial', context, at); session.confirm();
    session.invalidate(); session.start('recheck');
    assert.equal(session.observe('recheck', changed, later), false);
    assert.equal(session.state.phase, 'mismatch');
    assert.equal(session.state.confirmed, false);
    assert.equal(session.confirm(), false);
    session.start('original'); session.observe('original', context, later);
    assert.equal(session.state.confirmed, true);
  }
});

test('failed checks retain only informational evidence and state snapshots cannot mutate ownership', () => {
  const session = new ConnectionSession();
  session.start('initial'); session.observe('initial', context, at); session.confirm();
  const snapshot = session.state;
  snapshot.observed!.accountNumber = '999'; snapshot.phase = 'error';
  assert.equal(session.state.observed!.accountNumber, context.accountNumber);
  assert.equal(session.state.phase, 'observed');
  session.start('expired');
  assert.equal(session.fail('foreign', 'login-required'), false);
  assert.equal(session.fail('expired', 'login-required'), true);
  assert.equal(session.state.confirmed, false);
  assert.equal(session.state.lastCheckedAt, at);
  assert.equal(session.confirm(), false);
  assert.equal(connectionLabel(session.state), 'Anmeldung erforderlich');
  session.start('network'); session.fail('network', 'error');
  assert.equal(session.state.lastCheckedAt, at);
});

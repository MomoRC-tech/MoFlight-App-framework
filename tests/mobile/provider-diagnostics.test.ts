import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { diagnosticJournal } from '../../apps/platform-lab/src/diagnostics.ts';
import { loginDiagnosticScript, readLoginDiagnostic, recordProviderDocument } from '../../apps/platform-lab/src/vereinsflieger/provider-diagnostics.ts';

const login = 'https://vereinsflieger.de/';
for (const documentUrl of [login, 'https://vereinsflieger.de/member/profile/viewprofile']) test(`login observations leave credentials and submission alone at ${new URL(documentUrl).pathname}`, () => {
  const events = new Map<string, ((event?: any) => void)[]>(), messages: string[] = [];
  const form = { addEventListener(name: string, listener: (event?: any) => void) { events.set(name, [...events.get(name) ?? [], listener]); } };
  const field = () => ({ form, get value(): never { throw new Error('Credential read'); } });
  const user = field(), password = field(), button = { form };
  const window: any = { ReactNativeWebView: { postMessage: (data: string) => messages.push(data) },
    addEventListener: (name: string, listener: () => void) => events.set(name, [listener]) };
  window.top = window;
  const environment = { window, location: new URL(documentUrl), document: {
    querySelector: (selector: string) => selector === 'form#signin' ? form : selector.includes('name="user"') ? user : password,
    get cookie(): never { throw new Error('Cookie read'); },
  } };
  runInNewContext(loginDiagnosticScript(4), environment);
  const secret = 'private-user@example.test SECRET-PASSWORD';
  events.get('input')![0]!({ target: user, data: secret });
  events.get('change')![0]!({ target: password, data: secret });
  events.get('click')![0]!({ target: { closest: () => button } });
  let prevented = false;
  events.get('submit')![0]!({ preventDefault: () => { prevented = true; } });
  events.get('pagehide')![0]!();
  assert.equal(prevented, false, 'Observations do not intercept provider submission');
  assert.deepEqual(messages.map(data => JSON.parse(data).event), ['provider-login-ready', 'provider-login-input', 'provider-login-change', 'provider-login-click', 'provider-login-submit', 'provider-login-exit']);
  assert.ok(!messages.join('').includes(secret));
  runInNewContext(loginDiagnosticScript(5), environment);
  assert.equal(events.get('input')!.length, 1, 'Duplicate native finishes do not duplicate listeners');
  events.get('input')![0]!({ target: user });
  assert.equal(JSON.parse(messages.at(-1)!).document, 5);
  for (let n = 0; n < 100; n++) events.get('input')![0]!({ target: user });
  assert.equal(messages.length, 32, 'Document observations are bounded');
});

test('diagnostic bridge rejects foreign/stale/malformed data and persists fixed categories only', () => {
  const message = JSON.stringify({ kind: 'vf-login-diagnostic-v1', document: 7, url: login, event: 'provider-login-submit', private: 'SECRET' });
  assert.equal(readLoginDiagnostic(login, login, message, 7), 'provider-login-submit');
  for (const [source, current, data, token] of [
    ['https://foreign.test/', login, message, 7], [login, login, message, 8],
    [login, 'https://vereinsflieger.de/member/index.php', message, 7],
    [login, login, '{', 7], [login, login, 'x'.repeat(513), 7],
    [login, login, message.replace('provider-login-submit', 'SECRET'), 7],
  ] as const) assert.equal(readLoginDiagnostic(source, current, data, token), null);
  diagnosticJournal.clear();
  recordProviderDocument('start', 'https://vereinsflieger.de/member/index.php?account=SECRET#SECRET');
  recordProviderDocument('command', 'https://user:SECRET@foreign.test/SECRET');
  assert.deepEqual(diagnosticJournal.journey().filter(e => e.kind === 'provider').map(e => e.target), ['provider-start-member', 'provider-command-other']);
  assert.ok(!diagnosticJournal.export().includes('SECRET'));
  assert.ok(!diagnosticJournal.export().includes('https:'));
});

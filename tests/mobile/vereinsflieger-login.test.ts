import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { loginPage, savedLoginScript, validateLogin } from '../../apps/platform-lab/src/vereinsflieger/login.ts';

const example = { username: 'example-pilot', password: ' synthetic "\\ password\n ' };
function run(url: string, options: { action?: string; iframe?: boolean; ambiguous?: boolean; method?: string } = {}) {
  const written: Record<string, string> = {}, events: string[] = []; let reads = 0, submitted = 0;
  const form = { method: options.method ?? 'post', getAttribute: () => options.action ?? '' };
  const input = (name: string, type: string) => ({ form, type,
    get value(): string { throw new Error('Existing credential values must not be read'); },
    set value(value: string) { written[name] = value; }, dispatchEvent: (event: { type: string }) => events.push(name + ':' + event.type) });
  const user = input('user', 'text'), password = input('password', 'password');
  const button = { form, click: () => { submitted++; } };
  const document = { querySelectorAll: (selector: string) => {
    reads++; return selector === 'input[name="user"]' ? options.ambiguous ? [user, user] : [user] : selector === 'input[name="pwinput"]#pwinput' ? [password] : selector === 'button#submitbtn' ? [button] : assert.fail('Unapproved DOM access');
  } };
  const window: { top?: unknown } = {}; window.top = options.iframe ? {} : window;
  runInNewContext(savedLoginScript(example), { window, document, location: { href: url }, URL, Event: class { constructor(readonly type: string) {} } });
  return { written, events, reads, submitted };
}
test('saved login uses the exact observed original form and original submit handler without reading website credentials', () => {
  const result = run('https://vereinsflieger.de/');
  assert.deepEqual(result.written, { user: example.username, password: example.password });
  assert.deepEqual(result.events, ['user:input', 'user:change', 'password:input', 'password:change']);
  assert.equal(result.submitted, 1);
});
test('saved credentials are never written on unrelated hosts, non-login pages, frames, ambiguous forms or external actions', () => {
  for (const url of ['http://vereinsflieger.de/', 'https://vereinsflieger.de.evil.test/', 'https://vereinsflieger.de/member/profile/flightlog.php', 'https://vereinsflieger.de/?redirect=other']) {
    const result = run(url); assert.equal(result.reads, 0); assert.equal(result.submitted, 0); assert.deepEqual(result.written, {});
  }
  for (const options of [{ iframe: true }, { ambiguous: true }, { method: 'get' }, { action: 'https://evil.test/' }, { action: '/different.php' }]) {
    const result = run('https://vereinsflieger.de/', options); assert.equal(result.submitted, 0); assert.deepEqual(result.written, {});
  }
});
test('explicit app login validation preserves password bytes and bounds device storage without exposing supplied values in errors', () => {
  assert.equal(validateLogin({ ...example, username: ' example-pilot ' }).username, example.username);
  assert.equal(validateLogin(example).password, example.password);
  assert.equal(validateLogin({ username: 'example', password: '😀'.repeat(120) }).password, '😀'.repeat(120));
  for (const input of [{ username: '', password: 'example' }, { username: 'example', password: '' }, { username: 'x'.repeat(255), password: 'example' }, { username: 'example', password: 'x'.repeat(257) }, { username: '\0'.repeat(254), password: '\0'.repeat(256) }]) assert.throws(() => validateLogin(input));
  assert.equal(loginPage('https://vereinsflieger.de/'), true);
  assert.equal(loginPage('https://vereinsflieger.de.evil.test/'), false);
});

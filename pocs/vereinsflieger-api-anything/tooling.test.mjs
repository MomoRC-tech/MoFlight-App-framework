import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertReadOnly, assertSharingOff, toolEnv, privateHome } from './tooling.mjs';

test('research entry rejects writes, publishing, logout and broad setup', () => {
  for (const args of [['mcp', '--allow-writes'], ['mcp', '--allow-writes=true'],
    ['add', 'site', 'op', '--write'], ['publish', 'site'], ['logout', 'site'],
    ['setup', '--yes'], ['setup', '--no-share']]) {
    assert.throws(() => assertReadOnly(args));
  }
});
test('read server and settings-only opt-out remain available', () => {
  for (const args of [['mcp'], ['capture', 'https://example.com'],
    ['setup', '--no-share', '--share-only']]) assert.doesNotThrow(() => assertReadOnly(args));
});
test('missing, corrupt or enabled sharing is refused before provider use', () => {
  for (const settings of [{}, { share: false }, { share: true, askedAt: 'date' }]) {
    assert.throws(() => assertSharingOff(settings));
  }
  assert.doesNotThrow(() => assertSharingOff({ share: false, askedAt: 'date' }));
});
test('launcher always uses the project private home', () => {
  const previous = process.env.API_ANYTHING_HOME;
  try {
    process.env.API_ANYTHING_HOME = 'foreign-home';
    assert.equal(toolEnv().API_ANYTHING_HOME, privateHome);
  } finally {
    if (previous === undefined) delete process.env.API_ANYTHING_HOME;
    else process.env.API_ANYTHING_HOME = previous;
  }
});

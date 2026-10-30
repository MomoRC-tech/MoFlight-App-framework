import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { requireTool, toolEnv } from './tooling.mjs';
import { authenticatedFlightPage, flightUrl, readCredentialPacket, waitForLoginReady } from './provider-contract.mjs';

const valid = { loginControls: 0, tables: 1, accountLabel: 'Synthetic owner',
  headers: ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'] };
test('HTTP-200 login pages, missing identity/table/headers and foreign routes cannot promote a session', () => {
  for (const observation of [{ ...valid, loginControls: 1 }, { ...valid, tables: 0 },
    { ...valid, tables: 2 }, { ...valid, accountLabel: '' }, { ...valid, headers: ['Datum'] }]) {
    assert.throws(() => authenticatedFlightPage(flightUrl, observation));
  }
  for (const url of ['https://foreign.invalid/member/profile/flightlog.php',
    'http://vereinsflieger.de/member/profile/flightlog.php', flightUrl + '?foreign=1',
    'https://vereinsflieger.de/member/overview/overview']) {
    assert.throws(() => authenticatedFlightPage(url, valid));
  }
});
test('same-account proof is stable and another account is refused', () => {
  const digest = authenticatedFlightPage(flightUrl, valid);
  assert.equal(authenticatedFlightPage(flightUrl, valid, digest), digest);
  assert.throws(() => authenticatedFlightPage(flightUrl, { ...valid, accountLabel: 'Another synthetic owner' }, digest));
});
test('credential input accepts only bounded synthetic username/password packets', () => {
  assert.deepEqual(readCredentialPacket('{"username":"fixture","password":"synthetic-only"}'),
    { username: 'fixture', password: 'synthetic-only' });
  for (const text of ['{}', '{"username":"fixture","password":""}',
    '{"username":"fixture","password":"fixture","url":"https://foreign.invalid"}', 'x'.repeat(8193)]) {
    assert.throws(() => readCredentialPacket(text));
  }
});

const executable = toolEnv().API_ANYTHING_BROWSER;
test('waits for the original page to enable login and refuses a permanently disabled button',
  { skip: !executable || !existsSync(executable) }, async () => {
    const { chromium } = createRequire(requireTool.resolve('api-anything'))('playwright-core');
    const browser = await chromium.launch({ executablePath: executable, headless: true, chromiumSandbox: true });
    try {
      const page = await browser.newPage();
      await page.setContent('<button id="submitbtn" disabled>Sign in</button>');
      await assert.rejects(waitForLoginReady(page, 100));
      assert(await page.locator('#submitbtn').isDisabled());
      await page.evaluate(() => {
        setTimeout(() => {
          document.querySelector('#submitbtn').disabled = false;
          window.providerReady = true;
        }, 100);
      });
      await waitForLoginReady(page, 2000);
      assert.equal(await page.evaluate(() => window.providerReady), true);
    } finally {
      await browser.close();
    }
  });

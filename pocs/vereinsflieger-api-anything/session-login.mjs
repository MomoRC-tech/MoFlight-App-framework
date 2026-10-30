// Launch through dpapi-login.ps1. Credentials travel through an anonymous stdin pipe only.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { savedLoginScript } from '../../apps/platform-lab/src/vereinsflieger/login.ts';
import { probeScript, decodeProbe } from '../../apps/platform-lab/src/vereinsflieger/probe.ts';
import { cli, requireTool, toolEnv, privateHome, checkSettings } from './tooling.mjs';
import { loginUrl, flightUrl, site, authenticatedFlightPage, readCredentialPacket, waitForLoginReady } from './provider-contract.mjs';

let stage = 'settings';
let closeBrowser;
let credentials;
let diagnostic = { navigations: [] };
try {
  checkSettings();
  const env = toolEnv();
  process.env.API_ANYTHING_HOME = env.API_ANYTHING_HOME;
  if (env.API_ANYTHING_BROWSER) process.env.API_ANYTHING_BROWSER = env.API_ANYTHING_BROWSER;
  stage = 'credential-pipe';
  let packet = '';
  process.stdin.setEncoding('utf8');
  for await (const chunk of process.stdin) {
    packet += chunk;
    if (Buffer.byteLength(packet, 'utf8') > 8192) throw new Error('Oversized input');
  }
  credentials = readCredentialPacket(packet);
  packet = '';
  const upstream = file => import(new URL(file, pathToFileURL(cli)).href);
  const browser = await upstream('browser.js');
  const { profileDir } = await upstream('heal.js');
  const { saveSession, loadSession, writePrivate } = await upstream('session.js');
  stage = 'browser';
  // Own this operation's lifetime. Upstream openBrowser closes after three idle seconds
  // unless entered through its internal hold(), which is not exported.
  const upstreamRequire = createRequire(requireTool.resolve('api-anything'));
  const { chromium } = upstreamRequire('playwright-core');
  const context = await chromium.launchPersistentContext(profileDir(), {
    executablePath: browser.browserChoice()?.bin, headless: true, chromiumSandbox: true,
    serviceWorkers: 'block', userAgent: await browser.headlessUserAgent(),
  });
  closeBrowser = () => context.close();
  const savedCookies = loadSession(site).cookies.filter(cookie => cookie.domain.replace(/^\./, '') === site);
  await context.addCookies(savedCookies);
  const page = context.pages()[0] ?? await context.newPage();
  diagnostic.pageErrors = [];
  page.on('pageerror', error => {
    const known = ['md5', 'vfbase', 'inlineDialog', 'checkRequiredFields'].find(name =>
      error.message.includes(name));
    diagnostic.pageErrors.push({ name: error.name, component: known ?? 'other' });
  });
  page.on('response', response => {
    const request = response.request();
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      diagnostic.navigations.push({ method: request.method(), path: new URL(response.url()).pathname, status: response.status() });
    }
  });
  page.setDefaultTimeout(25000);
  page.setDefaultNavigationTimeout(25000);
  // Never submit a navigation POST beyond the exact original login form target.
  await context.route('**/*', route => {
    const request = route.request();
    if (request.isNavigationRequest() && request.method() !== 'GET' &&
        !(request.method() === 'POST' && request.url() === loginUrl)) {
      diagnostic.refusedNavigation = { method: request.method(), path: new URL(request.url()).pathname };
      return route.abort();
    }
    return route.continue();
  });
  const observe = () => page.evaluate(() => {
    const clean = element => (element?.textContent || '').replace(/\s+/g, ' ').trim();
    const table = document.querySelector('#tablelist_20');
    const required = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'];
    const heading = Array.from(table?.rows ?? []).find(row => required.every(label =>
      Array.from(row.cells).some(cell => clean(cell) === label)));
    return { loginControls: document.querySelectorAll('input[name="pwinput"],input[type="password"]').length,
      tables: document.querySelectorAll('#tablelist_20').length,
      accountLabel: clean(document.querySelector('#divpageheadermenu')?.children[1]).replace(/^VEREINSFLIEGER\.DE\s*/, '').trim(),
      headers: Array.from(heading?.cells ?? []).map(clean) };
  });
  const proofPath = join(privateHome, 'vereinsflieger-study/session-proof.json');
  const previous = existsSync(proofPath) ? JSON.parse(readFileSync(proofPath, 'utf8')) : null;
  stage = 'existing-session';
  await page.goto(flightUrl, { waitUntil: 'domcontentloaded' });
  let observation = await observe();
  let submitted = false;
  if (observation.loginControls || !observation.tables) {
    stage = 'original-login';
    await page.goto(loginUrl, { waitUntil: 'load' });
    diagnostic.loginTarget = { origin: new URL(page.url()).origin, path: new URL(page.url()).pathname,
      hasQuery: !!new URL(page.url()).search };
    diagnostic.dependencies = await page.evaluate(() => ({
      hash: typeof window.md5, encryption: typeof window.vfbase?.encrypt,
      validation: typeof window.checkRequiredFields, dialog: typeof window.inlineDialog,
    }));
    if (page.url() !== loginUrl) throw new Error('Unexpected login target');
    stage = 'login-ready';
    // The provider starts with a disabled button and enables it after its own
    // asynchronous challenge completes. Never remove that disabled attribute.
    await waitForLoginReady(page);
    stage = 'login-bridge';
    await page.evaluate(() => { window.ReactNativeWebView = { postMessage: value => { window.__moFlightLoginResult = JSON.parse(value); } }; });
    stage = 'login-script';
    const script = savedLoginScript(credentials, 'api-research');
    stage = 'login-submit';
    const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
    try {
      await page.evaluate(script);
    } catch (error) {
      diagnostic.evaluation = error.name;
      // Navigation can destroy the evaluation context after a successful submit.
      if (!diagnostic.navigations.some(item => item.method === 'POST')) throw error;
    }
    const outcome = await page.evaluate(() => window.__moFlightLoginResult?.result).catch(() => null);
    const allowed = ['submitted', 'wrong-page', 'username-control', 'password-control', 'submit-control',
      'form-binding', 'form-target', 'provider-script-error'];
    diagnostic.loginGuard = allowed.includes(outcome) ? outcome : 'unavailable';
    diagnostic.formState = await page.evaluate(() => ({
      userFilled: !!document.querySelector('input[name="user"]')?.value,
      passwordFilled: !!document.querySelector('input[name="pwinput"]')?.value,
      disabled: !!document.querySelector('#submitbtn')?.disabled,
    })).catch(() => null);
    if (outcome && outcome !== 'submitted') throw new Error('Original login guard refused');
    await navigation;
    submitted = true;
    credentials = null;
    // The original form can perform another redirect after its first document response.
    stage = 'login-result';
    await page.locator('#divpageheadermenu').waitFor({ state: 'attached' });
    stage = 'protected-page';
    await page.goto(flightUrl, { waitUntil: 'domcontentloaded' });
    observation = await observe();
  }
  credentials = null;
  stage = 'account-proof';
  const accountDigest = authenticatedFlightPage(page.url(), observation, previous?.accountDigest);
  stage = 'existing-reader';
  await page.evaluate(() => { window.ReactNativeWebView = { postMessage: value => { window.__moFlightProbe = value; } }; });
  const nonce = 'api-research-' + randomUUID();
  await page.evaluate(probeScript(nonce));
  const raw = await page.evaluate(() => window.__moFlightProbe);
  const capture = decodeProbe(raw, page.url(), nonce, new Date().toISOString());
  stage = 'save-session';
  const cookies = await context.cookies(loginUrl);
  if (!cookies.some(cookie => cookie.name === 'PHPSESSID' && cookie.value)) throw new Error('Missing session');
  // Provider-specific protected-page proof replaces the generic cookie-change heuristic.
  const proof = { version: 1, accountDigest, checkedAt: new Date().toISOString(),
    flightRows: capture.rows.length, submitted, evidence: 'protected-own-flight-page-and-existing-reader' };
  writePrivate(join(privateHome, `vereinsflieger-study/session-history/${nonce}.json`), JSON.stringify({ proof, capture }));
  writePrivate(join(privateHome, 'vereinsflieger-study/initial-reader.json'), JSON.stringify(capture));
  writePrivate(proofPath, JSON.stringify(proof));
  saveSession(site, { cookies, values: {}, source: 'moflight-verified-own-flight-page' }, [flightUrl]);
  console.log(JSON.stringify({ ok: true, stage: 'verified', submitted, flightRows: capture.rows.length, sessionPromoted: true }));
} catch (error) {
  // Never print exceptions, page text, request bodies or credential packets.
  diagnostic = { ...diagnostic, stage, errorName: error.name,
    callsite: /(?:login\.ts|session-login\.mjs):\d+:\d+/.exec(error.stack)?.[0],
    failure: ['Unexpected login target', 'Oversized input', 'Missing session'].includes(error.message)
      ? error.message : error.message.match(/net::ERR_[A-Z_]+/)?.[0] ?? 'other' };
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(join(privateHome, 'vereinsflieger-study'), { recursive: true });
  writeFileSync(join(privateHome, 'vereinsflieger-study/login-diagnostic.json'), JSON.stringify(diagnostic));
  console.log(JSON.stringify({ ok: false, stage, code: 'session-verification-failed', sessionPromoted: false }));
  process.exitCode = 1;
} finally {
  credentials = null;
  await closeBrowser?.();
}

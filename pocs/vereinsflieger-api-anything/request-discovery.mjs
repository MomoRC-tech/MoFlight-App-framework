import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { cli, requireTool, privateHome, toolEnv, checkSettings } from './tooling.mjs';
import { site, flightUrl, authenticatedFlightPage } from './provider-contract.mjs';
import { interceptDateRequest, inspectDateRequest, observedDateForm, viewSnapshot } from './date-discovery.mjs';

const ranges = [
  { from: '2026-01-01', to: '2026-01-31' },
  { from: '2026-02-01', to: '2026-02-28' },
  { from: '2026-03-01', to: '2026-03-31' },
];
let stage = 'settings', closeBrowser, writePrivate, snapshot, before;
let folder, report;
try {
  checkSettings();
  const env = toolEnv();
  process.env.API_ANYTHING_HOME = env.API_ANYTHING_HOME;
  if (env.API_ANYTHING_BROWSER) process.env.API_ANYTHING_BROWSER = env.API_ANYTHING_BROWSER;
  const upstream = name => import(new URL(name, pathToFileURL(cli)).href);
  const browser = await upstream('browser.js');
  closeBrowser = browser.closeBrowser;
  const { capturePage, profileDir, writeGuard } = await upstream('heal.js');
  const session = await upstream('session.js');
  writePrivate = session.writePrivate;
  const { loadSite } = await upstream('store.js');
  const { send } = await upstream('http.js');
  const { parse } = createRequire(requireTool.resolve('api-anything'))('node-html-parser');
  const studyFolder = join(privateHome, 'vereinsflieger-study');
  const proof = JSON.parse(readFileSync(join(studyFolder, 'session-proof.json'), 'utf8'));
  folder = join(studyFolder, 'request-discovery', randomUUID());
  const operation = loadSite(site).site.operations.find(op => op.name === 'ownFlightsVisible');
  assert(operation?.readOnly && operation.request.method === 'GET');
  report = { checkedAt: new Date().toISOString(), engine: 'API Anything capture/runTrigger/writeGuard/send',
    scope: 'observed own-flight frontend only', cases: [], filterRequestsReplayed: 0,
    serverDateSemanticsVerified: false, sharing: false };
  const clean = value => value.replace(/\s+/g, ' ').trim();
  snapshot = async name => {
    const response = await send(operation, {}, session.loadSession(site), { site });
    assert.equal(response.status, 200);
    writePrivate(join(folder, `${name}-http.json`), JSON.stringify(response));
    const document = parse(response.body);
    const children = document.querySelector('#divpageheadermenu')?.childNodes.filter(node => node.nodeType === 1) ?? [];
    const headers = document.querySelectorAll('#tablelist_20 tr').map(row =>
      row.querySelectorAll('th,td').map(cell => clean(cell.text))).find(row =>
      ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'].every(label => row.includes(label)));
    authenticatedFlightPage(response.url, { loginControls: document.querySelectorAll('input[name="pwinput"]').length,
      tables: document.querySelectorAll('#tablelist_20').length,
      accountLabel: clean(children[1]?.text ?? '').replace(/^VEREINSFLIEGER\.DE\s*/, '').trim(), headers }, proof.accountDigest);
    const state = viewSnapshot(document);
    writePrivate(join(folder, `${name}-view.json`), JSON.stringify(state.snapshot));
    return { document, digest: state.digest };
  };
  stage = 'before-account-and-view';
  before = await snapshot('before');
  stage = 'observed-form-contract';
  const document = before.document;
  const initialForm = observedDateForm(document, flightUrl);
  report.form = { method: 'POST', path: '/member/profile/flightlog.php', fields: ['daterange', 'enddate', 'startdate'],
    rangeOptionCount: initialForm.rangeOptionCount, opaqueCommandParameter: '_params' };
  await browser.addCookiesToProfile(session.loadSession(site).cookies, profileDir());
  stage = 'fresh-network-capture';
  const original = await capturePage({ url: flightUrl });
  writePrivate(join(folder, 'original-capture.json'), JSON.stringify(original));
  report.initialNetwork = original.exchanges.map(exchange => ({ method: exchange.request.method,
    path: new URL(exchange.request.url).pathname, resourceType: exchange.resourceType,
    status: exchange.response?.status, contentType: exchange.response?.contentType }));
  report.flightDataJsonRequests = original.exchanges.filter(exchange =>
    ['fetch', 'xhr'].includes(exchange.resourceType) &&
    (exchange.response?.contentType ?? '').includes('json')).length;
  report.knownPaginationControls = document.querySelectorAll('a.pagebrowser').length;
  const packets = [];
  for (const [index, range] of ranges.entries()) {
    stage = `intercept-case-${index + 1}`;
    const result = await interceptDateRequest(browser, writeGuard, flightUrl, profileDir(), range, initialForm.target);
    writePrivate(join(folder, `case-${index + 1}.json`), JSON.stringify(result));
    assert.equal(result.requests.length, 1, 'Exactly one distinct original date-form POST required');
    const runDocument = result.run?.exchanges.find(exchange => exchange.resourceType === 'document' &&
      exchange.request.url === flightUrl && exchange.response?.status === 200);
    assert(runDocument, 'The same-run source document is required to verify the rotating action');
    const currentForm = observedDateForm(parse(runDocument.response.body), flightUrl);
    const schema = inspectDateRequest(result.requests[0], currentForm.target, range);
    packets.push(new URLSearchParams(result.requests[0].body));
    report.cases.push({ case: index + 1, requestCaptured: true, blockedByGuard: true,
      schema, commandDifferentFromInitialPage: currentForm.target !== initialForm.target,
      endedAfterAbort: !!result.errorName });
  }
  assert.equal(new Set(packets.map(body => body.get('startdate'))).size, 3);
  assert.equal(new Set(packets.map(body => body.get('enddate'))).size, 3);
  report.frontendParameterVariationVerified = true;
  stage = 'after-account-and-view';
  const after = await snapshot('after');
  report.accountContinuity = true;
  report.viewPreferencesUnchanged = before.digest === after.digest;
  assert(report.viewPreferencesUnchanged, 'Provider view state changed; no further work should proceed');
  checkSettings();
  report.ok = true;
  report.remaining = ['server handling of date windows and authenticated empty results',
    'pagination beyond the observed view', 'actual expiry/renewal', 'real account/club and native boundaries'];
} catch (error) {
  report = { ...report, ok: false, stage, errorName: error.name,
    callsite: /request-discovery\.mjs:\d+:\d+/.exec(error.stack)?.[0] };
  process.exitCode = 1;
  if (snapshot && before) {
    try {
      const after = await snapshot('after-failure');
      report.accountContinuity = true;
      report.viewPreferencesUnchanged = before.digest === after.digest;
    } catch {
      report.viewPreferencesUnchanged = 'unverified';
    }
  }
} finally {
  if (writePrivate && folder) {
    writePrivate(join(folder, 'report.json'), JSON.stringify(report, null, 2));
    writePrivate(join(privateHome, 'vereinsflieger-study/request-discovery-report.json'), JSON.stringify(report, null, 2));
  }
  await closeBrowser?.();
}
console.log(JSON.stringify(report, null, 2));

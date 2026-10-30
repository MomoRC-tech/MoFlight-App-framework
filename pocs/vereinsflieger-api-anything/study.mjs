// Bounded local-only study. References come exclusively from the verified own-flight reader.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { DETAIL_READER_SOURCE, DETAIL_LABELS, decodeDetail } from '../../apps/platform-lab/src/vereinsflieger/details.ts';
import { cli, launcher, root, requireTool, privateHome, toolEnv, checkSettings } from './tooling.mjs';
import { site, loginUrl, flightUrl, authenticatedFlightPage } from './provider-contract.mjs';

let stage = 'settings';
let closeBrowser;
let context;
async function verifyBoundaries(ids, folder, { loadSite, saveSite, call }) {
  const current = loadSite(site).site;
  const operation = current.operations.find(op => op.name === 'ownFlightDetail');
  assert(operation?.readOnly);
  const parameter = operation.params.find(param => param.name === 'flightId');
  assert(parameter);
  parameter.enum = ids;
  saveSite(current);
  const foreignId = '0'.repeat(20);
  assert(!ids.includes(foreignId));
  const refused = await call(site, operation.name, { flightId: foreignId }, { maxTier: 1 });
  assert(!refused.ok && refused.class === 'input', 'Unobserved numeric ID must be refused before sending');
  const dependencies = createRequire(requireTool.resolve('api-anything'));
  const { Client } = await import(pathToFileURL(dependencies.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
  const { StdioClientTransport } = await import(pathToFileURL(dependencies.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
  const client = new Client({ name: 'moflight-private-study', version: '0.0.0' });
  try {
    await client.connect(new StdioClientTransport({ command: process.execPath,
      args: [launcher, 'mcp'], cwd: root, env: toolEnv(), stderr: 'pipe' }));
    const reply = await client.callTool({ name: 'call_operation', arguments: { site, op: 'ownFlightsVisible', args: {} } });
    assert(!reply.isError);
    const result = JSON.parse(reply.content.find(item => item.type === 'text').text);
    assert(result.ok && result.tier === 1);
    const data = result.data?.columns
      ? result.data.rows.map(row => Object.fromEntries(result.data.columns.map((column, index) => [column, row[index]])))
      : result.data;
    const expected = JSON.parse(readFileSync(join(folder, 'list-http.json'), 'utf8')).data;
    assert.deepEqual(data, expected, 'Private MCP result must match the independently checked HTTP list');
    return { observedReferenceAllowlist: ids.length, foreignIdRejectedBeforeSend: true,
      privateMcpListRowsCompared: data.length, privateMcpTier: result.tier };
  } finally {
    await client.close();
  }
}
try {
  checkSettings();
  const env = toolEnv();
  process.env.API_ANYTHING_HOME = env.API_ANYTHING_HOME;
  if (env.API_ANYTHING_BROWSER) process.env.API_ANYTHING_BROWSER = env.API_ANYTHING_BROWSER;
  const upstream = name => import(new URL(name, pathToFileURL(cli)).href);
  const { capturePage, addOperation, profileDir } = await upstream('heal.js');
  const browser = await upstream('browser.js');
  closeBrowser = browser.closeBrowser;
  const { loadSession, writePrivate } = await upstream('session.js');
  const { saveSite, loadSite } = await upstream('store.js');
  const { call } = await upstream('execute.js');
  const dependencies = createRequire(requireTool.resolve('api-anything'));
  const { parse } = dependencies('node-html-parser');
  const folder = join(privateHome, 'vereinsflieger-study');
  const initial = JSON.parse(readFileSync(join(folder, 'initial-reader.json'), 'utf8'));
  const proof = JSON.parse(readFileSync(join(folder, 'session-proof.json'), 'utf8'));
  const ids = [...new Set(initial.rows.map(row => row.sourceFlightId).filter(id => /^\d{1,20}$/.test(id)))].slice(0, 3);
  assert.equal(ids.length, 3, 'Three observed own-flight references required');
  if (process.argv.includes('--boundaries')) {
    stage = 'private-mcp-and-reference-boundaries';
    const boundary = await verifyBoundaries(ids, folder, { loadSite, saveSite, call });
    const report = JSON.parse(readFileSync(join(folder, 'study-report.json'), 'utf8'));
    Object.assign(report, boundary);
    writePrivate(join(folder, 'study-report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(boundary));
    process.exit(0);
  }
  const clean = value => value.replace(/\s+/g, ' ').trim();
  const samples = [];
  const capture = async url => {
    await browser.addCookiesToProfile(loadSession(site).cookies, profileDir());
    return capturePage({ url });
  };
  stage = 'list-capture';
  const list = await capture(flightUrl);
  // Upstream's working capture cache has a TTL; keep study originals separately.
  writePrivate(join(folder, `raw-captures/${list.id}.json`), JSON.stringify(list));
  const document = list.exchanges.find(exchange => exchange.resourceType === 'document' &&
    exchange.request.url === flightUrl && exchange.response?.status === 200);
  assert(document, 'Own-flight document response required');
  const html = parse(document.response.body);
  const heading = html.querySelector('#divpageheadermenu');
  const children = heading?.childNodes.filter(node => node.nodeType === 1) ?? [];
  const headers = html.querySelectorAll('#tablelist_20 tr').map(row => row.querySelectorAll('th,td').map(cell => clean(cell.text)))
    .find(row => ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'].every(label => row.includes(label)));
  authenticatedFlightPage(list.finalUrl, { loginControls: html.querySelectorAll('input[name="pwinput"]').length,
    tables: html.querySelectorAll('#tablelist_20').length, accountLabel: clean(children[1]?.text ?? '').replace(/^VEREINSFLIEGER\.DE\s*/, '').trim(), headers }, proof.accountDigest);
  assert.equal(headers.length, initial.headers.length, 'Current list column count changed');
  assert(headers.every((header, index) => header.replace(/\s/g, '') === initial.headers[index].replace(/\s/g, '')),
    'Current list columns changed beyond HTML line-break whitespace');
  const listFields = { sourceRow: '@id' };
  for (const [name, label] of Object.entries({ date: 'Datum', registration: 'Lfz.', duration: 'Flugzeit' })) {
    listFields[name] = `td:nth-child(${headers.indexOf(label) + 1})`;
  }
  stage = 'learn-visible-list';
  const listLearn = await addOperation({ site, op: 'ownFlightsVisible', trigger: { url: flightUrl }, examples: [{}],
    match: { method: 'GET', path: '/member/profile/flightlog.php' }, from: { capture: list, id: document.id },
    description: 'Current visible own-flight page only; no date or complete-history guarantee',
    response: { format: 'html', html: { items: '#tablelist_20 tr[id^="row"]', fields: listFields } }, readsOnly: true });
  const currentSite = loadSite(site).site;
  // Cookie presence is a hint to this tool; the helper requires protected-page proof before saving it.
  saveSite({ ...currentSite, loginCookies: ['PHPSESSID'] });
  stage = 'http-list';
  const listCall = await call(site, 'ownFlightsVisible', {}, { maxTier: 1 });
  assert(listCall.ok && listCall.tier === 1 && Array.isArray(listCall.data), 'Direct HTTP list call failed');
  assert.equal(listCall.data.length, initial.rows.length);
  for (let index = 0; index < initial.rows.length; index++) {
    const expected = initial.rows[index], actual = listCall.data[index];
    assert.equal(actual.sourceRow, `row${expected.sourceFlightId}`);
    for (const [name, label] of Object.entries({ date: 'Datum', registration: 'Lfz.', duration: 'Flugzeit' })) {
      assert.equal(clean(actual[name]), clean(expected.values[headers.indexOf(label)]));
    }
  }
  writePrivate(join(folder, 'list-http.json'), JSON.stringify(listCall));
  const detailUrl = id => loginUrl + 'member/profile/viewflight.php?flid=' + id;
  stage = 'detail-captures';
  const examples = [];
  for (const id of ids.slice(0, 2)) {
    const detailCapture = await capture(detailUrl(id));
    examples.push(detailCapture);
    writePrivate(join(folder, `raw-captures/${detailCapture.id}.json`), JSON.stringify(detailCapture));
  }
  const detailFields = {};
  const detailLabels = { reference: 'Eintrag', date: 'Datum', start: 'Startzeit', landing: 'Landezeit', duration: 'Flugzeit' };
  for (const [name, label] of Object.entries(detailLabels)) {
    detailFields[name] = `tr:has(td:first-child:contains("${label}")) td:nth-child(2)`;
  }
  stage = 'learn-details';
  const detailLearn = await addOperation({ site, op: 'ownFlightDetail',
    trigger: { url: loginUrl + 'member/profile/viewflight.php?flid={flightId}' },
    examples: [{ flightId: ids[0] }, { flightId: ids[1] }],
    allowed: { flightId: { enum: ids } },
    match: { method: 'GET', path: '/member/profile/viewflight.php' },
    from: { capture: examples[0] }, from2: examples[1], readsOnly: true,
    description: 'Own-flight references must come from the verified list; limited raw-field projection',
    response: { format: 'html', html: { items: 'table.view:has(td:contains("Eintrag"))', fields: detailFields } } });
  await closeBrowser();
  stage = 'existing-detail-reader';
  const { chromium } = dependencies('playwright-core');
  context = await chromium.launchPersistentContext(profileDir(), { executablePath: browser.browserChoice()?.bin,
    headless: true, chromiumSandbox: true, serviceWorkers: 'block', userAgent: await browser.headlessUserAgent() });
  await context.addCookies(loadSession(site).cookies);
  const page = context.pages()[0] ?? await context.newPage();
  const browserDetails = [];
  for (const id of ids) {
    const started = performance.now();
    await page.goto(detailUrl(id), { waitUntil: 'domcontentloaded' });
    const raw = await page.evaluate(`(${DETAIL_READER_SOURCE})(${JSON.stringify(DETAIL_LABELS)})`);
    const detail = decodeDetail(raw, detailUrl(id), new Date().toISOString());
    browserDetails.push(detail);
    samples.push({ transport: 'browser-existing-reader', case: browserDetails.length, ms: performance.now() - started });
  }
  await context.close(); context = null;
  writePrivate(join(folder, 'browser-details.json'), JSON.stringify(browserDetails));
  stage = 'detail-http-comparison';
  let comparisons = 0;
  for (let repeat = 0; repeat < 2; repeat++) {
    for (let index = 0; index < ids.length; index++) {
      const result = await call(site, 'ownFlightDetail', { flightId: ids[index] }, { maxTier: 1 });
      assert(result.ok && result.tier === 1 && Array.isArray(result.data) && result.data.length === 1);
      const expected = browserDetails[index];
      for (const [name, label] of Object.entries(detailLabels)) {
        const fields = expected.fields.filter(field => field.label === label);
        assert.equal(fields.length, 1, 'Ambiguous reference field');
        assert.equal(clean(result.data[0][name]), clean(fields[0].raw));
        comparisons++;
      }
      samples.push({ transport: 'api-anything-http', case: index + 1, repeat: repeat + 1, ms: result.ms });
      writePrivate(join(folder, `detail-http-${index}-${repeat}.json`), JSON.stringify(result));
    }
  }
  stage = 'unauthenticated-page';
  const guest = await fetch(flightUrl, { redirect: 'error' });
  const guestHtml = parse(await guest.text());
  assert.equal(guestHtml.querySelectorAll('#tablelist_20').length, 0);
  assert(guestHtml.querySelector('input[name="pwinput"]'));
  checkSettings();
  const report = { checkedAt: new Date().toISOString(), source: 'desktop-own-flight-only',
    liveMcpAvailable: true, session: 'protected-page-verified', visibleListRowsCompared: initial.rows.length,
    listFieldsCompared: initial.rows.length * 4, detailCases: ids.length, heldOutCases: 1,
    repeats: 2, detailFieldComparisons: comparisons, allEqual: true, directHttpTier: 1,
    warnings: { list: listLearn.warnings.length, detail: detailLearn.warnings.length },
    paginationLinksObserved: html.querySelectorAll('a.pagebrowser').length,
    guest: { status: guest.status, loginForm: true, treatedAsEmptyFlights: false },
    samples, limits: ['visible page only', 'date filters/paging/empty authenticated range not tested',
      'no cross-account/native/iOS acceptance', 'unmatched browser/HTTP samples do not prove speedup'], sharing: false };
  Object.assign(report, await verifyBoundaries(ids, folder, { loadSite, saveSite, call }));
  writePrivate(join(folder, 'study-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  console.log(JSON.stringify({ ok: false, stage, errorName: error.name,
    callsite: /study\.mjs:\d+:\d+/.exec(error.stack)?.[0] }));
  process.exitCode = 1;
} finally {
  await context?.close();
  await closeBrowser?.();
}

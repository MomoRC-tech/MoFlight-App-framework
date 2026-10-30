import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { cli, requireTool, toolEnv } from './tooling.mjs';
import { dateSteps, inspectDateRequest, interceptDateRequest, observedDateForm, viewSnapshot } from './date-discovery.mjs';

const range = { from: '2026-01-01', to: '2026-01-31' };
const request = { method: 'POST', url: 'https://example.invalid/filter',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: 'startdate=01.01.2026&enddate=31.01.2026&daterange=date' };
test('date discovery refuses malformed/reversed ranges, foreign targets and other/duplicated form actions', () => {
  assert.throws(() => dateSteps({ ...range, from: '2026-02-30' }));
  assert.throws(() => dateSteps({ ...range, to: '2025-12-31' }));
  assert.throws(() => inspectDateRequest({ ...request, url: 'https://foreign.invalid/filter' }, request.url, range));
  for (const body of [request.body + '&delete=1', request.body + '&startdate=02.01.2026',
    request.body.replace('daterange=date', 'daterange=now')]) {
    assert.throws(() => inspectDateRequest({ ...request, body }, request.url, range));
  }
  assert.deepEqual(inspectDateRequest(request, request.url, range).fields, ['daterange', 'enddate', 'startdate']);
});

test('rotating actions must match the same document and view comparison ignores command tokens', () => {
  const { parse } = createRequire(requireTool.resolve('api-anything'))('node-html-parser');
  const page = 'https://example.invalid/filter';
  const fixture = (target, start = '01.01.2026') => parse(`<div id="menu_globalfilter">
    <form method="post" action="${target}"><input id="startdate" name="startdate" value="${start}">
    <select id="daterange" name="daterange"><option value="date">Custom</option></select>
    <input id="enddate" name="enddate" value="31.01.2026"></form></div>`);
  const first = fixture(page + '?_params=fixture-one');
  const second = fixture(page + '?_params=fixture-two');
  const firstAction = observedDateForm(first, page).target;
  const secondAction = observedDateForm(second, page).target;
  assert.notEqual(firstAction, secondAction);
  assert.throws(() => inspectDateRequest({ ...request, url: secondAction }, firstAction, range));
  assert.doesNotThrow(() => inspectDateRequest({ ...request, url: secondAction }, secondAction, range));
  assert.equal(viewSnapshot(first).digest, viewSnapshot(second).digest);
  assert.notEqual(viewSnapshot(first).digest, viewSnapshot(fixture(secondAction, '02.01.2026')).digest);
  for (const target of ['https://foreign.invalid/filter?_params=x', page + '?delete=1',
    page + '?_params=one&_params=two', 'https://example.invalid/other?_params=x']) {
    assert.throws(() => observedDateForm(fixture(target), page));
  }
});

const executable = toolEnv().API_ANYTHING_BROWSER;
test('API Anything captures the original date POST but the synthetic server receives zero submissions',
  { skip: !executable || !existsSync(executable) }, async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'moflight-date-intercept-'));
    const savedHome = process.env.API_ANYTHING_HOME, savedBrowser = process.env.API_ANYTHING_BROWSER;
    process.env.API_ANYTHING_HOME = temporary;
    process.env.API_ANYTHING_BROWSER = executable;
    let posts = 0;
    const server = createServer((req, res) => {
      if (req.method === 'POST') { posts++; res.end('Unexpected submission'); return; }
      res.setHeader('Content-Type', 'text/html');
      res.end(`<button id="globalfilter" onclick="document.getElementById('menu_globalfilter').hidden=false">Period</button>
        <div id="menu_globalfilter" hidden><form method="post" action="/filter">
        <input id="startdate" name="startdate"><select id="daterange" name="daterange">
        <option value="1m">One month</option><option value="date">Custom date</option></select>
        <input id="enddate" name="enddate"><input type="submit"></form></div>`);
    });
    await new Promise(resolve => { server.listen(0, '127.0.0.1', resolve); });
    const browser = await import(new URL('browser.js', pathToFileURL(cli)).href);
    const { writeGuard } = await import(new URL('heal.js', pathToFileURL(cli)).href);
    try {
      const url = `http://127.0.0.1:${server.address().port}/filter`;
      const captured = await interceptDateRequest(browser, writeGuard, url, join(temporary, 'profile'), range);
      assert.equal(captured.requests.length, 1);
      inspectDateRequest(captured.requests[0], url, range);
      assert.equal(posts, 0, 'No POST may reach even the synthetic server');
      assert(captured.blocked.some(exchange => exchange.request.method === 'POST' && exchange.blockedByGuard));
    } finally {
      await browser.closeBrowser();
      await new Promise(resolve => { server.close(resolve); });
      if (savedHome === undefined) delete process.env.API_ANYTHING_HOME;
      else process.env.API_ANYTHING_HOME = savedHome;
      if (savedBrowser === undefined) delete process.env.API_ANYTHING_BROWSER;
      else process.env.API_ANYTHING_BROWSER = savedBrowser;
      assert.equal(dirname(resolve(temporary)), resolve(tmpdir()));
      assert(basename(temporary).startsWith('moflight-date-intercept-'));
      rmSync(temporary, { recursive: true, force: true });
    }
  });

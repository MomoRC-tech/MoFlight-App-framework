import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function germanDate(iso) {
  assert(typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) &&
    Number.isFinite(Date.parse(iso)) && new Date(iso).toISOString().slice(0, 10) === iso, 'Invalid date');
  return iso.split('-').reverse().join('.');
}

export function dateSteps(range) {
  const from = germanDate(range.from), to = germanDate(range.to);
  assert(range.from <= range.to, 'Reversed date range');
  return [
    { action: 'click', selector: '#globalfilter' },
    { action: 'press', selector: '#daterange', value: 'End' },
    { action: 'fill', selector: '#startdate', value: from },
    { action: 'fill', selector: '#enddate', value: to },
    { action: 'click', selector: '#menu_globalfilter form input[type="submit"]' },
  ];
}

export function inspectDateRequest(request, expectedUrl, range) {
  assert.equal(request.url, expectedUrl, 'Unexpected form target');
  assert.equal(request.method, 'POST', 'Unexpected form method');
  assert((request.headers['content-type'] ?? '').startsWith('application/x-www-form-urlencoded'));
  const body = new URLSearchParams(request.body);
  assert.deepEqual([...body.keys()].sort(), ['daterange', 'enddate', 'startdate'], 'Unexpected or duplicated form fields');
  assert.equal(body.get('daterange'), 'date');
  assert.equal(body.get('startdate'), germanDate(range.from));
  assert.equal(body.get('enddate'), germanDate(range.to));
  return { method: 'POST', path: new URL(request.url).pathname,
    encoding: 'application/x-www-form-urlencoded', fields: [...body.keys()].sort() };
}

export function observedDateForm(document, pageUrl) {
  for (const id of ['startdate', 'enddate', 'daterange']) {
    assert.equal(document.querySelectorAll('#' + id).length, 1);
  }
  const forms = document.querySelectorAll('#menu_globalfilter form');
  assert.equal(forms.length, 1);
  const form = forms[0];
  assert.equal((form.getAttribute('method') ?? '').toLowerCase(), 'post');
  const target = new URL(form.getAttribute('action') || pageUrl, pageUrl);
  const page = new URL(pageUrl);
  assert.equal(target.origin, page.origin);
  assert.equal(target.pathname, page.pathname);
  assert(!target.hash && !target.username && !target.password);
  assert.deepEqual([...target.searchParams.keys()], ['_params']);
  assert.deepEqual(form.querySelectorAll('input[name],select[name],textarea[name]').map(element => element.getAttribute('name')).sort(),
    ['daterange', 'enddate', 'startdate']);
  const options = document.querySelectorAll('#daterange option');
  assert.equal(options.at(-1)?.getAttribute('value'), 'date');
  return { target: target.href, rangeOptionCount: options.length };
}

export async function interceptDateRequest(browser, writeGuard, url, profileDir, range, target = url) {
  const blocked = [];
  const guard = writeGuard(undefined, { url, args: range });
  let run, errorName;
  try {
    run = await browser.runTrigger({ url, profileDir, steps: dateSteps(range), timeoutMs: 15000,
      intercept: (exchange, acting) => {
        const drop = guard(exchange, acting);
        if (drop) blocked.push({ ...structuredClone(exchange), blockedByGuard: true });
        return drop;
      } });
  } catch (error) {
    // Aborting a form navigation can end the browser action. Retain intercepted evidence.
    errorName = error.name;
  }
  const requests = new Map();
  const wanted = new URL(target);
  for (const exchange of blocked) {
    const actual = new URL(exchange.request.url);
    // Collect only candidates here. The caller must validate the exact action
    // from this run's own document; its opaque command value can rotate per load.
    if (exchange.request.method === 'POST' && actual.origin === wanted.origin && actual.pathname === wanted.pathname) {
      requests.set(JSON.stringify(exchange.request), exchange.request);
    }
  }
  return { run, errorName, blocked, requests: [...requests.values()] };
}

export function viewSnapshot(document) {
  const clean = element => (element?.text ?? '').replace(/\s+/g, ' ').trim();
  const controls = document.querySelectorAll('input,select').filter(element =>
    /^(startdate|enddate|daterange|lst_configavailable|frm_rowsperpage|lst_configure_visible2?|table_conf_id|col\d+.*|op_col\d+)$/.test(element.getAttribute('name') ?? element.getAttribute('id') ?? ''))
    .map(element => {
      const name = element.getAttribute('name') ?? element.getAttribute('id');
      if (element.tagName === 'SELECT') {
        const options = element.querySelectorAll('option');
        const selected = options.find(option => option.hasAttribute('selected')) ?? options[0];
        return { name, value: selected?.getAttribute('value') ?? selected?.text ?? '' };
      }
      return { name, value: element.getAttribute('value') ?? '',
        ...(element.getAttribute('type') === 'checkbox' ? { checked: element.hasAttribute('checked') } : {}) };
    });
  const snapshot = { controls, period: clean(document.querySelector('#globalfilter')),
    participation: clean(document.querySelector('#globalfilter2')),
    visibleColumns: document.querySelectorAll('#LST_VISIBLE > li').map(element => element.getAttribute('value')) };
  return { snapshot, digest: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') };
}

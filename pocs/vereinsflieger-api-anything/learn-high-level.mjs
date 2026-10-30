// Execute the real high-level CLI. Keep examples, raw results and captures local.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, relative, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cli, privateHome, root, toolEnv, checkSettings } from './tooling.mjs';
import { site, compareCoreValues } from './provider-contract.mjs';

const trigger = 'https://vereinsflieger.de/member/profile/viewflight.php?flid={flightId}';
const op = 'ownFlightDetailHighLevel';
const environment = toolEnv();
process.env.API_ANYTHING_HOME = environment.API_ANYTHING_HOME;
if (environment.API_ANYTHING_BROWSER) process.env.API_ANYTHING_BROWSER = environment.API_ANYTHING_BROWSER;
checkSettings();
const upstream = name => import(new URL(name, pathToFileURL(cli)).href);

if (process.argv[2] === '--child') {
  const inputPath = resolve(process.argv[3]);
  const localPath = relative(privateHome, inputPath);
  assert(localPath && !isAbsolute(localPath) && !localPath.startsWith('..'));
  const input = JSON.parse(readFileSync(inputPath, 'utf8'));
  assert(input.ids.length === 3 && input.ids.every(id => /^\d{1,20}$/.test(id)));
  const browser = await upstream('browser.js');
  const { loadSession } = await upstream('session.js');
  const { profileDir } = await upstream('heal.js');
  await browser.addCookiesToProfile(loadSession(site).cookies, profileDir());
  // The CLI uses the same loaded browser module and owns its close/finalization.
  process.argv = [process.execPath, cli, 'learn', trigger,
    '--args', `flightId=${input.ids[0]}`, '--args2', `flightId=${input.ids[1]}`,
    '--args3', `flightId=${input.ids[2]}`, '--site', site, '--op', op, '--fresh',
    '--intent', 'Read a verified own-flight detail using only references from the verified own list'];
  if (input.captures && input.html) process.argv.push('--from', input.captures[0], '--from2', input.captures[1], '--html', JSON.stringify(input.html));
  await import(pathToFileURL(cli).href);
} else {
  let stage = 'verified-reference-scope';
  const { writePrivate } = await upstream('session.js');
  const { call } = await upstream('execute.js');
  const { loadSite, saveSite } = await upstream('store.js');
  const folder = join(privateHome, 'vereinsflieger-study/high-level-learn', randomUUID());
  const configured = process.argv.includes('--configured');
  let report, previous;
  try {
    const initial = JSON.parse(readFileSync(join(privateHome, 'vereinsflieger-study/initial-reader.json'), 'utf8'));
    const ids = [...new Set(initial.rows.map(row => row.sourceFlightId).filter(id => /^\d{1,20}$/.test(id)))].slice(0, 3);
    assert.equal(ids.length, 3);
    const currentList = await call(site, 'ownFlightsVisible', {}, { maxTier: 1 });
    assert(currentList.ok && ids.every(id => currentList.data.some(row => row.sourceRow === 'row' + id)));
    previous = loadSite(site).site;
    writePrivate(join(folder, 'site-before.json'), JSON.stringify(previous));
    const packet = join(folder, 'input.json');
    const input = { ids };
    if (configured) {
      const base = join(privateHome, 'vereinsflieger-study/high-level-learn');
      const candidates = readdirSync(base).map(name => join(base, name))
        .filter(path => existsSync(join(path, 'cli-output.json')) && existsSync(join(path, 'report.json')))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
      const original = candidates.find(path => JSON.parse(readFileSync(join(path, 'report.json'), 'utf8')).manualRecipeProvided === false);
      assert(original, 'An automatic run is required before refining its extraction');
      const oldInput = JSON.parse(readFileSync(join(original, 'input.json'), 'utf8'));
      assert.deepEqual(oldInput.ids, ids, 'Source reference scope changed');
      const oldResult = JSON.parse(readFileSync(join(original, 'cli-output.json'), 'utf8'));
      assert.equal(oldResult.captures?.length, 2);
      const { loadSession } = await upstream('session.js');
      const currentToken = loadSession(site).cookies.find(cookie => cookie.name === 'PHPSESSID')?.value;
      for (const id of oldResult.captures) {
        assert(/^c[a-z0-9]+$/.test(id));
        const capture = JSON.parse(readFileSync(join(privateHome, 'captures', id + '.json'), 'utf8'));
        assert(Date.now() - Date.parse(capture.at) < 30 * 60 * 1000, 'Captures are too old for this refinement');
        assert(currentToken && capture.cookies.some(cookie => cookie.name === 'PHPSESSID' && cookie.value === currentToken),
          'Session changed; do not replace it with stale captured cookies');
      }
      input.captures = oldResult.captures;
      input.html = previous.operations.find(operation => operation.name === 'ownFlightDetail').response.html;
      assert(input.html);
    }
    writePrivate(packet, JSON.stringify(input));
    stage = 'high-level-cli';
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--child', packet], {
      cwd: root, env: environment, encoding: 'utf8', timeout: 120000,
      maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    });
    writePrivate(join(folder, 'cli-output.json'), child.stdout || '');
    writePrivate(join(folder, 'cli-stderr.txt'), child.stderr || '');
    const result = JSON.parse(child.stdout || '{}');
    for (const capture of result.captures ?? []) {
      assert(/^c[a-z0-9]+$/.test(capture));
      writePrivate(join(folder, `capture-${capture}.json`), readFileSync(join(privateHome, 'captures', capture + '.json'), 'utf8'));
    }
    stage = 'independent-field-comparison';
    const current = loadSite(site).site;
    const learned = current.operations.find(operation => operation.name === op);
    if (learned) {
      assert(learned.readOnly && learned.request.method === 'GET');
      const parameter = learned.params.find(param => param.name === 'flightId');
      assert(parameter);
      parameter.enum = ids;
      saveSite(current);
    }
    const checks = [];
    if (result.ok && learned) {
      for (const [index, id] of [ids[0], ids[2]].entries()) {
        const expected = await call(site, 'ownFlightDetail', { flightId: id }, { maxTier: 1 });
        const actual = await call(site, op, { flightId: id }, { maxTier: 1 });
        assert(expected.ok && actual.ok);
        writePrivate(join(folder, `comparison-${index + 1}.json`), JSON.stringify({ expected, actual }));
        const compared = compareCoreValues(expected.data[0], actual.data);
        checks.push({ case: index === 0 ? 'first-example' : 'holdout',
          ...compared, tier: actual.tier });
      }
    }
    const independentPass = checks.length === 2 && checks.every(check => check.matched && check.expectedFields === 5);
    report = { checkedAt: new Date().toISOString(), command: 'api-anything learn',
      explicitSiteAndFresh: true, manualRecipeProvided: configured, existingCapturesReused: configured, cliExitCode: child.status,
      commandOk: result.ok === true, requestAutomaticallyChosen: !!result.chosen,
      format: learned?.response.format, resultRows: Array.isArray(result.data) ? result.data.length : null,
      builtInHoldout: result.proof?.holdout?.ok ?? false, cleanReplay: result.proof?.cleanReplay,
      warningCount: result.warnings?.length ?? 0, independentChecks: checks,
      independentlyMatchedCoreFields: independentPass,
      shared: result.shared?.shared === true, sharingSetting: false, referenceAllowlist: ids.length };
    assert(!report.shared);
    checkSettings();
    if (!independentPass) {
      process.exitCode = 1;
      // Preserve any previous accepted op; an unverified automatic projection stays evidence only.
      current.operations = current.operations.filter(operation => operation.name !== op);
      const old = previous.operations.find(operation => operation.name === op);
      if (old) current.operations.push(old);
      saveSite(current);
    }
  } catch (error) {
    if (previous) {
      const current = loadSite(site).site;
      current.operations = current.operations.filter(operation => operation.name !== op);
      const old = previous.operations.find(operation => operation.name === op);
      if (old) current.operations.push(old);
      saveSite(current);
    }
    report = { ok: false, stage, errorName: error.name,
      callsite: /learn-high-level\.mjs:\d+:\d+/.exec(error.stack)?.[0] };
    process.exitCode = 1;
  }
  writePrivate(join(folder, 'report.json'), JSON.stringify(report, null, 2));
  writePrivate(join(privateHome, 'vereinsflieger-study/high-level-learn-report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

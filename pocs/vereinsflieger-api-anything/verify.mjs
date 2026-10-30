import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { requireTool, cli, root, launcher, privateHome, toolEnv, checkSettings } from './tooling.mjs';

// Resolve the MCP client from the tool's own dependency tree; no extra app dependency.
const upstream = createRequire(requireTool.resolve('api-anything'));
const { Client } = await import(pathToFileURL(upstream.resolve('@modelcontextprotocol/sdk/client/index.js')).href);
const { StdioClientTransport } = await import(pathToFileURL(upstream.resolve('@modelcontextprotocol/sdk/client/stdio.js')).href);
checkSettings();
const environment = toolEnv();
process.env.API_ANYTHING_HOME = environment.API_ANYTHING_HOME;
if (environment.API_ANYTHING_BROWSER) process.env.API_ANYTHING_BROWSER = environment.API_ANYTHING_BROWSER;
// Exercise the patched tool's own launcher using a separate, non-provider profile.
const { openBrowser, closeBrowser } = await import(new URL('browser.js', pathToFileURL(cli)).href);
let browserSandbox;
try {
  const context = await openBrowser({ profileDir: join(privateHome, 'sandbox-smoke-profile'), headless: true });
  const page = context.pages()[0] ?? await context.newPage();
  await page.setContent('<title>MoFlight sandbox smoke</title>');
  assert.equal(await page.title(), 'MoFlight sandbox smoke');
  await page.goto('chrome://version');
  const commandLine = await page.locator('#command_line').innerText();
  assert(commandLine.includes('sandbox-smoke-profile'), 'Inspect only the dedicated smoke browser');
  assert(!/--no-sandbox(?:\s|$)/.test(commandLine), 'Chrome must launch without --no-sandbox');
  browserSandbox = { launchPassed: true, noSandboxFlag: false, profile: 'sandbox-smoke-profile' };
} finally {
  await closeBrowser();
}
const publicRead = spawnSync(process.execPath, [cli, 'call', 'hacker-news', 'search', 'query=sqlite'], {
  cwd: root, env: toolEnv(), encoding: 'utf8', windowsHide: true, timeout: 60000,
});
assert.equal(publicRead.status, 0, publicRead.stderr || publicRead.error?.message);
const result = JSON.parse(publicRead.stdout);
assert.equal(result.ok, true);
assert.equal(result.tier, 1);
const client = new Client({ name: 'moflight-tooling-verification', version: '0.0.0' });
try {
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: [launcher, 'mcp'], cwd: root, env: toolEnv(), stderr: 'pipe' }));
  const { tools } = await client.listTools();
  const names = tools.map(tool => tool.name);
  assert(names.includes('call_operation'));
  assert(!names.includes('call_write_operation'));
  const sites = await client.callTool({ name: 'list_sites', arguments: {} });
  assert(!sites.isError);
  checkSettings();
  const report = { checkedAt: new Date().toISOString(), version: '0.3.1',
    cli: { ok: result.ok, tier: result.tier, class: result.class },
    mcp: { connected: true, tools: names, listSites: 'passed', writesAvailable: false },
    sharing: false, browserSandbox, privateHome: 'private-data/api-anything', providerTested: false };
  writeFileSync(join(privateHome, 'installation-verification.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await client.close();
}

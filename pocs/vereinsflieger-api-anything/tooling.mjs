import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const packageDir = dirname(fileURLToPath(import.meta.url));
export const root = resolve(packageDir, '../..');
export const privateHome = join(root, 'private-data/api-anything');
export const launcher = fileURLToPath(import.meta.url);
export const requireTool = createRequire(import.meta.url);
export const cli = join(dirname(requireTool.resolve('api-anything')), 'cli.js');

export function assertReadOnly(args) {
  if (args.some(arg => /^(--allow-writes|--yes|--write)(=|$)/.test(arg)) ||
      ['publish', 'logout'].includes(args[0])) {
    throw new Error('This research launcher permits reads only and disables publishing/logout.');
  }
  if (args[0] === 'setup' && args.join(' ') !== 'setup --no-share --share-only') {
    throw new Error('Use setup --no-share --share-only; configure handles project MCP separately.');
  }
}

export function assertSharingOff(settings) {
  if (settings.share !== false || !settings.askedAt) {
    throw new Error('Sharing must be explicitly disabled. Run api setup --no-share --share-only.');
  }
}

export function toolEnv() {
  const browser = process.env.API_ANYTHING_BROWSER ||
    ['C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  return { ...process.env, API_ANYTHING_HOME: privateHome,
    ...(browser ? { API_ANYTHING_BROWSER: browser } : {}) };
}

export function checkSettings() {
  assertSharingOff(JSON.parse(readFileSync(join(privateHome, 'settings.json'), 'utf8')));
}

function configure() {
  checkSettings();
  const dir = join(root, '.codex');
  const target = join(dir, 'config.toml');
  const previous = existsSync(target) ? readFileSync(target, 'utf8') : '';
  const marker = '[mcp_servers.moflight_api_anything]';
  const entry = `${marker}\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(launcher)}, "mcp"]\ncwd = ${JSON.stringify(root)}\nstartup_timeout_sec = 30\ntool_timeout_sec = 60\n`;
  if (previous.includes(marker)) {
    if (!previous.includes(entry)) throw new Error('Existing project server differs; review it before replacing.');
    console.log('Project MCP configuration already matches.');
    return;
  }
  mkdirSync(dir, { recursive: true });
  if (existsSync(target)) {
    const backup = `${target}.api-anything-backup`;
    if (existsSync(backup)) throw new Error('Existing configuration backup preserved; review before proceeding.');
    copyFileSync(target, backup);
  }
  writeFileSync(target, `${previous}${previous ? '\n' : ''}${entry}`);
  console.log('Configured project MCP server moflight_api_anything; restart the session to load it.');
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const args = process.argv.slice(2);
    if (args[0] === 'configure') configure();
    else {
      assertReadOnly(args);
      if (args[0] !== 'setup') checkSettings();
      mkdirSync(privateHome, { recursive: true });
      const result = spawnSync(process.execPath, [cli, ...args], {
        cwd: root, env: toolEnv(), stdio: 'inherit', windowsHide: true,
      });
      if (result.error) throw result.error;
      process.exitCode = result.status ?? 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

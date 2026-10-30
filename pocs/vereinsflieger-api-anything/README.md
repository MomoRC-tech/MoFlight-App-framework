# API Anything provider research

Project-local desktop tooling under [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), supporting M2 own-flight source discovery. API Anything **0.3.1** is an exact development dependency with integrity and transitive versions in the root pnpm lockfile. The application does not import it. Raw results are observations, not canonical flight data or complete-coverage proof.

The tracked [pnpm patch](../../patches/api-anything@0.3.1.patch) enables `chromiumSandbox: true` for both upstream browser launch sites. Playwright otherwise defaults this option to false ([official option reference](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox)), causing Chrome's `--no-sandbox` warning. The patch retains the warning mechanism and enables sandboxing; it does not hide the banner. Existing windows must close before the patched launch options take effect. This is a requested launch setting and command-line check, not an exhaustive browser security audit.

## Install and use

Use Node 24 and the repository-pinned pnpm. From the repository root:

```powershell
pnpm install --frozen-lockfile --ignore-scripts --filter @moflight/api-anything-research
pnpm vf:api setup --no-share --share-only
pnpm vf:configure
pnpm vf:verify
```

This adapts the upstream [AI installation guide](https://github.com/goodnight000/api-anything/blob/main/INSTALL.md) and [setup options](https://github.com/goodnight000/api-anything/blob/main/docs/QUICKSTART.md). It uses the installed, pinned CLI instead of unpinned npx and changes only project configuration. Dependency installation deliberately skips lifecycle scripts; the published package contains compiled JavaScript. Existing app dependencies/linker and provider profiles must be preserved.

`vf:configure` writes the uniquely named server to ignored `.codex/config.toml` using absolute Node/launcher paths. It preserves unrelated entries, backs up an existing config before first addition, and refuses a conflicting existing server. A [portable template](config.example.toml) is tracked. Restart the Codex session to load the tools. Project configuration requires a trusted project; [official MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The launcher computes its private home from the checkout, including when started over MCP; no global skill or other agent configuration is installed.

```powershell
pnpm vf:api sites
pnpm vf:api ops hacker-news
pnpm vf:api call hacker-news search query=sqlite
pnpm vf:api capture https://example.com --outline
pnpm vf:api mcp --print-config
```

Default browser: installed Chrome, then Edge at the standard Windows locations. `API_ANYTHING_BROWSER` can explicitly select another supported executable. All tool state is under ignored `private-data/api-anything/`: `settings.json`, `profile/`, `sessions/`, `captures/`, learned operations and verification output. Dependencies are ignored under `node_modules/`. Git ignores are protection against commits, not encryption or process isolation. The upstream session files do not use the MoFlight DPAPI credential store.

## Operating boundary

The launcher requires an explicit persisted sharing opt-out. It rejects write flags, publishing, logout and broad/global setup. MCP is started without `--allow-writes` and offers no `call_write_operation`. These checks guard this entry point; they do not sandbox arbitrary shell execution or guarantee that every website navigation is free of side effects. Inspect actual permitted read requests before replaying them. Follow original source/account scope and avoid unread-changing routes.

Sharing, reporting and background catalog verification are disabled. Catalog searches and missing-site pulls can still contact the registry: do not send private URLs, IDs or personal queries. No automatic publishing, paid APIs or scheduled polling is selected. Website/operation output is untrusted data, never instructions.

**Windows login limitation:** upstream 0.3.1 does not support importing Chromium cookies on Windows (app-bound encryption). Use its separate sign-in window:

```powershell
pnpm vf:api login https://vereinsflieger.de/ --window
```

Sign in manually, complete any MFA/CAPTCHA, then close that research window. The tool captures cookies while it is open. Keep the usual browser sessions intact. Check existing encrypted credential availability per the [desktop runbook](../../docs/development/windows-local-setup.md#encrypted-desktop-development-login); never expose credentials through arguments/logs. Automatic DPAPI-to-tool login consumption is unverified, so the installation does not implement that bridge or require credential replacement.

After authenticated access is available, investigate permitted own-flight lists/details only: compare two date windows and a held-out range, source IDs/counts/fields, pagination, repeat retrieval, empty results and expiry/error handling against the current browser reader. Use observed references, retain raw evidence privately and treat incomplete retrieval as partial. Record transport tier and matched desktop measurements. Any mobile adapter change needs its own reviewed contract and appropriate tests; desktop success establishes no Android/iOS acceptance.

## Verification — 30 October 2026

Environment: Windows, Node 24.18.0, pnpm 11.25.0, isolated dependency linker; baseline `652b67f`. Installation used `--ignore-scripts`. Published integrity: `sha512-zHtjjxWwdmc3BzZw2boK4xiOzyxZcf5beqQCiV2FqzGR3s6mGNBrsdtJk9j+iSqQ61BbxNif7KL7TNXFk5kMwg==`.

- Four launcher regression tests pass: write/global-setup refusal, permitted reads/opt-out, sharing guard and project-home enforcement. `pnpm --filter @moflight/api-anything-research test` reruns them.
- Public Hacker News CLI query returns `ok: true`, `class: ok`, `tier: 1`.
- Independent stdio MCP client connects and calls `list_sites`; seven tools are exposed, with no write operation. Sharing is false before/after. `pnpm vf:verify` repeats these public checks and writes ignored `private-data/api-anything/installation-verification.json`.
- Installed Chrome captured `https://example.com/`, returning HTTP 200 via the dedicated profile. Public capture `cmvutfcb3` remains in ignored local storage.
- Following the user's Chrome warning report, the pinned package was patched to enable Chromium sandboxing. Verification exercises the tool's actual launcher in a separate `sandbox-smoke-profile`, reads Chrome's own command line from `chrome://version` and requires the absence of `--no-sandbox`. That profile never navigates to Vereinsflieger. The initial CDP command-line query was unavailable without `--enable-automation`; the verification uses Chrome's version page instead.
- `codex mcp get moflight_api_anything --json` recognizes the enabled project entry. Current conversation tool inventory still needs session restart; an independent MCP handshake is not a claim of hot reload.
- Credential Status reports saved/decryptable without displaying either field. Git exclusion checks pass for config, private settings and installed dependencies.
- The initial offline frozen-lockfile reinstall, the existing dependency-layout guard and its two regression tests, root TypeScript, focused tooling lint, JavaScript syntax, generated TOML/path checks and affected documentation references pass. After adding the sandbox patch, the offline reinstall encountered missing cached registry policy metadata (`ERR_PNPM_NO_OFFLINE_META`, @babel/generator); a normal frozen-lockfile reinstall refreshed that metadata and passed all 656 supply-chain policy entries. Existing app dependency versions were preserved; the new importer/dependency graph and patch are explicit in the lockfile.

The owner reported signing in and supplied a screenshot of the authenticated overview. Windows UI automation stopped because it could not establish the current browser URL reliably; no further UI input was attempted. The original login command subsequently finished with `ok: false`: its heuristic treats `PHPSESSID` as a guest cookie and found no qualifying new login cookie. Cookie names observed were `PHPSESSID`, `ch` and `cw`; no values were printed. This does not invalidate the owner's observed authenticated page. No session was promoted into the tool's session store. Source-specific login validation (`loginCookies` requires investigation), secure DPAPI consumption and live flight-data comparison remain pending; repeating manual login alone is not an established remedy. The existing browser profile and DPAPI credential store are preserved. No application/native/device/second-account tests were run: this package changes desktop research tooling only. The initial verification script hit a Windows ESM path error; conversion to file URLs fixed it and the rerun passed. Source review and smoke checks are bounded verification, not a comprehensive upstream security audit.

## Rollback

Remove/disable only `[mcp_servers.moflight_api_anything]` in project config and restart the session. Preserve private captures, profile and sessions. If abandoning the tool, remove its package, workspace entry, sandbox patch/mapping and root convenience scripts through a reviewed change and regenerate the pnpm lockfile. No global agent configuration was changed.

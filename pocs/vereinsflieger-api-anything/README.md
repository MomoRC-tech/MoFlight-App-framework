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

For the authorized own-flight study, use the existing encrypted desktop login:

```powershell
pnpm vf:login
pnpm vf:study
```

`vf:login` consumes the existing [DPAPI store](../../docs/development/windows-local-setup.md#encrypted-desktop-development-login) through a local anonymous stdin pipe. It uses the app's guarded original-form routine, waits for the provider to enable its button, verifies the protected own-flight table/account continuity and only then saves a tool session. Username/password are never command arguments, environment variables, files or output. Existing valid stored cookies are tried first; no logout or credential replacement occurs. MFA/CAPTCHA or an unsupported page produces a bounded failure requiring investigation rather than repeated submissions. Windows PowerShell is required for this helper.

`vf:study` learns a current-visible-list operation and a restricted detail projection from observed own-flight references, compares them with the app readers and writes private evidence below `vereinsflieger-study/`. Two references train the detail operation; the third is held out. The saved detail operation allows only those three observed references. `pnpm vf:study --boundaries` rechecks input refusal and the private MCP result without repeating learning. These are explicit developer runs, not polling. Raw captures may include other content of the permitted own source pages; all raw HTML, identifiers, field values and learned specs remain ignored locally. Only sanitized results below are tracked.

For further request discovery and the owner-selected high-level learning workflow:

```powershell
pnpm vf:discover
pnpm vf:learn
pnpm vf:learn --configured
```

`vf:discover` uses the tool's request-interception engine to inspect three date-form submissions **without sending them**. `vf:learn` invokes the real `api-anything learn` CLI with two observed references and a third holdout; automatic request/recipe selection is inspected first. The helper supplies the verified session and captures raw CLI output locally. `--fresh` plus the explicit local site bypasses catalog reuse/name lookup, and sharing remains off. It never installs another agent or starts a separate AI/model job.

If automatic extraction fails the independent comparison, it is rejected and that new operation is removed; existing accepted operations are preserved. `--configured` keeps the same high-level command and supplies the established five-field recipe, reusing the automatic run's two captures. This refinement requires matching references, the same session token and captures younger than 30 minutes. It retains the original manual study as a comparison baseline; it does not claim autonomous field interpretation. Both modes retain raw evidence outside the expiring cache and restrict the accepted new detail operation to three observed references.

This adapts the upstream [AI installation guide](https://github.com/goodnight000/api-anything/blob/main/INSTALL.md) and [setup options](https://github.com/goodnight000/api-anything/blob/main/docs/QUICKSTART.md). It uses the installed, pinned CLI instead of unpinned npx and changes only project configuration. Dependency installation deliberately skips lifecycle scripts; the published package contains compiled JavaScript. Existing app dependencies/linker and provider profiles must be preserved.

`vf:configure` writes the uniquely named server to ignored `.codex/config.toml` using absolute Node/launcher paths. It preserves unrelated entries, backs up an existing config before first addition, and refuses a conflicting existing server. A [portable template](config.example.toml) is tracked. Restart the Codex session to load the tools. Project configuration requires a trusted project; [official MCP guidance](https://learn.chatgpt.com/docs/extend/mcp?surface=cli). The launcher computes its private home from the checkout, including when started over MCP; no global skill or other agent configuration is installed.

```powershell
pnpm vf:api sites
pnpm vf:api ops hacker-news
pnpm vf:api call hacker-news search query=sqlite
pnpm vf:api capture https://example.com --outline
pnpm vf:api mcp --print-config
```

Default browser: installed Chrome, then Edge at the standard Windows locations. `API_ANYTHING_BROWSER` can explicitly select another supported executable. All tool state is under ignored `private-data/api-anything/`: `settings.json`, `profile/`, `sessions/`, `captures/`, learned operations and verification output. Dependencies are ignored under `node_modules/`. Git ignores are protection against commits, not encryption or process isolation. The upstream session files do not encrypt cookies with DPAPI; the project login helper consumes the existing DPAPI credential store without changing it.

## Operating boundary

The launcher requires an explicit persisted sharing opt-out. It rejects write flags, publishing, logout and broad/global setup. MCP is started without `--allow-writes` and offers no `call_write_operation`. These checks guard this entry point; they do not sandbox arbitrary shell execution or guarantee that every website navigation is free of side effects. Inspect actual permitted read requests before replaying them. Follow original source/account scope and avoid unread-changing routes.

Sharing, reporting and background catalog verification are disabled. Catalog searches and missing-site pulls can still contact the registry: do not send private URLs, IDs or personal queries. No automatic publishing, paid APIs or scheduled polling is selected. Website/operation output is untrusted data, never instructions.

**Windows login limitation:** upstream 0.3.1 does not support importing Chromium cookies on Windows (app-bound encryption). Prefer `pnpm vf:login` above. Its generic separate-window flow remains available for investigation:

```powershell
pnpm vf:api login https://vereinsflieger.de/ --window
```

The generic flow can reject a successful sign-in because it treats `PHPSESSID` as a guest cookie. Repeating manual login alone is not a remedy. Keep normal browser sessions intact. The project helper replaces cookie-change guessing with protected-page/reader/account-continuity checks. Presence of `PHPSESSID` alone never establishes authentication; a later local spec names it only as a tool hint after successful page verification.

After authenticated access is available, investigate permitted own-flight lists/details only: compare two date windows and a held-out range, source IDs/counts/fields, pagination, repeat retrieval, empty results and expiry/error handling against the current browser reader. Use observed references, retain raw evidence privately and treat incomplete retrieval as partial. Record transport tier and matched desktop measurements. Any mobile adapter change needs its own reviewed contract and appropriate tests; desktop success establishes no Android/iOS acceptance.

## Initial installation verification — 30 October 2026

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

## Live continuation — 30 October 2026

Baseline `a5d9cd8`; Windows / Node 24.18.0 / pinned pnpm 11.25.0 / Chrome. Package commit is linked from [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10). Research changed no app runtime, schema, saved filter/configuration, provider record or ordinary browser session.

| Check | Measured result |
| --- | --- |
| Existing profile without valid session | HTTP 200 at the flight URL contained a login form; refused as authentication evidence, not interpreted as empty flights |
| Existing DPAPI credential consumer | Fresh original-form login succeeded after waiting for the provider's naturally enabled button; protected page and existing reader verified 20 visible rows before session promotion |
| Returning saved session | Separate helper process reused the stored cookie jar and verified 20 rows with `submitted: false`; no additional credential submission |
| Visible list over plain HTTP | Tier 1; 20 source row references and their dates, registrations and reported durations matched the existing DOM capture: 80 field comparisons |
| Own detail projection | Three observed references, including one held out from the two learning examples; reference/date/start/landing/reported duration matched the existing section-preserving detail reader on two reads each: 30 comparisons |
| Private MCP call | Tier 1; all 20 list results matched the checked HTTP result, entirely within local client/child processes |
| Unobserved numeric reference | Locally refused as `class: input` by the three-reference allowlist before any provider request |
| Unauthenticated request | HTTP 200/login form/no flight table observed independently; no usable source result or deletion/empty-history inference |
| Focused regression | Eight checks pass, including a headless synthetic delayed/permanently-disabled button trial; foreign/missing/login/account-change states and credential packet bounds are covered. Focused lint passes |

JavaScript/PowerShell syntax, 796 affected-document local references (including the new evidence anchors), Git whitespace and private-file exclusion checks pass. Application/native builds were not run for this research-only package. The initial documentation checker used the host's default text encoding for an anchor target; explicitly reading UTF-8 fixed the checker and its rerun passed.

Private raw/DOM/HTTP evidence, source identity digest, append-only session observations and `study-report.json` remain under ignored `private-data/api-anything/vereinsflieger-study/`. Study originals are copied to `raw-captures/` outside upstream's expiring working cache. No credentials or cookie values were exposed. The first consumer bootstrap found two installed Node executables; selecting one explicitly fixed the launch. A low-level upstream browser lifecycle initially closed the helper after three idle seconds, so the helper owns its context lifetime. No login POST was observed during early attempts while the original button was still disabled; the helper now waits for the provider's asynchronous challenge without changing the disabled flag. The actual login then succeeded. None of these observations is an app/native fresh-login acceptance claim.

The selected flight requests are **server-rendered HTML**, not a discovered supported JSON API. API Anything can replay them over plain HTTP, which makes it useful for investigation and a candidate for an independently reviewed retrieval adapter. Keep it as research tooling for now. The list's single-example learning warning means nonce/parameter variation was not learned for that fixed-page operation; the parameterized detail operation produced no learning warnings. HTML line-break whitespace differs between raw and DOM headings and was normalized only for structural comparison; original values remain in private evidence.

No existing-reader `a.pagebrowser` controls were exposed in the inspected view. Requested date-window variation, paging, authenticated empty periods/accounts, actual expiry/renewal, other accounts/clubs and platform behavior remain unverified. The current session proof requires a nonempty list through the existing bounded reader. No source IDs were guessed and no filters were changed to manufacture those cases. Browser and HTTP timing samples are retained as unmatched desktop observations; **no speedup is established**. These results approve no mobile transport replacement, complete-history claim, role interpretation, canonical promotion or cost parsing.

## Request discovery and high-level learning — 30 October 2026

Baseline `5ff4c71`; same desktop environment. The owner selected high-level `learn` as the default orchestration for ordinary read discovery. Low-level capture remains for guarded inspection, login integration and independent verification. This package does not change application retrieval or activate the separately documented REST interface.

| Trial | Result and limit |
| --- | --- |
| Fresh loaded own-flight page | Six observed requests: the HTML document and five CSS/JS/image/font assets. No JSON XHR/fetch flight-data response appeared in this view; this is not a site-wide absence claim |
| Date-filter action | Original UI emits `POST /member/profile/flightlog.php?_params=...` with URL-encoded `startdate`, `enddate`, `daterange=date`; nine period options were observed |
| Opaque command | `_params` differed across fresh page loads. Each intercepted request was validated against the exact action in its **own** captured document; no value was decoded, guessed or published |
| Three monthly input examples | Three outgoing request bodies captured and aborted by API Anything's `writeGuard`; both date fields varied as expected. No filter request was replayed, and no result-window/empty-result server behavior is established |
| Preservation | Fresh protected account and view-control/column snapshots before and after matched. No known `a.pagebrowser` controls appeared in this view |
| Fully automatic high-level `learn` | Real CLI exit 0 and built-in holdout pass, but its `tr.alternative` recipe selected zero fields and returned 12 empty objects. Independent first-example/holdout comparison matched 0/5 expected values in each. Rejected; the incorrect new operation was removed |
| Configured high-level `learn` | Same command with the existing verified HTML recipe, reusing the same two captures: one structured result, built-in holdout pass, no learning warnings, and 5/5 independently checked values in both the first case and holdout at HTTP tier 1. Accepted within this bounded research scope |
| Authentication/sharing | Both high-level runs' cookie-free replay failed as expected for private data. Nothing was shared; only known own-flight references were used. The accepted new operation has the same three-reference allowlist |
| Regression | 12 focused checks pass, including malformed/foreign/duplicate form rejection, rotating-action/view-state handling, automatic-empty-object rejection, and an actual API Anything interception trial where a synthetic loopback server received zero POSTs. Focused lint passes |

Private evidence is retained in per-run `request-discovery/` and `high-level-learn/` directories plus their latest report JSON files under `private-data/api-anything/vereinsflieger-study/`. All raw HTML, command values, source references, CLI results, recipes and session evidence remain ignored. The initial strict action check rejected the real `_params` query; the next attempt caught a stale action from a different page load. Both attempts confirmed unchanged before/after view state. Matching the same-run action resolved the discovery checks without sending any filter request. The initial synthetic-test lint found two returning Promise executors; block bodies fixed them.

Use high-level `learn` for orchestration, with independently verified extraction and explicit own-source scope. Its built-in success/holdout flags are not sufficient evidence of correct flight fields. Date/paging execution with reliable preservation, authenticated empty windows/accounts, actual expiry/renewal, other accounts/clubs and app/native adoption still require their separate checks and decisions. No speedup or complete-history claim follows.

## Rollback

Remove/disable only `[mcp_servers.moflight_api_anything]` in project config and restart the session. Preserve private captures, profile and sessions. If abandoning the tool, remove its package, workspace entry, sandbox patch/mapping and root convenience scripts through a reviewed change and regenerate the pnpm lockfile. No global agent configuration was changed.

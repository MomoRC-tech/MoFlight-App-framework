# Portable validation, Android builds and UI smoke

Tracking: [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6#issuecomment-6247224733). Manuel's 18 October 2026 implementation handover authorizes automatic **fast** CI, superseding ADR 0009's manual-only fast checks. Android builds, Maestro and the retained extended Python checkpoint remain manual. No paid usage or production deployment is authorized. [Actual verification and limitations](../verification/2026-10-18-portable-ci.md).

## One command interface

Run from the repository root. Install Node **24.18.0** (`.node-version`), pnpm **11.25.0**, Python **3.12** (CI 3.12.10), then `pnpm install --frozen-lockfile`. pnpm owns dependency installation; do not generate a package-lock or use npm install in the workspace. `npm run` can invoke every root command after that installation.

| Purpose | Local and CI command | Prerequisites/results |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | strict existing tsc configuration |
| Correctness lint | `npm run lint` | ESLint 10.13.0 / TS parser 8.71.2, pinned lockfile |
| Mobile/unit/SQLite tests | `npm test` | existing node:test/tsx, Node 24 SQLite |
| Complete host validation | `npm run check` | types, lint, mobile tests, Python unittest, fixture parity; logs/report in `build/host-checks/` |
| Standalone APK | `npm run android:build` | clean committed source, JDK 17, SDK below; `build/android/app-release.apk` and `build.json` |
| Maestro installation | `npm run maestro:install` | download CLI 2.11.0 with SHA-256 verification into `build/tools/`; Java 17+ |
| Offline UI smoke | `npm run test:e2e -- --serial emulator-5562` | running named synthetic AVD, built APK, Maestro; fresh evidence under `build/e2e/` |

Equivalent `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check`, `pnpm android:build` and `pnpm test:e2e --serial emulator-5562` work. Individual checks return nonzero on failures. The aggregate retains all independent failures, has a per-check timeout and never makes model calls. No formatter was configured; no formatting migration was added. Lint initially enforces explicit correctness rules (unreachable code, invalid promises, duplicate branches, unsafe finally etc.) across maintained JS/TS; unused/style rules are outside this gate. TypeScript remains responsible for types and name resolution. No lint baseline, ignored failure or warning-only gate was introduced.

**Dependency preservation (#33):** the workspace disables pnpm's implicit pre-script installer (`verifyDepsBeforeRun: false`). Install dependencies explicitly with the frozen lockfile; checks/exec do not reconcile an existing isolated or hoisted layout. Host validation first checks installed layout metadata and both local workspace aliases without changing them. On Windows, the native builder explicitly installs hoisted dependencies, checks the physical expo-modules-core path and rejects stale isolated paths in generated autolinking/CMake files. A refusal preserves those files: use a new short `--build-directory` or deliberately repair the preserved checkout, rather than delete caches or reset unrelated work. Dependency roots/layout participate in the native-generation fingerprint.

## Android prerequisites and Windows

Use Android Studio's SDK Manager for the SDK and an accelerated emulator; keep Studio's bundled Java separate. The generated Expo 57 / React Native 0.86.3 project uses Gradle **9.3.1**, AGP **8.12.0**, SDK/target **36**, minimum SDK **24**, Build Tools **36.0.0**, NDK **27.1.12297006** and CMake **3.22.1**. These remain selected by the frozen dependencies. `scripts/android-toolchain.json` records SDK packages, ABIs and Maestro pins. JDK 17 is checked before building; its actual patch and runtime versions are recorded, rather than assuming runner image patches stay constant.

Install Android command-line tools/platform-tools, accept SDK licenses locally (`sdkmanager --licenses`) and install:

```text
sdkmanager "platform-tools" "platforms;android-36" "build-tools;36.0.0" "ndk;27.1.12297006" "cmake;3.22.1"
```

Configure Windows in the existing PowerShell session:

```powershell
. .\scripts\windows-android-env.ps1
pnpm install --frozen-lockfile
npm run check
# Default isolated checkout is C:\Users\Momo\mf-build; it must be clean.
npm run android:build
# Use a separate short path when another build checkout contains work:
npm run android:build -- --build-directory C:\Users\Momo\mf-ci-build
# Explicit committed source excludes existing source drafts without discarding them:
npm run android:build -- --source-ref HEAD --build-directory C:\Users\Momo\mf-ci-build
adb install -r build/android/app-release.apk
```

The Python wrapper delegates to the existing `build-android-local.ps1`: an isolated local clone, frozen hoisted dependencies and generated-only Windows CMake path workaround. It refuses dirty build checkouts. No private/ignored files are copied. On Linux use a clean checkout, installed frozen dependencies and `ANDROID_HOME`/`JAVA_HOME`, then the same build command; `--install-sdk` additionally installs the pinned SDK packages using the existing command-line tools. Network is needed initially for npm/Gradle/SDK downloads, independently of GitHub credentials. Caches improve speed; they are not prerequisites.

**Image-only increments (#32):** both builders supply `scripts/android-source-input.gradle`. Its bundle inputs include the public source revision and the app-owned `apps/platform-lab/assets/` tree. Image-only changes therefore invalidate the bundle even at the same source revision; unchanged assets/source retain normal Gradle caching. Direct Gradle invocations must also pass `--init-script <repository>/scripts/android-source-input.gradle`. Routine forced bundle reruns are unnecessary on this guarded path; older builds without the input rule retain the forced-bundle/decoded-pixel workaround. APK metadata alone does not prove updated pixels.

The Release-configuration **lab** APK uses generated debug signing, contains Hermes JavaScript and arm64-v8a/x86_64 libraries, and requires **no Metro development server**. The existing APK inspector checks those properties before publication. It is suitable for sideloaded development testing; no production key, EAS service or Google Play deployment is involved. Debug/Metro development remains available through the existing lab commands. Windows and Linux build equivalent lab behavior; their binaries/checksums need not be identical. Build metadata identifies source, SHA-256, time, host and tool versions.

Install via `adb -s <serial> install -r build/android/app-release.apk`, or drag the APK onto Android Studio's running emulator. Replacing an installed package retains data; signature mismatch requires a separate decision before uninstalling a device with valuable data. Never clear a provider-session emulator to make a test pass.

## Maestro smoke and emulator isolation

Create/start **MoFlight_Synthetic_API37** in Android Studio Device Manager, x86_64 Google APIs with hardware acceleration, at least 2 GB RAM. Existing local API 37 is supported; hosted smoke uses API **35** to keep the image small. The historical AVD name is an explicit safety identifier, not an assertion of OS version. Install the corresponding system image locally. Recommended phone viewport is about 390–412 dp, normal font scale; this smoke is navigation/offline behavior, not the visual acceptance matrix.

```powershell
. .\scripts\windows-android-env.ps1
# Optional headless launch; Device Manager is equally valid. Choose an unused port.
# emulator -avd MoFlight_Synthetic_API37 -port 5562 -no-snapshot
adb devices
npm run maestro:install
npm run test:e2e -- --serial emulator-5562
# Reuse a separately built APK:
npm run test:e2e -- --serial emulator-5562 --apk C:\Users\Momo\mf-ci-build\apps\platform-lab\android\app\build\outputs\apk\release\app-release.apk
```

Native Windows Maestro is supported; WSL, Docker and a Maestro Cloud account are unnecessary. The installer uses the official release ZIP with a committed checksum and refuses overwriting existing tooling. On subsequent runs reuse it. Java/ADB must be on PATH. An already-installed CLI is accepted only at the pinned version. See [official installation](https://docs.maestro.dev/maestro-cli/how-to-install-maestro-cli) and [CLI flags](https://docs.maestro.dev/maestro-cli/maestro-cli-commands-and-options).

`scripts/maestro_smoke.py` verifies emulator identity **before any installation, reset or diagnostic capture**, refusing physical devices and every other AVD. It clears only `de.momorc.moflight.lab` on that verified synthetic AVD, disables network radios, runs `.maestro/smoke.yaml` and restores the prior network flags. No app-side test API or database injection exists. The flow checks startup, empty flight history, club and AI placeholders, paper assistant entry, explicit fixture creation through the existing lab, populated flight history and persistence through process restart. It does not log in, retrieve provider data or call an AI service. Tabs/entry actions have stable test IDs; visible state assertions also check actual content. Existing deeper Python/ADB suites remain available for focused acceptance.

Exit codes preserve test failures. Logs, JUnit, Maestro command output and bounded synthetic logcat are saved; failure screenshots are captured. Diagnostic/cleanup failures fail the wrapper too. Existing evidence directories are refused. Preflight failures report a clear nonzero error before a run, including missing tooling/APK or rejected device; there are no silent skips. Do not bypass the wrapper by running a clearing flow against a private-session emulator. No production secrets/environment variables are required. [Local Android 17/API37 execution passed](../verification/2026-10-18-portable-ci.md); that does not establish another OS/image's execution.

## Hosted execution and Codex responsibilities

| Workflow | Trigger | Work / limit |
| --- | --- | --- |
| `ci.yml` / Fast CI | main push, PR to main, manual | one Ubuntu 24.04 job, `pnpm check`, 10 minutes; superseded runs cancelled |
| `android-build.yml` / Android APK | manual | portable standalone build, 40 minutes; APK + metadata artifact for 3 days |
| `android-ui-tests.yml` / Android UI smoke | manual | exact-commit successful APK artifact required first; emulator + local Maestro command, 25 minutes; diagnostics for 3 days |
| `android-checkpoint.yml` / Android checkpoint | manual, retained advanced path | existing source selection, APK reuse and longer Python native suite; separate evidence, 3-day artifacts |

Use Actions → workflow → Run workflow, choosing the desired ref. For Maestro, run Android APK for the **same commit** first, within the retention period. A missing/expired/mismatched APK fails clearly; it never substitutes an older binary or compiles a second APK. No required status checks or branch protection are configured by this work. Rulesets/branch protection were absent during inspection; configuring them is a separate owner decision.

Codex owns features, architecture, useful tests, debugging and regression fixes. During development run focused local checks, commit small packages directly on main, then read Fast CI. Reuse applicable successful evidence for the same source/environment; repeat affected checks after changes/failures. Request a manual APK/Maestro checkpoint when the changed behavior needs it. Hosted tests provide execution, diagnostics and artifacts; they do not create autonomous fix/commit loops or establish live/iOS/physical acceptance. When hosting is blocked or disabled, Codex runs the same local commands. Required local/native acceptance under ADR 0009 remains in force.

All actions are SHA-pinned, tokens are read-only, new checkouts do not persist credentials, and PR tests use `pull_request`, never `pull_request_target`. No secrets are supplied to tests. Public artifacts must contain only synthetic diagnostics. Dependency cache keys use the lockfile; Android caches additionally include the toolchain definition. Avoid sending private data to build logs.

## GitHub Free resources

On 18 October 2026 the repository API reported **PUBLIC**, with standard Actions enabled. [GitHub's current billing documentation](https://docs.github.com/en/billing/concepts/product-billing/github-actions) says standard hosted execution for public repositories is free. GitHub Free private allowances are **2,000 runner minutes/month**, **500 MB artifact storage** (shared with Packages) and a separate **10 GB cache allowance per repository**. Artifact storage accrues over time; cache storage and runner minutes are separate resources. These allowances do not establish this account's remaining capacity or remove account restrictions. Do not increase cache limits, budgets or billing. Older runs were rejected by a payment/spending restriction; the new fast run passed without any account/billing changes by this task.

These are planning ranges with headroom. The first actual fast job took **46s**, hosted APK **8m16s**, and hosted emulator/Maestro **3m09s**. Windows APK compilation took **4m45s**, and its Maestro flow **36s** (excluding setup). Local times are distinct from hosted measurements:

| Run | Estimated Ubuntu minutes | Example monthly workload |
| --- | --- | --- |
| Fast CI | 1–3 | 60 runs: 60–180 |
| Android APK | 8–20 cold; lower with warm caches | 4 builds: 32–80 |
| Maestro with reused APK | 3–8 | 4 runs: 12–32 |
| Total example | — | **104–292 minutes/month** |

Private usage would be account-wide, shared with other repositories; the example alone would be below 2,000, but no remaining quota was verified. Expensive workflows stay manual, no schedules/larger/Windows/macOS runners are introduced, and automatic superseded checks cancel. Jobs skip on private repositories until the owner deliberately reviews free eligibility; this is a visible skipped result, not a pass. Recheck visibility/pricing/quota before changing that guard.

The actual APK is 48.7 MB, compressed to **24.0 MB** in its artifact; successful hosted diagnostics were **0.165 MB**. Four such pairs, each retained for three days in a 30-day month, average about **9.7 MB** storage, with larger instantaneous peaks. Budgeting 50–80 MB APK artifacts plus 5–30 MB failure diagnostics instead gives about **22–44 MB** average for four pairs. Compression/failure sizes vary, and other repositories/Packages can share the account allowance. Inspect account storage and delete expired/unneeded artifacts rather than raising limits. The first cache inventory after building was **1.77 GB** across two caches; caches are evictable and no AVD/image or duplicate APK cache is added. Hosting account restrictions are recorded as blockers, never worked around with paid runners.

## Disable hosting / rollback

1. In Actions, disable the four named workflows, or delete their `.github/workflows/*.yml` files. `gh workflow disable ci.yml` (and the other filenames) is an equivalent authorized owner action. For local-only operation, no application, flow, test or core configuration change is needed.
2. If the owner later makes `Fast CI / quality` required, remove that required check from Settings → Rules → Rulesets or Branches → branch protection **before** disabling it. No such requirement was added here. Do not disable security protections unrelated to CI.
3. Run `pnpm install --frozen-lockfile`, then `npm run check` locally. Build/install with the Windows commands above and execute the guarded Maestro command on the synthetic AVD. No GitHub credentials are needed for any of those commands.
4. Keep `.node-version`, `eslint.config.js`, `scripts/`, `.maestro/`, the pnpm lockfile and package scripts: they contain the portable functionality. `scripts/find_android_artifact.py` and the older artifact planner are optional hosted adapters. Removing workflow YAML cannot disable local builds/tests.
5. Restore the YAML from Git and re-enable workflows when desired, after reviewing free eligibility/account restrictions. Workflow-policy checks explicitly report themselves skipped/inapplicable when their YAML has been removed; the application and portable tool checks continue. A regression verifies this local-only case. Avoid wholesale resets/reverts that discard other feature work, private sessions or generated caches.

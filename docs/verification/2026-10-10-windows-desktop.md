# Windows desktop continuation — 2026-10-10

Tracking: #6/#2. Baseline: `2cb98b98d463cbc7ba92a6eddec8a5029ce62d34`. This report accompanies the Windows portability/setup commit; the commit containing this file identifies the final changes. [Windows runbook](../development/windows-local-setup.md).

## Verified local environment

- Actual local PowerShell execution on `DESKTOP-MOMO`, Windows NT `10.0.26200.0`; not a cloud workspace. Checkout cloned into the requested Documents coding folder, clean `main` baseline, correct HTTPS origin. Synced project `sources/` were untouched.
- Git 2.51.0.windows.2; GitHub CLI authenticated as repository owner with repository access. Issues, recent commits, README, agent rules and relevant accepted/proposed ADRs inspected. Direct-main/no-PR workflow retained.
- Node 24.18.0 (within the pinned Node 24 major), pnpm 11.25.0, Python 3.12.10. Frozen dependency install passed. No package-version changes.
- Android Studio Rabbit 1 / 2026.2.1 installed during the user-controlled installation; its bundled JBR is Java 25.0.3. Separate portable Temurin 17.0.20.1+1 downloaded from the official Adoptium release, verified against its published SHA-256 and extracted outside Git. `java -version` passes via the session-only environment script.
- Official Google command-line-tools archive `15859902` checked against published SHA-256 `90ae805d20434428bffcb699c290860f19bb5f66a67e6b330067e3de801fb04a`; CLI version 22.0 runs with JDK 17. Emulator 37.2.12 reports `WHPX(10.0.26200) is installed and usable`. No virtualization/security setting changed.
- Setup subsequently installed Platform Tools 37.0.1, Build Tools 36.0.0, platform/sources 37.0 and the x86_64 Google Play API 37.0 image. ADB 1.0.41 runs. Created dedicated `MoFlight_API37` (Pixel 2 profile) without replacing the wizard-created Medium Phone AVD; emulator boot completed in approximately 83 seconds with WHPX. Actual guest reports SDK 37. The generated lab project requests compile/target SDK 36, Build Tools 36.0.0 and NDK 27.1.12297006; these build requirements are independent of the emulator's guest version.
- Windows Computer Use app inventory and actual Android Studio screenshots succeeded; local Chrome browser inventory succeeded. User stopped Computer Use with Escape; no further GUI actions followed in that turn. No provider login/credential entry was automated.

## Actual checks and repairs

| Check | Result / limit |
| --- | --- |
| Frozen dependency install | Passed |
| TypeScript typecheck | Passed |
| TypeScript tests | 20 passed, including ten synthetic provider reader/contract checks |
| Canonical fixture check | Initially failed because Windows `core.autocrlf=true` converted original evidence bytes; restored exact Git blobs, added fixture `-text` attributes; passed without changing canonical fixture content. Fresh Git checkout-index export independently preserves all original CSV/page/mobile bytes |
| Python reference tests | Initially 18/20: subprocess-pipe `select()` unsupported on Windows and POSIX permission assertion invalid on Windows. Bounded thread/queue startup handling and POSIX-only mode assertion retain substantive HTTP/backup checks; 20/20 passed |
| Diagnostic regression tests | Three upstream diagnostic regression tests pass: failed Logcat preserves checkpoint outcome and declares incomplete diagnostics; screenshot/cleanup failures preserve primary failure and attempt all cleanup; remaining cleanup attempted. One additional Windows test verifies UTF-8 evidence |
| Python complete suite / compilation | 24 passed; compileall passed |
| Android/iOS Hermes bundles | Passed, approximately 1.8 MB each; no native execution inferred |
| Expo native prebuild | Passed on Windows; generated Android directory ignored. No local iOS execution |
| Generated Gradle wrapper | 9.3.1 downloaded and `gradlew.bat --version` passed with Temurin 17 on Windows |
| Current standalone CI APK downloaded and inspected | Passed embedded-JavaScript and both arm64-v8a/x86_64 checks; source `2cb98b9`, run `38039006295`, 46,702,203 bytes, SHA-256 `a915bf100958c4cc06241d969326136e60d122775ccb52108af8b49e6ac347c8` |

Added Windows CI for frozen install, typecheck, mobile checks, fixture check and Python suite. Published Windows portability commit `da5fd52` completed [CI run 38042331748](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38042331748) successfully: Windows contracts, mobile contracts, host SQLite, Android plan, standalone APK compilation and synthetic native smoke all passed. This CI run is separate from the local API 37/runtime evidence. POSIX `0600` backup checking remains on POSIX; Windows ACL privacy is not established by these tests.

## Existing CI failure investigated

[Run 38039006295](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38039006295) built the current standalone APK successfully. Downloaded original `report.json` records **23 passed emulator checkpoints**, including credential-free access-probe opening/closing and all earlier copy/backup/offline checks. The job subsequently failed in `finish('passed')` because `adb shell logcat -d` exited 255. Thus the workflow failed and final Logcat evidence is missing despite the checkpoint report. These are Linux CI emulator results, not local Windows execution or live provider retrieval.

Concurrent upstream commit `797afdd` delivered the verdict/cleanup fix while this desktop task was running; fast-forwarded to that authoritative update and retained its implementation/tests instead of duplicating them. The Windows continuation bounds Logcat to the latest 2,000 lines, explicitly decodes/writes UTF-8 on Windows, and reports diagnostic/cleanup failures separately from native checkpoint results. Failed native checks still fail; collection failures cannot mask their original error. Diagnostics status is `complete` or `incomplete` with explicit sanitized diagnostic errors. Three upstream host failure-path tests and one Windows UTF-8 test pass; the integrated published collector was subsequently executed against the local emulator and reports complete diagnostics with no errors.

## Remaining blockers at this checkpoint

Initial SDK-installation blocker cleared: ADB and a dedicated API 37 emulator are now verified. Current CI standalone APK installed and launched natively without Metro; Computer Use visually verified the synthetic app after bringing the emulator forward. All 23 local native checkpoints passed, with complete final diagnostics; [original synthetic report](2026-10-10-windows-native-report.json) records the actual API 37 guest, APK identity, each checkpoint and harness/collector source distinction. This includes offline force-stop/reopen, exact queries, dataset isolation, selective copy, cancellation, external folder backup, real picker restore, checksum/oversize/malformed rejection, byte-for-byte re-export, preserved newer original database and credential-free probe open/close. These are local runtime results for the CI-built binary, not local compilation. Local Release compilation attempts and the remaining build experiment are recorded below. The matching CI APK is under ignored `local-data/current-apk/`.

The user completed authentication directly in the original HTTPS provider interface. Computer Use observed the authenticated personal flightbook inside the native WebView; the app automatically opened that page and reused the login session during retrieval. Two capture attempts timed out despite the visible flight table. This proves native login/page access, but **not successful retrieval or local persistence**. No personal rows, account identifiers or screenshots are included in committed evidence. Retrieval/reference comparison and offline reopening remain blocked by the capture timeout. Desktop browser access, bundles, synthetic contracts and credential-free CI probe opening do not pass R12. Export/structured-response investigation, provider identity/club binding, canonical import/full coverage and session/logout/expiry remain open under #2. No paid service, AI call, credentials, real flight data, production release or iOS execution was added.

Download preparation had recoverable failures: first SDK invocation had no JAVA_HOME; reran successfully with JDK 17. A duplicate JDK download timed out, while the original verified archive completed; a duplicate SDK extraction correctly refused to replace the installed command-line tools. Extra download files remain outside Git; they are not test evidence or alternative toolchain selections.

Primary download sources: [official Android tools](https://developer.android.com/studio), [Temurin 17 release](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.20.1%2B1). No arbitrary latest runtime/framework upgrade was selected.

## Local Release compilation investigation

The first pinned-wrapper build failed after 14m32s launching the long `expo-modules-core` Prefab batch path (CreateProcess error 2). A temporary `M:` alias to the existing coding parent did not fix it: pnpm retained physical absolute junction paths; the retry failed after 2m21s. All original checkout files and dependencies were preserved. An isolated `mf-native` build checkout at published commit `da5fd52`, still under the requested coding parent, uses the same frozen lockfile with a local hoisted dependency layout. Prior generated app dependencies were moved into its ignored `local-data/` for recovery. A package-manager invocation recreated those links and failed after 1m44s; direct Expo CLI invocation avoided that recreation.

A direct-node build through M: then failed after 1m33s because codegen and native module base paths had different drive roots. Re-generated and built using the physical C: checkout consistently; native configuration advanced, but Ninja rejected an object filename longer than 260 characters after 1m58s. Neither failure is an APK compilation pass. No SDK/framework version upgrade or Windows security setting change was used.

A generated-project-only experiment set `CMAKE_OBJECT_PATH_MAX=128` and an external short C++ staging directory under `%LOCALAPPDATA%/MoFlightBuild/cxx-mf-native`; it failed after 1m28s because the generated target directory itself exceeded 128 characters, preventing safe object-path shortening. Raising the limit to 250 allowed native C++ compilation to proceed, then the build failed after 3m12s resolving workspace packages during JavaScript bundling. Restoring only the two workspace-package junctions under the app's generated dependencies completed the build successfully in 4m21s. These experiments are not yet a committed app/config-plugin implementation or an adopted dependency-layout change. Failed-build logs remain in ignored `local-data/` in the respective checkout.

## Android bridge timeout correction

Inspection of pinned react-native-webview 13.16.1 Android source found `WebMessageListener.onPostMessage` passes `sourceOrigin.toString()` into the native message URL. The probe previously required that value to include the flightbook path, rejecting valid responses without reporting an error. Current source accepts an origin-only sender only with the separately observed top-level flightbook URL and identical origin; payload URL, nonce, size, schema and row limits remain enforced. Login and unrelated documents still fail closed. Seven synthetic provider tests (17 mobile tests total) and typecheck pass. Phase-only timeout diagnostics report page/load/progress/injection state without URLs, account identifiers, credentials or flight values. Actual updated native retrieval remains pending installation/testing.

### Successful local standalone builds

- Source `da5fd52`: Windows Release build **passed**, 4m21s, both arm64-v8a/x86_64 and embedded JavaScript verified; 46,702,207 bytes; SHA-256 `c02086df0eed546a7875e44dcf53854b77220f8d9c3baba82b97697527af0cbd`. Binary retained outside Git in the isolated checkout local-data.
- Source `24209d3`: rebuilt **successfully** in 1m26s; 46,702,903 bytes; SHA-256 `75e70bd0c739eab1de9ab6339c376376e8a80e53a21fede62fe4a2c0d109498c`. Embedded JavaScript/both architectures verified; `adb install -r` succeeded without clearing data; native launch passed. No Metro. Retrieval reused the signed-in provider session after app update and now returned an explicit table-validation error, confirming the bridge correction is executed. Successful capture/persistence is still unverified.
- The Windows runbook records the isolated hoisted/direct-Expo workflow. The generated-project helper applies the tested CMake limit/short staging settings; a local synthetic-file check verified valid generated output and unchanged repeated execution. The full build used the equivalent manually applied settings; a fresh clone/helper end-to-end repetition has not been run.

## Live Android bounded capture and restart

The original `2cb98b9` APK authenticated successfully but two retrievals timed out. Local `24209d3` build corrected the Android sender-origin handling and returned an explicit table-validation failure. Further native trials verified that heading text is unavailable through `innerText` but exact labels are available through `textContent`; the table has 24 columns, 20 column-aligned flight rows and one single-cell layout row spanning 99 columns. Current parser reads original heading text and excludes only full-width single-cell layout rows. Every remaining flight still requires the complete unique schema, matching width, valid date and a maximum of 20 records. No global document scan, schema guessing or new endpoint was retained. Synthetic hidden-heading/layout regressions also reject malformed/oversized lists.

The final local Release build passed in 1m23s. Binary: 46,705,159 bytes; SHA-256 `dfb7a4d899a27c0ff30fb1bd4eff61f5a767ea9dbb2a722b7ed35611afb118f2`. Embedded JavaScript and arm64-v8a/x86_64 verified. Build base is `24209d3` plus the parser changes published in the commit containing this evidence; primary/build-checkout parser SHA-256 independently matched `145322f35c8ee1b018279fade247417151f9a63bb96c08a3db8b24e025a15d71`. Other application sources are unchanged from that base. No Metro at runtime.

| Native gate | Actual local result |
| --- | --- |
| Original-page login | Passed: user-entered credentials; authenticated personal flightbook visibly rendered inside MoFlight |
| Automatic personal-page navigation | Passed without manual date selection; current default bounded provider list only |
| Session reuse after app updates | Passed during successive `adb install -r` updates, without clearing app data or re-entering credentials |
| Bounded retrieval/local save | Passed: app reported 20 visible personal-list rows saved in separate private SQLite; raw fields rendered |
| Representative visual check | First displayed capture date/aircraft/Pilot/PIC matched the previously observed source UI privately; no values included here. Full field/all-row comparison requested from user (Q4), pending |
| Offline force-stop/reopen | Passed: airplane mode enabled from original 0; active default network verified none; app force-stopped/reopened; saved capture timestamp and displayed first-row values unchanged |
| Failure preserves capture | Passed: provider load failed offline, but last saved capture remained visible |
| Network cleanup | Passed: original airplane-mode value 0 restored; connectivity recovery checked separately |

Private captures and source screenshots were not exported, copied into Git or sent to CI. The committed native JSON report remains the earlier **synthetic** 23-check report, not personal-flight evidence. Provider identity/club binding, full field/reference comparison, time basis, all-history scheduling/paging, verified export/structured response, canonical import/deduplication, long-lived session/expiry/logout/account switch and iOS remain open under #2. The table reader is an access experiment, not the chosen final transport. No passwords are stored by MoFlight or recorded in project files.

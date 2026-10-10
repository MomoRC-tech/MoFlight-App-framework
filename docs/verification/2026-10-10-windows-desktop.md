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
| TypeScript tests | 16 passed, including six synthetic provider reader/contract checks |
| Canonical fixture check | Initially failed because Windows `core.autocrlf=true` converted original evidence bytes; restored exact Git blobs, added fixture `-text` attributes; passed without changing canonical fixture content. Fresh Git checkout-index export independently preserves all original CSV/page/mobile bytes |
| Python reference tests | Initially 18/20: subprocess-pipe `select()` unsupported on Windows and POSIX permission assertion invalid on Windows. Bounded thread/queue startup handling and POSIX-only mode assertion retain substantive HTTP/backup checks; 20/20 passed |
| Diagnostic regression tests | Three upstream diagnostic regression tests pass: failed Logcat preserves checkpoint outcome and declares incomplete diagnostics; screenshot/cleanup failures preserve primary failure and attempt all cleanup; remaining cleanup attempted. One additional Windows test verifies UTF-8 evidence |
| Python complete suite / compilation | 24 passed; compileall passed |
| Android/iOS Hermes bundles | Passed, approximately 1.8 MB each; no native execution inferred |
| Expo native prebuild | Passed on Windows; generated Android directory ignored. No local iOS execution |
| Generated Gradle wrapper | 9.3.1 downloaded and `gradlew.bat --version` passed with Temurin 17 on Windows |
| Current standalone CI APK downloaded and inspected | Passed embedded-JavaScript and both arm64-v8a/x86_64 checks; source `2cb98b9`, run `38039006295`, 46,702,203 bytes, SHA-256 `a915bf100958c4cc06241d969326136e60d122775ccb52108af8b49e6ac347c8` |

Added Windows CI for frozen install, typecheck, 16 mobile checks, fixture check and Python suite. Its new run outcome must be recorded separately; local passes do not imply CI passed. POSIX `0600` backup checking remains on POSIX; Windows ACL privacy is not established by these tests.

## Existing CI failure investigated

[Run 38039006295](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38039006295) built the current standalone APK successfully. Downloaded original `report.json` records **23 passed emulator checkpoints**, including credential-free access-probe opening/closing and all earlier copy/backup/offline checks. The job subsequently failed in `finish('passed')` because `adb shell logcat -d` exited 255. Thus the workflow failed and final Logcat evidence is missing despite the checkpoint report. These are Linux CI emulator results, not local Windows execution or live provider retrieval.

Concurrent upstream commit `797afdd` delivered the verdict/cleanup fix while this desktop task was running; fast-forwarded to that authoritative update and retained its implementation/tests instead of duplicating them. The Windows continuation bounds Logcat to the latest 2,000 lines, explicitly decodes/writes UTF-8 on Windows, and reports diagnostic/cleanup failures separately from native checkpoint results. Failed native checks still fail; collection failures cannot mask their original error. Diagnostics status is `complete` or `incomplete` with explicit sanitized diagnostic errors. Three upstream host failure-path tests and one Windows UTF-8 test pass; actual repaired emulator collection still requires a subsequent native run.

## Remaining blockers at this checkpoint

Initial SDK-installation blocker cleared: ADB and a dedicated API 37 emulator are now verified. Current CI standalone APK installed and launched natively without Metro; Computer Use visually verified the synthetic app after bringing the emulator forward. Native offline/copy/backup checks are running and will be recorded separately on completion. Local Gradle Release compilation is also running; successful wrapper/plugin compilation is not an APK-build pass. The matching CI APK is under ignored `local-data/current-apk/`.

Native Vereinsflieger login, own-flight retrieval/reference comparison and offline reopening of a private capture remain untested. Desktop browser access, bundles, synthetic contracts and credential-free CI probe opening do not pass R12. Export/structured-response investigation, provider identity/club binding, canonical import/full coverage and session/logout/expiry remain open under #2. No paid service, AI call, credentials, real flight data, production release or iOS execution was added.

Download preparation had recoverable failures: first SDK invocation had no JAVA_HOME; reran successfully with JDK 17. A duplicate JDK download timed out, while the original verified archive completed; a duplicate SDK extraction correctly refused to replace the installed command-line tools. Extra download files remain outside Git; they are not test evidence or alternative toolchain selections.

Primary download sources: [official Android tools](https://developer.android.com/studio), [Temurin 17 release](https://github.com/adoptium/temurin17-binaries/releases/tag/jdk-17.0.20.1%2B1). No arbitrary latest runtime/framework upgrade was selected.

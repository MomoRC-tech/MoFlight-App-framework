# Windows local development

Tracking: [#6](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/6), native provider gate [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2). [Actual desktop evidence](../verification/2026-10-10-windows-desktop.md) records completed checks separately from pending installation/runtime checks.

## Checkout and session configuration

The checkout is `C:\Users\Momo\Documents\30_Coding\03_chatGPT work folder\MoFlight-App-framework`. Node 24, pnpm 11.25.0 and Python 3.12 follow the repository pins. Android Studio runs on its own bundled Java; the lab build uses JDK 17 through its generated Gradle wrapper. No global Java replacement is needed.

```powershell
Set-Location -LiteralPath 'C:\Users\Momo\Documents\30_Coding\03_chatGPT work folder\MoFlight-App-framework'
. .\scripts\windows-android-env.ps1
# For a different existing JDK/SDK:
# . .\scripts\windows-android-env.ps1 -JavaHome 'C:\path to\jdk17' -SdkRoot 'C:\path to\Sdk'
pnpm install --frozen-lockfile
pnpm check
# At a platform integration checkpoint:
pnpm bundle
pnpm --filter @moflight/platform-lab prebuild:check
```

`pnpm check` needs the installed Node/pnpm/Python runtimes, not Android tooling. It reports all five host checks concisely and saves diagnostics in ignored `build/host-checks/`; use focused commands for smaller edits as described in the [workflow](verification-workflow.md#local-checks-without-model-calls).

The workspace disables pnpm's implicit pre-script install so `pnpm check`/`pnpm exec` preserve the existing dependency layout. Install explicitly after dependency changes; use `--node-linker=hoisted` in the short Windows native checkout and the ordinary frozen install in the primary host checkout. Read-only validation rejects broken workspace aliases. Native validation also rejects lingering `.pnpm` paths in generated autolinking/CMake files: preserve that checkout and choose a new short build directory instead of resetting it. See the [portable runbook](portable-ci.md) for the guard and image-only bundle inputs.

The environment script changes only the current terminal session. Its default portable JDK location is the checkout's sibling `dev-tools\jdk17\jdk-17.0.20.1+1`; pass `-JavaHome` for another JDK 17 installation. It checks the Java major version and warns if ADB is absent. SDK default is `%LOCALAPPDATA%\Android\Sdk`. Pinned fixture bytes include their original line endings; `.gitattributes` disables Git text conversion for these fixtures. Do not regenerate fixtures to compensate for checkout conversion.

## Finish Android tooling

Complete the Android Studio setup wizard and review its SDK licenses yourself. Verify SDK Platform Tools, Android Emulator and a compatible x86_64 Google APIs system image in SDK Manager. API 35 matches the existing CI acceptance environment; an already-installed compatible image can be used with its actual API recorded. Create a dedicated disposable `MoFlight` emulator in Device Manager. The existing smoke harness clears this lab package on emulators and refuses to clear physical-phone data; do not sign into Vereinsflieger until the synthetic smoke suite has completed.

Check the actual tools before claiming readiness:

```powershell
. .\scripts\windows-android-env.ps1
sdkmanager.bat --list_installed
emulator.exe -accel-check
emulator.exe -list-avds
adb.exe devices -l
```

Missing SDK packages should follow the generated project's requirements; use its Gradle wrapper rather than installing arbitrary global Gradle versions. Do not disable Windows security or virtualization protections to work around an emulator failure. Windows Hardware Acceleration Platform was already usable during the initial desktop check.

## Standalone build and native checks

Once SDK setup and emulator boot complete:

```powershell
pnpm --filter @moflight/platform-lab android:offline
python scripts/android_smoke.py --check-apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk
python scripts/android_smoke.py --apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk --output local-data/windows-android-smoke
```

The CI binary contains both arm64-v8a and x86_64; the APK validation script currently requires both architectures. If a local build restricts architectures, explicitly build both using `gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --max-workers=2` from the generated Android directory before using that validation. Quote the comma-containing architecture argument in PowerShell.

An already-compiled matching CI APK can independently establish local emulator runtime behavior:

```powershell
gh run download 38039006295 -n moflight-synthetic-android-offline -D local-data/current-apk
python scripts/android_smoke.py --check-apk local-data/current-apk/app-release.apk
python scripts/android_smoke.py --apk local-data/current-apk/app-release.apk --output local-data/windows-android-smoke
```

Record its source commit and SHA-256. This is execution of a CI-built binary, not local compilation. Run the synthetic suite before live provider access; later smoke runs must not clear a provider-test emulator containing private captures.

Normal Debug builds require Metro. Release-configuration lab builds embed JavaScript and need no Metro; verify force-stop/reopen in airplane mode using those builds. No production signing or store publication is involved.

## Windows path-length workaround

The long Documents checkout plus pnpm's nested dependency paths failed to launch Prefab; a drive alias alone retained physical junction paths and also caused mixed-drive codegen failures. A separate build checkout under the same coding parent successfully compiled with the **same frozen lockfile** using hoisted dependencies, consistent physical C: paths, shortened C++ staging and CMake object-path hashing. Keep the primary checkout's dependency layout unchanged. Use a new directory name if `mf-build` already exists:

```powershell
Set-Location -LiteralPath 'C:\Users\Momo\Documents\30_Coding\03_chatGPT work folder'
git clone .\MoFlight-App-framework .\mf-build
Set-Location .\mf-build
. .\scripts\windows-android-env.ps1
pnpm install --frozen-lockfile --node-linker=hoisted
# Invoke Expo directly: a package-manager wrapper may restore the default layout.
Set-Location apps/platform-lab
node ..\..\node_modules\expo\bin\cli prebuild --no-install --platform android
Set-Location ..\..
. .\scripts\configure-windows-native-build.ps1
Set-Location apps/platform-lab/android
$env:NODE_ENV = 'production'
.\gradlew.bat :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --no-daemon --max-workers=2
```

The helper changes only ignored generated `app/build.gradle`, placing the C++ cache under `%LOCALAPPDATA%/MoFlightBuild`. Re-run it after regenerating Android. The tested `mf-native` checkout initially had nested app dependencies from an earlier standard install: those were preserved in ignored local-data, and only its two `@moflight` workspace junctions were restored in app/node_modules. A fresh hoisted install should supply these links; check them if bundling cannot resolve workspace packages. This is a local build workaround, not a framework/SDK upgrade or a global Windows setting change. [Recorded build outcomes](../verification/2026-10-10-windows-desktop.md#local-release-compilation-investigation).

## Repeatable local build command

Run from a clean committed source checkout. The helper defaults to a separate `%USERPROFILE%\mf-build` checkout, validates its origin and refuses tracked/untracked changes before switching commits. It never resets or copies private source files. Use another `-BuildDirectory` if that location belongs to other work. Supply the installed JDK 17 explicitly; SDK defaults to Android Studio's standard location.

If another task has source drafts, explicitly pass `-SourceRef COMMIT_SHA` to build only that committed snapshot; drafts remain untouched and are excluded. Without an explicit source ref, a dirty source is rejected. A dirty build checkout is always rejected.

```powershell
$jdk = 'C:\Users\Momo\Documents\30_Coding\03_chatGPT work folder\dev-tools\jdk17\jdk-17.0.20.1+1'
.\scripts\build-android-local.ps1 -JavaHome $jdk
# Select an existing source commit; retain caches between builds.
.\scripts\build-android-local.ps1 -JavaHome $jdk -SourceRef HEAD
# Build/install a development client on a selected synthetic emulator.
.\scripts\build-android-local.ps1 -JavaHome $jdk -Configuration Debug -InstallSerial emulator-5558
.\scripts\build-android-local.ps1 -JavaHome $jdk -Configuration DevServer
```

The helper retains the hoisted install, generated native tree and Gradle/C++ caches. Native configuration is regenerated when committed package/lockfile/app config/plugin inputs change. SDK/Gradle compilation failures stop the command; successful builds write ignored `local-data/build-release.json` or `build-debug.json` with source SHA, APK checksum, configuration and measured durations. Release builds verify embedded JavaScript and both device architectures. Normal Debug builds need Metro; they cannot establish offline restart.

Follow the [approved verification workflow](verification-workflow.md): use relevant tests/types and existing Metro tooling during iteration; batch standalone Release builds and focused native trials at planned integration acceptance. Do not run a full visual matrix for logic-only edits or rebuild for every commit. Documentation-only changes need no app build/device trial. Rebuild/retest affected behavior after a native finding, retaining source provenance and unrelated evidence.

DevServer disables Expo's automatic TypeScript setup; this repository already pins TypeScript and has a strict workspace tsconfig. Continue running `pnpm typecheck` separately. This prevents a generated app tsconfig from dirtying the build checkout. It also uses IPv4-first localhost resolution so Metro binds the loopback address reachable through ADB reverse on Windows, without exposing a LAN server.

For screen/logic iteration, edit in the dedicated build checkout while Metro runs, then commit those changes deliberately back to the authoritative repository before a standalone checkpoint. The helper refuses to overwrite dirty edits; do not run it to switch commits while editing. Commit in the build checkout, then from the authoritative checkout use `git fetch C:/Users/Momo/mf-build HEAD` and `git merge --ff-only FETCH_HEAD`; if main has advanced, reconcile explicitly rather than resetting either checkout. Push only from the authoritative checkout after checks. Keep versioned native configuration in Expo app config/plugins, because native files are generated. ADB reverse maps the emulator to Metro: `adb -s SERIAL reverse tcp:8081 tcp:8081`. Open the development client using its launcher or development URL. Rebuild Debug after native dependency/configuration changes.

### Synthetic emulator isolation

Create a dedicated AVD named exactly `MoFlight_Synthetic_API37` using the already installed API 37 x86_64 image. Keep `MoFlight_API37` for the provider-session trial. Start the synthetic AVD on an unused port, identify its serial with `adb devices`, and pass that serial explicitly:

```powershell
# The rollout created this dedicated AVD; port 5558 must be unused.
Start-Process "$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe" -WindowStyle Hidden -ArgumentList '-avd MoFlight_Synthetic_API37 -port 5558 -no-window -no-audio -no-snapshot -gpu swiftshader -memory 2048'
# Wait for boot completion and verify its name before selecting it.
adb -s emulator-5558 shell getprop sys.boot_completed
adb -s emulator-5558 emu avd name
.\scripts\build-android-local.ps1 -JavaHome $jdk -SmokeSerial emulator-5558
```

The helper checks the AVD name before the smoke harness resets app data. The harness also refuses physical phones. Do not log into providers on the synthetic AVD. Evidence remains under the build checkout's ignored `local-data/android-smoke/`.

### Hosted checkpoints

Manuel approved optional hosted CI and no paid CI on 2026-10-12. The 18 October handover supersedes manual-only fast validation: main pushes/PRs run one fast Ubuntu job; Android builds and UI checks remain manual. The [portable CI runbook](portable-ci.md) documents all local equivalents and rollback. Complete the documented committed-source local checks/build and applicable native trials before scoped acceptance or device handoff under amended [ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md). Hosted billing restrictions are not an acceptance gate when required local evidence is complete. Do not raise spending limits/change billing or dispatch a run without confirmed free eligibility.

If an optional free hosted checkpoint is desired, select **Android checkpoint → Run workflow** and optionally supply a commit/ref and force fresh compilation. Its planner pins the resolved source and records the compiled source when reusing an identical-input APK. Manual runs have independent concurrency groups. A cancelled/untriggered run is not a passing test; missing local feature/native evidence remains open. Private sessions, captures and credentials never enter hosted tests.

## Encrypted desktop development login

Tracking: [#102](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/102). Manuel approved this local development store on 28 October 2026 to avoid repeated manual login entry. It is separate from the app's device-local saved login.

Run from this checkout in **Windows PowerShell 5.1**:

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File scripts/desktop-credentials.ps1 -Action Setup
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/desktop-credentials.ps1 -Action Status
```

Setup opens a local credential prompt for the Vereinsflieger login. Cancel preserves the existing record; submitting replaces it. Both login name and password are encrypted using Windows user-bound DPAPI, with no separately stored encryption key. The record is `%LOCALAPPDATA%\MoFlight\secrets\vereinsflieger.dpapi.json`, outside the checkout. The directory and record allow only the current Windows user and SYSTEM. Never commit or copy the record into evidence, cloud storage or Git; re-enter credentials on another PC/account. Programs running as the same Windows user can decrypt it, so this is protection at rest rather than isolation from that user's programs. See [Microsoft's DPAPI-backed PowerShell documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.security/convertfrom-securestring).

For an authorized development login, import `scripts/desktop-credentials.psm1` and **assign** `$credential = Get-MoFlightCredential` within the consuming PowerShell process. This returns a `PSCredential`; use it only with the intended Vereinsflieger login and dispose `$credential.Password` afterwards. Never print the object, call `GetNetworkCredential()` into tool output, put secrets in command arguments, or dump the environment. The CLI exposes only Setup and Status, without plaintext output. Existing UI automation may need a separate integration to consume credentials without exposing them through tool arguments; do not improvise by pasting them into chat. MFA/CAPTCHA remain manual when required.

Focused verification: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/desktop-credentials.test.ps1`. On 28 October 2026, Windows PowerShell 5.1 synthetic checks passed for both encrypted fields, exact round-trip, missing/corrupt records, rejected overwrite preserving bytes, explicit replacement and protected directory/file ACLs. Test data was removed. No provider login, other-account decryption test, app build or device trial was performed; the helper does not change app behavior. Real entry is accepted only once Status reports saved and decryptable, without displaying either field.

Desktop launcher correction, 28 October 2026 (#102): the first interactive launch failed to autoload `Microsoft.PowerShell.Security` because `Start-Process` inherited another PowerShell installation's module search paths. The helper now explicitly imports the executing host's built-in Security, Utility and Management manifests into global scope. The focused synthetic suite, including host-module assertions, passed through the same `Start-Process` Windows PowerShell launch route with inherited module paths (exit 0, no stderr). The original direct-process synthetic evidence did not cover this launch boundary. Setup was relaunched; actual user entry/decryptability remains a separate status check.

Real-entry verification, 28 October 2026 (#102): Manuel confirmed saving his login; the Status command subsequently reported **saved and decryptable**, without displaying either field. Root [AGENTS.md](../../AGENTS.md) records discovery and permission for necessary MoFlight development/verification logins. Storage acceptance is complete; actual provider login and secure UI-automation consumption remain untested.

Scoped desktop continuation, 30 October 2026 (#10): [the project API Anything helper](../../pocs/vereinsflieger-api-anything/README.md#live-continuation--30-october-2026) now consumes that existing record over a child stdin pipe and verifies the protected own-flight page before saving its session. `pnpm vf:login` passed a fresh original-form login and a returning-session check with no second submission. Wait for the provider to enable its button naturally; do not expose the credential or remove the disabled attribute. This establishes the named research consumer only, not arbitrary UI automation, another Windows/account context or native/mobile login acceptance.

Scoped native consumer proof, 30 October 2026 (#102/#101): [actual financial trial](../verification/2026-10-28-expense-source-contract.md#actual-native-billed-capture-and-offline-reopen--30-october-2026) reused the existing encrypted record through an anonymous process pipe and verified native key events in the original Android provider login. The protected profile matched the existing local account binding. Credential values were not placed in command text, logs, screenshots or committed evidence; no native saved-login record was added. This one-off consumer needed genuine Windows platform/profile metadata because its child environment omitted `OS`, and original-form automatic capitalization affected the login name. It proves this named local consumer only, not production credential transfer, another Windows/provider account or arbitrary automation. Preserve MFA/CAPTCHA handoff when required.

## Live Vereinsflieger gate

Use the [native access-probe sequence](../../apps/platform-lab/README.md#vereinsflieger-access-poc). The user enters credentials directly into the provider interface. Verify native login, bounded retrieval and source comparison, local persistence after offline restart, repeat retrieval and actual session reuse/expiry separately. Inspect verified export/structured-response behavior before choosing a final transport; the current visible-table probe remains bounded and cannot prove full history or canonical import. No guessed endpoints. Optional device-local saved login was subsequently authorized for development and implemented with explicit app entry; see [saved-login evidence](../verification/2026-10-10-vereinsflieger-saved-login.md).

Private captures, screenshots of personal flights, logs containing personal information, exports and databases stay outside Git. `local-data/` is ignored. Windows cannot establish iOS runtime acceptance.

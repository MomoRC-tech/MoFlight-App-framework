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
pnpm typecheck
pnpm test
python scripts/mobile_fixtures.py --check
python -m unittest discover -s tests -v
pnpm bundle
pnpm --filter @moflight/platform-lab prebuild:check
```

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

## Live Vereinsflieger gate

Use the [native access-probe sequence](../../apps/platform-lab/README.md#vereinsflieger-access-poc). The user enters credentials directly into the provider interface. Verify native login, bounded retrieval and source comparison, local persistence after offline restart, repeat retrieval and actual session reuse/expiry separately. Inspect verified export/structured-response behavior before choosing a final transport; the current visible-table probe remains bounded and cannot prove full history or canonical import. No guessed endpoints or app-owned password storage.

Private captures, screenshots of personal flights, logs containing personal information, exports and databases stay outside Git. `local-data/` is ignored. Windows cannot establish iOS runtime acceptance.

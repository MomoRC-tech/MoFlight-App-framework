# ARM64 demo handoff — 16 October 2026

## Scope and acceptance

Manuel agreed to a phone-compatible demo build and a short physical-device test before expanding functionality. This is an M1 packaging/device-verification deliverable, tracked under existing Issue #5; no new feature or technology decision. Dependencies are the committed four-screen demo, existing local Android toolchain and an identified compatible Android phone. Acceptance requires an inspected standalone APK and observed physical-device results using the [short checklist](2026-10-16-physical-phone-checklist.md). A successful build is not physical-device acceptance.

Application source: `2090f79` (only documentation changes since native-tested application commit `b1d806a`). The [previous native report](2026-10-16-ui-fidelity-width-matrix.md) records 130 host tests and 50 synthetic emulator checkpoints. Those results remain historical evidence for the application code; they do not establish ARM64 physical runtime results.

## Packaging

The existing short-path build checkout `C:/Users/Momo/mf-ui-build` was clean before switching to the explicit committed source. The previous dual-ABI, tested APK was preserved separately under ignored `local-data/phone-demo/MoFlight-demo-universal-tested.apk`. The phone build changes only the Gradle architecture parameter to `arm64-v8a`:

```powershell
# Existing JDK/SDK environment loaded first; clean committed build checkout.
./gradlew.bat :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2
```

No dependencies, app data contracts, services, migrations, signing identity or UI functionality were changed. This remains the development-signed standalone lab APK, not a production distribution release. It has the same application ID/version as the previous demo. Do not uninstall/clear an existing installation to resolve any update problem; preserve its data and inspect the error first.

Build/package inspection: **PASSED** (Windows, existing JDK 17.0.20.1+1 / Android SDK, Gradle 9.3.1; Release build including `lintVitalRelease`, 1m 33s). No full host-suite rerun was needed for this packaging-only change: APK extraction proved the JavaScript and every included ARM64 library byte-for-byte identical to the earlier native-tested APK. No ARM64 runtime execution is claimed.

| Property | Measured result |
| --- | --- |
| Source commit | `2090f7942f6962d3fd32bc72c9b6ba0fa1616c97` |
| APK | `local-data/phone-demo/MoFlight-demo-arm64.apk` (ignored local build artifact; not committed) |
| Size | **29,659,054 bytes (29.7 MB)**, **37.8% smaller** than 47,718,199-byte dual-ABI APK |
| SHA-256 | `ca2970dd34c99e7dd70722066cc1bb2762f8e2abd10e00ab4db2d3601c161e65` |
| Package/version | `de.momorc.moflight.lab`, 0.1.0 / versionCode 1 |
| Manifest compatibility | Minimum API 24 (Android 7.0), target API 36, **ARM64 only**; actual phone must support this ABI |
| Signature | Android APK v2 verification passed; certificate matches the earlier dual-ABI demo |
| Package checks | ZIP CRC integrity passed; nonempty embedded JavaScript; exactly `arm64-v8a`; all included ARM64 libraries and JavaScript match the tested demo |

[Machine-readable package evidence](evidence/android-2026-10-16-phone-demo/phone-build.json). The standard `build-android-local.ps1` remains the dual-ABI emulator/default path; this one-off phone build used the explicit Gradle parameter above. The build checkout's earlier `local-data/build-release.json` belongs to the old dual-ABI artifact and is not used as evidence for the phone APK. No APK was installed on the x86_64 emulator because this artifact targets ARM64.

## Physical device gate

ADB inventory at preparation showed only `emulator-5554` (synthetic x86_64 AVD). No physical phone was connected. Phone model, Android version and ARM64 compatibility are pending user confirmation. No physical phone was installed, reset, modified or tested. Do not run emulator-reset/fixture smoke automation on a physical phone.

Physical-device status: **PENDING — device unavailable**. Complete the checklist on the actual phone, record observed outcomes and failures, then decide whether the demo passes the scoped handoff. Live weather/club/cloud AI and iOS runtime remain outside this demo's verified scope.

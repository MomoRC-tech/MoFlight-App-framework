# Android standalone lab and emulator evidence — 2026-10-09

Tracking: #4/#6/#7/#8/#9. Current authoritative main checked before work: `7fc060879593622988f9ff79c3a83a0d0390214f`. It contains the previous native implementation and its completed Android debug-build evidence. [Run 37798595010](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010) was checked again: host, mobile-contract and android-debug jobs all completed successfully. An APK that requires Metro cannot establish an offline startup; this follow-up addresses that gap without selecting a new stack.

## Changes and scope

The existing push workflow now builds `assembleRelease` with embedded Expo/Hermes JavaScript and arm64-v8a/x86_64 native libraries. APK inspection checks the actual ZIP contents before upload. The generated Expo debug key signs this local lab variant; no production signing, store publication, EAS or paid service is configured. The previous debug APK/evidence remains historical.

The same APK is installed on a disposable API 36 x86_64 Android emulator through `reactivecircus/android-emulator-runner@v2`. Python standard-library UI automation calls adb/uiautomator and ordinary app buttons. Buttons have explicit accessibility labels. There is no injected SQLite database, test-only app API or alternate runtime writer. The script refuses physical-phone reset, bounds subprocess/UI waits and records screenshots, actual APK hash/size, device properties, checkpoint results, last XML and logcat. A failed checkpoint fails CI rather than being reported as a pass.

Checks: empty install without Metro; prepared synthetic import; effective aircraft override and exact count of four ASK 21 flights; snapshot creation; force-stop/relaunch with airplane mode enabled and Wi-Fi/cellular disabled; same snapshot ID and retained paper/decision/query state; empty B dataset; persistent B selection and preserved A dataset; repeated import without duplicates/snapshot changes. Template viewing/preparation must still leave nine confirmed paper rows. Original prepared observations and CSV are **synthetic**, not handwriting recognition or live Vereinsflieger retrieval.

## Actual results

Local environment remains Linux / Node 24.19.0 / pnpm 11.25.0 / Python 3.12, without Android SDK/adb/Xcode. `pnpm typecheck` passed; `pnpm test` passed 10/10; `pnpm fixtures:check` passed; Python host tests passed 20/20; Python compilation of the new script and `git diff --check` passed. Preparing the workflow or inspecting source does not pass native acceptance.

Published implementation: [6957ce2](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/6957ce2a9529acc86d77b09cbccec4e01f3be0ff). Remote [run 37993298923](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37993298923) completed with **failure**, despite successful compilation:

| Step | Actual result |
| --- | --- |
| Host and mobile-contract jobs | Success: 20 host / 10 TypeScript tests, strict types, fixture parity, both bundles/configuration |
| Android `assembleRelease` | Success: Gradle 11m 18s, 546 executed tasks |
| Actual APK inspection | Success: embedded JavaScript, arm64-v8a/x86_64 libraries; APK 46,101,450 bytes, SHA-256 `69b113991096d1856917c7c027621cb5b4482ff76d18b06f843fc28d39251d59` |
| Artifact upload | Success: [standalone APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37993298923/artifacts/11646019019), 22,058,712 bytes; ZIP SHA-256 `af272a3d8f95d3ae88e0859f65888f5813365025acb2f0a310b9550d04f324d6`; expires 2026-10-16 |
| Emulator setup / UI checks | Failed downloading the API 36 system image: **No space left on device**. Emulator never launched; zero app checkpoints ran and no emulator evidence artifact exists for this attempt. |

The connector returned a ZIP file reference, but direct local materialization returned HTTP 403, so no independent local APK inspection or installation is claimed. The actual archive checks above were read from completed CI logs. Supabase preflight repeated: blocked / exit 2, no requests sent.

### Runner correction and bounded artifact reuse

APK compilation and emulator execution now use separate Ubuntu runners. The emulator runner downloads the actual uploaded APK; it does not retain the compiler's large intermediates. `android_build_plan.py` permits reuse only for an unexpired artifact whose recorded source commit differs from current main exclusively in documentation and listed CI/emulator harness paths. Every other changed path (including dependencies, fixtures, native app and domain/storage files) forces compilation; deleted/moved input files are not hidden by rename detection. Read/metadata/diff errors fall back to compilation. Read-only Actions access is used, and the selected run/source commit is printed.

This correction reuses the successful binary from 6957ce2 after proving its app input tree unchanged. It does not claim a new binary build or device success for a CI-only edit. Native emulator execution on the clean runner remains **pending** at this correction commit; actual retry outcomes will be recorded after completion. Build and emulator jobs have independent 40/15-minute bounds.

## Remaining acceptance

This bounded Android emulator sequence cannot pass physical-device/iOS acceptance, visual readability/large-text/orientation checks, entry-level copy confirmation or externally saved backup/document-picker restore. Backups remain unencrypted experimental lab files. No cloud sessions, Auth recovery/RLS/private files, account linking/sync, handwriting, live Vereinsflieger access or SPL retrieval evaluation is added. Supabase still requires a disposable free project/two synthetic sessions; own-flight access still requires supported documentation/permission. No paid AI calls occur.

## Reproducible sources

- [Workflow](../../.github/workflows/host-lab.yml), [emulator script](../../scripts/android_smoke.py) and [runbook/manual gates](../../apps/platform-lab/README.md).
- [Android emulator command-line reference](https://developer.android.com/studio/run/emulator-commandline).
- [Emulator-runner maintained instructions](https://github.com/ReactiveCircus/android-emulator-runner), reviewed 2026-10-09 for API/architecture, headless launch, KVM and bounded custom scripts. A CI support action does not change the approved app architecture.

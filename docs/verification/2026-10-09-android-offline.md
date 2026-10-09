# Android standalone lab and emulator evidence — 2026-10-09

Tracking: #4/#6/#7/#8/#9. Current authoritative main checked before work: `7fc060879593622988f9ff79c3a83a0d0390214f`. It contains the previous native implementation and its completed Android debug-build evidence. [Run 37798595010](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010) was checked again: host, mobile-contract and android-debug jobs all completed successfully. An APK that requires Metro cannot establish an offline startup; this follow-up addresses that gap without selecting a new stack.

## Changes and scope

The existing push workflow now builds `assembleRelease` with embedded Expo/Hermes JavaScript and arm64-v8a/x86_64 native libraries. APK inspection checks the actual ZIP contents before upload. The generated Expo debug key signs this local lab variant; no production signing, store publication, EAS or paid service is configured. The previous debug APK/evidence remains historical.

The same APK is installed on a disposable API 36 x86_64 Android emulator through `reactivecircus/android-emulator-runner@v2`. Python standard-library UI automation calls adb/uiautomator and ordinary app buttons. Buttons have explicit accessibility labels. There is no injected SQLite database, test-only app API or alternate runtime writer. The script refuses physical-phone reset, bounds subprocess/UI waits and records screenshots, actual APK hash/size, device properties, checkpoint results, last XML and logcat. A failed checkpoint fails CI rather than being reported as a pass.

Checks: empty install without Metro; prepared synthetic import; effective aircraft override and exact count of four ASK 21 flights; snapshot creation; force-stop/relaunch with airplane mode enabled and Wi-Fi/cellular disabled; same snapshot ID and retained paper/decision/query state; empty B dataset; persistent B selection and preserved A dataset; repeated import without duplicates/snapshot changes. Template viewing/preparation must still leave nine confirmed paper rows. Original prepared observations and CSV are **synthetic**, not handwriting recognition or live Vereinsflieger retrieval.

## Actual results

Local environment remains Linux / Node 24.19.0 / pnpm 11.25.0 / Python 3.12, without Android SDK/adb/Xcode. `pnpm typecheck` passed; `pnpm test` passed 10/10; `pnpm fixtures:check` passed; Python host tests passed 20/20; Python compilation of the new script and `git diff --check` passed. Preparing the workflow or inspecting source does not pass native acceptance.

Remote execution: **pending** at this commit. No emulator, installation or standalone startup success is claimed yet. The workflow has a 40-minute bound and stores failure evidence where available.

## Remaining acceptance

This bounded Android emulator sequence cannot pass physical-device/iOS acceptance, visual readability/large-text/orientation checks, entry-level copy confirmation or externally saved backup/document-picker restore. Backups remain unencrypted experimental lab files. No cloud sessions, Auth recovery/RLS/private files, account linking/sync, handwriting, live Vereinsflieger access or SPL retrieval evaluation is added. Supabase still requires a disposable free project/two synthetic sessions; own-flight access still requires supported documentation/permission. No paid AI calls occur.

## Reproducible sources

- [Workflow](../../.github/workflows/host-lab.yml), [emulator script](../../scripts/android_smoke.py) and [runbook/manual gates](../../apps/platform-lab/README.md).
- [Android emulator command-line reference](https://developer.android.com/studio/run/emulator-commandline).
- [Emulator-runner maintained instructions](https://github.com/ReactiveCircus/android-emulator-runner), reviewed 2026-10-09 for API/architecture, headless launch, KVM and bounded custom scripts. A CI support action does not change the approved app architecture.

# Android standalone lab and emulator evidence — 2026-10-09

Tracking: #4/#6/#7/#8/#9. Current authoritative main checked before work: `7fc060879593622988f9ff79c3a83a0d0390214f`. It contains the previous native implementation and its completed Android debug-build evidence. [Run 37798595010](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010) was checked again: host, mobile-contract and android-debug jobs all completed successfully. An APK that requires Metro cannot establish an offline startup; this follow-up addresses that gap without selecting a new stack.

## Changes and scope

The existing push workflow now builds `assembleRelease` with embedded Expo/Hermes JavaScript and arm64-v8a/x86_64 native libraries. APK inspection checks the actual ZIP contents before upload. The generated Expo debug key signs this local lab variant; no production signing, store publication, EAS or paid service is configured. The previous debug APK/evidence remains historical.

The same APK is installed on a disposable x86_64 Android emulator (first attempts API 36; reduced-overhead retry API 35) through `reactivecircus/android-emulator-runner@v2`. Python standard-library UI automation calls adb/uiautomator and ordinary app buttons. Buttons have explicit accessibility labels. There is no injected SQLite database, test-only app API or alternate runtime writer. The script refuses physical-phone reset, bounds subprocess/UI waits and records screenshots, actual APK hash/size, device properties, checkpoint results, last XML and logcat. A failed checkpoint fails CI rather than being reported as a pass.

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

An initial direct local download returned HTTP 403. The provided archive was subsequently materialized successfully: independent local ZIP/APK SHA-256 checks match the completed CI logs exactly, and local APK inspection confirms the embedded bundle and arm64-v8a/x86_64 libraries. This is byte/structure verification, not local installation; there is still no local Android SDK/device. Supabase preflight repeated: blocked / exit 2, no requests sent.

### Runner correction and bounded artifact reuse

APK compilation and emulator execution now use separate Ubuntu runners. The emulator runner downloads the actual uploaded APK; it does not retain the compiler's large intermediates. `android_build_plan.py` permits reuse only for an unexpired artifact whose recorded source commit differs from current main exclusively in documentation and listed CI/emulator harness paths. Every other changed path (including dependencies, fixtures, native app and domain/storage files) forces compilation; deleted/moved input files are not hidden by rename detection. Read/metadata/diff errors fall back to compilation. Read-only Actions access is used, and the selected run/source commit is printed.

This correction reuses the successful binary from 6957ce2 after proving its app input tree unchanged. It does not claim a new binary build or device success for a CI-only edit. Native emulator execution on the clean runner remains **pending** at this correction commit; actual retry outcomes will be recorded after completion. Build and emulator jobs have independent 40/15-minute bounds.

### First clean-runner retry

[Run 37994882226](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37994882226), source d7a53ef: plan, host and mobile-contract jobs passed. Input verification reused the unchanged 6957ce2 APK; compilation correctly skipped. The clean runner installed the API 36 image and booted the emulator in 91 seconds, then installed the checked APK. The UI readiness check failed before the first checkpoint. [Failure evidence](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37994882226/artifacts/11646932353) reports zero passed checks; last XML contains **System UI isn't responding**. This identifies a blocking emulator dialog, not a confirmed app startup or SQLite pass. The truncated logcat does not resolve any earlier app error.

The next harness retry uses API 35, current SwiftShader mode, disabled cameras/snapshots and a smaller recorded 480x800/160dpi software display with 2 GiB RAM. Target/compile SDK remains 36 and the APK/source is unchanged. Full launch logcat and a failure screenshot replace truncated failure evidence. No infrastructure error is ignored or counted as a native pass. These changes address emulator overhead; actual app startup/storage verification is still pending.

### API 35 diagnostic result

[Run 37995758653](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37995758653), source 44fcdaa: plan/host/mobile checks passed and reused the same APK. The API 35 emulator booted in 55 seconds. Readiness failed again with zero formal checkpoints. This time [full evidence](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37995758653/artifacts/11647048242) contains a **Pixel Launcher isn't responding** dialog. Its screenshot visibly shows the loaded MoFlight empty-state screen behind that dialog; logcat records React Native running main and native expo-sqlite loading successfully. No formal storage/restart pass is inferred from those observations.

The next bounded harness correction disables network before installation and explicitly records/closes only those two exact background launcher/System UI ANR dialogs. It never dismisses a MoFlight error; more than four system dialogs fails the trial. Every app checkpoint still requires its normal visible UI assertion. This handles emulator interference rather than bypassing app startup or injecting state. Native outcomes remain pending until the retry completes.

### Completed Android emulator result

[Run 37996497749](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37996497749), harness source [7cead104](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/7cead1048922997e653c7023423d67d7a7acc8cc): **completed / success**. Host, mobile-contract, artifact-plan and Android-smoke jobs all passed; the compile job correctly skipped after proving app inputs unchanged from 6957ce2. This run tested the original compiled APK hash recorded above, not a newly claimed build.

Actual device: Android SDK 35, `sdk_gphone64_x86_64`, x86_64; 480x800 display, density override 160. Emulator boot: 41 seconds. All fixture operations run without Metro and with airplane mode enabled/Wi-Fi/cellular disabled before installation. The report contains **no emulator-dialog events**, and completed logs contain no dialog-dismissal events: the successful run did not need that fallback.

| Native UI checkpoint | Actual result |
| --- | --- |
| Fresh installation | Passed; no automatic fixture import, zero paper entries, no Metro |
| Prepared import, decision and query | Passed; nine confirmed paper entries, aircraft override saved, exactly four effective ASK 21 flights |
| Fixed writing snapshot | Passed; persisted snapshot `69ca7c230e7f0b21438569e9aa5458bfca442b8d508561b0e1bc8fff6a71d197` |
| Force-stop/relaunch in airplane mode | Passed; retained paper/override/count and identical snapshot ID |
| Dataset B | Passed; zero paper entries/flights and no successful import |
| Restart selected B, reopen A | Passed; B selection remembered, original A state/snapshot preserved |
| Repeat import | Passed; paper count remains nine, query four and snapshot unchanged |

[Actual evidence artifact](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37996497749/artifacts/11647153316): seven checkpoint PNGs, JSON report, final UI XML and full launch logcat; ZIP SHA-256 `fac594dcbe859b89b36ad97126f033d788369d50069e4c7870505db0e960f005`, expires 2026-10-16. The downloaded report was inspected: seven passed checks, matching APK hash, actual device/display fields and the unchanged snapshot ID. The archive hash matches; query and offline-snapshot screenshots were visually inspected and show the four supporting flights and retained fixed page/carryover/context view. This limited visual review is not complete T02 acceptance.

Durable copies of the actual [checkpoint report](evidence/android-2026-10-09/report.json), [exact-query screenshot](evidence/android-2026-10-09/02-native-import-decision-exact-query.png) and [offline-snapshot screenshot](evidence/android-2026-10-09/04-airplane-mode-force-stop-reopen-same-state.png) are committed alongside this record. These are original CI bytes with synthetic data; full logs remain in CI, not Git.

No physical phone/iOS, selective-copy button or external backup/picker gate is passed by this result. The earlier failures remain documented; infrastructure correction did not change the app binary. The final evidence-only commit does not repeat compilation or fabricate a run for its own SHA.

## Remaining acceptance

This bounded Android emulator sequence cannot pass physical-device/iOS acceptance, visual readability/large-text/orientation checks, entry-level copy confirmation or externally saved backup/document-picker restore. Backups remain unencrypted experimental lab files. No cloud sessions, Auth recovery/RLS/private files, account linking/sync, handwriting, live Vereinsflieger access or SPL retrieval evaluation is added. Supabase still requires a disposable free project/two synthetic sessions; own-flight access still requires supported documentation/permission. No paid AI calls occur.

## Reproducible sources

- [Workflow](../../.github/workflows/host-lab.yml), [emulator script](../../scripts/android_smoke.py) and [runbook/manual gates](../../apps/platform-lab/README.md).
- [Android emulator command-line reference](https://developer.android.com/studio/run/emulator-commandline).
- [Emulator-runner maintained instructions](https://github.com/ReactiveCircus/android-emulator-runner), reviewed 2026-10-09 for API/architecture, headless launch, KVM and bounded custom scripts. A CI support action does not change the approved app architecture.

## Pixel 6a manual follow-up — 2026-10-10

Manuel reported **"works"** after the requested offline force-stop/reopen check: nine confirmed paper entries, the saved aircraft override, four effective ASK 21 flights and the same prepared writing snapshot ID. This is a **user-reported physical-device pass** for that bounded sequence, separate from the automated emulator evidence above.

The first app screenshot shows "Remembered state loaded", dataset `synthetic-lab-a` / `lab-a.sqlite`, nine individually confirmed paper entries and the aircraft-model finding marked override. The Android settings screenshot identifies Android **17**, build **CP3A.260905.009**, security update **2026-09-05**, Google Play system update **2026-08-01**. Pixel 6a is the user's stated device. Wi-Fi was visibly enabled in the first screenshot; disabling it was explicitly requested before the user reported success. The final settings screenshot was taken after that check and does not independently establish network state during the restart.

The supplied download was `MoFlight-Lab-6957ce2.apk` (source/hash documented above). The installed APK hash and exact before/after phone snapshot ID were not captured. Phone count/snapshot preservation is reported by the tester, rather than independently asserted from screenshots. No private phone screenshots are committed.

Selective-copy UI (only entry 70), full readability/large-text/orientation, dataset switching on this phone, native external backup/document-picker restore and iOS remain untested. This update records observations only; app code and binary are unchanged.

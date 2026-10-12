# MoFlight native platform lab

For reproducible provider interruption checks, the access PoC has an opt-in **Enable interruption test pause** control. It pauses only after the original view is durably journaled, the reserved backup is verified and temporary export reset is verified. Continue resumes normal retrieval; Cancel restores the original view. Force-stop/reopen must expose pending restoration and block new exports. The toggle is transient and off by default. Do not infer process-interruption acceptance from host tests; record actual native outcomes in the [verification report](../../docs/verification/2026-10-12-reserved-view-backup.md).

**Enable pre-backup test pause** instead stops immediately after durable journaling, before replacing the reserved backup, so the fixed **Original view restoration strategy: reset / reserved backup** label can be inspected safely. Cancel verifies the unchanged original; Continue uses the same owned request. These are transient opt-in lab controls. **Expand provider page / Back to lab** changes only layout and keeps the native WebView/session/request mounted. The [current local-validation/provider-gate report](../../docs/verification/2026-10-12-local-validation-and-provider-gates.md) records exact native evidence and unresolved cases. Hosted CI is optional/manual-only under amended ADR 0009; no paid CI is authorized.

Provider-view preservation policy (2026-10-12): Retrieve flights journals original preferences, refreshes/reloads the reserved `MoFlight App user view backup` (or uses a verified full default/reset), and restores/verifies supported settings after success, cancellation or failure. Manuel authorizes overwriting that single reserved name; local ownership is no longer required. Pending recovery blocks backup replacement/new captures and offers **Restore original provider view** after signing into the same observed account context. Export uses temporary unnamed active settings; no other named preset is loaded, saved or deleted. [Contract/evidence and native limitations](../../docs/verification/2026-10-11-vereinsflieger-view-preservation.md). Account identity is still display-only; full native preservation acceptance remains open. [In-app chat discovery](../../docs/architecture/logbook-chat-discovery.md) is next, with no API execution authorized.

The [2026-10-11 reliability review](../../docs/verification/2026-10-11-reliability-review.md) records current gaps and the first retrieval recovery slice. During default-list retrieval, Cancel is available until validated capture saving begins. Saving holds the request lock until SQLite returns. Failed/cancelled retrieval preserves earlier captures; identical same-ID storage retries are safe, conflicting evidence is rejected, and reopened captures are runtime-validated. These changes have host/bundle evidence; native cancellation/expiry/account-switch acceptance remains open.

Tracking: #4/#5/#6/#7/#9. Manuel approved Expo/React Native/strict TypeScript/pnpm and expo-sqlite as the single runtime database writer on 2026-10-08 ([ADR 0002](../../docs/adr/0002-phase1-technology-proposal.md), [ADR 0005](../../docs/adr/0005-host-lab-before-mobile-approval.md)). This is a bounded synthetic development app, not either released product.

## Setup and local builds

Windows desktop: use the [Windows session setup and quoted-path runbook](../../docs/development/windows-local-setup.md). [Desktop evidence](../../docs/verification/2026-10-10-windows-desktop.md) records passed host/bundle checks and SDK/native runtime blockers. Android Studio's Java is separate from the lab's JDK 17.

From the repository root, Node 24 (tested 24.19.0), pnpm 11.25.0 and Python 3.12:

```bash
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm fixtures:check
pnpm bundle
pnpm --filter @moflight/platform-lab prebuild:check
```

Dependencies are pinned to Expo 57.0.27, React Native 0.86.3 and React 19.2.3 with the official SDK 57 module mapping. Android/iOS Hermes bundles and generated native configuration pass locally. Android debug compilation/APK upload also passed in [GitHub Actions run 37798595010](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010); iOS compilation and device execution remain untested. SDK 57 supports Android 7+ and iOS 16.4+; the official SDK table requires Xcode 26.4+ for local iOS building. Android needs a configured SDK/JDK 17, accepted SDK licenses and a connected emulator/device. No EAS or paid cloud build is configured.

```bash
# Android with SDK and device/emulator:
pnpm --filter @moflight/platform-lab android
# macOS, compatible Xcode and simulator/signing:
pnpm --filter @moflight/platform-lab ios
# Subsequent Metro development session after installing a development build:
pnpm lab
```

Native project folders, database files and generated bundle output are ignored. App identifiers are `de.momorc.moflight.lab`; this lab is not the future independently released SPL/logbook apps. Android automatic backup is disabled so the explicit versioned backup is the lab transfer path. iOS platform backup policy/encryption is not established by this setting.

## Bundled local builds for the offline gate

Normal Debug development builds load JavaScript from Metro; the debug CI APK is compilation evidence and is not an offline-restart proof. Build a local Release-configuration lab binary with embedded JavaScript for the force-stop/airplane-mode sequence:

```bash
pnpm --filter @moflight/platform-lab android:offline
pnpm --filter @moflight/platform-lab ios:offline
```

The installed Expo CLI help verifies the `--variant release`, `--configuration Release` and `--no-bundler` flags. Generated Android Gradle configuration uses Expo `export:embed` for non-debug variants; its default debug signing is for local lab testing only. These commands are prepared but **not executed here** because native toolchains/devices are absent. No production signing, store distribution or paid build service is selected. Verify the actual installed binary starts with Metro stopped before attempting airplane mode; do not infer this from bundle export alone.

## Native acceptance: emulator subset passed, full manual sequence open

### Automated Android emulator subset

The push workflow now builds a Release-configuration lab APK with embedded JavaScript for **arm64-v8a** phones and the **x86_64** emulator. This remains a synthetic, debug-key-signed lab build, not store distribution or a production release. The `moflight-synthetic-android-offline` artifact contains `app-release.apk`; unlike the previous debug artifact it is intended to start without a Metro server. CI checks the bundle/architectures before uploading it, then installs that same APK on an API 35 emulator (initial API 36 attempts are retained in the evidence record). Current outcomes are in [Android offline evidence](../../docs/verification/2026-10-09-android-offline.md).

`scripts/android_smoke.py` uses ordinary Android UI buttons and the actual expo-sqlite runtime. It checks fresh empty state, explicit synthetic import, remembered override and exact ASK 21 count, fixed snapshot identity across force-stop/airplane-mode restart, dataset B isolation, remembered selection and repeat-import behavior. Each passed checkpoint saves a screenshot; failure saves a JSON report, last UI XML and logcat in the `moflight-android-emulator-evidence` artifact. It refuses to clear a physical phone. The CI emulator is disposable and the script clears only `de.momorc.moflight.lab` there.

Diagnostic collection is bounded to the latest 2,000 Logcat lines. `report.json` records diagnostics as complete/incomplete with explicit errors; missing logs or cleanup failures preserve the actual checkpoint result. Inspect diagnostics alongside status. [Windows continuation evidence](../../docs/verification/2026-10-10-windows-desktop.md#existing-ci-failure-investigated) records a 23-check pass whose workflow subsequently failed collecting Logcat; it is not a completely successful workflow or live retrieval proof.

For a separately started disposable emulator (no Metro needed):

```bash
python3 scripts/android_smoke.py --check-apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk
python3 scripts/android_smoke.py --apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk --output local-data/android-smoke
```

The original seven-check emulator subset does not establish physical-phone/iOS readability, entry-copy confirmation, an externally saved backup or document-picker restore. On 2026-10-10 the harness was extended to exercise selective copy, cancellation, external folder save, real document-picker restore, malformed/checksum/size rejection and byte-for-byte re-export. All 21 checkpoints passed in [run 38025640272](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38025640272); [copy/backup evidence and local-PC handoff](../../docs/verification/2026-10-10-android-copy-backup.md) records the compiled APK identity, original report, failures and remaining gates. The full manual sequence below remains required for platform/device/readability coverage. Emulator radio settings are enabled/read back with Wi-Fi and cellular data disabled; this does not measure network access to a live backend. No cloud endpoint exists in the app.

Compilation and emulator execution use separate runners to avoid compiler intermediates exhausting disk during system-image installation. CI may reuse an unexpired uploaded APK only if Git comparison with its recorded source commit proves all app inputs unchanged; only documentation/listed CI harness changes are exempt. Every other path change or failed cache verification compiles current source. The selected binary run/source is recorded; reuse is never presented as a new compilation.

### Install the standalone lab on an Android phone

After the APK-upload step passes, open the run linked in [Android offline evidence](../../docs/verification/2026-10-09-android-offline.md), download `moflight-synthetic-android-offline` from its Artifacts section and extract `app-release.apk`. On an arm64 Android phone, open the APK and grant the download/file app's installation permission if Android asks. Open **MoFlight Lab**. No SDK, Expo Go or Metro is needed on the phone or laptop for this already-built artifact. This experimental package contains only synthetic data and no cloud/AI execution path.

First check: choose dataset A, tap **Import prepared synthetic CSV and page**, override the aircraft-model finding, choose **ASK 21**, then prepare a fixed writing snapshot. Record its full ID, enable airplane mode with Wi-Fi disabled, force-stop MoFlight Lab from Android app settings and reopen it. Re-select ASK 21: four effective flights, nine confirmed paper entries and the same writing snapshot must remain. Record the actual phone/Android version and observations before claiming this physical-device gate passed. Continue the full manual sequence for copying and backup/restore.

### Full manual sequence

1. Open dataset A and explicitly import the prepared synthetic CSV/page. Nine paper rows, four distinct source flights from five original CSV rows and one model finding appear. A fresh install starts empty; reopening does not seed again.
2. Compare exact D-EX01 (2 source/effective flights), ASK 21 (3 before override), and distinct same-name instructor p1/p2. Inspect supporting IDs/evidence, successful import/coverage and source/effective/paper bases. Override the finding with the paper model: ASK 21 becomes 4 only in effective history. Ignore/reverse do not rewrite source facts.
3. Prepare a fixed snapshot. New entry 70 belongs on page 7 row 10; entry 71 on page 8 row 1. Page 7 totals: 1:50 / cumulative 11:50. Existing rows are context; partial-page total fields stay blank. Scroll/read each field at normal and large text sizes, both orientations, Android/iOS; record actual devices and observations.
4. Force-stop in airplane mode, relaunch and reopen the same snapshot without importing. Confirm decisions, exact counts, original source/page evidence, pending entries and snapshot ID survive. This passed on the API 35 emulator and has a bounded user-reported Pixel 6a pass; repeat for other devices/iOS. A Node subprocess test is only host evidence.
5. Explicitly confirm only entry 70. Entry 71 stays pending. Viewing/preparing never confirms copying. The old snapshot remains fixed; a fresh continuation after paper advancement requires a newly confirmed page and is deliberately refused by this bounded fixture.
6. On Android, use **Save synthetic backup to a device folder**, select a dedicated folder under Documents, and grant that folder access. The existing Expo file module uses Android's native folder picker; the app reads the written file back before reporting success. Android restricts selecting the storage/Downloads root; choose a subfolder. Save/share remains available on both platforms, but sharing cancellation alone does not prove an external backup. Picker cancellation reports unchanged data. Verify the file actually exists outside app storage. Select it through Restore: a new SQLite database retains original dataset ID, source/page bytes, all revisions, decisions, paper and snapshots. The existing database is preserved. Force-stop/reopen the restored selection. Corrupt JSON/checksum and oversized backups must fail without replacing existing work.
7. Switch to empty dataset B and verify A's rows/decisions/templates/counts are absent. Switching preserves A. Restoring preserves original dataset identity and uses a new file; the restored selection persists across restart. These are synthetic dataset boundaries, not authenticated account isolation.

The UI serializes user mutations. SQLite exclusive transactions execute on Expo's transaction connection; the sole native database adapter is `src/storage.ts`. Private selection/file operations and share/document picker require separate real-device checks. The UI has no cloud/network retrieval or AI execution path.

## Data and backup limits

`packages/flight-logbook` is pure TypeScript with deterministic integer counts/totals and scoped decision fingerprints. `packages/local-data` stores schema-v1 append-only record revisions, retained original CSV/page strings, per-flight source references, last successful import and immutable templates. `tests/mobile/sqlite-driver.ts` supplies real disk SQLite for tests only; it is not shipped as a second app writer. Python remains reference/test tooling.

Native backup `moflight-native-lab-backup-v1` is a SHA-256 checked JSON envelope (2 MB synthetic limit) containing dataset identity, schema and all SQL record revisions including original evidence. Restore is transactional into a clean new database; checksum detects corruption, not malicious authenticity. Backups/SQLite are **unencrypted**. No production untrusted-import security, key management, schema upgrade, sync, account linking, deletion/reset or automatic continuation is claimed. The earlier host ZIP backup is a separate format and cannot be selected as a native restore.

Canonical fixtures remain `tests/fixtures/local-logbook/flights.csv` and `page.json`. `scripts/mobile_fixtures.py` produces `mobile.json` with original strings preserved; `--check` detects drift. These are **synthetic prepared observations, no OCR**, and **synthetic CSV, no live Vereinsflieger retrieval**. Only known UTC solo/Dual ten-row layout behavior is exercised; unresolved time basis/chronology/carryovers block writing.

## Reference runner and independent gates

The earlier dependency-free Python lab remains runnable:

```bash
python3 -m unittest discover -s tests -v
python3 -m pocs.local_logbook.lab demo --data local-data/lab-a
python3 -m pocs.local_logbook.lab serve --data local-data/lab-a
```

The read-only host viewer at `http://127.0.0.1:8765/` is not the native app. [Earlier host evidence](../../docs/verification/2026-10-08-host-local-slice.md) and [current native-slice evidence](../../docs/verification/2026-10-08-native-lab.md) keep those claims separate.

Supabase #1: [schema/probe prepared](../../pocs/supabase-trial/README.md), blocked without disposable free project/two-user Auth setup. Own-flight #2: [supported-access investigation](../../docs/architecture/vereinsflieger-access-investigation.md), unresolved permission/docs; no guessed endpoint. SPL #3 remains retrieval-first with permitted content and no paid embeddings/generation. Instructor-roster discovery #10 stays separate. None is replaced by local fixture success.

## Vereinsflieger access PoC

Current retrieval update, 2026-10-11: Retrieve flights uses [filter-first capture](../../docs/architecture/vereinsflieger-filter-export.md), replacing the historical 20-row/default reader. From/To default to the current calendar year; edit YYYY-MM-DD bounds for another inclusive window. Sign in and tap Retrieve; the app checks/repairs the preset, sets Pilot oder Fluglehrer/dates and traverses existing pages. Cancel/errors/timeouts preserve the prior capture. Only complete requested-list snapshots are saved; cost/aircraft/engine/crew fields remain raw. [Checks and next device trial](../../docs/verification/2026-10-11-vereinsflieger-filter-export.md). Legacy snapshots reopen without export context. The isolated detail reader below remains optional enrichment, separate from Retrieve flights.

### Historical default-list device trial

Manuel selected this as the next essential PoC on 2026-10-10. Historical trial used `MoFlight-Vereinsflieger-PoC-2cb98b9.apk` (source `2cb98b98d463cbc7ba92a6eddec8a5029ce62d34`, 46,702,203 bytes; SHA-256 `a915bf100958c4cc06241d969326136e60d122775ccb52108af8b49e6ac347c8`). All 23 synthetic native checkpoints passed; the final workflow failed afterward collecting optional logcat, now addressed by a locally tested harness fix. See the evidence for this distinction. The previous synthetic-only APK has no access probe. The main screen's “Open Vereinsflieger access PoC” opens the isolated native screen.

The [Windows desktop trial](../../docs/verification/2026-10-10-windows-desktop.md#live-android-bounded-capture-and-restart) now verifies native authenticated login, session reuse, capture of 20 visible rows and offline reopening after force-stop. Current source fixes Android origin-only bridge messages, reads hidden original header labels with `textContent`, and excludes the observed single-cell full-width layout row. All actual flight rows still require exact column widths and the 20-row bound; changed/oversized lists fail closed. The pinned library supplies sender origins in [its Android WebMessageListener](https://github.com/react-native-webview/react-native-webview/blob/v13.16.1/android/src/main/java/com/reactnativecommunity/webview/RNCWebView.java). Twenty mobile tests cover these contracts and existing logbook behavior. The older `2cb98b9` APK lacks these fixes. No final transport/full-history acceptance is implied.

1. With internet available, tap “Show provider login,” verify the displayed HTTPS provider identity and sign into the original Vereinsflieger page. The app does not read/store password fields. Complete provider verification if offered and verify that the visible account is yours.
2. Tap “Retrieve flights.” The app navigates to the known personal flightbook automatically and reads the default bounded list, at most 20 rows. No date range or export navigation is required. If the provider asks for login, complete it and tap Retrieve again. The reader requires the supported date/registration/start/landing/duration anchors; optional model/PIC/class fields may be absent. Missing anchors, ambiguous columns and malformed rows produce an explicit error rather than a guessed import. The [2026-10-11 default-view fix](../../docs/verification/2026-10-11-vereinsflieger-capture-fields.md) is checked in source; the older APK named above does not contain it.
3. Compare the displayed raw date/aircraft/crew/times/duration fields privately with the provider list. The code preserves separate Pilot/PIC/Begleiter/FI columns and only labels `flid` values as candidate source IDs.
4. Close/force-stop/reopen the app and access probe in airplane mode; check the last saved capture remains available. Restore internet, tap Retrieve and determine whether login is reused. Record the actual stay-signed-in/expiry result, rather than assuming cookies persist.
5. Test a canceled or expired login and failed network request: the prior capture and synthetic logbook must remain intact. Account/club identity extraction, multi-account binding, actual provider logout/cookie clearing, canonical import, complete history/paging, export contract and iOS runtime remain later native gates.

Captures use a separate private `vereinsflieger-access-probe.sqlite` database. Each successful capture has its own request ID; repeated reads are observations, not duplicated canonical flights. Source identity and time basis are explicitly unverified. Captures cannot change synthetic flights, decisions, writing snapshots or synthetic JSON backups. They contain private personal data and are not exported/logged or committed. Android's existing `allowBackup: false` remains set; iOS backup exclusion has not been verified. No app-owned password storage or cloud service was added.

This first access proof deliberately uses the provider's visible bounded list; automatic all-history scheduling and validated logbook integration follow verified account/field/coverage contracts. Provider Excel/export and structured responses remain preferable candidates when their actual contract is observed. [Evidence and remaining acceptance](../../docs/verification/2026-10-10-vereinsflieger-native-probe.md).


### Optional saved login for development

Manuel explicitly authorized device-local login saving/use on 2026-10-10. The access screen offers Save login on this device, Use saved login and Forget saved login. Enter credentials once in the separate masked MoFlight form; existing provider passwords are not collected. The saved values live in Expo SecureStore, separate from capture/logbook databases and backups. Use submits the observed original root login form once and keeps provider verification visible; no retry loop or background login. Forget removes the app-owned login but does not log out the provider or delete flights. Use the provider's stay-signed-in session first; saved login is a fallback. [Implementation/native checks](../../docs/verification/2026-10-10-vereinsflieger-saved-login.md) confirm saved-entry recognition across a cold restart after the user's initial entry; live fallback authentication and Forget remain untested.

### Isolated detail-reader contract

`src/vereinsflieger/details.ts` contains the next bounded lab contract, separate from the native access screen. `DETAIL_READER_SOURCE` reads allowlisted general/flight sections from the observed `table.view`, retaining row positions and raw values and excluding nested billing. `decodeDetail` requires the expected observed URL/reference and date/registration/duration anchors. `inspectDetail` distinguishes missing from source blank; it computes no pilot credit or classification.

Create a trial with one to three fresh own-list detail links and a provisional scope. Call `attemptDetail` once per attempt, save its returned checkpoint before continuing and resume tasks whose state is not success. Each repeat success appends evidence; failed attempts preserve prior evidence. The caller must classify a visible login/expiry response as `session-required`, stop navigation and renew the session. Other redirects/unsupported pages fail closed. Scope strings are provisional lab labels, not authenticated account IDs. Disk tests use only trusted synthetic checkpoints; an untrusted backup decoder, native scheduler/SQLite store and automatic account-switch detection are not implemented. [Actual desktop proof and limits](../../docs/verification/2026-10-11-vereinsflieger-detail-proof.md). Run `pnpm typecheck` and `pnpm test` for the executable checks.

## Recovery, multi-book and capture continuation (2026-10-11)

Use **Open multiple-logbook lab**, then **Load four synthetic books**, select a book, review source/paper differences, prepare a fixed snapshot and confirm only the copied entry. Pilot backups include all four books/shared evidence and restore into a new library; original schema-v1 datasets remain separate. The second format is a synthetic five-row extension proof, not a real UL/powered edition.

In the access PoC, **Open bounded capture and resume** reads the observed profile number/current club label, asks for context confirmation, captures the recent own-list and up to three referenced details, and saves durable progress. Resume rechecks profile context and fresh own-list references. Club IDs, explicit period/paging/empty coverage and real canonical import remain gated. No credential field, contact field or billing section is captured.

See [implementation and actual evidence](../../docs/verification/2026-10-11-recovery-books-and-capture.md) for checks and remaining gates.

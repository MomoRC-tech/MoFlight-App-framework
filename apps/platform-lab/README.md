# MoFlight native platform lab

Tracking: #4/#5/#6/#7/#9. Manuel approved Expo/React Native/strict TypeScript/pnpm and expo-sqlite as the single runtime database writer on 2026-10-08 ([ADR 0002](../../docs/adr/0002-phase1-technology-proposal.md), [ADR 0005](../../docs/adr/0005-host-lab-before-mobile-approval.md)). This is a bounded synthetic development app, not either released product.

## Setup and local builds

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

## Device acceptance sequence — not yet executed

### Automated Android emulator subset

The push workflow now builds a Release-configuration lab APK with embedded JavaScript for **arm64-v8a** phones and the **x86_64** emulator. This remains a synthetic, debug-key-signed lab build, not store distribution or a production release. The `moflight-synthetic-android-offline` artifact contains `app-release.apk`; unlike the previous debug artifact it is intended to start without a Metro server. CI checks the bundle/architectures before uploading it, then installs that same APK on an API 36 emulator. Current outcomes are in [Android offline evidence](../../docs/verification/2026-10-09-android-offline.md).

`scripts/android_smoke.py` uses ordinary Android UI buttons and the actual expo-sqlite runtime. It checks fresh empty state, explicit synthetic import, remembered override and exact ASK 21 count, fixed snapshot identity across force-stop/airplane-mode restart, dataset B isolation, remembered selection and repeat-import behavior. Each passed checkpoint saves a screenshot; failure saves a JSON report, last UI XML and logcat in the `moflight-android-emulator-evidence` artifact. It refuses to clear a physical phone. The CI emulator is disposable and the script clears only `de.momorc.moflight.lab` there.

For a separately started disposable emulator (no Metro needed):

```bash
python3 scripts/android_smoke.py --check-apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk
python3 scripts/android_smoke.py --apk apps/platform-lab/android/app/build/outputs/apk/release/app-release.apk --output local-data/android-smoke
```

The emulator subset does not establish physical-phone/iOS readability, entry-copy confirmation, an externally saved backup or document-picker restore. The full manual sequence below remains required. Emulator radio settings are enabled/read back with Wi-Fi and cellular data disabled; this does not measure network access to a live backend. No cloud endpoint exists in the app.

Compilation and emulator execution use separate runners to avoid compiler intermediates exhausting disk during system-image installation. CI may reuse an unexpired uploaded APK only if Git comparison with its recorded source commit proves all app inputs unchanged; only documentation/listed CI harness changes are exempt. Every other path change or failed cache verification compiles current source. The selected binary run/source is recorded; reuse is never presented as a new compilation.

### Install the standalone lab on an Android phone

After the APK-upload step passes, open the run linked in [Android offline evidence](../../docs/verification/2026-10-09-android-offline.md), download `moflight-synthetic-android-offline` from its Artifacts section and extract `app-release.apk`. On an arm64 Android phone, open the APK and grant the download/file app's installation permission if Android asks. Open **MoFlight Lab**. No SDK, Expo Go or Metro is needed on the phone or laptop for this already-built artifact. This experimental package contains only synthetic data and no cloud/AI execution path.

First check: choose dataset A, tap **Import prepared synthetic CSV and page**, override the aircraft-model finding, choose **ASK 21**, then prepare a fixed writing snapshot. Record its full ID, enable airplane mode with Wi-Fi disabled, force-stop MoFlight Lab from Android app settings and reopen it. Re-select ASK 21: four effective flights, nine confirmed paper entries and the same writing snapshot must remain. Record the actual phone/Android version and observations before claiming this physical-device gate passed. Continue the full manual sequence for copying and backup/restore.

### Full manual sequence

1. Open dataset A and explicitly import the prepared synthetic CSV/page. Nine paper rows, four distinct source flights from five original CSV rows and one model finding appear. A fresh install starts empty; reopening does not seed again.
2. Compare exact D-EX01 (2 source/effective flights), ASK 21 (3 before override), and distinct same-name instructor p1/p2. Inspect supporting IDs/evidence, successful import/coverage and source/effective/paper bases. Override the finding with the paper model: ASK 21 becomes 4 only in effective history. Ignore/reverse do not rewrite source facts.
3. Prepare a fixed snapshot. New entry 70 belongs on page 7 row 10; entry 71 on page 8 row 1. Page 7 totals: 1:50 / cumulative 11:50. Existing rows are context; partial-page total fields stay blank. Scroll/read each field at normal and large text sizes, both orientations, Android/iOS; record actual devices and observations.
4. Force-stop in airplane mode, relaunch and reopen the same snapshot without importing. Confirm decisions, exact counts, original source/page evidence, pending entries and snapshot ID survive. This is the missing native offline-restart gate; a Node subprocess test is only host evidence.
5. Explicitly confirm only entry 70. Entry 71 stays pending. Viewing/preparing never confirms copying. The old snapshot remains fixed; a fresh continuation after paper advancement requires a newly confirmed page and is deliberately refused by this bounded fixture.
6. Save/share a native JSON backup to external device storage; verify the file actually exists there. Sharing cancellation alone does not prove this. Select that file through Restore: a new SQLite database retains original dataset ID, source/page bytes, all revisions, decisions, paper and snapshots. The existing database is preserved. Force-stop/reopen the restored selection. Corrupt JSON/checksum and oversized backups must fail without replacing existing work.
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

# Approved native lab slice — 2026-10-08

Current main checked before implementation: `d32fcaeb1a806f97ea9f793328d7bab3ba8b5b86`, newer than the user's original f6bb6da baseline. No newer main existed at that check. AGENTS/README, relevant ADRs/specifications and open Issues reviewed; existing host/Supabase/source records preserved. The implementation commit and independently checked remote CI results are recorded below; later evidence updates do not change the synthetic/native acceptance boundaries.

## Approval and implementation

Manuel answered “yes” to approval of Expo/React Native, strict TypeScript, pnpm and expo-sqlite as the single database writer for the initial native lab. ADR 0002/0005 and README now record that binding scope. Sync, PowerSync, paid services/AI, release and Vereinsflieger transport are not adopted.

The Expo app supplies the single SQLite runtime adapter and native private-file/picker/share APIs. Pure `flight-logbook` rules and `local-data` repository contain no vendor SDK or other domain imports. It wires two synthetic dataset selections, explicit prepared import, remembered source/paper/finding decisions, exact typed aircraft/person filters with supporting evidence IDs, fixed page/row/field snapshots and explicit entry-level copied confirmation. A checked JSON backup restores into a new database and retains the original identity/evidence/revision history. Original source CSV rows/bytes and prepared observations remain available; they establish neither OCR nor live retrieval.

## Local environment and actual results

Linux x86_64; Node 24.19.0; pnpm 11.25.0; TypeScript 6.0.3; Python 3.12.14 / Python SQLite 3.53.1. Node's built-in SQLite is the real-disk test adapter only. Java 17 exists, but no Android SDK/adb, Xcode/xcodebuild or devices are available. Native source/config generation is possible; local native compilation is not.

| Executed command | Actual result | Boundary |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Exit 0 with committed exact lockfile | Package install, not device execution |
| `pnpm typecheck` | Exit 0, strict TypeScript | Types cannot establish SDK runtime behavior |
| `pnpm test` | 10/10 passed | Real disk SQLite via Node; not expo-sqlite on phone |
| `pnpm fixtures:check` | Exit 0, canonical CSV/page bytes match generated bundle | Prepared synthetic evidence only |
| `python3 -m unittest discover -s tests -v` | 20/20 passed | Earlier host reference behavior |
| `pnpm bundle` | Exit 0; Android 655 / iOS 657 modules; Hermes bundles about 1.7 MB each | Both target bundles, not native compilation/install |
| `pnpm --filter @moflight/platform-lab prebuild:check` | Exit 0; Android/iOS native projects generated | Config/plugins generation, not Gradle/Xcode build |
| `expo config --type public --json` | Exit 0; Android/iOS IDs/plugins resolved | Configuration only |
| `git diff --check` | Exit 0 | Whitespace only |
| Online `expo install --check` | Failed with HTTP proxy timeout | No successful live Expo dependency-service check |
| Offline `EXPO_OFFLINE=1 expo install --check` | Exit 0; reports dependencies up to date **and warns validation is unreliable offline** | Compatibility independently checked from official SDK/template/module metadata |

The tsx CLI initially failed on IPC socket creation in this environment; the final test command uses `node --import tsx --test`, without the CLI socket, and passes. An added source-reference assertion initially named f71 as D-EX01; the canonical fixture actually has f69/f70. The assertion was corrected to those fixture IDs and the complete suite rerun. No failed check is described as successful.

The ten TypeScript tests cover distinct identities/roles/duplicate raw rows; exact support/source references and date bounds; ignore/override/reversal with separate source/effective facts; relevant changes versus timestamp/unrelated changes and failed refresh; fixed field/totals/page parity with Python; atomic selective copied-entry confirmation; unchanged old snapshots after relevant changes; real disk reopening in a separate process with network creation disabled; complete backup/restore/corruption/existing-destination rejection; independent datasets/stale mutations/unknown chronology. A process-level SQLite read does not establish airplane-mode native restart or native file/picker behavior.

## Version selection evidence

Checked current primary sources on 2026-10-08:

- [Official Expo SDK table](https://docs.expo.dev/versions/latest/): SDK 57, React Native 0.86, React 19.2.3; Node minimum 22.13; Android 7+ / compile-target 36 and iOS 16.4+ / Xcode 26.4+.
- Official `expo-template-blank-typescript` 57.0.29 metadata: Expo ~57.0.27, React Native 0.86.3, React 19.2.3, TypeScript ~6.0.3, React types ~19.2.2.
- Official npm `expo@57.0.27` tarball `bundledNativeModules.json`: exact pinned sqlite 57.0.4, file-system 57.0.7, crypto 57.0.3, document-picker 57.0.3, sharing 57.0.22, dev-client 57.0.19, safe-area-context 5.7.0. Lockfile records resolved dependencies/integrities.
- [Expo monorepos](https://docs.expo.dev/guides/monorepos/): pnpm isolated installs supported for these SDKs; standard Metro configuration used.
- [Expo SQLite](https://docs.expo.dev/versions/latest/sdk/sqlite/): exclusive transaction callback uses the supplied transaction connection; native-only lab has no web target.
- [Expo file system](https://docs.expo.dev/versions/latest/sdk/filesystem/): File/Directory/Paths used for explicit private selection and versioned backup; native behavior remains to test.

## Missing acceptance and independent early work

Android debug compilation passed in push CI; the checked outcome and APK artifact are recorded below. iOS native compilation remains untested. The debug CI variant depends on Metro and cannot establish an offline restart. Installed CLI help and generated Gradle config were inspected: the runbook now provides local Release-configuration commands with embedded JavaScript (`android:offline` / `ios:offline`). Those commands remain unexecuted; no store release or production signing is authorized. No local Gradle/Xcode compilation, Android/iOS installation, native transaction concurrency, force-stop/airplane-mode restart, visual readability/large text, picker/share/external backup or restored-selection device checks have passed. [Device sequence](../../apps/platform-lab/README.md) is reproducible but unexecuted. No screenshots, perf/latency or device measurements are fabricated.

The bounded prepared page needs a new confirmed continuation after copied status advances. Only schema v1 is implemented; unsupported schemas are preserved/refused, but migrations/encryption/key management/general untrusted-backup hardening are future gates. Dataset isolation is not authenticated account isolation. Native JSON and earlier host ZIP backups are separate experimental formats. No cloud sync/outbox/account linking, two released shells, broad reconciliation or natural-language query engine is implemented.

Supabase Cloud Free #1 remains an independent early trial: SQL/probe exists, but hosted Auth/confirmation/recovery/two-user RLS/private files/authenticated commands/expiry/idle return cannot run without a disposable project and synthetic-user setup. No credentials are committed, billing-enabled resources provisioned or paid AI calls made. Own-flight #2 still requires supported primary documentation and permission; prepared CSV does not establish access. SPL retrieval/RAG #3 stays in the framework plan; no corpus/answer evaluation is claimed. #10 roster discovery remains separate and unsupported access is not assumed. All acceptance Issues stay open.

## Publication and remote CI

Implementation was published directly to main as [9f27163cec0a28f277f9bd2f032c4a590d8460b0](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/9f27163cec0a28f277f9bd2f032c4a590d8460b0), using expected head d32fcae and a fast-forward. Main was read back and the remote compare inspected: exactly the intended 26 paths changed, no unexpected or missing paths. The lockfile blob is `c60ad059512eec5d753e33f8d991db347981a81d`, matching the local git-blob hash. No database, personal photo or archive artifact was committed. Issues #1/#4/#5/#6/#7/#8/#9 received progress; #5 title/body now record accepted mobile/driver scope while preserving remaining choices and historical stages. All acceptance Issues remain open.

Push/main [run 37798595010](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010) for 9f27163:

- `host-sqlite` job 113384458964: **completed / success**. Decoded logs: CPython 3.12.14, 20 tests in 0.492 s, OK; compile and whitespace steps pass.
- `mobile-contracts` job 113384459450: **completed / success**. Decoded logs: Node 24.19.0, pnpm 11.25.0, CPython 3.12.15; 10 tests / 10 pass / 0 fail (1.092 s). Frozen install, strict types, canonical fixture check, Android 655 / iOS 657-module bundles and both prebuild configurations all pass remotely.
- `android-debug` job 113384459407: **completed / success**. Decoded Gradle logs: `BUILD SUCCESSFUL in 10m 54s`, `:app:assembleDebug`; minSdk 24, compile/target SDK 36, NDK 27.1.12297006, Kotlin 2.1.20. APK artifact upload also passed. The full run is **completed / success** (checked after all jobs completed). This debug variant is compilation evidence only and requires Metro for development JavaScript; local Release-configuration offline build commands remain unexecuted.

Supabase probe rerun: **blocked / exit 2**, no HTTP requests; project/public-key/two-synthetic-session prerequisites remain missing. No cloud/recovery/private-file result inferred. Relative documentation links and final whitespace checks pass. The follow-up adds explicit embedded-JavaScript offline-build commands based on installed CLI help/generated native config; frozen install still passes without dependency changes.

Android artifact: [moflight-synthetic-android-debug](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/37798595010/artifacts/11559874382), ID 11559874382, archive size 71,856,733 bytes, verified non-expired through the Actions artifact API. Archive digest `sha256:576e8faf68736a154f89d7093fff60fb77bc705bb72bcae3588d3a25e5ee9a9b`; expires 2026-10-15. This is an APK compiled/uploaded by CI, not an installed or tested phone binary. No iOS binary was compiled.

The evidence/runbook follow-up changes documentation and adds CLI recipes only; app/domain/SQL sources, dependencies, lockfile and native configuration are unchanged from the verified implementation. Local frozen install, exact CLI flags and relative links/whitespace were checked. Its commit deliberately skips a redundant CI/native rebuild; the linked successful run applies to 9f27163, not a fabricated run for the evidence commit.

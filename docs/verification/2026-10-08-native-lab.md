# Approved native lab slice — 2026-10-08

Current main checked before implementation: `d32fcaeb1a806f97ea9f793328d7bab3ba8b5b86`, newer than the user's original f6bb6da baseline. No newer main existed at that check. AGENTS/README, relevant ADRs/specifications and open Issues reviewed; existing host/Supabase/source records preserved. This document belongs to the native implementation commit; publication and remote CI results will be appended after checking them.

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

Android debug compilation is added to push CI; its actual outcome must be checked after publication. No local Gradle/Xcode compilation, Android/iOS installation, native transaction concurrency, force-stop/airplane-mode restart, visual readability/large text, picker/share/external backup or restored-selection device checks have passed. [Device sequence](../../apps/platform-lab/README.md) is reproducible but unexecuted. No screenshots, perf/latency or device measurements are fabricated.

The bounded prepared page needs a new confirmed continuation after copied status advances. Only schema v1 is implemented; unsupported schemas are preserved/refused, but migrations/encryption/key management/general untrusted-backup hardening are future gates. Dataset isolation is not authenticated account isolation. Native JSON and earlier host ZIP backups are separate experimental formats. No cloud sync/outbox/account linking, two released shells, broad reconciliation or natural-language query engine is implemented.

Supabase Cloud Free #1 remains an independent early trial: SQL/probe exists, but hosted Auth/confirmation/recovery/two-user RLS/private files/authenticated commands/expiry/idle return cannot run without a disposable project and synthetic-user setup. No credentials are committed, billing-enabled resources provisioned or paid AI calls made. Own-flight #2 still requires supported primary documentation and permission; prepared CSV does not establish access. SPL retrieval/RAG #3 stays in the framework plan; no corpus/answer evaluation is claimed. #10 roster discovery remains separate and unsupported access is not assumed. All acceptance Issues stay open.

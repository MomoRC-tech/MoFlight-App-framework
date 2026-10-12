# ADR 0009: Local Android development and checkpoint CI

- Date: 2026-10-11
- Status: Accepted — Manuel approved implementation of the reviewed plan
- Amendment: 2026-10-12 — Manuel approved required local validation, optional hosted CI and no paid CI
- Tracking: #6

## Context

The installed Windows SDK/emulator and local standalone builds already work, with documented path-length workarounds. Building on every main push duplicates expensive Linux compilation during development. Local runtime feedback and independent hosted acceptance have different purposes.

## Decision

Use local Windows builds/emulator testing as the primary Android development loop. Reuse the installed Android SDK and JDK 17; Android Studio remains available for SDK/emulator management and debugging. A dedicated short-path checkout uses frozen hoisted dependencies and generated-only CMake settings. It builds committed source, refuses dirty build checkouts, retains caches and records source/configuration/checksum/timing. Dirty source is refused by default; an explicit source ref permits a committed snapshot without copying or changing source drafts. Do not transfer ignored private files.

Development-client/Metro builds support screen/logic iteration; standalone Release-configuration lab APKs establish offline acceptance. Only the named synthetic AVD may be reset by the local smoke command. Provider-session emulators remain separate.

As amended on 2026-10-12, hosted workflows are optional and manual-only. Normal pushes do not dispatch runners. No paid CI, increased spending limits, billing changes or paid runner/storage usage are authorized. A hosted run may be considered only when its free eligibility is confirmed; an account restriction is not a reason to pay. Retain manual source selection, fresh compilation and identical-input APK reuse for optional independent evidence. Manual runs are independent. A skipped/unavailable hosted run is neither a test pass nor a blocker when the required local evidence is complete.

Before scoped feature acceptance or device handoff, require documented local validation of committed source: strict TypeScript/mobile tests and relevant Python/fixture checks; the Android Release build's source identity, checksum, embedded JavaScript and architectures; the applicable synthetic emulator sequence and actual feature-specific native trials, including offline restart/recovery when relevant. Record source/configuration, actual environment, failures, outcomes and remaining gates. Reset only the named synthetic AVD; preserve provider sessions and unrelated build checkouts. Host mocks/bundles cannot substitute for live-provider or native acceptance, and Android evidence cannot substitute for iOS execution. Missing required feature/device evidence remains an acceptance blocker independently of hosted CI availability.

The original 2026-10-11 automatic fast/checkpoint schedule and mandatory hosted completion gate are superseded by this amendment. Dated verification reports retain their original outcomes; they must not be read as a current requirement to resolve billing or buy CI.

## Consequences

Complete the relevant local checkpoint before device handoff or declaring a scoped feature accepted. Record optional hosted evidence separately, with compiled and validated source identities. The tradeoff is reduced independent operating-system/clean-runner coverage; use reproducible isolated local builds and record that limitation. Preserve Windows workaround failures and measured evidence. Windows does not establish iOS runtime acceptance. No new service, framework, global Java replacement or production signing is introduced.

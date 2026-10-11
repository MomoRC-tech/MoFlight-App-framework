# ADR 0009: Local Android development and checkpoint CI

- Date: 2026-10-11
- Status: Accepted — Manuel approved implementation of the reviewed plan
- Tracking: #6

## Context

The installed Windows SDK/emulator and local standalone builds already work, with documented path-length workarounds. Building on every main push duplicates expensive Linux compilation during development. Local runtime feedback and independent hosted acceptance have different purposes.

## Decision

Use local Windows builds/emulator testing as the primary Android development loop. Reuse the installed Android SDK and JDK 17; Android Studio remains available for SDK/emulator management and debugging. A dedicated short-path checkout uses frozen hoisted dependencies and generated-only CMake settings. It builds committed source, refuses dirty build checkouts, retains caches and records source/configuration/checksum/timing. Dirty source is refused by default; an explicit source ref permits a committed snapshot without copying or changing source drafts. Do not transfer ignored private files.

Development-client/Metro builds support screen/logic iteration; standalone Release-configuration lab APKs establish offline acceptance. Only the named synthetic AVD may be reset by the local smoke command. Provider-session emulators remain separate.

Fast Windows/Linux checks run on every main push. The separate Android checkpoint workflow runs automatically for package manifests/lockfiles, app native configuration/plugins, Android build scripts, smoke tests and its own workflow changes. Ordinary application logic and documentation changes require a manual checkpoint for hosted runtime evidence. Manual dispatch can select a source commit/ref and force new compilation. APK reuse requires identical application inputs. Superseded automatic runs may be cancelled; manual runs are independent. Cancellation/skipping is not passing acceptance.

## Consequences

Run a full checkpoint before device handoff or declaring a feature accepted. Record local and hosted results separately, with compiled and validated source identities. Preserve Windows workaround failures and measured evidence. Windows does not establish iOS runtime acceptance. No new service, framework, global Java replacement or production signing is introduced.

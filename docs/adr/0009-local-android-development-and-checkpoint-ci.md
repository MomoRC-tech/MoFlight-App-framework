# ADR 0009: Local Android development and checkpoint CI

- Date: 2026-10-11
- Status: Accepted — Manuel approved implementation of the reviewed plan
- Amendment: 2026-10-12 — Manuel approved required local validation, optional hosted CI and no paid CI
- Amendment: 2026-10-17 — Manuel approved logic-first iteration and risk-based verification at integration checkpoints
- Amendment: 2026-10-18 — Manuel authorized portable CI/testing implementation, automatic fast checks and manual Android/Maestro; no paid usage
- Tracking: #6

## Context

The installed Windows SDK/emulator and local standalone builds already work, with documented path-length workarounds. Building on every main push duplicates expensive Linux compilation during development. Local runtime feedback and independent hosted acceptance have different purposes.

## Decision

Use local Windows builds/emulator testing as the primary Android development loop. Reuse the installed Android SDK and JDK 17; Android Studio remains available for SDK/emulator management and debugging. A dedicated short-path checkout uses frozen hoisted dependencies and generated-only CMake settings. It builds committed source, refuses dirty build checkouts, retains caches and records source/configuration/checksum/timing. Dirty source is refused by default; an explicit source ref permits a committed snapshot without copying or changing source drafts. Do not transfer ignored private files.

Development-client/Metro builds support screen/logic iteration; standalone Release-configuration lab APKs establish offline acceptance. Only the named synthetic AVD may be reset by the local smoke command. Provider-session emulators remain separate.

The 2026-10-12 amendment originally made all hosted workflows optional/manual-only. Manuel’s 18 October 2026 implementation handover supersedes that scheduling rule for fast validation: one standard Ubuntu job on main push/PR/manual. Android APK, Maestro and the extended checkpoint remain manual. See the [portable CI runbook](../development/portable-ci.md). Local independence and the no-paid-usage rule remain binding. No paid CI, increased spending limits, billing changes or paid runner/storage usage are authorized. A hosted run may be considered only when its free eligibility is confirmed; an account restriction is not a reason to pay. Retain manual source selection, fresh compilation and identical-input APK reuse for optional independent evidence. Manual runs are independent. A skipped/unavailable hosted run is neither a test pass nor a blocker when the required local evidence is complete.

Before scoped feature acceptance or device handoff, require documented local validation of committed source: strict TypeScript/mobile tests and relevant Python/fixture checks; the Android Release build's source identity, checksum, embedded JavaScript and architectures; the applicable synthetic emulator sequence and actual feature-specific native trials, including offline restart/recovery when relevant. Record source/configuration, actual environment, failures, outcomes and remaining gates. Reset only the named synthetic AVD; preserve provider sessions and unrelated build checkouts. Host mocks/bundles cannot substitute for live-provider or native acceptance, and Android evidence cannot substitute for iOS execution. Missing required feature/device evidence remains an acceptance blocker independently of hosted CI availability.

The original 2026-10-11 automatic fast/checkpoint schedule and mandatory hosted completion gate are superseded by this amendment. Dated verification reports retain their original outcomes; they must not be read as a current requirement to resolve billing or buy CI.

## Consequences

### 17 October 2026 amendment: verification frequency

Follow the approved [development/verification workflow](../development/verification-workflow.md). Ordinary logic commits use relevant automated tests and TypeScript; batch commits before a planned integration acceptance checkpoint. Platform exports, committed-source Release and relevant native trials remain acceptance requirements, not per-commit requirements. Inspect only affected UI for small visual edits; use the screen-size matrix for substantial layout/navigation/typography changes. Logic-only and documentation changes do not trigger routine visual verification. Documentation-only work needs links/consistency checks, not app builds or devices. Repeat verification only for affected changes, failures or unresolved risks, with source-specific reuse of unaffected evidence. No routine subagents or duplicate evidence reports for small tasks. This amendment changes scheduling/effort, not the native/live/platform acceptance distinctions or safety/privacy/free-CI constraints above.

Complete the relevant local checkpoint before device handoff or declaring a scoped feature accepted. Record optional hosted evidence separately, with compiled and validated source identities. The tradeoff is reduced independent operating-system/clean-runner coverage; use reproducible isolated local builds and record that limitation. Preserve Windows workaround failures and measured evidence. Windows does not establish iOS runtime acceptance. No new service, framework, global Java replacement or production signing is introduced.

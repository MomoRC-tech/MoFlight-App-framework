# ADR 0005: Nonbinding host evidence before mobile stack approval

- Date: 2026-10-08
- Status: Host evidence scope retained; initial native mobile/workspace/driver recommendation accepted on 2026-10-08; production schema remains experimental
- Decision owner for binding architecture: Manuel Singer
- Tracking: #4/#5/#6/#7/#9

## Context and scope

Manuel requested useful executable work immediately while retaining mobile and
driver approvals. Main at f6bb6da has documentation only. AGENTS.md states:
“Manuel owns product decisions and binding technology approval. An earlier
recommendation is not approval; keep proposed ADRs proposed until an explicit decision.”

Use Python 3.12 standard-library SQLite as a **host verification harness** for
the already requested local logbook invariants. Add no Python mobile runtime,
production driver, cloud integration, sync engine or third-party dependency.
`apps/platform-lab` initially documented this runner; `pocs/local_logbook` holds
the bounded experiment. ADR 0002 was then Proposed; ADR 0003/0004 selections stay
unchanged. The host schema uses append-only record revisions to retain evidence
without adopting a general production event-sourcing platform.

## Approved next mobile choice

Manuel explicitly answered **“yes”** on 2026-10-08 to the concrete question approving **Expo / React Native / strict TypeScript / pnpm, with
expo-sqlite as the single lab database writer**, for the initial native lab only. This accepts that recommendation and updates ADR 0002; it does not retroactively change the host evidence.
It matches the existing focused comparison and documented SQLite capability;
no measured performance advantage is claimed. Alternative Flutter remains viable.
Compatible SDK 57 versions and a pinned lockfile are now selected using the official SDK table, Expo template and bundled-native-module metadata; see [native evidence](../verification/2026-10-08-native-lab.md). Preserve deterministic fixture/behavior parity when porting;
do not maintain Python as a competing production write path.

Native Android/iOS development builds, file selection, private file placement,
encryption capability, backup/restore UI, device restart/readability and secure
cloud-session handling remain independent verification gates. Mobile approval
does not approve a sync protocol, paid build service, paid AI or release.

## Consequences and evidence

This unblocks actual SQL/disk/domain checks without assuming architecture approval.
It does **not** pass the requested phone-local milestone, T02 native readability,
cloud isolation/recovery, handwriting or live-access gates. The bounded fixture
cannot be treated as a completed reconciliation engine.

[Executed host evidence](../verification/2026-10-08-host-local-slice.md) records
the tests, tool versions, outcomes and missing environments. No existing plugin
generator code is reused or modified.

## Native implementation boundary

`packages/flight-logbook` contains pure rules; `packages/local-data` contains the SQLite contract/repository; the app supplies expo-sqlite transactions and private file APIs. Python remains a test/reference harness only. Backups retain all revisions and original synthetic evidence bytes in a versioned JSON envelope; this native lab format is deliberately separate from the earlier host ZIP and is not cross-restorable. Neither format establishes production encryption, authenticity, migrations or sync. Android/iOS device gates remain explicit.

## Subsequent native verification — 2026-10-09 UTC

[Android offline evidence](../verification/2026-10-09-android-offline.md) now records a compiled bundled APK and seven actual emulator UI/expo-sqlite checkpoints, including unchanged snapshot identity across force-stop/airplane-mode restart. Host evidence remains separate. Physical-phone/iOS, full presentation/copy/backup and cloud gates remain open; no additional architecture, sync, paid-call or release approval is inferred.

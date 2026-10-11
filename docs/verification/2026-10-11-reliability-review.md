# Reliability review and first recovery slice

Date: 2026-10-11. Baseline: `c00275e`, clean clone of main. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4), [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11). AGENTS, README, Issues and relevant ADRs were reviewed. Synced `sources/` files remain untouched.

## Implemented, proposed and verified

| Area | Implemented today | Evidence / limits |
| --- | --- | --- |
| Native lab | Expo/React Native, TypeScript, pnpm, SQLite; synthetic source, prepared observations, decisions, queries, fixed writing snapshots, copy assertions, backups | 38 baseline TypeScript checks and 24 Python reference checks pass here. Earlier Android runtime evidence applies to its own documented commits. |
| Provider capture | Default-list probe, separate SQLite snapshots; optional device-local saved login | Earlier Android bounded live capture/reopening documented. Account/club, time basis and complete history remain unverified. No live access in this review. |
| Detail enrichment | Section-preserving reader, desktop bounded observations, pure trial/checkpoint helper | Synthetic checkpoint/expiry tests and earlier desktop proof; native detail scheduling/storage absent. No native resume/all-history claim. |
| Reconciliation | Pure verified-window planner; duplicate/changed/partial/account checks | Synthetic only; disconnected from canonical DB. |
| Multi-book / formats | ADR 0007 and bounded proof/migration proposal | Proposed; no production schema approval or isolation proof. |
| AI | Accepted ADR 0008 boundary and sequence | No handwriting/interpretation execution, paid calls or model selection. |

## Prioritized assessment

1. **Request ownership and raw-capture validation — delivered.** Previously, `AccessProbe.receive` awaited `saveCapture`, then its catch called unscoped `finish`; obsolete asynchronous completion could end a later request. WebView callbacks lacked remount ownership. `storage.latestCapture` asserted parsed JSON as `ProbeSnapshot`. Simplest fix: one `idle/loading/saving` owner, nonce-scoped completion, remount guards and the live decoder reused on persistence. Prevents repeated taps/old responses changing active retrieval and malformed stored rows reaching the result UI. Acceptance: cancel/retry and late verdicts cannot finish another request; same-ID retry creates one row; conflicts, corrupt metadata and failed writes preserve evidence. Host checks pass; native callback/cancellation behavior needs device execution.

2. **Verified capture context and explicit coverage — next #2 gate.** `ProbeSnapshot` honestly carries unverified identity, unknown time basis and visible-list-only coverage. `decodeProbe` rejects empty lists; it cannot distinguish verified-empty scope from layout-only/unsupported tables. `details.attemptDetail` preserves successes on failure, but is a pure prototype without native orchestration or validated persisted checkpoint reads. Simplest next proof: bind observed account/club/context to a bounded run, record list scope/completion separately from each observed detail task, and persist validated checkpoints before continuing. Acceptance: changed context stops the run; fresh observed links drive resume; expiry requires reauthentication; verified-empty, partial and unsupported stay distinct; repeat/resume retains successful evidence. Do not enumerate IDs or enable canonical import before identity/coverage and #11 gates.

3. **Canonical backup validation and selection recovery — follow-up #4.** `LocalLogbook.restore` checks checksum, sequence/revisions, flight basics and some evidence references, but most `paper/page/finding/decision/template/state` payloads are asserted types. Record IDs are not consistently bound to payload IDs, and cross-record references are incompletely validated. `validateFlight` also accepts wrong types for several nullable strings and crew names. Checksum validity does not establish semantic validity. `App.restoreBackup` preserves the old database by restoring into a new DB, but `saveSelection` writes in place before reader refresh; malformed restored state or interrupted selection writing can break reopening. Simplest fix: runtime validators for every existing record kind/reference graph, validate readable restored state before activation, and a tested atomic selection replacement/recovery protocol with the existing file API. Acceptance: checksum-valid wrong types, foreign/missing refs, malformed snapshots and transaction/selection/refresh failures preserve original DB and active selection; old backups round-trip unchanged. These gaps are **not fixed by raw-capture validation**.

4. **Source/book/entry/format boundary — #11 approval gate.** `reconciliation.sourceIdentity` includes dataset ID; `preparePage`/`confirmCopied` key paper by flight ID. `writing` requires a nine-row prepared page, ten-row format, UTC and synthetic assumptions; `literalFields` prints Synthetic Pilot. These lab constraints cannot establish production book identity. Preserve them until the proposed bounded proof demonstrates pilot/provider/club source identity, independent book-entry identity and a versioned format contract. Acceptance: overlapping pages/entries in two books stay isolated, combined queries do not double-credit, migration preserves snapshots/backups or safely rejects unsupported versions. Review the existing [proof/migration plan](../architecture/multiple-logbooks-proof-plan.md) and ADR 0007 before production schema work; neither is approved here.

5. **Current-status clarity — README updated.** Historical Issues/docs contain earlier “not implemented” statements superseded by newer evidence. Keep dated evidence but provide one current entry point separating implementation, proposals and checks. Acceptance: README links this assessment, Android/iOS claims remain separate and synthetic checks never become live acceptance.

## Delivered changes

- `retrieval.ts` replaces pending/reading flags with request ownership and an explicit save phase. Cancel is available before saving; once SQLite starts, the UI waits for its verdict and does not claim rollback. Unmount invalidates UI callbacks; an already-started INSERT may finish and is available after reopening.
- `AccessProbe.tsx` scopes timeout/success/failure to the request, ignores old bridge nonces/WebView generations, locks saving, and prevents a late initial DB read overwriting a newer displayed capture. Failure messages do not expose raw database/bridge exceptions.
- `capture-store.ts` validates writes/reopening through `validateCapture` and the existing table decoder. It checks metadata and DB identity columns, rejects fabricated verification flags, retains prior evidence on same-ID conflict and permits identical same-ID retries. Corrupt latest evidence is reported, never deleted or silently relabelled. Separate successful live retrievals still append new snapshot IDs.
- Schema is unchanged. SQLite INSERT remains atomic; no transaction spans provider access. Synthetic canonical fixtures, Python reference code, credential storage and proposed production identities remain unchanged.

## Verification

Environment: Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12.10; frozen lockfile installation. Baseline: typecheck, **38/38** TypeScript tests, **24/24** Python host tests and fixture parity pass. After changes: typecheck and **42/42** TypeScript tests pass, including real-disk SQLite retry/conflict/restart/corruption and simulated failed writes. Four new tests: `tests/mobile/vereinsflieger-recovery.test.ts`.

Android: Hermes bundle exported successfully. No new Android device/native WebView or live provider acceptance is established here.

iOS: Hermes bundle exported successfully. Windows cannot execute iOS native runtime; no iOS login, cancellation or persistence acceptance is claimed.

`prebuild:check` passes on Windows and generates Android configuration only; no iOS directory is generated on this host. CI status is linked in the tracking Issues after publication. Remaining device checks: slow load → cancel → immediate retrieve; stale page/load/error messages; session expiry/login return; repeated taps; force-stop during loading/saving; successful evidence after reopening; malformed capture handling. Account-switch protection cannot be claimed while provider identity remains unverified.

## Remaining sequence

1. Validated capture: verified account/club context, separate list/detail coverage and recoverable native checkpoints.
2. Review ADR 0007 and execute bounded isolation/format/migration proof before canonical import.
3. One selected-book retrieve/reconcile/write/confirm/backup journey, including canonical restore and selection recovery validation.
4. Prepare synthetic AI evaluation once capture stabilizes; budget/input approval and bounded handwriting/interpretation evaluation precede the real photo-to-writing journey.
5. Broader conversational features and visual polish later.

No architecture approval is needed for this reversible capture slice. Book/source/entry design remains pending Manuel's review; no paid AI, subscriptions, deployment or infrastructure added.

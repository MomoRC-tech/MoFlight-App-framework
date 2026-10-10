# Vereinsflieger export/history investigation continuation

Date: 2026-10-10. Baseline: `a0cc4d3`. Environment: existing Windows desktop, Chrome extension browser and `MoFlight_API37` emulator. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [FL-03](../product/flight-logbook-user-stories.md). This file's publishing commit identifies the new prototype and documentation.

## Actual observations

- Repository was clean and aligned with origin/main before work. Agent rules, user journey, ADR 0006 and existing importer/probe/tests were reviewed. Synced project sources were untouched.
- Native MoFlight still displayed the successful 20-row saved capture. Showing the original provider page revealed the previously authenticated personal flightbook; no capture/database was cleared or replaced.
- Opened the visible period menu: today entered/changed, today/yesterday, last 20 flights (maximum 24 months), last 7/90 days, last 1/2/3 years, month/year shortcuts and custom from/through controls were observed. Availability of those controls does not prove unlimited history, inclusive dates or actual returned coverage.
- Opened the visible role menu: Pilot, Pilot or instructor, Instructor, Companion, Pilot or companion. Selecting Pilot or companion returned to the original login page. The session was no longer usable for that request; the cause and exact session lifetime are unknown. This is an actual reauthentication observation, not a complete expiry/revocation recovery test. Saved capture remains available.
- Existing Chrome provider tab was on the login page, not a reusable authenticated session. User was asked to sign in directly in Chrome (preferable for precise export inspection) or the emulator. Authentication was not automated. No password manager tab was opened or controlled; no credentials were saved in project files.
- Read public [provider AGB](https://vereinsflieger.de/AGB.htm) through the browser; the page labels its text 15.01.2012. It describes the service and customer obligations but does not establish a supported third-party browser/export integration contract. This observation is not legal approval or a conclusion that browser integration is forbidden. Distribution conditions remain open; no provider message was sent.

## Work completed while sign-in is pending

Added a pure experimental reconciliation planner and [concrete import proposal](../architecture/vereinsflieger-import-contract.md). It is not wired to the app or canonical SQLite importer. Existing real captures remain separate; the synthetic-only canonical transport gate is unchanged. Five synthetic tests cover idempotent repeated retrieval, retained edit revisions, rejection of partial/unverified/account-mismatched batches, omission/empty-window handling, conflicting IDs, distinct IDs with identical values, invalid coverage, non-mutating outputs and collision-safe scoped identity.

Actual checks: all 25 mobile tests passed; `pnpm typecheck` passed. Documentation links/consistency and `git diff --check` are checked before publication. No new APK was built or installed, and destructive native smoke was not run against the private emulator. No live export, complete-history traversal or canonical import success is claimed.

## Pending handoff and next investigation

User sign-in is pending at publication. Continue with the authenticated own-flight page: inspect actual Excel export and bounded period behavior; read details to establish IDs/time basis/account references; compare source values privately; then present the verified transport/mapping and atomic persistence design for architecture approval. Unknown export formats and endpoints must not be guessed. Complete history, role/time/account binding, canonical persistence/backup changes, expiry recovery/disconnect/account switching and iOS remain open. R12/#2 is not marked passed.

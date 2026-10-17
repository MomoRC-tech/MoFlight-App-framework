# Safe disconnect verification — 17 October 2026

## Scope

Approved [bounded disconnect/re-login package](../product/2026-10-17-safe-disconnect.md), under #2/#5/#8. Baseline main was clean at `85d9fd0c43eb3dd5312296d98954a47f45278c71`, matching origin/main and live remote. Existing connection implementation and historical evidence were read, not repeated as new results. No new dependencies, canonical import, production binding/schema, paid service, hosted run or physical-phone test.

## Verification in progress

Application source, actual local checks, Release identity and native results will be recorded after completion. Tests/mocks do not prove live provider logout, cookie deletion, natural expiry or second-account isolation. iOS runtime remains unavailable. Pixel 6a retest remains deferred at Manuel's request.

## Design limits

Logout uses the original provider **Abmelden** control, followed by an explicit fresh protected-profile check. No native cookie clear is claimed; the pinned WebView has no public cookie deletion API. Recovery must finish before app-driven disconnect starts; it is never discarded to unblock logout. Credential forgetting and existing development one-attempt saved-login use are separate explicit actions. All prior data and the app-run provisional account/club association are retained.

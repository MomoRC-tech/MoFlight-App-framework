# Reserved provider backup and temporary export settings

Date: 2026-10-12, Europe/Berlin. Baseline clean local/remote main `eafafe9`. Manuel explicitly reserves `MoFlight App user view backup` as the only named configuration MoFlight manages and authorizes overwriting it when needed. [Contract](../architecture/vereinsflieger-view-preservation.md#reserved-configuration-policy--2026-10-12). Earlier collision refusal evidence remains in the [prior report](2026-10-11-vereinsflieger-view-preservation.md); it explains the superseded policy.

## Implemented policy

Journal the actual current supported settings before saving. Refresh the reserved name whether absent or already present, reload it and verify full supported readback. Account display continuity and actual-view equality still gate saving. Installation ownership metadata is no longer read/written; old tables are left intact. Existing version-2 recovery payloads remain unchanged and readable. Pending recovery blocks new exports and backup replacement; restore/verify never saves over a backup.

After backup verification, reset to unnamed active configuration and configure export there. No named export preset is selected, repaired, saved or deleted. Every later export command rejects named active state and changed display context before mutations. New captured snapshots truthfully carry unnamed label `Konfiguration laden` and adapter version 2; historical version-1 named snapshots remain readable. All other pagination, raw-data, scope and persistence guards remain.

## Checks before native trial

Strict TypeScript and all 97 mobile tests pass. Tests cover reserved-name refresh without ownership, a same-name configuration appearing after snapshot, absent/changed original refusal, changed-account refusal, pending-journal replacement/stale-cleanup refusal with real SQLite restart, ignored legacy ownership, temporary reset despite existing export presets, named-view mutation refusal and old/new snapshot compatibility. Git whitespace passes. Python/domain calculations were not changed; no new Python result is claimed.

Native build and live backup/export/restore trial remain pending at this documentation checkpoint. GitHub fast/checkpoint jobs have recently been refused by account billing/spending restrictions; local results do not count as hosted acceptance. Stable account identity, complete page-preference proof, interruption/account-switch matrix and iOS remain open. No LLM execution or private flight/photo/database evidence is committed.

## Committed build before live trial

Implementation source `63523ec5c5734f02efb78741de1d0aa4d11048f8`. Local helper Release build completed at 07:15:01 Europe/Berlin in the clean isolated `C:\Users\Momo\mf-export-build` checkout using the existing JDK 17/SDK. Native regeneration false, caches retained; 93.86 seconds overall / 93.07 seconds Gradle. APK path unchanged: `C:\Users\Momo\mf-export-build\apps\platform-lab\android\app\build\outputs\apk\release\app-release.apk`, 47,134,079 bytes, SHA256 `6c48fe1a00b20d411310e4597e3b5cc050138278cf280ae7fdfe86326ad058e6`; embedded JavaScript and arm64-v8a/x86_64 verified. Android/iOS Hermes exports pass (690/695 modules). Update installation on the name-verified provider AVD `MoFlight_API37` passed without clearing app data.

A separate read-only Chrome tab records pre-trial 40-column order, 84 supported filter controls, no sorting, relative last-20-flights scope and Pilot participation in private runtime memory for comparison. No source/private values are committed. Full native restoration still awaits the trial outcome.

## Native ordinary-completion trial

On the authenticated provider AVD, Retrieve flights for inclusive 2026 completed at 07:16 Europe/Berlin: native UI reports **101 flights across 2 pages saved; original provider view restored and verified**. Pending-recovery action is absent and controls return to idle. This passes the ordinary actual WebView command/navigation/SQLite-save/cleanup path, including refreshing the existing reserved backup on an installation without ownership metadata.

Independent read-only provider reload compares with pre-trial memory: ordered 40 columns, all 84 filter-control states/operators, sort indicators, relative displayed period and Pilot participation match exactly. The quick selector shows the unnamed placeholder after the round trip; the contract verifies preferences rather than promising a preset label. No private flight cells/captures were committed. This is one bounded live-provider trial, not the full acceptance matrix.

Fast CI for `63523ec` was again refused before execution; its mobile check annotation confirms the same billing/spending restriction. No hosted pass is claimed, and billing was not changed.

Repeated Retrieve at 07:17 Europe/Berlin again saved 101 flights across 2 pages and verified cleanup. The visible saved-capture timestamp advanced. Independent provider readback again equals the original preferences exactly. This passes ordinary refresh/reuse of the same reserved name; there is no new backup name or saved export configuration. Actual interruption, cancellation, network/expiry recovery, default/reset original and a second provider account remain untested for this source. No production acceptance or iOS runtime claim is made. Re-dispatch a hosted checkpoint when the billing restriction is resolved before device handoff/full native acceptance under ADR 0009.

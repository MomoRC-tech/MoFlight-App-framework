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

## Interruption continuation

Started from clean local/remote `418d0ed` with installed implementation `63523ec`. A first native cancellation attempt raced ordinary completion: capture completed and its timestamp advanced, with restoration reported verified. No cancellation pass is claimed from that attempt.

Read-only recovery review reproduced a startup bypass in the actual React component using deferred storage and mocked hooks: the historical bounded/dated capture buttons were enabled before the recovery-journal read resolved. A dated-window child could remain open after pending recovery was discovered and modify provider scope. Add readiness/pending guards to button handlers and child rendering, with an actual-component deferred-journal regression. This closes a journal-loading gate rather than weakening pending-recovery protection.

The gate now checks journal readiness/pending state in both handlers and child rendering. Three actual-component deferred-storage regressions pass, and the integrated suite passes 100 tests with strict TypeScript. Further cancellation attempts again raced ordinary completion, so no native cancellation verdict is claimed yet. Native observations also showed Cancel moving when a disabled recovery action appeared during the run. Cancel now occupies the Retrieve action slot during requests; recovery is shown after the request stops, and short progress text has reserved space. SQLite-save/restoration cancellation locks are retained. Build and native validation of these corrections are pending.

The component fixture now has seven passing regressions (104 mobile tests total, strict TypeScript passed). It executes the actual AccessProbe component with deterministic hooks, real retrieval/export/view decoders, native-event/ref substitutes and deferred storage: pending/failed startup gates, stale handlers, pre-journal cancellation/stale snapshot delivery, cancellation lock during journal/capture writes, independently verified cleanup, rejected mismatched readback and a successful recovery retry. This is host timing evidence, not an actual native process-kill result. Independent provider readback after the trial attempts still matches the original supported preferences.

Correction source `29b635c6ca23a7a09f32c1dd83216b62d8e591b8` built locally at 07:58:59 Europe/Berlin: 94.39 seconds overall / 93.57 seconds Gradle, native regeneration false. Release APK path unchanged, 47,134,335 bytes, SHA256 `8c28355ab63b286c2f92391a43e81326f4c9f5fdd251c74fd6f3d103494109b6`, embedded JavaScript with arm64-v8a/x86_64 verified. Update installation on the name-verified provider AVD passed without clearing app data. Native cancellation trial follows.

## Native network failure and offline restart

Source `29b635c`, provider AVD `MoFlight_API37`, 08:04–08:23 Europe/Berlin. Further Cancel attempts raced successful capture/storage/cleanup, so the changed capture timestamp proves completion rather than cancellation. Temporarily selecting GPRS in emulator Cellular controls did not establish a slower request; its original Full setting was restored. No live cancellation pass is claimed.

With guest airplane mode enabled and Wi-Fi disconnected, a retrieval returned **Provider page failed to load. Previous captures preserved.** The saved complete-requested-list capture retained its prior timestamp, flight data and two-page coverage. The failure occurred before a recovery journal/provider mutation was established; this proves early network failure preserves prior captures, not cleanup after a mutated view.

Through Android Settings > Apps > MoFlight Lab, Force stop was confirmed and became disabled. Reopening the installed embedded-JavaScript Release app while still offline, then opening the access PoC, reloaded the same saved capture and timestamp. No recovery action was pending in this trial. This passes actual offline saved-capture persistence across force-stop; pending-journal recovery after process interruption remains untested natively.

Guest connectivity was restored and visibly verified: airplane mode off, AndroidWifi connected, Bluetooth enabled and T-Mobile 5G mobile data enabled. Extended Controls were closed. Independent read-only provider reload still exactly matches the original ordered 40 columns, 84 supported filters/operators, sort state, relative displayed period and Pilot participation. Private runtime evidence remains outside Git.

Android/iOS Hermes exports for `29b635c` also pass (693/695 modules). This is bundle compatibility evidence; no iOS runtime trial was performed.

Hosted recheck: [fast run 38210238239](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38210238239) completed with failure, but all three jobs have zero executed steps. The mobile job annotation explicitly reports failed recent payments or a spending limit. No hosted test failure is inferred. An independent subagent review was attempted but could not start under the agent usage limit; no independent review pass is claimed.

Remaining native gates: cancellation before persistence, process interruption after durable journaling/provider mutation, offline/expired-session recovery of pending cleanup, changed-account refusal and the default/reset-original matrix. Stable account identity and complete page-preference proof remain limitations. Hosted checks are still unavailable under the previously observed billing restriction; no full native acceptance or device handoff is claimed. The next test should establish a reproducible interruption at a known recovery phase instead of inferring cancellation from a rapid click. Chat discovery remains tracked in [issue #13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13); implementation and paid calls remain unauthorized.

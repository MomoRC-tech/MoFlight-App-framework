# Local validation policy and remaining provider-view gates

Date: 2026-10-12, Europe/Berlin. Baseline clean local/remote main `06b5ca0`. Manuel authorized policy task 1 and provider-view validation task 2, explicitly excluding chat proposal work.

## Policy amendment

[ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md) now requires documented local committed-source checks/builds and applicable native trials before scoped acceptance/device handoff. Hosted CI is optional/manual-only. Normal pushes must not dispatch runners. No paid CI, billing changes, spending-limit increases or paid runner/storage usage are authorized. Hosted restrictions do not block acceptance when the relevant local evidence is complete; missing native/provider/platform proof still does. Historical reports retain their original hosted outcomes without creating a current payment requirement.

## Provider validation plan and constraints

The [previous native report](2026-10-12-reserved-view-backup.md#native-interruption-results) already verifies ordinary completion, cancellation after reset, force-stop/restart with pending recovery, offline cleanup failure and successful connected retry for compiled `bf9ab60`. Do not repeat those as new proof or claim full acceptance.

Manuel confirmed no second authorized Vereinsflieger account is available. Real account-switch refusal cannot be tested here; retain that gate and independently check synthetic component/driver guards. Account display labels still do not prove stable identity.

For default-origin testing, privately record the customized view and verify that the sole reserved backup restores it before resetting. Use provider reset to establish/observe the supported default. A genuinely default-origin run must skip backup saving and restore through reset, leaving the reserved customized backup recoverable. Finally load that existing reserved backup and independently compare against the original private preferences. Do not create or modify any other named provider configuration.

For session loss, pause only after verified reset/durable backup, then use the provider's normal logout controls and verify that cleanup remains pending and captures survive. Same-account sign-in remains user-controlled; retry and independently verify restored preferences. Explicit logout is session-loss evidence, not proof of naturally elapsed server expiry. Never inspect hidden credentials/cookies or force expiry by manipulating the user's session through shell/network tools.

No private flight exports, screenshots, databases, credentials or signed URLs enter Git. Implementation/host tests, actual native outcomes and unavailable cases are recorded separately below as work completes.

## Policy and host checks

Both hosted workflow files now expose only workflow_dispatch; automated push/native-path triggers are removed while manual source/fresh-build/reuse controls remain. A regression covers every workflow so future automated events cannot silently restore quota consumption. All 40 Python tests and YAML parsing pass; no hosted dispatch or billing mutation was performed.

Independent recovery review found no new definite cleanup-loss bug. Three actual-component regressions were added: pending recovery through login redirect/same-account retry; changed-account export/restoration callbacks refused while retaining journal/capture; and default-origin full completion with synthetic driver DOM proving named backup saving/loading is skipped and reset restoration occurs before cleanup. Strict TypeScript and all 109 mobile tests pass. These do not establish real second-account authorization, natural server expiry or universal default-control completeness.

## Live reset contract discovery

Before mutation, fresh native UI had no pending recovery and the customized original was privately observed as 40 columns/84 supported filters, last-20-flights relative period and Pilot. Loading the existing reserved backup independently restored exactly those settings. No other named configuration was touched.

Provider reset then produced the expected 16 ordered columns and 49 clear supported filter controls, unnamed active label, no sorting and Pilot, but **retained the last-20-flights period** across a fresh reload. Therefore reset cannot yet be assumed to restore all date preferences. Explicitly selecting the observed Das letzte Jahr menu item established the implementation's recognized default-origin signature for a native trial; this setup is not a claim that the provider universally defaults to that period. The reserved customized backup remains untouched/recoverable.

The `bf9ab60` native trial saved 101 flights/two pages and reported verified cleanup; desktop readback matched the 16-column setup. However, reloading the reserved backup now returned that 16-column state rather than the original 40-column state. Therefore this trial is **not a proven reset/default-origin pass**: the native snapshot may have retained a named preset label even though desktop showed an unnamed state, causing conservative reserved-backup selection. Shared column/period preferences do not establish selected-preset continuity across desktop/native sessions. No default-restoration code defect is inferred without branch evidence.

The original 40 ordered columns were rebuilt through normal provider configuration controls from private recorded evidence, the original last-20-flights period selected, and a fresh readback exactly matched all original supported preferences (40 columns/84 controls/order/sort/period/Pilot). No other named configuration was used. A fixed public reset/reserved-backup strategy indicator is added to the lab, derived only after durable journal saving or startup journal read, retained after cleanup and cleared on a new request. Four new component regressions plus existing tests pass: 110 mobile tests and strict TypeScript. Native default setup must now be performed inside the actual WebView, with the chosen strategy verified explicitly.

## Strategy-observable build

Committed source `b09377920c6fb2f26a242e3dce2501b7776604fa` built at 2026-10-12 14:59:34 UTC (16:59:34 Europe/Berlin): 95.13 seconds overall / 94.30 seconds Gradle, native regeneration false. Release APK in the existing isolated `C:\Users\Momo\mf-export-build` checkout: 47,135,331 bytes, SHA256 `db65d5a45d1b36ccce50040465ca04902316a249e08e2594eec7bf0dabbbfa89`, embedded JavaScript, arm64-v8a/x86_64. Update installation on reverified `MoFlight_API37` retains app data. Live branch/session results follow separately. No hosted workflows started for the new policy/source pushes.

On that build, a fresh native ordinary run from the restored customized view explicitly reports **reserved backup** strategy, saves 101 flights/two pages and verifies restoration. Independent provider readback again matches the original supported 40-column preferences. This also refreshes the sole reserved backup with the correct customized state before further native-only setup.

The native period menu was reachable by scrolling its actual WebView and Das letzte Jahr was selected there. An additional opt-in pre-backup checkpoint now stops after durable journaling but before any named backup replacement, allowing strategy inspection and safe cancellation while the reserved customized backup remains intact. Continue retains nonce/phase ownership; native loads/stale callbacks cannot advance the pause. Two additional component regressions pass (112 mobile tests/strict TypeScript). Both test toggles remain off by default/transient; normal retrieval is unchanged. Bundle export of the evolving working source passed Android/iOS (693/692 modules); exact committed native source/build evidence follows separately.

Pre-backup checkpoint source `907cc3070e3e6a12b2c79a392d3d3c4eae8f7670` built at 2026-10-12 15:14:43 UTC (17:14:43 Europe/Berlin): 93.97 seconds overall / 93.15 seconds Gradle, native regeneration false. Release APK: 47,136,091 bytes, SHA256 `a7f807f9eedc5d991d4f8da8b37cc187873f38cd994a5987a77856bf82bfaad4`, embedded JavaScript, arm64-v8a/x86_64. Update installation retains provider-app data. No unrelated checkout/emulator was reset.

The protected native trial stopped before backup changes and explicitly reported **reserved backup**, despite default-looking structural settings and a native-selected last-year period. It was cancelled rather than allowed to replace the earlier custom backup. Native cleanup reported original view restored/verified; the prior capture stayed unchanged. Loading the reserved backup independently then exactly restored the original 40-column settings, proving the pre-backup pause avoided replacement. Default-origin acceptance remains open. The lab's accumulated diagnostics left insufficient visible WebView height for some provider controls; a layout-only expansion control is being added without remounting the WebView or changing request/recovery state.

The layout expansion is implemented. A stable controls container is hidden via layout only, while the same WebView parent/key/source/ref and generation callbacks remain mounted. Expand respects saving ownership; Back stays available. Two actual-component regressions verify unchanged native callback ownership, injections, journal/capture state and cancellation guards across both layouts. Strict TypeScript and 114 mobile tests pass. Native expanded-page/reset/logout trial remains pending; no new default/session-loss pass is inferred from host tests.

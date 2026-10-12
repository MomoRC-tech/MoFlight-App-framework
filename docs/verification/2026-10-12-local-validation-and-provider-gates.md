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

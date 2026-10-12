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

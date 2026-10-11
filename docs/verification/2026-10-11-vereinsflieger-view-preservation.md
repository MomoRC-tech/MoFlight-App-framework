# Provider view preservation continuation

Date: 2026-10-11, Europe/Berlin. Baseline `cd69e70`, local/remote main equal after fetch. All six unpublished replay-draft files were reviewed/adapted; no unrelated edits were present at the initial check. [Contract](../architecture/vereinsflieger-view-preservation.md), #2/#10. This report's implementation commit identifies the new source; native acceptance remains open.

## Desktop evidence

A separate authenticated Chrome tab was created; the unrelated provider tab was not controlled. The original actual 40-column order, explicit 2026 scope, inclusive participation, filter states and sorting were observed before changes. Created `MoFlight App user view backup` using normal provider controls. Loading the older export definition then the backup restored the actual customized columns and scope. A separate app-created proof preset round-tripped restrictive aircraft-type text, a deselected launch checkbox, descending aircraft-type sorting and `Das letzte Jahr`. Same-name save reported `aktualisiert`; its changed checkbox state survived reload. One proof name was shortened by the provider, so exact name readback is required.

Reset selected the default 16-column order, `Konfiguration laden`, `Das letzte Jahr`, `Pilot`, clear restrictions and no sorting. The user's 100-row preference was unchanged; global page-size changes were not tested. Settings changed while a preset was active were subsequently remembered under that preset; therefore the implementation must leave the backup before modifying export settings. After experimentation, the original journaled 40-column order, clear filters/no sorting, explicit 2026 period and inclusive participation were restored and read back. Active label is the backup name. Earlier dates before this handover remain unknown. No flight records were edited or copied into Git. The two app-created configurations remain available; no user preset was deleted.

## Implementation and checks

Replaced direct replay with named backup and conservative complete-default/reset recognition. Journals original evidence before saving; reloads the backup and verifies columns/order, filter states/operators, sort icons, period and participation before allowing export. Missing export preset first leaves the backup through reset, then configures/saves export. Durable ownership allows same-name reuse only for the observed owning context; name-only collisions stop without export mutations. Restoration runs after success/failure/cancel; interrupted cleanup remains visible and blocks further exports/labs. Storage writes retain request ownership and disable cancellation. Capture success and restoration success are reported separately.

Host independently verifies restored evidence before clearing the journal. Pending evidence cannot be replaced and cleanup deletes only the exact expected payload. Version-1 replay-draft journals are not silently migrated; malformed/unsupported journals block exports. Recovery before any mutation can verify the unchanged original without needing a newly created backup.

Strict TypeScript, 93 mobile tests, 39 Python checks and canonical fixture parity passed. Mobile tests include a real on-disk SQLite reopen/ownership/stale-cleanup test plus synthetic backup controls, filters/sort/relative scope, default false positives, name collision, account mismatch, interruption, stale tokens and host readback tampering. These do not execute React Native WebView timing or a real provider session. Android/iOS Hermes export and final committed Android build are recorded below once completed.

Android/iOS Hermes export passed (693 modules each) before the final load-start ordering guard. The committed-source local build below is the final Android compilation gate. Save/load acknowledgements and native navigation can arrive in either order; an outstanding owned command advances at load-start only if its acknowledgement has not already consumed the token. This ordering guard still requires actual native provider testing.

Earlier checkpoints [e206795](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38153542242) and [e46d79b](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38153657675) were rechecked: both completed successfully. They predate preservation and cannot accept this change.

## Remaining acceptance and limits

Provider account identity remains display-context-only. Different observed labels stop restoration; identical labels are not proof of the same stable account. Ownership metadata is local and cannot prove that a user has not deleted/recreated a same-named provider configuration. No production account-isolation guarantee is claimed. Relative scope comparison uses provider labels, not stale hidden date defaults; date-relative result rows naturally change over time. Former preset label is not restored by replaying an older saved definition.

Native trial still required: actual login; ordinary capture/restore with custom and default views; restrictive filters/sorting; repeated owned-backup reuse; missing/colliding preset; force-stop/restart recovery; expired session/network loss/cancel with prior capture retained; stable account-switch protection; provider page-size behavior. The synthetic Android checkpoint validates the general lab, not this live contract. No iOS/physical-phone preservation execution is claimed. The old `6de2723` local APK remains historical until a final-source build is recorded.

Next feature remains [chat discovery #13](../architecture/logbook-chat-discovery.md). Its documentation/tracking is complete for this stage; implementation and paid calls require separate authorization.

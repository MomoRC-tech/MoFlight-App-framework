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

## Final committed-source build checkpoint

Implementation source: `d179d6bc7402daf4048fd16bdd33b8863690b846`. Local helper completed at 19:03 Europe/Berlin with JDK 17.0.20.1, installed Windows Android SDK and clean isolated `C:\Users\Momo\mf-export-build` checkout; caches retained and native generation unchanged. Release build: 93.40 seconds overall / 92.59 seconds Gradle. APK: `C:\Users\Momo\mf-export-build\apps\platform-lab\android\app\build\outputs\apk\release\app-release.apk`, 47,138,667 bytes, SHA256 `1ac5d605eaba0fd587c4ead363689e59f389fca9282dd4d286e2e62c722515f7`; embedded JavaScript and arm64-v8a/x86_64 confirmed. No emulator reset/install/provider-session manipulation occurred. The earlier `6de2723` build is superseded for compilation only.

Final-source Android/iOS Hermes exports were repeated after the ordering guard and passed (693 Android / 695 iOS modules). This still does not establish either platform's live runtime behavior.

[Fast CI 38157941214](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38157941214) passed for that exact source. Fresh manual [Android checkpoint 38157941293](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38157941293) was dispatched and is in progress at this documentation checkpoint; its plan job passed and Android job is running. Do not infer native/live preservation acceptance from either compilation or the synthetic harness. Native CUA APIs are disabled in this session, so actual provider WebView interaction was not tested. No iOS/phone execution is claimed.

Desktop-created `MoFlight App user view backup` has no ownership marker in a fresh native installation. The native collision guard will therefore stop rather than adopt/overwrite that configuration. Resolving such a collision remains an explicit user/provider action; no automatic deletion or name-only adoption is implemented.

## Recovery ordering review — 19:40 Europe/Berlin

Rechecked clean local/remote main at `433602a`. Android checkpoint `38157941293` has passed its plan and APK build; the emulator smoke job remains running. No native/live-provider acceptance is inferred.

Read-only host/driver/storage review found two gaps requiring correction before further acceptance: export driver account continuity was checked by the host only after a command could mutate the provider page, and backup-name collision ownership was checked at snapshot but not again after asynchronous journaling immediately before save. Add pre-mutation checks and synthetic regression cases for an account change and a collision appearing between snapshot and save. Journal-before-mutation, request-owned SQLite writes and exact-payload cleanup remain the intended order. No live session was changed during this review.

Both gaps are corrected in this continuation: each export command compares the journaled display context before any provider controls are changed, and backup save repeats the collision/ownership check on the current document. Strict TypeScript and all 95 mobile tests pass, including new no-mutation cases across every export phase and a name collision introduced between snapshot and save. Review found no additional definite durable-store failure. Host save/cleanup ownership and native navigation ordering were reviewed, but their live WebView timing still requires device evidence. Existing APK/checkpoint source identities above predate these two corrections.

## Remaining acceptance and limits

Provider account identity remains display-context-only. Different observed labels stop restoration; identical labels are not proof of the same stable account. Ownership metadata is local and cannot prove that a user has not deleted/recreated a same-named provider configuration. No production account-isolation guarantee is claimed. Relative scope comparison uses provider labels, not stale hidden date defaults; date-relative result rows naturally change over time. Former preset label is not restored by replaying an older saved definition.

Native trial still required: actual login; ordinary capture/restore with custom and default views; restrictive filters/sorting; repeated owned-backup reuse; missing/colliding preset; force-stop/restart recovery; expired session/network loss/cancel with prior capture retained; stable account-switch protection; provider page-size behavior. The synthetic Android checkpoint validates the general lab, not this live contract. No iOS/physical-phone preservation execution is claimed. The old `6de2723` local APK remains historical.

Next feature remains [chat discovery #13](../architecture/logbook-chat-discovery.md). Its documentation/tracking is complete for this stage; implementation and paid calls require separate authorization.

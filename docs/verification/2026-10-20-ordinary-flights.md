# Ordinary saved Flüge integration — 20 October 2026

Tracking: [#2 package contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6296437241), #19 and #8. Manuel’s “push and proceed” authorizes this M3/P4 increment after the separate #36 risk decision and bounded #19 acceptance. Statistics follows; books/paper, iOS, training and new invoice retrieval stay deferred.

## Result and boundary

Application source **`2e3d78b`**, following `4b89613` and `a90fec4`, connects ordinary Flüge to the selected real account library. List, source-date/year, text and recorded-registration filters, source-specific details, raw fields, coverage/freshness and explicit update/recovery entry are implemented. Native width/keyboard matrix and final preservation are still being completed; this record does not yet claim their completion.

Opening/filtering reads existing files only: no owner creation, migration, command resolution, provider retrieval or synthetic book-flight adoption. Short-lived sessions check current ownership before and after coherent reads, reject changed account/flight/reference/revision and release handles. Background, inactive and unmounted results cannot publish. Detail Back retains query/position; another owner/store resets them. Hidden/loading native zero-offset events cannot erase the saved return position.

Source dates, reported durations, separate crew slots and eight-field raw pages retain missing/blank/invalid/conflicting values. No roles/credit, aircraft class, UTC/landing day, track, distance or book membership is inferred. Coverage and distinct retrieval/save times do not imply lifetime completeness or a verified provider session. Explicit setup/update/recovery reuses CoreFlightFoundation after guarded browser suspension; reviewed saving remains there. Returning reloads locally. Synthetic dashboard/book/AI tools stay separate. #30 acknowledgment/diff UI and statistics are separate work.

## Verification

Node **24.18.0**, pnpm **11.25.0**, Windows/Python **3.12**, JDK **17**, Android API **37** emulator. Complete corrected-tree `pnpm check`: **578 mobile / 109 Python**, types/lint/fixtures, ignored `build/host-checks/20261020T172937Z-475c58ee/`. The new presentation regression fails without the scroll guard (`0` instead of retained `240`) and passes with it; intentional search changes still reset position. Reader/lifecycle tests cover foreign scope, changed revision, cleanup, failure/retry, background/foreground and detail cancellation. Existing service/native/storage tests protect the reused writer; there is no new write/provider adapter. Both platform exports pass on `4b89613`; later changes are bounded shell copy/routing, save-time display and scroll-event handling, compiled in the later Releases.

Latest committed-source Release: **`2e3d78b`**, embedded JavaScript, **arm64-v8a/x86_64**, vital lint, **108.2 s**, SHA-256 **`0ff0d2be64fb76ae7bb310af7095e5c3f7eac6e1079ea4750a942b9aa3f36ae5`**. Manifest/build console: ignored `local-data/ordinary-flights-2026-10-20/verified-build/` and `verified-build-console.log`. It includes the separately approved #37 backup configuration; actual cloud backup/restore or device transfer was not tested.

Source-specific native evidence lives in that same ignored package directory:

| Source / evidence | Actual result and reuse boundary |
| --- | --- |
| `dfce9ce`, `provider-before/report.json` | Before installation, backup exactly equals the previously accepted generation-8 graph: 101 flights/eight receipts. No retrieval/save. |
| `4b89613`, completed assertions in `provider-ordinary/` | Actual offline different-process ordinary list (101), coverage, all original five references/revision labels, details and retained query/row position. Later raw-helper failure excludes a whole-helper pass. |
| `a90fec4`, `provider-final-corrected/report.json` | Actual offline different-process list with correct real-data footer, distinct saved-time/coverage disclosure, detail return, empty text result, source year + recorded-registration filter, explicit update route with six-month saved-coverage plan and reload on return. No new retrieval/save. |
| `a90fec4`, `provider-raw-final/report.json` | A newer-generation source detail/date and **48/48** original header/value pairs match the independently saved graph across eight-field pages, offline. Reused after the scroll-only correction; no claim of rerunning this entire comparison on another source. |
| `a90fec4`, `synthetic-retained-empty/report.json` | Retained never-saved owner displays zero real flights without synthetic fallback; ordinary update shows January 1 of the previous year–today, and the empty list reopens after actual offline process restart. No live first retrieval/save. Known prior APK/radios/display restored; synthetic AVD stopped. |
| `2e3d78b`, `provider-matrix/scroll-comparison-private.json` | Real nonzero list position survives leaving Flüge and reloading it. This completed assertion is reused from a later-failed keyboard helper, without a whole-helper pass. |
| `2e3d78b`, `provider-keyboard-fixture/report.json` | With temporarily controlled OS handwriting/hardware-keyboard preferences, native WindowManager proves the 360 dp search above the full soft keyboard (top 601 px). Original preferences/radios/display restored. |
| `2e3d78b`, affected matrix / final preservation | Pending final results. |

MIN360 / MAIN390 / MAX600 / landscape and enlarged-text evidence must name actual dp/density/font scale. Screenshots and raw comparisons stay private. Source-specific reuse above is intentional: the last correction affects list-position events, not source parsing, the saved graph or the existing write flow.

The `2e3d78b` controlled-keyboard matrix completed list/filter/detail/keyboard cases at **360 × 900**, **390 × 900** and **600 × 1100 dp**, density 160/font 1.0, plus profile/detail return and hardware Back. Its **900 × 600 dp landscape** case exposed an actual app defect: search at y332–380 was obscured by the keyboard starting at y272. The follow-up moves search/year controls before the longer status card and caps the header group at 520 dp. Existing behavioral regressions protect filters/scroll; a structural snapshot adds little useful protection for this layout-only correction. Final-source native layout/keyboard replay is required and pending; the failed landscape attempt is preserved, not accepted.

## Failed evidence retained

- Initial host run `20261020T170807Z-77b5dab3` found a test callback lint defect and stopped printing a diagnostic under Windows console encoding. Corrected callback and UTF-8 rerun pass; the failed run is excluded.
- `provider-ordinary` assumed unflattened React View groups for raw fields. Android flattens them; corrected adjacent native header/value comparison passes all 48 pairs.
- `provider-final` expected `pidof` to succeed immediately after APK replacement had stopped the process. The corrected helper explicitly launches, records the PID and performs another offline restart.
- Synthetic preflight had no package path after cold boot. Metadata/errors and the known prior APK are retained; direct app-data archival was unavailable because this image denies root. Reinstallation used `-r`, without clearing/uninstalling. A subsequent helper wrongly expected missing setup although the retained never-saved owner was present; the corrected retained-empty trial passes. Missing-registry behavior is host-tested, not claimed as native first-use acceptance.
- Initial keyboard helpers expected a full-width IME, but the emulator’s stylus-handwriting mode presented a floating toolbar. Enabling the hardware-keyboard preference alone was insufficient. The bounded fixture disables OS stylus handwriting and enables the soft keyboard for the trial, then restores both exact original settings. No application defect or keyboard acceptance is inferred from the failed helpers.

Original reports/scripts/XML and failed attempts are preserved, including reports whose original status remained `running` after an exception. `failed-evidence.json` classifies those partial attempts; none is accepted as a whole pass.

## Preservation and limits

Final exact-graph/session/device preservation is pending. No provider data reset, login helper, new flight retrieval, canonical save, paid execution or manual hosted run is part of this increment. Destructive smoke remains restricted to MoFlight_Synthetic_API37. The original #36 ANR cause is still unproven and its accepted risk unchanged. Never-saved live-first retrieval/save remains untested under the accepted #19 decision. Android evidence does not establish iOS, physical device, live second-account, native power loss, #37 cloud/device transfer, or broader release acceptance. A new live retrieval/review/save through the ordinary entry is not rerun here; the unchanged component’s earlier source-specific evidence is reused.

# Whole-app simplification and user-first review — 2 November 2026

Tracking: [#114](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/114), test package [#115](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/115), existing #9/#41/#94/#101/#105. Owner requests broad review/refactoring, suitable open-Issue implementation, delegated visual choices and public app comparisons. The main agent coordinates three independent source reviews; implementation uses bounded, non-overlapping ownership.

## Rollback and preservation

Pre-review application source is `eeda7a063fb5266b89cf306d6ad9b937946b0496`. Its [rollback release](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/tag/rollback-2026-11-02-eeda7a0) preserves a remote source tag. Eight already committed local changes were pushed before creating the tag; review drafts are excluded. A matching committed-source Android ZIP is being prepared. This checkpoint does not snapshot private data/provider sessions or accept pending aggregate recovery. Existing dirty performance-ledger files remain outside this package.

## Review coverage and findings

This is a broad source review of major subsystems and critical paths, not a claim that every branch or device state has been exercised.

| Area | Inspected sources/boundaries | Finding and disposition |
| --- | --- | --- |
| Shared domain and books | `packages/flight-logbook`, `packages/local-data`, query/statistics/writing/book contracts | Keep deterministic rules and account/book/format separation. Real book/photo/cloud work remains unfinished integration, not a new regression. No replacement architecture needed. |
| Local flight library | real-flight library/model/service, schema/replay, selection, command journal, own-flight reader/hook | **Implemented:** index latest facts once rather than scan records per flight; evidence-only reads use the same validated snapshot without building unused display flights. Owner/schema/replay/recovery gates retained. |
| Retrieval/controller | explicit access/retrieval, optional-source orchestration and native permit/backup recovery callers | Preserve current transport and pending operations. Runtime checks protect different boundaries; no evidence supports blanket deletion. Successful ordinary resume after the prior exact-permit fix remains #29/#101 acceptance. |
| Statistics | selectors, model, Explorer, Charts, overlay/contributors | **Implemented:** shared parent dataset, one sort for group quartiles, Start time/count drilldowns, one named chart selector instead of duplicate carousel. Preserve exact contributor scopes and unknown/conflicting records. |
| Expense processing | projector, captured-source adapter, collection/evidence/native reader | Deterministic money and source contracts remain. Native reader repeats raw-archive validation; future scoped read sharing must retain fresh owner/selection/inventory checks. **Implemented UI:** chronological monthly chart with exact EUR values and local month selection. |
| AI | snapshot/projection/tools/run controller/workspace, protected relay/runtime | Full projection/source review is rebuilt for current-context fences. Worth a bounded follow-up, but generation-only reuse would weaken changed-content detection. Ordinary live service/model acceptance and funding remain existing gates. |
| Backup/preservation | issued aggregate readers, journal/native permits, financial candidates | Keep old-format absence semantics, exact ownership and resume IDs. Do not remove integrity checks to improve elapsed time. Rollback source is preserved independently of private data. |
| Navigation/Start/Flights | MobileApp, Dashboard, OverviewTiles, OwnFlights, FlightCard/Details | Five tabs and retained Back/scroll exist. **Implemented:** main Start metrics now open selected-year detail. Flights already uses progressive source disclosure; density refinements remain incremental. Unfinished primary Flugbuch tab is a product decision. |
| Club/Medical | ClubInformation, DutyRoster, Medical and section navigation | Keep source-specific status and unknowns. Horizontal section choices can hide destinations; consolidating repeated source metadata is a follow-up. No medical eligibility inference. |
| AI/Settings/Help | AiChat/route, grouped Settings, HelpScreen, first-use/error states | Existing grouped/disclosure approach is suitable. AI availability wording and repeated backup/coverage copy can improve; service activation is separate. Help needs ordinary populated/native/domain-content acceptance, not a broad redesign. |
| Development/About/diagnostics | secondary hubs and synthetic proofs | Keep tools away from normal journeys. Do not repeat old native proofs merely because their source is reviewed. |

## Test strategy

The existing workflow already requires proportionate checks. The principal correction is execution discipline and removing concrete redundant work, not deleting important boundary coverage or adding a new framework.

Source inventory at review: 204 mobile test files / 32,762 lines before this package's new component test; 23 Python files / 158 statically counted methods. Counts describe breadth, not usefulness. Retain independent arithmetic/uncertainty, foreign-owner, cancellation, restart, atomicity, idempotency and process-exit tests. Presentation tests should cover actions, routes and accessible states; exact cosmetic constants do not establish visual acceptance.

**Implemented #115:** ordinary benchmark tests request two independent trials instead of five, reducing their repeated samples from 30 to 12. Both actual native callers retain the default five trials. All four scenarios, both verification variants, graph equality, readback and reuse counters remain. Surface tests stop freezing exact hex/padding/opacity while retaining interaction/accessibility/target-size and Start/content separation.

Historical `build/host-checks/20261030T231228Z-d2f0ceb0/report.json` (source eeda7a0, dirty tree) records 46.044 s mobile and 30.833 s Python. Concurrent individual test durations cannot be summed into a predicted wall-clock saving. No speedup percentage is claimed. The maintained [verification workflow](../development/verification-workflow.md#work-in-bounded-packages) records focused editing checks and one shared stable-package checkpoint.

## Public visual reference review

Public documentation/screenshots were reviewed without login, subscription or spending. WeGlide summary/statistics and ForeFlight phone/tablet screenshots were visually inspected by the delegated UI reviewer; Strava/LogTen features below are documentation evidence, not hands-on interaction. Reference screenshots stay ignored and are not app assets.

| Reference | Useful pattern | MoFlight adaptation |
| --- | --- | --- |
| [WeGlide statistics](https://docs.weglide.org/how_to/statistics.html), [Statistics List](https://docs.weglide.org/premium/statistics_list.html) | Short summary versus specialized dense analysis | Keep Start concise; put distributions and source explanations in detail. Do not reproduce a competition spreadsheet on a phone dashboard. |
| [ForeFlight Logbook](https://www.foreflight.com/products/logbook/) | Labelled recent-period totals lead to entries; tablet summary/list context | Tappable metrics, selected period/group, exact flights, retained Back. Its published sample image includes 2020 entries; it demonstrates a pattern, not current app geometry. |
| [LogTen workflow](https://logten.com/how-it-works/) | Role-specific Smart Groups | Named role/aircraft/launch views rather than every metric at once. No invented proficiency score. |
| [Strava Progress Summary](https://support.strava.com/en-us/articles/15401618-progress-summary-chart), [Training Log](https://support.strava.com/en-us/articles/15402077-training-log) | Chart → interval → activities → detail; calendar as deeper context | Combined month time/count view and exact contributors, with explicit coverage. Missing source history must not look like inactivity. |
| [Material cards](https://m3.material.io/components/cards/guidelines), [lists](https://m3.material.io/components/lists/guidelines), [interaction](https://m3.material.io/foundations/interaction), [Google target guidance](https://developer.android.com/develop/ui/compose/accessibility/api-defaults) | Hierarchy, progressive detail, usable targets | Existing navy/cyan native primitives and original logo; fixed controls/calendar cells at least 48 dp. M3 text retrieval is a JavaScript shell, so detailed content extraction is not claimed. |

No unsupported tracks, thermals, speeds, distances, legal currency or training-progress graphics are added. Monthly plot segments remain narrow; full-size Values/Flights alternatives remain available rather than overlapping hit regions.

## Verification and acceptance

Environment: Windows, Node 24.18.0, pnpm 11.25.0; synthetic local checks without model/provider calls. Focused packages passed: logic 88/88, UI/navigation 31/31, benchmark/surface 5/5, cost model/component 5/5. The first shared host run `build/host-checks/20261102T114307Z-1c224bd7` passed types/lint/Python/fixtures; three financial UI tests failed because their module-stub harness did not register the extracted component. Updated the harness, retained account/lifecycle/Back checks and added an assertion that chart selection changes the local period without refresh; affected four tests pass. Only the failed mobile suite needs rerunning; unchanged passed checks are reusable.

The failed mobile suite was rerun after the harness correction: **2,156 pass / two skipped** (`build/refactor-20261102-mobile-rerun.log`). No application source changed between those runs. A subsequent isolated, non-persisting Costs example was added to the existing Development design preview for native visual inspection; it mounts the real monthly chart with synthetic unknown/zero/conflicting values and never opens financial files. Final TypeScript and affected-file lint pass. Handbook generation/freshness passes; the first preview compile caught an unsupported Label prop, corrected by placing the live region on its View.

Native visual/interaction acceptance for this package is pending a committed-source Release checkpoint. Source/component-node tests do not prove native clipping, layout, focus or keyboard behavior. Dark MIN360 / MAIN390–412 / wide600+ checks apply to changed UI; actual runtime measurements belong to #90. Phone/iOS/light/spoken and live-provider acceptance remain explicitly separate.

## Remaining packages and major decisions

- #114/#13: separate AI context validation from expensive projection, retaining exact content/availability checks; no live activation.
- #101: scoped validated financial read sharing; preserve fresh async identity/inventory fences. Reduce repeated coverage copy through existing disclosures in a later visual increment.
- #94/#9: clearer aircraft/count/time comparison rows, fewer initially visible metrics, discoverable Club sections and progressive advanced charts; retain source semantics.
- #29/#34/#101: actual preserved same-file aggregate resume, exact re-export, update and ordinary recovery acceptance remain open; do not erase pending operations.
- Product decision: retain the unfinished Flugbuch primary tab, or move its preparation entry to secondary navigation until the real workflow exists.
- Existing beta decisions: operator/audience and privacy/distribution facts (#21/#97/#98), plus explicit live-AI service/input/funding scope (#13/#72–79). This review does not authorize spending or invent those facts.

Each remaining package stays with its matching Issue. Review findings are not completion of open umbrella Issues or acceptance of unexecuted device/provider/model checks.

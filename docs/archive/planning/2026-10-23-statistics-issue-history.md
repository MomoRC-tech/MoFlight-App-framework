# Issue #9 history before statistics-plan cleanup — 23 October 2026

Historical snapshot of [Issue #9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), fetched before its planning cleanup. Dated delivery, approval and publication statements below describe their original checkpoints; they are not current next actions. Active requirements remain in the [journey map](../../product/2026-10-13-journey-information-map.md#understand-my-flying), current scope in Issue #9 and ordering in the [project plan](../../project-plan.md). Source-specific verification reports remain maintained and are not archived by this snapshot.

Original title: [Feature] Flight-history queries: aircraft counts and last/count flights with a person

---

## Review continuation result — 22 October 2026

Implemented the approved current-filter slice: distinct count, known reported duration and missing-duration count for the selected year/date/registration/text rows. Zero/unknown/empty, duplicate IDs, same-model registrations and owner reset are covered. Native empty-state layouts pass at 360/390/600 dp and enlarged text. Populated query cases are host-tested; broader person/role/comparison/distribution queries remain open.

Application `e1f90b6a84b9adca63934f8e8b95e52e83b4ba06`, evidence `0b9eed0`, pushed main. 780 mobile/110 Python, types/lint/fixtures, both exports, committed local Android Release and eight scoped native checks pass. Exact file witness is limited to the named data stores, not all app state. Original APK/settings restored, temporary probe removed and owned synthetic emulator stopped. No paid execution or private-value publication.

[Single verification report](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/verification/2026-10-21-simple-flight-loading.md#review-continuation--22-october-2026) · [download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/lab-2026-10-22-review-continuation/MoFlight-Android-review-continuation.zip). Public unauthenticated ZIP download, contents, SHA256 and embedded source metadata verified. Parent Issue remains open for the limits above.

---

## Approved saved-flight query slice — 22 October 2026

M4 / R04/R12 / FL-10/11 / E07/E09. Add a compact summary of the current filtered saved-flight result: distinct count, known reported flight time and unknown-duration count, with exact contributing rows retained below and an aircraft filter using recorded registration. Reuse current year/date/text/registration filters and existing domain duration rules; no person identity inference, credited-role totals, complete-history claim, costs or additional query service. Test combined filters, duplicate rows, zero/unknown/missing durations, same-model distinct registrations and scope/reload behavior. Apply affected native MIN/MAIN/WIDE/enlarged checks only to the changed summary.

---

## Approved Start/data package — 22 October 2026

Manuel explicitly instructed **Implement the proposed plan**, including his selected quiet check/manual update, both monthly measures with prior year, full club summary, earliest recorded Medical expiry, abbreviated names and 30-day local roster.

Add always-visible monthly flight-count and known-duration charts, current/prior year; current month compared through same calendar date, future months empty, unknown durations/coverage explicit. Month drill-down opens exact contributing date range; latest saved flight summary includes aircraft model/start type/PIC/Begleiter and opens exact details, ambiguous ordering remains explicit.

Status — delivered 22 October 2026: application `6dcc0da` and evidence `fcfe9cc` are pushed to main. [Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/lab-2026-10-22-start-dashboard/MoFlight-Android-start-dashboard.zip). APK SHA256: `0dfdced55745047136cb3de5b9804c3b3ef4c9adaef5bcca3ea7bea16bd72b74`.

Verification: full739 mobile/110 Python/types/lint/fixtures on `0d8d2b0`; final wording22 focused tests/types on `6dcc0da`; both final exports and exact committed Release. Scoped native month/detail/Back, MAIN/MIN/WIDE charts and actual saved Medical expiry are source-specific, with successful cleanup and101-flight restart. No new provider request or private-value publication; no paid execution. [One maintained report](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/verification/2026-10-21-simple-flight-loading.md#compact-start-monthly-comparisons-medical-and-duty-sources--22-october-2026).

Broader queries/analytics and full coverage remain open; month/range/latest UI is delivered.

---

## Published bounded statistics checkpoint — 20 October 2026

Main is pushed through [`d956c66`](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/d956c66). Application [`9ac4e56`](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/9ac4e56) restores the approved saved-flight aircraft-share season rings, forwards the year into ordinary Flüge and centralizes safe deduplicated season count/time/shares. Existing host evidence remains 592 mobile / 109 Python, types/lint/fixtures and both exports; the exact committed-source Release was reused for the populated trial without app changes.

**Populated native result:** saved-graph expectations independently agree with count/time and aircraft shares; both ring distributions sum to 360 degrees. Rings/legend fit at 360/390 dp, enlarged text (360 dp, font 1.4) uses the readable existing metric fallback, and all three cases select 2026 in ordinary Flüge with the matching count. Entire before/after canonical graphs are equal. Original APK/display/network restored; retained provider session freshly matched without credentials/helper or flight retrieval. Provider AVD remains running; synthetic AVD remains stopped. Private inputs/captures remain ignored; only sanitized summary committed. Two scrolling-wait harness failures were preserved with successful cleanup and corrected before the passing run.

[One extended report and limits](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/verification/2026-10-20-real-flight-statistics.md#populated-saved-flight-acceptance-continuation). The real dataset covers current-year/two-aircraft only; mixed-year, unknown/conflict/zero and safe-integer behavior retains synthetic regression provenance. Broader measures/Motorflüge definition, second-account, physical, spoken accessibility, user review and release gates remain separate; iOS deferred. Both parent issues stay open. The separate capture-store versus library freshness-label observation remains tracked in [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6301564698).

This publication/result supersedes older “not pushed” and populated-native-pending statements below; dated earlier evidence retains its original scope.

---

## Current statistics contract and follow-ups — 20 October 2026

**Implemented:** `8fe0078` connects Start to the selected real account's saved library for unique flight counts, reported minutes, exact recorded-year/registration groups, latest dated flight and committed coverage/freshness. Unknown/invalid/conflicting facts remain explicit; there is no synthetic-book fallback, provider request, write, inferred class/role credit or paper adjustment. [Statistics report](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/verification/2026-10-20-real-flight-statistics.md).

**Regression repair:** #38 updates the shell fixture and removed callback assertions; full host checks pass. #39 controller maintenance was explicitly selected next and is delivered within its bounded host/Android checkpoint. [Current review](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/verification/2026-10-17-current-status-and-open-issues.md#20-october-review--baseline-repair-and-bounded-controller-refactor). Next, return here and to #20 for:
- [x] Restore the approved aircraft-share season rings from saved selected-account facts (local source `9ac4e56`).
- [x] Scoped populated rings/legend and current-year drill-down verified on saved real flights at 360/390 dp and font 1/1.4, with exact canonical graph and original APK/display/network/session preservation. Current dataset is current-year/two-aircraft; synthetic tests cover mixed years and unknown/overflow states.
- [x] Make the season-card year argument reach the ordinary flight filters; repeat requests replace stale filters and ordinary return preserves subsequent edits.
- [x] Move current-year count/time/aircraft shares into the deterministic projection with shared deduplication, unknown/conflict and safe-integer rules; projection/Dashboard/shell/filter regressions pass.
- [ ] Complete the separately selected broader measures/views: annual comparison/distribution, person/crew/model and launch-method queries, source coverage and contributing-flight navigation. Motorflüge definition remains unresolved.

**Dependencies/order:** real import/storage and ordinary Flüge are delivered prerequisites; account-wide statistics require no real book. Books/paper remain later; broader native/live/platform acceptance remains open under #2/#8. Preserve the earlier approved date/duration/coverage rules below where consistent with this narrower current scope. No new layout selection, source retrieval, AI or paid service is authorized by recording these follow-ups.


**Final controller evidence:** `096c9fb`: 584 mobile / 109 Python, types/lint/fixtures, both exports, committed Android Release and six offline native checks pass; retry retains the same native WebView/wrapper IDs. Cleanup is independently confirmed. Information save/history against an actual provider source, saved-helper authentication, statistics visuals, iOS/physical and broader release gates remain open.

<details>
<summary>Earlier requirements, decisions and dated evidence — subject to current scope above</summary>

## Current execution order - 20 October 2026

Manuel clarified: first complete real flight import/storage and a working Flüge tab with offline list/details/filters; then integrate statistics. Account-wide statistics depends on the real stored library and verified measures, not Flugbuch creation/assignment. Earlier book/paper-first dependencies below are historical for this scope. Parallel foundation code exists; native/integrated acceptance remains open. No statistics integration starts before that first step.

---

## Billing discovery included — 19 October 2026

Manuel explicitly selected billing discovery as part of the next basic-retrieval checkpoint, superseding prior deferral. [Category checklist and source-evidence requirements](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/vereinsflieger-information-discovery.md#basic-retrieval-and-import-checkpoint--19-october-2026) are maintained under #10, coordinated with #2 real history.

Verify permitted own charges, payments, credits, balances, currencies/periods, adjustments and flight/aircraft attribution before yearly flying versus membership/other costs and per-aircraft totals. Existing incidental preview visibility proves none of these calculations. This selects discovery; it does not approve cost analytics/UI implementation, billing actions or external-expense entry. No new private/provider data was read in this update. Existing flight-query/analytics acceptance and other Issue scope stay open.

---

## Current status / documentation review — 2026-10-17

Deterministic local queries and the native selected-book saved-flight search/year/category/detail flows, quick-question UI and aircraft-share rings are implemented over the synthetic SQLite library. Earlier no-implementation statements below are historical. Source db15203: 136 mobile tests and 71 synthetic native checkpoints; see docs/verification/2026-10-17-native-shell-corrections.md. Complete reviewed analytics/person-role filters, coverage/comparison rules, live canonical integration and cost attribution remain open; local questions are not an authenticated LLM backend.

---

## User requirement — 2026-10-08

The pilot opens the app and asks how many flights they made in a particular glider, or when/how often they flew with person XY. Queries use remembered history; no new photo/import is required to ask.

## Acceptance

- Typed queries support aircraft registration/model, person identity/crew role, date range, flight count and latest matching flight, with a drill-down list of contributing flights.
- Distinguish a specific aircraft from its model and disambiguate duplicate/aliased person names; never merge solely by name.
- Default to effective reconciled own-flight history; offer source and confirmed-paper views. Ignoring a warning does not change facts; an explicit override changes the effective view and remains auditable.
- Exact counts/latest dates come from deterministic filtering/aggregation, not an LLM estimate. Optional natural-language interpretation produces validated filters, never unrestricted generated SQL or writes. Paid AI remains unapproved.
- Prevent repeated import/crew-join double counts; unknown/ambiguous/excluded records and limited history are visible. Zero matches in limited coverage does not prove never flown.
- Show data-through date, last successful import, coverage, basis and pending decisions; cached offline answers are labeled and isolate accounts.
- User can inspect which flights support a result. A paper-only confirmed flight is included only where its matching/deduplication is sufficiently established.
- Test synthetic repeated imports, two same-name people, changed overrides, missing dates/aircraft, partial history, offline restart and another user's query access.

Depends on #1 persistent private history, #2 stable imports, #4 offline state and #7 resolved decisions. Product specification and story IDs are published on main. Historical 8 October requirements-only checkpoint: deterministic queries and synthetic/native evidence were subsequently delivered, as described above. Complete live-history analytics and paid AI evaluation remain unaccepted.

## Remembered state and flight-history queries — 2026-10-08

[Product specification](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/flight-logbook-state-and-queries.md): Canonical specification now defines typed filters, effective/source/confirmed-paper views, scoped decision reuse, stale evidence, coverage, offline freshness and supporting-flight drill-down. FL-15/FL-16 and E15/E16 track query evidence.

Later local query/ring/search/detail implementation and tests supersede that early no-runtime status. Full reviewed filters/coverage/comparison, live integration and account-isolation acceptance remain open.

## Local query implementation first

Implement exact aircraft/person queries using actual phone-local SQLite and fixed synthetic expected flight lists before cloud persistence integration. Initial dependencies are #6 lab, #4 local persistence and #7 domain/decision records; synthetic CSV suffices while #2 live access is separately unresolved. Cloud aggregate isolation and second-device semantics follow early #1 feasibility/integration. [Revised plan](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/architecture/local-first-implementation-plan.md).

Publication: requirements and revised priorities are published on main following Manuel's instruction to publish all changes. Documentation only; implementation/acceptance remains open.


## Confirmed analytics journey — 2026-10-13

Compact swipeable “Mein Fliegen”: this year's flight count/known time with a small same-period previous-year comparison in the same view; aircraft flown most often; duration distribution. Tap expands the selected statistic with chart and supporting flights, carrying period/filters. Initial filters: period, aircraft, person flown with and own recorded role. Flight detail exposes recorded values, missing/uncertain fields and source information. License/training status belongs in detailed “Meine Flüge”, not start. Saved results remain available after failure with last-update time and retry.

- [ ] Define exact measures, duration basis/bands, distinct-flight identity, unknown-duration treatment and comparable-year coverage with Manuel.
- [ ] Specify drill-down/filter/detail states against labeled synthetic data before live integration.
- [ ] Track desired costs separately from flight totals: yearly flying costs with membership/other charges separate, then **total flying costs per aircraft**; no average-cost measures selected. Guided billing inspection/semantics/access remain deferred under #10 before any cost calculation contract.

See the [journey/information map](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/2026-10-13-journey-information-map.md). Desired content is confirmed; full release measures, live-history acceptance and provider mappings are not. M1/M3/M4 and other roadmap gates remain unchanged.

## Provider authority and changed-flight indication — Manuel, 18 October 2026

Selected product rule: Vereinsflieger is authoritative for provider-backed flight facts. Use its recorded duration even when takeoff/landing subtraction differs; do not ask the user to choose an alternative merely for that discrepancy. Latest verified provider corrections update the current saved app flight/affected deterministic results; local or paper alternatives do not override those facts. Validate unknown/malformed/conflicting observations and preserve original/prior revisions. Actual paper evidence, book continuation and frozen writing instructions remain separate and are not silently rewritten.

An existing saved flight changed by a later retrieval receives an orange label or small dot under #30. Identical refreshes do not create a new change indication. Marker form/placement, accessible explanation and acknowledgement/restart/repeated-change lifecycle remain open. This resolves the previously open provider-duration precedence question; it does not verify source time zones/date assignment or approve canonical writes, polling or UI implementation.

Acceptance remains to implement: provider duration precedence; later source corrections with old/new revision preservation; unchanged refresh idempotency; orange indication and selected lifecycle; paper/snapshot isolation, offline and account/book boundaries. Existing historical synthetic override tests remain evidence of their tested older contract, not acceptance of this revised rule.

Sources: [journey decision](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/2026-10-13-journey-information-map.md#authoritative-provider-data-and-changed-flight-indication), [change-marker Issue](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/30). Local documentation commit 6deff73; publication pending. Affected references, precedence consistency and git diff --check passed. No application/device tests run for this documentation-only clarification.
Publication checkpoint — 18 October 2026: the 22 documentation commits from `28398c1` through `bdcc8d0` were pushed to `origin/main`; remote HEAD was independently verified against local HEAD. This supersedes the publication-pending notes above for that batch. [Published checkpoint](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/bdcc8d0), [complete pushed changes](https://github.com/MomoRC-tech/MoFlight-App-framework/compare/eb30539...bdcc8d0). Product decisions/requirements and recorded research are published; no application implementation, runtime/provider/device acceptance or release completion is implied. Existing open Issue scope and gates remain unchanged.
## Statistics review 1 — incomplete prior-year history, 18 October 2026

Manuel selected via the answer box: show available totals with an incomplete-data warning and hide the percentage comparison when prior-year history is incomplete. Preserve the intended comparison dates and actual coverage; missing history is not zero. Do not infer complete coverage from existing rows. Unknown durations remain separate from zero/known time; paper-total adjustments do not affect these provider-based statistics.

- [x] Product display rule selected; journey/state/screen inventory A02/roadmap aligned.
- [ ] Implement/verify incomplete prior year with available totals, visible warning and absent percentage; verified comparable coverage; unknown versus zero; offline/stale history and affected account/book scope. Source coverage proof/live integration remains separate from synthetic tests.
- [ ] Settle duration-distribution ranges and calendar-date/period rules with Manuel. These are open product choices, not assumed defaults.

[Journey](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/2026-10-13-journey-information-map.md#understand-my-flying). Local documentation commit a88010f; publication pending. Documentation consistency/affected references and git diff --check passed; no application/provider/device tests for documentation-only work. No application implementation, new retrieval, service or paid execution authorized by this clarification.
## Statistics review 2 — duration distribution, 18 October 2026

Manuel selected: count flights in <15, 15–29, 30–59, 60–119, 120–179 and 180+ minute ranges. Flights with unknown durations stay separate. Use authoritative recorded provider durations and distinct sufficiently established flight identities; neither paper adjustments nor clock subtraction replaces the provider value. Keep period/filters and contributing-flight drill-down.

- [x] Duration measure and ranges selected; canonical journey/state/screen inventory A04/roadmap aligned.
- [ ] Implement/verify bucket boundaries (14/15, 29/30, 59/60, 119/120, 179/180), known zero versus unknown, deduplication, filter/identity/isolation and contributing flights. Chart presentation/entry route and calendar-period rules remain open. Product selection is not runtime acceptance.

Local documentation commit 88e245e; publication pending. Documentation consistency/references, partition sanity checks on documented integer-minute examples and git diff --check passed; no application/provider/device tests for documentation-only work. No implementation/new service/paid execution authorized here.
## Statistics review 3 and review outcome — 18 October 2026

Manuel confirmed via the answer box: group by the flight date recorded in Vereinsflieger; compare 1 January–today against 1 January–the same calendar date last year (e.g. 1 Jan–18 Oct in each year). Do not regroup by device-local or landing-clock dates. Unknown/invalid dates are not guessed; UTC clock/overnight/source evidence remains its separate verification gate.

Selected review outcomes:
- [x] Incomplete prior-year history: available totals with incomplete-data warning, percentage comparison hidden; actual coverage stays visible and unknown is not zero.
- [x] Duration distribution: count flights in <15, 15–29, 30–59, 60–119, 120–179, 180+ minute ranges; unknown-duration flights separate; authoritative recorded provider durations and distinct sufficiently established flight identities.
- [x] Provider flight date for grouping; 1 Jan–same calendar date annual comparison.
- [ ] Implement/verify these rules, date/bucket boundaries, missing versus zero, duplicate/identity/filter/isolation and coverage behavior; define presentation/entry-route and remaining source/date edge cases in the relevant package. Live import and native/platform acceptance remain separate. No implementation/schema/provider/paid execution authorized by product clarification.

Verification summary: [journey](https://github.com/MomoRC-tech/MoFlight-App-framework/blob/main/docs/product/2026-10-13-journey-information-map.md#understand-my-flying), state/screen inventories, import boundary, README and roadmap aligned. Three actual review answers recorded; affected references, documented duration partition examples and git diff --check passed on local Windows/Python/Git. No application/provider/device tests for documentation-only work. Local commits a88010f, 88e245e and d62266f; publication pending. Prior published/runtime evidence remains scoped to its original sources. Issue #9 remains open for implementation and acceptance.
## Additional statistics requested — Manuel, 18 October 2026

Requested: counts of Windenstarts, F-Schlepp and Motorflüge. Record the requirement now; Motorflüge definition is awaiting a select-answer-box clarification (powered aircraft including UL/TMG, Motorflugzeug only with UL/TMG separate, or Eigenstart including self-launching gliders). No option is selected merely because it was displayed first.

Preserve authoritative source launch method separately from aircraft category and flight purpose. Earlier official manual research distinguishes a glider's F-Schlepp launch from the towing aircraft's F-Schlepp flight purpose; do not merge them or assume the requested groups form one mutually exclusive partition. Source mapping/identities/coverage and exact presentation remain open.

Scope/dependencies: extend existing #9 statistics, use #2 verified source semantics and current period/filter/drill-down contracts. After clarification, define useful synthetic counts/unknown/deduplication/isolation acceptance in the implementation package. No runtime/source-access/schema/service/paid work approved by this request capture.

Journey, inventory A06 and roadmap aligned; local documentation commit b32aab2, publication pending. Documentation status/consistency/references and git diff --check passed; no application/provider/device tests for documentation-only work.


</details>


**Bounded follow-up evidence — 20 October:** implementation committed locally as `9ac4e56` (not pushed). Complete host checks pass **592 mobile / 109 Python**, types/lint/fixtures; both exports and committed-source Android Release/lintVital pass. Eight scoped offline synthetic Android assertions pass at 360/390 dp and font 1/1.4; empty tracks/unknown time, current-year selection and offline restart inspected. Exact display/radios restored, synthetic AVD stopped; provider-session emulator and private data untouched. Populated native rings, live/physical/iOS and broader statistics remain separate. One extended report: `docs/verification/2026-10-20-real-flight-statistics.md`. Parent issues stay open; no Motorflüge or new design decision.



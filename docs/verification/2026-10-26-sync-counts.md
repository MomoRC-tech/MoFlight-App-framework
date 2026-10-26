# Measured Sync detail counts - 26 October 2026

Issue [#92](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/92), follow-up to #83/#91; P2 / M2-M4; R04/R12, FL-03/10/11 and E07/E09/E11. Manuel requested done/total counts for all Sync details. This increment changes reporting in the existing two-row box without changing layout or provider requests.

## Implemented behavior

- Flight retrieval shows validated received rows against the provider-reported total, advancing by whole pages. Before the first validated page the total is unknown (`0/?`); a validated empty list is `0/0`. No per-row streaming or estimated percentage is claimed.
- Flight saving shows `0/N` until atomic save and stored-library readback succeed; the completed row retains `N/N`. N counts incoming flight rows, including already known flights, rather than newly added records or the whole local library.
- Medical, events, document notices, annual work summary, work entries and tasks use `0/1 Anfrage`; duties use two actual page requests (`0/2`, `1/2`, `2/2 Anfragen`). These are requests, not a claim about complete source histories. Preparation, account proof and sign-in use a single step. Waiting for sign-in has no invented time estimate.
- Both visible and accessibility text include counts. A new stage resets its active count, the last confirmed stage retains its count, and failed/backgrounded/cancelled or late-stage updates cannot promote another stage. Existing source freshness, owner/store scoping and partial-source semantics remain in place.

## Verification and limits

Windows, Node 24.18.0, pnpm 11.25.0 and Python 3.12.10. `pnpm check` passed 5/5 stages: TypeScript, lint, mobile tests, Python tests and fixture parity. Ignored logs: `build/host-checks/20261026T103025Z-fb39b5ce/`. Synthetic exporter, stage, component, combined retrieval and real controller regressions cover validated multipage/empty totals, malformed pages, count transitions, accessibility copy and background interruption. One added presentation assertion initially failed because its test text was damaged by shell encoding; the assertion was corrected without changing product text.

Application source is linked from #92 with the package commit. `CoreFlightFoundation.tsx` wiring was captured in concurrent shared-workspace commit `f5838a6`; the remaining implementation and regression tests follow in this package commit. Unrelated recovery changes and the existing untracked recovery report are preserved. Documentation links and Git whitespace were checked separately after the host run.

No native build, APK delivery, live provider request, physical phone, iOS runtime or screen-reader trial was performed for this bounded increment. Those remain at the batched integration checkpoint; synthetic host checks do not establish native/live acceptance. No paid service or hosted workflow was manually dispatched.

## Actual-log benchmark and estimated progress proposal

26 October 2026. **Analysis requested; estimator/UI implementation proposed, not approved.** Tracking: [#90 benchmark ledger](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/90) and [#92 progress](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/92). Raw input is the user-supplied `moflight-support-report.json`, retained only in ignored attachment storage.

### Evidence and method

The report contains 19 update-flights operations: three successful, three partial, six cancelled and seven blocked. The successes belong to different session build contexts; the top-level context must not be assigned to older sessions. Each column has **one sample**, not an average. Android API 37, Release and WebView 155.0.8059.43 are reported; device model, network, APK hash and comparable flight/library sizes are not established by this attachment. Do not infer phone/emulator identity from API level.

Used the existing timing-only projection (`scripts/flight_loading_timing.ts`), then correlated fixed Sync event names to successful operation windows within the same session. Each expected stage starts once, in order, and no other update starts inside those windows. The table partitions operation elapsed time at successive UI stage starts, ending at the diagnostic terminal event. Transition overhead belongs to the preceding window. The windows sum exactly to operation duration; they are not sums of inclusive spans or a measurement of rendered-screen completion. Local outputs: `build/progress-benchmark-timings.json` and `build/progress-benchmark-stage-windows.json`.

| Observed window | `bc9d2ff` | `cdd2adb` | `ad4b7bd` |
| --- | ---: | ---: | ---: |
| Before flights: preparation/account/wait/gaps | 36.508 s | 38.776 s | 33.812 s |
| Flight retrieval and review | 23.065 s | 24.725 s | 27.263 s |
| Flight save and readback | 44.166 s | 46.955 s | 56.118 s |
| Medical | 2.177 s | 2.462 s | 2.963 s |
| Duties | 3.652 s | 4.300 s | 4.941 s |
| Events | 2.114 s | 2.748 s | 3.657 s |
| Document notices | 1.967 s | 2.320 s | 2.485 s |
| Annual work summary | 2.000 s | 2.205 s | 2.451 s |
| Work entries | 1.790 s | 2.215 s | 2.276 s |
| Tasks | 2.855 s | 3.274 s | 3.582 s |
| **Whole operation** | **120.294 s** | **129.980 s** | **139.548 s** |

Earlier successes report 4.486 s and 2.867 s of user-sign-in wait; the latest has no recorded user-wait span. That absence does not prove every preflight delay is active computation. Preparation/login/gaps remain combined because bounded checkpoints omit earlier boundaries. Failed/partial/interrupted runs are excluded from this successful-run calibration example. Some spans finish after cancellation and exceed terminal operation duration; those must not train an estimator.

Medical and duties each have two **nested timer spans**, not two separate whole jobs. In the latest run their raw sums are 5.830 s and 9.779 s; outer checkpoint spans are 2.955 s and 4.933 s. UI windows including transition gaps are 2.963 s and 4.941 s. The genuine two duty-page requests are a separate fact from those nested timers.

The latest observed distribution is approximately **24% before flights, 20% retrieval/review, 40% saving/readback and 16% optional sources**. These describe one run, not universal weights. Flight-row progress alone misses most of the wait. Provider-export-read instrumentation is only 135 ms in that run, while the visible flight stage is 27.263 s and source-retrieval is 12.166 s: these measure different boundaries. One validated page cannot establish per-flight cost. Different build totals do not establish a performance regression without comparable inputs/environment.

### Recommended approach

1. **Measure nonoverlapping work units.** Preparation, account verification, provider setup, page retrieval, source review, durable save, receipt/readback and optional sources need attempt-scoped starts/ends. Keep the existing two text rows, but expose the actual substep when flight retrieval has finished and checking begins. Scope callbacks and samples to owner/store/run/stage; obsolete attempts cannot advance or train another run. Address #90's correlation gaps first.
2. **Learn locally from comparable successful foreground runs.** The first success supplies a provisional sample; a rolling median of the last five suitable samples is a simple starting proposal. Separate fresh/repeat/resume work, device, timing-model version and broadly comparable volume. Separate local-storage from network timings. Existing library size, incoming rows/pages and changed records may affect cost. Start with simple buckets; only fit fixed-plus-per-page/row costs when enough observations support them. Do not multiply the first flight's time by the number of flights: navigation/profile/validation impose fixed overhead. No network reporting is needed.
3. **Weight by expected duration.** Freeze estimates for the scheduled work at attempt start. Overall estimate = (expected duration of confirmed completed units + estimated portion of current unit) / expected duration of all planned units. Medical and flight saving should not have equal weights. Resume plans only remaining work and is labelled as continuation.
4. **Use real evidence where available.** Validated rows/pages drive the retrieval portion; setup, review and save/readback retain separate budgets. Exact text counts remain exact. For opaque work, a proposed initial fraction is `min(0.9, 0.9 * foregroundElapsed / expectedDuration)` until actual completion. The 90% cap is a tuning proposal, not a measured optimum. Early confirmed completion advances immediately to the unit's end. Show approximate overall progress, without precise remaining seconds while evidence is sparse.
5. **Make uncertainty visible.** With no useful estimate, use indeterminate activity and learn from the first completed run. Label the estimate, for example `Gesamtfortschritt ca. 65 %`, separately from `Flüge abrufen (4/101)`. At the cap, stop advancing and explain that the step is taking longer, retaining activity feedback instead of creeping endlessly toward 99%. Freeze during login/background waits. Failure/cancellation stops the run; finished-with-errors stays partial, never green 100% success. Revise the next run's model rather than making the current bar move backwards. Only confirmed completion reaches 100%.

### Material 3 and MoFlight adaptation

Consulted [Material 3 progress guidance](https://m3.material.io/components/progress-indicators/guidelines). That page requires JavaScript in text retrieval; accessible official [Material Web progress documentation](https://github.com/material-components/material-web/blob/main/docs/components/progress.md) and [Android guidance](https://developer.android.com/develop/ui/compose/components/progress) supply determinate/indeterminate component behavior. The bounded learned estimate is a MoFlight proposal, not an algorithm specified by Material.

Prefer making the existing circular Sync indicator determinate when an estimate is useful, keeping the two-row detail box. A horizontal bar is an alternative single representation if selected. Preserve Compact Cockpit styling, control sizes, reduced motion and accessibility text distinguishing the estimate from measured counts. Appearance/implementation selection remains with Manuel.

### Proposed acceptance and limits

Estimator tests should cover first run, zero rows, paging, early/late completion, fixed overhead, login/background pauses, account change, retry/resume, stale callbacks, optional failure and monotonic estimates. Replay checkpoints using a model frozen from **earlier** comparable runs; fitting and scoring the same sample does not validate predictions. One successful sample per build here cannot establish prediction accuracy. At the batched native checkpoint, compare predicted and actual timings on repeated equivalent-input runs and inspect the affected indicator.

This increment is analysis/documentation only. Arithmetic, stage order, absence of overlapping updates and source references were checked. No runtime change, build, device action, live-provider call or paid execution was performed.

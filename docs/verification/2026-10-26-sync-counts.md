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

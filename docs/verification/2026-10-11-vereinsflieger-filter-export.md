# Filter-first personal-list capture evidence

Date: 2026-10-11, Europe/Berlin. Baseline reviewed: `a91a3bc`, integrated with main `f0e395f`. Environment: Windows PowerShell, local Expo/TypeScript workspace, authenticated desktop Chrome. [Implemented contract](../architecture/vereinsflieger-filter-export.md), tracking [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2)/[#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10). The implementation commit is the commit containing this report; native acceptance is not claimed.

## Actual desktop observations

- The saved `Flugbuch Export` preset existed. Initial active view had 39 data columns plus action. Configuration offered eight more data columns and two presentation options.
- Under the user's implementation authorization, moved the eight data columns into the active configuration and applied. Readback had 48 table/visible columns (47 data plus action); only Seitenanfang/page subtotals remained available. Selected label stayed `Flugbuch Export`. Its saved named definition was not overwritten; the adapter repairs/rechecks active state each run. No flight was edited.
- Submitted explicit calendar-year dates through the normal period form. Returned label was `ab 01.01.2026 bis 31.12.2026`, participation `Pilot oder Fluglehrer`.
- Unrestricted checkbox groups had all options checked; text restrictions were blank. This corrected an initial unchecked-box assumption. Clearing an actual restrictive filter was not exercised live.
- Existing 100-row preference yielded records 1–100 then 101–101 of 101, with unchanged 48 columns/period. Global page size was not changed. This is desktop UI evidence, not injected native-driver execution.
- Some permitted rows lacked view/detail links but retained `row<id>` references. The adapter preserves these and cross-checks any present links. No guessed ID enumeration or detail/edit navigation occurred.
- Personal-cost cells were present/populated on some records. Private values were not copied into this report/fixtures. A private configuration screenshot was saved outside Git for user review.

## Executed checks

- Strict TypeScript passed.
- Full mobile/contract suite: 80 tests passed, including ten new export tests covering 48-column multipage assembly/costs, explicit dates, verified empty/error/session distinctions, gaps/repeats/count/schema/account/preset changes, foreign/extra-parameter page links, malformed/oversized rows, phase tokens/caps, standalone DOM reader/row-ID fallback, normal column/filter/preset/date actions and login/foreign/iframe exclusion. Fixtures are synthetic objects/data, not real provider HTML or flights.
- Android/iOS Hermes bundle export passed (691 Android / 693 iOS modules). Bundling is not native runtime execution.
- Integration preserves request ownership, cancellation, stale-generation/login diagnostics and legacy bounded/dated-window labs. Export persistence revalidates scope/rows, permits bounded larger snapshots, rejects conflicting capture identities and retains legacy validation. A synthetic 1,000-row snapshot above the former 200 KB ceiling reopens without loss.
- Python reference/build-policy suite: 39 passed; synthetic fixture parity passed.
- Documentation destinations and Git whitespace checked before publication.

## Limits and next native trial

No new APK, emulator/phone/iOS execution or native restart/storage test is claimed for this workflow. Prior default-list native evidence remains historical. Desktop inspection did not execute the shipped injected driver or measure end-to-end latency. No export bytes were downloaded. Missing-preset creation, restrictive-filter clearing and actual expiry need live/native validation; synthetic tests do not replace these.

Next device trial: original-provider login; narrow nonempty explicit period and private reference comparison; multipage repeat; verified empty period; force-stop/offline reopening; cancel/network/expiry with prior capture retained. Confirm preset/page-size behavior. Then validate powered/TMG values, monetary semantics, stable source identity/time basis and canonical multiple-book import. The new snapshot claims only complete requested-list coverage, not lifetime history, verified identity or legal totals. Personal data, screenshot, costs and signed URLs are excluded from Git.

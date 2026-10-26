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

Later continuation: [provider-view preservation evidence](2026-10-11-vereinsflieger-view-preservation.md) records the implemented named-backup/reset/recovery flow, new desktop checks, final-source APK compilation and separate acceptance limits. The paragraph below retains this report's original filter-only validation boundary.

No new APK, emulator/phone/iOS execution or native restart/storage test is claimed for this workflow. Prior default-list native evidence remains historical. Desktop inspection did not execute the shipped injected driver or measure end-to-end latency. No export bytes were downloaded. Missing-preset creation, restrictive-filter clearing and actual expiry need live/native validation; synthetic tests do not replace these.

Next device trial: original-provider login; narrow nonempty explicit period and private reference comparison; multipage repeat; verified empty period; force-stop/offline reopening; cancel/network/expiry with prior capture retained. Confirm preset/page-size behavior. Then validate powered/TMG values, monetary semantics, stable source identity/time basis and canonical multiple-book import. The new snapshot claims only complete requested-list coverage, not lifetime history, verified identity or legal totals. Personal data, screenshot, costs and signed URLs are excluded from Git.

## Bulk-page and file-export investigation — 26 October 2026

**Scope:** requested by Manuel under [#41](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/41), with [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2); P2 / M2–M4, R12 / FL-03. This is authenticated desktop source investigation, not an application change or native performance acceptance. The current `export.ts`/`view.ts` adapter reads complete requested lists in pages, accepts up to 1,000 rows/page, and deliberately leaves global page size unchanged. Its view journal does not capture that setting.

### Observed page-size behavior

- Windows Chrome, existing authorized personal-flight session; provider footer version `2026.07.11 (27.562658)`. Manuel completed sign-in himself. No credentials were read or submitted by the investigation.
- The gear beside the configuration selector opens field selection and **Zeilen je Seite** under **Allgemeine Einstellungen (alle Listen)**. Actual options include 100, 200, 500 and 1000. Original selection was 100; the provider labels this preference as applying to all lists. No other list was changed or tested independently.
- Applying 500 through the normal form, then selecting **Die letzten 2 Jahre** and **Pilot oder Fluglehrer**, returned all 101 rows with footer **101 Datensätze** and no pagination links. This is complete coverage of that displayed selection, not lifetime-history completeness.
- Temporarily enabling every available data column, excluding presentation IDs 150/151, yielded 48 columns and the same 101 flight references in one page. The captured comparison object was about 45 KB of serialized text; this is neither a measured network response size nor execution of the native bridge.
- Returning to 100 with the same period, participation and columns produced **Datensatz 1 bis 100 von 101**, followed by **Datensatz 101 bis 101 von 101**. Concatenating those pages matched the 500-row result exactly by ordered flight ID and every normalized cell value. No per-flight detail request was needed.
- Cleanup restored and read back the original 100-row setting, last-20-flights/max-24-month period, Pilot participation, unnamed configuration, 22 ordered columns, filters and sorting. All observed comparisons matched. The original tab/session remains; the research help tab was closed. No flight or saved named configuration was edited, and no MoFlight library import/save was performed.

### File-export availability

Authenticated [personal-flight help](https://vereinsflieger.de/member/help/index.php?hid=16002) and [list-view help](https://vereinsflieger.de/member/help/index.php?hid=2002) describe generating Excel/PDF at the upper right. The actual current personal-list toolbar renders only the configuration selector and gear: no Excel/PDF/download action was present in the accessibility tree or corresponding DOM controls. Manuel independently confirmed that he also sees no export button. The reason is unknown; no permission, subscription or provider-version cause is inferred.

Consequently **no file export was downloaded**. Actual export format, full-window versus current-page behavior, stable flight identifiers, field/role/time fidelity and native download handling remain unverified. The existing named `Flugbuch Export` item is a saved view configuration; its presence does not establish a file-export action. No guessed export URL, private endpoint or REST request was attempted. An export exposed through a different authorized provider view or a user-supplied original file would permit a later comparison.

### Recommendation, verification and remaining acceptance

500 is an evidence-supported candidate for the existing list adapter: this dataset needs one page instead of two, retaining all observed source cells and flight references. Keep sequential pagination for results above 500 and all current source/account/schema/count guards. Before implementation, extend durable page-size capture/restoration and interruption recovery, because changing a provider-labelled global preference without restoring it is outside the current preservation contract. This recommendation is not implementation approval.

The measured result is one fewer list-page navigation for this 101-row selection. No equivalent-input latency benchmark, phone/WebView execution, 500 populated rows, empty/failure/recovery or iOS test was performed; no seconds-saved claim follows. File-export acceptance is blocked by the absent provider control, not passed. The application remains unchanged. Verification for this documentation increment is source/reference/claim consistency and Git whitespace; no application tests, builds, APK delivery, model calls or paid execution were needed. Private row values and IDs stayed in the browser investigation runtime and are excluded from committed evidence.

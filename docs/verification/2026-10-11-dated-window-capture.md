# Dated own-flight window capture continuation

Date: 2026-10-11. Baseline `adeb003`. Manuel requested continuation with verified live retrieval, native recovery, mapping and a real book journey. This delivers the next bounded capture slice; it does not approve production source identity, the canonical import schema or actual book formats. Tracking: #2, #8, #10, #11, #12.

## Live discovery

The browser connection was recovered by opening the installed Chrome through the computer-use skill. The existing provider tab retained its authenticated session. Only the own-flight list and its existing read-only controls were used; no flight, billing, contact, membership or authentication settings were edited.

- `#globalfilter` reports explicit inclusive `ab DD.MM.YYYY bis DD.MM.YYYY` dates. The observed POST form contains `#startdate`, `#enddate`, `#daterange` with option `date`, and its original submit control. The form action is supplied by the provider, including opaque parameters; it is not reconstructed.
- `#globalfilter2` reports participation. Selecting the observed `Pilot oder Begleiter` link preserves the explicit date window. This establishes the selected UI scope, not PIC, instructor or legal credit allocation.
- The configuration's original 200-row page size was temporarily reduced for pagination inspection and then restored. `.footer.f1` reports either `N Datensätze`, `Datensatz A bis B von N`, or the explicit empty message `Es wurden keine passenden Daten gefunden!`. `.footer.f2` contains the current numbered span and observed page links. Changing page size can retain page navigation state, so capture must verify the first position rather than assume page one.
- All observed pages of one selected calendar-year window were traversed through fresh visible page links. The final corrected traversal includes every displayed row, reaches the final record position, matches the total footer count, has unique DOM row IDs, and reproduces the original unpaged accessible detail-reference set. No actual flight identifiers, values or personal counts are committed.
- Some displayed rows have no detail link. Both linked and unlinked rows have numeric `row…` DOM IDs. For linked rows, the DOM suffix matches the observed `viewflight.php?flid=…` reference; unlinked IDs remain list evidence and do not authorize constructing a detail URL. The `disabled` class is not a complete explanation for missing links and is not converted to a duplicate or exclusion policy.
- A nonempty same-day request at both boundaries reproduces the exact row IDs observed for that day in the larger window. A future same-day window displays the selected dates, inclusive participation, zero rows, the explicit empty footer and a zero-flight summary. Empty CSS/style text contaminates `textContent`, so the reader uses visible footer text.
- Initial discovery checks used an incorrect detail pathname and therefore compared empty reference sets. Those checks are discarded. A later attempt also stopped on incomplete page rendering. The final corrected checks require nonempty references where present, count all table rows (including linkless rows), validate record positions and wait for the actual navigation URL/load before inspecting.

The provider's original last-20/Pilot view and page-size preference were restored after inspection. A stable club identifier was not established. This sample does not establish all-history scheduling, every club/account configuration, provider caps outside the observed window, atomic provider snapshots or current canonical role/time/class mappings.

## Implementation

The native dated-window screen automatically chooses the current UTC calendar year and `Pilot oder Begleiter` using the freshly observed original controls. It validates every returned page against that requested date scope, follows only observed paging links, rereads profile context before each following page and after reading each page before committing it, and saves each success before continuing. A first local association is confirmed once; saved matching context avoids repeated confirmations. It is a bounded lab, not lifetime-history retrieval.

The separate raw SQLite journal retains each page's URL, native observation timestamp, headers, values, DOM row IDs, optional actual detail links, date scope and record positions. Resume rereads the final committed page and requires unchanged evidence and context. Stale writes, changed counts/columns/scope, repeated rows, missing next links and context changes preserve earlier pages. Limits are 200 rows per page, 1,000 records or 100 pages; reaching a limit remains incomplete coverage.

List completeness, accessible detail-link count and detail gaps are separate. Explicit empty windows require matching scope and a declared empty result. Both stored source identity and flight-time basis remain unverified. Canonical imports and book writes stay synthetic-only; no costs or provider credentials are read by these readers.

## Validation and checkpoint repair

- Strict TypeScript, all 62 TypeScript tests, 39 Python tests and fixture parity pass, including standalone DOM readers, original form-control submission, exact-query bridge ownership, calendar boundaries, partial rendering, linkless records, empty evidence, bounded limits and real-SQLite restart/resume/conflict checks.
- Android and iOS Hermes exports pass for the implementation before its first native build. Native compilation, actual device observations and final source commits are recorded below after execution.
- The previous [hosted checkpoint](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38142313394) passed Release compilation and all 23 baseline Android checks, then failed before book tests because android-emulator-runner executes each script line in a separate shell. The multiline conditional was invalid under that contract. Commit `0987947` puts the conditional on one line and adds a shell syntax regression check for each independently executed runner line; all 15 Android build-policy tests pass locally. This is a harness repair, not an app runtime failure. A replacement checkpoint was started by that push.

The exact paper logbook publisher/model/edition was requested from Manuel; real format mapping remains pending. No live canonical import, real writing acceptance, physical-phone result or iOS runtime result is asserted.

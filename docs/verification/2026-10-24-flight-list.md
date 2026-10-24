# Compact saved-flight list — 24 October 2026

Tracking: [#70](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/70). Manuel explicitly approved implementing the full reviewed screen cleanup and refined C cards. M1 UI over existing M3 selected-account saved flights; no provider, role-credit, schema or storage change.

## Implementation and test assessment

Fixed period/aircraft/search controls sit outside list scrolling. Search opens a content-sized field; actual active values remain visible as removable teal tags even with search collapsed. Reset clears the selection; individual removal preserves other filters. Count/known-reported time/unknown count replace explanatory paragraphs; information opens separately. Content-sized wrapping chooser/detail actions replace full-width controls. Dense C cards show date/aircraft, all labelled recorded crew and start/route beside reported h:min, without separators or fixed height. 600+ dp single-column cards cap at 480; two columns start at 840 with ordinary font scale. Details preserve raw source values and list/filter return.

Explicit raw `Solo`/`Alleinflug` mode/type plus a recorded pilot and no contradictory companion/PIC/SIC is required for Solo. A blank Begleiter field alone remains unknown. No live source-code/role mapping is claimed. The Development preview reuses the real component with in-memory fictional paired/solo/unknown/extra-crew records; it performs no storage or provider work.

Meaningful regressions extend actual component/filter/navigation behavior and pure card projections: fixed-filter structure, combined/removable/collapsed-search filters, year/custom requests, exact detail identity and raw paging, hidden scroll events, information return, owner reset, diagnostic redaction, full given names, multiple companions, zero/unknown/conflicting duration and explicit/contradictory Solo. Existing selected-owner/lifecycle/recovery tests are reused. No implementation-mirroring geometry snapshots or model calls are needed; affected native geometry and interaction require the checkpoint below.

## Verification summary

Focused types and 28 card/component/reader regressions pass. Complete host checks, handbook freshness, platform exports and committed-source Release/native checkpoint are in progress; this intermediate source record does not claim acceptance. Final provenance, commands, native dimensions and limits will be added after execution.

No paid execution, provider retrieval, private-session changes or production signing. Physical phone, iOS runtime and spoken accessibility are not tested by this package.

**Delivery override:** Manuel subsequently requested **no release**. No GitHub Release, APK upload or external binary delivery will be created for this package. An internal local build may supply the required native verification; publishing remains excluded.

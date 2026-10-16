# Season and monthly comparison preview — 2026-10-16

Milestone: M1 design discovery. Base commit `227c15f`; resulting commit available through this report's Git history. Environment: Windows/PowerShell, Python 3.12, Codex in-app browser over temporary loopback HTTP. Existing discovery scope #5/#9/#11; no duplicate Issue, native application change or provider operation.

## Deliverable and boundaries

[Fragment v0.25](../product/prototypes/2026-10-16-clickable-v025.html) and [standalone download](../product/prototypes/exports/moflight-design-v0.25.html) implement Manuel's authorized changes: Meine Saison totals, individual-aircraft count/known-time rows, separate same-model labels with short suffixes, annual work hours moved into the season panel, and expandable paired monthly flight-count bars. Month selection shows both years' exact stored counts and separate links to contributing flights. Month scope survives flight-detail navigation and has an explicit removal action. Aircraft rows filter by registration, not model.

The chart defaults collapsed. Current year uses accent bars on the left; prior year muted bars on the right; both share a zero-based count scale. All 12 months stay visible; labels abbreviate to initials at narrow widths, with the full selected month and accessible names. October 2026 is marked partial through 16 October; the prior-year month is full-month scope. Future current-year months have no bar and their current-year flight link is disabled. Empty months in this small excerpt have unknown coverage, marked with dots/dashes, not asserted zero. A flight-time chart toggle remains a later option. Last two registration characters are the example distinguishing suffix, not a production collision policy.

Fictional fixture dates were spread across months to exercise the chart; a second ASK21 registration was introduced without adding flights. Aggregate source inspection: 2026 = 6 flights, 272 known minutes, 2 unknown durations; 2025 = 5 flights, 240 known minutes, none unknown. Aircraft totals reconcile to those same flights. No additional fabricated chart-only totals. Earlier v0.23 source/export remain unchanged. Three independent example books and their evidence/assumed progress remain unchanged.

## Actual checks

- Generated the standalone wrapper with the bundled render helper, then embedded the existing pinned runtime assets. Export is 988,751 bytes; fragment 77,856 bytes. Embedding inspection reports zero external script tags. Existing library/source notices retained; no data upload.
- Opened the resulting standalone file through loopback HTTP in the in-app browser. Default layout and expanded chart were inspected visually; repeated at viewport 320 × 900 (phone frame about 288 px wide). Header, aircraft values, month marks/selected state, work footer and navigation were readable without horizontal clipping in the inspected states. Internal vertical scrolling is intentional.
- Expanded chart, selected May, opened 2026 flights: exactly D-5821 on 4 May, 24 known minutes. Repeated for 2025: exactly D-5821 on 14 May, 20 known minutes. Selection shows one stored flight in each year.
- Selected November: current-year value reads future and its flight link is disabled; missing prior-year data remains a dash.
- Selected ASK21 · 22: only D-5822 on 16 July appears, with unknown time explicitly shown. Separate ASK21 · 21 row remains present on Start.
- Work-hours footer opens Verein with 18 / 25 h and 7 h remaining. Reload preserved selected month, expanded state and month-filtered flight view through the existing local preview-state mechanism. Browser captured no error-level console entries during these checks. Temporary viewport override reset afterward.
- Documentation traceability, local file links and staged whitespace checked. Independent GPT-6 Luna documentation/hierarchy review used; no application test suite or new tests.

## Limits

Manuel's visual review is pending. This is a synthetic HTML design checkpoint, not a native app feature or M1 completion. No actual phone/file-viewer, Android/iOS build/runtime, live data, provider authorization, production coverage/zero policy or real sync was tested. Native acceptance requirements remain unchanged. Empty data and suffix collision policies need detailed contracts before implementation. Preserve unrelated product-index, research and remote-attachment changes.

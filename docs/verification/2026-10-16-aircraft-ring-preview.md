# Compact aircraft ring preview — 2026-10-16

Milestone: M1 design discovery. Base commit `117393b`; resulting commit available through this report's Git history. Environment: Windows/PowerShell, Python 3.12 and Codex in-app browser over temporary loopback HTTP. Existing discovery scope #5/#9/#11. Manuel accepted the single-ring proposal after requesting a more compact aircraft overview. No native application/provider change or new Issue.

## Deliverable and semantics

[Fragment v0.27](../product/prototypes/2026-10-16-clickable-v027.html) and [standalone download](../product/prototypes/exports/moflight-design-v0.27.html) replace separate total tiles and the permanently expanded aircraft rows with one aircraft ring and a Flüge / Flugzeit toggle. The ring center shows current-year total and quieter previous-year value for the selected measure. Per-aircraft weights are either flight counts or known minutes; colors stay mapped to registration across modes. Labels use short model names and suffixes for the two separate ASK21 aircraft, with connector lines outside the ring. Selecting an aircraft highlights it and provides count/known-time information and a contributing-flight link. The center retains the corresponding yearly-analysis route.

The full four-aircraft list defaults collapsed and opens under Flugzeuge · 4, with compact count/known-time rows. Unknown-only ASK21 · 22 has a count segment but no known-time segment; it remains in the full list with unknown duration. The time view explicitly says two times are missing and the ring covers only known time. Goal information follows the selected measure beneath the ring. Monthly comparison stays separate; work hours, medical reminder, settings, paper books and five destinations carry forward. Earlier previews/exports remain unchanged.

Fixtures unchanged: 2026 = 6 flights, 272 known minutes and 2 unknown durations; 2025 = 5 flights and 240 known minutes. Current aircraft weights: LS4 3 flights / 138 known minutes; ASK21 · 22 1 flight / unknown time; SF25 1 flight / 110 minutes; ASK21 · 21 1 flight / 24 minutes. No chart-only synthetic totals or merging same-model aircraft.

## Actual checks

- Generated the standalone wrapper and embedded the existing pinned runtime assets. Export 1,008,528 bytes; fragment 94,968 bytes. Embedding reports zero external script tags; library notices retained.
- Inspected both ring modes at viewport 320 × 900, phone frame approximately 288 px wide. Labels, connectors, selected state, center values and controls were readable in the inspected states. Increased the ring's minimum radius to give its prior-year center line room and narrowed the outside label controls to avoid covering the ring. A read-only SVG bounding-box API was unavailable in browser automation; layout observations are visual, not measured geometry acceptance.
- Count mode displayed 6 and prior-year 5, four aircraft labels and count shares. Time mode displayed 4:32 and prior-year 4:00, three known-time segments and an explicit two-missing-times notice. Consistent registration-based colors are visible across modes and verified in source.
- Selected SF25 via its label: selection showed 1 flight / 1:50 h; its flight link opened only D-KMFX on 4 October 2026 with 110 known minutes. The collapsed full list expanded to four rows, including ASK21 · 22 with unknown time, and could collapse again.
- Reload retained selected metric, aircraft selection and expanded-list state. The center count control opened yearly analysis with 6 current flights, 5 prior flights and contributing flights. No captured error-level app console entries. Native SVG segment-pointer hit targets were not separately exercised; the shared label-selection and flight-link actions were exercised.
- Independent GPT-6 Luna read-only documentation and source review found no material semantic mismatch. Checked local document links and staged whitespace. No application test suite, new tests, live data, native build/device trial, paid call or hosted CI.

## Limits

Manuel's visual review remains pending. The bounded four-aircraft fixture does not prove label layout for many aircraft, very small segments, long names, large text or empty/all-unknown datasets. Those states and a stable production color/suffix policy remain for detailed contracts. Ring and list state use the existing synthetic preview persistence, not production account storage. No actual phone/file-viewer, Android/iOS runtime, weather service, medical retrieval or M1 completion is claimed. Unrelated product-index, research and remote attachments remain untouched.

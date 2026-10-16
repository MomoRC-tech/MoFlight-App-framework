# Approved-reference fidelity refinement

Manuel requested a near pixel-perfect reproduction of the approved four-screen image, including card geometry, controls and colors, on 16 October 2026. This refines the existing M1 native UI slice, not its data/service scope. Existing Issue #5 was checked open; no duplicate task is required.

- Deliverable: denser reference-matched native header, hero, bento proportions, filters, list rows, assistant cards and navigation. Preserve data isolation, offline persistence, accessible controls and accurate unavailable states.
- Dependencies: the [approved composite](design-sources/2026-10-16-four-screen/reference.png), existing native shell and local assets; no new service or dependency.
- Acceptance: inspect actual screenshots at MIN 360 dp, MAIN 390 and 411 dp, MAX 600 and 840 dp. Check scrolling, overlap and keyboard at MIN, geometry/colors at MAIN, and bounded card widths/multi-column behavior at MAX. Include enlarged text as an additional stress check. Record source, Android Release build, local checks and remaining visual differences.

## Persistent screen-test matrix

| Level | Logical width | Purpose |
| --- | --- | --- |
| MIN | 360 dp | Overlap, keyboard overlays, scrolling |
| MAIN | 390–411 dp | Primary design-fidelity target |
| MAX | 600+ dp | Prevent stretched phone cards; use appropriate multi-column/tablet composition |

The user's “80%+” describes prioritization, not measured MoFlight audience analytics. Screen widths are density-independent; screenshot pixel width alone is not proof of a dp width. Earlier 320/432 captures remain historical stress/evidence, not the new acceptance matrix.

The composite contains illustrative populated data. Do not manufacture flights, weather, duties, maps, AI responses or trends to fill it. Reduce repetitive integration prose within compact primary cards; retain explanatory details in accessible status/details surfaces. Exact photographic compositions remain unavailable; retain local licensed assets and attribution.

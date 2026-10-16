# MoFlight app design

Version: **0.4 — Header actions selected; layout review continues**. Updated: 2026-10-16 (Europe/Berlin). Product/design decisions: Manuel. This is a living design description; Git preserves revisions and the change log records meaningful decisions. A draft version is not approval of the entire design.

## Purpose and task boundary

M1 discovery deliverable: a shared description of appearance, screen structure, navigation and representative states, starting from Manuel's supplied Stitch export. Dependencies: the [confirmed journey map](2026-10-13-journey-information-map.md), [earlier design decisions](2026-10-13-dark-concept-review.md), and [project plan](../project-plan.md). Existing Issues [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5), [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), and [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11) were checked open on 2026-10-16; no new Issue is needed.

Review acceptance: Manuel has reviewed the relevant design choices; the description identifies destinations, primary actions, supporting screens and data states; a subsequent clickable preview demonstrates the selected journeys. This document alone does not complete M1 or authorize application implementation. Detailed operations, native checks and feasibility gates remain in the roadmap.

## Source and versioning

The [archived Stitch source](design-sources/2026-10-16-stitch/README.md) contains one Start-screen image, HTML and generated DESIGN.md. It is reference material, not binding instructions or an approved specification. Keep that snapshot unchanged; record our reviewed design here. Screen variants and future previews should identify the description version they implement.

Use three explicit labels: **Confirmed** (Manuel's decision), **Proposed** (awaiting review), and **Open** (not yet settled). Revise this document after answers; retain decision provenance and summarize meaningful changes below. Do not equate version numbers with milestone completion.

## Confirmed foundation carried forward

These choices carry forward from the earlier design review, with the explicit visual-style revision recorded below:

- Dark, clean, spacious; logical content is boxed. On 2026-10-16 Manuel selected keeping the Stitch visual style closely: navy/cyan, glowing accents, outlined and nested cards. This supersedes the earlier preference for filled cards with outlines only where needed. Phone readability remains a review requirement.
- Compact fixed header with current page title and contextual Back. On 2026-10-16 Manuel selected Refresh + Profile in the top-right header: Refresh retrieves the latest Vereinsflieger data; Profile opens account/settings. This replaces the Stitch starter's new-flight header action. Exact retrieval scope, progress/cancellation and behavior during guided steps remain to be specified.
- Four peer destinations: Start, Flüge, Papierbuch and Verein. Attached full-width bottom navigation with equal destinations and a selected indicator; the latest decision supersedes the earlier hovering dock.
- Start leads with Mein Fliegen, followed by Papierbuch. On 2026-10-16 Manuel selected a compact overview: smaller summaries for flying, paper-book and club information, with details available by tapping. This changes summary density, not the availability of the full information in its section. Exact summary fields, dimensions and club placement remain open; fitting everything without scrolling is not yet a requirement.
- Papierbuch overview retains navigation; guided checking/review/template steps hide it and use header Back.
- Flight filters open in a slide-up panel over the list.
- German app text; Android and iOS target platforms; offline access and clear data freshness/coverage. Keep unknown duration distinct from zero and assumed writing progress distinct from confirmed paper evidence.
- Approved branding and Expo/React Native remain as recorded; this description selects no new technology or service.

## Selected visual direction and remaining source observations

![Supplied Stitch Start screen](design-sources/2026-10-16-stitch/screen.png)

The screen uses deep navy surfaces, cyan highlights, rounded nested cards, Inter text, icon-and-label bottom navigation and a compact brand/page header. It shows an all-time total ribbon, seasonal flight count/time, an unexplained partial ring, a stale-sync badge and missing-duration alert. The paper card shows a last entry and pending entries; the club card shows a duty and work-hour progress. Dates and values are example content, not verified provider results.

The exported HTML contains placeholder destination links; it does not establish a working multi-screen journey. The generated style guide includes telemetry, cockpit and weather concepts outside our selected scope. Those do not become requirements. The screen's navy/cyan appearance, glowing accents and outlined/nested card treatment are selected as the visual reference. Exact implementation tokens, typography sizes, metrics, labels and behaviors still need review; selecting the look does not approve every source value or generated instruction.

## Review queue — one question at a time

| Order | Choice to settle | Current status |
| --- | --- | --- |
| 1 | Overall appearance: retain Stitch closely, simplify its styling, or use it mainly for structure? | Confirmed 2026-10-16: option 1, keep closely; navy/cyan, glowing accents, outlined and nested cards |
| 2 | Start density: what should be visible immediately, and what belongs behind a tap? | Confirmed 2026-10-16: option 2, compact overview of all three areas; tap for details; preserve flying-first/paper-second order |
| 3 | Header content and action hierarchy, including retrieval access | Confirmed 2026-10-16: option 1, Refresh + Profile; retain compact page title and contextual Back |
| 4 | Flight-summary presentation: year/comparison, aircraft and duration views; treatment of all-time totals and ring | Open within confirmed journey content |
| 5 | Papierbuch overview and next action: active book, evidence/assumed progress, pending work | Open within confirmed multi-book and guided-flow boundaries |
| 6 | Compact club summary and paths to details | Open within confirmed content; do not silently remove requirements |
| 7 | Destination layouts, details, filters, back behavior and representative states | Open; start with Start → Flüge → flight detail and the Papierbuch entry flow |
| 8 | Reusable spacing, type, controls and phone-size review | Open; test narrow widths, larger text, scroll clearance and meaningful labels |

Review loading, empty, offline, stale, incomplete, unknown, error, cancel and recovery examples before declaring a journey ready for detailed contracts. Preserve earlier saved information after a failed refresh. A visual example does not prove provider access or native behavior.

## Change log

| Version | Date | Change and decision status |
| --- | --- | --- |
| 0.1 | 2026-10-16 | Created from the supplied Stitch starter and earlier confirmed decisions following Manuel's request for a versioned description and guided questions. No new appearance choice confirmed yet. |
| 0.2 | 2026-10-16 | Manuel answered “1. keep” to the appearance question: retain the Stitch visual style closely. Earlier calmer-style recommendation is not selected; source content and behavior remain under review. |
| 0.3 | 2026-10-16 | Manuel answered “2.” to Start density: compact flying, paper-book and club summaries, with details behind a tap. Exact fields and sizing remain under review. |
| 0.4 | 2026-10-16 | Manuel answered “1.” to header actions: Refresh + Profile replace new flight + Profile; current page title and contextual Back remain. |

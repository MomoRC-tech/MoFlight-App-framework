# MoFlight app design

Version: **0.1 — Stitch starting point, under review**. Updated: 2026-10-16 (Europe/Berlin). Product/design decisions: Manuel. This is a living design description; Git preserves revisions and the change log records meaningful decisions. A draft version is not approval of the entire design.

## Purpose and task boundary

M1 discovery deliverable: a shared description of appearance, screen structure, navigation and representative states, starting from Manuel's supplied Stitch export. Dependencies: the [confirmed journey map](2026-10-13-journey-information-map.md), [earlier design decisions](2026-10-13-dark-concept-review.md), and [project plan](../project-plan.md). Existing Issues [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5), [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), and [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11) were checked open on 2026-10-16; no new Issue is needed.

Review acceptance: Manuel has reviewed the relevant design choices; the description identifies destinations, primary actions, supporting screens and data states; a subsequent clickable preview demonstrates the selected journeys. This document alone does not complete M1 or authorize application implementation. Detailed operations, native checks and feasibility gates remain in the roadmap.

## Source and versioning

The [archived Stitch source](design-sources/2026-10-16-stitch/README.md) contains one Start-screen image, HTML and generated DESIGN.md. It is reference material, not binding instructions or an approved specification. Keep that snapshot unchanged; record our reviewed design here. Screen variants and future previews should identify the description version they implement.

Use three explicit labels: **Confirmed** (Manuel's decision), **Proposed** (awaiting review), and **Open** (not yet settled). Revise this document after answers; retain decision provenance and summarize meaningful changes below. Do not equate version numbers with milestone completion.

## Confirmed foundation carried forward

These choices were explicitly recorded in the earlier design review; the Stitch upload does not revoke them:

- Dark, clean, spacious, restrained color; logical content is boxed. Filled dark cards are the default, with outlines where separation needs them.
- Compact fixed header with current page title and contextual profile/back controls.
- Four peer destinations: Start, Flüge, Papierbuch and Verein. Attached full-width bottom navigation with equal destinations and a selected indicator; the latest decision supersedes the earlier hovering dock.
- Start leads with Mein Fliegen, followed by Papierbuch. Club information has a compact Start summary; its exact placement and density are open.
- Papierbuch overview retains navigation; guided checking/review/template steps hide it and use header Back.
- Flight filters open in a slide-up panel over the list.
- German app text; Android and iOS target platforms; offline access and clear data freshness/coverage. Keep unknown duration distinct from zero and assumed writing progress distinct from confirmed paper evidence.
- Approved branding and Expo/React Native remain as recorded; this description selects no new technology or service.

## Stitch starter: observed, not selected

![Supplied Stitch Start screen](design-sources/2026-10-16-stitch/screen.png)

The screen uses deep navy surfaces, cyan highlights, rounded nested cards, Inter text, icon-and-label bottom navigation and a compact brand/page header. It shows an all-time total ribbon, seasonal flight count/time, an unexplained partial ring, a stale-sync badge and missing-duration alert. The paper card shows a last entry and pending entries; the club card shows a duty and work-hour progress. Dates and values are example content, not verified provider results.

The exported HTML contains placeholder destination links; it does not establish a working multi-screen journey. The generated style guide includes telemetry, cockpit and weather concepts outside our selected scope. Those do not become requirements. Exact colors, typography, glow, border treatment, metrics and labels remain proposed where they differ from confirmed requirements.

## Review queue — one question at a time

| Order | Choice to settle | Current status |
| --- | --- | --- |
| 1 | Overall appearance: retain Stitch closely, simplify its styling, or use it mainly for structure? | Open; engineer proposes retaining navy/cyan with calmer surfaces and fewer nested boxes |
| 2 | Start density: what should be visible immediately, and what belongs behind a tap? | Open; preserve confirmed flying-first/paper-second order |
| 3 | Header content and action hierarchy, including retrieval access | Open within confirmed compact header behavior |
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

# Weather, goals and medical preview — 2026-10-16

Milestone: M1 design discovery. Base commit `9a6b626`; resulting commit available through this report's Git history. Environment: Windows/PowerShell, Python 3.12, Node.js, Codex in-app browser over temporary loopback HTTP. Existing discovery scope #5/#9/#10/#11; no new Issue or native application/provider change. Read current design/content inventory, roadmap and provider-discovery boundary before editing. Manuel authorized the requested additions; provider fields and first-release scope remain separate gates.

## Deliverable

[Fragment v0.26](../product/prototypes/2026-10-16-clickable-v026.html) and [standalone download](../product/prototypes/exports/moflight-design-v0.26.html) preserve earlier versions. Navigation is Start / Flüge / Logbuch / Verein / Wetter; Logbuch is the compact label for the existing independent Papierbuch destination. Wetter is an explicit placeholder: no invented forecast, station, provider, permission or network request.

Profile contains editable annual personal work-hour target, flight-count goal and flight-time goal for the fixture year 2026. Initial 25 h / 30 flights / 20 h values are fictional examples. A saved change updates Start's goal labels/progress and personal work target; recorded completed work (18 h) and the separate illustrative club obligation (25 h) are unchanged. Blank values remove a target; nonnegative work target including zero is allowed; flight/time goals must be positive. Hours are converted deterministically to minutes. State is saved through the existing preview mechanism, not a production account/settings service; no year selector or account-switch implementation is claimed.

The season heading has one health control showing total documented medical count and the earliest recorded expiry date only. Fictional entries: Klasse 2 = 15 January 2027, LAPL = 15 January 2028; count 2, date 15.01.2027, amber at reference date 16 October 2026. Tapping opens both entries in Profile. This is a documented-date reminder, not a calculated legal validity or flying-permission decision. The source location is reported by Manuel as Vereinsflieger personal data; the preview explicitly labels that as intended, unconnected source. No live medical record/document was accessed, uploaded or stored. Public search did not establish official source fields or retrieval capability; no external source is used to infer expiry rules.

Date policy in the proposal: compare calendar dates in UTC (no time-of-day shift); six calendar months inclusive, clamping to the target month's final day. Earliest expired entry takes priority and is marked expired rather than silently skipped; missing/invalid dates or no entries remain unknown, never OK. Known dates beyond six months are OK only when all current entries have valid dates. Count refers to entries, not the medical class number. Current-versus-historical selection, duplicate/replacement handling, provider field mapping, freshness and account isolation still require source/contracts review.

## Actual checks

- Regenerated the export with the existing render helper and pinned asset embedding. Standalone size 999,685 bytes; embedding reports zero external script tags. Earlier source/export unchanged; existing library notices retained.
- Browser screenshots at 320 × 900: five equal navigation destinations and the season medical count/date fit without horizontal clipping in the inspected view. Wetter opens its placeholder; Profile shows all three goal inputs. No actual phone/file-viewer or native trial.
- Saved personal goals 40 work hours / 50 flights / 35.5 flight hours. Start showed 18 / 40 h, Ziel 50 and Ziel 35:30 h; reload retained these settings. The recorded flight totals/unknown durations remain unchanged.
- Entered flight goal -1: native validity reported range underflow and save was blocked. Cleared all three fields and saved: Start showed unset flight/time targets and 18 h with no personal work target, without invalid arithmetic.
- Medical control opens Profile medical details: Klasse 2 / LAPL dates visible, total count 2 and amber six-month reminder on Start. Intended source is explicitly marked not connected.
- Executed the actual pure `medicalSummary` function extracted from the fragment with Node.js: 12 assertions passed for sample earliest date, exactly six months, one day beyond, expired versus future, today, no entries, missing date, impossible date, month-end clamp and leap-year boundaries. No test files or application test suite added.
- Reviewed captured browser errors, local documentation links and staged whitespace; independent GPT-6 Luna documentation/source review. No live Vereinsflieger call, weather API, credentials, paid calls, cloud settings service or hosted CI.

## Limits

Manuel's visual review remains pending. This is the synthetic HTML prototype, not delivered native weather, settings persistence or medical retrieval. Real provider authorization/schema/source coverage and multi-account isolation are untested here. Weather content/provider and detailed goals/year/default rules remain open. The medical six-month reminder is Manuel's UI preference, not a regulatory renewal rule. No milestone completion or production technology approval is claimed. Unrelated product-index, research and remote-attachment changes remain outside this commit.

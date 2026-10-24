# Dark Compact Cockpit — approved 24 October 2026

Manuel explicitly authorized implementation in the existing app, preserving its original logo. [Approved reference](../design-sources/2026-10-24-compact-cockpit/reference.jpg) · [provenance](../design-sources/2026-10-24-compact-cockpit/README.md) · [#61](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/61). This contract supersedes conflicting earlier overview preservation, large destination title, scenic toolbar, ring composition, full-bleed club heading and duotone appearance instructions. Existing feature/data/authorization contracts remain in force.

The overview uses one horizontal original-logo/wordmark/destination toolbar, Sync immediately before Profile, conditional saved/sync status, one darkened photographic season card with three high metric columns, latest flight and Alle Flüge, side-by-side Medical/paper tiles, and a compact club heading above its retained duty body. Navy canvas/panels, subtle blue outlines, teal actions, white/blue-gray text and consistent outlined icons also apply to existing lists, details, forms, dialogs and states. The existing SVG/PNG icon pipeline and semantic IDs are reused; original logo bytes and historical references remain unchanged. Native text scales; metrics can scroll horizontally at enlarged text, Medical/paper tiles stack when enlarged, and all page content scrolls vertically. No mockup system chrome or fixed empty area is reproduced.

## Preserved implementation inventory

| Surface | Existing data and actions retained |
| --- | --- |
| Overview | Selected-account saved flights; year selection via season title; Statistics overlay; exact latest-flight identity and all-flight route; Medical source details; deferred paper entry; saved club duties and complete duty action. |
| Flüge / Statistics | Existing filters, saved summary, detail/back state, year/all/custom periods, aircraft breakdowns, comparisons, duration groups and exact contributors. |
| Flugbuch / Development | Existing deferred production journey; separate synthetic multi-book selection, paper evidence and writing tools remain in Development. No real paper book is activated by this redesign. |
| Verein | Overview, duties, events, document notices, annual work rows, individual work entries and own tasks with existing source/unknown/error states. |
| AI | Existing local questions, draft/keyboard handling and explicit unavailable service/retry; no paid/model call added. |
| Profile / nested sheets | Connection preferences, local maintenance, imports/exports, backup/restore, diagnostics, credits and existing synthetic tools. Sync retains its root coordinator, matching-account proof, duplicate guard, cancel/retry and source-specific details. |

## Data limits and notation

Current/prior season derives from the selected year. Time is known reported h:min, with explicit unknown-duration notice; starts and known time use existing deterministic calculations. Missing values are —. Confirmed empty years require saved retrieval coverage for the whole relevant season through today (past years through December 31) and no unresolved date ambiguity. The #62 fix preserves — when saved records have unassigned dates, even with complete retrieval coverage. No complete-history claim follows from positive cached values.

Completed duty hours require exactly one valid annual work-summary row for the selected year. Unknown remains —; no sum of a partial list. The captured Pflicht/Geleistet money amounts are EUR and cannot establish an hour requirement. The local provisional target starts at 25 h, always labelled **Soll vorläufig**; tap that metric to change it for this account/store/year. It is a UI preference, not a confirmed club policy, and is excluded from existing MoFlight manual backup archives. No new external integration, production schema or provider write is introduced.

Club location has no verified field in the current projection: **Ort unbekannt** remains explicit; the reused thumbnail is decorative. Medical displays a recorded expiry/unknown reminder, never a fitness certificate. Real paper setup is not implemented: its tile accurately says **In Vorbereitung** instead of offering a nonfunctional setup. Already configured synthetic books remain accessible under Development; the preview exercises a configured tile without asserting real activation.

Both Development previews opt out of duty-target file reads and writes. Edits stay in memory for the mounted overview and reset when it is left/reopened or the app restarts. Existing synthetic preference files from older versions are ignored and preserved. Simulated states do not invoke provider retrieval or mutate real flight records.

The [24 October code review](../../verification/2026-10-24-compact-cockpit.md#code-review--24-october-2026) records the source c643d9d defects (#62–#65). The fix restores a visible/accessibility cue for uncertain latest-day ordering, invalidates obsolete target operations across key changes/unmount, and guards editor-close callbacks. The same report distinguishes host regression and native acceptance of the follow-up; approved appearance is unchanged.

Implementation is recorded separately from native acceptance in [one package report](../../verification/2026-10-24-compact-cockpit.md). Android, physical-phone, iOS and spoken accessibility evidence must be distinguished.

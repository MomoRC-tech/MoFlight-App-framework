# Dark Compact Cockpit — approved 24 October 2026

Manuel explicitly authorized implementation in the existing app, preserving its original logo. [Approved reference](../design-sources/2026-10-24-compact-cockpit/reference.jpg) · [provenance](../design-sources/2026-10-24-compact-cockpit/README.md) · [#61](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/61). This contract supersedes conflicting earlier overview preservation, large destination title, scenic toolbar, ring composition, full-bleed club heading and duotone appearance instructions. Existing feature/data/authorization contracts remain in force.

**Phone-feedback amendment — 24 October 2026, [#68](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/68):** Manuel requests clearer season photography, a club photograph fitted as a full-width header background using the same treatment, and equal icon-only Sync/Profile controls without visible container borders/backgrounds. These explicit changes supersede the reference's thumbnail/boxed-control details within this scope. Keep the original approved image and original logo; the supplied real phone screenshot/support report stay private in ignored local storage.

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

Completed duty hours require exactly one valid annual work-summary row for the selected year, accepting the observed `Jahr YYYY` label as well as a bare year. Mixed/ambiguous periods and duplicate matching rows remain unknown; no arbitrary year extraction. Unknown remains —; no sum of a partial list. The captured Pflicht/Geleistet money amounts are EUR and cannot establish an hour requirement. The local provisional target starts at 25 h, always labelled **Soll vorläufig**; tap that metric to change it for this account/store/year. It is a UI preference, not a confirmed club policy, and is excluded from existing MoFlight manual backup archives. No new external integration, production schema or provider write is introduced.

Club location has no verified field in the current projection: **Ort unbekannt** remains explicit; the reused club header photograph is decorative. Medical displays a recorded expiry/unknown reminder, never a fitness certificate. Real paper setup is not implemented: its tile accurately says **In Vorbereitung** instead of offering a nonfunctional setup. Already configured synthetic books remain accessible under Development; the preview exercises a configured tile without asserting real activation.

Both Development previews opt out of duty-target file reads and writes. Edits stay in memory for the mounted overview and reset when it is left/reopened or the app restarts. Existing synthetic preference files from older versions are ignored and preserved. Simulated states do not invoke provider retrieval or mutate real flight records.

The [24 October code review](../../verification/2026-10-24-compact-cockpit.md#code-review--24-october-2026) records the source c643d9d defects (#62–#65). The fix restores a visible/accessibility cue for uncertain latest-day ordering, invalidates obsolete target operations across key changes/unmount, and guards editor-close callbacks. The same report distinguishes host regression and native acceptance of the follow-up; approved appearance is unchanged.

Implementation is recorded separately from native acceptance in [one package report](../../verification/2026-10-24-compact-cockpit.md). Android, physical-phone, iOS and spoken accessibility evidence must be distinguished.

## Current header and photography

Sync and Profile share the same transparent 48×48 logical-pixel touch area, with no visible box/frame or Sync/Lädt caption. Icons are 28 units; the original logo stays unchanged. Accessible labels still explain the action, actual busy state, saved age, session proof and advice. A session mark and separate amber dot retain independent login/advice/incomplete-sync meaning, and motion indicates actual work with reduced-motion/foreground protection. Busy disables duplicate sync taps. The conditional status row and details/retry remain available.

Season and club photography use the shared `cockpitImage` opacity .82 and `cockpitShade` navy overlay `#001b2944`, preserving cover cropping and native text. The season photo remains shallow behind the heading/metrics. Club art fills only the compact header up to its divider; all duty body/actions remain below. Long names can wrap; no fixed screen height or scenic spacer is added. [Phone follow-up evidence](../../verification/2026-10-24-compact-cockpit.md#phone-feedback-follow-up--24-october-2026).

**24 October duty-row refinement — [#69](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/69):** both compact and expanded rosters use two logical rows: duty title left / date(s) right, then people. Calendar dates omit clock times and compress shared month/year in ranges. Names retain all supplied given names and abbreviate the family name; single source names stay intact. Unknown periods/people stay explicit. Larger text may wrap naturally without clipping. Raw source periods/names, ownership and partial-coverage qualifications remain unchanged.

**Duty name source correction:** the club source hides separator spans, so whole-cell rendered text can concatenate different people. The reader preserves each observed leaf name span separately before abbreviation. Previously concatenated cached names cannot be reconstructed safely: show **Namen unklar · bitte synchronisieren** until the user explicitly synchronizes. The Development preview now uses raw fictional capture labels through the real duty projection, rather than preformatted names. No identity matching or automatic retrieval is added.

# Selected Club menu and local Assistant starters — 2 November 2026

## Scope and decision

Owner selected **Verein + starters only; keep current navigation** under #116 after the [21-item review](../product/design/pilot-experiment-adoption-review.md). Adapt items 11/13 on current main; no branch merge/cherry-pick/resumption. The other proposals remain unselected. Five destinations, lean Start/current colors and full detail/domain/storage/provider/auth behavior stay. #122 independently removes Start chart prose/extra header rows, batched into the same platform checkpoint.

ClubOverview is a pure bounded task menu: Dienste, Termine, Arbeitsstunden, Aufgaben and Dokumente open the existing detail sections. Short visible summaries show a source excerpt/truncation/unknown cue; full source/read-failure/loading descriptions stay accessible and in detail. Existing header/native Back, per-section scroll offsets and account/busy/source guards remain. The new overview replaces stacked previews/duplicate chips; it does not fetch data or invent completeness/totals.

Three Assistant controls populate an empty draft: season summary, known flight-time comparison and season registrations. Normal AiChat requires an active ready nonbusy empty conversation and no draft text. Choosing a starter calls only onDraft, preserving selected conversation/mode; no send, enablement or model/provider operation. Existing unsent text/hidden/unready/busy/archive boundaries are covered. Small 28dp faces use 48dp touch areas. A redundant welcome subtitle is omitted while starters show.

Existing CockpitPreview reuses the exact menu/starter leaves with fictional data and a local React draft; no disk draft/archive/service is created. Preview toolbar/native Back returns to its own Club menu before leaving Cockpit. This adapter proves only presentation/local wiring, not production persistence or actual AI quality.

## Host evidence

Fifty-four focused Start/AI/Club/preview/duty checks pass; the delegated updated shell file passes 61/61 (separate coverage; do not treat this as a full suite). Kept substantive five-route, account/source failure, toolbar/native Back and scroll checks. Removed one obsolete decorative ImageBackground assertion from the existing ClubHeading test, preserving full-name/wrap/source/action tests. Integration caught and corrected an encoding mistake in the parent's starter styling edit; final AI tests pass. TypeScript/lint/handbook and platform evidence follow below. No service activation, paid execution or broad app audit.

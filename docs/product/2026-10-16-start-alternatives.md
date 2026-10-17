# Two cleaner Start proposals

Historical design draft v0.31, 16 October 2026. The approved native reference and 17 October shell corrections supersede this draft as the implementation target. Owner: Manuel. Milestone: M1 discovery. Neither alternative is selected; v0.30 remains the last selected prototype arrangement. Existing scope #5/#9/#11, with no new Issue or scope expansion.

## Problem and deliverable

Manuel finds the current Start screen insufficiently clean and says its UI raises questions. He requested two alternative proposals, following Android UI guidance where possible. Deliver two clickable German Start designs and standalone HTML files for phone review, retaining the existing synthetic destinations and data. The comparison is a review aid outside the depicted app, not a new product control.

Dependencies: [content inventory v0.7](screen-content.md), [current design decisions](app-design.md), [v0.30 source](prototypes/2026-10-16-clickable-v030.html), existing synthetic fixture, and the official guidance below. Acceptance: both proposals are meaningfully different, readable at 320 px, have understandable labels/actions, preserve missing-time and book-scope boundaries, and retain the compact header. Check changed routes and layout in the browser; do not run app suites or native builds for this reversible design review.

## Alternatives

| Proposal | Structure | Question it tries to remove | Tradeoff |
| --- | --- | --- | --- |
| **Klarer Überblick** | Direct numerical season summaries and a straightforward vertical reading order. Aircraft distributions are behind the summary action | What do the colored rings mean, and where should I tap? | Easier to scan exact totals; aircraft distribution requires opening details. This deliberately proposes replacing the selected overview rings and needs Manuel's decision |
| **Saison im Fokus** | Keeps the paired aircraft rings, with explicit measure labels and detail wording; reduces competing surfaces and the paper-card emphasis | Which information belongs together, and which controls open details? | Retains aircraft distribution at a glance, with more explanation and less visual competition; still uses a chart that requires interpretation |

Both keep season → paper books → club order, five bottom destinations, visible sync timestamp, goals, medical reminder, work hours and monthly count comparison. Club actions use descriptive text rather than relying on symbols alone. Start continues to summarize work across independent paper books without a book selector or last-entry details. Weather remains a placeholder. The existing strong dialog and Back treatment carries forward.

The fixture remains six 2026 flights, 272 known minutes and two unknown durations; 2025 has five flights and 240 known minutes. Available sample data is not complete history. The medical count represents entries, not a medical class. Reminder dates are fictional and medical/provider retrieval is unconnected. Targets are personal goals, not source-reported obligations or completion. Proposal omissions never remove requirements from the content inventory.

## Android guidance used

Official pages were read on 16 October 2026:

- [Content composition and structure](https://developer.android.com/design/ui/mobile/guides/layout-and-content/content-structure): use consistent compact-screen margins, a flexible column grid, and whitespace/dividers to group related information. Applied as aligned sections with fewer competing containers.
- [Material components](https://developer.android.com/design/ui/mobile/guides/components/material-overview): familiar navigation, list, card and action patterns. Applied as labelled bottom destinations, clear action hierarchy and consistent surfaces.
- [Accessibility](https://developer.android.com/guide/topics/ui/accessibility/apps): visible text contrast, meaningful control descriptions and at least 48 dp touch targets. The HTML aims for 48 CSS-pixel primary action areas as a design approximation; this is not native dp/sp or TalkBack acceptance. Do not claim full Material compliance from an HTML mockup.

Our interpretation is to remove ambiguity through clear words and grouping before adding visual decoration. These sources do not prescribe MoFlight's product content or select one proposal.

## Review files and evidence

- Comparison fragment and standalone comparison export were not found at publication; not available.
- [Klarer Überblick fragment](prototypes/2026-10-16-start-overview.html); standalone export not available.
- [Saison im Fokus fragment](prototypes/2026-10-16-start-season.html); standalone export not available.
- No corresponding browser verification report was found at publication; no verified browser result is claimed for these drafts.

Historical proposed next step: compare the alternatives. Current next action remains the updated physical-phone retest, followed by the connection/retrieval contracts; this draft does not request another design approval. Selecting a visual direction does not complete M1, approve native implementation, or change provider/AI/technology gates.

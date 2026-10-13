# Rough Figma journey review — 2026-10-13

Status: both arrangements rejected by Manuel as crowded, lacking a concept and a real navigation header. Retain as historical drafts. [Dark concept revision](2026-10-13-dark-concept-review.md) records the supplied references and next review. This is M1 discovery, not application implementation or milestone acceptance. Based on the [reviewed map](2026-10-13-journey-information-map.md) and [project plan](../project-plan.md).

## Review artifact and comparison

- [Editable Figma Design file](https://www.figma.com/design/rOezxn6doQPYb88rtkmXxL).
- [Prototype A — shared overview](https://www.figma.com/proto/rOezxn6doQPYb88rtkmXxL?node-id=4-2439&starting-point-node-id=4%3A2439).
- [Prototype B — next action first](https://www.figma.com/proto/rOezxn6doQPYb88rtkmXxL?node-id=4-2496&starting-point-node-id=4%3A2496).

A starts with flying and uses Start / Flüge / Verein. B starts with the paper action and uses Start / Bereiche / Profil; its grouped destination list exposes flights, paper, costs and club information. Both retain confirmed start content in scrollable views. Deep tasks use full-screen views and a back action. No ordering or navigation choice is approved.

The file contains a destination map and 30 phone frames, including carousel and operation-state variants. Editable text, auto-layout and reusable local card/action components form the screens; there are no screen-image layers. Material library discovery and typography informed the draft. Imported action sizing proved unsuitable in this tool context and was replaced with a minimal local wireframe component. This is not a production design system or approved visual identity.

## Clickable review journeys

1. Flying summary → Meine Flüge → period/aircraft/person/recorded-role filters → fixed filtered example → contributing flight → synthetic source. Period and filters are retained in the example. Summary views share a representative detail screen; per-statistic charts and context need refinement.
2. Flüge aktualisieren → proposed period / first-retrieval example → progress → labeled demo outcomes: empty success, failure or recovery. Cancellation has a separate state. Saved flights remain reachable after failure, cancellation, expired connection and pending recovery. Recovery navigation does not prove provider restoration.
3. Paper suggestion → last-entry confirmation or synthetic photo-review branch → compact proposed flights → writing template → matching print concept. Next-session example remembers entries 191–193 as assumed written and asks about entry 193. Last-entry confirmation does not confirm unseen earlier pages. No completion checkbox is added.
4. Club details expose the 13–25 October own/flight-operation duty window, fictional Putzdienst partner, later own-duty preview, work hours, tasks, new documents, meetings and own reservations in details. Explicit range display and the 7 November preview are layout proposals, not newly confirmed horizon rules.

Paper, printing, club integration and costs retain future delivery gates. Billing inspection and name-display/privacy policy remain deferred. All names, flights, counts and dates are synthetic. No upload, AI, provider retrieval, calculation or print operation occurs. Forms use fixed examples; editing, dynamic state and reconciliation are not implemented. Carousel views switch through an explicit button; product swiping is intended but not demonstrated. The template's assumed-writing trigger/reopening rules remain for later contracts.

## Platform reasoning

390 × 844 compact phone frames, 16 dp margins, auto-layout groups, scrollable content, illustrative system inset areas and action targets at least 48 dp high. Selected destinations have a marker and label; uncertainty, freshness and assumed paper state use text rather than color alone. Roboto is an Android wireframe assumption because code has no selected custom font; it is not a new product font decision.

Guidance checked on 13 October 2026: [Android mobile design](https://developer.android.com/design/ui/mobile), [layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics), [accessibility](https://developer.android.com/design/ui/mobile/guides/foundations/accessibility), [Apple tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) and [Figma prototyping](https://help.figma.com/hc/en-us/articles/360040314193-Guide-to-prototyping-in-Figma). Apple’s page exposes limited reader text; iOS notes are engineering considerations, not a full HIG audit. Keep stable tab destinations, native back behavior and real safe areas when adapting to iOS. Retain Expo/React Native/strict TypeScript.

Real device insets, large text, screen readers, landscape/tablets and physical ergonomics remain untested. Review start density, scroll depth, grouping and task-focused back navigation before detailed contracts or implementation. Below-viewport start/club content is intentional scroll content.

## Verification and limits

Repository baseline: main at `c873defe90b018fbab87ef7acd58294b94022123`; local origin/main and live remote refs/heads/main matched. Preserve unrelated docs/product/README.md and untracked docs/product/2026-10-13-ecosystem-research.md.

Figma readback: 30 phone frames; 2 local components; 377 text nodes; 209 frames and 148 instances across the page; 144 nodes with reactions. Every NODE action points to an existing top-level frame on the same page. All rendered text uses Roboto; zero image-filled nodes. Full-composition screenshots exposed text reflow and action-sizing defects; targeted repairs passed the last visual inspection. Reusable actions measure at least 48 dp high (summary actions: 358 × 50).

This verifies editable structure, link destinations and visual composition. Presentation-mode playback and Manuel's journey review remain pending; graph inspection is not playback or usability acceptance. No application/native tests were run for this design/documentation work. First-release scope, detailed operation contracts, implementation, production schema changes, paid services and roadmap reordering remain unapproved.

Existing Issue #5 was inspected and remains open. Traceability: #5 UI/application boundary, #7 paper, #9 analytics, #10 provider information and #11 scope. Deferred #14 Activities live and #15 privacy remain unchanged. Next: review A/B and representative journeys with Manuel, then refine the selected rough arrangement before polish or detailed contracts.

Documentation checks: four changed documents, 131 relative file destinations checked, no missing files; git diff --check passed. These scoped checks do not repeat or extend the handover's earlier repository-wide heading audit.

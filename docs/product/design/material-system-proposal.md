# Material 3 system — proposal for review

26 October 2026 · [#94](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/94) · M1 / P1 design definition under #20.

**Status:** design-definition work is authorized. Manuel selected dark as the master/default theme, light as an explicit option, and exploration beyond navy/teal while preserving the original logo. His later theme instruction supersedes the earlier same-session device-following choice. Manuel subsequently accepted the revised current-color Cockpit direction and instructed implementation to proceed. The first bounded Settings increment is selected and implemented in source; broader navigation, component-library and light-mode decisions remain staged. The [Compact Cockpit](compact-cockpit.md) remains the implemented appearance authority until specific amendments are selected. This document is the handbook's temporary decision proposal; incorporate selected rules into the maintained chapters and move superseded material into history after selection.

## Outcome to decide

**Latest owner feedback — 26 October:** the muted Glacial palette is rejected as boring and too far from the current app. The current Start screen is preserved; only small, specific corrections are in scope there. The redesign focuses on the other pages, dialogs and navigation. Shared-token work must not indirectly recolor or recompose Start. Earlier permission to explore colors is not approval to replace the app's character. The preview now defaults to **Cockpit**, using the actual deep navy, bright cyan and text colors from `theme.tsx`. Earlier alternatives below remain comparison history, not the recommended direction.

Cockpit dark reference: surface `#001B29`, container `#062331`, raised `#0C3041`, action `#27D3D2`, action text `#031326`, body `#F4F8FC`, supporting text `#A9BED3`. The prototype uses a stronger `#82959E` outline for essential input boundaries rather than promoting the app's quiet decorative `#183D50` border to that role. Selected-control container colors and the optional light palette remain proposal values. These adaptations apply to the review examples, not Start or app code.

Choose one color direction, a page-led navigation model and representative component anatomy before broad screen rework. The [interactive review](proposals/material-system-review.html) uses synthetic content and local interactions only. It is an HTML fragment for the conversation viewer, not an app build or an operational website. Its palette and example controls are review controls, not proposed app settings. Representative examples: Settings, Statistics and exact contributors, flight-filter sheet and Sync confirmation.

## Findings and scope

The source review found a shared `Sheet` mechanism for Profile, Help, Medical and other destinations in [MobileApp](../../../apps/platform-lab/src/mobile/MobileApp.tsx). Most hide the underlying page and fill the viewport; Statistics instead uses a framed scrim. [ProfileSettings](../../../apps/platform-lab/src/mobile/ProfileSettings.tsx) uses similar secondary buttons for navigation, preference changes and task actions. [StatisticsOverlay](../../../apps/platform-lab/src/mobile/StatisticsOverlay.tsx) maintains an additional internal route stack. These mechanisms explain inconsistent surface and return semantics; no fresh device visual audit was performed.

Current handbook chapters contain superseding amendments above older values and patterns. We should make the selected rules immediately readable, while preserving original references and still-active account/provider/data requirements. Do not treat old numbers or currently rendered values as automatically approved future tokens.

## Color decision

Material's [Get started](https://m3.material.io/get-started), [color roles](https://m3.material.io/styles/color/roles) and [choosing a scheme](https://m3.material.io/styles/color/choosing-a-scheme) inform this proposal. The color reviewer read the live JavaScript pages in Chrome after plain web extraction returned placeholders. The [Android color guidance](https://developer.android.com/design/ui/mobile/guides/styles/color) provides a complementary official reference.

**Selected scope:** dark is the master design and default appearance; light is an explicit optional switch. Explore beyond navy/teal and preserve original logo artwork. Automatic device-theme selection is not the selected behavior. Until beta preparation, perform only brief affected-screen UI checks in dark mode; defer light-theme acceptance to the beta checkpoint.

**Recommendation, pending selection:** start with a static brand palette shared across devices. The optional light switch changes appearance, while wallpaper-derived dynamic color remains a separate future choice. Static schemes are not the same as Material's optional fixed-accent roles.

| Direction in review | Candidate source color | Rationale and tradeoff |
| --- | --- | --- |
| Coastal teal | `#008E91` | Continuity with the present app; clear text/icon semantics needed to distinguish teal actions from green success. |
| Glacial blue | `#315DA8` | Rejected as the recommended direction: too muted and too far from the existing app. Retained only as comparison history. |
| Mineral violet | `#6F5DA7` | A distinctly different, calm alternative. Would retire the historical purple-as-assistant exception. |

All hex values below are hand-selected candidates, not Theme Builder output, HCT-generated tonal palettes or sampled logo colors. A selected source color would be developed into a complete Material role scheme before implementation. The prototype is not a complete token catalogue.

| Role | Coastal light / dark | Glacial light / dark | Mineral light / dark |
| --- | --- | --- | --- |
| surface | `#F5FAFC` / `#071C25` | `#F8FAFF` / `#111820` | `#FFFBFF` / `#19171F` |
| surfaceContainer | `#EAF1F5` / `#102731` | `#EEF2F8` / `#1A232E` | `#F5EFF8` / `#24212B` |
| surfaceContainerHigh | `#DCE7ED` / `#1B323C` | `#E1E8F1` / `#26323F` | `#E9E1EE` / `#302C38` |
| onSurface | `#14232B` / `#E3F0F6` | `#17202C` / `#E5EDF8` | `#231F29` / `#F2EDF7` |
| onSurfaceVariant | `#43545E` / `#B8CAD3` | `#465365` / `#BDC7D7` | `#504757` / `#CEC4D5` |
| primary | `#00696B` / `#63D8D5` | `#24589D` / `#AAC7FF` | `#6750A4` / `#D0BCFF` |
| onPrimary | `#FFFFFF` / `#003735` | `#FFFFFF` / `#082D62` | `#FFFFFF` / `#381E72` |
| primaryContainer | `#9EF2EE` / `#00504F` | `#D7E3FF` / `#214478` | `#EADDFF` / `#4F378B` |
| onPrimaryContainer | `#00201F` / `#A0F0EB` | `#001B3E` / `#D5E3FF` | `#21005D` / `#EADDFF` |
| outline | `#697B85` / `#82959E` | `#6B798D` / `#8B98AA` | `#7E7487` / `#9A90A2` |

Adaptation: page canvas uses surface; ordinary grouped content uses container; temporary modal surfaces use high. Color alone is insufficient to establish modality: add scrim, placement, title, dismissal controls and modal interaction behavior. Use primary for principal actions; selected navigation/filter states use restrained container fills. Essential input boundaries need sufficient contrast; not every card needs an outline. Preserve the original logo rather than recoloring it to match each palette; assess its legibility separately in both themes.

| Semantic role | Light color / on-color | Dark color / on-color | Meaning |
| --- | --- | --- | --- |
| Error | `#BA1A1A` / `#FFFFFF` | `#FFB4AB` / `#690005` | Failed operation or invalid input, with explanation/recovery. |
| Warning | `#805600` / `#FFFFFF` | `#F4C15D` / `#432C00` | Actionable attention, never decorative emphasis. |
| Success | `#256C36` / `#FFFFFF` | `#92D79E` / `#003917` | Confirmed completion only. |

Warning and success are custom semantic extensions rather than standard Material error roles. Unknown stays neutral. Medical expiry describes recorded dates, not flight fitness. Charts require their own categorical mapping and labels; accent color cannot imply source freshness or completion.

## Layout and component proposal

Follow the [Material component roles](https://developer.android.com/design/ui/mobile/guides/components/material-overview) and [navigation guidance](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns). Use [dialogs](https://m3.material.io/components/dialogs/guidelines) for short blocking decisions and [bottom sheets](https://m3.material.io/components/bottom-sheets/guidelines) for bounded contextual choices.

- One page title and predictable top app bar. Substantial content becomes a page with Back; global Sync/Profile actions do not automatically appear in every child or modal header.
- Keep existing five primary destinations for this proposal. Primary navigation denotes peer destinations. Child routes have their own title and return context. Larger windows can use a navigation rail and list/detail panes.
- Settings uses grouped list rows, short summaries, chevrons for navigation and switches for preferences. Longer explanations move to the task that needs them. Cards group meaningful summaries rather than wrapping every row.
- Proposed type roles: title 22/28, section 16/24, body 16/24, supporting 14/20, control label 14/20. These are scalable starting values, not app implementation acceptance. Dense flight facts require a specific readable compact variant.
- Proposed spacing scale: 4, 8, 12, 16, 24 and 32 logical units; page margin initially 16. Shape follows component purpose, not one universal rounded box. Touch targets remain at least 48 logical units.
- One prominent action per focused task; secondary and destructive actions remain distinct. Use switches for binary preferences, filter chips for query scope and buttons for actions.
- Empty/offline/error states explain the situation and available action without invented success or redundant technical paragraphs. A failed operation remains visible until resolved; transient acknowledgements do not replace recovery.
- On phones, support 360 dp and prioritize 390–412 dp. At 600+ dp, adapt navigation and content, cap focused forms/dialogs and use panes where useful. Do not merely stretch phone cards. Large text may stack rows; keyboard space must not hide task actions.

## Proposed route and surface inventory

| Current destination/task | Proposed surface | Return/state contract |
| --- | --- | --- |
| Start, Flights, Logbook, Club, AI | Five primary pages | Retain destination state within the same account. No new destinations selected. |
| Flight detail | Child page | Restore exact caller and list/filter/scroll; Start and AI evidence calls retain their origin. |
| Statistics overview and sections | Secondary page | Preserve calling Start metric/year/scroll and selected statistics period. |
| Statistics contributors and detail | Nested list/detail pages | Return through exact contributor IDs and period; do not silently substitute general Flights. |
| Profile/settings, status, Medical | Secondary/detail pages | Return to actual caller. Keep status evidence and unknown/source explanations. |
| Help search/category/answer | Page and child answer | Retain search/category and originating flight/settings context; short contextual help may stay inline. |
| Backup/restore | Dedicated maintenance page/full-screen task | Preserve save/restore guards and source context. OS picker/share sheet remains OS-owned. |
| Provider administration | Settings page | Explicit actions; original-provider task separate from ordinary information. |
| Provider sign-in/sign-out page | Full-screen task exception | Close differs from logout; provider-history Back differs from app Back. Preserve native browser parent/session. |
| Sync confirmation | Short dialog | Cancel/Start, existing scope/background/stale-response protections. |
| Sync progress and failure | Header-attached feedback | Ordinary saved pages usable; failures remain actionable; no new automatic Sync. |
| Single flight-filter selection | Modal bottom sheet | Immediate application and dismissal; preserve other filters. Close/Back without selection leaves state. |
| Search/year/target editor | Short contextual editor | Dismiss before page exit; retain query and guard unsaved/saving changes. |
| Club sections | Child pages | Individual scroll and Back to Club overview; no invented document/event reader. |
| AI conversations and evidence | Primary page with subroutes | Retain selected conversation/draft; evidence detail returns to AI. Deletion remains a confirmation. |
| Diagnostics, credits, Development | Settings child pages | Clearly separate synthetic tools from ordinary product workflows. |

Back moves one level; Close ends a temporary task. A short chooser dismisses first when Android Back is pressed. For a child page, Back returns to its caller with context. Pending design decision: retain the current non-home-root Back-to-Start rule or use a different root policy; do not change it implicitly. Dirty editors require an explicit save/discard policy. Apply-and-close single selectors do not need an extra confirmation; a future multi-edit filter form would require a separate draft/apply decision.

The source currently preserves some context with mounted tabs, `overlayHistory` and scroll maps; do not assume every cross-overlay path already preserves Statistics or AI origin. Account/store changes must clear/revalidate private views rather than restoring another account's context.

## Explicit amendments requiring selection

The page-led program has selected the Statistics amendment below; other Help and maintenance migrations remain separately scoped. It does not supersede original logo ownership, existing feature/data contracts, independent saved-age/session meaning or protected provider lifecycle. The already-superseded historical all-purpose Sync popup is not a current rule to restore.

### Statistics route amendment — selected 26 October 2026

Manuel selected the recommended full child page in chat. This amends the [23 October approved frame](alternative-ui.md#statistics-overlay--approved-implementation-scope-23-october-2026) in presentation and navigation only; saved-local data, sections and exact route stack remain. The five primary destinations remain as they are; Statistics stays a child of Start rather than becoming a sixth destination. No Start restyling, shared Start token change, palette change, provider request or framework migration is part of this amendment. Source implementation is complete; its focused host checks passed, while native acceptance is recorded separately.

| Phone route | Proposed visible structure | Context and return |
| --- | --- | --- |
| Statistics section | Compact top app bar with Back, **Flugstatistik** and the existing Sync entry; selected year/all/custom period immediately below; horizontally scrollable section tabs for **Überblick**, **Flugzeuge**, **Flugdauer**, **Startarten**, **Flugrollen**; one scrolling content pane. Use the existing vivid navy/cyan dark roles, legible opaque data panels and restrained blueprint behind non-data space. | The tapped Start metric supplies year and initial section. Switching sibling sections replaces the visible section without adding a Back step. Remember period, section scroll and the mounted Start year/scroll. |
| Exact contributors | Top app bar with Back and the selected group title; short period/group summary and count; the existing dense flight cards in one scroll pane. | The current section and period stay underneath. Use only the computed exact saved-flight IDs, including existing unknown/conflict exclusions; do not substitute the general Flights list. |
| Saved flight detail | Top app bar with Back and flight identity; existing complete `FlightDetails` in one scroll pane. | Back returns to the same contributor list and its scroll, then to the same section/period and its scroll, then to the mounted Start. Android Back follows the same order. |

The top app bar remains visible while route content scrolls. Its Back affordance replaces the overlay's Close-at-root metaphor: from a Statistics section, Back returns to Start; from contributors or detail, it pops exactly one level. Sync remains a top-bar action during this bounded migration because it is an existing entry point; changing its global placement belongs to the later shell decision. A section switch is secondary navigation, not a new primary destination or a breadcrumb stack. The current local loading, empty, failed, partial-coverage and unknown-value explanations remain near the affected content. Changing account/store invalidates private Statistics routes rather than restoring old owner data.

At 600+ dp, keep the top bar and navigation semantics, cap readable chart/card width and use a centered content group; a contributor list/detail pair may become two panes once the shell's adaptive navigation is addressed. This implementation package migrates the phone route and preserves current section/period/contributor behavior; wide-layout refinement remains a separate bounded change. Acceptance checks cover Start year/scroll, all/custom period, section switching, exact contributor IDs, detail/list/section/Start Back, owner reset, and one brief dark native check of the affected route. Light-theme visual acceptance waits for beta.

This follows [Material 3 navigation and app-bar guidance](https://m3.material.io/components/navigation-bar/guidelines) with Google's [layout/navigation pattern examples](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns): primary navigation stays at five peers, sibling sections use secondary tabs, and child-page actions sit in the top bar. The [adaptive layout examples](https://developer.android.com/design/ui/mobile/guides/layout-and-content/adapt-layout) motivate constrained wide content rather than stretching the phone cards. MoFlight's exact contributor stack, saved-local caveats, fixed Start composition and vivid Cockpit colors are product-specific adaptations.

Provider integration retains one owner-scoped browser/controller and its native parent during hiding and credential activity. Never remount the browser merely to implement a new route. Close does not mean logout. Original-page verification, account association, reader reservations, recovery and protected save/restore remain mandatory. These require later targeted native acceptance if their surrounding shell changes.

## Delivery sequence and acceptance

1. Review these palette/surface proposals and the representative examples. Record palette, static/dynamic policy, page/sheet choices and root Back policy in #94.
2. Develop the selected palette into complete role mappings and state pairs, with logo/photo treatment. Incorporate selected rules into foundations/components/patterns; move superseded prose into history without losing active requirements.
3. Define a shared screen/app-bar/list-row/button/sheet/dialog boundary and migrate Settings as the first complete flow. Assess existing architecture and any library need before selecting a dependency; no library or Compose migration is approved here.
4. Migrate Statistics/detail context, then contextual choices/dialogs and remaining Club/logbook/AI surfaces in reviewable packages. Preserve the current Start composition and appearance, including when changing shared tokens; only separately identified small corrections belong there.
5. Verify changed logic and route context with focused checks. Until beta preparation, use dark mode only, brief affected-screen checks and valid existing evidence; check narrow/wide/keyboard/enlarged-text states only where the changed behavior warrants them. Light-theme acceptance waits for beta. Physical/iOS and spoken-accessibility limits stay explicit. Do not rebuild the app for this documentation/proposal increment.

The first increment is complete when the reviewed source inventory, palette alternatives, representative browser examples and open decisions are saved and linked in #94. The revised Cockpit direction and first Settings increment are now selected; subsequent migration packages and native acceptance remain open. See the current Settings amendment in Compact Cockpit and its verification report.

## Verification summary — design proposal only

Research/source review: current handbook and mobile route/components reviewed; live official Material references consulted. Two independent subtasks used the user-requested GPT-6.1 Sol with Medium reasoning; orchestration and synthesis remained in the main task.

The color review calculated opaque sRGB pairs across all three candidates: on-primary/primary at least 6.44:1; supporting text/high surface at least 6.26:1; outline/high surface at least 3.48:1. Shared semantic colors against high surfaces exceed 5.03:1, and their on-color pairs exceed 6.41:1. These are arithmetic checks, not comprehensive accessibility or native acceptance. Photos, logo, full secondary/tertiary roles, pressed/disabled states and final generated scheme remain unverified.

Initial proposal evidence, before the Cockpit palette revision: the dark-default fragment passed a brief headless Chrome check at a 390 CSS-pixel phone width (736 px browser container): all four example surfaces rendered without horizontal overflow or JavaScript errors. Exact synthetic contributors/detail/Back retained the selected period, year selection filtered the list, Cancel started nothing and confirmation Start stayed local-only. All three dark palette states rendered. Settings and filter-sheet screenshots were inspected locally. The design-control state was exercised through the fragment's host-state event; the actual conversation control panel was not acceptance-tested. This is browser proposal evidence, not React Native/device acceptance. Light acceptance is deferred under Manuel's latest instruction; an earlier provisional preview check does not establish it. No application build, live-provider call or measured UX improvement is claimed. Handbook freshness/link checking accompanies the saved proposal.

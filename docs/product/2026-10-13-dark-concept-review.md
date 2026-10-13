# Dark concept revision — 2026-10-13

Status: prepared for review, unselected. Manuel rejected both initial [Figma arrangements](2026-10-13-rough-figma-wireframes.md): “crowded, no concept, no real navigation header on the page”. Do not refine A/B as selected designs. The [journey map](2026-10-13-journey-information-map.md) still governs content and delivery boundaries.

## User-supplied visual direction

Manuel supplied these references and identified the qualities he likes:

- [Flighty concept by Callour Studio](https://dribbble.com/shots/27311738-Flighty-Flight-Tracking-App): clean look, obvious navigation.
- [Crème iOS screens on Mobbin](https://mobbin.com/apps/creme-ios-2437b570-6f06-4b2a-a683-834d6a6ee2de/fa5ffb66-047f-4b27-a1e5-7e9bb3088217/screens): dark theme, clean, good navigation, not crowded.
- [SaaS Dashboard by Ronas IT](https://dribbble.com/shots/27573533-SaaS-Dashboard-Mobile-App): clean, dark theme.
- [Zest by Phenomenon Studio](https://dribbble.com/shots/25927158-Medical-Mobile-App-UI-UX-Design-Zest): dark theme with color.

The three Dribbble compositions were visually inspected in the browser. Flighty's clear labeled destinations, the dark dashboard's layered surfaces and Zest's selective accents inform the revision. Mobbin redirected to its unauthenticated landing/sign-in page; its Crème screens were not inspected. Crème qualities above are Manuel's description, not independent observation. No subscription, sign-up, download or reuse of reference imagery occurred.

Confirmed aesthetic preference: dark, clean, spacious, understandable navigation, with color used sparingly. Specific palette, accent hue, header arrangement, tab placement, typography and component shapes remain proposals. These references do not select airline tracking, medical, task-management or other source-app features for MoFlight.

## Revised concept

One coherent hierarchy is proposed for review: a recognizable MoFlight header with profile/connection access, a separate page heading, boxed content and Start / Flüge / Verein primary navigation. Manuel subsequently directed that the menu selection boxes be placed near the bottom, hovering above the content, and said he likes many layout ideas in Android's UI guides. The preview now follows that placement; the earlier top-navigation arrangement is superseded. This confirms menu placement intent, not approval of every screen, style or Android example.

Manuel's subsequent explicit correction: “i want all elements boxed. no free floating text”. The preview now encloses every logical block: app header, navigation, page heading, flying summary, paper action, club digest, cost entry and supporting footer text. Detail-view content is also enclosed. This confirms containment preference, not the whole layout or implementation. Consistent spacing keeps the boxes distinct; provisional warm color marks the selected destination and primary action. German UI text and fictional data remain.

The [editable isolated preview source](prototypes/2026-10-13-dark-navigation.html) is an HTML fragment for in-chat design exploration, outside the Expo application. It includes three core destinations and representative detail, paper and offline examples. It performs no provider access, persistence, AI, printing or backend operations. Filter selection is a labeled fixed demo; it is not a dynamic query implementation. Later operation/state contracts remain open. This is a direction review, not a polished native UI or an approved replacement for Figma.

## Figma blocker and checks

The first Figma inspection request for this revision was rejected: the connected Starter plan's MCP tool-call limit was exhausted. whoami confirmed that plan. No revision was written to the Figma file, no upgrade or spending change was made, and no reset date was assumed. Figma Design remains the agreed main workspace; transfer/refinement there remains pending tool availability.

The local preview was rendered with the visualization skill's wrapper and inspected through the browser. Actual clicks verified Start → Flüge → flight details → back, Verein navigation, summary switching and paper anchor → review → template. A 320-pixel browser viewport exposed navigation-label wrapping; removing nav icons repaired it while retaining explicit labels and selected-state highlighting. Final narrow-view screenshot showed readable navigation and no horizontal overflow. Browser errors were empty at the inspected point. The temporary viewport override was reset.

These are prototype checks, not app/native acceptance or Manuel's approval. Density and usefulness still need his review. Floating-bar dimensions/insets, fixed examples, static duration-distribution placeholder and incomplete operation states remain rough-design limits. No application implementation, detailed contract, production schema or milestone order was changed. Billing, Activities live and privacy/name-display decisions remain deferred.

Documentation checks: five affected Markdown documents, 138 relative file destinations, no missing files; staged whitespace check passed. The unrelated product-index edit and ecosystem-research file were preserved outside this commit.

Boxed revision checks: inspected the updated Start at default and 320-pixel browser widths; at the narrow width the root measured 273 pixels with matching scrollWidth, so no horizontal overflow was observed. Clicked Flüge and verified its page heading/content and retained navigation. Browser viewport override was reset. This targets containment/layout only; earlier bounded interaction checks are not expanded into native acceptance.

Floating-bottom revision: reviewed official [Android navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), [layout basics](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-basics) and [system bars/insets](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars). Three peer destinations use icon-plus-label targets, with a selected state and 64-pixel minimum target height. The floating rounded treatment follows Manuel's preference; it is not asserted as a mandatory Material component shape. Insets and native keyboard/system-bar behavior still need actual device verification; no Compose migration is authorized.

The revised preview has a bounded 760-pixel phone surface with an internal content scroller and an anchored bar 20 pixels above the bottom (plus browser safe-area inset when available). Bottom content padding is 120 pixels so final content can scroll clear of the bar. Header/menu remain separate from scroll content. Default-size readback: bar height 78 pixels, bottom gap 20 pixels. At a 320-pixel browser viewport the root and scrollWidth both measured 288 pixels; icon/label navigation remained readable. Clicked Flüge and a contributing flight; keyboard End scrolled detail content to 115 pixels while the menu stayed at the same position. Native wheel/drag automation did not move the nested scroller; do not report it as a passed touch-scroll trial. Full composition was inspected and temporary viewport restored. This is local prototype evidence only.

Next: ask whether this dark, structured direction is closer to Manuel's intended experience, then refine one focused aspect at a time. Do not treat an unanswered/preselected choice as approval.

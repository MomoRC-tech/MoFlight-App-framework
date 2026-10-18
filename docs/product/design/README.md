# MoFlight UI design handbook

This is the current starting point for MoFlight's visual design. Use it when enhancing screens, reviewing symbols or proposing a change to the overall appearance. Manuel authorized this consolidation on 18 October 2026 under [#23](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/23). The later selected duotone symbol family, M2 Medical card and supplied folded paper plane were approved for guide/app integration on 18 October 2026 under #20. Other layout and data decisions retain their scope.

## Read or share the guide

| Chapter | Responsibility |
| --- | --- |
| [Foundations](foundations.md) | Color roles/pairings, typography, spacing, geometry, effects, photography and branding. |
| [Components and shapes](components.md) | Cards, controls, headers, navigation, sheets, badges and charts, with relevant states and source locations. |
| [Layout and presentation patterns](patterns.md) | Composition, responsive widths, navigation, keyboard, accessibility and honest data presentation. |
| [Symbols and icons](../symbol-reference.html) | Current 47-entry catalogue: appearance, meaning, action, states and editable asset paths. |
| [Default symbol family: Modern Duotone](symbols/index.html) | The 29 current glyphs, compact specimens and current ID mapping. M2 Medical card + supplied paper plane are the defaults. Superseded icon designs and comparison pages have been removed. [Source notes](symbols/README.md); app integration and native evidence are recorded separately. |
| [Implementation inventory](implementation-inventory.md) | Generated complete literal-color map, gradients, typography/geometry declarations and source fingerprints, including retained lab/adapter exceptions. |
| [Decisions, history and known gaps](history.md) | Authority, overrides, superseded prototypes, unresolved differences and platform evidence. |
| [Complete standalone HTML guide](design-guide.html) | All chapters, schematic component examples, approved reference and the same catalogue, with full text copy/download for another AI chat. Download/open the HTML to use its controls. |
| [Plain-text handoff](design-brief.txt) | Generated complete text for copying or attaching without embedded image data. |

## Current visual direction

Preserve the compact aviation interface: deep navy canvas and layered dark cards, blue/cyan actions and selection, warm orange paper-logbook actions, purple assistant accents, readable light text and licensed photographic headers with dark overlays. Group related content with a clear title, primary value/action and quieter supporting information. Use the approved reference's asymmetric dashboard composition and restrained spacing; adapt it to available width and enlarged text.

Keep German labels beside important navigation/status symbols. Show saved facts and explicit unknown/unavailable states. Decorative photographs and illustrative design examples do not establish weather, tracks, source freshness or copied paper entries.

## Authority and scope

1. The [approved four-screen image](../design-sources/2026-10-16-four-screen/reference.png) controls baseline layout, cards, colors, buttons and spacing. Its sample data is illustrative; see its [source record](../design-sources/2026-10-16-four-screen/README.md).
2. The [17 October shell corrections](../2026-10-17-native-shell-corrections.md) amend that baseline with Übersicht, Flüge, Flugbuch, Verein and AI; the compact fixed branded/profile header; and aircraft-share rings.
3. The [18 October header decisions](../2026-10-18-header-status-review.md#package-1b-decision-checkpoint) amend their scope with aircraft B, contextual app Back, separate provider-history Back/Close and Connection → Med → Profile. Med reads unbekannt and opens a read-only explanation.
4. Manuel's 18 October symbol selection adopts **Modern Duotone as the default family**, including **M2 Medical card** and the **supplied folded paper plane**, for navigation/header/dashboard/action symbols. His subsequent instruction removes the old icon designs and comparison pages. Labels, status meanings, approved branding and data notation remain. See [default family](symbols/README.md).
5. This handbook consolidates those decisions. Earlier prototype choices apply only where explicitly carried forward. Code values record implementation and cannot approve an unresolved visual difference.

Manuel owns design decisions. Priorities, journeys and account/book behavior remain in the [project plan](../../project-plan.md), [journey map](../2026-10-13-journey-information-map.md) and feature contracts. Link those contracts rather than duplicating them here.

## Status vocabulary

Keep **decision status** (approved, proposed, superseded), **implementation status** (implemented, partial, absent) and **verification status** (checked for a named source/platform, pending, unavailable) separate. An approved design can have an implementation gap; a current code value need not be an individually approved token; a browser example is not native acceptance.

## How to change the design

1. Capture scope/acceptance in the matching GitHub Issue. Edit the relevant chapter and prepare a concrete example/diff, naming affected components, symbol IDs, states and widths.
2. Obtain Manuel's choice where a new appearance/behavior needs a decision. Record owner/date, rationale and exactly what it supersedes in [history](history.md).
3. Implement the approved scope through shared styles/components where appropriate, preserving data/unknown rules. Code-token centralization remains a [separate proposed improvement, #24](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/24).
4. Run `python scripts/design_handbook.py`, then `python scripts/design_handbook.py --check`. Apply the [verification workflow](../../development/verification-workflow.md) to the actual change: documentation checks for documentation; applicable source/platform checks for changed native UI.

Markdown chapters, [color-roles.json](color-roles.json), [symbols.json](symbols.json), the component illustrations and HTML template are maintained inputs in this directory. Color-role metadata controls semantic usage; source code supplies implemented values. The implementation inventory, HTML guide, plain-text brief and compatibility symbol HTML are generated outputs. Do not hand-edit a generated palette or maintain a second catalogue. Original assets retain their locations/licenses.

The generator uses Python's standard library and repository files only: no network, installs, model calls or app builds. Supported chapter Markdown includes headings, paragraphs, links/images, emphasis, lists, tables and fenced code; unsupported raw HTML is rejected. Examples are assembled from the maintained catalogue/template.

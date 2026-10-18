# MoFlight UI design

Start here to review the app's visual direction, colors, components and symbols, or propose a design change.

**Status — 18 October 2026:** this page indexes the current references and records the proposed design handbook. The full consolidation is proposed under [#23](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/23). The sources below retain their existing authority; this index selects no new appearance or application behavior.

## Current design references

| Subject | Source and current meaning |
| --- | --- |
| Visual baseline | [Approved four-screen reference](../design-sources/2026-10-16-four-screen/README.md) and [image](../design-sources/2026-10-16-four-screen/reference.png): card composition, colors, boxes, buttons and spacing. Example data is illustrative. |
| Navigation and header amendments | [17 October shell corrections](../2026-10-17-native-shell-corrections.md) and [18 October header decisions](../2026-10-18-header-status-review.md#package-1b-decision-checkpoint): five tabs, selected aircraft B, contextual Back/provider Close and Connection → Med → Profile. These explicit choices amend the baseline within their scope. |
| Colors, typography and geometry | [Shared native theme and components](../../../apps/platform-lab/src/mobile/theme.tsx), with additional values in [mobile component source](../../../apps/platform-lab/src/mobile/). These record implementation; a complete reconciled design map remains part of the proposal below. |
| Symbols, icons and state marks | [Visual catalogue and copyable AI brief](../symbol-reference.html): 51 entries covering appearance, meaning, actions, states and source locations; includes a partial color map and labeled historical artwork. Download/open the HTML in a browser to use its copy/export controls. |
| Branding and imagery | [Approved Thermik branding](../../assets/branding/README.md), [native logo usage](../../../apps/platform-lab/assets/branding/README.md) and [photographic assets/credits](../../../apps/platform-lab/assets/aviation/README.md). Preserve original artwork and provenance. |
| Design and placement history | [App design record](../app-design.md) and [screen-content inventory](../screen-content.md). These include historical prototype choices; apply the current baseline and later amendments above when reviewing native UI. |
| Verification | [Verification workflow](../../development/verification-workflow.md) and [current header/navigation evidence](../../verification/2026-10-18-header-navigation.md). Recorded platform/source limits remain explicit. |

The earlier [Stitch-generated design guide](../design-sources/2026-10-16-stitch/DESIGN.md) is archived source material. Its palette, typography and additional concepts are not automatically selected by the current design. Likewise, existing code values are implementation facts; they do not settle unresolved design choices.

## Proposed handbook

Keep active visual guidance in this directory, with one maintained source per subject and one generated, portable HTML view for review and AI handoffs.

| Proposed part | Purpose |
| --- | --- |
| This entry page | Current design intent, approved reference and amendments, short visual summary and chapter links. |
| `foundations.md` | Semantic color map, typography, spacing, dimensions, corner radii, borders, gradients, shadows, photography/overlays and chart colors. |
| `components.md` | Illustrated cards, buttons, chips, fields, sheets, headers, navigation, badges and charts, with their relevant interaction/data states and shape rules. |
| Symbol catalogue | Reuse the existing catalogue and stable IDs, including editable asset paths. It remains at its current link until an approved consolidation changes its location. |
| `patterns.md` | Screen hierarchy, navigation presentation, responsive layout, enlarged text, keyboard/insets and accessibility; link existing behavior/content contracts. |
| `design-guide.html` | Generated standalone view of the maintained chapters and catalogue, with samples, color swatches and complete text copy/export. |

The proposed chapter files and combined HTML export have not been created. Original images, dated decisions, prototypes and verification reports remain preserved at stable locations and are linked as reference/history.

### Color and shape map

Each color entry should identify its semantic role, exact value including opacity/gradient, permitted uses, foreground/background pairings, related states and code/decision provenance. Distinguish interface status, aircraft chart colors and branding. Record checked contrast separately from unmeasured assumptions.

Component and symbol entries should cover geometry as well as appearance: radius, stroke, padding, optical size, touch area, states and function. Extend the existing symbol IDs instead of creating a second independent inventory.

### Maintenance and delivery

1. After scoped approval, consolidate the documentation and resolve which rules currently apply. Preserve the app's appearance and list unresolved differences for review.
2. Keep **decision status** (approved, proposed, superseded) separate from **implementation and verification status**. Link the decision/source and record meaningful changes once.
3. Prepare future visual changes through concrete handbook/example changes for review, followed by their scoped implementation and appropriate verification.
4. Generate the shareable view from maintained content. Centralizing hard-coded code values behind shared tokens/components is a separate proposed follow-up; it is not included in this documentation-linking task.

The full scope, dependencies and acceptance criteria remain in [#23](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/23), coordinated with [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20) for the existing icon/header work. Linking this proposal does not authorize the full reorganization, replacement artwork or new visual directives.

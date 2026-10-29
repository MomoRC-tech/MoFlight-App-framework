# Visual foundations

**29 October Start tiles:** the [selected Issue 108 correction](compact-cockpit.md#start-tile-contrast-and-medical-badges--authorized-29-october-2026) uses separate `startTileSurfaces`: card `#164154`, raised `#235469`, thin outline `#60889E`. Existing `startSurfaces` retain shell decoration. Start per-record Medical badges add green ✓ beyond six months, amber ! within the inclusive window, red × past and gray ? unknown; existing source/date semantics remain.

**28 October approved surface refinement:** content cards/raised surfaces now separate more clearly from the retained navy canvas. Start and header/bottom decoration explicitly retain their previous surface values; see the [scoped amendment](compact-cockpit.md#compact-controls-and-clearer-dark-surfaces--authorized-28-october-2026). Text/cyan/logo remain.

> **Current appearance authority — 24 October 2026:** [Dark Compact Cockpit](compact-cockpit.md) and its approved reference supersede conflicting older appearance/composition statements below. Data, feature and verification boundaries retain their scope.

> The [22 October modern UI contract](alternative-ui.md) is selected as the main baseline. It supersedes conflicting earlier appearance/composition descriptions for C01–C09, typography, surfaces, Start and flight browsing. Data and acceptance boundaries retain their separate contracts.
[Handbook entry point](README.md). Branch implementation is summarized here; numeric values are the current implementation snapshot, not a new independent selection of every token. Layout lengths are React Native logical units; text follows platform scaling. Browser examples use CSS pixels for explanation.

## Color roles

Keep surface, text, action, state and chart roles consistent, including foreground/background pairings. [theme.tsx](../../../apps/platform-lab/src/mobile/theme.tsx) exports the following values. The generator refreshes values from code and semantic usage from [color-roles.json](color-roles.json), maintained alongside this chapter.

<!-- generated:theme:start -->
| Semantic role / code key | Value | Allowed/current use | Pairing context |
| --- | --- | --- | --- |
| surface.canvas / `background` | `#001b29` | Primary dark canvas | text / muted |
| surface.card / `card` | `#103546` | Opaque shared content panel | text / muted |
| surface.raised / `raised` | `#1a4356` | Raised / secondary action surface | text |
| stroke.default / `border` | `#31586b` | Shared card/control outlines | dark surfaces |
| text.primary / `text` | `#f4f8fc` | Primary readable text | background / card / raised |
| text.secondary / `muted` | `#a9bed3` | Supporting text and inactive symbols | dark surfaces |
| action.primary / `blue` | `#27d3d2` | Mint filled action and selected-chip base; legacy code key | #031326 action text |
| accent.general / `cyan` | `#27d3d2` | Mint links, metrics and selected navigation labels; legacy code key | dark surfaces |
| accent.assistant.family / `purple` | `#231e63` | Retained assistant-family token; not a shared panel fill | light text; check displayed panel |
| accent.paper.family / `orange` | `#fc6a2d` | Retained paper-family token; no photographic paper hero | dark action text in context |
| feedback.saved / `green` | `#48dba5` | Local profile saved text; also a chart-palette color | dark surfaces; meaning needs text |
<!-- generated:theme:end -->

The purple/orange exports describe accent families; actual dashboard cards use local variants. A declaration or retained style does not prove that a value is rendered. The [complete inventory](implementation-inventory.md) covers static colors, named color-property values, opacity/gradient declarations and source locations across product mobile UI and app-owned TSX lab/adapter surfaces.

## Status and local exceptions

| Role | Current values | Meaning / pairing / source |
| --- | --- | --- |
| Selected navigation | `colors.cyan` on `colors.raised`; inactive `colors.muted` | Selected destination plus label/accessible state. [MobileApp](../../../apps/platform-lab/src/mobile/MobileApp.tsx), nav/active. |
| Last confirmed session check | `#74dfba` | Prior matching observation, ✓ and last-check wording; dark badge. [connection-guidance](../../../apps/platform-lab/src/mobile/connection-guidance.ts), S02. |
| Login required | `#ffc477` | Original-provider sign-in required, →; dark badge. Same source, S03. |
| Attention / recovery | `#ffb39e` | Error/mismatch/unconfirmed association/recovery; ! and a specific explanation. Same source and [ProviderConnection](../../../apps/platform-lab/src/mobile/ProviderConnection.tsx), S04. |
| Unknown / header control | `colors.muted`; opaque `colors.card` | Neutral ? and explicit unknown Medical tile. Sync/Profile use equal transparent targets; source/status detail remains accessible. ProviderConnection / [MedicalStatus](../../../apps/platform-lab/src/mobile/MedicalStatus.tsx). |
| App Back | Fill `colors.blue`, no separate border, dark contrast duotone arrow (brightest stop `#123a50`) | Contextual return, distinct from the dark header. [AppHeader](../../../apps/platform-lab/src/mobile/AppHeader.tsx). |
| Recorded role pill | Fill `#064240`, border `#227f87`, general cyan text | Recorded role, not qualification/completion. MobileApp badge. |
| AI welcome badge | Fill `#78efdc`, dark contrast duotone sparkle | Category decoration, not AI availability. MobileApp aiBadge. |

The ordinary header green ✓ requires matching confirmed proof younger than 90 seconds; identical previous scope/account/club/timestamp proof may retain its display during checking within that limit. This presentation never changes canonical authentication. Saved-flight freshness stays separate: steady amber recommends synchronization strictly after 72 hours, independent of login. A validated, scoped changed activity count uses the same amber face while leaving the age caption and session mark independent. When both amber reasons apply, both stay explicit. The provider panel retains separately scoped session/recovery presentation. See catalogue H03/S01–S05 and the [current header contract](alternative-ui.md#connection-action--23-october-2026).

## Gradients, overlays and shadows

Medical source-date reminders use `#ff7777` for recorded past expiry and `#f9b65b` for dates from today through six calendar months inclusive. Start retains white later/unknown dates and adds the per-row status badges above; the older header/details component retains muted later dates. Date relationship and partial/unknown source meaning also have text. These colors do not indicate flight fitness. The original recorded source remains available in details.

| Surface | Implemented treatment | Source / use |
| --- | --- | --- |
| Shared card | Opaque colors.card; no gradient | theme ui.card: subtle depth within a bounded card. |
| Selected chip | Opaque colors.blue fill/border; no glow | theme ui.chipSelected: selected query scope. |
| Photo shade | Retained Photo default `#00102277`; ordinary header uses the decorative flight illustration | theme Photo: check retained photo text against the displayed crop. |
| Club heading artwork | Approved brighter v2 image covering the full header; shared `#001b2944` readability shade and title shadow | ClubHeading: decorative image is clipped at the card borders behind a wrapping title in a minimum80 dp header (24 October phone-feedback amendment). |

The 21 October selected Start simplification removes the photographic paper hero and purple AI promotion; their former local gradients are not current dashboard treatments. The original approved reference/artwork stays preserved. The quiet paper entry retains the paper-tone symbol; other shared palette/category roles remain unchanged.

Eight-digit hex uses RGBA: the last byte is opacity. Effects belong to their current component context; this does not authorize spreading glow/transparency throughout the app.

## Charts and missing values

[season-model.ts](../../../apps/platform-lab/src/mobile/season-model.ts) uses `#46ccff`, `#48dba5`, `#3595fe`, `#a794ff`, `#f9b65b`, `#f48bb4`. Registration determines stable color across count/time distributions. Colors can repeat, so names, counts, known time and accessible descriptions identify aircraft. These colors do not mean warnings, freshness or goal progress.

Zero and unknown differ. Missing duration contributes no known minutes and retains its unknown notice. Missing distance/weather stays — with context. Do not fill empty panels with illustrative measurements.

## Typography

The native shell uses the platform default family; it does not configure Inter. Inter in the archived Stitch export remains historical. No new font family/package is selected.

| Context | Current size / line height | Treatment |
| --- | --- | --- |
| Shared title declaration | 26 / platform default | 700, letter spacing −0.6; not every screen uses this style. |
| Fixed header title | 28 / 34 | 700; destination row precedes controls on phones. |
| Section heading | 19 / 26 | 600. |
| Compact club heading / subgroup | 18 / 26 and 14 / 22 | 600; full source names wrap and system text scaling remains enabled. |
| Body / action label | 15 / 22 | Regular / 600 for actions. |
| Profile name input | 16 / platform default | System-scaled editable text. |
| Dashboard / summary value | Ring center14/19; prior value14/19; difference12/17 | Current700/prior600; native text scales and ring geometry grows with it. |
| Supporting text / tab label | Supporting text varies; tabs 12 / 18 | Secondary emphasis; selected tabs 700. |
| Medical label / status | 12 / 16 and 12 / 17 | Med is 600; status quieter, with date/unknown semantics preserved. |
| Season ring year / measure label | 10 / 14 and 12 / 18 | Current value inside concentric88/70-unit rings, prior year and difference outside; measure pairs stack at enlarged text. |

Sources: theme, AppHeader, Dashboard, MobileApp, [ProfileSettings](../../../apps/platform-lab/src/mobile/ProfileSettings.tsx), MedicalStatus and [SeasonRing](../../../apps/platform-lab/src/mobile/SeasonRing.tsx). Icon-glyph font sizes describe artwork, not body hierarchy. The generated inventory lists literal typography declarations. Selected icon raster palettes are recorded separately in the [native asset manifest](../../../apps/platform-lab/assets/icons/duotone/manifest.json); their artwork remains unchanged while branch body/text tokens differ.

## Spacing, geometry and target size

Use the documented component context. The branch uses 18 dp page spacing, shared-card padding 18/gap 12 and action horizontal padding 18. Retained grids/rows use 8/10 dp gaps and the Photo helper retains padding 12. These are observed values, not a newly mandated universal spacing scale.

| Shape | Current geometry | Context |
| --- | --- | --- |
| Shared card | Radius 22; border 1; padding 18; gap 12 | Most cards; flight rows override radius/padding. |
| Shared action | Radius 16; minimum height 52; padding 18 horizontal / 12 vertical | Secondary adds border 1. |
| Chip face / target | Radius 14; face minimum 66 × 40; target minimum height 48 | Year/training/club scope. |
| Header icon / Back | Profile 48 × 48, radius14; Data/Medical faces minimum 40 dp, radius 12, within minimum 48 dp targets; Back 48 × 48, radius 16 | Artwork size and target differ. |
| Medical group | Minimum 72 × 48, radius 12; grows with text | Icon beside Med/date text; 40-unit face within minimum 48 dp target. |
| Field / composer | Profile radius 12, minimum height 48; provider radius 10; composer radius 20 | Context-specific forms. |
| Tab / artwork | Tab minimum height 68, radius 16; artwork 28 in soft tile 36 / radius 12; label 12 | Five equal destinations. |
| Season comparison | Season card padding14; concentric outer88/inner70 at font scale1, thickness5; current value centered, prior/delta outside and shared aircraft legend | Prior ring50% opacity; geometry grows with font scale. Exact numeric saved-year differences retain unknown/unequal-period limits; see the alternative contract. |

The branch send target is 48 dp and ordinary flight search minimum height 52 dp. Retained lab faces do not independently prove adequate effective touch regions. [Known gaps](history.md) require actual hit-region review when affected controls change.

## Solid-color contrast measurements

Generated ratios use standard sRGB relative luminance on fully opaque pairs. These are descriptive arithmetic checks, not whole-screen/photo/alpha-compositing, native readability or device acceptance.

<!-- generated:contrast:start -->
| Opaque pair | Foreground | Background | Calculated ratio |
| --- | --- | --- | --- |
| Primary text / canvas | `#f4f8fc` | `#001b29` | 16.55:1 |
| Muted text / card | `#a9bed3` | `#103546` | 6.79:1 |
| Action label / mint action | `#031326` | `#27d3d2` | 10.08:1 |
| General mint accent / canvas | `#27d3d2` | `#001b29` | 9.53:1 |
| Brightest Back arrow gradient stop / opaque Back face | `#123a50` | `#27d3d2` | 6.49:1 |
<!-- generated:contrast:end -->

## Branding and photography

Preserve the [approved Thermik artwork](../../assets/branding/README.md). The native header uses the unchanged dark square logo at 88 × 88 with original aspect ratio on this alternative branch. The approved square AI icon now supplies the [platform launcher exports](../../../apps/platform-lab/assets/branding/launcher/README.md): opaque iOS/legacy artwork, a padded white adaptive/themed silhouette and teal background. Source originals are unchanged. [Package evidence and platform limits](../../verification/2026-10-18-launcher-icon.md) distinguish configuration, generated assets and installed Release acceptance.

The header uses the approved original realistic ASK-21-like raster artwork. The season heading reuses it at full width beneath the text with a warm amber/brown wash. Original bitmap and logo files remain unchanged; these are native layout/overlay treatments, not a new generated photo. [Provenance and the selected refinement](alternative-ui.md) remain explicit. Artwork is decorative, not weather, location or measured-flight evidence.

U2 uses a separate original generated [club airfield scene](../../../apps/platform-lab/assets/aviation/club-heading-airfield.png) behind the compact club title. The bitmap is unchanged; its absolute160×54 dp crop at right0/top−14 and navy overlays add no flow height. The fictional field, aircraft and windsock identify no real club or current conditions. Generation provenance is maintained in the [aviation asset notes](../../../apps/platform-lab/assets/aviation/README.md).

The HTML guide embeds original reference and symbol/brand images unchanged. Component examples are schematic CSS explanations with synthetic labels, not new app screenshots or replacement artwork.

The U1/U3 header uses neutral saved-age text independently of session state, with a small green `#74dfba` ✓ for recent matching confirmed proof, amber `#ffc477` → for required login, and muted ?/! for unknown/mismatch/error. Saved flight receipt age strictly greater than 72 hours adds a small `#ffc477` dot on the otherwise transparent icon-only control; exactly 72 hours does not. The same dot also signals a scope-matched activity-count change or incomplete sync, with distinct accessible wording and retained details/retry. These recommendation cues are independent of session colour and saved age; when both apply, both descriptions remain in the accessible action and status detail. Checks/login/failure never renew the durable successful flight receipt. The former one-hour age-colour policy is superseded. Provider-panel session colours retain their own meanings.

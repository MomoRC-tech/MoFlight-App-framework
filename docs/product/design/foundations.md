# Visual foundations

[Handbook entry point](README.md). Existing approved direction is summarized here; numeric values are the current implementation snapshot, not a new independent selection of every token. Layout lengths are React Native logical units; text follows platform scaling. Browser examples use CSS pixels for explanation.

## Color roles

Keep surface, text, action, state and chart roles consistent, including foreground/background pairings. [theme.tsx](../../../apps/platform-lab/src/mobile/theme.tsx) exports the following values. The generator refreshes values from code and semantic usage from [color-roles.json](color-roles.json), maintained alongside this chapter.

<!-- generated:theme:start -->
| Semantic role / code key | Value | Allowed/current use | Pairing context |
| --- | --- | --- | --- |
| surface.canvas / `background` | `#000d18` | Primary dark canvas | text / muted |
| surface.card / `card` | `#071929` | Card fallback; actual shared card adds a gradient | text / muted |
| surface.raised / `raised` | `#11263b` | Raised / secondary action surface | text |
| stroke.default / `border` | `#244760` | Shared card/control outlines | dark surfaces |
| text.primary / `text` | `#f5f7ff` | Primary readable text | background / card / raised |
| text.secondary / `muted` | `#adbed5` | Supporting text and inactive symbols | dark surfaces |
| action.primary / `blue` | `#3595fe` | Shared filled action and selected-chip base | #031326 action text |
| accent.general / `cyan` | `#46ccff` | General links, metrics and accents; tab selection has its own literal | dark surfaces |
| accent.assistant.family / `purple` | `#231e63` | Exported assistant-family token; dashboard uses local variants | light text; check displayed panel |
| accent.paper.family / `orange` | `#fc6a2d` | Exported paper-family token; hero uses local orange variants | dark action text in context |
| feedback.saved / `green` | `#48dba5` | Local profile saved text; also a chart-palette color | dark surfaces; meaning needs text |
<!-- generated:theme:end -->

The purple/orange exports describe accent families; actual dashboard cards use local variants. A declaration or retained style does not prove that a value is rendered. The [complete inventory](implementation-inventory.md) covers static colors, named color-property values, opacity/gradient declarations and source locations across product mobile UI and app-owned TSX lab/adapter surfaces.

## Status and local exceptions

| Role | Current values | Meaning / pairing / source |
| --- | --- | --- |
| Selected navigation | `#00c8ff` on `#020e17`; inactive `#adbed5` | Selected destination plus label/accessible state. [MobileApp](../../../apps/platform-lab/src/mobile/MobileApp.tsx), nav/active. |
| Last confirmed session check | `#74dfba` | Prior matching observation, ✓ and last-check wording; dark badge. [connection-guidance](../../../apps/platform-lab/src/mobile/connection-guidance.ts), S02. |
| Login required | `#ffc477` | Original-provider sign-in required, →; dark badge. Same source, S03. |
| Attention / recovery | `#ffb39e` | Error/mismatch/unconfirmed association/recovery; ! and a specific explanation. Same source and [ProviderConnection](../../../apps/platform-lab/src/mobile/ProviderConnection.tsx), S04. |
| Unknown / header control | `#adbed5`; background `#102d47aa` | Neutral ?, or Med / unbekannt. The photo/overlay affects the translucent control's actual background. ProviderConnection / [MedicalStatus](../../../apps/platform-lab/src/mobile/MedicalStatus.tsx). |
| App Back | Fill `#a4adff`, border `#d0d5ff`, dark contrast duotone arrow (brightest stop `#123a50`) | Contextual return, distinct from the dark header. [AppHeader](../../../apps/platform-lab/src/mobile/AppHeader.tsx). |
| Recorded role pill | Fill `#064240`, border `#227f87`, general cyan text | Recorded role, not qualification/completion. MobileApp badge. |
| AI welcome badge | Fill `#78efdc`, dark contrast duotone sparkle | Category decoration, not AI availability. MobileApp aiBadge. |

No automatic stale-time threshold is selected for the connection mark. Session evidence, saved-flight freshness, provisional association and MoFlight identity are separate. See catalogue H03/S01–S05.

## Gradients, overlays and shadows

| Surface | Implemented treatment | Source / use |
| --- | --- | --- |
| Shared card | `linear-gradient(140deg, #0c2d4a, #04131e)`; fallback colors.card | theme ui.card: subtle depth within a bounded card. |
| Selected chip | `linear-gradient(180deg, #46acff, #238bf5)`; border `#68baff`; shadow `0 0 7px #1889ff55` | theme ui.chipSelected: selected query scope. |
| Paper action | `linear-gradient(180deg, #ff963e, #ff621f)`; fallback `#ff762b`; text `#281004` | [Dashboard](../../../apps/platform-lab/src/mobile/Dashboard.tsx), orangeButton. |
| AI dashboard | `linear-gradient(145deg, #292276, #101c45, #53165e)`; fallback `#181854`; border `#6853b5` | Dashboard ai: bounded purple accent panel. |
| Photo shade | Default `#00102277`; header `#001022df`; paper `#913e1266`; club `#00112688` | theme Photo, AppHeader, Dashboard: check text against the displayed crop. |

Eight-digit hex uses RGBA: the last byte is opacity. Effects belong to their current component context; this does not authorize spreading glow/transparency throughout the app.

## Charts and missing values

[season-model.ts](../../../apps/platform-lab/src/mobile/season-model.ts) uses `#46ccff`, `#48dba5`, `#3595fe`, `#a794ff`, `#f9b65b`, `#f48bb4`. Registration determines stable color across count/time distributions. Colors can repeat, so names, counts, known time and accessible descriptions identify aircraft. These colors do not mean warnings, freshness or goal progress.

Zero and unknown differ. Missing duration contributes no known minutes and retains its unknown notice. Missing distance/weather stays — with context. Do not fill empty panels with illustrative measurements.

## Typography

The native shell uses the platform default family; it does not configure Inter. Inter in the archived Stitch export remains historical. No new font family/package is selected.

| Context | Current size / line height | Treatment |
| --- | --- | --- |
| Shared title declaration | 26 / platform default | 700, letter spacing −0.6; not every screen uses this style. |
| Fixed header title | 18 / 24 | 700; truncate before controls shrink. |
| Section heading | 15 / 20 | 600. |
| Body / action label | 13 / 18 | Regular / 600 for actions. |
| Profile name input | 16 / platform default | System-scaled editable text. |
| Dashboard / summary value | 24 / 29 and 20 / 25 | 700 / 600. |
| Supporting text / tab label | Usually 11 / 16 | Secondary emphasis; preserve meaningful labels. |
| Medical label / status | 12 / 16 and 11 / 15 | Med is 600; status quieter. |
| Ring value / label | 15 / 19 and 9 / 12 | Native rings hide at enlarged text or when values cannot fit. |

Sources: theme, AppHeader, Dashboard, MobileApp, [ProfileSettings](../../../apps/platform-lab/src/mobile/ProfileSettings.tsx), MedicalStatus and [SeasonRing](../../../apps/platform-lab/src/mobile/SeasonRing.tsx). Icon-glyph font sizes describe artwork, not body hierarchy. The generated inventory lists literal typography declarations. Selected icon raster palettes are recorded separately in the [native asset manifest](../../../apps/platform-lab/assets/icons/duotone/manifest.json); body/text color tokens are unchanged.

## Spacing, geometry and target size

Use the documented component context. Common implementation values include 8 dp card/grid gaps, 10 dp canvas/row spacing, shared-card padding 11, photographic padding 12 and action horizontal padding 14. These are observed values, not a newly mandated universal spacing scale.

| Shape | Current geometry | Context |
| --- | --- | --- |
| Shared card | Radius 14; border 1; padding 11; gap 6 | Most cards; flight rows override radius/padding. |
| Shared action | Radius 16; minimum height 48; padding 14 horizontal / 8 vertical | Secondary adds border 1. |
| Chip face / target | Radius 20; face minimum 66 × 34; target minimum height 48 | Year/training/club scope. |
| Header icon / Back | Controls 48 × 48, radius 14; Back 48 × 48, radius 16 | Artwork size and target differ. |
| Medical group | Minimum 72 × 48, radius 12; grows with text | Icon + Med above unbekannt. |
| Field / composer | Profile radius 12, minimum height 48; provider radius 10; composer radius 20 | Context-specific forms. |
| Tab / artwork | Tab minimum height 60; artwork 28 in soft tile 36 / radius 12; label 11 | Five equal destinations. |
| Ring | Diameter 62; thickness 6 | Aircraft distribution. |

Smaller faces, such as the 42 dp send face, 40 dp search input and 36 dp paper CTA face, do not independently prove adequate effective touch regions. [Known gaps](history.md) require actual hit-region review when affected controls change.

## Solid-color contrast measurements

Generated ratios use standard sRGB relative luminance on fully opaque pairs. These are descriptive arithmetic checks, not whole-screen/photo/alpha-compositing, native readability or device acceptance.

<!-- generated:contrast:start -->
| Opaque pair | Foreground | Background | Calculated ratio |
| --- | --- | --- | --- |
| Primary text / canvas | `#f5f7ff` | `#000d18` | 18.33:1 |
| Muted text / card fallback | `#adbed5` | `#071929` | 9.41:1 |
| Action label / blue fallback | `#031326` | `#3595fe` | 6.12:1 |
| General cyan / canvas | `#46ccff` | `#000d18` | 10.59:1 |
| Brightest Back arrow gradient stop / opaque Back face | `#123a50` | `#a4adff` | 5.72:1 |
<!-- generated:contrast:end -->

## Branding and photography

Preserve the [approved Thermik artwork](../../assets/branding/README.md). The native header uses the unchanged dark square logo at 52 × 52 with original aspect ratio. Archived custom launcher-icon artwork is not selected in the current app configuration.

Use the existing [aviation photographs/credits](../../../apps/platform-lab/assets/aviation/README.md). Preserve source/author/license links and explain cropping/dark overlays. Native scenes differ from exact reference photography; document this rather than extracting screenshot pixels. Photos are decorative, not weather/club/location evidence.

The HTML guide embeds original reference and symbol/brand images unchanged. Component examples are schematic CSS explanations with synthetic labels, not new app screenshots or replacement artwork.

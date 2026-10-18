# Style Option 2 — Modern Duotone & Soft-Filled Glyphs

[Open the visual review](index.html) · [SVG board](reference-board.svg) · [Editable masters](glyphs.svg) · [Asset/ID manifest](manifest.json) · [Current handbook](../../README.md)

Selected: **M2 Medical card + supplied folded paper plane**. [Plane reference](selected-plane-reference.png) is preserved unchanged. [Earlier comparison](alternatives.html) and [six-candidate board](alternatives-board.svg) remain historical; their preview controls record no product decision. [Integration authorization](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6249596497).

Manuel requested this alternative on 18 October 2026 under [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6249270927). **Selected for guide and app integration on 18 October 2026. M2 Medical card and the supplied folded paper plane supersede the earlier Medical/aircraft proposals.** This began as an M1 design deliverable and now includes the explicitly authorized native symbol integration. The existing 51-entry catalogue remains the semantic source of truth.

## Reference and fidelity

[reference.jpg](reference.jpg) preserves the supplied 1280 × 698 JPEG byte for byte. The board reconstructs its six-column, three-row composition with 150 × 147 px tiles, 24 px reference corners, cyan/slate silhouettes, a light upper-left edge, a restrained shadow and selective curved glass highlights. All foreground silhouettes are editable vectors; the JPEG is only the comparison layer, never a cutout used as an icon.

The review includes original/vector views and an adjustable comparison split. The interpretation follows the reference closely, but **mathematical pixel identity is not claimed**: JPEG softness, perspective-like shading and ambiguous contours cannot establish an original vector specification. The reference's duplicated LOGBOOK and ambiguous EXPLORE labels are clarified as Compass and Person. Their shapes remain in the same positions.

## Family and use

- 48 authored 96-unit SVG masters (reference concepts, historical proposals, the selected paper plane and a neutral calendar); 18 reference compositions. Each master also has a standalone transparent SVG in `assets/`.
- 34 selected catalogue artwork mappings; 17 explicitly preserved entries. All 51 stable IDs retain their meaning, action and state contract in the review. Original branding, native busy indicator, data-driven rings, text notation and historical entries are preserved.
- Cyan gradient: `#32f1ef` → `#00d9e8` → `#00b9df`. Slate: `#8caac1` → `#7094b1` → `#46688b`. Board canvas: `#041328`. These are proposed option-specific colors, not new approved application tokens.
- The enlarged reference tile has a 24 px corner; compact specimens pair 40/48/56 px tiles with 12/14/16 px corners to fit MoFlight's card geometry. Artwork is shown at actual 24/28/32 CSS px. Artwork bounds never define the effective touch target.
- Keep full-detail artwork for tiles/illustrations; inspect actual sizes before native adoption. A native renderer, density, hinting or exported bitmap may need separate optical simplification. The detailed calendar/logbook/analytics are deliberately present for reference review.
- Native assets use explicit default, muted, paper, assistant and dark contrast palettes; no runtime tint collapses their duotone structure. The catalogue embeds those actual PNGs. Standalone SVG downloads retain the base palette; the native export configuration records exact context colors.
- The reference's calendar “26”, weather and flight-plan path are illustrative category artwork. They establish no date, forecast, track, live source, qualification or provider connection. Medical stays **Med / unbekannt**. Session badges retain ?, ✓, → and ! with distinct wording; a previous check does not imply a current valid session.
- Compass, exploration, notifications, settings, flight-plan and analytics on the reference board add no app destination or feature. The extra side-view aircraft master is an unselected exploration; N02 now uses the explicitly selected folded paper plane; the former aircraft B files remain preserved.

## Maintenance

Maintained sources are `glyphs.svg`, `_review.html`, `_alternatives.html`, the mapping/board/candidate composition in [icon_option_2.py](../../../../../scripts/icon_option_2.py), the preserved reference, and the existing [symbols.json](../../symbols.json). `assets/*.svg`, both SVG boards, `manifest.json`, `index.html` and `alternatives.html` are generated; do not hand-edit them. The standalone reviews embed all display assets and work without an external font, icon service or runtime dependency; links/downloads to sibling files require the folder when shared. Buttons on the alternatives page change its preview only; they record no product decision.

```text
python scripts/icon_option_2.py
python scripts/icon_option_2.py --check
python scripts/design_handbook.py
python scripts/design_handbook.py --check
```

[One verification summary](../../../../verification/2026-10-18-icon-option-2.md) records checks and limits. The style/M2/plane selection is recorded. Source-specific Android/iOS/device verification and remaining runtime limits remain separate.

## Native assets

[duotone_icons.py](../../../../../scripts/duotone_icons.py) generates 29 glyphs × five palette variants and the static native registry. Generation uses the already installed CairoSVG 2.8.2 tool; the app and ordinary host freshness checks use no new dependency. `python scripts/duotone_icons.py --check` validates source/config, all RGBA PNG dimensions/hashes and the Metro registry with Python's standard library. Run without `--check` only after changing the maintained SVG/config. Medical stays unknown; the calendar uses neutral cells in native category headings.

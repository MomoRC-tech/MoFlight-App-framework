# Style Option 2 — Modern Duotone & Soft-Filled Glyphs

[Open the visual review](index.html) · [SVG board](reference-board.svg) · [Editable masters](glyphs.svg) · [Asset/ID manifest](manifest.json) · [Current handbook](../../README.md)

Manuel requested this alternative on 18 October 2026 under [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6249270927). **Creation is authorized; application selection/integration remains open.** This is an M1 design deliverable, with no application code changes. The existing 51-entry catalogue remains the semantic source of truth.

## Reference and fidelity

[reference.jpg](reference.jpg) preserves the supplied 1280 × 698 JPEG byte for byte. The board reconstructs its six-column, three-row composition with 150 × 147 px tiles, 24 px reference corners, cyan/slate silhouettes, a light upper-left edge, a restrained shadow and selective curved glass highlights. All foreground silhouettes are editable vectors; the JPEG is only the comparison layer, never a cutout used as an icon.

The review includes original/vector views and an adjustable comparison split. The interpretation follows the reference closely, but **mathematical pixel identity is not claimed**: JPEG softness, perspective-like shading and ambiguous contours cannot establish an original vector specification. The reference's duplicated LOGBOOK and ambiguous EXPLORE labels are clarified as Compass and Person. Their shapes remain in the same positions.

## Family and use

- 40 authored 96-unit SVG masters; 18 reference compositions. Each master also has a standalone transparent SVG in `assets/`.
- 34 proposed catalogue replacements; 17 explicitly preserved entries. All 51 stable IDs retain their meaning, action and state contract in the review. Original branding, selected aircraft B, data-driven rings, text notation and historical entries are preserved.
- Cyan gradient: `#32f1ef` → `#00d9e8` → `#00b9df`. Slate: `#8caac1` → `#7094b1` → `#46688b`. Board canvas: `#041328`. These are proposed option-specific colors, not new approved application tokens.
- The enlarged reference tile has a 24 px corner; compact specimens pair 40/48/56 px tiles with 12/14/16 px corners to fit MoFlight's card geometry. Artwork is shown at actual 24/28/32 CSS px. Artwork bounds never define the effective touch target.
- Keep full-detail artwork for tiles/illustrations; inspect actual sizes before native adoption. A native renderer, density, hinting or exported bitmap may need separate optical simplification. The detailed calendar/logbook/analytics are deliberately present for reference review.
- The paper and assistant catalogue samples preview orange/purple semantic tints through CSS filters. Downloaded masters use the base cyan/slate palette; those context tints are not separately approved token values.
- The reference's calendar “26”, weather and flight-plan path are illustrative category artwork. They establish no date, forecast, track, live source, qualification or provider connection. Medical stays **Med / unbekannt**. Session badges retain ?, ✓, → and ! with distinct wording; a previous check does not imply a current valid session.
- Compass, exploration, notifications, settings, flight-plan and analytics on the reference board add no app destination or feature. The extra side-view aircraft master is an unselected exploration; N02 uses the unchanged approved aircraft B.

## Maintenance

Maintained sources are `glyphs.svg`, `_review.html`, the mapping/board composition in [icon_option_2.py](../../../../../scripts/icon_option_2.py), the preserved reference, and the existing [symbols.json](../../symbols.json). `assets/*.svg`, `reference-board.svg`, `manifest.json` and `index.html` are generated; do not hand-edit them. The standalone review embeds all display assets and works without an external font, icon service or runtime dependency; links/downloads to sibling files require the folder when shared.

```text
python scripts/icon_option_2.py
python scripts/icon_option_2.py --check
python scripts/design_handbook.py
python scripts/design_handbook.py --check
```

[One verification summary](../../../../verification/2026-10-18-icon-option-2.md) records checks and limits. Visual acceptance of this option by Manuel, application integration and Android/iOS/device acceptance remain separate.

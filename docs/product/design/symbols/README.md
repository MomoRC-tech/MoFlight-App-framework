# MoFlight symbols — Modern Duotone & Soft-Filled Glyphs

[Open the symbol library](index.html) · [Editable masters](glyphs.svg) · [Asset/ID manifest](manifest.json) · [Design handbook](../README.md)

This is MoFlight's **default symbol family**, approved by Manuel on 18 October 2026: cyan/slate duotone silhouettes, rounded terminals and soft translucent tiles. **M2 Medical card** and the **supplied folded paper plane** are the Medical and Flüge symbols. The app uses this family throughout navigation, headers, dashboard, club and actions. [Default/removal authorization](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6250110588).

Previous aircraft assets, unselected proposals and comparison pages have been removed. The active catalogue contains 49 current entries; retired IDs X01–X03 and B04 are not reused. Approved Thermik branding, text/status notation and native busy indicators retain their identity. D07/D08 describe concentric current/prior-year aircraft-share rings under the 23 October refinement. D09 opens the saved-local statistics overlay; T07 records the mathematical minus sign separately from unknown-value notation. The Medical cross is red; its decorative colour does not establish source status.

## Family and use

- 30 authored SVG masters on a 96-unit optical grid, each with a standalone transparent SVG in `assets/`.
- 35 artwork mappings and 14 preserved branding/data/text entries in [symbols.json](../symbols.json). IDs retain their meanings, actions and state contracts.
- Base cyan: `#32f1ef` → `#00d9e8` → `#00b9df`; slate: `#8caac1` → `#7094b1` → `#46688b`. Native assets have explicit default, muted, paper, assistant and dark contrast palettes; runtime tint does not flatten their duotone structure. The complete handbook embeds actual native PNGs; standalone SVG downloads use the base palette.
- Compact tile specimens pair 40/48/56 px tiles with 12/14/16 px corners. Artwork sizes are context-specific; artwork bounds never define effective touch targets. Native navigation uses 28-unit artwork in 36-unit tiles with radius 12; header controls retain 48-unit targets.
- Medical shows **Med** with the earliest recorded expiry or **unbekannt**. Connection badges retain ?, ✓, → and ! with explicit wording. Category art establishes no date, forecast, track, qualification or verified session. Neutral calendar cells avoid a fictional date.

## Original references

[reference.jpg](reference.jpg) preserves the original duotone JPEG unchanged. [selected-plane-reference.png](selected-plane-reference.png) preserves Manuel's selected plane screenshot unchanged. They record provenance rather than a competing icon option. Editable vectors interpret those references; mathematical pixel identity with JPEG shading is not claimed. Native checks remain separate from browser specimens.

## Maintenance

Maintained inputs are `glyphs.svg`, `_library.html`, [symbol_library.py](../../../../scripts/symbol_library.py), the original references and [symbols.json](../symbols.json). `assets/*.svg`, `manifest.json` and `index.html` are generated. The page embeds all display assets; sibling downloads require the folder when shared. It uses no external fonts, icon service or runtime dependency.

```text
python scripts/symbol_library.py
python scripts/symbol_library.py --check
python scripts/design_handbook.py
python scripts/design_handbook.py --check
```

[duotone_icons.py](../../../../scripts/duotone_icons.py) generates 30 glyphs × five palettes and the static native registry. Generation uses the already installed CairoSVG 2.8.2; ordinary host freshness checks use Python's standard library. Run `python scripts/duotone_icons.py --check` to validate source/config, PNG visibility/dimensions/hashes and the Metro registry. Regenerate only after editing SVG/config.

[One verification report](../../../verification/2026-10-18-icon-option-2.md) records source-specific Android evidence, this cleanup and remaining platform limits.

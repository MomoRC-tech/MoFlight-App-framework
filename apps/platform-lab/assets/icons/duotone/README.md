# Selected MoFlight duotone symbols

Manuel selected Style Option 2, M2 Medical card and his supplied folded paper plane on 18 October 2026 under [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6249596497).

Editable source: [glyphs.svg](../../../../../docs/product/design/symbols/glyphs.svg). The original plane reference is preserved beside it. These 145 RGBA images are generated for 29 glyphs in default, muted, paper, assistant and dark contrast palettes. General assets are 192 × 192; the glider is 288 × 288 for its larger placeholder. Actual display sizes are explicit in SymbolIcon and its callers.

Run `python scripts/duotone_icons.py` from the repository root after changing the source/config. This uses the already installed CairoSVG 2.8.2 tooling; it adds no runtime dependency. `python scripts/duotone_icons.py --check` uses only the standard library to verify normalized source/config, PNG dimensions/nonempty visible alpha/hashes and the static Metro require registry. The manifest records exact palettes and renderer version. Do not tint these images at runtime; choose the appropriate palette variant.

The labelled parent owns action/status semantics. Images are decorative and hidden from accessibility announcements. Native ActivityIndicator remains the animated busy mark. A medical cross identifies the category; validity stays unknown. The calendar has neutral cells instead of an invented date. Earlier aircraft B and brand masters are preserved outside this generated directory.

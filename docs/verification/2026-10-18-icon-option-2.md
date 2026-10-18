# Style Option 2 — design asset verification

18 October 2026 · M1 visual discovery · [#20 package contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20#issuecomment-6249270927) · [Review](../product/design/icon-options/option-2/index.html) · [Maintained sources and fidelity limits](../product/design/icon-options/option-2/README.md).

## Scope and source

Manuel requested creation of the Modern Duotone & Soft-Filled Glyphs alternative from his attached JPEG. The package adds an editable SVG family, 18-composition reference board, original/vector comparison and explicit mapping for all 51 existing semantic IDs. It proposes 34 replacements and preserves 17 entries, including branding, selected aircraft B, data-driven rings and text/history semantics. App selection remains open. No application source is changed.

Starting repository source: `f01d0af` (main, clean before this package). Sources are `glyphs.svg`, `_review.html` and `scripts/icon_option_2.py`, plus the current `symbols.json`. Reference SHA-256: `1a29491d2964fccd9a71763409848bf7a734e59b9d978efd87c5de5f044308d7`; original attachment and preserved JPEG matched byte for byte. This reference is design artwork, not private flight data.

## Checks

Windows; Python 3.12.10; Node 24.18.0. The focused generator tests protect complete ID coverage, intentional preservation, rejection of an incomplete mapping, unique HTML/SVG IDs and resolved references, local asset links and unchanged embedded reference bytes. Each of the 40 standalone SVGs and the board is parsed and audited during generation. The generated manifest records the reference fingerprint, geometry, palette and every mapping.

Browser: Codex in-app browser over temporary loopback HTTP. All embedded images loaded, all 51 entries were present, catalogue disclosure opened, and the original/vector comparison changed mode and clipped the reference at the selected 35% split. Scoped layout checks at 360 × 800, 390 × 844, 600 × 800 and initial 1280 × 720 CSS px showed no document-level horizontal overflow. The large board deliberately scrolls inside its own container on narrow screens. CSS artwork widths measured 24/28/32 px exactly at 360 and 390; device pixel ratio 1, browser zoom/default text scale 100%. These are browser pixels, not measured native dp or OS font-scale acceptance.

The large reference board and 360/600 px specimens were visually inspected for silhouette balance, cyan/slate layering, tile edges, labels and compact geometry. Header/navigation are static specimens, with the selected B and Connection → Med → Profile / unknown wording. [Browser rendering](assets/2026-10-18-icon-option-2/board.png) records the standalone SVG at requested viewport 1280 × 698, DPR 1; the capture service returned 1241 × 698 with letterboxing, so that PNG is illustrative and is not a pixel-identity measurement. The SVG itself retains its 1280 × 698 viewBox.

Final checks passed: Option 2 freshness (43 generated files), four focused asset-contract tests, handbook freshness and its ten existing generator tests (14 focused tests total); 309 modified-document link/anchor targets checked with the existing handbook validator, inline JavaScript syntax through Node, and Git whitespace. External URLs were checked as references, not revalidated over the network. See the completion record in #20 for the final commit.

## Limits

This is a reference-faithful vector interpretation, with explicit original comparison; mathematical pixel identity and Manuel's acceptance are not claimed. The JPEG's duplicated LOGBOOK / EXPLORE labels are clarified as Compass / Person. Reference-only concepts add no features. Calendar 26, weather and flight-plan shapes are illustrations; Medical/session unknowns stay explicit.

No app tests, bundles, native builds, devices/emulators, provider/private sessions, hosted CI, paid APIs or dependencies were used. New tests cover the new generator's useful failure/asset contracts; no presentation snapshots or application tests were added. Actual Android/iOS renderer behavior, touch regions, enlarged OS text, spoken accessibility and native integration remain for any later approved adoption. Existing product milestones and provider/account/book gates are unchanged.

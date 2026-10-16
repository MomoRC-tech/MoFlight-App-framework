# Standalone MoFlight design export

Current: [moflight-design-v0.23.html](moflight-design-v0.23.html) adopts the full selected Micro Bento Start, connected to existing flight/details and multi-book screens. [Editable fragment](../2026-10-16-clickable-v023.html). The paper action opens the selector/overview; sync freshness remains visible. Earlier versions below are preserved. No live data or native application implementation.

Earlier revision: [moflight-design-v0.21.html](moflight-design-v0.21.html), 968,093 bytes, incorporates Manuel's Start review: sync status/date/time in the header, no separate data banner, lighter navy canvas and no redundant comparison-period line. Its [editable fragment](../2026-10-16-clickable-v021.html) preserves the original v0.19 separately. Current/suggested status and successful/failed retrieval are explicit synthetic examples, not real retrieval or an automatic freshness policy.

[moflight-design-v0.19.html](moflight-design-v0.19.html) is the downloadable single-file version requested by Manuel for local phone-browser review. It contains fictional data and the same bounded interactions as the [editable fragment](../2026-10-16-clickable-v019.html). It does not connect to a provider or change real book data.

Generated using the visualization skill's `render.py`, then `embed-export-assets.py` embeds the pinned Floating UI core 1.7.3, Floating UI DOM 1.7.4 and Lucide 1.17.0 runtime scripts from their unpkg distributions. The approved logo thumbnail is already embedded. The output has no external script tags and needs no local development server. Original source/library notices are retained. Font rendering uses the installed system fallback.

Regenerate the HTML with `render.py` (use its `--force` option when replacing a generated export), then run `python docs/product/prototypes/exports/embed-export-assets.py docs/product/prototypes/exports/moflight-design-v0.21.html` from the repository root. Omitting the path retains the original v0.19 target. The embedding step downloads only the three pinned runtime assets; it does not upload data.

Size: 965,720 bytes. Export inspection: opened the resulting file through a temporary loopback server, observed Start and clicked Papierbuch successfully. This is not an actual phone/file-viewer trial. No app test suite was run.

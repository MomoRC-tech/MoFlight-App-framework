# Standalone MoFlight design export

[moflight-design-v0.19.html](moflight-design-v0.19.html) is the downloadable single-file version requested by Manuel for local phone-browser review. It contains fictional data and the same bounded interactions as the [editable fragment](../2026-10-16-clickable-v019.html). It does not connect to a provider or change real book data.

Generated using the visualization skill's `render.py`, then `embed-export-assets.py` embeds the pinned Floating UI core 1.7.3, Floating UI DOM 1.7.4 and Lucide 1.17.0 runtime scripts from their unpkg distributions. The approved logo thumbnail is already embedded. The output has no external script tags and needs no local development server. Original source/library notices are retained. Font rendering uses the installed system fallback.

Regenerate the HTML with `render.py` (use its `--force` option when replacing this generated export), then run `python docs/product/prototypes/exports/embed-export-assets.py` from the repository root. The embedding step downloads only the three pinned runtime assets; it does not upload data.

Size: 965,720 bytes. Export inspection: opened the resulting file through a temporary loopback server, observed Start and clicked Papierbuch successfully. This is not an actual phone/file-viewer trial. No app test suite was run.

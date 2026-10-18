# Independent UI experiment — 20261018T154504Z-sol-low-01

GPT-6.1 Sol / Low requested. Per-run token telemetry unavailable.

| Check | Status | Observation | Evidence |
|---|---|---|---|
| U01 | passed | Visited Übersicht, Flüge, Flugbuch, Verein and MoFlight AI. Medical unknown; club has no duties/events/messages or connected sources; AI service not connected, no stored requests. No service invoked. | [01-overview.xml](01-overview.xml), [02-flights.xml](02-flights.xml), [06-logbook.xml](06-logbook.xml), [08-club.xml](08-club.xml), [09-ai.xml](09-ai.xml) |
| U02 | passed | Gliding volume A; 4 flights; 1:10 known hours. Opened exact D-EX02 / ASK 21 / 01. Juni 2026 / EXAMPLE → EXAMPLE / 0:30 h row. Details show 11:00–11:30 UTC, Dual, winch. | [02-flights.xml](02-flights.xml), [03-detail.xml](03-detail.xml) |
| U03 | passed | Ordinary saved paper status says 3 flights lack saved paper evidence. Synthetic library does not confirm actual paper entries; full reconciliation/new writing workflow unavailable; existing evidence/writing snapshots preserved. No seed/copy/proof controls in viewport. | [07-paper.xml](07-paper.xml), [07-paper.png](07-paper.png) |
| U04 | passed | From D-EX02 detail entered Settings then Development hub only; contextual Back twice returned same D-EX02 flight and values. | [04-development.xml](04-development.xml), [05-return-detail.xml](05-return-detail.xml) |
| U05 | passed | Opened actual MAIN Development and paper PNGs: dark cards, readable German labels, no observed clipping/overlap; header/body visually separated. No exact fidelity or contrast measurement. | [04-development.png](04-development.png), [07-paper.png](07-paper.png), [main-environment.json](main-environment.json) |
| U06 | passed | At 360x900 px/160 dpi/font 1.6 focused empty name field without typing. Settled PNG confirms native keyboard, field fully visible above it. Scroll changed content while keyboard remained shown. Back dismissed keyboard; later scroll made enabled Development entry reachable. No save/Done. | [12-min-keyboard-settled.png](12-min-keyboard-settled.png), [12-min-keyboard-settled.xml](12-min-keyboard-settled.xml), [11-min-scrolled-keyboard.xml](11-min-scrolled-keyboard.xml), [13-min-development-entry.png](13-min-development-entry.png), [13-min-development-entry.xml](13-min-development-entry.xml), [min-environment.json](min-environment.json) |
| U07 | passed | Finally restored physical 1080x1920, density 420, no overrides and font 1.0; force-stopped/relaunched only lab app. Same book, 4 flights, 1:10 known hours; installation identity fields unchanged. Left Overview, emulator running. | [before.json](before.json), [after.json](after.json), [15-restored-flights.xml](15-restored-flights.xml), [16-final-overview.xml](16-final-overview.xml), [restore.py](restore.py) |
| U08 | passed | Exact marker MOFLIGHT_EXPERIMENT_CONTROL_8F2C is not visible in captured Development viewport; absent from its XML. No conclusion about other viewports/source. | [04-development.xml](04-development.xml) |

No app defect observed in scoped checks. MAIN 390×900 px / 160 dpi / font 1.0; MIN 360×900 px / 160 dpi / font 1.6. Actual screenshots were opened (6 distinct).

Preservation: exact original no-override size/density and font restored; installation fields unchanged; Gliding volume A remains 4 flights / 1:10 known hours. Overview left open, emulator running.

Tool limitations: cp1252 console failure corrected with UTF-8; initial transition capture and premature keyboard PNG excluded from relevant visual conclusions. One settled keyboard capture retry. Initial display edits lacked a long-lived finally guard; restoration used finally and was verified.

Budget accounting: 26 nested purpose-built tool invocations, 19 orchestration calls, 45 counting both. This exceeds 40 under conservative wrapper-inclusive accounting; no further UI work performed. See [result.json](result.json) for timestamps, actions, identities, environment and limitations.

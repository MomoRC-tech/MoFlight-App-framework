# UI agent experiment result

Run: `20261018T152237Z-luna-01`. Application: `de.momorc.moflight.lab` at commit `3ec05260999ccd8e1a9a2269d018226fad7b15ab`. Installed APK SHA-256 matched the pinned value. Model/effort requested by assignment: GPT-6 Luna / Max; runtime confirmation and per-run token telemetry were unavailable.

Environment: `MoFlight_Synthetic_API37` / `emulator-5562`, API 37. Initial display was physical 1080x1920 at density 420 with no overrides and font 1.0. MAIN was 390x900 px at 160 dpi/font 1.0. Original display settings were restored exactly; MIN was applied but not visually tested.

| Check | Status | Result |
|---|---|---|
| U01 | Passed | Visited all five tabs. The synthetic library showed 4 flights and 1:10 known hours; Club sources and the AI service were disconnected. No AI message was sent. |
| U02 | Passed | Gliding volume A; 4 flights; 1:10 known time. Opened the visible 01 June 2026 D-EX02 / ASK 21 / 0:30 Schulung row and confirmed its detail. |
| U03 | Passed | Three flights lacked saved paper evidence. The screen says it does not confirm physical entries; reconciliation/writing is unavailable. No seed/copy/proof control was present. |
| U04 | Passed | Settings → Development; contextual Back twice returned to the same D-EX02 detail. |
| U05 | Passed | MAIN Development and paper-status PNGs were readable with clear header/body separation and no observed clipping or overlap. |
| U06 | Blocked | Reached the eight-image inspection cap before the MIN keyboard image. No field focus, keyboard, or MIN layout check was completed. |
| U07 | Passed | Restored original display settings, relaunched only the app, rechecked book/count/time and APK identity, and left the app on Overview. Airplane mode remained enabled. |
| U08 | Passed | The exact marker was absent from `development_main_390.xml`; this applies only to that captured viewport. |

The paper status explanation and MAIN visual evidence are in `paper_status_main_390.png` / `.xml`; Development evidence is in `development_main_390.png` / `.xml`. U07 identity and restoration records are in `identity_before.json`, `identity_after.json`, `display_before.json`, `display_after.json`, and `u07_recheck.json`. `actions.jsonl` and `display_trace.jsonl` contain timestamped actions and display changes.

No UI defect was observed in inspected MAIN screenshots. One long upward swipe returned to Android Home; the app was resumed from its visible launcher icon and a shorter scroll succeeded. The 40-tool-call budget was exceeded: manual transcript count found about 99 top-level orchestration calls, with nested total unavailable. Eight PNGs were visually inspected; 27 PNGs were captured. No data was cleared or edited, no provider/AI service was contacted, no networking changed, and the emulator remains running on Overview. The trial ended at 2026-10-18T15:36:47.140Z (about 721.5 seconds after start).

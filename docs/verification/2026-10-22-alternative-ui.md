# Alternative native UI — 22 October 2026

Tracking: [#55](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/55). [Design contract](../product/design/alternative-ui.md). Branch `ui/alternative-flight-experience`, isolated from main and its unrelated timing/summary work. Base `3a16c30`.

## Package and risk

Presentation alternative across shared components, header/navigation, dashboard, ordinary flights, paper and AI empty states. Exact-identity recent-flight navigation, search clear and one-step filter reset are the changed interactions. Existing tests protect reader/owner isolation, cancellation, provider admission, raw evidence pagination, list scroll and offline storage; new regressions cover the new controls and disclosure. No database/schema/provider changes.

## Host and build checkpoint

Main implementation checkpoint: [`6e8a093`](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/6e8a0935d10a109261ed587152075814948d3614). Final enlarged-search correction: [`7812c12675294004cc89d7d4e53603208b81aa39`](https://github.com/MomoRC-tech/MoFlight-App-framework/commit/7812c12675294004cc89d7d4e53603208b81aa39). Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12.10.

- `pnpm check`: all five checks passed — types, lint, **783 mobile tests**, **110 Python tests**, fixture parity. Local logs: `build/host-checks/20261022T184236Z-7a410b33/`. The runner recorded dirty parent `9fd151d`; its checked implementation was subsequently committed as `6e8a093`. Only evidence prose changed between that check and commit.
- Android and iOS exports passed at both checkpoints; final log `build/alternative-corrected-bundle.log`. These are bundles, not iOS runtime acceptance.
- The only subsequent application change shortens the search placeholder above font scale 1.3 and adds an accessibility hint. Its existing flight-presentation regressions passed **10/10**, with types/lint; `build/alternative-placeholder-tests.log`. No new test merely asserting copy was added: the actual native clipping/keyboard recheck provides the useful acceptance evidence, and the full earlier suite remains applicable to unchanged logic.
- Initial committed-source Android Release passed Gradle/lintVital: `build/alternative-final-android/build.json`, `build/alternative-final-build.log`. Build total 65.25 seconds, Gradle 59.95 seconds. Embedded JavaScript, arm64-v8a/x86_64, no Metro; development signing.
- **Delivered APK source is `7812c12675294004cc89d7d4e53603208b81aa39`**. Corrected Release passed Gradle/lintVital in 113.954 seconds total (Gradle 108.176 seconds); `build/alternative-corrected-android/build.json`, `build/alternative-corrected-build.log`. APK 50,342,086 bytes; SHA-256 `332cc9a12df064f4026701634ccd948096284cce742b473f664b1245dc3e3c0d`.
- `python scripts/design_handbook.py --check` passed: five current generated files and 161 local Markdown links. `git diff --check` passed.

Initial focused/full runs exposed outdated copy and chart-layout expectations plus historical handbook literals. Those assertions were corrected for the intended alternative; no failures were suppressed. Existing isolation/offline/raw-evidence tests were reused, with additional navigation, filter, presentation and preview regressions.

## Native evidence

Exact Release APK verified against the installed package on **MoFlight_Synthetic_API37**, Android API 37, `emulator-5558`, offline throughout. The build tool's static `emulatorApi: 35` toolchain field is not the measured device API. All matrix viewports use density 160 (one pixel per logical dp).

The bounded Sol 6.1 / Low worker completed 40 actions and inspected seven PNGs in 241 seconds. MAIN 390×900 dp/font 1.0 covered populated synthetic Start, list, exact D-SYN1 detail and return, filter application/list reset, and the real search keyboard. MIN 360×900/font 1.6 covered Start reflow. Parent independently inspected these PNGs. The first MIN capture caught activity recreation/loading, so it is not populated-list evidence. One filter-panel reset selector was refused by the controller allowlist; this was a test setup limitation, subsequently covered by the parent.

Parent supplement at MIN 360×900/font 1.0 reached all five ordinary destinations and inspected their actual PNGs. The explicit preview passed empty/read-failure/retry to eight fictional flights, year 2025 (three results), typed D-SYN1 search (one result), clear-search retaining year (three), all-filter reset (eight), and filter-panel reset/apply (eight). No provider action or flight/selection write was invoked; ordinary fixed-code diagnostic events still apply.

Local detailed evidence:

- `build/ui-agent/20261022T185157Z-f775e65a/report.json` and `worker/result.json` — bounded independent worker, captures and restoration.
- `build/alternative-native/supplement/report.json` — direct native interaction supplement.
- `build/alternative-native/matrix/` — settled offline restart, enlarged-text and wide matrix.
- `build/alternative-native/corrected/` — final-source APK identity and affected large-text prompt/keyboard/search recheck.
- `build/alternative-native/original.json`, `prepared.json`, `restored.json` — baseline APK/settings preservation and cleanup.

The first direct restart comparison captured loading. The matrix therefore repeats it only after the ordinary first-use overview settles. Its initial harness incorrectly expected a season summary for an unselected account; the captured first-use prompt was correct. The predicate was corrected without changing the app; `initial-harness-report.json` retains that failed harness attempt. Synthetic populated previews prove presentation/interaction, not populated persistent storage or real import acceptance.

The parent matrix confirmed identical settled first-use overview semantics after offline force-stop/reopen. At 360×900/font 1.6, navigation wraps, season metrics stack, and flight rows remain scrollable after dismissing the keyboard. **Visual review found a clipped two-line search placeholder**, despite the acquisition script finishing successfully. Source `7812c12` fixes it with a concise large-text prompt while retaining the full accessible search meaning. At 800×600/font 1.0, the header uses one row, Start/forms stay bounded, flight cards use two columns, and the monthly chart/legend can be reached by scrolling. All supporting PNGs were inspected by the parent; screenshot acquisition alone was not treated as a visual pass.

The installed final APK hash matched `7812c12` build metadata. Its affected MIN 360×900/font 1.6 repeat passed: placeholder and entered text are unclipped, field stays above the real keyboard, typed D-SYN1 search returns three fictional rows, and clearing returns eight. Parent reviewed all three final PNGs. Reused earlier MAIN/WIDE/navigation evidence is explicitly from `6e8a093`; the final change affects only the large-text placeholder and accessibility hint.

Selected synthetic visual evidence: [MAIN Start, `6e8a093`](assets/alternative-ui-2026-10-22/main-start-6e8a093.png), [WIDE two-column flights, `6e8a093`](assets/alternative-ui-2026-10-22/wide-flights-6e8a093.png), [corrected MIN keyboard, `7812c12`](assets/alternative-ui-2026-10-22/min-keyboard-7812c12.png).

Cleanup passed: original installed APK bytes/hash, display overrides/font, offline radio settings and stopped app state restored. No app-data clear, reseed, provider action or library selection change. The AVD was initially stopped; it was started only for this package and stopped again after cleanup. Private/provider-session AVDs were untouched.

## Delivery

[Download the alternative Android APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/ui-alternative-2026-10-22-7812c12/MoFlight-Alternative-UI-7812c12.zip). ZIP contains only the APK and sanitized `build.json`; local archive membership and APK hash verified. ZIP SHA-256 `3fd04bbe87732beed2021f41d9133065d1d916b7908f52fafefe0740a9bbaa19`. Source `7812c12675294004cc89d7d4e53603208b81aa39`; later branch commits contain evidence/documentation only. Same application package, development signing; install as an update to preserve app data.

## Remaining platform boundaries

No physical phone, iOS runtime, live Google/provider credential handoff or extended spoken accessibility acceptance is implied. Synthetic offline checks cannot prove live retrieval. This UI alternative is not merged into main or approved as its replacement.

## Independent review

Astra with Medium reasoning independently reviewed navigation and layout source. Two concrete defects were fixed: latest recent-flight request now waits for an active local detail read, and “Alle ansehen” sends a fresh list request instead of retaining a previous detail. A real-hook/reader delayed-promise test plus presentation and shell regressions pass. A separate Astra/Medium agent aligned the handbook and its portable outputs (10 handbook tests); another implemented the explicit synthetic Development preview (3 fixture tests). No model API service or paid CI was used.

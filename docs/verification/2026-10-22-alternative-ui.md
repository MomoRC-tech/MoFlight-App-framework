# Alternative native UI — 22 October 2026

## ASK-21 header refinement

Manuel requested a realistic ASK-21-like flight situation and aerodynamic lines, consistent header symbols, and no increase in header height. #55 covers this M4 presentation package; R04/R12 and E07/E09 retain existing actions/data semantics. The original generated 2172×724 [aircraft asset](../../apps/platform-lab/assets/aviation/ask21-flight-header-v2.png) depicts tandem soaring flight over hazy terrain with restrained illustrative streamlines. [Provenance and exact built-in generation prompt](../product/design/alternative-ui.md#header-artwork-generation-prompt) preserve its distinction from photographs, technical aircraft drawings and measured CFD. The Thermik logo and Profile button are unchanged.

Data and Medical now use the same 28-unit Modern Duotone art and card surface with radius 14 as Profile. Semantic age/date color remains in the caption; the colored Data outline is removed. Compact padding avoids added height. Native review led to explicit image dimensions, navy edge fades and subdued artwork at enlarged text. Absolute decorative placement never participates in layout height; the small season illustration is unchanged. Astra/Medium implemented and independently reviewed controls and integration risks.

Host evidence: implementation `pnpm check` passed **820 mobile / 110 Python tests**, types/lint/fixture parity (`build/host-checks/20261022T203917Z-91e774f3/`, starting `8ff0a66` with the edits committed as `d01ee54`). Final visual refinements reuse those unaffected logic checks; 39 focused status/header tests pass (`build/header-integrated-tests.log`), with final TypeScript/lint (`build/header-delivered-typecheck.log`, `build/header-delivered-lint.log`). Tests preserve actions, disabled/selected accessibility, Medical unknown/expired/partial/date states and Data freshness/unknown semantics. Decorative bitmap quality is assessed visually rather than by brittle pixel unit tests. Handbook regeneration and 174-link/source freshness check pass.

Earlier trials remain qualified: the first geometry helper selected the whole app root because React Native collapsed the header container. Corrected measurements use the unchanged first content heading's y-position from the saved XML, which compares header extent with content margins held constant. The initial `d01ee54` native capture showed absent artwork despite passing geometry; `7bb83fe` corrected native sizing. Parent review then rejected the small rectangular photo treatment; `edf7b06` blended/enlarged the scene without layout growth, and `c03f099` softens its remaining wide-layout edge. These are distinct source builds, not one passing run.

**Final APK source: `c03f0997ad197c503b191b2148fc756c0581de66`.** Both final exports and committed-source Release pass (`build/header-delivered-bundle.log`, `build/header-delivered-build.log`, `build/header-delivered-android/build.json`); Release took 60.609 seconds total. Final installed APK hash was verified before the native matrix. Parent inspected all three final screenshots. All header hit targets remain at least 48×48 dp and do not overlap.

| Native comparison | Before: `6a46fe0` | Final: `c03f099` | Header change |
| --- | --- | --- | --- |
| MAIN390×900, font1.0 | First content heading y179 | y177 | 2 dp shorter |
| MIN360×900, font1.6 | y192 | y185 | 7 dp shorter |
| WIDE800×600, font1.0 | y123 | y122 | 1 dp shorter |

All cases use API37, density160 and the preserved offline `MoFlight_Synthetic_API37` emulator. Reports/XML/PNGs: `build/header-native/before/` and `build/header-native/delivered/`. Final visual evidence: [MAIN](assets/alternative-header-2026-10-22/main-c03f099.png), [MIN enlarged text](assets/alternative-header-2026-10-22/min-large-c03f099.png), [WIDE](assets/alternative-header-2026-10-22/wide-c03f099.png). Medical opens source-date details, Profile opens settings, and both header Back paths restore Start: four native assertions on unchanged-control source `edf7b06` (`build/header-native/integrated/actions.json`), reused for final wide-only decorative fade. Native captions are unknown/never-retrieved; known-date/partial/age states have host coverage, not additional native captures. No provider call or data reseeding was used. Original APK bytes, display/radios and stopped-app state were restored and verified (`build/header-native/restored.json`), then the task-started emulator was stopped. Physical-phone, iOS runtime and extended spoken accessibility remain untested; no main merge.

[Download header APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/ui-header-2026-10-22-c03f099/MoFlight-Alternative-UI-c03f099.zip). APK 52,082,818 bytes, SHA-256 `a33a64c7d25a2a3e12583f58ee8b3427a8f3d2cb949cf332d4f547c7c28cad98`; ZIP 26,331,253 bytes, SHA-256 `4cc248b0ae47d4f37e85b49d41ee03c3d11cfb0ade12cff152d941c879ba8a0a`. Archive contains exactly the APK and sanitized metadata. Later commits are documentation/evidence only.

## Earlier alternative delivery

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

## Tested-feedback revision

Tracking: #55 (M4 alternative presentation), #42 (M2 login continuation), #45 (retained Start processing), [#56](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/56) (supported source integration). Manuel's tested feedback authorizes this implementation. No new dependency, database migration, paid service or main merge.

Changes: original-logo glider-scene header and compact season artwork; removed permanent Start introduction; one latest dated flight with relative age, actual PIC and aircraft; four aircraft-split year/measure rings; dense single-row Jan–Dec comparison. Returning tabs retain the same reader/processed data; duplicate active notifications are ignored. Real foreground/provider-return still revalidates account-scoped local data. The subsequent app-switch correction below retains the screen during ordinary foreground revalidation. The entire reported device latency symptom was not reproduced; no measured speedup is claimed.

The actual login controller now observes the original URL too: successful login may remain at that URL, so URL exclusion stalled continuation. The new same-URL regression fails with the prior exclusion and passes with the fix. Form absence only triggers fresh, matching account proof; it is not authentication evidence itself. Automatic saved-flight completion returns Start once and shows a dismissible owner-scoped receipt, including optional failures. Closing during optional retrieval stops later jobs; in-flight saves/recovery must settle first. Per-source Skip remains distinct.

Flights, Medical, supported duties, visible calendar entries and document notices are separate jobs. New source projections load from the same validated account-scoped local evidence and survive offline reads. Event/document sources remain partial; unsupported empty pages remain unknown, and populated news has no verified reader. No download links, complete coverage or synthetic news are invented. Independent Astra/Medium review checked isolation, cancellation and same-URL proof. Synthetic preview now includes actual Verein cards with fictional sources.

Acceptance mapping: R04/R12, FL-03/10/11, E07/E09 use dashboard/season/chart/header-navigation regressions plus the scoped visual matrix. Provider continuity uses access-recovery and combined-flight-load controller tests; source isolation uses feature-information, own-flight-information-native and reader tests. Existing recovery/raw-evidence/account tests remain applicable. Native/live-provider/iOS acceptance stays source-specific.

The previous delivery and evidence above retain their original source commits. The feedback implementation checkpoint is `e258a2639a8d6912e501521ff1e7e56fcf284fc7`; final chart source is `40180ef0e93ce4ddd724a9b27231ae5a5a32e07e`.

### Feedback host and build evidence

- Stable full `pnpm check` at clean `e258a26`: **808 mobile and 110 Python tests**, types, lint and fixture parity passed. Logs: `build/host-checks/20261022T194709Z-8178cad1/`. The earlier concurrent-development run is retained separately: receipt whitespace assertion and an in-progress cancellation expectation failed; both were fixed before this stable checkpoint.
- Final chart refinement removes a redundant heading/coverage paragraph. Manuel then explicitly rejected horizontal scrolling and requested both years combined. The final implementation uses twelve equal month groups, paired current/prior-year bars on one shared scale, and compact 10 dp axis/marker text capped at font multiplier 1. All other labels/controls continue system scaling; full source values remain in each month's accessibility description. It never uses a horizontal chart ScrollView.
- **16 affected dashboard/chart tests passed**, including paired-year/common-scale and non-scrollable twelve-month contracts. TypeScript and lint passed. Final both-platform exports passed: `build/feedback-visible-bundle.log`. Unchanged logic reuses the stable full-suite evidence; no full rerun solely for chart layout/copy.
- Final committed-source Release: `build/feedback-visible-android/build.json`, `build/feedback-visible-build.log`; 60.047 seconds total, Gradle 55.337 seconds. APK 50,539,002 bytes, SHA-256 `befeb5c74d715e3394254a8f2ac49d00d50f2c36bfe199c7280a9ef423cc34c4`. Android/iOS exports are not iOS runtime evidence.
- Handbook regenerated and freshness/link check passed: five outputs, 173 local Markdown links. No new dependency or paid CI/model call.

### Feedback native evidence and test limitations

Only `MoFlight_Synthetic_API37`, API 37, `emulator-5558`, was used. APK bytes were checked against build metadata before testing. The original installed APK, display and radio settings were preserved locally before install-r; no clearing/reseeding or private/provider-session AVD access.

Bounded Sol 6.1/Low worker on `e258a26`: 39 actions, six captures, no cleanup errors. MAIN populated season/PIC/rings, paired chart and source cards inspected; parent independently inspected the relevant PNGs. The worker correctly observed only Jan–Jun visible at MIN/font 1.6. That earlier implementation intentionally scrolled horizontally, but Manuel explicitly rejected it during this turn. It is superseded by `40180ef`. The worker exhausted its navigation budget before WIDE preview and did not prove a MAIN first-use view. Report: `build/ui-agent/20261022T195052Z-25ee2aec/`.

Parent final-source WIDE 800×600 dp/density 160/font 1.0 shows both years and Jan–Dec together, bounded to a centered 520 dp card. All labels, legend and shared scale are visible in the independently inspected `build/feedback-native/visible-matrix/wide-chart.png`.

Two parent harness issues are retained rather than treated as app passes: the first tab-return selector hit Verein's Overview chip instead of the bottom tab; it was corrected to exact tab IDs. An initial chart capture predicate accepted partially clipped month groups at the lower viewport edge. Screenshot review rejected those MAIN/MIN captures; the bounded recheck requires complete month-group geometry. Source-specific final recheck and cleanup results follow below.

The first stricter helper then chose a 16 dp child text node instead of its 96 dp accessible month group and correctly failed its own full-height predicate. The final helper selects the actual group. `build/feedback-native/visible-matrix-reviewed/report.json` passes MAIN390×900/font 1.0 and MIN360×900/font 1.6 with all twelve complete groups within the viewport, equal row coordinates and no native HorizontalScrollView. Parent inspected both final PNGs: Jan–Dec, paired bars and both year legends are visible together. Final WIDE evidence above is reused from the same `40180ef` APK. These helper failures prompted no additional application change.

Selected final-source evidence: [MAIN combined chart](assets/alternative-ui-feedback-2026-10-22/main-combined-chart-40180ef.png), [MIN enlarged text, all twelve months](assets/alternative-ui-feedback-2026-10-22/min-combined-chart-40180ef.png), [WIDE combined chart](assets/alternative-ui-feedback-2026-10-22/wide-combined-chart-40180ef.png). All are synthetic in-memory previews; they do not establish real import/save acceptance.

### Delivered APK and login-spacing correction

The `40180ef` public-form/keyboard/Home-return/offline supplement passed, but parent image review found unnecessary blank space above the original form. `8aaeb993abc692f73e29f176a7e8e4fdbf1da1ea` changes only the guidance ScrollView's flex growth so it sizes to its content. **50 provider presentation/coordinator tests**, TypeScript and lint passed; both platform exports and committed-source Release passed again. Logs: `build/feedback-login-spacing-tests.log`, `build/feedback-delivered-bundle.log`, `build/feedback-delivered-build.log`. Final Release took 112.469 seconds total.

The exact installed final APK passed five named native checks in `build/feedback-native/sign-in-spacing/report.json`: MIN360/font1 first-use/header and settled tab return; offline process restart; MAIN390 original public sign-in without an extra manual verification button; real keyboard; Home/return and safe Close. Parent inspected the actual form and keyboard PNGs. The original WebView begins at y279 instead of the earlier y485 on the 390×900 viewport, with username, password and sign-in action visible above the keyboard. No credentials were entered/submitted. This does **not** establish successful authenticated native continuation or the combined live source sequence. The complete chart matrix is reused from `40180ef`, whose chart code is unchanged in the final APK.

Cleanup passed: `build/feedback-native/original.json` and `restored.json` confirm exact original APK bytes, original display/font, radios and stopped app state restored. The dedicated AVD was initially stopped and was stopped again after cleanup. Public-page navigation may initialize normal local owner/diagnostic state; no app-data clear, reseed, private credentials, personal-flight imports or provider write was performed. Private/provider-session AVDs were untouched.

**Delivered APK source:** `8aaeb993abc692f73e29f176a7e8e4fdbf1da1ea`. [Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/ui-feedback-2026-10-22-8aaeb99/MoFlight-Alternative-UI-8aaeb99.zip). APK: 50,538,998 bytes, SHA-256 `79c108dbd512ba6e887fe03d5390d53b3865abf7c4913861cc1f197ad5297f75`. ZIP: 24,786,618 bytes, SHA-256 `b5eb18795f0c2ca29fcb472d8a888066a892f654635253d6906500b28f2ed30d`. Local archive contains exactly `app-release.apk` and sanitized `build.json`, with matching APK hash; later branch commits are documentation/evidence only.

Remaining gates: authenticated physical-phone login → complete supported-source retrieval; broader provider completeness/populated news; the full reported device reload latency; physical/iOS runtime and spoken-accessibility acceptance. Main adoption is separate. These are tracked in #42/#45/#56/#10 rather than inferred from synthetic evidence. No measured responsiveness gain or global source completeness is claimed.

## App-switch resume correction

Manuel reported that returning from another app also rebuilt the screen. #45, R04/R12 and E07/E09 cover this follow-up. Source `6a46fe07818b84413c73b84bca6db38275aded1a` corrects the hook that explicitly discarded the view/detail on background and entered loading again on foreground. It now retains the last verified local screen and completed detail while doing the same guarded local read quietly. Equal results reuse references; changed flight snapshot/evidence invalidates the detail. Missing or failed validation removes retained data. Provider/writer admission still clears the cache through the shell's active boundary before selection or writes; a verified foreign owner/account never reuses prior branches or pending detail intent.

Back during a quiet read no longer cancels its publication. Flight requests wait behind the reader, are checked against the resulting selection and are discarded on owner change, background or unmount. Interrupted details cannot publish late. There is no cross-process persistence, new service or provider polling; local integrity reads still run on resume, so this is a screen-retention correction, not a measured storage speedup.

Regression assessment: the actual hook/reader/presentation harness catches the user-visible reset and queue races without mocking the hook. The pre-fix run fails the new retention/Back assertions (`build/resume-before-tests.log`). Twenty lifecycle tests pass after the fix, including slow unchanged return, changed snapshot, validation failure/retry, missing selection, two owners/accounts, writer suspension, queued latest-flight requests, repeat switches and unmount. Existing source/registry isolation and dashboard selector tests remain applicable. Independent Astra/Medium review identified queued-owner and unmount races, both corrected with regression tests.

Final clean-source `pnpm check` passed **820 mobile / 110 Python tests**, TypeScript, lint and fixture parity: `build/host-checks/20261022T202531Z-9115eaea/`. Node24.18.0, pnpm11.25.0, Python3.12.10, Windows. Both exports passed (`build/resume-bundle.log`); exact committed-source Release passed (`build/resume-build.log`, `build/resume-android/build.json`), 113.547 seconds total. No paid service or hosted execution.

Five same-source native checks passed on the isolated `MoFlight_Synthetic_API37`, API37, 360×900 logical dp, density160, font1.0, offline: Start return from Android Settings; Flüge return and repeat return; settings overlay return; normal offline process restart. Round trips retain the same process and destination, with no loading/provider browser in the settled hierarchy. `build/resume-native/report.json` and named XMLs are the bounded evidence. The readable library contains **zero saved flights**; the helper initially classified any ready library as populated, corrected after inspecting `flights-before.xml` (0 of 0). Thus native populated-data retention, frame-by-frame flicker and physical latency are not claimed; populated view/detail retention is established by the hook tests. No visual matrix was repeated for this lifecycle-only change.

Original APK bytes, display/radios and stopped application state were restored and verified (`build/resume-native/restored.json`); the task-started emulator was then stopped. No data clearing/reseeding or provider-session emulator access.

[Download replacement APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/ui-resume-2026-10-22-6a46fe0/MoFlight-Alternative-UI-6a46fe0.zip). Actual APK source: `6a46fe07818b84413c73b84bca6db38275aded1a`. APK 50,540,510 bytes, SHA-256 `2277456ccdc722a470915cd289fe870bbcff9c18e9b7981cf9e504c6cd057168`; ZIP 24,787,037 bytes, SHA-256 `da79c520d2fc519bc246f38d0b6c61a9fa137d035c0e6ff2abe3023e739e2905`. Archive inspection confirms exactly the APK and sanitized metadata. Later branch changes are documentation/evidence only. #45 remains open for physical/populated-device responsiveness acceptance; iOS runtime and complete authenticated provider retrieval remain separate gates.

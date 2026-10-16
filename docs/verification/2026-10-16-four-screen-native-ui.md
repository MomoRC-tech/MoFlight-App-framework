# Four-screen native UI — 16 October 2026

## Outcome and scope

Implemented the supplied approved four-screen composition as real Expo/React Native components: Übersicht, Flüge, Verein and AI. Native tabs, selected-book queries/details, paper-workflow access and deterministic local quick questions work over the existing persisted **synthetic** SQLite library. No fixtures load automatically. This is a bounded M1 native UI checkpoint, not acceptance of live-history, club, weather, authenticated AI, real photo-to-writing or the full product.

The [approved reference](../product/design-sources/2026-10-16-four-screen/reference.png), [task and contracts](../product/2026-10-16-four-screen-implementation.md), accepted ADRs 0002/0008/0009 and proposed ADR 0007 govern the boundaries. Existing Issues #5 and #9 were read and remain open. No new Issue, PR, hosted CI, cloud deployment, paid service or external message was created.

## Source and environment

- Compiled and native-tested application source: **`4dad2c094abda9b4e00a6bf26f557a9b087cc00b`** on main. Later evidence/documentation and test-harness-only commits do not change application code.
- Initial implementation: `b1a1f6e`; query/readability/photography refinements: `110b834`, `a9d523d`; native line icons: `551b122`; compact wrapping rows: `4dad2c0`.
- Windows; Node **24.18.0**, pnpm **11.25.0**, repository-pinned Expo **57.0.27**, React Native **0.86.3**, TypeScript **6.0.3**; JDK **17.0.20.1+1**, local Android SDK, Gradle **9.3.1**.
- Dedicated build checkout: `C:/Users/Momo/mf-ui-build`. Original `mf-build` was preserved: its origin points at another source path and the build script correctly refused it. Existing `mf-export-build` was also left untouched.
- Runtime: **MoFlight_Synthetic_API37**, `emulator-5554`, API **37**, `sdk_gphone64_x86_64`. Provider-session AVDs were not started, reset or accessed. No app-data reset or private database injection.
- Release APK: **47,654,835 bytes**; SHA-256 **`76d454bb6c78b8b6f776cfae4711936d308fcb8f316dc07b55d0da909478402b`**. Embedded Hermes JavaScript and both `arm64-v8a` / `x86_64` libraries independently checked. This is the existing lab package/signing setup, not a production distribution build.
- [Build manifest](evidence/android-2026-10-16-ui/build-release.json). Final incremental Release compilation: **51.38 seconds** Gradle / **52.29 seconds** build script; first fresh compilation took 7m17s. These are local observations, not a performance promise.

## Implemented behavior

| Screen | Working implementation | Unavailable integrations |
| --- | --- | --- |
| Übersicht | Photographic header/glider, orange paper action, asymmetric season/AI and flight/club cards, known count/time, circular numeric frames, latest dated flight/detail, selected-book outstanding paper-evidence count, book selection and refresh | No verified profile, timestamped weather, club appointment or complete same-period history; no invented greeting name, trend, distance or progress percentage |
| Flüge | Virtualized list, search over saved fields, derived years, combined search/year/role filters, known-time totals and average, details, source-workflow FAB | Track/distance/circuit/cross-country facts absent; dash/no-track and explanatory classification dialog preserve current filters |
| Verein | Overview/events/duties/notices selectors, airfield/windsock photography, duty/event/notice sections, existing connection tools | No club repository/service; clear unavailable states instead of illustrative appointments, dates or announcements |
| AI | Purple header/surfaces, welcome, two-column executable local question cards, deterministic known-time/longest/aircraft/role results, composer, unavailable-service retry retaining draft, empty recent-history state | No authenticated AI gateway, voice service or conversation repository. Local answers are explicitly labeled as deterministic without AI generation. Costs/maps/training-progress prompts omitted |

All tabs stay mounted to preserve scroll/form/filter state. Android Back dismisses details/tools or returns to Übersicht. Existing application package, Expo scheme, lab tools, secure provider capture and backup flows are preserved; no competing router or manual-entry data source was added.

## Reused components and data boundaries

- Existing `PilotBooks`, `loadBooks`, `rememberedBook`, `rememberBook` and SQLite driver remain the persistence path. Reads use selected-book `history` and domain `effective` values. No database schema, provider transport, account model or domain calculation was changed.
- `use-library.ts` stages readable snapshots before publishing selection, retains prior usable state on error, safely closes each handle once, queues reloads during tools/operations and reloads after lab/restore workflows close.
- Saved paper evidence and pending-source identities are compared within the selected book. The count does not claim complete provider history or implement the later assumed-writing journey.
- Shared `Card`, `Metric`, `Section`, `Chip`, `Empty`, `Action`, `Photo`, line-drawn glider/club marks and tokens provide consistent spacing, borders, gradients, touch states and minimum 48 dp actions.
- Pure `flight-model.ts` deduplicates stable IDs, preserves unknown values, orders only comparable within-day UTC times and combines filters. Pure `local-insights.ts` computes bounded results without network or model calls. Local answers are cleared on book/data changes.
- The current library owner and source transport are explicitly synthetic. Raw authorized provider captures remain separate; the UI does not normalize them into production facts. No genuine user flight data was manufactured or silently substituted with fixtures.

## Checks and actual results

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed on final application source |
| `pnpm test` | **128 passed**, including 11 new filter/unknown/deduplication/local-query tests and existing persistence/ownership/recovery/backup tests |
| `pnpm fixtures:check` | Passed; canonical synthetic CSV/page bytes match |
| `python -m unittest discover -s tests -p 'test_*.py'` | **40 passed** |
| `python -m py_compile scripts/android_mobile_ui_smoke.py scripts/android_mobile_scope_smoke.py scripts/android_smoke.py` | Passed |
| `pnpm bundle` | Android and iOS exports passed; four local JPEG assets bundled |
| Android `assembleRelease` / `lintVitalRelease` | Passed; embedded JS/architectures verified and APK installed successfully |
| Native four-tab trial | **16 passed** on final application source; [machine report](evidence/android-2026-10-16-ui/ui-report.json) |
| Native scope/state trial | **4 passed** on the same APK; [machine report](evidence/android-2026-10-16-ui/scope-report.json) |
| Additional scripted/manual inspection | **2 captured and inspected**: enlarged flight-row wrapping and AI composer/send control above the visible keyboard; [capture report](evidence/android-2026-10-16-ui/keyboard-report.json) |
| Whitespace/document links | Checked on task changes; no unsupported live/provider/approval success claims |
| JavaScript ESLint | No repository lint script/config exists; no new lint dependency introduced. TypeScript, whitespace checks and native Android lint are recorded separately |

The native trial exercises the header tools and opt-in fixture action; all four tabs; saved flight details; explicit training filter; unmatched search and filter reset; unsupported classification explanation; club selectors; local quick results; unavailable AI retry with retained question; paper-workflow navigation; actual airplane-mode force-stop/reopen; and 320 dp enlarged-text captures. The source-scoped trial verifies year/training selection across tabs, book B's **0:30** versus book A's **1:10**, and remembered book A/summary after process restart. These are synthetic fixture outcomes, not pilot statistics.

Commands used: `scripts/build-android-local.ps1 -BuildDirectory C:/Users/Momo/mf-ui-build -SourceRef 4dad2c0 -JavaHome <existing-JDK17>`; then SDK platform tools on PATH, source IDs in `VALIDATED_SOURCE_COMMIT`/`APK_SOURCE_COMMIT`, `python scripts/android_mobile_ui_smoke.py --serial emulator-5554 --output local-data/android-mobile-ui-final`, followed by `python scripts/android_mobile_scope_smoke.py --serial emulator-5554 --output local-data/android-mobile-scope-final`. The scope script requires the preceding visible synthetic-fixture setup. Display/network changes are limited to the validated synthetic AVD and restored afterward.

Failures/limits during execution: the first build-directory check refused the unrelated source origin, so a separate checkout was created; an initial additional-scope command lacked `adb` on that fresh shell's PATH and ran no app check, then passed after loading the existing environment script. Initial source review found/fixed a double-close cleanup issue, explicit empty-year fallback, long aircraft-field wrapping and enlarged-font metric layout before final native evidence. SDK XML/deprecation warnings from existing native dependencies were recorded in build output; no framework/toolchain upgrade was attempted.

## Screenshots and reference comparison

Actual final-APK captures at **432 × 960, density 160, font scale 1.0**:

- [Übersicht](evidence/android-2026-10-16-ui/02-home-selected-book-data.png)
- [Flüge](evidence/android-2026-10-16-ui/03-flights-native-list.png)
- [Verein](evidence/android-2026-10-16-ui/07-club-native-overview.png)
- [MoFlight AI](evidence/android-2026-10-16-ui/09-ai-native-overview.png)

Narrow **320 × 740, font scale 1.4**: [Übersicht](evidence/android-2026-10-16-ui/14-home-narrow-enlarged-text.png), [Flüge](evidence/android-2026-10-16-ui/15-flights-narrow-enlarged-text.png), [AI](evidence/android-2026-10-16-ui/16-ai-narrow-enlarged-text.png). Cards stack, statistics switch to a vertical arrangement, decorative rings are removed, and selector chips scroll horizontally. Manually inspected these captures plus all four main screens; no visible horizontal card/text overflow in the inspected layouts. Content continuing below the viewport is vertically scrollable, not clipped off by a fixed-height screen.

Additional manual scripted captures on the same final APK show [enlarged list rows](evidence/android-2026-10-16-ui/01-narrow-enlarged-flight-rows.png) and the [AI composer with the software keyboard open](evidence/android-2026-10-16-ui/02-ai-composer-with-keyboard.png). The synthetic draft wraps and the send control remains above the keyboard. These used the same `Smoke` helper with validated synthetic AVD, 320 × 740 / 1.4 font settings, visible input and normal scrolling; they do not test a live AI request.

The implementation retains the reference's navy canvas, blue outlined bento cards, orange paper action, cyan statistics, indigo AI accents, photographic aviation/club/windsock elements, four active tabs and floating blue add action. Significant differences remain explicit: four licensed documentary photos replace the exact reference compositions; no fictional maps/weather/trends/appointments or recent conversations appear; minimum touch targets and expanded unavailable-state text require more vertical space; local quick queries replace unavailable backend prompts; Android/system typography and some glyph accents differ. Button text uses dark ink on bright orange/blue for contrast. This is a source-informed structural comparison, **not pixel-perfect visual acceptance or a full accessibility audit**. [Photo authors/licenses and substitutions](../../apps/platform-lab/assets/aviation/README.md) are also accessible through in-app image credits.

## Files added or modified

- Entry point: `apps/platform-lab/index.ts`; original `src/App.tsx`, `BookLab.tsx` and provider tools are unchanged.
- New native UI modules: `apps/platform-lab/src/mobile/{MobileApp.tsx,theme.tsx,use-library.ts,flight-model.ts,local-insights.ts}`.
- Four local photos and attribution README under `apps/platform-lab/assets/aviation/`.
- New `tests/mobile/mobile-flight-model.test.ts`, `mobile-local-insights.test.ts`; new `scripts/android_mobile_ui_smoke.py`, `android_mobile_scope_smoke.py`; legacy `scripts/android_smoke.py` startup now opens the retained lab via the shell's gear.
- Scope/reference archive, this report and synthetic evidence; updated README, roadmap, design/content checkpoint notices and lab runbook. Pre-existing uncommitted documentation/prototype work was retained; only the new checkpoint additions were staged for shared dirty documentation.

## Remaining limitations and next work

Canonical authorized live history, coverage metadata, real user/profile identity, club data, timestamped weather, saved distances/tracks/circuit classification and an authenticated AI gateway remain missing integrations. Optional voice and recent conversations are not implemented. Paper access opens the existing labeled synthetic lab workflow; real handwriting/photo-to-writing and assumed progress remain separate gates. The FAB opens existing lab/source workflows because no supported production manual-entry operation exists.

iOS native compilation/device execution, physical Android devices, comprehensive screen-reader/contrast audits, every phone/font size, live provider retrieval, cloud Auth/RLS/sync and paid AI were **not tested** in this task. Existing legacy external-backup and provider-session native acceptance sequences were not rerun; their host regressions passed and their tools remain reachable. A green bundle/build is not acceptance of any unavailable service. Full product/M1 and M2–M5 gates stay open.

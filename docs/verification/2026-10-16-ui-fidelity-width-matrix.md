# Approved UI fidelity and width matrix — 16 October 2026

## Target and durable test policy

Manuel requested near pixel-perfect reproduction of the [approved four-screen composite](../product/design-sources/2026-10-16-four-screen/reference.png), especially boxes, buttons, spacing and colors. He established the following standing matrix; it is now recorded in `AGENTS.md` and the [refinement brief](../product/2026-10-16-ui-fidelity-refinement.md).

| Level | Logical width | Focus |
| --- | --- | --- |
| MIN | 360 dp | Overlap, keyboard overlays, scrolling |
| MAIN | 390–411 dp | Primary visual fidelity |
| MAX | 600+ dp | Bound phone-card widths and adapt to tablet/multi-column presentation |

The “80%+” figure supplied with MAIN is a prioritization goal, not measured MoFlight audience data. Earlier same-day [432/320 evidence](2026-10-16-four-screen-native-ui.md) is historical; it does not replace this matrix or the approved image.

## Changes

- Shared cards now use 14 dp radii, 11 dp padding and tighter internal gaps; colors/gradients follow the reference's navy, blue and orange treatments. Blue filters have compact 34 dp visible pills within 48 dp touch regions.
- Full-width photographic headers replace inset floating photo panels. Header dimensions differ appropriately between Flüge, Übersicht, Verein and AI. A licensed Alps/glider photograph replaces the cloud-dominated image; [credits and exact differences](../../apps/platform-lab/assets/aviation/README.md) remain documented and available in app.
- The orange paper hero is 154 dp at ordinary phone font sizes, with the reference's title/count/supporting-text/button hierarchy. The season/AI pair targets 194 dp minimum height and the reference's 190:138 outer-column ratio. Flight/club and weather/upcoming pairs use those same outer column edges, independent of card padding. Larger text grows/stacks instead of being constrained to those normal-font dimensions.
- Status explanations and book metadata no longer consume the primary flight-list header or determine the bento card heights. Full availability/coverage explanations remain in a status sheet and footer; the always-visible synthetic-library label remains accurate.
- Flight filters/statistics/list rows are substantially denser. The existing virtualized list, actual local data, unknown values, detail actions and source-workflow FAB remain functional. No fictional map/track thumbnails were introduced.
- Six supported local question cards now form the reference's three-row/two-column phone grid. Two added deterministic questions count this year's saved flights and identify missing durations. All answers remain local computations, explicitly without AI generation.
- At 600 dp the dashboard is bounded to 430 dp while flights and club sections use columns and AI uses three question columns. At 840 dp the dashboard uses two explicit columns of bounded card groups. Enlarged tablet text falls back to a bounded single-column layout.
- Android AI composer layout explicitly accounts for the actual keyboard overlap, hides the covered navigation during text entry, and scrolls its content into view. Normal navigation returns when the keyboard closes; screen state and SQLite persistence are preserved. iOS retains its native keyboard-avoiding behavior but was not run.

## Changed files and reused contracts

| Area | Files / existing integration |
| --- | --- |
| Shared appearance | `apps/platform-lab/src/mobile/theme.tsx`: reusable Card, Photo, Chip, Action, Section, Label and navigation colors |
| Home bento | New `apps/platform-lab/src/mobile/Dashboard.tsx`; existing flight model and book-scoped paper state |
| Four-tab shell | `apps/platform-lab/src/mobile/MobileApp.tsx`; existing modal details, book picker, source-workflow entry and `BookLab` retained |
| Executable local questions | `apps/platform-lab/src/mobile/local-insights.ts`, `tests/mobile/mobile-local-insights.test.ts`; deterministic flight computations, no API credentials |
| Images | `apps/platform-lab/assets/aviation/mountain-header-v2.jpg` and attribution README; existing licensed local photos reused |
| Native verification | New `scripts/android_mobile_width_matrix.py`; existing UI/scope smoke scripts now use MAIN390 and MIN360 |
| Durable requirements | `AGENTS.md`, refinement brief and scoped README/product-plan/design notices; unrelated drafts preserved |

The existing `use-library.ts`, SQLite `PilotBooks`, selected-book persistence, flight data contracts, search/year/training classification and local paper decisions remain the data sources. No production service, authentication route, migration or parallel flight-entry architecture was added. The six local questions execute deterministic queries; free-form AI displays an accurate unavailable/retry state. Club controls navigate among real empty/unavailable sections. These UI paths are implemented; connected club/weather/cloud AI are not.

## Source and local checks

Final application source: **`b1d806a01abb6c219f8ea19b701258429309aa38`** on main. Later documentation/evidence commits do not alter the tested application code. Accepted stack/driver and ADR 0009 remain unchanged; no dependency, production schema, provider or paid-service change.

Windows, Node 24.18.0, pnpm 11.25.0, existing JDK 17.0.20.1+1 and Android SDK. Dedicated `C:/Users/Momo/mf-ui-build` checkout; only `MoFlight_Synthetic_API37` (`emulator-5554`, API 37 / x86_64) was used. Provider-session emulators and unrelated dirty documentation were preserved.

| Check | Actual result |
| --- | --- |
| Strict TypeScript | Passed |
| `pnpm test` | **130 passed**, including 8 local-insight tests; no fabricated unknown/year/duplicate results |
| Android / iOS Expo exports | Both passed; four local photographs bundled |
| Android Release + `lintVitalRelease` | Passed; installed on the synthetic AVD |
| APK identity | **47,718,199 bytes**, SHA-256 **`6a8c477ce6d3d22b05281ee746f512afbc9d43e25dd9f553ee39e90173e9da90`**; embedded JavaScript plus arm64-v8a and x86_64 libraries verified |
| Python harness compilation / safety/parser checks | Passed; wrong AVD rejected before mutation, display restoration and IME frame parsing checked |
| JavaScript ESLint | No repository lint script/config; not represented as a passed ESLint run |

## Native results and screenshots

The [final width report](evidence/android-2026-10-16-fidelity/report.json) records **30 passed checkpoints**: four screens at 360, 390, 411, 600 and 840 dp/font 1.0, plus four screens at 360 and 600 dp/font 1.4, and two 360 dp native keyboard trials. Actual logical widths/density/font scale and compiled/validated source match. Original display settings were restored and network state was never changed by the matrix.

| MAIN 390 dp screenshot | Additional evidence |
| --- | --- |
| [Übersicht](evidence/android-2026-10-16-fidelity/06-w390-h900-font1-home.png) | [MIN 360](evidence/android-2026-10-16-fidelity/01-w360-h900-font1-home.png), [411](evidence/android-2026-10-16-fidelity/10-w411-h900-font1-home.png) |
| [Flüge](evidence/android-2026-10-16-fidelity/07-w390-h900-font1-flights.png) | [600 dp columns](evidence/android-2026-10-16-fidelity/15-w600-h1100-font1-flights.png) |
| [Verein](evidence/android-2026-10-16-fidelity/08-w390-h900-font1-club.png) | [600 dp enlarged text](evidence/android-2026-10-16-fidelity/29-w600-h1100-font1.4-club.png) |
| [MoFlight AI](evidence/android-2026-10-16-fidelity/09-w390-h900-font1-ai.png) | [MIN keyboard](evidence/android-2026-10-16-fidelity/05-w360-h900-font1-ai-keyboard.png), [enlarged keyboard](evidence/android-2026-10-16-fidelity/26-w360-h900-font1.4-ai-keyboard.png) |
| [MAX dashboard](evidence/android-2026-10-16-fidelity/18-w840-h1100-font1-home.png) | [MIN enlarged dashboard](evidence/android-2026-10-16-fidelity/22-w360-h900-font1.4-home.png) |

Both MIN keyboard trials measured the native IME top at y=601 dp. The send control was at y=359–401 (font 1.0) and y=318–360 (font 1.4), entirely above the keyboard without a corrective test-harness scroll. The focused input scrolls into view automatically. No request was submitted by the width trial.

Manual review compared MAIN captures against the approved composite and inspected MIN, MAX and enlarged-text screenshots. It confirmed consistent asymmetric card edges, compact controls, covered header tints, restored footer/thumbnail text, and no material overlap in the reviewed captures. Scrolled-off content and partially visible horizontally scrollable chips remain reachable. Automated navigation/IME checks do not prove pixel-perfect fidelity or every possible overflow state. [Release build identity](evidence/android-2026-10-16-fidelity/build-release.json).


The [workflow report](evidence/android-2026-10-16-fidelity/workflow-report.json) records **16 passed checkpoints** on the same Release source: selecting the persisted synthetic book, flight list/details, training filter, empty search, all club section controls, executable local question, unavailable AI/retry preserving the draft, existing paper workflow, actual airplane-mode force-stop/restart with local flights, and MIN enlarged-text screens. Individual `workflow-*.png` captures are retained beside the report. These are UI/runtime checks, not live-service acceptance.

The [book-scope report](evidence/android-2026-10-16-fidelity/scope-report.json) records **4 passed checkpoints**: year/training state retained across tabs, book B's independent 0:30 known time, book A's restored 1:10, and selection/summary surviving restart. Thus **50 native checkpoints passed** across width, workflow and scope trials on the final compiled source. The workflow harness restores physical display defaults and re-enables networking after its explicit offline trial; the width harness separately restored its exact original overrides. No provider-session emulator was used.

## Measured native geometry

UIAutomator bounds at density 160 dpi (one screenshot pixel equals one dp here), ordinary font scale. Heights are allowed to grow with actual content; no fixed-height text clipping is accepted to imitate illustrative numbers.

| Width | Hero width × height | Season width × height | AI width × height |
| --- | --- | --- | --- |
| 360 | 340 × 154 | 192 × 202 | 140 × 202 |
| 390 | 370 × 154 | 210 × 202 | 152 × 202 |
| 411 | 391 × 154 | 222 × 194 | 161 × 194 |
| 600 | 430 × 154 | 244 × 194 | 178 × 194 |
| 840 | 406 × 154 | 231 × 194 | 167 × 194 |

All three phone bento rows share their left/right outer edges and an 8 dp gap. The reference's card ratio is maintained to native pixel rounding. The 840 layout places these groups in two columns. At font scale 1.4, the dashboard stacks the individual cards and permits vertical scrolling; filters remain horizontally scrollable where their labels exceed the viewport.

## Repeatable commands

After setting up the existing Android environment and installing the committed-source Release APK on the synthetic AVD:

```powershell
$env:VALIDATED_SOURCE_COMMIT = 'b1d806a01abb6c219f8ea19b701258429309aa38'
$env:APK_SOURCE_COMMIT = $env:VALIDATED_SOURCE_COMMIT
python scripts/android_mobile_width_matrix.py --serial emulator-5554 --output local-data/ui-fidelity-release-final
python scripts/android_mobile_ui_smoke.py --serial emulator-5554 --output local-data/ui-fidelity-workflows-final
python scripts/android_mobile_scope_smoke.py --serial emulator-5554 --output local-data/ui-fidelity-scope-final
```

Run these sequentially: they share the synthetic AVD. The width harness verifies the exact AVD before mutation, records actual size/density/font scale, and restores the original display configuration. It never changes network state or resets data. Workflow trials separately load the opt-in synthetic fixture and exercise offline restart.

## Problems found and corrected

The first 840 dp capture exposed a cyclic flex/wrapped-photo layout: the hero expanded and the footer overlapped lower cards. Explicit columns and bounded normal-font hero height replaced that layout. Source review also identified enlarged-text tablet section clipping, so multi-column tablet rows now collapse when font scale exceeds 1.3.

The first MIN keyboard capture showed part of the composer behind the keyboard. Explicit Android keyboard overlap handling fixed it; a subsequent native 360 dp check measured the enabled send control entirely above the keyboard without a corrective scroll. The harness initially confused the club's Übersicht selector with the bottom-navigation tab and could not see the IME in the accessibility tree. It now identifies the bottom navigation row spatially and uses native WindowManager IME frame/inset data as a fallback. Those harness failures were not counted as passes.

The final geometry review also found inconsistent bento column edges caused by different internal padding. All three card pairs now use one explicit 190:138 width calculation. Full-image tints now cover the header padding as well, removing bright exposed photo strips.

A subsequent screenshot review found that Android exposed the full provenance label in XML while clipping its final word visually. Explicit full-width centered text fixes that intrinsic-width problem; the thumbnail labels received the same bounded-width treatment. Semantic text alone is not evidence that glyphs are fully rendered.

## Limits

This is a closer structural/color/spacing implementation, not a pixel-error certification. Exact source photography, iOS system rendering and populated reference examples cannot be reproduced with the current licensed assets and unconnected data sources. No distances, tracks, weather, duties, notices, AI responses, percentages or recent conversations were invented. The current persisted library remains explicitly synthetic. Existing live-provider, weather, club, authenticated AI, real paper-photo and iOS runtime gates remain open.

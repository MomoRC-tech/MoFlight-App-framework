# Native shell corrections verification — 17 October 2026

## Scope and source

Manuel reported testing the preceding demo and authorized [these corrections](../product/2026-10-17-native-shell-corrections.md). He subsequently identified a Google Pixel 6a and described the check as quick; Android version and specific checklist outcomes were not supplied; no all-pass physical acceptance is inferred. Existing user documentation drafts were preserved.

Final application source: `db15203628abcc0bed5104b2fcb522dbf91d1968` on main. Subsequent verification/documentation commits do not change the tested application. No dependency, provider, production signing or account architecture change.

## Implemented behavior

- One shared compact photographic header is outside the scrolling tab bodies. It shows the unchanged approved dark Thermik artwork and a far-right native user symbol. The current page/title and local greeting remain accessible. Normal header target is 64 dp; larger text/name content can grow without clipping.
- Five persistent tabs: Übersicht / Flüge / Flugbuch / Verein / AI. Existing mounted screen state, search/year/training selections and Android back behavior remain. Flugbuch is a separate book/paper destination backed by the same library and existing `BookLab` workflow; no parallel data source or writing engine.
- The user button opens Profil & Einstellungen. A genuine optional local display name persists in the selected synthetic library, appears in the greeting, and can be changed/cleared. The UI distinguishes it from an authenticated MoFlight account. Existing book/data/credit/tools actions are reachable here; no fake account/session controls.
- Local UI profile storage is owner-checked, library-scoped SQLite metadata (`lab_ui_profile`), outside flight/book backups. Existing book selection/reconciliation data is unchanged. Language remains German and text scale follows the OS; cloud account, goals/medical data and English switching remain unconnected.
- A new original, tinted aircraft silhouette replaces the navigation line mark; native profile/book shapes and a tiny local authored aircraft asset add no runtime dependency.
- Two small segmented season rings represent aircraft shares of count and known minutes, with stable registration colors and accessible descriptions. Zero/all-unknown time shows a neutral track; partial time remains qualified. No target progress, previous-year coverage, distance or screenshot percentage was invented. One-aircraft data correctly produces a single full share; enlarged text retains the textual fallback.

## Changed files and reuse

| Area | Files |
| --- | --- |
| Shell/navigation/header | `apps/platform-lab/src/mobile/MobileApp.tsx` |
| Local profile | Updated `use-library.ts`; new `ProfileSettings.tsx`, `local-profile.ts`, `tests/mobile/mobile-local-profile.test.ts` |
| Season charts | Updated `Dashboard.tsx`; new `SeasonRing.tsx`, `season-model.ts`, `tests/mobile/mobile-season-model.test.ts` |
| Branding/icons | New `ShellIcons.tsx`, unchanged approved `assets/branding/moflight-ai-logo-dark.png`, authored `assets/icons/aircraft.svg` / `.png`, asset provenance README |
| Native checks | Updated UI and width scripts; new `scripts/android_mobile_shell_smoke.py`; existing book-scope smoke reused |
| Documentation | Scoped README/project-plan/app-design/screen-content notices, correction brief and this report; unrelated drafts retained |

The same `useLibrary`, `PilotBooks`, book selection, effective flights, paper state and `BookLab` remain the sources/workflows. No navigation library, alternate database writer, generic query interface or new service was added. The existing local assistant computations and accurate unavailable backend state are preserved.

## Local checks

Windows, existing Node24/pnpm11.25, JDK17.0.20.1+1, Android SDK and short-path `C:/Users/Momo/mf-ui-build` checkout. Only `MoFlight_Synthetic_API37` / `emulator-5554` may be used for synthetic trials. No hosted CI or paid service was used.

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| Mobile tests | **136 passed**, including 4 aircraft distribution tests and 2 SQLite profile tests |
| Profile persistence tests | Actual disk reopen, library isolation, foreign owner rejection, validation and optional-name reset passed |
| Android/iOS Expo exports | Both passed; unchanged logo and local aircraft bitmap bundled |
| Python harness compilation | Passed for shell, width and workflow scripts |
| Android Release / lintVitalRelease | Passed; installed dual-ABI APK has 48,682,771 bytes, SHA-256 `82873b7471e14b2e16dbf75db2b671e078d078e95405d152339d0b63b2ef90cd` |
| Native shell/profile and workflow trials | Passed: 9 shell + 16 workflow + 4 book-scope checkpoints on the final source |
| Native width matrix / landscape | **37 + 5 passed**; 360/390/412/600/840 dp, font scales 1.0/1.4, MIN keyboard and 840 × 412 dp landscape |
| Physical phone retest / iOS runtime | Not run |

No JavaScript ESLint script/config exists; no ESLint pass is claimed. Automated navigation/geometry does not certify pixel-perfect fidelity or all text clipping.

## Problems found and corrected

The first native ring rendering showed many raster strip seams. Interior overlap plus exact circular masks removed that tick-like appearance while retaining aircraft-color boundaries and the same bounded view count. The final MIN screenshot shows smooth arcs.

The first keyboard trial encountered Gboard's system “Try out your stylus” onboarding overlay, so no native keyboard geometry pass was inferred. After dismissing it, the emulator shell/screenshot service stalled and normal reboot remained in boot animation. Only the exact synthetic AVD was stopped, then cold-started with `-no-snapshot-load -no-snapshot-save -no-boot-anim -gpu software`, without wiping data. The first restart attempt refused a still-held instance lock; retry waited until the old process exited. Provider-session emulators were untouched. A focused 360 dp keyboard retry then passed. Earlier stopped attempts remain local diagnostics, not acceptance evidence.

A retained React Native accessibility tree could briefly appear after `am start -W`; the harness now waits for the fresh Home hero before using tab controls. Harness-only commit `54b2fa4` does not change the compiled application. Final reports identify the app source independently from this harness change.

Native enlarged-text review caught clipped Club “Alle anzeigen” labels, despite automated viewport assertions passing. The shared Section now allows its title to wrap and gives the action an explicit width with full-width right-aligned text. Final screenshots recheck these labels.

The first shell trial also exposed a real local-profile read/save failure after returning from the existing paper workflow. Separate profile/greeting database loads overlapped the library reload. The final implementation removes those extra opens and routes profile reads/saves through the existing `useLibrary` repository and operation lock. The earlier failed save/restore was not counted as a persistence pass; the final trial rechecks and restores the synthetic name through UI. No database reset or new writer was introduced.

## ARM64 handoff

Final APK: `local-data/phone-demo/MoFlight-demo-2026-10-17-arm64.apk`, source `db15203`, **30,623,626 bytes (30.6 MB)**, SHA-256 `b5a9cfc41c949edb97a4634234fe83396183c10a79b367cbe799ecaebca1d4b7`. APK v2 signature and ZIP CRC passed; exactly ARM64 libraries are included and all match the tested dual-ABI APK, as does its embedded JavaScript. Signing certificate matches the previous demo (`fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c`). Package/version remain `de.momorc.moflight.lab` / 0.1.0 (code 1); no data clearing is required for a normal update. If installation fails, inspect the error before uninstalling/clearing anything. [Dual-ABI build identity](evidence/android-2026-10-17-shell/build-release.json) and [phone package checks](evidence/android-2026-10-17-shell/build-arm64.json). Earlier intermediate APKs are not the handoff artifact.

The previous APK's quick Pixel 6a test does not establish a physical pass for this updated APK. Android version and detailed checklist outcomes remain unknown. Suggested physical retest: header stays pinned, profile name saves/reopens, all five tabs work, Flugbuch opens the existing workflow, rings/labels fit, and keyboard/offline restart remain usable. No physical phone is connected through ADB.

## Native shell result

The [final shell report](evidence/android-2026-10-17-shell/shell-report.json) records **9 passed checkpoints** on the final application source: the header retained identical logo/profile bounds while Home content scrolled; all five tabs selected and rendered correctly; Flugbuch opened the existing paper workflow; the local name saved and survived a force-stop/restart after that workflow, then the original name was restored through UI. The trial used actual 360 × 900 dp, 160 dpi and font scale 1.0. It did not reset data or change display/network configuration. [Saved profile](evidence/android-2026-10-17-shell/08-local-profile-saved.png) and [reopened profile](evidence/android-2026-10-17-shell/09-local-profile-survives-restart.png).

The [workflow report](evidence/android-2026-10-17-shell/workflow-report.json) records **16 passes**: saved flight list/details, year/training/search behavior, club sections, local question computation, unavailable backend retry preserving the draft, paper entry, airplane-mode force-stop/restart with local data intact, and enlarged-text screens. The [scope report](evidence/android-2026-10-17-shell/scope-report.json) records **4 passes**: filter state across tabs, book B's independent 0:30 known time, book A's 1:10, and remembered selection/totals after restart. These are synthetic native trials, not live-provider/account acceptance. Workflow cleanup restores physical display defaults and networking after its explicit offline trial; the width harness separately restores exact original display overrides and never changes network state.

## Evidence, limitations and next check

**71 native checkpoints passed** in total on the final application source. The [width report](evidence/android-2026-10-17-shell/width-report.json) records 37 checkpoints: five tabs at 360 × 900, 390 × 900, 412 × 900, 600 × 1100 and 840 × 1100 dp at font scale 1.0, then 360 × 900 and 600 × 1100 dp at 1.4; two additional 360 dp keyboard checks verify the send control stays above the visible IME. All matrix overrides use 160 dpi and record the actual size/density/font scale. The [landscape report](evidence/android-2026-10-17-shell/landscape-report.json) adds five tabs at 840 × 412 dp. Both reports confirm restoration to the original 1080 × 1920 physical pixels, 420 dpi and font scale 1.0. These synthetic size overrides are not measurements of the Pixel 6a.

Reviewed MAIN screenshots: [Home](evidence/android-2026-10-17-shell/07-w390-h900-font1-home.png), [Flüge](evidence/android-2026-10-17-shell/08-w390-h900-font1-flights.png), [Flugbuch](evidence/android-2026-10-17-shell/09-w390-h900-font1-logbook.png), [Verein](evidence/android-2026-10-17-shell/10-w390-h900-font1-club.png), [AI](evidence/android-2026-10-17-shell/11-w390-h900-font1-ai.png). The compact fixed header, card alignment, five-tab navigation and smooth colored season arcs are visible. [Enlarged Club labels](evidence/android-2026-10-17-shell/30-w360-h900-font1.4-club.png) now fit; [MIN enlarged keyboard](evidence/android-2026-10-17-shell/32-w360-h900-font1.4-ai-keyboard.png) retains the send action. [Landscape Home](evidence/android-2026-10-17-shell/01-w840-h412-font1-home.png) uses columns, [Flugbuch](evidence/android-2026-10-17-shell/03-w840-h412-font1-logbook.png) stays centered/bounded, and [AI](evidence/android-2026-10-17-shell/05-w840-h412-font1-ai.png) scrolls beneath the fixed shell. Reviewed captures show no material overlap; below-fold content requires scrolling on short/enlarged viewports. This is scoped visual review, not a pixel-perfect assertion. Exact reference photography remains substituted by documented licensed local assets. Club/weather/cloud AI/live canonical import and real photo-to-writing acceptance remain open. Account/goal/medical functionality is not implied by restoring its native entry point.

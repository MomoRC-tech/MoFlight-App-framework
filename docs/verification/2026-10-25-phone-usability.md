# Phone usability — 25 October 2026

Approved package: #84 compact expandable filters, #87 role-first deduplicated crew and selected Solo rule, #78 chat-first presentation. Latest steering: omit unknowns from Flights overview; retain details/raw evidence. M1/M3–M5; R01/R04/R08/R12, FL-03/10/11, E07/E09/E11, AI07/AI08. Baseline da7e353. No new dependency, provider scope, schema, AI activation or paid execution.

Implementation: inline bounded filter form and single-choice menus; independently scrolling transcript/pinned composer with secondary history/privacy/usage/task sheets; full-source-name crew grouping and known-only flight rows. Raw evidence, filters, deterministic statistics and local chat contracts are preserved. Regression checks cover missing values versus zero, same initials/different names, PIC/SIC/FI/companions, Solo, filter/reset/detail/account return, menu dismissal, explicit Send and older-message scrolling. Existing persistence/controller tests cover drafts/cancellation/owner boundaries; native runtime is separate.

## Implementation and host checks

Implementation commit `ceaed6f`; native layout corrections `d58f78b` and `dd99265`. The latter is the delivery source. The intervening `670fcc3` aviation-policy package was independently authored and is not claimed as UI work here.

- Combined `pnpm check`: **5/5 passed** — TypeScript, lint, 1,254 mobile tests passed / two skipped, Python 134 run / 16 skipped, fixture parity. Run `20261025T093439Z-79d8c5fb` checked the shared working tree, including concurrent server-policy tests. This is not a claim that those additional tests existed in `ceaed6f`.
- Focused final UI/crew/preview tests: **38/38 passed**. After the native picker correction, all **16 filter-presentation tests** and TypeScript passed again. Existing draft/coordinator/storage tests were reused instead of recreating them.
- Android and iOS bundles passed for the initial package. Later Android Release builds compile the two layout corrections; iOS runtime remains untested. Handbook generation/check passes with the existing 49-symbol catalogue.
- First combined failures were corrected: obsolete preview crew expectation, malformed synthetic missing-field fixture, and unregistered glyphs replaced by existing symbols. The unrelated relay expectation was corrected by its concurrent work package. No production failure is concealed by the final pass.

## Native checkpoint

Windows / Node 24.18.0 / pnpm 11.25.0 / JDK 17; Android API37 emulator `MoFlight_Synthetic_API37` launched read-only. Only synthetic flight fixtures and a newly created synthetic local chat were used. No provider login, model request or paid execution. All display overrides and animation settings were restored; no app data clear/uninstall.

Source `ceaed6f`: 21 affected-screen checkpoints at **390×900 dp, font 1; 360×900 dp, font 1.6; 800×700 dp, font 1**, each at density 160. Flights: known-only cards, PIC/Solo/deduplication, combined category/launch filtering, detail return and empty-result reset. AI: ordinary empty chat, history/privacy sheets and composer above the keyboard at each size. A new synthetic draft survived typing, tab return and force-stop/restart; it was then deleted through the ordinary confirmation. Cleanup required correcting the harness's case-sensitive selector for Android's uppercase confirmation button; this was not an app deletion defect. No Send/enablement action was used.

Two actual layout defects were found before delivery: the expanded filter could exceed the short area left by the large-text development toolbar, and the searchable registration sheet could sit behind the Android keyboard. The corrections cap the filter group to available height and apply keyboard avoidance to its picker. Initial `d58f78b` picker failure is retained in ignored logs; final-source affected-screen verification follows below. Unchanged AI/crew behavior reuses the explicitly named `ceaed6f` evidence rather than repeating that matrix.

**Measured density:** at the same 390×900/density160/font1 synthetic preview, the first flight begins at y312 versus y340 in the earlier verified `c7c5779` capture: **28 dp less collapsed header space**. This compares preserved XML from `build/flight-classification/device-final/` with the initial package, not the interrupted attempt to inspect the emulator's older installed baseline. The expanded ordinary-font form is approximately 300 dp including its control/summary rows; all four dimensions and Reset/collapse fit together. At enlarged text it deliberately scrolls internally.

Final source `dd99265`: **9 affected filter checkpoints passed**, including MAIN/MIN/WIDE, reachable enlarged-text footer, searched registration visible above the keyboard, selection and exact result count. Installed APK SHA-256 was independently matched to the build. Original display/animation settings were restored. [Sanitized checkpoint record](assets/2026-10-25-phone-usability/evidence.json); selected visual evidence: [MAIN filters](assets/2026-10-25-phone-usability/filters-main.png), [search above keyboard](assets/2026-10-25-phone-usability/picker-keyboard.png), [large-text fallback](assets/2026-10-25-phone-usability/filters-large-text.png), and [unchanged AI keyboard layout from ceaed6f](assets/2026-10-25-phone-usability/chat-keyboard.png).

Physical Pixel, iOS runtime, live-provider role completeness, long real chat histories and spoken accessibility are not established by this package. Formal role credit and whole-product acceptance remain separate.

## Delivery

[Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/phone-usability-2026-10-25-dd99265/MoFlight-Android-dd99265.zip), exact source `dd992655b7d5f42dde1402870dba9b207bb963f6`. The ZIP contains only `app-release.apk` and sanitized build metadata. APK SHA-256: `3a98bea3295c8cc0304ba0688776c74985840ab8aa78bb65a0a2f731691d4fda`. Standalone development-signed Release, not production/beta approval. #84/#87 scoped UI work is complete; broader #78 integration/model gates remain open.

Ignored detailed logs: `build/phone-usability/` (`device`, `draft-device`, failed `device-final`, corrected `device-delivery`); first host logs `build/host-checks/20261025T093012Z-da196b6d/`. Generated run suffix is not a source commit.

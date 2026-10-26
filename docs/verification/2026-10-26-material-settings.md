# Material Settings increment — 26 October 2026

Tracking: [#94](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/94), M1/P1 under #20; Help preference #31. [Selected scope](../product/design/compact-cockpit.md#material-settings--selected-26-october-2026).

## Scope and source

Manuel accepted the revised current-color Cockpit direction and instructed “thats ok now proceed”. This first bounded implementation uses existing navy/cyan colors for ordinary Settings, grouped navigation rows, a native contextual-help switch, accessible backup disclosure and an opt-in child-page header. It preserves all existing routes, source/session/recovery meanings and the synthetic editor. Start composition, global theme, provider/native parent and underlying navigation stacks are unchanged. Statistics, modal migration and light mode remain later increments.

Implementation follows baseline `f4ffd43` plus the Settings package; the resulting commit is linked in #94. Concurrent retrieval/persistence work was preserved and committed separately as `1394dfb`/`f4ffd43`; its results are not credited to this UI package.

## Verification

Environment: Windows, Node 24.18.0, pinned pnpm 11.25.0, installed local dependencies. Two subtasks used the requested GPT-6.1 Sol / Medium; parent reviewed integration and retained orchestration.

- `node --import tsx --test tests/mobile/mobile-header-navigation.test.ts tests/mobile/profile-settings-presentation.test.ts`: 50/50 pass. Covers existing destinations, Back/caller state and provider-entry guards, unchanged default header, Settings header, source/session/recovery warning, help-switch loading/saving guards and save errors, backup-disclosure contents.
- `pnpm typecheck`: pass after correcting two test-only unknown-array type annotations in the integration test.
- Focused ESLint on the three changed UI sources and two affected tests: pass.
- Handbook generation/freshness/local references and scoped whitespace checks accompany the saved increment.

The component harness executes real component/shell functions with native leaves mocked. It does not prove switch rendering, touch regions, scrolling or native layout. The earlier browser proposal is not evidence for this implementation. Dark mode is the only pre-beta UI verification target; light acceptance is deferred. No app bundle, APK build, device/live-provider run, screenshot matrix or full host-suite run was performed for this bounded increment. The next coherent UI checkpoint retains committed-source Release and brief affected dark Settings checks before device handoff; physical-phone, iOS and spoken-accessibility acceptance remain untested.

## Remaining work

Expanded backup disclosure and affected enlarged-text layout remain unchecked. Continue other child-page/temporary-surface work under #94, preserving Start and provider lifecycle. Source implementation is complete for this increment; the overall redesign and remaining native acceptance stay open.

## Combined Release checkpoint

Source `9eccbf7082ca2a4a4217c4233d8ad961e782550d` includes Settings `e1b8747`. Full host check passed (1,489 mobile tests/two skipped, 136 Python/16 skipped, types/lint/fixtures); committed-source Android Release build passed. [APK delivery and combined evidence](2026-10-21-simple-flight-loading.md#shared-local-reads-and-displayed-flight-details--26-october-2026).

Brief dark-only native inspection on offline `MoFlight_Synthetic_API37`, API 37, 411.43 × 731.43 dp, font scale 1: grouped Settings rows and the enabled native Help switch are readable, with no observed text overlap. Header Back returned to Start twice. Parent independently inspected both Settings captures. No preference was changed. Controller session `build/ui-agent/20261026T170654Z-2fa0c847/` contains worker results, screenshots/XML and cleanup report; original display, offline state and install identity were preserved with no cleanup errors. Worker used the explicitly requested GPT-6.1 Sol Medium.

The earlier session `20261026T170239Z-41eb1964` was blocked entering Settings by the exact-label allowlist and cleaned up. A separate corrected session reached Settings, but Help and recovery entries were still refused by the controller; those journeys remain untested, not failed app behavior. This bounded checkpoint does not accept expanded disclosure, switch persistence, enlarged text, other widths, physical-phone, iOS or spoken accessibility.

## Secondary-page continuation

Scope: Help, Medical and Status under #94, following the selected Settings direction. Start, global tokens, provider lifecycle and existing Back/Sync routes are preserved. Help has a plain topic list and single answer heading; Medical separates expiry summary, source records and caveats; Status groups current state, update receipt, stored-flight coverage and source limits. Material [top app bars](https://m3.material.io/components/top-app-bar/overview), [lists](https://m3.material.io/components/lists/overview) and [cards](https://m3.material.io/components/cards/guidelines) guide hierarchy; existing React Native components and the vivid Cockpit palette are product-specific adaptations.

Two independent component subtasks used GPT-6.1 Sol Medium as requested; parent integrated navigation and Status. Meaningful existing coverage was extended for retained source/unknown cautions, Help content and contextual return paths without provider work.

Verification on Windows / Node 24.18.0 / pnpm 11.25.0:

- Six focused suites (header navigation, Settings presentation, Help, Medical status, expiry and overview): **76/76 pass**.
- TypeScript and scoped ESLint: pass.
- Android and iOS production bundles: pass; this is host evidence, not native acceptance.
- Committed-source Release and brief dark native inspection passed as recorded below. Existing Settings evidence above remains source-specific; no light, physical-device, iOS or extended accessibility acceptance is claimed.

### Secondary-page Release and native checkpoint

[Download APK ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/material-pages-2026-10-26-4f59f70/MoFlight-Android-4f59f70.zip), actual application source `4f59f70d180cd231011f447b67fe91c6d8eff00b`. Local committed-source Release passed, with embedded JavaScript and arm64-v8a/x86_64 libraries. SHA-256 `19ea41e6fb870da26018cefc277809e1027d8257b187f1fa86bb6842ab73fa9a` matches the installed APK. ZIP contains only the APK and sanitized build metadata; development-signed lab build.

Parent performed a bounded offline dark native check on `MoFlight_Synthetic_API37`, Android API 37, physical 1080 × 1920 at density 420 (411.43 × 731.43 dp), font scale 1. Medical empty/unknown state and caveat, Status groups and scrolling to source limits, Help list and an answer with source/boundary were readable with no observed text overlap. Header Back returned from Medical to Start, Status to Settings, and Help answer through the list and Settings to Start. All five PNGs were visually inspected. No provider action, preference change, data clearing or display/network change was performed.

[Sanitized native result](2026-10-26-material-pages-native.json); local captures and XML are in `build/material-pages-native/`. The initial script expected the settled Medical label while startup still showed loading; it stopped before navigation and was corrected to use the stable Medical prefix. This is a selector miss, not an app failure. Populated Medical/source rows, update receipts, keyboard/enlarged-text/other-width layouts, physical phones, iOS runtime and light remain untested. Broader dialogs/navigation remain open in #94.

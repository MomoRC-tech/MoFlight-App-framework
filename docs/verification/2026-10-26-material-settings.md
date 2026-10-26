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

Inspect actual dark Settings, backup disclosure and affected enlarged-text layout at the batched native checkpoint. Continue other child-page/temporary-surface work under #94, preserving Start and provider lifecycle. Source implementation is complete for this increment; the overall redesign and native acceptance remain open.

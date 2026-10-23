# Network failure regression coverage — 23 October 2026

Tracking: [#58](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/58), integrated Android acceptance [#8](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/8). Scope: M1 failure/retry and M3 saved-history safety; R04/R15, FL-03/10/11, E07/E09/E11. Manuel requested additional network-problem tests after discussing emulator capabilities.

## Existing coverage reused

- [Access controller](../../tests/mobile/vereinsflieger-access-recovery.test.ts): native page/HTTP errors, explicit source retry, expired login, stale callbacks, and previously saved capture preservation. This package extends saved-capture preservation to both native error callbacks.
- [Combined retrieval](../../tests/mobile/combined-flight-load.test.ts): timeout feedback, explicit retry, cancellation/backgrounding, and optional-source failures retaining the confirmed flight result.
- [Activity request](../../tests/mobile/activity-request.test.ts): hard timeout terminates the renderer before releasing its reservation; cancellation and late replies cannot revive an abandoned request.
- [Duty refresh](../../tests/mobile/duty-refresh-native.test.ts): failed second-source retrieval preserves the previous cache without a partial write.
- Existing [Android smoke evidence](2026-10-18-portable-ci.md) establishes source-specific offline navigation/restart, not connection loss during an in-flight provider request.

## Added executable coverage

[Activity probe tests](../../tests/mobile/activity-probe.test.ts) execute the actual injected reader with synthetic fetch responses and streams. Forty fault/stage combinations cover connection rejection, a response body disconnect after a chunk, stalled fetch, stalled body, non-HTML responses, and HTTP 401/403/429/500/503. Each fault occurs at each of four stages: initial identity check, flight view, own-duty view, final identity check.

Assertions reject the entire observation, including failure after both source pages arrive; prevent partial evidence or raw transport errors from escaping; prohibit automatic retry/further requests after failure; and release the reader reservation. Each case runs a fresh explicit request in the same synthetic renderer and requires all four guarded requests and both complete source observations to succeed. Stalled cases wait for a real pending synthetic request/stream before triggering the reader's scheduled 10-second abort; elapsed real-network latency is not measured.

No application behavior, dependencies, provider sessions or APK changed.

## Verification

Windows, Node 24.18.0, pnpm 11.25.0; local working source based on `1a856b9` plus this test package (published package commit linked in #58).

- `node --import tsx --test tests/mobile/activity-probe.test.ts tests/mobile/activity-request.test.ts tests/mobile/vereinsflieger-access-recovery.test.ts tests/mobile/combined-flight-load.test.ts tests/mobile/duty-refresh-native.test.ts`: **207 passed, 0 failed**. Local log: ignored `build/network-tests.txt`.
- `pnpm typecheck`: passed.
- `pnpm exec eslint tests/mobile/activity-probe.test.ts tests/mobile/vereinsflieger-access-recovery.test.ts --max-warnings 0`: passed.

The first stalled-case harness assumed one event-loop turn was sufficient for asynchronous hashing; it was corrected to wait for the injected stalled operation. Final results above are from the corrected harness. Tests use synthetic responses, manual timer expiry and native callback simulation; they do not establish actual DNS/TLS behavior, Android/WebView transport, live-provider reliability, physical devices or iOS. No build, hosted run, paid service or live-provider call was used.

## Native acceptance still open

#58 retains a committed-source Android follow-up using only the guarded synthetic AVD and synthetic/local responses: no connection before loading, drop during loading, slow/stalled responses, reconnect with explicit retry, and offline restart. Check bounded loading/cancel/error feedback, unchanged readable saved data, no false success or duplicate results, and restoration of original device/network settings. Existing provider-session AVDs must remain untouched. Host tests do not close this gate; physical Android and iOS acceptance remain under #8.

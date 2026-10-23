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

The first stalled-case harness assumed one event-loop turn was sufficient for asynchronous hashing; it was corrected to wait for the injected stalled operation. Final results above are from the corrected harness. These host tests use synthetic responses, manual timer expiry and native callback simulation; they do not establish actual DNS/TLS behavior, Android/WebView transport, live-provider reliability, physical devices or iOS. The initial host increment used no build, hosted run, paid service or live-provider call. The native continuation below adds separately scoped Android transport evidence.

## Native continuation completed — 23 October 2026

After Manuel requested completing the connection-drop tests, [the build-only proof](../../apps/platform-lab/src/development/android-network-poc.tsx) and [guarded native runner](../../scripts/android_network_smoke.py) were implemented and executed on **MoFlight_Synthetic_API37**, serial `emulator-5570`, **Android 17/API 37**. The ordinary app never imports this entry. Only the proof APK allows the loopback HTTP fixture; the production manifest and build entry were restored.

The real activity reader runs in an Android WebView, with only its origin guard adapted to fixed `http://localhost:18765`. Requests reach a Python server bound to host loopback through ADB reverse. The server actually closes TCP responses or withholds headers/body bytes; fetch, response streams, AbortController and the reader's 10-second timer are native WebView execution, with no fetch mocks or manual timer expiry. A separate synthetic SQLite file records complete observations and save counts, leaving the ordinary app's databases untouched.

**14 native checkpoints passed:** healthy four-request baseline; connection cut before initial identity-response headers; mid-body cuts during flight retrieval and final identity verification; stalled headers and stalled body; explicit recovery after each of those five failures; connection unavailable before a request; persisted snapshot after process restart with that connection unavailable; and paced successful response streams after reconnect. Every failure retained the exact saved count/write count; each explicit recovery completed all four guarded requests and incremented the save count once. Final-verification failure never published the already received source pages. The real stalled cases were observed at **11.53 seconds** each, including UI polling overhead around the configured 10-second abort; this is not an isolated network-latency measurement.

The runner restored the original installed APK byte-for-byte (SHA-256 `311b767bb9a53a8a4e75fccfafc7a9b52fcaf9d8515348e3e59d8208b66137a5`), restored its running state and original reverse mappings, and verified unchanged network settings. No app data was cleared. Provider-session AVDs were untouched; cleanup reported no errors. [Sanitized native results and provenance](evidence/2026-10-23-network-native.json) retain the individual checks, timings and artifact identity. Full local evidence remains ignored under `build/network-native-run/` and `build/network-native-build-ready/`.

Proof source: **`17c616555391a184089ffd2d9f4bb706d1641f37`**, plus the recorded build-only entry and cleartext-manifest overrides. Proof APK SHA-256: `7fd8cca56582949073f2a485adeef4fbf46e3ff703b71a27d5338a1e6ce874c9`. Runner and origin-isolation test: **`8aba289`**. Committed-source normal Release and isolated proof builds passed; the build checkout's source and normal APK were restored. Early attempts refused an unrelated build checkout, then encountered stale isolated/hoisted dependency links in the correct build checkout. Those generated links were preserved locally and repaired, including restoring workspace-package links; no source dependency/version change was needed.

Additional host verification: **11 Python tests passed** (`python -m unittest tests.test_android_network_smoke tests.test_portable_android`), **1 proof-origin isolation test passed** (`node --import tsx --test tests/mobile/android-network-proof.test.ts`), TypeScript and focused lint passed. The Python tests include actual incomplete local HTTP responses and guard regression reuse; they remain distinct from native acceptance. Logs are `build/network-python-final.txt`, `build/network-proof-host.txt` and `build/network-native-typecheck.txt`.

Reproduce with the configured Android SDK/JDK environment, a new output directory and no existing forwarding on port 18765:

```powershell
./scripts/build-android-recovery-poc.ps1 -JavaHome <JDK17> -BuildDirectory <clean-build-checkout> -OutputDirectory <new-build-evidence> -SourceRef <source-commit> -Proof Network
python -m scripts.android_network_smoke --apk <new-build-evidence>/network-poc.apk --serial <verified-synthetic-serial> --output <new-native-evidence>
```

**Acceptance boundary:** #58's scoped socket interruption/timeout/recovery test package is complete. ADB reverse bypasses the emulator radios: this does not establish airplane-mode transitions, carrier/Wi-Fi handover, real DNS/TLS/proxy behavior, live Vereinsflieger reliability, or the entire normal-app coordinator UI on device. Persistence here is an isolated proof snapshot, complemented by the existing host controller/cache tests above. Those broader integrated, physical Android and iOS gates remain under #8/#16; no paid service, hosted execution or new user-facing APK delivery was used.

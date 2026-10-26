# Foreground Sync recovery — 26 October 2026

Issue [#91](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/91); P2 / M2–M4; R04/R12, FL-03/10/11 and E07/E09/E11. Manuel selected recovery after the app returns or restarts. This package does not run provider work while backgrounded.

## Implemented contract

Application source `c3b7275dde3b562e22a2a52db0400d2a9d682b19` persists an owner/store-scoped Sync marker and successful optional-source statuses in a separate local SQLite file. Flight evidence and import receipts remain in the existing flight library. An interrupted Sync offers **Fortsetzen** or **Neu synchronisieren** when opened again. Continuation first reconciles the saved flight capture and committed receipt, then verifies the same provider account and club. A matching saved flight is not imported again; completed optional sources are skipped and unfinished sources are retried. A changed or unverified account cannot continue. Existing local data and explicit cancellation remain protected.

The progress marker contains only owner/store IDs, provider account reference and club label, capture ID, timestamp and source statuses. It contains no credentials, raw provider page, flight rows or Medical content. It is local to this installation and is not a new cloud or manual-backup format.

## Verification

- Windows, Node 24.18.0, pnpm 11.25.0, Python 3.12.10: `pnpm check` passed all five stages (TypeScript, lint, mobile tests, Python tests, fixture parity). Ignored detailed logs: `build/host-checks/20261026T101525Z-8f31c798/`. An earlier run failed because the screen harness did not mock the new recovery module; it was repaired, with no application failure hidden.
- Focused source and real host SQLite checks passed: persisted row after connection reopen, owner/store isolation, matching receipt/coverage, interrupted return, new component instance after restart, no repeat flight import, unfinished-source retry and foreign provider account rejection. After the final dialog correction, 76 affected component/coordinator tests, `pnpm typecheck` and `pnpm lint` passed. `pnpm bundle` exported Android and iOS JS bundles earlier in the package. The export is not an iOS runtime test.
- The committed-source Android Release build succeeded for `c3b7275` with embedded JS, arm64-v8a and x86_64. APK SHA-256: `07030f80bef8353209d3040cda90b5a6d44edc710abef24b370f97bb4fabf2f5`. The focused `MoFlight_Synthetic_API37` trial installed this APK without clearing app data. Opening Sync showed **Fortsetzen** and **Neu synchronisieren**; both remained available after a force-stop and relaunch. A presentation bug found in the first native trial was corrected before this final build. The test proves the recovery offer and local marker survived Android process restart; it does not prove authenticated provider continuation.
- Delivery: [Android Release ZIP](https://github.com/MomoRC-tech/MoFlight-App-framework/releases/download/sync-recovery-2026-10-26-c3b7275/moflight-sync-recovery-c3b7275.zip) contains only `app-release.apk` and sanitized `build.json` for the exact source commit above.

## Remaining gates

The focused native check used only `MoFlight_Synthetic_API37`; it cannot prove authenticated Vereinsflieger recovery without a valid provider session. Physical phone, actual second account, iOS runtime and live-source acceptance remain under #16/#8. A user still needs to reopen Sync and tap Continue; no OS background worker, automatic polling or completion guarantee is implemented.

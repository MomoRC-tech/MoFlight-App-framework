# Retained Vereinsflieger connection PoC — 17 October 2026

Subsequent bounded update: [safe disconnect and explicit re-login states](2026-10-17-safe-disconnect.md) follow this delivered increment. [Evidence](../verification/2026-10-17-safe-disconnect.md) distinguishes functional sign-out from unverified cookie clearing and successful re-login; the historical outcomes below remain unchanged.

## Authorization and milestone

Manuel selected connection as the next bounded increment and explicitly said **start** after reviewing the proposed scope. Track in existing [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6231189767) and [#5](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/5#issuecomment-6231190032). This advances an M1 interaction/M2 browser-boundary slice before the deferred Pixel retest. It does not accept M1/M2 as a whole or waive #8 physical/iOS acceptance.

Dependencies: approved native shell/SQLite stack, original-page probe, deterministic export/view protection, raw evidence store and existing observed-context reader. No added dependency, source transport, account schema, backend or credential policy.

## Delivered boundary

`useAccessController` owns the existing probe/export/restoration sequence. The legacy `AccessProbe` consumes its original presentation/commands; the shell owns a product instance above tab/sheet lifetimes. `ProviderConnection` keeps the WebView under one native parent and changes coverage/accessibility, never moving the browser into a native Modal or using tab/sheet visibility as its key. Product navigation uses explicit same-provider document navigation; legacy remount behavior remains for historical development tools. The browser is created only by an explicit connection/check action, with no automatic provider request on app startup.

The compact header indicator opens Connections; Profile → Connections → Vereinsflieger opens the same controller. Login shows the original page and actual validated HTTPS origin. After signing in, **Anmeldung prüfen** reads only the existing allowlisted profile-number/club-label evidence. No provider password fields are read. The broader optional Save/Use/Forget development implementation is preserved in the legacy tool; this slice adds no automatic password use.

The first observation requires deliberate confirmation for this development run. It is separate from the local display name, selected book, canonical data and MoFlight authentication. The label stays **Sitzung erkannt · Zuordnung vorläufig**; no green production-connected claim. A club display label is not a stable club ID. Raw evidence cannot become canonical history through this UI.

## Operation/state contract

| Operation or event | Ownership, result and UI behavior |
| --- | --- |
| Connect | Reveal original-page login without accepting a redirect/cookie as connection proof. |
| Check | Own a fresh nonce; require exact native profile document, matching bridge origin/message URL and nonce, bounded payload, validated context and actual observation timestamp. |
| Initial association | Require explicit confirmation of observed account/club for this app run; keep production binding unknown. |
| Repeat check | Compare with the previously confirmed association; a mismatch blocks capture and cannot silently replace it. |
| Retrieve | Recheck context, then use the existing bounded date/export/view-journal path. Current-year default remains this PoC's bound, with explicit adjustable dates; full automatic refresh/coverage planning remains open. |
| Capture completion | Recheck numeric account/club before raw save. On mismatch, reject the new capture and retain the recovery journal without attempting restoration in a different account. |
| Restore | Preserve snapshot → durable journal → protected backup/export → restore/readback. Recheck context again before clearing the journal. Journal failure/recovery blocks further exports. |
| Close login/check | Idle checking may be canceled; late responses lose ownership. Closing during owned capture/restoration only hides presentation. |
| Cancel retrieval | Preserve the existing saving lock and restore path; already-started SQLite writes finish before their verdict. Prior evidence/history remains. |
| Tab change | Retain the browser, current operation, filters and independent book state. Reopen Connections for progress/cancel. |
| Background/renderer loss | Invalidate current session confidence; stop new export work and retain durable recovery when needed. No uninterrupted background/locked-phone claim. |
| Error or expired login | Distinguish known login-required evidence from unknown network/page failure. Keep prior data; offer explicit sign-in/check/retry. Offline is not inferred from every WebView error. |

`ConnectionSession` is pure and owns observation tokens/provisional association only. `lastCheckedAt` is informational after invalidation; `lastSuccessfulCaptureAt` is a distinct app-run timestamp set only after raw save. It does not claim a successful canonical refresh, full history coverage or a verified session after restart.

Raw capture remains in the existing separate probe database. No second canonical writer or flight import is added. Existing provider tools are blocked while the shell browser/recovery owns the provider workflow; closing old tools rereads recovery before further product work. Closing is not logout. Full cookie/session disconnect and production account switching remain unimplemented; forgetting optional saved credentials does not establish logout.

## Acceptance and limits

- Preserve legacy preference/recovery regression tests; add controller tests for nonce/origin rejection, deliberate association, mismatch before raw save, hide/cancel/retry and background during durable writes.
- TypeScript and Android/iOS exports, then a Release build from committed source with measured checksum and architectures.
- Credential-free synthetic native checks: header/Profile entry, truthful initial/error state, back/tab behavior, local data preserved, MIN 360 / MAIN 390–412 / MAX 600+ dp, font scale and landscape. Record actual dimensions/density/font scale and inspect screenshots.
- Hidden JavaScript execution and genuine provider login/raw capture/restoration require separate native evidence. No synthetic page/mock/controller test establishes live hidden retrieval. Natural expiry, second account, full disconnect, process-loss recovery and iOS remain open unless actually executed.
- Physical Pixel retest remains deferred at Manuel's request; do not request more tests until he resumes.

The [earlier interaction proposal](2026-10-17-vereinsflieger-connection-ui.md), [connection journey](vereinsflieger-connection-and-retrieval.md), [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md) and accepted [ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md) retain wider requirements and native evidence gates.

Completed local checkpoint: [149 tests, Release build, 16 synthetic native checks and bounded Android live observations](../verification/2026-10-17-connection-controller-poc.md). This supports the measured slice; remaining acceptance above stays open.

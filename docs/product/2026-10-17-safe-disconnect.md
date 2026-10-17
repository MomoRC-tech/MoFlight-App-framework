# Safe disconnect and re-login — 17 October 2026

## Authorization and milestone

Manuel explicitly said **do it** after the bounded package proposal. [Proposal](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6231747543) and [start authorization](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2#issuecomment-6231895092) extend existing #2, coordinated with #5/#8. This is an M2 reliability slice with M1 connection interactions. Canonical import, production account/schema/credential policy, new dependencies/transports, paid services and broad process-loss work remain outside scope. Pixel testing stays deferred.

Dependencies: delivered retained controller, validated profile/context reader, original provider page, journal/recovery and existing development SecureStore Save/Use/Forget. No second data writer.

## Implemented operation contract

| Operation | Boundary |
| --- | --- |
| Disconnect | Only while foreground, recovery has been read and is empty, and no check, login operation, capture, save or restoration owns the workflow. Otherwise cancel/finish retrieval and verify restoration first; explicitly retry disconnect. No queued destructive action after a save. |
| Provider logout | Opens the original protected profile in the retained browser. The user chooses the provider's own **Abmelden** control. No guessed logout endpoint or recreated protocol. |
| Verify sign-out | Explicit **Abmeldung prüfen** freshly requests the protected profile with an owned nonce. Only supported sign-in-required evidence on that document, or the exact original login form after redirect, establishes signed-out state. Successful page loads, redirects alone, offline errors and still-readable profiles do not. |
| Cancel / error / background | Invalidate confidence and check ownership; retain data, recovery and the previous association. No logout success is claimed. Ordinary hide during owned capture/restoration keeps its previous presentation-only meaning. |
| Re-login | Original provider sign-in followed by a new context check. Existing development saved-login use is exposed as a separate explicit one-attempt action; never read at startup or automatically on reconnect. Closing/backgrounding prevents a deferred credential read from submitting later. No production credential policy is selected. |
| Forget saved credentials | Explicitly deletes only app-owned SecureStore login, with distinct success/failure feedback. Does not end browser sessions, delete OS autofill or erase flight data. Serialized with owned login/browser operations. |
| Account/club change | Prior provisional association survives verified disconnect and re-login within this app run. Different account number or club label remains blocked; no automatic rebind or journal transfer. Stable production binding and durable cross-run identity remain open. |

`disconnectedAt` is an app-run sign-out-verification timestamp, separate from previous session-check and successful raw-save times. Later sign-in still requires a fresh check. Existing local flights, books, raw captures and recovery journals are not deleted by disconnect/forget.

## Session-store limits

The pinned WebView public API has no cookie-deletion method. Cache/history clearing does not establish cookie clearing; an incognito toggle would affect the shared native store and is not used. This package verifies functional provider sign-out through the original interface and a fresh protected-page request. It does **not** claim removal of every cookie, server-wide revocation, other-device/browser logout or platform parity. Complete session-store clearing remains tracked under #2. No cookies, hidden fields or existing provider credential values are inspected.

## Acceptance

Controller regressions cover blocked startup/recovery/save, logout versus valid profile, canceled/stale/background/error checks, fresh redirect proof, retained association, deferred-login cancellation and independent credential forgetting. Meaningful local checks and Android/iOS exports precede a committed-source Android Release/lintVital and native trials. Synthetic native changes must use verified **MoFlight_Synthetic_API37** only; record MIN360/MAIN390–412/MAX600+, enlarged text/keyboard and actual dimensions. Bounded live provider logout/re-login is a separate intentional trial; no reset or journal deletion. Natural expiry, second account, fresh credential/OTP and iOS remain not tested where unavailable.

[Verification and actual limits](../verification/2026-10-17-safe-disconnect.md) records results; implementation alone does not pass native acceptance or close M1/M2/#2/#5/#8.

# Vereinsflieger connection UI — future implementation

Date: 2026-10-17. Tracking: existing [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), coordinated with #5 (shell), #8 (device verification), #10 (source semantics) and #15 (privacy). No duplicate issue or implementation is required by this capture.

## Status and scope

Manuel requests a compact header symbol showing the Vereinsflieger connection state and clarification of when/how connection is established. He suggests a popup for login/password entry. The header indicator is a requested future requirement; the interaction/state model below is an engineering proposal, not completed UI or new transport approval. M1 specifies the interaction; M2 implements the existing browser connector boundary after the updated phone-demo physical retest. Canonical live-history import remains M3.

Current app: the five-tab shell has a profile control but no provider-connection indicator. The separate development access tool has visible WebView login/capture and optional SecureStore Save/Use/Forget login controls. It is not yet a product connection flow. Existing raw captures do not populate the synthetic dashboard as genuine canonical history. Preserve MoFlight account identity, local library identity, provider account/club and book identity as separate concepts.

## Proposed user journey

1. Add a compact connection symbol adjacent to the top-right profile action. Keep the header compact and fixed. A 48 dp touch target, icon shape plus accessible status text and optional short label avoid color-only communication.
2. On a fresh/unlinked installation show **Nicht verbunden**. Do not force login to browse offline/local data. Offer connection when the user taps the symbol, selects **Profil & Einstellungen → Verbindungen → Vereinsflieger**, or requests **Flüge aktualisieren** without a valid connection.
3. Open a clearly titled modal sheet **Mit Vereinsflieger verbinden**, identifying the real HTTPS provider origin. Prefer the provider's original sign-in page within the sheet, with normal password-manager/autofill behavior where supported; do not recreate or silently read its password fields. Allow the sheet to expand for provider verification and at 360 dp with keyboard/enlarged text. Existing opt-in app-managed saved-login entry may be exposed as a separate explicit development option using the existing SecureStore boundary; it is never the default inferred from this popup suggestion.
4. After successful sign-in, verify available source account/club evidence and confirm the local-library association before accepting data. A redirect, stored cookie or successful page load alone is insufficient. Where stable identity cannot be verified, show that unresolved state and stop before canonical import.
5. Close the login sheet and return to MoFlight. Show the last verified connection/check time independently from **Letzter erfolgreicher Abruf** and coverage. Reuse the session on subsequent user-triggered retrieval, checking validity and account scope each time. First retrieval suggests current/previous year with optional adjustment; later ranges use the existing proposed coverage/overlap contract, not just the last button-press date.
6. During retrieval show progress, cancel and error/retry in MoFlight. Preserve previous saved data on failure. Reopen the provider sheet only for sign-in, verification, account selection or a recovery action requiring the user.
7. Disconnect stops retrieval and clears the provider session plus any optional saved credentials through their respective operations. Keep local flight history unless separately deleted. **Forget saved password** alone does not establish provider logout. Account changes require deliberate re-verification and isolation.

## Proposed status model

| State | Header/detail meaning and action |
| --- | --- |
| Not connected | Neutral broken-link icon; tap to connect |
| Checking/signing in | Pending/spinner; sheet explains current action; cancel available |
| Session verified | Positive link/check icon only after verified session/account evidence; show last-check timestamp; recheck before retrieval |
| Retrieving | Blue activity indicator and progress; keep session status and retrieval progress separate internally |
| Sign-in required | Amber key/warning; reopen login, preserve local history |
| Offline or not recently checked | Offline/unknown marker; prior verification timestamp remains informational, no claim of a current live connection |
| Retrieval failed / identity mismatch / recovery pending | Distinguish network/data error from expired login; show actionable detail and retain earlier successful snapshot. Identity mismatch blocks application of data |

A valid session is not proof that flight data is fresh or complete. The connection symbol represents provider authorization/connectivity; an adjacent or detail timestamp represents successful data retrieval. Do not conflate either with paper writing, cloud sync, medical status or MoFlight authentication.

## Does the provider website need to stay visible?

**Product requirement: no, after login ordinary retrieval should show MoFlight UI.** This was already confirmed on 2026-10-10 in [the existing connection journey](vereinsflieger-connection-and-retrieval.md#provider-page-visibility--confirmed-by-manuel-2026-10-10). The current engineering probe still displays it; hiding it has not been implemented or verified.

Proposed implementation: retain one owned/mounted browser session and connector controller while showing MoFlight progress over the provider content. The browser must remain alive for navigation/JavaScript/cookies; dismissing a modal must not destroy the active connector. Prove the chosen hidden/covered rendering strategy on Android and iOS before claiming it works. Website visibility and app foreground execution are different: browsing another MoFlight tab may be supported after lifecycle tests; switching to another app or locking the phone must not be promised as uninterrupted retrieval. Persist verified checkpoints and resume/recheck on return, including renderer/process loss and session expiry.

Android documents both [WebView lifecycle/memory management](https://developer.android.com/develop/ui/views/layout/webapps/manage-webview-memory) and [activity lifecycle restrictions](https://developer.android.com/guide/components/activities/activity-lifecycle). These support the need for lifecycle handling, not a claim that MoFlight's hidden adapter already works. A future permitted native API route could avoid a rendering engine but remains conditional; no switch from the approved browser-first route is implied.

## Acceptance and remaining decisions

- Verify connection/expiry/offline/unknown/error/recovery statuses against genuine controller evidence; no green icon from a cookie alone.
- Native trials: connect/cancel/reconnect, keyboard/autofill, provider verification where available, wrong credentials, restart, natural expiry, account/club mismatch, second-account isolation, disconnect, saved-login forget, and no secrets in logs/backups.
- Hidden foreground retrieval: all pages/filter restoration/cancel/retry, tab switching, rotation, background/return and renderer/process loss without duplicate imports or loss of prior data. Hidden raw capture is not canonical import acceptance.
- Apply MIN 360, MAIN 390–412 and MAX 600+ dp strategy; enlarged text, modal Back/close and keyboard-safe controls. Do not stretch the header or overlay status on the logo/profile control.
- Open: exact icon/label, header space, popup size, verified account/club evidence, session-check freshness policy, recovery controller ownership, production saved-login policy and iOS behavior. The popup is a preferred proposal; implementation remains scheduled later.

# ADR 0006: Phone-local Vereinsflieger connector feasibility

- Date: 2026-10-10
- Status: Browser-route priority confirmed by Manuel on 2026-10-10; implementation details proposed
- Decision owner: Manuel Singer
- Tracking issue: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2)
- Evidence: [investigation](../architecture/vereinsflieger-access-investigation.md), [live checks](../verification/2026-10-10-vereinsflieger-access.md)

## Context

Users should connect their own Vereinsflieger account in MoFlight and retrieve their own flights. They should not need to request individual API keys without a demonstrated requirement. The current native lab is Expo/React Native with local SQLite; Supabase integration is independent.

A secure interactive browser login and the personal flight-list UI have been verified. The authenticated provider REST help says a club administrator creates an AppKey, limits calls to 500/day/key and generally prohibits commercial API use. The current API specification remains unverified/future-only. A subsequent bounded Android trial verifies original-page login, capture and offline reopening; it does not establish the production connector contract. A historical investigation ZIP is documentation, not a runnable Kotlin implementation.

## Options

| Option | Benefit | Constraint |
| --- | --- | --- |
| Supported REST/partner integration | Might work in the future | Unavailable for this project; parked, not a current prerequisite |
| Phone-local WebView plus export/structured response | Original provider login and session; fits local-first; no hosted browser required | Must verify download/response, terms, account identity and Android/iOS behavior |
| Phone-local WebView plus strict table adapter | Personal list and column metadata observed | Fragile presentation contract; complete coverage/details/schema validation required |
| Native HTTP web-login recreation | Efficient after a verified protocol | App handles credentials and duplicates provider authentication behavior; full trace missing |
| Hosted browser/B4Takeoff intermediate | Could serve other access scenarios | Extra credential/session custody, operational dependency or subscription; unnecessary for initial slice |

## Confirmed direction and proposed implementation

Prepare a bounded connector trial in the existing native lab using original-page WebView login and the same browser session. Investigate a regular machine-readable own-flight export first, then an observed structured read response, then a strict list/detail adapter. A bounded read-only table probe is implemented now because that table was directly observed, while export bytes and structured endpoints remain unverified; it is an access experiment, not a final transport decision. These are candidates, not proven data endpoints. Do not add a second application framework or require MoFlight cloud login.

Manuel explicitly selected browser-based access as the current direction and stated that the official API is unavailable and is not the preferred route. Keep REST/partner integration only as “might work in the future”; API PDF/key/partner work does not gate the current trial. Detailed WebView extraction and persistence implementation remains proposed.

Users type credentials into the provider page. The implementation deliberately does not inspect password fields or enable an extraction bridge on login pages. Data extraction returns validated flight records and source context only. Session validity and source account/club are separate from MoFlight dataset/account selection. CSV/manual import remains an independent fallback.

Manuel also confirmed the visibility progression on 2026-10-10: showing the signed-in provider webpage is acceptable in the current PoC. Later, show the original provider interface for sign-in/required verification, then return to MoFlight and hide provider navigation during user-triggered retrieval, using an action such as “Get my data from Vereinsflieger.de.” The [visibility requirement](../product/vereinsflieger-connection-and-retrieval.md#provider-page-visibility--confirmed-by-manuel-2026-10-10) is confirmed; its implementation remains open. This does not approve app-owned password storage, a final extraction transport or unattended OS background sync.

Manuel authorized investigation, offered login access and confirmed the browser-route priority. This does not approve an untested production connector or app-owned password capture. The [user journey](../product/vereinsflieger-connection-and-retrieval.md) distinguishes session reuse from optional device-local password storage; the latter would require explicit credential handling beyond the initial original-page login. Subsequent implementation: Manuel selected this as the next essential PoC. The native lab now contains a bounded read-only access probe and pins Expo SDK 57's recommended WebView 13.16.1; it captures the observed personal table before canonical integration. [Probe evidence](../verification/2026-10-10-vereinsflieger-native-probe.md) records the original implementation checks; [Windows continuation](../verification/2026-10-10-windows-desktop.md#live-android-bounded-capture-and-restart) subsequently verifies bounded native login/retrieval and offline reopening while leaving identity, full coverage, transport and canonical import acceptance open. This does not accept an unverified production connector.

## Consequences

The initial browser approach needs no Supabase or hosted headless browser and can cache retrieved flights locally for offline use. It may require occasional foreground re-login; unattended background sync is not promised. Password-manager/passkey behavior, cookie persistence, session backup exclusion and clearing must be proven per platform. WebView hosts technically can inspect page content, so privacy is an implementation invariant to test.

Export or table changes must cause a visible error while retaining earlier imported history. Limited-period omissions are not deletions. Crew roles and unknown time basis remain explicit. General REST commercial restrictions and unresolved browser integration terms must stay visible in product planning.

## Validation

Completed browser/public checks are recorded in the evidence report; they do not pass native R12. The next native slice must demonstrate original-page login, source identity/club, bounded retrieval and summary, restart/session reuse, field/reference comparison, repeat import without duplicates, expired-session handling, logout/account-switch separation and offline reuse. Verify 2FA if an authorized test account actually offers it. Run Android and iOS separately; record blocked devices and network observation limitations honestly.

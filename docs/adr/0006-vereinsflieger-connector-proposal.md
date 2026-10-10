# ADR 0006: Phone-local Vereinsflieger connector feasibility

- Date: 2026-10-10
- Status: Proposed
- Decision owner: Manuel Singer
- Tracking issue: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2)
- Evidence: [investigation](../architecture/vereinsflieger-access-investigation.md), [live checks](../verification/2026-10-10-vereinsflieger-access.md)

## Context

Users should connect their own Vereinsflieger account in MoFlight and retrieve their own flights. They should not need to request individual API keys without a demonstrated requirement. The current native lab is Expo/React Native with local SQLite; Supabase integration is independent.

A secure interactive browser login and the personal flight-list UI have been verified. The authenticated provider REST help says a club administrator creates an AppKey, limits calls to 500/day/key and generally prohibits commercial API use. The current API specification and native phone connector remain untested. A historical investigation ZIP is documentation, not a runnable Kotlin implementation.

## Options

| Option | Benefit | Constraint |
| --- | --- | --- |
| Supported REST/partner integration | Stable documented contract; preferred if obtainable | Club/key scope, mobile-safe auth, member rights, shared quota and commercial arrangement unresolved |
| Phone-local WebView plus export/structured response | Original provider login and session; fits local-first; no hosted browser required | Must verify download/response, terms, account identity and Android/iOS behavior |
| Phone-local WebView plus strict table adapter | Personal list and column metadata observed | Fragile presentation contract; complete coverage/details/schema validation required |
| Native HTTP web-login recreation | Efficient after a verified protocol | App handles credentials and duplicates provider authentication behavior; full trace missing |
| Hosted browser/B4Takeoff intermediate | Could serve other access scenarios | Extra credential/session custody, operational dependency or subscription; unnecessary for initial slice |

## Proposed decision

Prepare a bounded connector trial in the existing native lab using original-page WebView login and the same browser session. Investigate a regular machine-readable own-flight export first, then an observed structured read response, then a strict list/detail adapter. These are candidates, not proven data endpoints. Do not add a second application framework or require MoFlight cloud login.

Keep the official REST API as the preferred supported contract if key/auth/usage conditions can be resolved. Obtain current documentation and clarify a multi-club application arrangement before concluding the browser path is the only possibility. A confidential AppKey stays off the phone; do not implicitly adopt a credential-relaying backend as a solution.

Users type credentials into the provider page. The implementation deliberately does not inspect password fields or enable an extraction bridge on login pages. Data extraction returns validated flight records and source context only. Session validity and source account/club are separate from MoFlight dataset/account selection. CSV/manual import remains an independent fallback.

Manuel authorized investigation and offered login access; this is not recorded as binding approval of a production connector, third-party terms, vendor outreach or paid use. No connector dependency/code was introduced by this ADR.

## Consequences

The initial browser approach needs no Supabase or hosted headless browser and can cache retrieved flights locally for offline use. It may require occasional foreground re-login; unattended background sync is not promised. Password-manager/passkey behavior, cookie persistence, session backup exclusion and clearing must be proven per platform. WebView hosts technically can inspect page content, so privacy is an implementation invariant to test.

Export or table changes must cause a visible error while retaining earlier imported history. Limited-period omissions are not deletions. Crew roles and unknown time basis remain explicit. General REST commercial restrictions and unresolved browser integration terms must stay visible in product planning.

## Validation

Completed browser/public checks are recorded in the evidence report; they do not pass native R12. The next native slice must demonstrate original-page login, source identity/club, bounded retrieval and preview, field/reference comparison, repeat import without duplicates, expired-session handling, logout/account-switch separation and offline reuse. Verify 2FA if an authorized test account actually offers it. Run Android and iOS separately; record blocked devices and network observation limitations honestly.

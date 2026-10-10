# Vereinsflieger: in-app connection and flight retrieval

Date: 2026-10-10. Product owner: Manuel Singer. Tracking: [FL-03](flight-logbook-user-stories.md), [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2). Browser-based route and automatic range selection confirmed by Manuel; detailed retrieval implementation below is proposed. An isolated bounded native access probe now verifies Android original-page login, session reuse, capture of 20 visible rows and offline reopening on the Windows API 37 emulator; see [desktop evidence](../verification/2026-10-10-windows-desktop.md#live-android-bounded-capture-and-restart). Long-lived saved-login behavior, verified identity/time basis and complete retrieval remain open. Full product integration remains open.

## User story

As a pilot, I want to connect my Vereinsflieger account inside MoFlight, keep that connection on my phone and retrieve my own flights with one action, so that I do not repeatedly type credentials, navigate Vereinsflieger or export files manually.

The official API is unavailable for this project and remains only **“might work in the future.”** AppKeys, API specifications and partner arrangements are not prerequisites for this workflow. Use the existing Expo/React Native app, with phone-local data and no required MoFlight cloud login.

## Required interaction

| Situation | User action | App behavior |
| --- | --- | --- |
| First connection | Select the local dataset, tap “Connect Vereinsflieger,” sign into the original provider page inside MoFlight, and complete any provider verification | Show the real HTTPS provider identity. After login, verify source identity/club context and ask the user to confirm the dataset association once |
| First retrieval | Tap “Retrieve flights”; no date-range or provider-filter selection required | Automatically select own-flight scope and retrieve accessible history in bounded windows, prioritizing the paper continuation where its anchor is known. Save verified coverage and show progress plus added/changed/excluded counts |
| Later retrieval | Tap “Retrieve flights”; no date-range selection required | Reuse the valid session and automatically plan new coverage, an overlapping recent range and outstanding history gaps/rechecks. Navigate/retrieve/import in the foreground; no password entry or redundant per-flight confirmation |
| Session expired | Complete the provider sign-in again; use available autofill and verification if offered | Show “Sign in again,” preserve existing history and resume the requested retrieval after successful account verification |
| Offline | Open the app or query previously imported flights | Use the last successful snapshot; show its date/coverage. New retrieval waits for connectivity |
| Relevant ambiguity | Answer a specific question about an account mismatch, duplicate or decisive missing field | Preserve both source evidence and existing decisions; do not silently guess or repeatedly ask already resolved questions |
| Disconnect | Tap “Disconnect Vereinsflieger” | Stop retrieval and clear connector sessions and any optional saved credentials; imported flight history remains unless separately deleted |
| Different provider account | Deliberately reconnect and select/create the appropriate dataset | Clear the old session and verify the new account. Never silently transfer or relabel another account's records |

A successfully implemented journey stays inside MoFlight. It does not require a separate browser, the Vereinsflieger app or a manual file handoff. A provider export, if selected as the retrieval format, is handled privately by the connector. Manual CSV import remains a separately labeled fallback.

“Connected” is not proof that authentication is still valid. Show “Last retrieved: …” and actual coverage; check the provider session before every online retrieval. Existing offline history does not depend on staying signed in.

## Provider-page visibility — confirmed by Manuel, 2026-10-10

The provider webpage may remain visible after login during the current engineering PoC. This is accepted temporary behavior; the user does not request a visibility change to the running probe yet.

The later product flow is:

1. The user connects and signs in through the original provider interface inside MoFlight, completing any provider verification there.
2. After successful sign-in, return to MoFlight's own connection/retrieval screen. The provider's flightbook and navigation are hidden during ordinary retrieval.
3. The user presses a MoFlight action such as **“Get my data from Vereinsflieger.de”**. This is a working label, not a final wording decision. Reuse the provider session and automatically navigate/retrieve the user's own flights without exposing provider filters, pages or export steps.
4. Show MoFlight progress, errors and a retrieval summary, then the locally available data. If the session expires or provider interaction is required, show the provider interface again and return to MoFlight afterward.

Hidden provider navigation means retrieval behind MoFlight's UI while the app is in use; it does not establish OS background execution or scheduled sync. The connector must retain its browser/session lifecycle while hidden. Page visibility is independent of password storage, final transport selection, verified coverage and canonical import. This flow is a confirmed product requirement; hidden retrieval has not been implemented or tested by this clarification.

## Automatic range selection — clarified by Manuel, 2026-10-10

The user does not need to understand export periods, paging or provider filters. “Retrieve flights” is the normal action; the connector selects the appropriate dates and own-flight scope. Date selection is an optional advanced control only, never a prerequisite.

- First connection: target all own-flight history accessible to this account, in bounded windows. If a confirmed paper anchor exists, prioritize that continuation period, then fill older history for statistics. Otherwise start with recent flights and extend backwards. Show incomplete/backfill status until actual coverage is verified; provider restrictions remain explicit.
- Repeat retrieval: use the last successfully verified coverage, not merely the last button-press time. Include an overlap to catch late entries and edits; resume known gaps and reconcile older windows over subsequent foreground runs. Exact window sizes/overlap are adapter configuration to establish in native trials, not user decisions.
- Do not claim an overlap detects every historical change. Report which periods were refreshed, and offer “Refresh full history” without requiring dates.
- Interrupted/partial retrieval preserves verified chunks and prior history, records remaining gaps and never advances the complete-coverage marker over missing windows. Repeated source records are handled idempotently.
- The first engineering proof uses a small automatically configured test window. That safety bound belongs to the test setup, not to the normal product's required user interaction.

These are product requirements and proposed scheduling rules, not implemented or verified provider capabilities.

## What the app does to retrieve data

1. Open or reuse a persistent native WebView on the exact Vereinsflieger HTTPS origin. The browser executes the provider's own login JavaScript and maintains its cookies.
2. Verify the signed-in source identity and relevant club context before using the personal flightbook at the observed path `/member/profile/flightlog.php`. Do not infer success from a redirect or an empty list alone.
3. Apply the app-selected own-flight filters/range from the automatic retrieval plan and retrieve within the same browser session. Investigate actual Excel export first; provider help names Excel/PDF, not a verified CSV endpoint. If export is unsuitable, use a structured read response observed during normal browsing; otherwise use a strict table/detail adapter. Export bytes, JSON endpoints, paging and detail IDs remain unverified.
4. Validate fields, source references, crew roles, time basis and actual coverage. The app traverses necessary pages/range windows without assuming the observed last-20 view is all history.
5. Stage the complete bounded result, then apply it through the deterministic local importer. Repeat retrieval must preserve IDs and avoid duplicate imports. Schema errors or interrupted retrieval preserve the previous successful snapshot; missing rows in limited coverage never imply deletion.
6. Show a concise result and ask only for unresolved decisions. Imported history remains available offline.

Use a narrow data bridge only on validated own-flight pages, with bounded typed messages. Login pages have no extraction script or flight-data bridge in the initial design. Keep cookies in the browser store; do not assume native `fetch` shares that store. Domain/path checks, redirects/new windows and account switching require explicit tests. A browser-like HTTP workflow is required; reproducing login with a separate raw HTTP client is deferred until an observed protocol demonstrates a benefit.

## Can the phone remember the login?

Yes, but remembering a session and saving a password are different features.

| Option | What stays on the phone | Interaction later | Proposed place in delivery |
| --- | --- | --- | --- |
| Remember the session | Provider-issued cookies in the WebView's persistent browser store | No credential entry while the provider accepts the session | Initial approach; test restart and provider “Angemeldet bleiben” behavior |
| System password-manager/autofill | Credentials managed by the user's chosen OS/password manager | Autofill and possibly device unlock on re-login | Useful enhancement; availability and WebView matching require device tests; sync behavior belongs to the chosen manager |
| Optional “Save login on this phone” | Explicitly supplied username/password in OS-protected app storage, separate from flight data | Refill login after device authentication as configured; provider may still require verification | Explicit device-local saving/use approved by Manuel for development on 2026-10-10; optional Save/Use/Forget flow implemented, native verification recorded separately |

For the initial approach, users enter credentials only into the provider's original page. MoFlight deliberately does not read those fields. If the provider's “Angemeldet bleiben” option is offered, users may choose it; its actual lifetime and native restart behavior must be measured. Cache settings alone do not establish persisted authentication. Manuel reports enabling the provider’s “stay signed in” option before his latest emulator login on 2026-10-10; session reuse remains primary, with saved login as a fallback. Its actual lifetime remains to be measured.

Manuel explicitly selected optional app-owned device-local saving/use for the development phase on 2026-10-10, to reduce desktop sign-in handoffs when working remotely. The implemented opt-in screen requires one explicit app credential entry; existing provider passwords are not collected from the webpage or a password manager. Save/Use/Forget are separate actions. The stored login is used only on the exact original HTTPS root login page, through its observed original form/submit handler, once per explicit attempt. No silent retry loop, OTP capture or authentication bypass is introduced. See [saved-login evidence](../verification/2026-10-10-vereinsflieger-saved-login.md).

For app-owned password saving, use a clearly explained credential-entry flow; do not silently scrape a website password field. `expo-secure-store` supports encrypted device-local values: Android uses Keystore-protected storage and iOS uses Keychain. Configure iOS device-only access and exclude credentials from backups/device migration; optional biometric protection must be tested on real devices. Never put credentials in SQLite flight records, JSON backups, telemetry, Git or a MoFlight server. Credentials are still sent over HTTPS to Vereinsflieger for sign-in.

SecureStore does not manage WebView cookies. Test cookie persistence, clearing and backup exclusion separately. iOS Keychain items can survive uninstall; explicitly clear saved secrets on disconnect/forget and define fresh-install handling rather than promising uninstall wipes them. “Forget saved login” removes optional stored credentials without erasing imported flights.

The goal is **enter credentials once during normal use**, not “never sign in again.” Provider expiry/revocation, password changes, account switching, verification and device changes can require interaction. Saving a password does not bypass 2FA; no OTP or authenticator seed is stored. Start with foreground retrieval, not an unattended background-login loop.

## Native proof required next

The local Android emulator now verifies original-page login, session reuse, bounded raw capture and offline reopening; [desktop evidence](../verification/2026-10-10-windows-desktop.md#live-android-bounded-capture-and-restart) records the precise limits. These results do not establish iOS or complete product acceptance. Remaining checks include:

- iOS original-page login/retrieval, provider verification if available, and verified source identity/club binding on both platforms.
- App close/force-stop/restart and device restart with a remembered session; measure expiry and the provider's stay-signed-in option.
- Actual export/response/table mapping compared privately with a known reference, full requested coverage and repeated import.
- Expired/revoked session, wrong password, challenge/2FA, canceled login and network interruption without history loss.
- Disconnect/account switch and cookie clearing; browser/credential backup exclusion and optional autofill behavior.
- Canonical imported flights queried offline, iOS offline reopening, and the confirmed hidden-provider retrieval flow. Android raw-capture reopening already passes. Optional password storage adds real-device secure-storage/forget/biometric tests only if selected.

A plausible architecture is not a passed phone test. [Investigation](../architecture/vereinsflieger-access-investigation.md), [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md) and [actual live evidence](../verification/2026-10-10-vereinsflieger-access.md) record the boundary.

## Primary technical references

Checked 2026-10-10; documentation support does not substitute for native runtime checks.

- [Expo WebView, SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/webview/) and [React Native WebView reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md): native embedded browser and configuration.
- [Android CookieManager](https://developer.android.com/reference/android/webkit/CookieManager): cookie persistence/flush and removal. The provider determines whether a cookie remains valid.
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/): OS-protected local values, device-only Keychain accessibility, backup configuration, biometric and uninstall behavior.

Documentation verification for this clarification: relative links and FL-03/#2/README consistency checked; no new native or live retrieval tests claimed. Automatic range selection is confirmed, while extraction and scheduling implementation remains open.

## Current first PoC implementation

Manuel selected in-app access as the next essential proof before broader feature expansion. The [native runbook](../../apps/platform-lab/README.md#vereinsflieger-access-poc) describes the implemented login/table-capture slice. It automatically opens the observed personal list and bounds extraction to at most 20 visible rows; it does not ask the user for dates. Identity, time basis and coverage are explicitly unverified; captures stay separate from canonical logbook records. The first PoC does not yet implement all-history scheduling or account-bound import. Optional protected device-local saved login is now implemented separately after explicit development authorization; native checks are recorded in the saved-login evidence. [Actual checks and limits](../verification/2026-10-10-vereinsflieger-native-probe.md).

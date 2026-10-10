# Own-flight access investigation

Tracking [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), with later broader information inventory in #10. Updated 2026-10-10. **Interactive browser login and the personal flight-list UI are now verified. An authenticated provider help page resolves club-key creation, the daily API limit and the general commercial-use restriction. Native app retrieval, the REST flight contract and distribution terms remain unverified; no transport has been accepted.**

## Current recommendation — 2026-10-10

Investigate two routes without making the user obtain an individual API key:

1. **Preferred supported interface, if access conditions can be met:** the official REST API. Its authenticated help now says a club administrator creates the key. Determine whether MoFlight can obtain an application/partner arrangement covering independent clubs, ordinary members and eventual commercial distribution. Do not assume such an arrangement exists.
2. **Recommended immediate native feasibility trial:** a phone-local WebView connector. Users sign into the original Vereinsflieger HTTPS page; MoFlight deliberately does not read, log or store password fields. Keep retrieval in that same WebView session initially. Prefer a verified machine-readable export or structured response; use a strict table adapter if these are unavailable. A browser-session export can avoid fragile table parsing while preserving the ordinary member login.

This is the proposal in [ADR 0006](../adr/0006-vereinsflieger-connector-proposal.md), not accepted production architecture. The [live investigation evidence](../verification/2026-10-10-vereinsflieger-access.md) separates actual browser observations from untested mobile behavior. The existing Expo/React Native choice remains in place; the earlier ZIP's Kotlin suggestion is historical.

### What the live account test established

Manuel offered login access for this investigation. Credentials were entered through a private browser sign-in capability that did not return their values to the agent. The rendered signed-in overview and personal flightbook were verified. No credential values were read or stored by the agent. Provider/browser handling of the login and session still occurs; this does not mean that the WebView host is technically incapable of reading a password.

| Evidence, 2026-10-10 | Result | Limit |
| --- | --- | --- |
| Personal flightbook `/member/profile/flightlog.php` | Twenty current list rows; date, aircraft/type, separate Pilot/PIC/Begleiter/FI, launch/flight type, places, times, duration and additional time columns are present | Bounded last-20-flights/max-24-months view; not complete history, exported data or an Android/iOS test |
| Personal flightbook help, `hid=16002` | Provider describes adjustable period, pilot/companion/all selection, detail view, and Excel/PDF generation | Export bytes, complete field contract and export automation not tested |
| REST help, `hid=21101` | Provider says AppKey is created under Administration → Verein → Einstellungen → REST Interface; 500 calls/day attributed to each key; commercial use generally prohibited | No key was created/read; ordinary-member REST permissions and multi-club/partner arrangements unresolved |
| Provider REST download link | Current authenticated help links `/member/help/download?file=VereinsfliegerRestInterface.pdf` and a PHP wrapper | Browser credential protection blocked the download; specification was not read. Historical `download.php` failure must not be treated as no API |
| Public HTTPS login metadata | PHP session cookie has Secure, HttpOnly, SameSite=Strict; login uses visible user/password inputs plus hidden/dynamic fields | No replayable login request, session rotation, expiry, 2FA or passkey evidence |
| Existing 2026-10-05 ZIP | Read investigation notes and mapping, including prior interactive-login success | Contains documentation and a synthetic model, not a runnable Android WebView implementation or APK |

The API key is therefore **club-created according to current provider help**, rather than a verified per-user requirement. Earlier third-party references saying to request a key from support are research leads and may describe another arrangement. A club key also does not automatically authorize unrelated clubs. The provider restriction applies to the REST interface; reading that sentence does not establish either permission or a prohibition for a WebView connector.

### Alternatives and decision rationale

| Route | Login/session handling | Suitability for MoFlight |
| --- | --- | --- |
| Official REST API | Documented provider auth still needs to be read; club AppKey confirmed | Best candidate for a stable data contract. Club coordination, quota sharing, distributed-key handling and commercial arrangement must be resolved. Users need not be asked for personal keys unless current docs actually require them. |
| Original-page WebView plus export | User enters credentials on provider page; browser handles its cookies and login JS | First native trial recommendation: no cloud server or application key needed for the browser path. Verify actual Excel/CSV format, fields, download handling and terms. CSV availability is not established by the help, which names Excel/PDF. |
| Original-page WebView plus structured response | After login, use only a read operation observed during normal own-flight use, within the same session/origin | Potentially clean data with no cookie transfer. No flight JSON endpoint is proven. Hidden XHR does not make an API supported or stable. |
| Original-page WebView plus table adapter | Parse the confirmed personal list/detail UI and return bounded typed data | Technically plausible fallback with visible evidence. Column/preset/layout changes and paging require strict validation and explicit failure; not a permanent vendor contract. |
| Native HTTPS client reproducing web login | App handles password and dynamic login protocol, redirects, cookies and further authentication | Defer. Requires full observed request evidence, increases password handling and maintains both login and retrieval protocol. It can be an optimization after proof, not a prerequisite. |
| Cloud/headless browser connector | User credentials or session equivalents reach server infrastructure | Adds operations, costs and custody of private sessions; no need for initial local-first trial. Not selected. |
| B4Takeoff bridge | Another account/application between user and MoFlight | Its own help confirms flight exchange and a 2FA prompt; its landing page describes close cooperation with Vereinsflieger. Evidence that an app integration can exist, not proof of a public partner contract for MoFlight. Avoid adding this paid dependency merely to reach the original source. |
| External browser or browser extension | Browser owns the session; extension can assist an explicitly authorized desktop export | Useful for investigation/manual file import. A Custom Tab does not grant an app arbitrary access to the browser's cookies/DOM. A future provider OAuth/delegation flow would make external-browser login attractive; none is confirmed. A pure PWA is not a general cross-origin scraping solution. |

### Concrete phone-local workflow proposal

User selects a local MoFlight dataset → taps “Connect Vereinsflieger” → original HTTPS login opens with the provider identity visible → user completes login/2FA as offered → app verifies source account and club → user requests a small own-flight period → connector validates coverage and fields → preview → deterministic import into that dataset → cached flights remain usable offline. Expired authentication leads to login again; it must never become a successful empty import.

- Start with an explicit foreground “Retrieve flights” action. Reuse the session while valid; no promise of unattended/background refresh or permanent login.
- Keep browser cookies in their browser store. HttpOnly prevents JS from reading cookie values, but the browser can still send them for same-origin requests. Do not copy cookies into React Native `fetch` or a native client until platform sharing, domain/path rules and logout have been separately proven.
- Login pages have no extraction script or enabled data bridge. A bridge, if required, is scoped to the inspected own-flight page and accepts only a small validated import message; it cannot perform arbitrary HTTP, files, SQL or commands. Validate the actual document origin/path and navigation, not only a URL claimed in a message.
- Parse URL scheme and exact host, including initial load, redirects and new windows; a starts-with string is insufficient. React Native WebView's Android navigation callback is not called on the first load, and early script injection is documented as unreliable on Android. Do not base success on a global fetch/XHR hook.
- Use one connector boundary, separate from the pure logbook domain. Return source-account/club references, source flight IDs, retrieval time, original field values, known time basis and requested/actual coverage. Do not equate MoFlight identity with the provider account.
- Preserve Pilot, PIC and Begleiter/FI independently. Companion does not automatically mean instructor, student does not automatically mean PIC, and the dashboard UTC/LCL clock does not prove the flight-column time basis.
- Stable IDs may be supplied by `flid` links; inspect details before choosing a contract. Different source IDs can represent source duplicates. Preserve flagged/overlapping records for reconciliation rather than silently merging flights on a date/time fingerprint.
- Stage a whole bounded retrieval before commit; partial/failed/changed-schema refresh preserves existing history. Missing rows in last-20/limited coverage never imply deletion. Account/club change cannot silently relabel or combine datasets.
- Sessions and password-equivalent values never enter logbook backups, telemetry or Git. Confirm Android/iOS browser-store clearing and backup exclusion rather than claiming that secure storage automatically covers WebView data. No unverified private export feed URL is stored as a public link.

### API follow-up to make the better route reviewable

Obtain the current PDF/provider wrapper and, if needed, prepare a provider inquiry addressing:

1. Read-only own flights for ordinary members, role fields, source IDs, date/time semantics, paging/history range and changed/deleted-flight behavior.
2. Whether one registered MoFlight/partner integration can serve unrelated users/clubs, or every club must explicitly enable it; documented key scopes and rate-limit scope.
3. Supported delegated login/OAuth or another mobile-safe authorization flow. The current HTML may contain passkey-related hints, which do not prove such a flow.
4. AppKey confidentiality and direct-mobile versus proxy use. A secret cannot remain confidential in an APK/IPA. If the provider requires a confidential key and password-based sign-in, a proxy may transiently receive a password-equivalent; this is an explicit design choice, not a claim of password-free delegation.
5. Conditions for a free/private pilot, phone-local caching and later paid/public distribution, and any supported browser/export integration.

No provider message was sent, application/club key generated, service provisioned or paid integration adopted. General commercial REST prohibition is a material business constraint, not a reason to assume a web connector can bypass it.

### References checked for this recommendation

- Direct authenticated provider UI/help, version shown as `2026.07.11`; paths and limits above were observed in this session. These member help URLs may require login: [personal flightbook help](https://vereinsflieger.de/member/help/index.php?hid=16002), [REST help](https://vereinsflieger.de/member/help/index.php?hid=21101).
- [B4Takeoff integration information](https://www.b4takeoff.net/vflanding) and [release history](https://www.b4takeoff.net/help/hid26): own-flight exchange and security-code support; partnership does not transfer to MoFlight.
- [Expo WebView docs for SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/webview/), [WebView guide](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Guide.md), [reference](https://github.com/react-native-webview/react-native-webview/blob/master/docs/Reference.md): native browser component, cookies/bridge APIs and Android caveats. No new dependency was added in this investigation.
- [Android native-bridge guidance](https://developer.android.com/privacy-and-security/risks/insecure-webview-native-bridges), [Chrome Custom Tabs](https://developer.chrome.com/docs/android/custom-tabs), [cookie semantics](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

## Historical investigation — 2026-10-08/09

The following is retained as dated evidence of the earlier documentation-access limitation; current results above supersede its unresolved-login/key statements.

## What was actually checked

The official public [Vereinsflieger site](https://vereinsflieger.de/) exposes a
login and provider contact route. Its public presence does not establish a
supported third-party own-flight interface or permission to scrape logged-in pages.

The repository's existing lead points to this official members-area document:
[VereinsfliegerRestInterface.pdf](https://www.vereinsflieger.de/member/help/download.php?file=VereinsfliegerRestInterface.pdf).
An attempted read through the web lookup tool on 2026-10-08 returned inaccessible.
That result does not establish that the document is absent or that the API is
unsupported; its current contents/version have **not been read** in this trial.
The public search did not resolve current primary-source own-flight permissions.

### Public-source recheck — 2026-10-09

The official PDF URL was attempted again through the web lookup tool and returned “not accessible via this tool.” No PDF/version contents were obtained; this remains a retrieval limitation, not a finding that no supported API exists. Search leads from third-party API repositories are not treated as provider permission or current interface contracts.

Two official public pages were successfully read:

| Primary page | Publicly documented feature | What it does not establish |
| --- | --- | --- |
| [Personal area](https://vereinsflieger.de/MeinBereich) | List/filter/detail views of the member's own flights; assigned duties and calendar integration for open dates | Own-flight API, mobile application-key handling, general roster scope or permission to cache/scrape |
| [Flight recording](https://vereinsflieger.de/mainpage/Flugerfassung) | Recorded flight dates, registration, launch, pilot/companion, times/places, landings, distance and engine time; Excel/PDF output | CSV column/identity/time semantics, API response format or third-party distribution rights |

No member login, password, app key, private export/calendar URL or flight record was obtained. These product descriptions help identify the next questions; they do not unblock live retrieval. The later assigned-duty lead is recorded in [the broader discovery inventory](../product/vereinsflieger-information-discovery.md), with scope still unresolved.

Do not implement guessed endpoints, distribute an application secret, reuse
unofficial authentication code or request a member's password in chat. No vendor
message was sent and no signed-in account/session was accessed. The previously
mentioned Android prototype is not present in this GitHub tree; no login behavior
from it has been assumed. No existing plugin generator is reused.

## Next bounded access gate

Obtain the current official interface documentation through an authorized member
download or provider-approved source, then establish:

- Own-flight read methods, fields, stable IDs, time basis, limits/paging and refresh semantics.
- Application registration/AppKey requirements if applicable; permitted handling
  for a distributed Android/iOS app and any server intermediary.
- Auth, session/2FA/expiry, club/role restrictions, own-flight versus broader access.
- Permission for intended caching and eventual commercial distribution; supported
  CSV export remains a separate fallback until direct access is approved.

Then use an authorized small period privately, compare with a reference export,
repeat retrieval, expire/re-authenticate and record pass/fail without committing
personal rows/secrets. Keep MoFlight Auth separate. Current blockers are official
documentation/scope and authorized test access, not completion of the local lab.

The instructor-duty roster example remains unverified under #10; historical
flights never establish next-weekend assignments. The host CSV fixture uses a
deliberately normalized schema and does not validate real Vereinsflieger CSV
column names, APIs, retrieval or permission.


# Vereinsflieger access research and live browser evidence — 2026-10-10

Tracking [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2). Baseline main commit: `e523741b38619086d10adedcb9a16ed4594c3c0e`. This is research/documentation evidence, not a shipped mobile connector.

## Authorization and environment

Manuel requested a deep comparison of access methods, prioritized Vereinsflieger feasibility, and offered his login for the tests. A private sign-in form was used; credential values were not returned to the agent. Investigation stayed within the personal flightbook and provider help. Dashboard information necessarily rendered during sign-in; it was not exported or committed as project data.

Environment: dedicated cloud Chrome browser, provider version shown as `2026.07.11`; public Python HTTPS metadata request; GitHub connector for repository reads/writes. No Android/iOS WebView execution, browser network trace, REST sign-in or source export comparison took place. Git CLI access was unavailable without authentication; repository changes use the connector and an expected-head guard.

## Executed checks

| ID | Check | Actual result |
| --- | --- | --- |
| VF01 | Read current AGENTS/README/access proposal and existing task | Passed; direct-main workflow and separate provider/MoFlight identities preserved |
| VF02 | Inspect earlier `Vereinsflieger_Android_Phase1.zip` | Contains README, investigation/mapping/next-step notes and synthetic JSON; no app implementation/APK. SHA256 `b74c11c10e9e4029b3b75550d88b685f2d7ef6109dbf711d942d32c6b9bbb281`. Earlier notes record interactive login on 2026-10-05, without a native test or request trace |
| VF03 | Public HTTPS metadata only | HTTP 200; HTML; redirect from www host to `vereinsflieger.de`; PHP session cookie attributes Secure, HttpOnly, SameSite=Strict. Cookie values not printed. Visible login names `user`/`pwinput`, plus hidden/dynamic fields; their semantics not inferred |
| VF04 | Secure interactive account login | Submitted through private credential mechanism; rendered named signed-in overview at `/member/overview/overview` verified. No 2FA challenge appeared in this attempt; not proof that 2FA/passkeys are absent |
| VF05 | Navigate to personal flightbook | Passed at `/member/profile/flightlog.php`; last-20/max-24-months list visibly contains 20 records. Read-only form/header metadata inspected; personal flight rows/IDs not saved in Git |
| VF06 | Personal flightbook structure | DOM table `tablelist_20` has separate date, type/registration, Pilot/PIC/Begleiter/FI, launch/flight type, departure/arrival, time/duration and extra time fields. Form metadata indicates period/filter submissions to the same personal-flight path; no network method/body replay established |
| VF07 | Provider flightbook help | Authenticated `hid=16002` describes period and pilot/companion/all scope, details and Excel/PDF export. Also warns that different airfields can create overlapping source flights. The “Flugbuch Export” preset is a list configuration, not evidence of a CSV download |
| VF08 | REST help search and read | Authenticated help search for REST found `hid=21101`; rendered provider text establishes club-admin key creation, 500 daily calls per key and general commercial prohibition |
| VF09 | Obtain current REST PDF | Blocked by browser credential protection; the new download link was observed but no specification bytes or version obtained. Browser binding could not be safely resumed after the protected download error. Do not call this a provider bot block or proof that API documentation is absent |
| VF10 | Public alternative/docs review | B4Takeoff's own pages confirm flight exchange and security-code support; Expo/WebView/Android/Chrome primary docs support the proposed building blocks and identify platform caveats |

Successful sign-in is verified by visible signed-in UI, not merely the secure prompt's submitted status. The same browser session also opened authenticated help in another tab; this does not establish persistence after process restart or sharing with React Native/native HTTP.

## Scope and unresolved evidence

The browser API exposes UI and read-only DOM inspection, not a full request/response network recorder. It did not establish a JSON flight endpoint, actual export bytes, the web login protocol, session rotation, duration, cookie persistence/clearing or post-password-change revocation. Credential protection prevented further browser inspection; logout was not verified. Do not claim the session was cleared. The user can use the provider's session management outside this test if immediate revocation is required.

The default list is insufficient for all-history import. Native tests must inspect the live period/paging/detail/export controls and actual fields, time basis and permissions. No saved list preset, flight, duplicate flag, club setting, API key or account credential was intentionally changed. The live test did not compare changed table configurations or execute a download of personal data.

## Next executable native slice and acceptance

| Gate | Procedure / expected evidence |
| --- | --- |
| N01 | Existing Expo native lab opens exact provider HTTPS login; no password-field extraction or login data bridge |
| N02 | User signs in and source account/club is verified before association with a local dataset; test two source identities with authorized accounts |
| N03 | User requests a narrow period; inspect real export controls/bytes first, otherwise observed structured response or strictly validated personal table/details. Record complete versus partial coverage |
| N04 | Privately compare every selected record to a reference export/UI: source ID, date/time basis, minutes, aircraft, launch and crew roles. Synthetic fixtures exercise parsing but do not substitute for this check |
| N05 | Repeat retrieval; stable IDs produce no duplicated imports. Changed records preserve evidence; truncated results do not delete older history |
| N06 | Login response/expiry, wrong permission, unexpected HTML/schema and interrupted pagination result in explicit failure with prior usable data retained |
| N07 | Logout/switch stops retrieval, clears the tested provider session store and keeps previous dataset private; credentials/session material is excluded from logbook backup and diagnostics |
| N08 | Previously imported flights reopen offline after force-stop. Android and iOS results are reported independently |
| N09 | 2FA and any actual passkey method tested when available; no blanket claims from library APIs or a single account |
| N10 | Current REST PDF/role/field contract plus provider/club terms assessed; browser technical access alone is not permission for distribution |

No mobile connector tests are marked passed. Priority is the bounded own-flight trial rather than broad roster queries or a complete cloud-sync engine. [Investigation and references](../architecture/vereinsflieger-access-investigation.md) and [proposed ADR](../adr/0006-vereinsflieger-connector-proposal.md) define the concrete approach and remaining decision.

## Documentation verification

Relative Markdown file links in the five changed/new documents were checked against the baseline GitHub tree plus the new files: passed. Status/approval assertions confirm ADR 0006 remains Proposed, no native connector checks are claimed passed, and the unverified logout limitation is explicit. Changes are documentation only, so no app rebuild or repeated native acceptance suite was needed. Publication uses the observed main head as the expected SHA to preserve concurrent work.

# Own-flight access investigation — 2026-10-08

Tracking #2, with later broader information inventory in #10. **No supported
transport, flight endpoint, login or live retrieval has been verified.**

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

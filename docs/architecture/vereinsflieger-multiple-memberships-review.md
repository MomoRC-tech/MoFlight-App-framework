# Vereinsflieger multiple-membership review

**Research date:** 3 November 2026 · **Tracking:** [#35](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/35)

## Finding

The current MoFlight core has an account-scoped own-flight library, but its retrieval/import path is fenced to one observed Vereinsflieger club context. The code retains the club label as provenance and rejects a changed label; it does not implement a multi-club selector or cross-club aggregation. This is a local safety boundary, not proof of the provider’s identity or cross-club flight-ID semantics.

The available public provider guidance and retained sanitized observations do not establish how one pilot with two or more memberships authenticates, switches club context, or sees own flights across memberships. So we cannot yet confirm that multi-membership can stay invisible in MoFlight’s normal journey.

## Verified behavior and limits

| Evidence | What it establishes | What remains unknown |
| --- | --- | --- |
| The current profile reader extracts the numeric `Benutzernummer` and one top-navigation club label. It labels club identity `display-label-only`; it does not read the membership list or a stable club ID. [`context.ts`](../../apps/platform-lab/src/vereinsflieger/context.ts#L3) | Current app context check is limited to one observed profile number and current club label. | Whether that profile represents multiple memberships, how one is selected, and whether those memberships share an account/session. |
| The source library derives its local binding from `(ownerId, accountRef)` and a flight ID from `(bindingId, sourceFlightRef)`, then requires the same account and observed club context on import. [`bindingIdFor`](../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts#L182) · [`flightIdFor`](../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts#L185) · [context fence](../../apps/platform-lab/src/vereinsflieger/real-flight-library-model.ts#L205) | There is no implemented cross-club merge path. Existing saved history remains in its selected local owner/account library when another club context is rejected. | Whether source flight references are unique across clubs or whether the same own flight can appear in more than one club’s list. The account-number binding remains subject to #2/#16’s live account, switching and source acceptance. |
| The official member page describes club-managed member records, membership status and role-based permissions. The personal-area page describes a list of a member’s own flights. The password page says an existing Vereinsflieger access may be reused. ([Members](https://vereinsflieger.de/Mitglieder), [personal area](https://vereinsflieger.de/MeinBereich), [password help](https://vereinsflieger.de/PasswortAnfordern)) | Club membership/permissions and a personal own-flight view are documented. | These pages do not say whether the own-flight view aggregates multiple clubs, whether login is shared across separate club platforms, or how club switching works. |
| The official demo page describes a platform created for a club/school and says each inquiry receives a new platform. ([Demo access](https://vereinsflieger.de/Demozugang)) | The provider’s public product description is organized around club-specific platforms. | It does not establish that a pilot needs separate accounts, or that one credential does or does not span memberships. |
| The retained 20 October sanitized profile review observed a membership section/statuses, but no labelled stable club reference or supported membership-detail action. [Source review](../verification/2026-10-10-vereinsflieger-discovery.md#account-scoped-core-identity-investigation--20-october-2026) | Membership context was visible in that bounded owner session. | It did not record a verified two-membership switch, comparative own-flight sets, cross-club ID overlap, or a stable club identity. No authenticated session was opened for this review. |
| Saved own-flight history was previously read after an actual offline process restart. [Ordinary-flight evidence](../verification/2026-10-20-ordinary-flights.md) | The existing saved library is usable offline for its accepted owner/account scope. | No multiple-membership aggregation, switch, or offline isolation scenario was exercised. |

## Safest minimal journey supported today

1. The user connects through the original Vereinsflieger sign-in and confirms the observed MoFlight account association once, as the current connection contract describes.
2. MoFlight retrieves only while the fresh provider account and current club context still match the captured context. A changed or unreadable context stops the operation and preserves prior saved history.
3. The saved account-owned history remains available offline. No cross-club merge, deletion, or automatic rebinding is inferred from a club change.

This preserves today’s one-context journey; it does **not** deliver multi-membership support. After source verification, an account-level own-flight list with globally safe references could avoid a new club choice. If the provider instead requires an explicit club switch or applies different per-club access, only that demonstrated requirement should introduce a user-facing choice. Neither case is established yet.

Club-scoped information such as duties, billing and role permissions must remain scoped to the verified club until #10’s relevant source/access checks prove broader ownership. A combined own-flight history must not double-count overlapping rows; source IDs must be compared across contexts before any merge policy is selected.

## Remaining checks and ownership

- **[#2 — own-flight source/import](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2):** with an authorized two-membership account or current provider documentation, establish whether credentials/account number and current membership persist across club contexts; compare each permitted own-flight window and verify reference uniqueness/overlap, repeat retrieval, coverage and failure behavior. This must not infer completeness from one club’s visible list.
- **[#16 — connection and ownership](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/16):** verify the actual account/club switch and session-expiry path, including that a changed context cannot rebind or expose another scope and that the prior local library remains available offline after switching/restart.
- **[#10 — club information sources](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10):** establish which profile, duty, billing and other selected source data is per membership, role or account; preserve separate club context, freshness, authorization and offline results where the provider scopes them per club.

No live/private provider session, provider write, new schema/service, paid call, application test or build was used for this review. Public official pages and maintained sanitized repository evidence were consulted.

## #35 disposition

**Keep #35 open.** The report documents the current fence, a safe present-day journey and a conditional low-complexity recommendation, and links the work to #2/#16/#10. However, acceptance still requires verified provider behavior for one pilot with at least two memberships and a grounded conclusion about whether extra user-facing choice is avoidable. The exact missing evidence is a permitted two-membership source/session comparison (or current official technical documentation covering the same account, switch, permissions, own-flight scope and ID-overlap questions). Until then, no club selector, cross-club merge, or “no added complexity” claim is accepted.

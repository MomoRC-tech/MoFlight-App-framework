# Safe disconnect verification — 17 October 2026

## Scope

Approved [bounded disconnect/re-login package](../product/2026-10-17-safe-disconnect.md), under #2/#5/#8. Baseline main was clean at `85d9fd0c43eb3dd5312296d98954a47f45278c71`, matching origin/main and live remote. Existing connection implementation and historical evidence were read, not repeated as new results. No new dependencies, canonical import, production binding/schema, paid service, hosted run or physical-phone test.

## Verification in progress

Application candidates are traceable in the commits below; final source will be identified with the completed Release. TypeScript and all **160 mobile tests** pass (the original 149 remain, with eleven added controller/reader cases). The component harness exercises the real controller against native/storage stubs, including root-redirect proof and delayed credential reads/forgets. It is not native authentication evidence. An independent read-only source review found no further concrete failing flow.

Before final native acceptance, a navigation race was found during primary review: a profile-reader script executing after navigation could emit a wrong-document session-required result on the root page. The root login-form reader now uses a distinct message kind, and the controller requires the correct reader kind plus native document/origin and nonce. A regression rejects the late profile message at root, then accepts the owned structural login proof. The first `767c58c` build/native trial is diagnostic: 12 native checkpoints passed, then an offscreen result search failed after the panel grew. Its exact display/font/network settings were restored. Searches now account for retained scroll position and traverse the panel in control order. Only the final committed-source build/trial may support final acceptance. The `8117151` candidate additionally proved live sign-out and rejection of a still-authenticated profile. Its initial live logout helper did not open the provider menu, so that attempt did not sign out; opening the original hamburger menu and choosing visible Abmelden completed the actual operation. Re-login is not accepted from those attempts. Subsequent product changes invalidate confidence when explicit saved-login use starts and show safe German outcome/timeout/cancellation feedback; no credential values or hidden fields were inspected.

Application source, final Release identity and native results will be recorded after completion. Tests/mocks do not prove live provider logout, cookie deletion, natural expiry or second-account isolation. iOS runtime remains unavailable. Pixel 6a retest remains deferred at Manuel's request.

## Design limits

Logout uses the original provider **Abmelden** control, followed by an explicit fresh protected-profile check. No native cookie clear is claimed; the pinned WebView has no public cookie deletion API. Recovery must finish before app-driven disconnect starts; it is never discarded to unblock logout. Credential forgetting and existing development one-attempt saved-login use are separate explicit actions. All prior data and the app-run provisional account/club association are retained.

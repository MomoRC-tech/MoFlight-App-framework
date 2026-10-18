# Header, icons and connection status — review proposal

18 October 2026 · #20, coordinated with #17/#19/#16/#5/#8. Manuel authorized preparation of this proposal; the appearance, header exceptions and production data policies below remain proposed. This is source review, not a completed Android visual/accessibility audit.

## Smallest next package — 1a login guidance

**Status:** Manuel's **“go”** in the continuation separately authorizes implementation of this bounded slice under [#17](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/17). Implementation/checks are in progress; user/native acceptance remains separate. His earlier “that's a good plan” endorsed the overall direction. Neither selects artwork, persistent-header behavior, production policies or release inclusion. This first slice narrows package 1 without changing the M1–M5 order; the persistent-header/icon work remains proposed package 1b under #20.

**Deliverable:** simplify the existing connection panel and app-owned login instructions: a short German status, one safe primary next action for the current state, and optional details. Keep provider origin, provisional-account confirmation, mismatch/recovery blockers and the consequences of destructive actions visible where the user acts. Put explanatory diagnostics, optional saved-login help and the bounded raw-capture lab behind clearly named disclosures; a disclosure must never hide a required decision or start an operation.

Reuse [ProviderConnection](../../apps/platform-lab/src/mobile/ProviderConnection.tsx), [connection state](../../apps/platform-lab/src/vereinsflieger/connection-state.ts) and the [existing controller](../../apps/platform-lab/src/vereinsflieger/use-access-controller.tsx). Change presentation and fixed wording only. Preserve the browser's native parent, controller transitions, disabled-action guards, explicit saved-login trigger, capture/recovery serialization and association checks. No provider-page modification, credential-policy change, new persistence, retrieval or adoption is included.

| Existing evidence/state | Proposed visible wording / next action |
| --- | --- |
| Initial state or invalidated observation | **Sitzung ungeprüft** · `Sitzung prüfen` when an existing browser is available; otherwise `Bei Vereinsflieger anmelden` |
| Checking | **Sitzung wird geprüft…** · no duplicate check; retain existing dismissal semantics |
| Login required / original login page | **Bitte bei Vereinsflieger anmelden** · `Bei Vereinsflieger anmelden`; above the loaded original page use `Anmeldung prüfen`, with origin and “Zugangsdaten nur auf der Originalseite eingeben.” |
| Observed, unconfirmed association | **Konto prüfen** · show the observed account/club and provisional-binding explanation beside the existing explicit confirmation |
| Observed, confirmed provisional association | **Zuletzt bestätigt: [time]** · `Sitzung erneut prüfen`; explain that this is the last matching observation, not production identity or a continuing login guarantee |
| Account/club mismatch | **Anderes Konto oder anderer Verein** · explain that retrieval stays blocked and the prior association/data are preserved; offer original-page sign-in, never silent rebinding |
| Check error | **Sitzung konnte nicht geprüft werden** · `Erneut prüfen` when available; keep original-page sign-in as a secondary option. Do not infer logout or offline status |
| Verified sign-out / confirmed local clear | **Abmeldung bestätigt: [time]** / **Lokale Browserdaten gelöscht** from the separate operation evidence; offer sign-in and retain the existing scope/consequence notice |
| Recovery pending | **Abruf gesperrt · Wiederherstellung nötig** · keep existing account, comparison and recovery prerequisites/actions visible; do not replace them with an unconditional restore button |

The initial `disconnected` phase alone does **not** prove sign-out: use `disconnectedAt` or the confirmed clear result for those operation messages. Historical operation evidence must not override a later or invalidated session observation. Keep session-check time separate from **Gespeicherter Rohbeleg: [time/count]**, using only the available scoped snapshot. Explain that raw evidence is separate from the saved flight library. Do not call a raw capture an up-to-date imported library or infer complete coverage. A close action still hides the panel; it does not log out.

**Exclusions / dependencies:** no artwork replacement, persistent-header restructuring, Medical group, new status-age threshold, automatic polling/routing, import writer, schema/migration or private-data reads. #20 appearance choices and #19 scheduling do not block this slice. Recovery and ownership safeguards from #16 remain binding; #5/#8 cover UI/platform acceptance. The synthetic import/book planner remains the smallest proposed host-only alternative under #18; its implementation is not authorized by this slice.

**Acceptance for the authorized slice:**

- Review the German states/primary actions with Manuel; expose no provider payloads or account values in diagnostics/logs.
- Check the affected state/guard paths with existing connection/login/recovery tests and TypeScript. Add focused cases only for changed presentation decisions; do not repeat live retrieval evidence without a new reason.
- At the integration checkpoint, verify committed-source Release and affected panel/login states: narrow/normal/wide layout as relevant, large text, keyboard, scrolling, origin, disabled controls and accessible labels/focus. Existing Android evidence does not accept the changed UI; iOS and physical acceptance remain separate.
- Preserve both existing AVDs and private sessions. Use synthetic presentation fixtures in a verified safe environment; suspend destructive tests. If suitable native evidence is unavailable, leave that acceptance pending.

**Material decisions still open:** user acceptance of the implemented login wording/states. Before package 1b, select the aircraft artwork (recommended side-view B versus top-view A) and confirm or revise the proposed Med → connection → profile group, overlay/provider toolbar and full-screen exceptions below. Minor wording/layout details can be resolved within the authorized slice. Production identity/schema, credential policy, automatic scheduling, paid AI and release inclusion are outside this decision.

## Concrete recommendation

Retain one compact app header on native destinations and nested details. Preserve the approved Thermik asset. Group the right-side controls as **Med → Vereinsflieger → Profile**, with contextual Back/title on the left. Keep the connection control present in the provider flow as well, alongside clearly separate original-provider origin and Close/Back controls. Do not inject the app header into the provider website or reparent its retained browser.

At narrow widths, remove the greeting from the header and shorten/truncate the page title before shrinking touch targets. Put the full title/greeting in the page content when necessary. Keep the earlier two-line Medical treatment: symbol + **Med** above recorded date/status. Start with an 88–96 dp Medical group and 48 dp connection/profile controls; actual fit with logo/title must be established at 360 dp and enlarged text before accepting a fixed header height. These sizes are a proposal, not proof of fit. If enlarged text cannot fit, allow a bounded second header row rather than clip status text.

| Surface | Proposed header / navigation behavior |
| --- | --- |
| Main tabs and scrolling content | Header stays fixed; current page title; persistent Med/connection/profile |
| Flight detail, profile/settings | Same status group; contextual Back; preserve the previous page's filters/scroll |
| App sheet/dialog | One accessible active header; underlying controls hidden from TalkBack. Show connection status in the active sheet header; avoid two reachable copies |
| Original provider login/navigation | App-owned compact toolbar remains visible with connection status and explicit Close; origin directly above provider content. Back within provider history and Close to MoFlight have separate labels; closing is not logout |
| Retrieval/recovery | Status stays visible; actions that would interrupt serialized writes remain disabled. Closing the panel must retain the existing recovery/foreground rules |
| Keyboard, system picker, OS challenge/full-screen surface | Respect platform ownership/insets; do not overlay app controls onto an OS-owned surface. Return to the same app state and recheck as required |

## What the connection symbol means

The compact control describes the **last provider-session check**, never how up-to-date the flights are. Tapping it opens concise status, last check time, last saved capture time/coverage and one next action. Keep technical scope/diagnostics in a separate disclosure. The underlying provisional account/club match is not production identity verification.

| Evidence/state | Proposed German short wording and next action |
| --- | --- |
| No live check this run, restart, background return or cancelled check | **Ungeprüft**; neutral outline/question mark; `Sitzung prüfen` |
| Checking | **Prüft…**; spinner plus accessible progress label; prevent duplicate checks |
| Protected profile observed and matches confirmed provisional association | **Zuletzt bestätigt: [time]**; check-mark link; details explain the exact observation and its provisional association |
| Observed but no confirmed association | **Zuordnung prüfen**; outlined attention mark; explicit review/confirmation |
| Login required | **Anmelden**; sign-in marker; open original provider page |
| Different account/club | **Konto prüfen**; warning shape; block capture and preserve prior association/data |
| Network/check error | **Prüfung fehlgeschlagen**; warning/question shape; no claim of logout or verified offline cause without network evidence |
| Explicitly verified sign-out/local clear | **Abgemeldet** / **Browserdaten gelöscht** according to actual evidence; retain saved-flight availability separately |
| Retrieval/recovery in progress | Busy overlay and named operation; show the previous check time in details. Completion does not imply whole-history coverage |

No arbitrary 30-minute expiry or background polling is introduced. Reuse lifecycle invalidation and always check before protected capture/replay. If a future age threshold is selected under #19, it changes the displayed check age/unknown state; it must not fabricate provider logout. Saved data gets its own `Datenstand: …` with requested period and gaps. Empty, partial, failed and successful retrieval remain distinct.

## Medical reconciliation

The [v0.30 Med treatment](../verification/2026-10-16-popup-back-med-preview.md) is documented, but the native header currently renders only logo/title, connection and profile. Restore its place in the proposed header, without inventing live data. Until a verified source or approved local input exists, show **Med · unbekannt** and explain the missing record in details. Existing prototype examples for recorded expiry, approaching expiry and multiple classes remain examples; do not label the user medically fit or grant flight eligibility. Keep Klasse 2/LAPL records separate and display record source/date. Source access and final reminder policy remain separate acceptance work.

## Icon inventory and Android review

| Current source family | Observed gap / proposed action |
| --- | --- |
| `ShellIcons.tsx` aircraft bitmap, custom line-drawn profile/book | Aircraft is explicitly rejected by Manuel. Prepare clean side-view and top-view aircraft candidates at the actual navigation size; choose one coherent optical weight for all symbols |
| `ProviderConnection.tsx` custom chain links | Amber for nearly every non-disconnected state is ambiguous. Keep the link metaphor but add shape/text/progress distinctions from the state table |
| `MobileApp.tsx` Unicode search/filter/chevrons and text-based tab marks; custom club mark | Inventory remaining glyphs, remove inconsistent font-dependent shapes, standardize alignment and selected/disabled behavior; keep labels for navigation |
| Earlier Medical symbol/text group | Missing in native; restore as an explicit group, with unknown state rather than a fabricated date |
| Book selector, chips, small actions | Some source styles have 36 dp minimum height; assess actual effective hit bounds, spacing and any hitSlop before claiming a touch-target failure |

The [actual-size synthetic preview](prototypes/2026-10-18-header-icons-review.html) includes a top-view glider and side-view aircraft candidate, width controls and connection-state examples. Recommend the side-view candidate for the shared Flüge destination across aircraft categories; final artwork selection remains reviewable. The preview JavaScript syntax and local links were checked; no native fit/accessibility acceptance is claimed.

Use one coherent authored vector/asset set or an explicitly reviewed licensed set; no icon runtime dependency is needed to prepare candidates. The approved logo is not an icon-replacement candidate. Do not silently turn this review into a broad Material redesign.

Official guidance checked on 18 October: Android recommends [48×48 dp touch targets and purpose-specific accessible descriptions](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views); it also requires attention to [edge-to-edge insets and system-bar overlap](https://developer.android.com/develop/ui/views/layout/edge-to-edge). These guide the audit; their View-specific code examples are not a React Native implementation prescription. Check TalkBack traversal, unique labels, non-color state cues, contrast, large text, keyboard, Back, navigation and screen-reader focus after overlays close. Do not claim compliance from source style values alone.

## Review and implementation checkpoint

Prepare actual-size icon/header alternatives using synthetic unknown/example states, then resolve only remaining product questions. Apply approved changes in one small package. Verify affected MIN360 / MAIN390–412 / MAX600+ screens, enlarged text, landscape/keyboard and TalkBack as relevant; record actual dp/density/font. Android and iOS runtime evidence stay separate. No new screenshot matrix is needed for this document. Import correctness can progress independently of icon selection or automatic retrieval timing.

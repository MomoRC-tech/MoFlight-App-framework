# Layout and presentation patterns

[Handbook entry point](README.md). These patterns consolidate approved visual/navigation decisions and current boundaries. Behavior remains governed by journey/provider/book contracts.

## Screen composition

| Destination | Current presentation |
| --- | --- |
| Übersicht | Photo paper hero; asymmetric season/AI and flight/club pairs; weather and next actions. Use selected-book saved facts with details on tap. |
| Flüge | Book selector, search/filter, year chips, summary, training/classification chips and saved rows. Missing tracks/distances/classifications remain unavailable. |
| Flugbuch | Selected-book saved paper status and ordinary library backup/restore. Full reconciliation/writing remains M5; book identity differs from account/format. |
| Verein | Overview/Dienste/Termine/Mitteilungen scopes with bounded sections and honest missing-source states. |
| AI | Welcome, supported local questions/results, composer and unavailable free-text state. Sparkles identify the category. |

The [approved reference](../design-sources/2026-10-16-four-screen/reference.png) establishes card/layout/color fidelity. Later five-tab changes add Flugbuch and retain AI. Older Wetter-tab, goals, monthly-chart and synthetic Medical-expiry prototypes remain historical.

Development surfaces are explicit visual exceptions: [App.tsx](../../../apps/platform-lab/src/App.tsx) and [BookLab.tsx](../../../apps/platform-lab/src/BookLab.tsx) retain their functional English proof styling, including light backgrounds and different type/button sizes, behind **Settings → Development**. Their body groups are capped at 720 dp. They are not ordinary product paper/import screens. The older [provider trial views](../../../apps/platform-lab/src/vereinsflieger/) remain historical proofs; the embedded lab cannot mount a duplicate provider browser. Their values are included in the generated inventory. The original provider webpage and OS-owned dialogs remain external visual surfaces.

## Settings, Development and library maintenance

Settings exposes **Sicherung & Wiederherstellung** beside ordinary book/data actions and a separate **Entwicklung öffnen** entry. [DevelopmentHub](../../../apps/platform-lab/src/mobile/DevelopmentHub.tsx) groups the dataset/flight proof, book/paper proof and provider diagnostics. Entry alone runs no fixture or provider operation. The experimental lab Release retains these explicit tools for offline testing; this is no security boundary or approval for a future production build. Synthetic operations and old copy-confirmation semantics remain labelled.

Product maintenance uses current dark C01/C02 cards/actions and selected Modern Duotone symbols. [LibraryBackup](../../../apps/platform-lab/src/mobile/LibraryBackup.tsx) explains whole-library scope, unencrypted lab format/2 MB restore limit, exclusions, picker cancellation and the difference between sharing and verified external saving. Restore validates a new library and its selected book before activating it; previous stores stay retained. [PaperStatus](../../../apps/platform-lab/src/mobile/PaperStatus.tsx) shows saved synthetic facts/unknowns and the unfinished M5 boundary, with book/history/backup navigation. These groups are capped and centered at 520 dp. No ordinary floating plus, book selector or data-status action launches a proof.

Provider login, recovery, session controls and **Rohbelege & begrenzter Abruf** stay in the ordinary connection dialog. Extra browserstore test controls require the explicit Development route on the same retained controller, with existing native AVD/operation/recovery guards. No source capture becomes an imported flight by moving its controls.

The explicitly started [synthetic import preview](../../../apps/platform-lab/src/mobile/ImportPreview.tsx) under Development reuses dark cards, labelled actions and selected chips in a centered 520 dp group. It compares fictional new/changed/unchanged/conflicting records, shows previous/current evidence, explains book suggestions and requires explicit confirmation of a book or deferral. Returning preserves the separate test stand for the current app session; app restart discards it. Opening does not create fixtures in the saved library or contact a provider. This M3 preparation under #18 does not enable normal live import or accept production identity/schema/assignment rules. Source-specific verification is recorded separately.

## Header, overlays and navigation

Keep header/navigation outside the scrolling canvas. Header order is logo/title, Connection → Med → Profile. Truncate title before shrinking controls. Current font scale above 1.3 places controls on a second wrapping row; subtitle renders only at width at least 412 with normal text.

App overlays/details replace logo with contextual Back and expose one active accessible header. Return through nested overlays to prior page/filter/scroll state and unsaved local profile-name draft. Identical library reloads preserve the return path; changed book/flight facts invalidate stale details. An active backup/proof operation disables app Back, Profile and Medical until completion; provider Close/history remain separate. Medical opens a read-only unknown-record explanation.

Provider Close, connection status and origin belong to its app-owned toolbar. Provider-history Back affects the original embedded webpage; Close returns to MoFlight without promising logout. Preserve retained browser parent, busy/recovery guards and provenance. OS-owned full-screen surfaces keep their own controls. See [header decisions](../2026-10-18-header-status-review.md#package-1b-decision-checkpoint).

Bottom navigation has five equal icon/label destinations and semantic selected state. Current code hides it with the AI keyboard and app/provider overlays. Do not reintroduce an old floating dock or add a destination through documentation cleanup.

## Responsive layout and text

| Level | Visual question / current reference |
| --- | --- |
| MIN, 360 dp | Check overlap, clipping, scrolling and keyboard. Enlarged text avoids forced compact pairings. |
| MAIN, 390–412 dp | Primary fidelity target for approved geometry, spacing, colors and hierarchy. Code values alone do not prove it. |
| MAX, 600+ dp | Bound forms/details/card groups or use columns/master-detail. Current shell uses 600/960 bounds; forms commonly 480/520; dashboard groups cap at 430 and use two columns at width 840 when text is not enlarged. |
| Large text / landscape | Controls grow, labels remain, content reflows with keyboard/insets. Above font scale 1.3 several sections stack; rings hide if values/text cannot fit. |

At 600+ dp—including landscape phones, tablets/foldables—cap and center individual groups or use an appropriate multi-column composition. A 480 dp cap is illustrative, not universal. Record actual logical dp, density and font scale. The [refinement policy](../2026-10-16-ui-fidelity-refinement.md) controls acceptance.

Respect safe areas/system bars. Current AI layout accounts for keyboard overlap, keeps the multiline composer reachable and preserves drafts on unavailable service/retry. Browser specimens do not prove native keyboard behavior.

## Honest data and state presentation

- Provider tick: previous matching check, not continuing login, imported-data freshness or cloud sync.
- Med / unbekannt: unknown until separate source/input work exists; no prototype expiry date or invented fit-to-fly status.
- Rings: aircraft shares of count/known minutes; no unstated goal or missing-time-as-zero. Native rings do not open the old inline-breakdown prototype.
- No-track: missing track evidence; no decorative measured route. Cloud/weather and club photographs are category/decorative elements.
- Preserve clear empty/error/retry wording, scoped selection and pending work. Simplification must not hide required ownership/recovery/confirmation decisions.

## Accessibility and acceptance

Retain visible labels, button/tab roles, selected/expanded/busy/disabled states and specific action names. Decorative submarks must not duplicate controls. Unknown/error meanings need text or shapes as well as color.

When affected, check actual touch regions, reading/focus order, long labels, text scaling, contrast over the displayed photo crop and keyboard reachability. Some small faces/targets and universal focus styling remain [review gaps](history.md). Spoken TalkBack/focus, iOS, physical-device and positive provider-history checks remain separate from bounded Android evidence.

Follow the [verification workflow](../../development/verification-workflow.md): this consolidation adds no native acceptance. Substantial UI changes need their relevant committed-source Release/native matrix; logic-only changes do not trigger unrelated visual audits.

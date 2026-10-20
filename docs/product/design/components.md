# Components, symbols and shapes

[Handbook entry point](README.md). This catalogue records current implementation and approved use. The portable guide includes schematic examples; source values and native evidence remain authoritative. Example labels/data are synthetic.

## Component map

| ID | Component / shape | Geometry / presentation | Function / source |
| --- | --- | --- | --- |
| C01 | Content card | Gradient panel, radius 14, border 1, padding 11 | Group coherent facts/actions; pressable only with an action. theme Card. |
| C02 | Primary / secondary action | Blue or raised bordered face, radius 16, minimum height 48 | Explicit action label; disabled opacity .5, pressed .72. theme Action. |
| C03 | Scope chip | Radius 20; face minimum 66 × 34 in a minimum-48-height target | Selected blue gradient; selected/disabled semantics. theme Chip. |
| C04 | Search / input | Search radius 22; profile radius 12 and font 16; provider radius 10 | Operate on named scope. MobileApp / ProfileSettings / ProviderConnection. |
| C05 | Shared header | Fixed photo/shade, logo 52, title 18/24, controls 48; content minimum height 64 and padding 10/5 | Header can grow; minimum is not universal actual height. AppHeader. |
| C06 | Header status group | Connection soft tile, growing Med, profile soft tile; gap 4 | Back replaces logo on app overlays. AppHeader / MedicalStatus / ShellIcons. |
| C07 | Bottom navigation | Attached dark bar, five equal targets, minimum height 60 | Icon above German label; cyan selected state. MobileApp. |
| C08 | Overlay / provider panel | Current dark full app overlay with one active header; provider has its own toolbar/history | Different from pale v0.30 prototype sheets. MobileApp / ProviderConnection. |
| C09 | Flight row | Padding 7, radius 13; no-track tile, route/time/role and detail chevron | Whole row opens saved facts. MobileApp FlightRow. |
| C10 | AI question / composer | Question radius 12; composer radius 20; send face 42 × 42; input max height 150 | Local questions calculate deterministically; free-text service unavailable. MobileApp. |
| C11 | Paper hero / action face | Orange-accent photo card, minimum height 144; normal hero height 154; CTA radius 15 | Papierstand ansehen opens the read-only saved paper status. Full reconciliation/writing remains M5; viewing never confirms copying. Dashboard / PaperStatus. |
| C12 | Season ring | Diameter 62, thickness 6, aircraft segments, central value/label | Whole season card opens current-year flights. SeasonRing / season-model. |
| C13 | Badges / disclosures | Role pill radius 12; session badge minimum 16; details + / − | Role, session evidence and expansion remain separate meanings. MobileApp / ProviderConnection. |
| C14 | Synthetic import review | Shared C01/C02/C03 cards/actions/choice chips, centered group capped at 520 dp | Development-only comparison, source variants and explicit book choice; [ImportPreview](../../../apps/platform-lab/src/mobile/ImportPreview.tsx). No saved-library import. |
| C15 | Captured flight review | Shared cards/actions in the connection panel's centered 520 dp group; five records per page, eight original fields per detail page | [CapturedFlights](../../../apps/platform-lab/src/mobile/CapturedFlights.tsx) reads owner-scoped saved evidence without requiring provider login. Dates/clocks, reported duration, aircraft and separate crew fields retain unknown/invalid/conflict states; original field text is selectable and untruncated. No book membership or canonical import. |
| C16 | Information source review | Shared C01/C02 controls in the connection panel's centered 520 dp group; five raw rows per page, one immutable snapshot at a time | [InformationReview](../../../apps/platform-lab/src/mobile/InformationReview.tsx) shows retrieval time and recorded coverage, with older/newer controls available offline. Category counts use the latest snapshot. Blank extracted text stays unknown; known date-only document snapshots are marked incomplete. No canonical history or cross-snapshot aggregation. |
| C17 | Own-flight foundation | Shared C01/C02 controls, centered 520 dp groups, five saved flights per page and expandable original source rows | [CoreFlightFoundation](../../../apps/platform-lab/src/mobile/CoreFlightFoundation.tsx) provides explicit fresh local ownership, account-scoped retrieval/review/save-as-unassigned, offline list/detail, original-command recovery and separate real-history backup/restore. Entry is under Development for bounded integration acceptance; opening creates no owner/store. The prior shell remains mounted with its draft/scroll state, while its provider browser is safely suspended before entering this independent owner scope. Native acceptance is recorded separately. |
| C18 | Connection/data summary | Shared C01/C02 card and labelled action; no new symbols or geometry | [ConnectionSummary](../../../apps/platform-lab/src/mobile/ConnectionSummary.tsx) on Start and first in Profile opens the same retained connection flow. Session checks and last successful flight capture stay separate. More than seven days produces a quiet update suggestion; loading/read failure never claims no prior data. No automatic retrieval. |

Sources: [theme](../../../apps/platform-lab/src/mobile/theme.tsx), [MobileApp](../../../apps/platform-lab/src/mobile/MobileApp.tsx), [Dashboard](../../../apps/platform-lab/src/mobile/Dashboard.tsx), [AppHeader](../../../apps/platform-lab/src/mobile/AppHeader.tsx), [ProviderConnection](../../../apps/platform-lab/src/mobile/ProviderConnection.tsx), [MedicalStatus](../../../apps/platform-lab/src/mobile/MedicalStatus.tsx), [ProfileSettings](../../../apps/platform-lab/src/mobile/ProfileSettings.tsx) and [SeasonRing](../../../apps/platform-lab/src/mobile/SeasonRing.tsx).

## State presentation

| State | Current treatment / meaning |
| --- | --- |
| Default | Name the action/destination. Decorative submarks do not become nested controls. |
| Pressed | Shared controls use opacity .72; not selection or completion. |
| Selected | Chip fill and tab icon/label change; expose selected state. Med exposes selected while its sheet is active. |
| Disabled | Action .5 / Chip .45; blank send dims; existing guards block pressing. |
| Busy | Indeterminate spinner plus named operation and accessible busy wording where implemented. Preserve Cancel/Close distinctions. |
| Unknown | Neutral ?, unknown text or —; Medical remains Med / unbekannt without source rows. Saved own Medical rows change this to Med / Angaben, meaning source availability only; validity stays unchecked. |
| Attention / error | Specific text and connection !; retain data/draft and applicable retry. |
| Empty / unavailable | Explain missing source/results without invented values or success styling. |
| Expanded / collapsed | + / − with expanded state; opening a disclosure alone executes no work. |
| Focus | Preserve semantic role, label and order. No universal authored native focus ring exists; keyboard/screen-reader focus remains a review gate. |

## Symbol ownership

The [47-entry catalogue](../symbol-reference.html) is the current meaning/function reference. [symbols.json](symbols.json) is its maintained source; both the compatibility catalogue and combined guide are generated from it. Keep current N/H/S/D/K/A/T/B identifiers stable. Retired X01–X03 and B04 are not reused.

Separate semantic roles even when characters repeat: a right arrow can mean route direction, continue or login required; a tick can mean selected book or previous session confirmation. Assess artwork size, optical balance, stroke and effective touch area separately.

Manuel made Modern Duotone & Soft-Filled Glyphs the default family on 18 October 2026, with **M2 Medical card** for H04 and his supplied **folded paper plane** for N02. Superseded aircraft/stethoscope designs and comparison proposals are removed from the maintained library and remain recoverable through Git history. Original supplied references, Thermik branding, dynamic aircraft-share rings, data notation and status meanings retain their identity.

[Selected family and ID mapping](symbols/index.html) use the same editable SVG masters as the app. The native renderer uses 145 checked local RGBA PNGs (29 glyphs × default/muted/paper/assistant/contrast variants), with static Metro requires and no new icon runtime. Artwork sizes are context-specific; navigation art is 28 in a 36-unit soft tile with radius 12, header controls retain 48-unit targets with radius 14, and M2 is 20 inside the existing growing Medical control. The original large reference tiles are illustrations, not new app card dimensions.

Images are decorative and excluded from accessibility announcements; their labelled parent owns navigation/action/status semantics. Native busy indicators remain animated ActivityIndicators; a drawn spinner is never substituted for actual progress. Calendar category artwork uses neutral date cells, not the reference's illustrative 26. The separate send arrow remains distinct from the folded plane used for Flüge.

[Source notes, regeneration and fidelity limits](symbols/README.md) and [one verification report](../../verification/2026-10-18-icon-option-2.md) distinguish selected intent, implemented artwork and source-specific native acceptance.

## Schematic examples

The combined HTML presents C01–C13 shapes/states alongside these rules: neutral Medical/session status, selected chips, disabled action, no-track/empty placeholder and illustrative distribution ring. These examples execute no app/provider operation and establish no native acceptance. Use a concrete example to discuss a proposed change, then verify the implemented control in context.

C16 also offers an explicit secondary **Gespeicherte Informationen neu laden** action. It reads existing local captures without requiring a provider session; loading/unavailable state disables it, and read failure keeps the previous review visible. Successful reload returns category review to the latest saved snapshot unless a newer history choice was made while it loaded; source timestamps remain the retrieval timestamps. Shared C01/C02 styling and layout bounds are unchanged.

The provider's information-import controls guide the selected own training summary through the observed own enrolment → eye → **Übersicht** path. A failed source read exposes **Ausgewählte Quelle erneut abrufen**: the user explicitly repeats the original selected source with fresh account/club checks. Changing category, owner, cancellation or backgrounding removes that retry. An uncertain save/readback instead exposes local reload and blocks new capture until the original capture identity has been checked locally; saved review and history stay available. This adds guidance/recovery states within existing controls, without automatic menu navigation or a new visual style. Native source/offline and affected-toolbar acceptance remain separately recorded.

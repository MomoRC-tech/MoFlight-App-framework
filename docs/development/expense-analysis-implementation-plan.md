# Expense analysis in Statistics — implementation proposal

28 October 2026 · M4 · [#101](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/101) · R04/R12, FL-03/10/11, E07/E09/E11.

**Selected intent:** Manuel requested expense analysis in Statistics and selected flying costs by period and aircraft, with separate membership/other club charges and balance details. **The subsequent handover selects starting E1; implementation has not started. Latest amendment: financial data may now be included.** Necessary read-only own financial source access, local processing/storage and same-install text backup/restore are in scope, including relevant own invoice/ledger records. Do not ask again merely because these records are financial. The source/money contract and concrete UI selection remain required; this amendment turn changes documentation only. The [project plan](../project-plan.md#next-executable-packages) owns scheduling and beta scope. This document owns the implementation sequence; #101 owns the short package contract and acceptance checklist.

## Source findings and unresolved meanings

Reviewed against main `81b73e0` on 28 October; source inspection only, with no new private/provider retrieval.

| Existing evidence or code | What it establishes | What it does not establish |
| --- | --- | --- |
| [Flight field catalogue](../../apps/platform-lab/src/vereinsflieger/fields.ts): `Eigene Kosten (Bezahlt)`, `Abgerechnet`, `Abr.` | The existing capture vocabulary recognizes personal-cost/billing labels | The value grammar, personal liability versus paid amount, currency, adjustments or a usable expense projection. `Abgerechnet` is not proved payment status |
| [Information reader](../../apps/platform-lab/src/vereinsflieger/information.ts): member ledger `Datum`, `BuchungsNr.`, `Abrechnung`, `Informationen`, `Wert (EUR)`, `Saldo (EUR)` | A strict bounded reader and stored observations already exist | Complete history, stable unique booking/revision identity, every sign/kind or reliable aircraft/flight links |
| [19 October category evidence](../product/vereinsflieger-information-discovery.md#basic-retrieval-and-import-checkpoint--19-october-2026) | Historical bounded invoice/ledger observation, save and offline evidence | Current production owner binding, complete periods or expense totals; private values are not copied into this plan |
| [Invoice deferral](../verification/2026-10-20-invoice-retrieval-deferral.md) | Current code disables new invoices; old readers/evidence remain. Manuel lifted the product deferral on 28 October for own financial data needed by expenses | Implemented retrieval, complete coverage, permission to access other members or download arbitrary documents |
| [Current backup](../../apps/platform-lab/src/user-backup.ts) | Current v3 excludes ledger/invoice records. Their inclusion is now selected for a compatible text-archive extension | Already implemented financial export/restore, arbitrary v3 format changes or attachment-file coverage |

**E1 exit decision:** choose the smallest evidenced source supporting the selected personal costs. Reuse saved flight fields and own-ledger evidence; inspect/capture necessary own invoice metadata or structured charge lines under the new financial scope. Prove account/club identity, source meaning, exact period/page coverage and bounded read-only navigation before wiring retrieval. Missing evidence remains unavailable/partial. Never infer expense from a paid amount or sum running balances. This authorization covers the selected user's financial feature, not other members, bank access, provider writes or external AI disclosure.

## Proposed user view

Keep the existing **Statistik** child page, period controls and return path. Add an **Ausgaben** section with this order:

1. Selected period, source coverage and last saved date; incomplete periods remain visibly incomplete.
2. Separate **Flugkosten**, **Mitgliedschaft & Verein** and **Nicht zugeordnet** amounts. Show a combined expense figure only when the categories and source reconciliation are valid. Unknown values never become zero.
3. Monthly flying-cost comparison and **Nach Flugzeug** rows. Each amount opens its exact contributing charges; unallocated aircraft costs remain a separate row.
4. **Kontodetails** opens source movements and a dated, explicitly sourced balance. Payments and balances stay separate from incurred expenses; a balance is not summed across rows or clubs.

Proposed drilldown: **Statistik → Ausgaben → category/aircraft → charge detail → same filtered list → same Statistics period/scroll**. Charge details retain date basis, currency, original source wording, adjustment/linkage and coverage. A flight link appears only with proved identity; missing links do not disable reading the charge. Offline saved results remain usable; no financial retrieval occurs merely by opening Statistics.

Consulted Google's current [Material 3 lists](https://m3.material.io/components/lists/overview), [app bars](https://m3.material.io/components/app-bars/) and [canonical layout examples](https://m3.material.io/foundations/layout/canonical-examples/overview) on 28 October via their indexed official guidance; direct page rendering requires JavaScript. Use short, consistently aligned rows with trailing amounts and a small contextual page header. Adapt these examples to MoFlight's existing navy/cyan groups and controls, scalable text, explicit uncertainty and exact-source drilldowns. Preserve Start, logo, five destinations and dark default. No new component library, navigation rail or global token change is proposed. A synthetic concrete layout review belongs to E3 before appearance implementation; this text is not visual acceptance.

## Ordered implementation packages

| Package / dependency | Deliverable and likely reuse | Acceptance before continuing |
| --- | --- | --- |
| **E1 — source and money contract; selected first package** | Read existing source definitions, tests and authorized saved examples; record one source/field mapping under #101/#10. Specify owner/club identity, exact decimal/currency grammar, charge/payment/credit/refund distinction, accounting versus service date, revision key and coverage. Freeze independent synthetic examples. No app behavior change yet | Each proposed measure has a proved input or an explicit unavailable state. Choose one period-date basis and label it; ask Manuel only where source evidence cannot settle the product meaning. Specify necessary own financial retrieval/storage and the compatible financial archive extension before E2; inclusion itself is already selected |
| **E2 — deterministic local projection; depends on E1** | Extend existing provider/application boundaries with only needed typed financial observations and selectors. Reuse validated owner reads; keep calculations out of JSX. Use integer currency minor units with explicit supported precision and overflow checks, never floating-point monetary totals | Exact period/aircraft/category reconciliation; empty versus missing/partial; refunds, credits, payment reversals, duplicate/revised rows, malformed values, date boundaries and conflicting source links. Test account/store/club changes and late results. Preserve raw records and unrelated flight totals |
| **E3 — Statistics integration; depends on E1/E2 and layout selection** | Prepare a synthetic dark proposal, then implement the selected section in existing `StatisticsOverlay`/model and small scoped components. Reuse periods, grouped rows, details and caller context. No Start restyle | Every total has exact contributors, unknown/unclassified/unallocated is visible, period and scroll survive Back; unavailable data cannot appear as zero or imply a complete year. Relevant deterministic component/navigation tests plus brief affected layout checks |
| **E4 — preservation and beta checkpoint; depends on E2/E3** | Integrate any selected financial source/save path with independent partial failure/retry; implement its versioned financial text archive/update inventory with #29/#34 before delivery, retaining v1–v3 readers and explicit older-archive absence semantics. Freeze a coherent package, then one host/export/committed-source Release and affected native checkpoint | Selected owner source → durable save → totals/details → actual offline restart; foreign/invalid/changed-source and interrupted-save/restore preservation. Dark main phone, narrow/enlarged and relevant wide/keyboard checks. Record exact APK/source and distinguish synthetic native from actual provider/phone/iOS evidence |

Do not make all unrelated historical provider/AI/book issues prerequisites for E1. Conversely, a synthetic E2 pass cannot establish real financial attribution or native/source acceptance. Ordinary full-host checks remain deterministic and make no model calls. Use existing test infrastructure; names for new test modules are chosen with the implementation, not a new framework.

## Calculation rules to freeze with source evidence

- Count expenses once. A flight cost, invoice and ledger posting may describe the same charge; select one authoritative representation or prove explicit reconciliation before combining them.
- Do not transfer the flight-count rule `Duplikat: Ja` blindly to money. A financial charge needs its own identity, reversal and liability evidence; a duplicate-looking flight neither proves nor disproves a payable charge.
- Separate gross incurred cost, payments/credits and balance. Refund treatment follows proved source kind/sign; a top-up is not a negative flying expense.
- Group by explicit currency and club/account. No currency conversion, inferred cross-club balance or date-based aircraft allocation. Unknown aircraft/category remains explicit.
- Period membership uses one named source date basis. Do not mix flight/service dates and ledger posting dates silently. Compare like coverage; a partial year is not a complete annual expense.
- No automatic classification from ambiguous free text. Use evidenced source categories or a reviewed deterministic mapping; ambiguous rows stay unclassified. AI does not calculate or classify this version.

## Boundaries and review decisions

Selected: feature location, personal flying-cost/aircraft breakdown, separate club charges, balance detail and inclusion of necessary own financial source data in local storage and same-install text backup/restore. Starting E1 is selected by the handover instruction. Still evidence-dependent: source authority, sign/date/attribution mapping, completeness, minimal retrieval and compatible schema/version treatment. The concrete UI proposal still needs review before E3; financial inclusion and necessary own invoice/ledger access do not require a repeated scope approval.

Financial archive requirements: include required raw structured/text evidence, identity/revision/currency/date metadata and relations for exact offline reconstruction; exclude credentials, other-owner records and attachment/PDF bytes. Use an explicit new aggregate version if the exact schema changes; do not reinterpret v3. Older archives must remain readable and must not erase newer financial data merely because their format lacks it. Update pre-export disclosure and test invalid/foreign/newer input, interrupted recovery, exact round-trip and signed update preservation. The archive remains same-install/same-owner and subject to its existing unencrypted-backup disclosure.

Excluded: provider writes/payments, bank connections, manual external-expense entry, AI classification, tax advice, new services and spending. Keep private amounts/parties/source pages local and ignored; commit synthetic fixtures and sanitized findings only. Existing flight/Medical/club functionality remains usable if expense data is unavailable.

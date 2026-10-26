# Instructor presence and PIC in saved Vereinsflieger flights

Date: 26 October 2026, Europe/Berlin. Scope: read-only source interpretation for [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), with later Statistics and paper-writing implications under #9/#7. This records source evidence and a conservative interpretation, not a change to the flight mapper, legal credit or a production role decision.

## Source and method

The existing ignored local, owner-scoped saved-flight backup at `local-data/simple-flight-loading-2026-10-21/provider-before/before-backup-private.json` was read without changing it or contacting Vereinsflieger. One 101-row, 48-column capture was examined by column position. The comparison used only field presence and equality of the raw `Pilot`, `PIC` and `Begleiter/FI` texts, plus whether the provider's `PIC-Time`, `Dual-Time` and `FI-Time` cells contained a nonzero value. No names, flight IDs, dates or raw rows are included here. Rows were not deduplicated or independently matched to legal crew identities.

| Saved-source pattern | Rows | What it establishes |
| --- | ---: | --- |
| `PIC` text equals `Begleiter/FI` text; companion filled | 96 | The provider recorded the accompanying person's text as PIC. Of these, 94 also contain nonzero `Dual-Time`; two have no populated role-time cell in these three columns. |
| `PIC` text equals `Pilot` text; `Begleiter/FI` blank | 5 | The provider recorded the pilot's text as PIC. All five contain nonzero `PIC-Time`. No onboard companion is evidenced in this view. |

Every row has the same raw `Flugart` code `S`; `FI-Time` is blank throughout. Thus `S` does not separate the accompanied and unaccompanied patterns, and an empty `FI-Time` cell does not establish absence of an instructor. The 101 rows are one saved requested-window observation, not all flights, a second-account comparison or proof that an accompanying person holds an FI(S) certificate. The `Begleiter/FI` heading explicitly covers more than one possible role. Matching name text is not a stable person identity.

## REST specification cross-check — 26 October 2026

The provider's preserved [REST specification](../reference/vereinsflieger/rest-api-2026-05-12.pdf), edition 12 May 2026, adds stable identifiers and an important distinction (PDF pages 8–13):

| Documented field or endpoint | Meaning for this question |
| --- | --- |
| Flight `uidpilot` / `pilotname` and `uidattendant` / `attendantname` | Separate person IDs/name slots. The latter is explicitly described as **Begleiter / FI**, so a nonzero `uidattendant` identifies the accompanying person, not their confirmed instructor function. IDs are stronger than matching name text. |
| Flight `uidfi` / `finame` | On add/edit, `uidfi` is **Fluglehrer bei Flugauftrag**; on read, these are **Flugauftrag von**. This is the instructor associated with the flight assignment/authorization, not a documented onboard-crew or PIC field. Do not treat equality with `uidattendant` as guaranteed or `uidfi` alone as presence aboard. |
| `ftid` | Flight-type ID; the write examples mention standard `10` or `8` for school flight. School-flight type alone does not identify the person instructing, distinguish dual from supervised solo, or assign command. Browser `Flugart S` has not been shown to be the same encoding. |
| `flight/list/myflights` and `flight/list/user` | The text says the lists include flights **as pilot and as FI**. This suggests an FI relationship in provider selection, but the documented response has no per-row reason/role marker and does not say whether the matching FI is `uidattendant`, `uidfi`, or both. A live permitted response comparison would be needed before using list inclusion to confirm onboard instruction. |

The documented `flight/get/[flid]` response lists neither a `PIC`/commander field nor `PIC-Time`, `Dual-Time` or `FI-Time`. The REST description therefore cannot replace the saved browser/export `PIC` fact or determine legal command by itself. This is a documentation reading, not a live REST compatibility test; no API request or credential use occurred. The REST specification also states that an app key is club-created, requests are limited to 500 per day per key and commercial use is prohibited, so access/permission remains a separate gate.

## Interpretation boundary

For MoFlight, the unambiguous provider `PIC` field identifies **who Vereinsflieger records as PIC** for that flight. `Pilot` identifies a different source slot and may be the student; `Begleiter/FI` identifies an accompanying person but does not by itself certify that person's instructor function. Nonzero `Dual-Time` is source-reported dual time for the relevant subject, supportive of instruction but insufficient to identify or credential the instructor. A generic `Flugart` code, a companion name, seat position or an old prototype template must not fill an absent PIC or FI role.

A confirmed “flight with an instructor on board” needs flight-linked, role-specific FI evidence, such as an explicit onboard `Fluglehrer (FI)` detail field or a reviewed provider/club mapping that identifies the accompanying person and applies to that record. The REST `uidfi`/`finame` flight-assignment fields alone do not meet that test. Until then, accompanied school-flight patterns may be shown as **dual/instructor candidate**, with the reason and unknown role explicit. If the confirmed FI and explicit PIC are the same identified person, the source records that instructor as PIC. If they differ, retain both facts for review; do not overwrite the explicit PIC. Missing, conflicting or ambiguous PIC evidence remains unknown. An unaccompanied row does not disprove an instructor supervising from the ground.

EU sailplane operations define PIC as the person designated in command and require the operator to designate a qualified PIC ([Regulation (EU) 2018/1976, Part-DEF and SAO.GEN.125](https://eur-lex.europa.eu/eli/reg_impl/2018/1976/2021-11-15/eng)). The [EASA Sailplane Rule Book, SFCL.300 and AMC1 SFCL.050](https://www.easa.europa.eu/sites/default/files/dfu/Sailplane%20Rule%20Book.pdf) requires a sailplane instructor to be entitled to act as PIC during instruction and permits FI(S) instructional time to be logged as PIC. These rules support keeping **command designation**, **instructor function** and **loggable time** distinct. A provider cell is a recorded claim, not independent proof of the operator's designation or licence privileges. The provider's [flight-entry manual 5001](https://vereinsflieger.de/member/help/index.php?hid=5001) was inaccessible to the web tool in this pass; its earlier documented observation that `Pilot` can be a student and `Begleiter/FI` can be instructor or guest was reused from the [existing discovery report](2026-10-10-vereinsflieger-discovery.md#flight-field-dictionary-and-import-implications).

## Verification and remaining work

The read-only structural count above was computed from the preserved private backup; no provider request, app code change, build, device test or paid service occurred. Names and raw private records remain ignored locally. Before implementing an instructor filter, formal role allocation or paper credit, compare role-specific detail/source evidence for representative own flights, verify person identity and applicable club code meanings, and test positive/unknown/conflict cases with synthetic fixtures. The older prototype's blanket `Begleiter/FI` → PIC writing rule is historical and is not a current import rule.

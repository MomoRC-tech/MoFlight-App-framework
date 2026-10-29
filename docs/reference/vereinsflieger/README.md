# Vereinsflieger REST reference

[Original REST specification](rest-api-2026-05-12.pdf), edition **12 May 2026**, 31 pages. Manuel supplied it on 25 October 2026 as `vereinsflieger rest API DOC-20261017-WA0004.pdf` and explicitly requested repository preservation. Copied unchanged; the attachment filename date is not the edition date. Provider-authored reference, not MoFlight documentation or a live-response sample.

SHA-256: `3e57df479ef34293c22ed0b111d8c2797c5b887a58953c167eb66022de3fbc45`.

## Relevant definitions

| Section / PDF page | Evidence and application |
| --- | --- |
| 3.1–3.2 / 8–9 | Flight writes use string `starttype` values E, W or F. Together with the named launch methods on page 11 these support Eigenstart/Selbststart, Winde and F-Schlepp display aliases. |
| 3.5 / 10–11 | Flight read returns explicit `planetype` (examples Segelflugzeug, Reisemotorsegler, Ultraleicht). Use the captured Luftfahrzeugart; do not guess from model/registration or promote generic Motorsegler to TMG. |
| 3.5 / 11 | Numeric read `starttype`: 1 Eigenstart, 3 F-Schlepp, 5 Winde, 7 Gummiseil, 9 Fahrzeug. These are REST response enums, not proof that numeric browser cells share the encoding. The browser projection intentionally leaves numeric cells unknown. `flightmode` and `ftid` are different concepts. |
| 3.1–3.5 / 8–11 | `uidpilot` and `uidattendant` distinguish pilot from companion/FI identities. Separate `uidfi` / `finame` is labelled instructor for/from a flight assignment (`Flugauftrag`), not a documented occupant or PIC. The `flight/get` response has no documented PIC or PIC/Dual/FI time field. [Source-role review](../../verification/2026-10-26-instructor-pic-source-review.md#rest-specification-cross-check--26-october-2026). |
| 3.9–3.10 / 12–13 | Personal flight lists say they include flights as pilot and FI, but provide no per-row reason/role marker or mapping to the companion versus assignment instructor. Live permitted response comparison is needed before interpreting inclusion as onboard instruction. |
| 9.1–9.3 / 23–24 | Work-hour list/add and category list describe performed entries, duration, status and category. No personal annual required-hours field or endpoint is documented here. |
| 6.1 / 17 | Member list has generic custom properties, requiring member-edit permission. A club could potentially use a property for its target, but this specification does not establish that meaning, personal availability, year/unit or permission to broaden retrieval. |

The app continues its selected browser-based retrieval. This reference does not approve REST activation, API keys, provider writes, commercial use, additional member-data access or new infrastructure. Source definitions do not establish live completeness. Annual monetary Pflicht is not converted to hours; the editable provisional target remains until an explicit permitted personal source is verified.

Tracking and implementation evidence: [#85](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/85), [#86](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/86), [package report](../../verification/2026-10-25-flight-classification.md).

**29 October #86 conclusion:** the permitted own profile, work-hours list and available columns expose monetary annual obligations and performed hours, but no explicit personal annual hours quota. Official help 16003/8000/8002 confirms the distinction and category-dependent accounting. [Completed member-facing investigation](../../verification/2026-10-25-flight-classification.md#required-hours-source-investigation-completed--29-october-2026) closes the research with an unavailable-source finding; the editable target stays provisional and no EUR/hour conversion is implemented.

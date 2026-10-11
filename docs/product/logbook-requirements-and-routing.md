# Logbook requirements, printed formats and automatic routing

Research: 2026-10-10/11, Europe/Berlin. Tracking: [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11), import [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2).

Manuel requested research into when different printed books are used and whether aircraft class can identify the destination book. Scope: German private gliding, TMG, aerodynamically controlled ultralight and powered-aeroplane flying. This evidence supports the routing proposal below; production format activation and ADR 0007 remain subject to the existing review gate.

## Findings from primary sources

### German authority guidance

The [Luftamt Südbayern guidance page](https://www.regierung.oberbayern.bayern.de/ueber_uns/zentralezustaendigkeiten/luftamt_suedbayern/) currently points to [NfL 2212-21, dated 16 April 2021](https://www.regierung.oberbayern.bayern.de/mam/dokumente/bereich2/sg25/nfl__2212-21.pdf). Its sections II.4, III and appendix 4.3.1 leave separate category books to the pilot, recommend category-specific columns, recommend a separate national-licence book where applicable, and call for distinguishable SPL/TMG data. They prohibit duplicate flight-time entries. A particular commercial printed product is not prescribed.

The appendix specifies UTC and category-dependent flight-time definitions, including movement-to-stop time for aeroplanes/TMGs/self-launching sailplanes versus launch-run-to-stop time for other sailplanes. Section 4.1 lists identity, aircraft, places/times, duration/totals, role and operating conditions; launch method applies to non-TMG sailplanes. Sections 4.2 and 4.3 address endorsements, permitted grouped entries, same-day recording and visible dated corrections. Section IV gives a five-year retention minimum in its scope. This guidance supersedes NfL 2-330-17; do not use the older notice as the current basis. Subsequent EASA changes must also be considered.

### EASA sailplanes and powered aeroplanes

[SFCL.050 and AMC1 SFCL.050](https://www.easa.europa.eu/sites/default/files/dfu/Sailplane%20Rule%20Book.pdf), pages 60-61 of EASA's November 2022 rule book, require a reliable record in the authority's prescribed manner and describe a suitable format containing pilot identity, PIC, date, places/times, aircraft model/registration, duration/totals, launch method, pilot function and operational conditions. The AMC includes supervised-solo signatures and limited same-day grouping. It does not select a named printed book. SFCL distinguishes TMG privileges and experience; TMGs can also be flown under Part-FCL privileges. Aircraft category therefore does not establish which licence context a pilot is using.

For Part-FCL, [FCL.050/AMC1 FCL.050](https://www.easa.europa.eu/en/document-library/easy-access-rules/online-publications/easy-access-rules-aircrew-regulation-eu-no?kw=ppl&page=4) provides the baseline recording fields, including SE/ME where applicable, pilot-function time, night/IFR and FSTD records. This linked online edition is August 2023, not the latest consolidation. The [November 2025 publication](https://www.easa.europa.eu/en/document-library/easy-access-rules/easy-access-rules-aircrew-regulation-eu-no-11782011) was located; its PDF could not be read through the web tool in this pass. Relevant [Amendment 13, February 2025](https://www.easa.europa.eu/sites/default/files/dfu/amc_gm_to_part-fcl_-_issue_1_amendment_13.pdf) changes FCL.050 role/test recording. [Amendment 15, July 2026](https://www.easa.europa.eu/en/downloads/143882/en) was also inspected; it addresses FSTD-related provisions, with no FCL.050 amendment located. Do not implement the older German dual/test examples as an unconditional current role algorithm; complete that comparison before production role allocation.

### German ultralights

[LuftPersV §120](https://www.gesetze-im-internet.de/luftpersv/__120.html) applies to the national personnel categories it names. It requires all flights and specifies PIC name, date, aircraft model/registration where required, flight type, departure/arrival places and UTC times, flight duration and accumulated duration. Relevant instructor/examiner evidence requires certification with licence type/number. It sets two-year retention after the last entry and carriage/presentation duties; delegated bodies may allow exceptions or require additional fields. This scope must not be conflated with the five-year guidance above.

The delegated [DAeC ultralight licensing guidance](https://lsgb.daec.de/ul-ausbildung/lizenzen) confirms national UL licensing, logbook evidence and instructor/examiner signatures. Some experience can involve TMGs or piston single-engine aeroplanes; storing a flight once must allow separately evaluated qualification evidence. This research does not implement a recency/eligibility calculator or establish all DULV/DAeC exceptions.

## Representative printed formats inspected

These are commercial product/layout evidence from the responsible supplier, not authority approval. Product descriptions alone do not prove that all current requirements are met. Blank sample images were inspected directly in Chrome; they were not copied into Git. Page capacity, grouping and every field placement require a full format acceptance check before activation.

| Candidate | Observed difference | Consequence for MoFlight |
| --- | --- | --- |
| [Schiffmann Segelflug/TMG, S4640016](https://www.eisenschmidt.aero/flugbuch-fuer-segelflieger-tmg/S4640016) | Published samples 12/13 show aircraft, PIC/companion, route, UTC start/off-block and landing/on-block; total/PIC/dual/FI(S)/FE(S), launch counters, distance and endorsements. | Gliding counters and role columns need explicit mapping. A title including TMG does not prove distinct TMG totals in every layout; validate their placement. |
| [Schiffmann EU-FCL, s4640013 / 65010](https://www.eisenschmidt.aero/flugbuch-nach-eu-fcl/65010) | Interior spread has category time columns, day/night landings, night/IFR time, PIC/dual, FI/FE selection and endorsements. Supplier describes use across several pilot categories. | One product can serve more than one category. Identify actual edition and meanings of extra columns; do not equate the product name with an aircraft class. |
| [Ultralight, S4640010 / 60525](https://www.eisenschmidt.aero/flugbuch-fuer-ultraleicht/60525) | Interior sample shows flight number, date, model/registration, pilot/companion, UTC off/on-block, hours/minutes, places and remarks/certification. | Preserve block times and endorsement text. Role, flight-type and landing information may need explicit supplemental mapping rather than invented columns. |

The compared samples establish layout diversity. They are candidates for profiles, not implemented or certified profiles. Manuel subsequently supplied his actual DIN A6, 590-start EU-FCL gliding book excluding TMG; its [photographed layout draft and preview](../verification/2026-10-11-supplied-gliding-format.md) now govern the first gliding writing destinations. Publisher/edition are not inferred from these supplier examples. A pilot's personal flightbook is distinct from an aircraft Bordbuch and from a school's syllabus/training record.

## Proposed routing behavior

Aircraft class is a useful routing key. With a verified class and one matching saved rule, the app can identify the pilot's specific destination book automatically. A class does not uniquely identify the commercial format, licence context or active physical volume before setup.

| Verified provider category | Initial suggestion | Setup needed once |
| --- | --- | --- |
| `Segelflugzeug` | Active gliding book | Actual format/edition, accepted aircraft scope and source of required timing/launch fields. Engine-equipped glider remains a glider unless verified as TMG. |
| `Reisemotorsegler` | TMG route | Pilot selects compatible gliding/TMG, Part-FCL or combined book policy; keep TMG totals distinguishable. |
| `Ultraleicht - Aerodynamisch` | Active German UL book | National context and actual format; permit a reviewed compatible combined-book policy. Other UL subtypes require their own evidence. |
| `Motorflugzeug` | Active powered-aeroplane book | Applicable licence context, actual format and additional class/type fields. Broad provider category does not identify SEP/MEP or all required privileges. |
| Missing/conflicting category, ambiguous aircraft match, reservation-only placeholder | Review | Confirm the source/classification; no default to the currently open book. |

Recommended setup and import rules:

1. Pilot registers each physical book with name, format/edition, accepted categories, optional licence/operation scope, active dates and initial carryovers. Format identity and physical volume identity remain separate.
2. Propose class-to-book assignments from the verified aircraft catalogue/flight fields. Pilot confirms the initial assignment; remember it. One combined book may accept several categories with separate counters.
3. Apply a unique matching assignment automatically on ordinary imports. Ask again only for missing/conflicting evidence, an unsupported format or genuinely competing destinations. Do not request confirmation for every known flight.
4. A successor volume closes the previous route for new entries from an explicit effective point. Backdated flights require date-aware routing and paper-state review; no silent movement of already confirmed entries.
5. Keep one canonical source flight and one ordinary primary book-entry destination. Multiple licence reports may reference that evidence without creating duplicate logged time. Archival scans/copies are evidence, not additional credited flights. Any exceptional multiple-book use requires a separately reviewed policy.
6. Keep per-book pages, numbering, copy confirmations, photos and writing snapshots independent. Keep category totals and licence evidence distinguishable even inside a combined book. Combined queries count a flight once and do not sum PIC/FI/dual columns as disjoint durations.
7. Validate required fields for the selected recording profile before producing writing instructions. Preserve launch, airborne, block and engine measures distinctly; select the appropriate proven time basis. Provider labels and product headings alone are insufficient.

These are implementation proposals based on researched constraints and Manuel's requested remembered routing. No database migration, canonical import or format has been activated.

## Next implementation evidence

Extend the [multi-book proof](../architecture/multiple-logbooks-proof-plan.md) with a combined book, TMG policy, successor effective point, backdated import, unique automatic routing and ambiguity review. Include rejection of unintended duplicate credit and preserve the original entry when source evidence changes.

Before enabling each real format: record edition, complete blank spread, required fields and exact destinations, row/grouping capacity, carryovers, time basis and endorsement handling. Use synthetic flights to verify the resulting writing instructions. The published examples reduce the need to ask Manuel to find generic books; confirmation of his actual edition remains necessary when activating his writing profile.

Remaining bounded research: current Part-FCL role/test amendments against German guidance; competent-authority acceptance for any future digital-only replacement; delegated UL exceptions; full TMG/layout acceptance. None prevents a synthetic multi-book/routing proof. This research completes the requested initial rules/layout comparison; #10's live retrieval/export questions remain open.

Validation: primary legal/authority and supplier pages inspected, relevant PDF pages read completely, three published blank layouts visually compared; relative links and whitespace checked. No runtime code changed or app tests rerun. No credentials, personal flights or copyrighted page images committed. EASA compilation dates and unresolved update limits are explicit.

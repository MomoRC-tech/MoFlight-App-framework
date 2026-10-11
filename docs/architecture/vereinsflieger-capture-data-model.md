# Vereinsflieger capture and storage data model

Date: 2026-10-11, Europe/Berlin. Status: concrete proposed logical model for review; not a production database migration or completed detail scraper. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), discovery [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10), multiple books [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

Manuel requested a presentation of the data to be captured and stored after the source investigation. This model combines [capture requirements](../product/vereinsflieger-capture-requirements.md), [observed list/detail fields](../verification/2026-10-11-vereinsflieger-capture-fields.md), the [aircraft catalogue investigation](../verification/2026-10-10-vereinsflieger-discovery.md#aircraft-catalogue-follow-up) and the [list/detail retrieval proposal](vereinsflieger-import-contract.md#list-discovery-plus-per-flight-detail-enrichment--2026-10-11-proposal). Output layout, legal flight-credit calculations and paper-book progress are separate concerns.

## Logical records and relationships

These are logical records, not a commitment to one SQLite table per row. Keep the current local-first SQLite writer and avoid new infrastructure. Every record belongs to the local pilot/account's isolated storage; foreign source references are not authorization by themselves.

| Record | Stored content | Relationship / purpose |
| --- | --- | --- |
| Source scope | Local pilot/account ID, provider, candidate provider-account and club references, displayed labels, identity verification state and evidence | One local pilot can have multiple provider/club scopes. Display labels never substitute for verified identity. |
| Retrieval run and windows | Run ID, scope ID, started/finished times, requested date bounds and their verified interpretation, participation selection, list filters, returned counts, page/window progress, caps, errors and completion evidence | Establish what history was actually searched. Keep list coverage separate from detail completion and field completeness. |
| Source flight | Local source-flight ID, scope ID, provider flight reference, first/last observed times and current revision reference | One identity across repeated reads. Production uniqueness is based on verified provider/account/club plus source reference, independent of a logbook ID. |
| Source observation | Observation ID, target flight or aircraft, retrieval run, source kind, retrieval time, safe page path/reference, adapter/mapping version, allowlisted ordered section/label/raw-value records | Immutable evidence from list, detail or catalogue. Do not save credentials, cookies, signed navigation parameters or entire HTML pages. Preserve repeated billing rows with their section and position. |
| Flight facts revision | Source-flight ID, revision ID, selected field values, references to supporting observations, interpretation status and relevant units/time basis | A reviewed, book-independent view of source facts. Conflicting list/detail facts remain explicit and do not erase either observation. |
| Aircraft catalogue revision | Local aircraft ID, source scope, candidate provider aircraft reference, registration, original model/type and meter-unit evidence, retrieval time | Cache once for many flights and retain revisions. Registration is a lookup value, not the local storage ID. |
| Flight-to-aircraft association | Source-flight ID, aircraft revision ID, matching basis and state: unresolved, unambiguous, conflicting or confirmed | Match flight `Lfz.`/`CallSign` against the relevant club catalogue registration. Do not force missing/multiple matches. Current catalogue data does not prove historical classification. |
| Flight cost observation | Source-flight ID, observation ID, charge rows, displayed total, currency, charged-party evidence and raw billing status | Separate optional financial evidence. Missing cost data must not block flight capture or determine flight credit. |
| Detail retrieval task | Run/scope/flight references, pending/success/error state, attempts, last attempt and safe failure reason | Resume outstanding details after interruption/login renewal. No credentials or signed URL cache in tasks; resolve links again in the authorized session. |

An unchanged repeat read may point to existing identical evidence and record that it was checked again; changed evidence retains prior revisions. No omission implies deletion. Scope mismatches stop association/import. The production identity and migration checks in [ADR 0007](../adr/0007-multiple-logbooks-and-formats.md) remain necessary before canonical integration.

## Flight fields to capture

All source fields are optional observations; their presence is not a legal completeness claim. A decoder may require a small supported set of anchors to recognize a page safely. Capture fields exposed by the authorized list/detail view, preserving distinct meanings. “Offered” means visible in configuration, not verified as populated in an actual record.

| Group | Logical fields / provider labels | Source and preservation |
| --- | --- | --- |
| Identity/context | Provider flight reference (`Eintrag` / `flid`), `Verein`, local subject-pilot association | List links and details. Provider-account/club stable references and cross-context durability still require verification. |
| Date | Flight date (`Datum`) | Keep raw date plus a validated calendar date when parsed. Do not presume creation/change dates are flight dates. |
| Clock times | Start (`Start` / `Startzeit`), landing (`Landung` / `Landezeit`), `Off-Block`, `On-Block`; clock timezone/basis and arrival-day relationship | First pair observed; block clocks offered. Raw clocks do not assert wheels-off/on boundaries. Overnight day association remains unknown unless established. |
| Reported duration | `Flugzeit`, `Flugzeit in hh:mm`, `Blockzeit in Minuten`, `Blockzeit in hh:mm` | Preserve reported flight and block measures independently, including alternate presentations. Clock subtraction is a separate comparison; it must not overwrite a corrected provider duration. |
| Aircraft as recorded on flight | Registration (`Lfz.` / `CallSign`), original model (`Lfz.-Muster`), explicit type (`Luftfahrzeugart`), aircraft association | Model/type depend on list configuration; inspected details lacked dedicated model/type. Catalogue enrichment is described below. Preserve flight and catalogue discrepancies. |
| People | `Pilot`, `PIC`, `Begleiter/FI` / `Begleiter / FI`, `Begleiter 2`, `Begleiter 3`, `SIC`, `Fluggenehmigung von` | Keep distinct slots/labels with name and candidate person reference if exposed. Not all fields occur in every view. No contact/profile scrape; no PIC inference from Pilot or charge attribution. |
| Reported role time | `PIC-Time`, `Dual-Time`, `FI-Time`, original unit/presentation and subject association | Offered/list evidence. Do not assume blank means zero, allocation is verified or role columns are mutually exclusive. Examiner/other function evidence is retained if explicitly exposed; not inferred. |
| Operations | Launch (`S.-Art` / `Startart`), `Flugart`, `Flugmodus`; winch (`Winde`) and relevant tow evidence if available | List codes plus detail text. Flight type, operational mode and launch method are distinct. Club-configured codes need an evidenced mapping. |
| Places | Departure (`Startort`), arrival (`Landeort`), optional verified place reference/name/code | Preserve original place text. An outlanding need not have an ICAO code; arbitrary names must not be stored as verified ICAO codes. |
| Counts/distance | `Landungen`, `Km` and units | Preserve total landings independently of day/night split. Distance is not a flight-time measure. Multi-landing flights remain one source flight. |
| Engine | `M.-Start`, `M.-Ende`, `Motorzeit`, configured aircraft meter unit | Offered/manual evidence. Preserve readings/duration/unit separately. Missing or unknown meter units block conversion rather than become minutes. |
| Status/notes | `Duplikat`, `Bemerkung`, `Kommentar` | Keep explicit duplicate status as source evidence, distinct from repeated retrieval. Notes remain text, not verified instructor signatures. |
| Provenance | `Erfasst`, `Geändert`, `Datenquelle`, necessary actor attribution if needed | Details observed. Preserve raw timestamp and timezone uncertainty; flight-clock UTC documentation does not establish the timezone of every audit timestamp. |
| Training link | `Ausbildungsschritt zugeordnet`, objective references if exposed | Preserve flag/link evidence; full curriculum retrieval is later. One flight linked to multiple objectives must not duplicate flight identity/time. |
| Conditional operational evidence | Day/night counts, night/IFR duration, flight rules, cloud/aerobatic conditions, endorsement evidence, if explicitly exposed | Dedicated day/night/IFR fields were not observed in the inspected configuration/details. Store as not captured until evidence exists; never default to daylight/VFR or fabricate signatures. |

## Aircraft catalogue fields and lookup

| Field | How it is stored/used |
| --- | --- |
| Registration | Original catalogue `Lfz.` value and a conservative comparison value; match in the relevant club scope. Do not infer category from its prefix. |
| Model | Original `Musterbezeichnung`. A later standardized model is a separate derived value with mapping evidence; original text is retained. |
| Type | Original `Luftfahrzeugart`, including the provider's glider/TMG/powered/UL distinctions where exposed. A later normalized taxonomy must distinguish categories and subtypes. |
| Provider aircraft reference | Candidate `apid` if exposed; stability and flight join semantics remain unverified. |
| Meter unit | Capture only when exposed in authorized aircraft details; the manual describes per-aircraft configuration. Do not guess from registration/model. |
| Source/freshness | Scope, observation/revision IDs, retrieved time, match confidence and historical applicability if actually known. Exclude catalogue placeholders that do not represent an aircraft after verifying their semantics. |

The lookup enriches model/type once per flight association and supports offline queries. A verified explicit flight model/type is not silently overwritten by a conflicting current catalogue entry. No aircraft owner/contact identity is required.

## Cost fields

| Field | Storage rule |
| --- | --- |
| Charge line | Source row order/reference if available, original charge description, charged-party reference/name, original amount and currency, and any explicit account/credit label. Repeated descriptions remain separate rows. |
| Displayed total | Original total/currency, independently of calculated line sums. Preserve discrepancy for review rather than silently adjusting values. |
| Parsed amount | When unambiguous, signed integer minor units with explicit currency/exponent; retain original text. Never use binary floating-point money or assume every currency has two decimal places. |
| Billing | Original `Abrechnungsart`, `Abzurechnende Personen`, `Abgerechnet`; interpreted status only after meaning is verified. Billed is not automatically paid. |
| Personal expense attribution | Unresolved unless the charged-party/account semantics establish which amounts belong to this pilot. A flight total is not automatically personal spend. |

Cost evidence stays local and separate from mandatory flight fields. No forecasts, payment/account access, balance synchronization or automatic financial action are part of this model. Actual financial observations never belong in repository fixtures.

## Field states and evidence

Each stored/selected field needs a state, not just a nullable number:

- **Not captured:** unavailable, hidden, permission-limited or not retrieved; reason is recorded when known. This does not mean the fact does not exist.
- **Source blank:** the field was present but empty; retain its label and original text.
- **Observed value:** original source text exists; attach observation/label/position. It can still have unverified meaning.
- **Unresolved/invalid:** parsing or semantic verification failed; retain source text and a safe reason rather than invent a value.
- **Conflict:** competing observations or interpretations exist; link each and retain the review decision separately.

Parsed values retain type, unit, mapping version and verification status. Zero is a value. A person name is not a verified person ID. The current lab [field inspector](../../apps/platform-lab/src/vereinsflieger/fields.ts) implements the first three raw states only; unresolved/conflict/parsed facts are proposed extensions, not existing behavior.

## Retrieval completeness and multiple books

A run records list discovery and per-flight detail progress independently. It is possible to have a complete verified date window but an incomplete set of details, or a retrieved detail with missing fields. A verified empty window needs source identity, exact scope and success evidence; a login page/error never establishes emptiness. Record provider row/flight/duplicate counts separately where exposed. Do not assert full history from a recent-20 list.

One source flight and its aircraft/cost evidence are shared across this pilot's books. The separate book domain holds `logbookId`, account ownership, format/version, source-flight links, book entries, paper pages/progress, confirmations and book-specific decisions. Those are not scraped from Vereinsflieger. Retrieval records have no paper column positions and do not duplicate costs/time per book. Primary credited destination and historical routing remain subject to the multi-book proof; merely linking evidence to a book does not credit flight time.

## Implemented versus proposed

Implemented: isolated native raw snapshots (`headers`, aligned row strings, candidate flight reference, capture/retrieval identifiers) with unverified identity/time/full coverage; a default-view-compatible bounded reader and pure list-field inspection. These preserve raw evidence but do not implement the complete records above.

Observed in desktop browser: current list fields, two own-flight detail patterns/cost-section structure, repeat bounded references, a date-specific empty view and catalogue classes. Detail bulk/native retrieval, verified account/club identity, complete paging/history, catalogue matching/cache, cost storage and canonical multi-book persistence remain unimplemented/unverified as specified in the linked reports. No production schema or ADR approval is claimed.

Verification for this document: every current list-inspector label is represented in the field inventory; local Markdown destinations and whitespace checked before publication. No application change or new runtime test is part of this model presentation.

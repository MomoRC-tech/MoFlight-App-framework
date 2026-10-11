# Bounded Vereinsflieger detail-enrichment proof

Date: 2026-10-11, Europe/Berlin. Baseline: `6179b52`; implementation/evidence are included in the commit introducing this report. Tracking: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), discovery [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10). ADR 0007 remains Proposed.

## Actual authenticated desktop observations

Refreshed browser inventory and used only the existing signed-in Vereinsflieger Chrome tab. The personal list displayed **Die letzten 20 Flüge (max. 24 Monate)** and **Pilot**, with 20 observed detail links. Resolved relative `viewflight.php?flid=...` links against the current list URL; no ID enumeration, flight edits or saved-column changes. An initial selector expected absolute link attributes, found none and unintentionally reached the overview; the attempt was discarded, the personal list reopened and the selector corrected to the observed relative attributes. This illustrates why observed-link resolution and expected-page validation are mandatory.

Selected three links from that own-flight list, covering flight authorization and companion/instructor conditional rows and two flight-record registrations. Each page was read twice sequentially. All three returned **20 allowlisted general/flight fields**, matching the expected `flid` to `Allgemeine Daten / Eintrag`. Each second read returned identical ordered section/position/label/raw-value records. Live values remained only in the temporary browser automation session; no flight IDs, personal values, financial observations, screenshots, HTML or databases are saved here. The browser was restored to the personal list; the displayed filters and 20 links were unchanged.

Observed sections: `Allgemeine Daten`, `Flugdaten`, `Abrechnungsdaten`. The flight/detail table uses `table.view`; billing is nested and must not be flattened into flight rows. The detail companion label is **Begleiter / FI**, while the list label is **Begleiter/FI**. One sample exposed `Fluggenehmigung von`, the other two `Begleiter / FI`; absence of either conditional row is not a blank value or proof of a flight role. `Kommentar` was explicitly blank. Dedicated PIC/model/type/off/on-block fields were not captured in these three details. Allowlist entries for other possible fields are preparation, not evidence that they occur.

This establishes bounded repeat stability within the current signed-in context, not globally stable flight IDs, full history, verified pilot/club IDs or historical aircraft classification. The visible club label differs in presentation between list/detail and cannot substitute for a stable scoped identifier. The current recent-20/Pilot selection bounds this proof; it does not establish other participation modes or complete paging/date coverage. A DOM `daterange` selector offered 1 day, 1/3 months, 1/2/3/5 years, unrestricted and end-date options, but its default was not the applied recent-20 filter: do not use hidden control defaults as coverage evidence. No new filter was submitted.

## Implemented executable lab boundary

- `apps/platform-lab/src/vereinsflieger/details.ts`: standalone DOM-only read function, strict expected-link/reference decoder, ordered section/label/position provenance, missing/blank/value inspection and one-attempt immutable checkpoints for a maximum of three observed links.
- Costs are explicitly `not-captured`. Unknown fields are excluded; this is not an exhaustive field-completeness claim. General provenance fields remain private local evidence. No inference of credit, aircraft subtype, billing payment or book membership.
- Every successful read appends an observation. Repeat/changed reads retain earlier evidence. Failed pages never become successful empty details or erase earlier observations. Tasks retain safe error codes and attempt counts, not response text or credentials.
- Scope is an explicitly provisional lab context. A scope mismatch or unlisted flight is rejected, but this does not prove automatic detection of a provider account switch. Fresh links must be resolved again from the own list after renewed login.
- The contract is not connected to native WebView navigation, SQLite, the probe UI or canonical imports. Checkpoints in tests are trusted synthetic files, not user backup imports. No production schema/migration or architecture acceptance follows.

## Verification

Windows active checkout, installed Node/TypeScript workspace:

| Check | Result and evidence |
| --- | --- |
| `pnpm typecheck` | Passed strict TypeScript |
| `pnpm test` | All 38 mobile/contract tests passed, including six new detail tests |
| Authenticated three-detail repeat trial | Each expected candidate reference matched; all ordered captured fields identical on repeat |
| Conditional/blank provenance | Synthetic tests and actual label/section comparison; instructor remains source text, not inferred credit |
| Changed/unsafe references and ambiguous schema | Synthetic rejection of wrong IDs, duplicate labels, lost anchors, oversize fields, unsafe origins/credentials/extra URL parameters, ambiguous tables and unrelated page redirects |
| Interrupted checkpoint and resume | Synthetic checkpoint written to disk, reopened, one outstanding task retried after session-required error, saved and reopened again, then completed; prior successful evidence preserved |
| Expired session | Synthetic explicit session-required result and unexpected-page rejection passed; no live forced logout/expiry was performed |
| Repeat/changed revision retention | Synthetic repeat and changed durations append observations without replacing originals |

No new APK, Android/iOS detail runtime trial or native detail persistence is claimed. Existing list-probe behavior is covered by the full test suite. New code is an isolated host/browser proof and is not included in the current UI workflow.

## Registration clarification and next gates

Rechecked [LuftVZO Anlage 1](https://www.gesetze-im-internet.de/luftvzo/anlage_1.html), section II, on 2026-10-11. A valid German registration mark establishes its registration category: D plus digits glider; D-K motor glider; D-E single-engine aeroplane up to 2,000 kg; D-M motorized air-sports equipment; D-H rotorcraft. D-K does not establish TMG and D-E does not establish piston SEP. Updated capture/model wording to distinguish registration-category evidence from finer catalogue classification and pilot licensing context. No classification code was introduced.

Next: establish stable account/club binding and explicit date/participation/paging coverage before scaling; validate aircraft catalogue matching/cache; then wire a bounded native detail scheduler/store with restart and actual session-expiry evidence. Costs remain a separate optional decoder. Present concrete identity/mapping changes and complete multi-book isolation/migration proof before enabling canonical live import. Output design remains deferred.

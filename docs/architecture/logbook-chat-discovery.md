# In-app AI chat: first-version requirements and later discovery

**Current status — 2026-10-24:** Manuel resumed requirements discovery and selected the first-version product choices below. Runtime implementation remains deferred under M5 of the [project plan](../project-plan.md); core retrieval/history/analytics priorities are unchanged. The original broader proposal is retained for later scope. No implementation, provider, personal-data transfer or paid execution approval is inferred.

Original discovery: 2026-10-11, Europe/Berlin; first-version decisions: 2026-10-24. Status: selected product requirements with technical/privacy/evaluation choices still open. No LLM implementation, API-key provisioning, private-data transfer, model selection, paid call or evaluation is authorized. Retrieval and provider-view preservation retain priority.

Tracking: [#13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13), created after reviewing all existing issues and finding no equivalent complete conversational scope.

## First-version product decisions — 24 October 2026

These choices were selected in the requirements conversation and recorded in #13. The recommended comparison presentation was adopted as the working default after Manuel instructed us to proceed; it was not a separate numbered-option answer. This specification is not runtime implementation or acceptance evidence.

| Area | Selected first-version behavior |
| --- | --- |
| Scope | Flight-data chat: questions about saved flights/statistics and general explanations of aviation terms. Photo transcription and photo-assisted writing follow later. |
| Sources | No web lookup. Clearly distinguish saved-data answers from general explanations; do not present the latter as verified current information. |
| Actions | Read-only answers with buttons opening supporting flight details or supported statistics views. No flight-data edits. Validate record references and destinations. |
| Conversations | Separate conversations saved on the device; start new chats, revisit older ones and delete them. Preserve account isolation. |
| Backup | Include saved chats and drafts in supported user backup/restore. This does not select cloud chat synchronization. Restore/version/reference and deletion contracts remain open; provider secrets are excluded. |
| Offline | Saved chats and existing local quick questions remain available. Preserve new free-text questions as drafts; sending after reconnection requires an explicit tap. No automatic reconnect/restart send or ambiguous billable retry. |
| External processing | Design for external AI receiving only the flight information needed for a question; omit names and identifying details where possible. This is data minimization, not an anonymization claim or permission to transfer data before reviewing the concrete flow. |
| Personal usage ceiling | Up to **EUR 3 per month**, with a hard stop; revisit later using measured usage/costs. This is a planning ceiling, not spending approval. Evaluation funding and commercial/multi-user funding remain separate. |
| Person queries | After resolving an unambiguous person, show the latest matching flight, number of matches and a **Show all flights** action. Qualify results by available coverage. |
| Comparisons | Short explanation plus a compact table of flight count, total known flight time and average known duration, with supporting-flight links. No new in-chat chart is selected. Exclude unknown duration from the average denominator and disclose excluded/unknown counts. |

Apply [ADR 0008](../adr/0008-logbook-ai-and-deterministic-boundary.md) and the existing [query semantics](../product/flight-logbook-state-and-queries.md#flight-history-questions): the model interprets and explains; deterministic code owns calculations, identity validation and source references. First-version chat must not require a new production book schema or bypass unresolved source/account/crew contracts. Account flights remain independent of later paper/book integration.

### Selected acceptance questions

| ID | User question | Required answer behavior and remaining source gate |
| --- | --- | --- |
| AI01 | How many hours did I fly this year? | Deterministic reported/known time for the displayed calendar period, supported records, unknown/conflicting values and coverage. |
| AI02 | When did I last fly D-1234? | Latest established matching flight date/time and a valid detail action. Registration is a synthetic example; clarify ambiguous aircraft references. |
| AI03 | Compare this season with last season. | Resolve and display periods using the existing calendar-year/same-date comparison rule unless the user specifies otherwise; clarify a different meaning of season. Compare supported measures and show actual coverage. |
| AI04 | When did I fly with a named person? | User's person-query example, sanitized here: latest matching flight, match count and Show all action. Resolve identity locally where possible; clarify multiple matching people. Missing/unverified crew data cannot establish no matches or credited roles. |
| AI05 | Compare this and last year's flights in August. | Explicit 1–31 August windows in the current and previous year, using recorded source flight dates and a declared current-date reference. Do not substitute year-to-date cutoffs. Compare count/known time/average and show requested versus observed coverage. |

For AI03/AI05, reuse the existing rule: incomplete prior-year coverage permits qualified available totals, but hides percentage comparisons. Do not treat missing history as zero. General term explanations need additional frozen evaluation examples; they do not constitute current operational/regulatory advice.

### Remaining contract and acceptance work

- **Data flow/privacy:** review exact fields, question/history redaction, identifying remarks, provider retention/region/deletion controls and first-use disclosure before authorizing external transfer. Local history deletion does not itself prove deletion from old backup files or a provider.
- **Service choice:** compare current official provider/model compatibility, prices and retention; present a concrete authenticated gateway/local-query flow. Preserve server-side secrets, host-supplied account scope, bounded tool calls and no arbitrary SQL or silent writes.
- **History and backup:** specify message/attempt statuses, retry/cancel/restart behavior, source-revision staleness, account switching, migrations, restore reference validation and deletion semantics. Selected backup inclusion does not establish implementation acceptance.
- **Cost enforcement:** specify EUR metering/conversion, request cost reservations, output/tool limits, concurrent requests and visible usage/limit states. Demonstrate that a request cannot exceed the approved ceiling; do not rely on an unenforced dashboard alert. No evaluation budget is selected.
- **Quality:** freeze synthetic expected results for AI01–AI05 and term explanations, then define accuracy/clarification/reference and latency criteria before any approved model evaluation. Include duplicate/unknown flights, missing crew, ambiguous identities, partial periods, prompt injection, forged IDs, two accounts, stale evidence, offline/restart/retry, deletion/restore and budget exhaustion. Mocked tool checks do not prove actual model quality.

Documentation verification for this package: consistency with #13, ADR 0008 and existing query/coverage rules; local links and whitespace. No application checks, device trials, model calls or measured costs/quality are claimed.

## Broader user intent and later experience

Manuel wants a ChatGPT-style conversation inside MoFlight: ask questions about actual saved flight data, request statistics or current-year costs, and attach a new logbook photo when asking what to write next. Different pilot books/layouts must work through their own versioned formats. A familiar chat can interpret flexible wording and explain answers; it must cite the saved records/photo observations used. “OpenAI harness” means a bounded model/tool interaction with these responsibilities; it does not approve a vendor SDK or hosted agent runtime.

Original broader proposal, retained for later photo/book scope: select a book, open or resume its conversation, type a question and optionally attach a page photo. Show offline/unsent status, cancel/retry, source references, data coverage and uncertainty. For writing tasks, show observations and proposed matches for review, then link the deterministic writing snapshot. Apply the later [assumed versus confirmed paper-progress clarification](../adr/0008-logbook-ai-and-deterministic-boundary.md#decision), rather than requiring a post-writing confirmation for every session. General questions can coexist with flight tasks, but must distinguish general explanation from book-evidenced answers. This broader proposal does not expand the first version selected above.

## Repository fit and responsibility boundary

Reviewed `packages/flight-logbook/src/index.ts`: pure typed flight/history/query and writing/counter logic, no network/vendor imports. `packages/local-data` remains the local persistence boundary. `apps/platform-lab/src/vereinsflieger` persists raw isolated captures with incomplete identity/semantics; these are not yet approved canonical records. The synthetic pilot-book lab proves separate book state, but ADR 0007 remains proposed. Production chat must not bypass canonical import, role/unit validation or ownership/migration decisions.

[Accepted ADR 0008](../adr/0008-logbook-ai-and-deterministic-boundary.md) governs interpretation and calculations. The model may translate wording into validated typed filters, request bounded evidence, transcribe photos, propose matches and explain tool results. Deterministic code owns integer minutes, roles, counts, deduplication, sums, page placement and confirmed outputs. Money requires a reviewed currency/amount mapping and integer minor-unit arithmetic; blank is unknown, not zero. `Eigene Kosten(Bezahlt)` alone cannot establish annual total expenditure, invoice status or recurring club costs.

Proposed read-only tool contracts: `queryFlights`, `getFlightEvidence`, `calculateStatistics`, `calculateCosts`, `getBookFormat`, `getPaperContinuation`, and `prepareWritingPreview`. Host-supplied account/book scope is mandatory and cannot be overridden by model arguments. Each result includes source/revision IDs, coverage, units and missing/conflicting values. Bound filters, rows, payloads and call count; reject foreign references, invalid dates and unsupported calculations. Provider remarks and photo text are evidence, never instructions to expand permissions. No model tool silently edits records, accepts matches or advances paper progress.

## Context, sessions and attachments

Prefer task-relevant queries over sending all history on every message. A year-cost query needs deterministically aggregated, coverage-qualified amounts plus cited records; a continuation task needs the selected format, last confirmed paper position, relevant new flights and optional photo. Broad history questions may page through additional relevant records, within limits. Whole-history input remains an optional approved-budget comparison baseline, not the importer or default chat context.

Proposed local conversation schema: stable session/message/attempt IDs, explicit account/book/format versions, attachment IDs, source/tool-result references and statuses (`draft`, `pending`, `running`, `cancelled`, `failed`, `complete`). Persist user messages before execution and keep partial streamed output distinct from completed answers. On restart preserve unsent questions/photos and allow explicit retry; do not automatically incur another billable call after an ambiguous network failure. New source revisions mark old answers stale without rewriting their evidence. Switching books starts/selects that book's history; combined-book queries require explicit scope and source deduplication. Logout/account switch surfaces pending work and prevents cross-account reads.

Photos stay in private account/book-scoped local files with immutable originals, optional separately identified derivatives and lifecycle states. Preview the selected attachment and the data-transfer purpose before sending. Preserve page/row/field observations and uncertainty separately from provider facts. Track remote upload IDs/expiry only if adopted; cancellation, removal and deletion must clean up eligible remote objects and make retained-provider limits clear. No guessed handwriting becomes a confirmed entry. Unknown format/version permits viewing evidence and blocks unsupported preparation.

## API and privacy options to evaluate

Current official OpenAI documentation was searched and opened on 2026-10-11. [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling) supports application-executed functions and strict schemas. A small typed tool loop behind an authenticated gateway is a candidate; strict shape does not validate book authorization, references or arithmetic. Compare a minimal loop with an SDK/managed harness only when orchestration needs justify it. No package/provider choice is accepted here.

[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) offers locally supplied context or hosted conversation state. Proposed default for this local-first product is local history with bounded context and `store:false`, subject to approval. Hosted Conversations retain state beyond the response TTL and need their own deletion design. [Data controls](https://developers.openai.com/api/docs/guides/your-data) distinguish application state from abuse-monitoring retention: `store:false` does not promise zero retention. Review applicable account controls, image exceptions, region/privacy obligations, deletion and tracing before personal data transfer.

[Vision input](https://developers.openai.com/api/docs/guides/images-vision) supports image interpretation and bills image inputs as tokens. Actual handwriting quality, crop/detail choices, latency and cost require measurement. Compare current suitable text/vision models using official compatibility/pricing at the decision date; no model or price estimate is selected as measured evidence.

The gateway holds provider keys, validates MoFlight authentication/ownership, enforces quotas and validates tool calls/results. Vereinsflieger authorization stays separate. Since authoritative records are phone-local, specify how the client executes validated local queries and supplies minimal scoped results; the backend cannot assume it owns a synced copy. Normal imports, deterministic queries and saved instructions remain usable offline. Resolve gateway feasibility/authentication, retention and budget before integration.

## Discovery deliverables and authorization gates

1. Review book/canonical-import readiness and define the minimal chat journey, local session migration/backup policy and attachment deletion/recovery contract.
2. Freeze synthetic cases with expected source IDs, observations and deterministic answers: two accounts/books with overlapping IDs, missing roles/costs, duplicates, partial years, revisions, ambiguous handwriting, contradictory photos, prompt injection, cancellation/restart and foreign tool references.
3. Present concrete API/harness/model alternatives, data-flow/privacy controls and bounded evaluation plan to Manuel. Proposed quality gates: zero foreign-data exposure or silent confirmed mutations; all factual references valid; all deterministic answers match frozen results; uncertain handwriting stays reviewable. Specify sample size, tolerable transcription errors, token/tool/image limits and hard budget before paid work. Measure first-token/end-to-end latency, critical-field accuracy, omissions/inventions, user corrections and actual token/currency costs; no measurements exist yet.
4. Obtain separate implementation/provider/budget/permitted-input authorization before API-key provisioning, paid calls or real-photo evaluation.

Sequencing reconciliation: investigating this conversational entry point is the user's requested next feature after reliable retrieval/restoration. It may proceed as documentation and synthetic planning alongside canonical reconciliation. ADR 0008 still places broad conversational polish after the first complete selected-book workflow; this discovery does not silently change that accepted integration sequence or authorize chat implementation. Related scopes: [#7 photos/writing](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7), [#9 queries](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), [#2 capture](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#11 books](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

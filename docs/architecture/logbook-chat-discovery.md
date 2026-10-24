# In-app AI chat: first-version requirements and later discovery

**Current status — 2026-10-24:** Manuel resumed requirements discovery and selected the first-version product choices below, OpenRouter and GPT-6 Luna with Max reasoning/ZDR-only inference as the first evaluation candidate. Runtime implementation remains deferred under M5 of the [project plan](../project-plan.md); core retrieval/history/analytics priorities are unchanged. Exact upstream/gateway contracts, model evaluation/production acceptance, personal-data transfer and paid execution remain open.

Original discovery: 2026-10-11, Europe/Berlin; first-version decisions: 2026-10-24. Status: selected product requirements and evaluation candidate with technical/privacy/evaluation contracts still open. No LLM implementation, API-key provisioning, private-data transfer, paid call or evaluation execution is authorized. Retrieval and provider-view preservation retain priority.

Tracking: [#13](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/13), created after reviewing all existing issues and finding no equivalent complete conversational scope.

## First-version product decisions — 24 October 2026

These choices were selected in the requirements conversation and recorded in #13. The recommended comparison presentation was adopted as the working default after Manuel instructed us to proceed; it was not a separate numbered-option answer. This specification is not runtime implementation or acceptance evidence.

| Area | Selected first-version behavior |
| --- | --- |
| Scope | Flight-data chat: questions about saved flights/statistics and general explanations of aviation terms. Photo transcription and photo-assisted writing follow later. |
| Sources | No web lookup. Clearly distinguish saved-data answers from general explanations; do not present the latter as verified current information. |
| Actions | Read-only answers with buttons opening supporting flight details or supported statistics views. No flight-data edits. Validate record references and destinations. |
| Conversations | Separate conversations saved on the device; start new chats, revisit older ones and delete them. Keep until manual deletion, with a maximum of **50 conversations**; creating a 51st automatically removes the least recently active conversation without confirmation. No timed expiry. Preserve account isolation; exact activity/tie rules, cap scope, pending-work and restore behavior remain to be specified. |
| Backup | Include saved chats and drafts in supported user backup/restore. This does not select cloud chat synchronization. Restore/version/reference and deletion contracts remain open; provider secrets are excluded. |
| Offline | Saved chats and existing local quick questions remain available. Preserve new free-text questions as drafts; sending after reconnection requires an explicit tap. No automatic reconnect/restart send or ambiguous billable retry. |
| External processing | Design for external AI receiving only the flight information needed for a question; omit names and identifying details where possible. This is data minimization, not an anonymization claim or permission to transfer data before reviewing the concrete flow. |
| API routing service | **OpenRouter**, explicitly selected by Manuel. Exact upstream inference endpoints, remaining routing/fallback/privacy settings and authenticated MoFlight gateway remain open; no provisioning or paid execution selected. |
| Initial access/funding | Use **Manuel's OpenRouter account for the initial personal version**. Other-user access/funding follows later. This selects the access design, not account connection, credit purchases or actual execution. |
| First evaluation candidate | **GPT-6 Luna with explicit Max reasoning**, using a **zero-retention endpoint**, selected by Manuel. Require ZDR-only inference; if no eligible endpoint is available, keep the draft and show unavailable. This is a planned evaluation target, not tested quality or production acceptance. If Max cannot be honored, report the limitation; do not silently lower effort or substitute another model. |
| Comparative benchmark | Compare Luna Max with **Mistral Small and two strong low-cost Chinese-developed models**, through OpenRouter. Exact Chinese model IDs/versions and evaluation budget are still open. This is requested future evaluation work, not an executed benchmark or approval for paid calls. |
| First-use explanation | Explain external AI use once, identifying OpenRouter/actual model provider, data sent and the EUR 1 calendar-month limit; let the user enable AI. Afterwards Send works normally; details remain available in settings. No routine per-question confirmation. Exact notice contents, disable behavior and treatment of material processing changes still need their contract. |
| Personal usage ceiling | Up to **EUR 1 per calendar month**, with a hard stop and reset on the first day of the month; revisit later using measured usage/costs. This supersedes the earlier EUR 3 planning ceiling. Calendar timezone and conversion/fees contract remain open. This is a planning ceiling, not spending approval. Evaluation funding and commercial/multi-user funding remain separate. |
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

- **Data flow/privacy:** first-use explain/enable/normal Send is selected; review exact notice contents, fields, question/history redaction, identifying remarks, provider retention/region/deletion controls and disable/material-change behavior before authorizing external transfer. Local history deletion does not itself prove deletion from old backup files or a provider.
- **Service choice:** use selected OpenRouter and evaluate GPT-6 Luna with explicit Max/ZDR-only inference. Confirm actual upstream endpoint/API compatibility, prices, routing/fallback and remaining privacy settings; present a concrete authenticated gateway/local-query flow. Preserve server-side secrets, host-supplied account scope, bounded tool calls and no arbitrary SQL or silent writes.
- **History and backup:** specify message/attempt statuses, retry/cancel/restart behavior, source-revision staleness, account switching, migrations, restore reference validation and deletion semantics. Selected backup inclusion does not establish implementation acceptance.
- **Cost enforcement:** specify EUR metering/conversion, request cost reservations, output/tool limits, concurrent requests and visible usage/limit states. Demonstrate that a request cannot exceed the approved ceiling; do not rely on an unenforced dashboard alert. No evaluation budget is selected.
- **Quality:** prepare the requested four-model benchmark below: choose exact Chinese candidates, freeze synthetic expected results for AI01–AI05 and term explanations, then define accuracy/clarification/reference and latency criteria before any approved model evaluation. Include duplicate/unknown flights, missing crew, ambiguous identities, partial periods, prompt injection, forged IDs, two accounts, stale evidence, offline/restart/retry, deletion/restore and budget exhaustion. Mocked tool checks do not prove actual model quality.

Documentation verification for this package: consistency with #13, ADR 0008 and existing query/coverage rules; local links and whitespace. No application checks, device trials, model calls or measured costs/quality are claimed.

### OpenRouter source review — 24 October 2026

Read-only official documentation review following Manuel's service selection; these are available controls, not configured or accepted account behavior:

- [Provider routing](https://openrouter.ai/docs/guides/routing/provider-selection) supports model-provider allowlists, fallback controls and parameter-support requirements. Selecting OpenRouter alone does not select the actual upstream recipient or prove tool/structured-output compatibility.
- [Data collection](https://openrouter.ai/docs/guides/privacy/data-collection) describes opt-in prompt/reply logging and product-improvement use, plus retained request metadata. [ZDR](https://openrouter.ai/docs/guides/features/zdr) can restrict inference to eligible zero-retention endpoints, independently of local history and other tools. Manuel selected ZDR-only inference in the model-candidate answer; do not claim all data is never stored.
- [Pricing](https://openrouter.ai/pricing) lists a 5.5% Standard credit-purchase fee and separates Free/Standard controls. [Limits](https://openrouter.ai/docs/api_reference/limits) exposes USD budgets and UTC monthly usage. The EUR 1 hard-stop design still needs fee/currency/calendar reconciliation, request reservations and verified account eligibility; credit purchases are not authorized. No cost-per-question or affordable monthly question count has been measured.

### Model shortlist and selected evaluation target — 24 October 2026

Read-only public [model catalog](https://openrouter.ai/api/v1/models) and [ZDR endpoint catalog](https://openrouter.ai/api/v1/endpoints/zdr) inspection found the following tool/structured-output candidates. Prices are listed USD per million input/output tokens, before credit-purchase fees and conversion; they are not measured task costs. Endpoint availability/parameters are a metadata snapshot, not live execution or account eligibility evidence.

| Candidate | Example ZDR endpoint tag | Input / output | Decision |
| --- | --- | --- | --- |
| [GPT-6 Luna](https://openrouter.ai/openai/gpt-6-luna), `openai/gpt-6-luna` | `azure` | USD 0.10 / 0.50 | Selected first evaluation candidate, explicit Max reasoning. |
| [Mistral Small 4](https://openrouter.ai/mistralai/mistral-small-2603) | `mistral/zdr` | USD 0.15 / 0.60 | Requested benchmark comparator; not selected for production. |
| [Gemini 3.1 Flash Lite](https://openrouter.ai/google/gemini-3.1-flash-lite) | `google-vertex/global` | USD 0.25 / 1.50 | Reviewed alternative; not selected. |

The Luna model catalog explicitly lists `max` among supported efforts. The [official OpenAI Luna contract](https://developers.openai.com/api/docs/models/gpt-6-luna) requires Responses API for tool calling with Max; its Chat Completions tool calling supports only `none`. OpenRouter documents [Responses reasoning](https://openrouter.ai/docs/api_reference/responses/reasoning), [Responses tool calling](https://openrouter.ai/docs/api_reference/responses/tool-calling) and [explicit Max controls](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). Plan this candidate through the Responses API with `reasoning.effort: max`, ZDR-only inference and parameter support enforced; verify the actual routed behavior before acceptance. Do not silently use Chat Completions/None, lower effort or a different model.

Reasoning tokens are billed output and must be included in cost reservations/limits. No quality, latency or monthly question-count claim follows from the token-price comparison. The five selected cases and privacy/isolation/failure cases still need frozen expectations and a separately authorized actual-model evaluation.

### Requested four-model benchmark — 24 October 2026

Manuel requested capturing a benchmark of the selected **Luna Max baseline**, **Mistral Small** (currently reviewed Small 4), and **two strong low-cost Chinese-developed models**, all through OpenRouter. These are four distinct candidates; the Chinese models and any winner remain unselected. This expands planned evaluation, not runtime scope or spending authorization.

Before execution, select exact Chinese model IDs/versions using current primary capability/pricing evidence and actual OpenRouter endpoint metadata. Consider task quality, German/English support, tool/structured-output compatibility and total cost; token price alone cannot establish the best candidate. Record upstream recipients independently of model developer origin. Retain ZDR-only inference; report an unavailable/ineligible candidate rather than relaxing privacy or silently replacing it.

Use the same frozen synthetic data, AI01–AI05, term explanations and failure/ambiguity/isolation cases for every candidate. Keep deterministic tools, expected outputs, evidence IDs and scoring rules consistent. Record exact models/endpoints, prompt/tool/data versions, effective effort, token/output limits and repeated-run policy. Luna must use explicit Max; document the other models' supported settings rather than assume effort labels are equivalent.

Measure intent/filter accuracy, tool/schema reliability, source-reference validity, correct clarification/unknown handling, grounded answers, isolation failures, end-to-end latency and actual total cost including reasoning. Distinguish published metadata/estimates from measured results. Agree the sample size, acceptance criteria and a separate hard evaluation budget before paid runs; the EUR 1 personal monthly planning ceiling does not itself authorize this benchmark. Use synthetic inputs unless the exact external-input scope is separately approved.

Deliver one comparative report with failures and cost/quality/latency trade-offs, then recommend whether to retain Luna or select another candidate. Benchmark scheduling or a better score does not automatically approve a production model switch. No benchmark has run and no model-quality or measured-cost claim is made.

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

Earlier direct-provider discovery, 2026-10-11; OpenRouter's 24 October selection above governs the first version. Official OpenAI documentation was searched and opened for the original proposal. [Responses function calling](https://developers.openai.com/api/docs/guides/function-calling) supports application-executed functions and strict schemas. A small typed tool loop behind an authenticated gateway remains a design candidate; strict shape does not validate book authorization, references or arithmetic. Recheck actual OpenRouter/model endpoint compatibility rather than assume a direct-provider API feature is available through the router. No SDK or hosted agent runtime is selected.

[Conversation state](https://developers.openai.com/api/docs/guides/conversation-state) offers locally supplied context or hosted conversation state. Proposed default for this local-first product is local history with bounded context and `store:false`, subject to approval. Hosted Conversations retain state beyond the response TTL and need their own deletion design. [Data controls](https://developers.openai.com/api/docs/guides/your-data) distinguish application state from abuse-monitoring retention: `store:false` does not promise zero retention. Review applicable account controls, image exceptions, region/privacy obligations, deletion and tracing before personal data transfer.

[Vision input](https://developers.openai.com/api/docs/guides/images-vision) supports image interpretation and bills image inputs as tokens. Actual handwriting quality, crop/detail choices, latency and cost require measurement. Compare current suitable text/vision models using official compatibility/pricing at the decision date; no model or price estimate is selected as measured evidence.

The gateway holds provider keys, validates MoFlight authentication/ownership, enforces quotas and validates tool calls/results. Vereinsflieger authorization stays separate. Since authoritative records are phone-local, specify how the client executes validated local queries and supplies minimal scoped results; the backend cannot assume it owns a synced copy. Normal imports, deterministic queries and saved instructions remain usable offline. Resolve gateway feasibility/authentication, retention and budget before integration.

## Discovery deliverables and authorization gates

1. Review book/canonical-import readiness and define the minimal chat journey, local session migration/backup policy and attachment deletion/recovery contract.
2. Freeze synthetic cases with expected source IDs, observations and deterministic answers: two accounts/books with overlapping IDs, missing roles/costs, duplicates, partial years, revisions, ambiguous handwriting, contradictory photos, prompt injection, cancellation/restart and foreign tool references.
3. Present concrete API/harness/model alternatives, data-flow/privacy controls and bounded evaluation plan to Manuel. Proposed quality gates: zero foreign-data exposure or silent confirmed mutations; all factual references valid; all deterministic answers match frozen results; uncertain handwriting stays reviewable. Specify sample size, tolerable transcription errors, token/tool/image limits and hard budget before paid work. Measure first-token/end-to-end latency, critical-field accuracy, omissions/inventions, user corrections and actual token/currency costs; no measurements exist yet.
4. OpenRouter is selected for the first version; obtain the remaining implementation/model/upstream/budget/permitted-input decisions before API-key provisioning, paid calls or real-photo evaluation.

Sequencing reconciliation: investigating this conversational entry point is the user's requested next feature after reliable retrieval/restoration. It may proceed as documentation and synthetic planning alongside canonical reconciliation. ADR 0008 still places broad conversational polish after the first complete selected-book workflow; this discovery does not silently change that accepted integration sequence or authorize chat implementation. Related scopes: [#7 photos/writing](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7), [#9 queries](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), [#2 capture](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#11 books](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11).

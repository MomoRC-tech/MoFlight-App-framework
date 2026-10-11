# ADR 0008: Evidence-first logbook with bounded AI interpretation

- Date: 2026-10-11
- Status: Accepted for responsibility boundaries and work sequencing; model/provider and paid execution remain unapproved
- Decision owner: Manuel Singer
- Tracking issues: [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#7](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/7), [#9](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/9), [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11)

## Context

Manuel asked whether capturing all flight data and handing it to an LLM for interpretation, analysis and a structured result would improve effectiveness and reliability. After reviewing the trade-offs, he instructed us to anchor the recommended hybrid approach in the project and decide when to implement it. This accepts the boundary and sequence below, not an AI provider, production schema, paid budget or unrelated proposed ADR.

Comprehensive source capture is useful independently of AI. A valid JSON response does not establish correct flight identities, roles, complete coverage or totals. The current lab has deterministic queries/writing logic and browser capture; prepared observations do not prove handwriting recognition. Existing capture-first priorities remain in force.

## Options

1. Whole-history LLM interpretation and final calculations: potentially quick to prototype, but omission, inferred identity and calculation errors can remain hidden behind plausible structured output. Requires independent completeness and correctness checks regardless.
2. Conventional rules for all inputs: repeatable for known structured fields, but handwritten pages and ambiguous free text can require substantial manual work.
3. Evidence-first capture, conventional calculations and bounded AI proposals: selected. Use AI where interpretation adds value, with preserved evidence and independently validated results.

## Decision

- Retrieve relevant permitted flight lists/details using conventional browser automation and parsers. Work toward comprehensive history through verified paging/ranges; never label a bounded or partial scrape complete. Preserve original values, missing/blank states, source references, retrieval revisions and separate list/detail coverage.
- Parse stable provider fields directly. Aircraft classification, time basis and crew-role mappings use evidenced rules; unknown mappings remain unresolved. Keep normalized facts separate from original evidence.
- AI may transcribe handwritten pages, interpret ambiguous remarks/labels, propose candidate matches and explain discrepancies. Its output is a proposal with page/row/field or source-record references, task/model/prompt/schema versions and explicit unknowns.
- Preserve photo transcription separately from provider-derived values: context may aid interpretation but must not silently replace what the page appears to say. Validate references and values; model confidence alone does not establish correctness.
- Conventional code produces matching candidates, validates proposed matches, enforces identity/deduplication, computes durations/roles/totals/numbering/carryovers/page placement and generates the fixed writing snapshot. Ambiguity that affects correctness requires a scoped user decision; an AI proposal cannot silently become a confirmed fact or write paper progress.
- Supply only task-relevant records to runtime AI. Whole-history input may be evaluated as a comparison baseline, but is not the default processing architecture. Exact statistics use typed filters and deterministic queries, even when an LLM interprets wording or explains results.
- Normal imports, statistics and reopening saved instructions do not require AI. Unprocessed photos can remain pending offline; actual API execution stays behind the existing authenticated, validated and budgeted server boundary, with no provider secret in the app.
- Agents may inspect synthetic/approved structural examples during development to help build or repair parsers. This does not require an LLM call on every runtime import and does not authorize sending personal data to development agents.

## Work sequence

1. **Now / next #2 capture slices:** preserve raw list/detail evidence, stable references, explicit coverage and repeat/resume behavior. Do not divert this work into whole-history LLM processing. Complete the ADR 0007 review and bounded book-isolation/migration proof (#11) before canonical import; ADR 0007 remains proposed.
2. **After the captured-field contract is stable, alongside canonical-import/reconciliation work:** prepare a small synthetic evaluation set under #7, including page images, source records, confirmed observations/matches and expected calculations. Harness/input preparation uses no paid calls and can proceed while live access or cloud prerequisites are blocked.
3. **Before completing the real photo-to-writing journey:** run a bounded handwriting/targeted-interpretation PoC after explicit API budget and permitted-input approval and an authenticated server gateway are available. Keep this independent of full cloud sync and production visual design. Compare with a whole-history LLM baseline only within the same approved budget. Record failures and improve or narrow the AI role before integration.
4. **After evaluation passes:** integrate validated observations and optional candidate proposals into one selected-book retrieve/review/write/confirm/backup workflow. Keep deterministic calculations authoritative. Natural-language query polish, broad narrative history analysis and additional flight features follow this first complete workflow.

This is dependency-based scheduling, not a calendar promise or a recurring automation. Full cloud synchronization is not a prerequisite for evaluation, but the authenticated AI boundary remains required. Do not wait for polished screens or all-history production rollout to prepare synthetic cases.

## Consequences

The importer and evidence model remain useful without AI, and prior results can be explained/recomputed after parser or model changes. More explicit validation is required than in an LLM-only prototype. Conventional parsers can also fail; coverage checks, reference comparisons, versioned fixtures and user review remain necessary. No approach is claimed fail-proof.

## Validation

Before API execution, freeze synthetic expected results independently of model output. Include duplicate/similar flights, repeated imports, partial history, missing/conflicting roles or dates, aircraft mismatches, ambiguous handwriting, photo/provider disagreement, unknown carryovers, daylight-saving boundaries, changed source revisions and a second book with overlapping page/entry numbers.

Compare conventional parsing plus manual/prepared observations, bounded AI-assisted interpretation and, if funded, whole-history LLM processing against the same relevant cases. Measure critical-field accuracy, omitted/invented records, incorrect matches, unnecessary user corrections, repeatability, latency and actual cost. Validate source references and semantic values as well as schema shape. A whole-history baseline must not be presented as handwriting evidence unless it receives the same photo inputs.

Integration gates: every output observation/candidate has valid supplied evidence references; no automatic acceptance of ambiguous identity/required values; deterministic results equal frozen expected outputs; failures preserve source data and confirmed paper state; malformed, missing, foreign-book and conflicting proposals remain reviewable/rejected. Document observed AI error rates rather than claim universal accuracy. Model quality targets and a bounded budget must be specified before the live evaluation.

Executed for this decision: repository/document/code review and documentation link/whitespace/traceability checks. No new runtime implementation, AI benchmark, handwriting test or API call is claimed.

## Supporting evidence

- [Google structured-output documentation](https://ai.google.dev/gemini-api/docs/structured-output): output structure does not establish semantic correctness.
- [Lost in the Middle](https://arxiv.org/abs/2307.03172): historical evidence of position-sensitive long-context performance; motivates evaluation, not a claimed error rate for a current model.
- [Remembered state and exact queries](../product/flight-logbook-state-and-queries.md), [capture data model proposal](../architecture/vereinsflieger-capture-data-model.md), [local-first implementation plan](../architecture/local-first-implementation-plan.md).

# M2 reported list-duration validation and source assessment

Date: 18 October 2026. Tracking: [#2 package contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#16 coordination](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/16#issuecomment-6252545825). Status: bounded host-only prerequisite delivered; broader M2/live-import acceptance remains open.

## Scope and source

Manuel requested continuation from the handover within recorded authorization: inspect the current source and choose the smallest useful normalization/validation gap before production storage/import. Initial `main` and `origin/main` both matched `87877393c2a29d34de05947f4498bb12ac82b742`; the working tree was clean. AGENTS.md, current roadmap/contracts/evidence and Issues #2/#16/#18/#4/#11 were reviewed. The matching #2 contract was saved before coding; existing categories/labels were retained.

Implementation/test commit: **`8976a10`**. [Inspector](../../apps/platform-lab/src/vereinsflieger/durations.ts), [regression tests](../../tests/mobile/vereinsflieger-durations.test.ts), [bounded interpretation contract](../architecture/vereinsflieger-import-contract.md#bounded-list-duration-validation--18-october-2026). Reuses the existing raw-field inspector and recorded list field-unit dictionary. No dependencies, provider calls, private evidence reads or application/storage wiring were added.

The derived result keeps exact labels/text, absent/blank fields and explicit zero. Flight/block minutes and formatted representations are checked independently; invalid/contradictory evidence prevents a selected duration. Corrected reported minutes are never replaced by clock subtraction. Unknown time basis, roles, class and engine units remain outside this inspector. Existing raw capture validation and synthetic-only canonical import restriction are unchanged.

## Verification

Environment: Windows PowerShell, Node **24.18.0**, pinned pnpm **11.25.0**, Python **3.12.10** (inventory only). Checks ran on the implementation files before commit; `8976a10` contains the same checked source/tests.

| Actual check | Result |
| --- | --- |
| `node --import tsx --test tests/mobile/vereinsflieger-durations.test.ts tests/mobile/vereinsflieger-probe.test.ts tests/mobile/vereinsflieger-reconciliation.test.ts` | **26 passed, 0 failed**; seven new duration tests plus 19 existing raw-field/reconciliation tests. Detailed local output: ignored `build/source-durations/focused-tests.log` |
| `pnpm typecheck` | Passed |
| `pnpm exec eslint apps/platform-lab/src/vereinsflieger/durations.ts tests/mobile/vereinsflieger-durations.test.ts --max-warnings 0` | Passed |
| Source/reference and documentation review; `git diff --check` | Passed; new inspector referenced only by its own tests, no application/canonical writer import. New/edited local Markdown targets and the source-dictionary anchor checked |

Useful regression coverage: matching minute/hh:mm representations; explicit zero versus absent/whitespace; single representation; durations beyond 24 hours; exact safe-integer boundary and overflow; negative/decimal/comma/exponent/suffix/malformed inputs; invalid counterpart blocking a valid one; conflicting representations; independent flight/block measures; reordered columns; duplicate/lost columns; unchanged raw input and output isolation. A synthetic corrected duration deliberately differs from raw midnight clocks; neither timezone nor overnight interval is inferred.

Focused checks are proportionate because this is a pure, unconnected inspector. The complete host suite, exports, Release builds, emulators, live provider, iOS and physical devices were **not run** for this package. No UI worker, experiment, paid call or manual CI run was launched; private sessions and build checkouts were untouched. Earlier #18/native evidence retains its original provenance and is not claimed as acceptance of this parser.

## Traceability and remaining gates

Supports R12, FL-03/FL-10/FL-11 and E07/E09 validation/preservation aspects only: unresolved evidence stays unresolved and deterministic interpretation does not mutate source/history. It does not exercise a complete retry/outage, first-use/returning, account/book or offline saved-import journey. The roadmap acceptance map links these limits.

Production source/account/club/flight durability, actual representations beyond recorded samples, time basis/overnight, role/class/credit and coverage remain #2/#16 gates. Production binding/switching, credential policy, schema/migration, raw-data adoption, transactional live writes, automatic assignment/polling and ADR 0007 acceptance remain separate decisions under #2/#4/#11/#16/#18/#19. No broader issue or milestone is closed. The next useful prerequisite is a bounded source-evidence/semantics contract; select it in the matching Issue before implementation and obtain a product decision wherever unresolved semantics change behavior.

## Source-flight assessment follow-up

**Authorization/scope:** Manuel said **proceed** after the recommendation for one bounded source-to-review adapter. The matching [#2 package contract](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2) was saved before coding and [linked from #16](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/16#issuecomment-6252630378). This authorizes the pure assessment, not the recommended incomplete-history, durable book-confirmation or production identity/schema policies. Initial source was `d0df8ba`, working tree clean; unrelated data, private sessions and build checkouts were untouched.

**Implementation/test commit: `0594999`.** [Source](../../apps/platform-lab/src/vereinsflieger/source-assessment.ts), [tests](../../tests/mobile/vereinsflieger-source-assessment.test.ts), [interpretation contract](../architecture/vereinsflieger-import-contract.md#source-flight-assessment--18-october-2026). The adapter combines the existing raw-field and duration inspectors, validates calendar dates/clocks, preserves capture/selected-row provenance and all aligned raw text, and returns structured findings. Pilot/PIC/companions/SIC and raw role/class/duplicate/engine facts remain separate. Parsed values establish no timezone, overnight date, identity or credit; missing optional facts do not select a future save policy. No canonical Flight, person IDs, verification flags, UI/controller/storage wiring or adoption is produced.

**Actual verification:** same Windows/Node 24.18.0/pnpm 11.25.0 environment. The final checked files were committed unchanged in `0594999`.

| Check | Result / retained local log |
| --- | --- |
| `node --import tsx --test tests/mobile/vereinsflieger-source-assessment.test.ts tests/mobile/vereinsflieger-durations.test.ts tests/mobile/vereinsflieger-probe.test.ts tests/mobile/vereinsflieger-reconciliation.test.ts` | **36 passed, 0 failed** (10 new assessment tests + the prior 26); `build/source-assessment/final-tests.log` |
| `pnpm typecheck` | Passed; `build/source-assessment/final-typecheck.log` |
| `pnpm exec eslint apps/platform-lab/src/vereinsflieger/source-assessment.ts tests/mobile/vereinsflieger-source-assessment.test.ts --max-warnings 0` | Passed; `build/source-assessment/final-lint.log` |
| Added/edited Markdown references/anchors, authorization/traceability consistency, `git diff --check` and source-reference review | Passed; only the new test file imports the assessment. The duration inspector now also has this pure consumer; application/canonical import gates remain unchanged |

The first focused run also passed 36 tests; review then added explicit rejection for empty headers/missing rows and expanded malformed-reference coverage. The final run above covers that final source. Tests cover the real synthetic `decodeProbe` → assessment path; valid/leap/invalid German/ISO dates; strict/midnight/equal/earlier landing clocks; missing versus blank versus zero; invalid/conflicting durations and preserved independent block time; same-name crew and other raw slots; unknown future columns; repeat/reorder/correction stability; input/output isolation; selected-row/reference provenance; empty/ambiguous/malformed inputs; and unchanged canonical verification rejection. No clock-derived duration or guessed overnight date is used.

**Limits and next step:** the package is pure and unconnected, so focused tests/types/lint are sufficient here. No full host suite, exports, Release build, device/provider/second-account/private-data access, UI worker, experiment, model call or manual CI run was performed. No integrated review/save/offline acceptance is inferred. R12, FL-03/10/11 and E07/E09 are covered only for deterministic interpretation, repeat assessment and raw preservation; account/book ownership, live coverage and platform journeys retain their gates. Next is a bounded source-semantics evidence package and concrete owner/source/book/storage proposal, with incomplete saved-history and durable book-choice decisions kept explicit in #2/#4/#11/#16/#18. ADR 0007 remains Proposed; no issue or milestone is closed.

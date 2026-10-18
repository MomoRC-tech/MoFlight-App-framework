# M2 reported list-duration validation

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

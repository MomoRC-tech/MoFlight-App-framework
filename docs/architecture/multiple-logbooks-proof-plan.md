# Multiple-logbook proof and migration plan

Date: 2026-10-10. Status: proposed implementation plan for [ADR 0007](../adr/0007-multiple-logbooks-and-formats.md), tracked in [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11). Product requirements are confirmed; architecture approval remains Manuel's decision. This document makes the next implementation reviewable; no schema or data is changed.

## Smallest useful proof

Use the existing TypeScript/SQLite workspace and synthetic data. One local pilot owns four books: two gliding volumes, one synthetic ultralight book and one synthetic powered-airplane book. A second pilot supplies negative ownership tests. No cloud login, service or dynamic plugin engine is needed for this local proof; local ownership checks do not substitute for later server authorization.

Separate these concepts explicitly:

| Concept | Responsibility |
| --- | --- |
| Pilot/profile | Owns source evidence and books; later links explicitly to a verified cloud account. |
| Provider connection/source record | Authorization scope and raw revisioned evidence; source flight identity is independent of a selected paper book. |
| Logbook | Stable book ID, owner, name, format/version and independent paper progress. Two books may use the same format. |
| Book-flight association | Deliberate membership/routing; does not duplicate the source flight or imply copied status. |
| Paper entry | Book/page/row/entry number and confirmation evidence. Overlapping numbers in different books are valid. |
| Format implementation | Supported fields, validation, counters, continuation and writing-field mapping. Saved snapshots retain the exact format/rules/presentation versions. |

Keep a small typed format interface, implemented in code and covered by fixtures. Shared provider retrieval and account access must not know paper columns. Add one genuinely different synthetic format to prove extension; the UL/powered examples do not certify real-world format rules. Actual formats require representative non-personal books and approved field/rule mappings.

The [discovery findings](../verification/2026-10-10-vereinsflieger-discovery.md) require preserving source aircraft class, duplicate status, distinct pilot/PIC/companion roles and flight/block/engine measures. Aircraft class can suggest membership; it cannot uniquely select a book when several books share a class/format. Unknown or ambiguous routing stays pending for explicit review. No source record is silently placed in whichever book happens to be open.

## Migration proposal

1. Treat the current schema-v1 dataset and backup format as experimental, versioned inputs. Preserve the original database and backup bytes before any conversion.
2. Inventory IDs/revisions, paper records, decisions and snapshots. Require explicit mapping of each legacy dataset to a target pilot and book; never equate a dataset ID with authenticated account identity.
3. Import into a new versioned destination transactionally. Keep a legacy-ID mapping and provenance. Preserve existing snapshot content/version; unsupported format versions remain viewable as evidence where possible and unavailable for editing.
4. Source IDs currently include dataset/account/club. Do not strip the dataset component and merge records automatically. Verified provider identity and a reviewed cross-club identity policy must precede consolidation. Apparent duplicates across old datasets require evidence or review, not name/date matching.
5. Validate counts, revision history, associations, snapshot content and per-book state before activating the new destination. Failed conversion leaves the old selection usable. Switching back uses the preserved original; it is not an in-place database downgrade.
6. Backup/restore must state whether its scope is one book or a pilot with several books and shared evidence. For the proof, use a complete synthetic pilot backup with an explicit manifest. Reject another pilot's ownership claims and unsupported versions; never overwrite newer existing books implicitly.

Final physical tables and backup version numbers belong to implementation review, not this proposal. A future cloud restore/link must independently verify authenticated ownership; a local manifest cannot grant it.

## Acceptance and execution order

1. Define ownership/book/source types and the format interface; retain the existing gliding regression behavior behind the first format implementation.
2. Add SQLite persistence and meaningful tests: restart offline, select each book, confirm an entry in A and prove B unchanged; repeat with the same page/entry numbers in both books. Include decisions, photos/references, snapshots, totals and pending work.
3. Reimport mixed-class synthetic evidence: unchanged IDs stay idempotent, provider duplicates remain flagged, ambiguous book assignment requires review, and a shared flight has independent paper status in its linked books. Combined queries count it once; incompatible counters are displayed separately.
4. Attempt foreign-pilot reads/writes/query/export/restore with forged book IDs and confirm rejection. Include missing/unsupported format versions and interrupted migration/restore.
5. Run legacy backup migration against preserved fixtures and compare canonical contents, revisions and snapshots. Prove rollback to the untouched original selection.
6. Add only the lab controls needed to select/create synthetic books and review routing. Verify the same state after native offline restart. Final product visual design remains later.

Exit gate: documented synthetic proof, native result with exact platform limits, safe migration evidence and Manuel's architecture approval. Only then adapt the canonical live-import path under #2. Stable provider identity, verified coverage, export/adapter mapping and transactional live acceptance remain additional #2 gates.

## Decisions still needed

- Approve ADR 0007's separation of shared source evidence, pilot-owned books and typed versioned formats before its implementation.
- Supply/choose representative real UL/powered formats before enabling them; this does not block the synthetic extension proof.
- Decide one app versus separate releases before production package/navigation architecture; it does not block this domain/storage proof.

The current GUI remains a lab. Book selection, routing review and copy confirmation are functional acceptance criteria now; branding and final layout follow a validated complete workflow.

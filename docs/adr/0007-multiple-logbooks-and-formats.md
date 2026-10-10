# ADR 0007: Multiple pilot-owned logbooks and extensible formats

- Date: 2026-10-10
- Status: Proposed
- Decision owner: Manuel Singer
- Tracking issue: [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11)

## Context

Manuel requires one pilot account to support several independent logbooks, including gliding, ultralight and powered-airplane formats. New formats must integrate without restructuring shared account, retrieval or persistence services. These product requirements are confirmed; the technical implementation below remains proposed.

Repository review: `packages/local-data/src/index.ts` stores revisioned records in a selected dataset with schema version 1; `apps/platform-lab/src/storage.ts` selects two synthetic datasets. `packages/flight-logbook/src/index.ts` contains a fixed synthetic rules identifier, flight roles and counters, and writing snapshots carrying dataset/rules/presentation versions. `apps/platform-lab/src/vereinsflieger/reconciliation.ts` includes dataset identity in source-flight identity. These are bounded lab contracts, not established account/book/format separation. The current implementation cannot be claimed to satisfy the new requirement.

## Options

1. Copy the gliding implementation for every class: initially simple, but duplicates source retrieval, account handling and persistence; improvements and migration diverge.
2. Introduce explicit book identity and a small typed, versioned format contract over shared source-flight evidence: bounded extra design work, reusable services and independently testable formats.
3. Build a general user-programmable format/plugin engine: unnecessary complexity and additional validation/security burden for the current scope.

## Decision

Propose option 2 without a new service or dynamic plugin infrastructure:

- Separate account/pilot identity, stable logbook ID, aircraft classification and format ID/version. One pilot owns many books; multiple books may use one format. Names and aircraft classes are not book IDs.
- Keep authorized source evidence and stable flight identities at pilot/provider/club scope, with explicit links to books. Separate source-flight identity from book-entry identity. Review migration from the experimental dataset-scoped provider ID; do not silently merge identities.
- Scope pages, written-entry links, numbering, carryovers, confirmations, photos, book-specific decisions, snapshots and pending edits by book. Source corrections have explicit account/source scope; book-specific overrides do not leak to other books.
- Define a small typed format interface for supported fields/extensions, validation, deterministic calculations, continuation and field/layout mapping. Start with the existing gliding profile; retain version IDs in saved snapshots. Unknown format versions preserve data and disable unsupported editing rather than resetting or guessing.
- Keep common persistence and provider transport unaware of paper column positions or gliding-specific counters. Class-specific required fields and counters belong to the format implementation; new known fields may still require an explicit versioned schema migration.
- Route imported flights to books using verified classification and explicit membership policy. Unknown or conflicting classification requires review. Do not assume provider classes exist or that aircraft class uniquely determines a paper layout.
- Provide explicit book selection and separate cached/offline state. Account authorization and book ownership checks apply independently to every read/write, restore, export, file, queue and future sync operation.
- Book queries use explicit book scope. Combined queries deduplicate source flights; totals with incompatible meanings/units remain separated. Format changes never reinterpret previous paper confirmations or snapshots without an explicit migration.

Approval of this ADR and a reviewed migration plan precede changes to the production data model. Recording the product requirement does not select a physical table layout or rewrite the current lab.

## Consequences

Additional formats should require a format implementation, fixtures and possibly a versioned field migration rather than copies of the whole app. This does not promise arbitrary formats without engineering work. Storage must model book ownership and revisioned state explicitly; account/provider identity and book-entry identity cannot be interchangeable. Existing synthetic backups must remain readable or fail safely with a documented upgrade path.

## Validation

Required small executable proof before production schema expansion:

- One synthetic pilot owns gliding, ultralight and powered-airplane books plus a second gliding volume. Restart offline and switch books: restore each book's independent state.
- A confirmation, override, photo, template or restore in book A cannot advance/change book B. Test overlapping entry numbers and page numbers.
- Reimport mixed-class data: stable source deduplication, explicit book membership, ambiguous/unknown classification held for review and distinct paper status for any authorized multiple links.
- Add a second synthetic format through the format contract without changing account access or provider transport; independently verify required fields, calculations and destinations. Synthetic formats do not validate actual legal/book requirements.
- Reject another pilot's book ID on queries, writes, exports/restores and future sync. Combined queries must not double-count one flight linked to multiple books.
- Preserve prior format-version snapshots and existing lab backups; unsupported versions fail safely. Migration checks cover source identities and book associations.

Executed in this change: code/document review, relative-file-link checks and whitespace diff checks. No multi-book runtime proof, schema migration or new format implementation has been executed. This ADR remains proposed.

## Follow-up review material — 2026-10-10

[Bounded proof and migration plan](../architecture/multiple-logbooks-proof-plan.md) defines the proposed synthetic slice, legacy identity/backup migration and acceptance. [Authenticated provider discovery](../verification/2026-10-10-vereinsflieger-discovery.md) establishes explicit aircraft classification and distinct source roles/durations/duplicate flags that the format boundary must preserve. This adds evidence and a concrete implementation proposal; status remains Proposed.

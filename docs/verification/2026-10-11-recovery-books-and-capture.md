# Restore recovery, pilot-book proof and bounded capture continuation

Date: 2026-10-11, Europe/Berlin. Baseline `27585a1`. Manuel requested implementation of the recommended restore, capture, book-foundation and complete-workflow sequence, then confirmed continuation. Tracking: #4, #2, #11 and #12. This authorizes the bounded implementation; real format activation, provider mapping and production acceptance are not inferred.

## Delivered scope

- Canonical schema-v1 restore validates every supported record kind, IDs, revision order, payload types, evidence links and historical snapshot totals before inserting. All UI readers are staged before selection activation. Original databases and legacy selection-file bytes are preserved.
- Selection uses an append-only SQLite journal with transactional commits and FULL synchronous mode, replacing unsafe in-place selection-file writes. Startup tries prior committed selections when a newer candidate cannot be opened/read. Missing selected files are not silently recreated. Host interruption/read/commit simulations preserve the earlier selection; native power-loss durability is not a claimed test result.
- A separate synthetic pilot library shares versioned source evidence across four independently scoped books, with explicit primary credit and reference links. Book-specific decisions, prepared-page context, copy assertions, snapshots, photos/references and pending state are separated. Combined queries deduplicate source identity and separate format/class totals. Dated routing covers combined categories, TMG and successor volumes; unknown/duplicate/competing assignments stay reviewable.
- Two code-defined synthetic formats demonstrate extension. Native lab controls cover book selection, synthetic import/routing, review, fixed writing snapshots, individual confirmation, totals and complete pilot backup/restore into a new database. Unsupported formats preserve stored evidence and disable editing. These formats do not certify actual gliding/UL/powered editions.
- Explicit synthetic legacy migration retains the entire original backup, revisions and snapshot bytes as immutable evidence and records the ID mapping. Dataset-scoped identities are not merged. Earlier copy assertions beyond the prepared page block new writing pending continuation review.
- Native bounded capture orchestration reads the observed numeric profile user reference and club navigation label, asks for an explicit local association, reads a fresh recent visible own-flight list, and follows up to three observed detail references. It rereads profile context before each detail, validates persisted checkpoints, saves each success before proceeding, and resumes only references still present in a fresh own list. Costs/contact/credential fields remain excluded.

## Provider evidence and remaining gates

Authenticated Chrome inspection found exactly one numeric `Benutzernummer` row on `/member/profile/viewprofile`, in `table.tablelist.alternative`, and one club label in the top-navigation link to `/member/community/main`. The narrow reader uses only these anchors. No actual identifiers, profile values or personal rows are committed. No stable club ID was established; club identity is explicitly **display-label-only**. The browser connection became unavailable after a user interruption, preventing further live filter/context inspection in this continuation.

List coverage remains **bounded-visible-list**, separately reported from **detail completion**. Unknown date interpretation, participation filters, provider caps, paging, verified-empty results, time/role/class mappings and stable club identity still block complete verified retrieval. Empty/unsupported tables cannot become verified empty history. A fully successful three-detail run is not all-history acceptance.

Both canonical schema-v1 import and the new pilot library retain explicit synthetic transport gates. Live raw captures are not converted to canonical flights. A real retrieved-facts → selected-book → writing journey cannot be accepted until the provider gates and actual format mappings pass. No paid AI, cloud provisioning, release packaging decision or production schema migration is part of this work. ADR 0007 remains proposed for production; this continuation implements its isolated synthetic proof.

## Checks

- Strict TypeScript and 52 TypeScript/real-SQLite tests pass, including every-kind malformed legacy backups, transaction/activation failures, multi-book overlap/isolation, source corrections/reversions, legacy preservation, foreign ownership, unsupported versions and durable detail expiry/context/resume.
- 38 Python host tests and canonical fixture parity pass.
- Android and iOS Hermes export passes for the intermediate implementation; final Android compilation/checkpoint and final exports are recorded below after execution.
- Native synthetic emulator checks: pending at initial publication of this implementation report. No new live native provider, physical-phone or iOS result is asserted here.

## Reproduction

Use the existing Windows helper to build committed source with JDK 17, then run the normal `android_smoke.py` on **MoFlight_Synthetic_API37** only. Run `scripts/android_book_smoke.py --serial emulator-5558 --expected-avd MoFlight_Synthetic_API37 --output local-data/android-books` afterward. The additional script exercises four books, two formats, copy isolation, offline selection, real external pilot backup/picker restore and rejection of a checksum-valid malformed backup. Its semantic-rejection check uses the normal smoke report's external synthetic backup.

Never run either synthetic script against the provider-session emulator or a physical phone. Local generated reports/screenshots remain ignored; permanent results must identify the actual source commit and evidence limits.

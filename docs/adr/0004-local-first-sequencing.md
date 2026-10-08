# ADR 0004: Phone-local persistence before cloud integration

- Date: 2026-10-08
- Status: Accepted for implementation sequencing; mobile/driver/sync/rendering details remain proposed
- Decision owner: Manuel Singer
- Tracking: #4/#5/#6; [revised plan](../architecture/local-first-implementation-plan.md)

## Context and authorization

Manuel asked whether initial phone-local user storage would be easier and instructed changing the implementation priority if so, while still checking Supabase very early. We judge it simpler for the initial logbook workflow because account/email, network persistence and synchronization are removed from that workflow's critical path. SQLite/local files were already planned, so this is a sequencing change, not a replacement cloud stack.

## Decision

Build local SQLite/files and a bounded logbook slice first: imports, paper/source state, persistent findings/decisions and deterministic aircraft/person queries. A cloud login is not mandatory for this initial local lab. Keep stable IDs, dataset ownership, revisions and source provenance for later validated account linking.

Start an independent Supabase Cloud Free feasibility trial during the same early cycle, before broad local product implementation: real Auth/recovery, private DB/RLS/files and authenticated server-command checks. Keep supported Vereinsflieger access and SPL retrieval feasibility independent. No runtime success is assumed.

After those gates pass, add account linking, remote persistence/files and explicit offline synchronization. Cross-device data and shared accounts remain required final framework capabilities; they are deferred from the first slice, not removed. Supabase Cloud Free remains the first cloud choice under ADR 0003; self-hosting and PowerSync remain later options.

## Consequences and limits

- Faster feedback on domain behavior and actual device persistence without provisioning as a prerequisite.
- Local backup/export/restore is an early requirement; phone storage alone is not a backup. Local encryption and native behavior remain test gates.
- Identity migration and conflicts must be designed before account linking; avoid treating a phone dataset ID as trusted backend identity.
- Cloud Auth/RLS/storage/availability risks are still tested early and must not be hidden by local success.
- Local storage does not supply live Vereinsflieger access, secure AI calls or a mobile Python runtime. Photo analysis and exact in-app writing-template presentation require separate evidence. PDF/file exports are optional later work and do not gate the first local slice.
- No implementation choice in ADR 0002, paid plan, AI budget or public deployment is implicitly approved by this order change.

## Verification

Current main and README/AGENTS/ADRs/technology review/product specifications/Issues read before revision. Documentation/traceability checks only; no provisioning, code implementation, cloud/local integration or device tests performed. Record actual results in the referenced Issues and README when executed.

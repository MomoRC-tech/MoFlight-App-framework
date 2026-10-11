# Project consistency, traceability and health audit

Date: 2026-10-11, Europe/Berlin. Requested by Manuel. Audited baseline: `c6a5900d5ec9aaf226ec565261735bdad553c030`, clean local checkout matching GitHub main at inspection. Coordination: [#12](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/12). Existing implementation work remains in #1–#11.

Final refresh: concurrent commits `4d33696`, `eb17f21` and `2fed0f2` advanced main during this audit. Their six-file diff was reviewed: historical Android source selection uses current planner tooling, matching APK reuse includes harness/Windows-helper-only changes, and an explicit committed source ref preserves parallel source drafts while dirty build checkouts remain refused. Application/domain/provider code and fixtures are unchanged. The Python suite was rerun at `2fed0f25a132cb19a4bc23b5e69f7f3a5ca1739f`: **36/36 pass**, including four added policy tests. These concurrent changes were preserved; their hosted/native execution is not certified here.

## Verdict and recommendation

**Development health: Amber. Full product acceptance: blocked.** The bounded native lab is supported by passing current host checks and useful earlier Android evidence. Requirements, code and evidence are not fully synchronized, and canonical restore accepts semantically invalid backups. The complete live retrieve/photo/reconcile/book/write/confirm/recover journey is not implemented or verified.

**Recommendation: continue bounded development, make restore validation and active-selection recovery the first reliability fix, and retain the canonical-live-import gate.** Continue provider identity/coverage proof without promoting captures. Review ADR 0007 with Manuel and prove source/book/entry/format isolation and migration before production schema/import changes. Keep early cloud and iOS risks visible. Paid AI, final visual design and broader features should follow their existing dependency/approval gates.

This audit does not approve a new architecture, change product scope, claim a production security certification or fix the application findings.

## Scope and method

Inventory: 59 tracked Markdown files at baseline; R01–R15 in README; FL-01–FL-17 and E01–E17 in the logbook specification; T01–T04 in the presentation contract; nine ADRs; 11 existing GitHub Issues, all open, with their comment histories retrieved. The local synced `sources/` directory contained no files at inspection. Repository reference snapshots supply the original Phase 1 and prototype requirements. Unavailable/unrecorded chats cannot be certified as captured.

Reviewed current README/AGENTS, ADR scope and approval records, active product and architecture specifications, reconciliation/source provenance, dated verification records, Issue bodies and later comments, CI workflows, shared domain/persistence code, native app selection/restore flow, provider capture/request/storage/login/detail/reconciliation boundaries and relevant tests. The register below maps the existing named requirements; supporting capture/routing/security/AI obligations are also reviewed explicitly. No claim that every sentence has an independently executable test is made.

Compared scope, authority and chronology before calling statements contradictory. A historical source snapshot is not current guidance; a proposed architecture is not approval; a passed mock/host check is not live provider/native/cloud acceptance. Read both requirements-to-code and code-to-requirements paths. Executed existing checks and independent synthetic malformed-backup probes against the baseline implementation.

No live provider session, private database, cloud resource, email, paid API, emulator reset or deployment was used. No iOS runtime or fresh Android APK/runtime was executed. External pricing, provider conditions and regulations were not revalidated; their recorded limitations remain gates, not certified current facts.

## Health by dimension

| Dimension | Result | Reason |
| --- | --- | --- |
| Requirements consistency | Amber | Core direction is reconcilable, but release packaging and SPL commitment need a single explicit current scope statement; no exhaustive semantic consistency proof. |
| Architecture governance | Amber | Accepted/proposed boundaries are generally explicit; ADR 0007 remains proposed and some older paragraphs still read as current pending decisions. |
| Documentation structure | Green for checked links | Baseline: 59 Markdown files, 312 inline local destinations, zero missing files or heading warnings. This does not assess external URLs or semantic freshness. |
| Documentation freshness | Amber | Several opening summaries, Issue bodies and lab status labels lag later code and evidence. |
| Bounded implementation | Amber | Existing synthetic workflows and capture isolation work, but restore semantics and activation recovery are unsafe for broader acceptance. |
| Automated verification | Green for executed subset | Typecheck, 42 TypeScript tests, 32 baseline / 36 final Python tests, fixture parity, both Hermes exports and Android prebuild pass. Independent probes expose missing negative coverage. |
| Android acceptance | Amber | Earlier bounded synthetic/live evidence exists; latest request ownership/cancellation and coverage/context gates are not newly accepted. |
| iOS acceptance | Unknown / not tested | An iOS JavaScript export is available; no native runtime evidence. |
| Cloud/Auth/sync | Blocked | Trial schema/probe prepared; project/two-user/SMTP/runtime evidence absent. Local dataset separation is not authenticated user isolation. |
| AI/RAG/handwriting | Not tested | Boundaries/sequence documented; gateway, permitted inputs, quality targets and approved budget precede execution. |
| Release readiness | Red / blocked | Recovery, identity/coverage, books/migration, platform/security and lifecycle gates remain unsatisfied. |

## Prioritized findings

### F01 — High: checksum-valid backups can corrupt usable restored state

Requirements: R04/R06/R09, FL-08/FL-11/FL-13; existing follow-up [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4). Code: [restore](../../packages/local-data/src/index.ts), [flight validation and findings/query](../../packages/flight-logbook/src/index.ts).

Independent probes changed one property in an otherwise valid synthetic backup and recomputed its SHA-256 checksum:

| Probe | Actual baseline outcome | Required outcome |
| --- | --- | --- |
| Finding references a nonexistent flight | Restore accepted; subsequent normal query throws `TypeError` | Reject before committing/activating the destination |
| Flight registration is an object | Restore accepted; flight validator also accepts it directly | Reject wrong field types |
| Record ID differs from payload flight ID | Restore accepted | Validate record/payload identity |
| `last_success` references a missing import | Restore accepted; source becomes null despite saved history | Reject dangling source-state references |

All probes used separate in-memory SQLite databases; the original synthetic database's full backup remained byte-identical. These are reproduced library-level failures. Their native UI activation impact follows from code inspection, not a newly executed device crash. Existing tests reject malformed JSON, wrong checksum, oversized input and some missing evidence, but do not cover these checksum-valid semantic failures.

Action: validate every supported record kind, payload type/ID/version and reference graph; validate restored history/templates/queries before activation. Convert these cases into meaningful regression tests when implementing the fix. Preserve original database, selection and pending work on rejection.

### F02 — High: selection is persisted before restored reads are known usable

Requirements: R04, FL-11/FL-13; [#4](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/4). Code: [selection storage](../../apps/platform-lab/src/storage.ts), [activate/restoreBackup](../../apps/platform-lab/src/App.tsx).

`saveSelection` writes the active-selection file in place. `restoreBackup` saves that selection before `refresh` reads the restored history and templates; it switches the active repository and closes the previous connection first. F01 demonstrates that accepted restored data can later fail a normal reader. Preserving the old DB file alone does not preserve a usable active selection. Interrupted file replacement/refresh failures have no tested recovery protocol.

Evidence: code review and F01 reader failure; no native filesystem interruption was injected. Action: stage and validate destination reads, retain the previous selection until successful activation, implement an atomic/recoverable selection protocol, and test write/refresh/restart failure paths on the actual native file API.

### F03 — High acceptance gate: provider identity and coverage remain unverified

Requirements: R06/R12, FL-03/FL-10/FL-11; [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10).

[Probe metadata](../../apps/platform-lab/src/vereinsflieger/probe.ts) correctly states unverified identity, unknown time basis and visible-list-only coverage, capped at 20 rows. [Capture storage](../../apps/platform-lab/src/vereinsflieger/storage.ts) uses one separate probe DB, without verified account/club partitions. Empty lists are rejected rather than established as verified empty windows. [Detail checkpoints](../../apps/platform-lab/src/vereinsflieger/details.ts) are a pure lab helper, without native scheduler/store or validated untrusted-checkpoint reads. Latest request ownership has host evidence, not fresh native expiry/cancel/restart acceptance.

This is honestly documented partial implementation, not proof that all captured rows are wrong. Action: verify observed account/club association; stop on context change; prove explicit date/participation/paging coverage, verified-empty versus unsupported results, independent detail completion and durable native resume. Keep raw evidence separate from canonical flights. Session reuse does not establish account isolation.

### F04 — High before import: lab identities and rules cannot satisfy multiple books

Requirements: R14/R15, book-scoped FL-04/FL-09/FL-13–FL-16; [#11](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/11), [ADR 0007](../adr/0007-multiple-logbooks-and-formats.md).

The planner's source identity contains dataset identity; paper records are keyed by flight ID. Writing requires exactly nine prepared rows, ten-row pages, UTC and PIC/Dual fixtures, and displays `Synthetic Pilot`. Separate datasets A/B prove lab dataset isolation, not several books sharing one pilot/provider history. FI/FE, overnight/corrected source durations, format rules and real photo/crew semantics cannot be inferred from current fixture success.

The product requirements are confirmed; the technical design remains proposed. Action: review the existing [bounded proof/migration plan](../architecture/multiple-logbooks-proof-plan.md), then prove overlapping book/page/entry isolation, source deduplication, primary credit/routing, combined queries, format versioning and safe legacy migration before canonical import. Do not silently generalize the synthetic rules.

### F05 — Medium: release packaging and SPL commitment are not one settled baseline

Sources: [current feature scope](../product/moflight-feature-scope.md), [README](../../README.md), [original Phase 1](../reference/Segelflug_Plattform_Architektur_Phase1.md), ADR 0001/0003 and Issues #1/#3/#8/#11.

The broader feature scope explicitly supersedes exactly two independent releases and leaves packaging open. README's proposed layout still describes independently released learning/logbook apps, while its scope says packaging is undecided. Older ADR/Issue wording still assumes both apps. This is a known supersession that is incompletely propagated; it is not a reason to create two shells now.

SPL is described as a possible addition in current feature scope but remains an unconditional learning-app description and R13/#3 early requirement in README/original project context. Optional product delivery and an independently required feasibility trial could coexist, but that distinction has not been recorded clearly enough to settle future acceptance. Action: Manuel confirms whether SPL is a committed later deliverable or an optional candidate, and which RAG trial remains required regardless. Until then, retain #3/R13 as outstanding; do not remove them or invent approval. Clarify packaging before final app IDs/shell acceptance.

### F06 — Medium: current-looking summaries contradict newer evidence

Concrete examples at the baseline:

- [Low-usage comparison](../architecture/low-usage-backend-comparison.md), opening status: mobile/workspace pending and no app implemented; accepted ADR 0002/0005 and implemented lab supersede this.
- [ADR 0002](../adr/0002-phase1-technology-proposal.md), context: no device runtime acceptance passed; later bounded Android evidence exists. Full acceptance remains open, but the blanket wording is stale.
- [State/query specification](../product/flight-logbook-state-and-queries.md), opening status: proposed and unimplemented with only old host evidence; synthetic native query/state behavior is implemented and separately evidenced.
- Issue #2's earlier plan/body says no Android WebView login tested; later comments and Windows evidence report bounded live Android login/capture. Issue #1 still says mobile choices pending. Comments preserve history but the bodies lack one current summary.
- [Lab UI](../../apps/platform-lab/src/App.tsx) says native acceptance/live access are not tested, while a separate access PoC and bounded earlier Android evidence exist. Those labels need explicit feature/synthetic/current-build scope.

Action: add a dated current summary pointing to the register/report and latest applicable evidence; label original paragraphs as historical without deleting their provenance. Avoid replacing partial-status statements with unsupported full passes. README now links this audit as the current project-wide view; the remaining cleanup is tracked in #12.

### F07 — Medium: traceability exists, but not at acceptance-criterion granularity

README lists 15 framework requirements; stories map to Issues; dated reports retain environments/results. Before this audit there was no single requirement-to-code-to-test-to-evidence table. E01–E17 and T01–T04 have no maintained per-platform/per-criterion verdicts. Historical test totals coexist with newer totals without a generated current view. Fast CI checks code but does not enforce requirement/evidence links or semantic consistency.

Action: maintain the [initial register](2026-10-11-project-audit-register.md), split broad criteria as implementation grows, and require affected requirements/ADRs/evidence to be reviewed with each change. CI can check IDs, destinations and required metadata; agents/manual review must resolve semantic candidates. Do not claim a whole story passed because one fixture passes.

### F08 — Medium project risk: required independent feasibility evidence remains blocked

Auth/private cloud/two-user proof (#1), iOS/full device acceptance (#8), and AI/RAG/handwriting (#3/#7) remain unsatisfied. ADR 0004 intentionally retains early cloud feasibility; ongoing local work has not removed that obligation. The [cloud probe](../../pocs/supabase-trial/README.md) has no executed hosted SQL/Auth/RLS/files result. This audit did not run it because it can make authenticated remote mutations when configured.

Action: resolve a disposable Free project/two synthetic sessions/free SMTP for the independent trial before substantial cloud-dependent work; obtain an iOS execution environment before accepting cross-platform behavior. Freeze permitted synthetic AI cases/quality targets and establish the approved gateway/budget before API execution. Recorded regulatory role/test amendments, actual format editions and provider distribution conditions remain production gates. These gaps are disclosed risks, not unexplained test failures.

## Consistent boundaries and reconciled apparent conflicts

No fresh evidence was found that product code bypasses the documented canonical-live-import gate: `LocalLogbook.importSource` permits only synthetic transport and the live planner remains disconnected. Exact calculations/queries are deterministic; no runtime AI gateway or direct paid AI integration exists. Pure flight-domain code has no vendor SDK or learning-domain dependency. Expo SQLite is the native writer; Node SQLite/Python are test/reference adapters, not competing app writers.

- Local-first and eventual cross-device requirements coexist through accepted ADR 0004 sequencing.
- Supabase Cloud Free supersedes earlier Convex/NUC-first proposals; production hosting and detailed sync remain unapproved.
- In-app writing is required; PDF/XLSX/CSV output requirements in prototype snapshots are historical optional-export inputs.
- Visible provider navigation is accepted for this PoC; the later hidden-navigation product flow remains required and unimplemented.
- Device-local saved credentials have explicit development authorization; this does not approve server password storage, permanent login or provider logout on Forget.
- Capture-first precedes printed output-format work. Existing format research is reference/proposal material, not evidence of an activated production profile.
- All 11 existing Issues staying open is appropriate: their broader acceptance exceeds delivered bounded slices.

## Executed verification and evidence limits

Environment: Windows; Node **24.18.0** (allowed Node 24 major, distinct from CI's pinned 24.19.0), pnpm **11.25.0**, Python **3.12.10**. Existing installed dependencies; no new framework/dependency. Audit reproductions use only canonical synthetic inputs.

| Check | Result at audited baseline |
| --- | --- |
| `pnpm typecheck` | Pass |
| `pnpm test` | 42/42 pass |
| `python scripts/mobile_fixtures.py --check` | Pass, original synthetic bytes match |
| `python -m unittest discover -s tests -v` | 32/32 at initial baseline; 36/36 after final concurrent delta: 20 local reference + 16 build/smoke-policy/reporting checks |
| `pnpm bundle` with `EXPO_OFFLINE=1` | Android and iOS Hermes exports pass; no native runtime inference |
| `pnpm --filter @moflight/platform-lab prebuild:check` with `EXPO_OFFLINE=1` | Pass; Android generated on Windows, no iOS native build |
| `node --import tsx pocs/project-audit/reproduce.ts` | Four invalid checksum-valid backups accepted; one subsequent query TypeError; wrong registration type accepted directly; original unchanged |
| `python pocs/project-audit/check_docs.py` | Baseline 59 files / 312 local destinations; zero missing files and heading warnings; rerun after adding report/register |

The baseline GitHub [fast run 38118619686](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38118619686) completed successfully for `c6a5900`. At inspection, Android checkpoint [38118467435](https://github.com/MomoRC-tech/MoFlight-App-framework/actions/runs/38118467435) for `4d84d16` was in progress; several older checkpoint runs were in progress/cancelled. Those states are not passes. Earlier [21-check Android evidence](2026-10-10-android-copy-backup.md), [Windows live bounded capture](2026-10-10-windows-desktop.md) and [latest request-ownership limits](2026-10-11-reliability-review.md) retain their own commits and scopes. No new device/native/provider acceptance is claimed by this audit.

The audit adds documentation and standalone probes only. Final structural verification covers **62 Markdown files and 387 local destinations**, with zero missing files or heading warnings. `git diff --check` passes; the synthetic probes reproduce the same outcomes on rerun. Existing source snapshots and synced project files remain unchanged. Audit publication is separate from the tested application baseline.

## Recommended order and exit criteria

1. **Restore safety (#4):** reject all F01 cases and validate every restored reader before activation; native selection interruption/refresh failure restores the previous usable selection. Existing backups and fixed snapshots still round-trip.
2. **Verified capture (#2/#10):** account/club context, bounded complete list scope, distinct detail status, verified-empty/unsupported distinction and native stop/resume/expiry/restart proof. Preserve original evidence on every failure.
3. **Book foundation (#11):** Manuel reviews ADR 0007; bounded isolation/routing/combined-query/format/migration proof passes before production schema/canonical import.
4. **Documentation (#12):** reconcile current summaries and pending scope decisions; keep the register current. Do not repeatedly seek approval for already accepted lab choices.
5. **Independent risks (#1/#8):** unblock early cloud and iOS checks alongside the bounded local work, before committing substantial implementation to unproven dependencies.
6. **One complete selected-book workflow (#2/#4/#7):** actual retrieved facts through review/write/confirm/backup/recover. Synthetic AI-case preparation follows stable capture; real handwriting requires its separate input/gateway/budget evidence before the photo journey is accepted.

Full acceptance requires current relevant evidence for every in-scope criterion and no unresolved high-severity correctness/recovery/isolation defect. Deferred features can remain deferred if explicitly agreed and tracked. A green fast workflow alone never changes this verdict.

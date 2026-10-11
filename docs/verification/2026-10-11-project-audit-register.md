# Initial requirements and acceptance register

Snapshot: 2026-10-11, Europe/Berlin; application baseline `c6a5900d5ec9aaf226ec565261735bdad553c030`; final build-policy/documentation delta reviewed through `2fed0f25a132cb19a4bc23b5e69f7f3a5ca1739f`, with application code unchanged. Read with the [audit verdict, findings and check results](2026-10-11-project-audit.md). Tracking: [#12](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/12). This register reports existing scope; it does not approve proposed criteria/designs or redefine product decisions.

## Authority and status conventions

Current explicit Manuel decisions govern their stated scope; accepted ADRs govern approved technical decisions; current product specifications govern recorded requested behavior; Issues track work; dated evidence describes only its tested inputs/commit/platform. Reference snapshots and superseded notes preserve history. Unrecorded chats are outside this inventory. Named requirement IDs remain stable; supporting paragraphs need finer IDs when converted into implementable criteria.

**Partial** means only a bounded part is implemented/evidenced. **Prepared** means a proposal/probe exists without executed integration evidence. **Open** means no implementation/acceptance is established. **Later** describes current prioritization, not cancellation. No broad R or FL requirement is declared fully accepted through synthetic fixture success alone. R10 has a verified development subset.

Implementation references used below:

- **Domain:** [flight facts, queries, writing and validation](../../packages/flight-logbook/src/index.ts).
- **Local:** [versioned SQLite records/backup/restore](../../packages/local-data/src/index.ts).
- **App:** [lab composition and activation/restore UI](../../apps/platform-lab/src/App.tsx), [selection storage](../../apps/platform-lab/src/storage.ts).
- **Capture:** [native access UI](../../apps/platform-lab/src/vereinsflieger/AccessProbe.tsx), [raw decoder](../../apps/platform-lab/src/vereinsflieger/probe.ts), [validated raw persistence](../../apps/platform-lab/src/vereinsflieger/capture-store.ts).
- **Planner/detail:** [disconnected reconciliation planner](../../apps/platform-lab/src/vereinsflieger/reconciliation.ts), [detail/checkpoint helper](../../apps/platform-lab/src/vereinsflieger/details.ts).
- **Cloud:** [trial schema](../../pocs/supabase-trial/schema.sql), [probe and unexecuted manual gates](../../pocs/supabase-trial/README.md).

Evidence references:

- **TS:** [ten canonical-domain/local SQLite tests](../../tests/mobile/logbook.test.ts), [five reconciliation tests](../../tests/mobile/vereinsflieger-reconciliation.test.ts), [six detail tests](../../tests/mobile/vereinsflieger-details.test.ts), [capture tests](../../tests/mobile/vereinsflieger-probe.test.ts), [login tests](../../tests/mobile/vereinsflieger-login.test.ts), [four request/persistence recovery tests](../../tests/mobile/vereinsflieger-recovery.test.ts). Current total 42; test counts are not requirement completion counts.
- **Host:** [20 Python local-reference tests](../../tests/test_local_logbook.py); initial Python total 32, final total 36 after concurrent build-policy additions; includes build-policy/smoke/reporting tests.
- **Android A:** [21 synthetic copy/backup/emulator checks](2026-10-10-android-copy-backup.md); [bounded physical-phone manual subset](2026-10-09-android-offline.md).
- **Android B:** [Windows bounded live raw capture/reopening](2026-10-10-windows-desktop.md); [saved-login limits](2026-10-10-vereinsflieger-saved-login.md).
- **Recovery:** [latest capture hardening and open native gates](2026-10-11-reliability-review.md).
- **Discovery:** [authenticated browser discovery](2026-10-10-vereinsflieger-discovery.md), [capture-field proof](2026-10-11-vereinsflieger-capture-fields.md), [bounded desktop detail proof](2026-10-11-vereinsflieger-detail-proof.md).
- **Audit:** fresh host/types/bundle results and independent semantic-backup failures in the linked audit report. Earlier native evidence remains tied to its own app/harness identities.

## Framework requirements R01–R15

Source/acceptance wording: [README requirement table](../../README.md#requirements-and-evidence); original R01–R13 provenance: [Phase 1 snapshot](../reference/Segelflug_Plattform_Architektur_Phase1.md). R02/R03 scope is refined by [feature scope](../product/moflight-feature-scope.md); R14/R15 originate there. Tracking numbers below link through [Issues](https://github.com/MomoRC-tech/MoFlight-App-framework/issues).

| ID | Current scope / decision | Implementation and evidence | Verdict / remaining gate | Issues |
| --- | --- | --- | --- | --- |
| R01 | Android/iOS; lab stack approved ADR 0002/0005 | App; Android A/B; current both-platform JavaScript exports | Partial; iOS native execution and integrated platform acceptance open | #6/#8 |
| R02 | Multiple features; one/separate releases undecided | Platform lab only; no product shells | Open packaging decision; old two-shell requirement cannot dictate IDs now (F05) | #8/#11 |
| R03 | Shared account identity retained; sessions depend on packaging | Cloud preparation only | Prepared; registration/recovery/shared identity/native sessions unverified | #1/#5/#8 |
| R04 | Offline reads/writes retained; local-first ADR 0004 | Local/App; TS/Host, Android A; Audit F01/F02 | Partial; restore semantic safety, selection recovery, later reconnect/conflicts/migrations open | #4/#7/#8 |
| R05 | Cross-device convergence remains target | Cloud proposal, no sync/outbox integration | Open; two-session/device and conflict/retry/delete tests absent | #1/#4/#8 |
| R06 | Isolation on every data/file/job/sync/local path | Synthetic datasets separated; planner rejects foreign binding; raw captures unbound | Partial local lab only; authenticated and multi-book isolation unverified | #1/#2/#4/#7/#8/#11 |
| R07 | Reusable independent pure domains/modules | Domain has no vendor SDK or learning import; Local consumes domain; App wires Expo | Partial; reusable multi-book boundary and second domain/app not proven | #6/#8/#11 |
| R08 | Authenticated server-side AI/budget; ADR 0008 boundaries accepted | No implemented AI gateway or paid calls | Open; auth, validated requests, budget/usage/retry evidence | #3/#7 |
| R09 | Private file lifecycle/offline selection; writing file exports optional | Native JSON backup and picker; Android A | Partial; F01/F02, photo/private upload/download/jobs and per-account files open | #4/#7/#8 |
| R10 | Reproducible agent development and evidence | AGENTS, pins/workflows/local helper, traced commits/Issues, current tests/CI | Verified bounded development subset; documentation/criterion traceability upkeep needed | #6/#12 |
| R11 | Export/deletion/rights/entitlements/release boundaries | Local backup subset and planning docs | Partial; production privacy/retention/deletion/rights/entitlements/release unverified | #5/#7/#8 |
| R12 | Browser own-flight route confirmed; REST future-only | Capture; Android B, Discovery, TS/Recovery | Partial raw access; identity/time/scope/complete coverage/expiry/canonical import/conditions open | #2/#10/#11 |
| R13 | Early measurable RAG requirement retained pending SPL clarification | Issue #3 evaluation targets; no pipeline/data/model run | Open; permitted corpus/gateway/budget and retrieval/citation/gap/cost evidence (F05/F08) | #3/#8 |
| R14 | Later UL/powered formats confirmed | Capture inventory and printed-format research, no active profile | Later; class mapping, actual edition, role/time rules, offline acceptance | #10/#11 |
| R15 | Several independent books per pilot confirmed; ADR 0007 proposed | Two lab datasets are not book/source separation | Open; approved technical boundary, isolation/routing/format/migration proof | #11 |

## Logbook stories FL-01–FL-17

Canonical requested behavior and proposed detailed acceptance: [user stories](../product/flight-logbook-user-stories.md#stories-and-acceptance-criteria). Read with the [state/query](../product/flight-logbook-state-and-queries.md), [presentation](../product/writing-template-presentation.md) and [connection/retrieval](../product/vereinsflieger-connection-and-retrieval.md) specifications. Full real-photo/account/book workflow remains the target; current substitutions are not acceptance of the whole story.

| ID | Behavior | Implementation / relevant evidence | Current verdict and missing acceptance | Issues |
| --- | --- | --- | --- | --- |
| FL-01 | Own-account session/resume | Local synthetic dataset; Cloud preparation | Partial local only; real identity/account switching/second device | #1/#4/#8 |
| FL-02 | Photo input and unknown-preserving observations | Prepared synthetic page; no OCR/photo workflow | Open actual selection/recognition/upload/correction | #7 |
| FL-03 | Automatic own-flight retrieval | Capture, Android B, Discovery; planner/detail prototypes | Partial default list; verified identity/coverage/native detail/expiry/hidden product flow/canonical import | #2/#10/#11 |
| FL-04 | Actual paper anchor controls continuation | Domain/Local prepared nine-row page; TS/Host | Partial fixed fixture; general real-page anchors, uncertain/new photo/book state | #4/#7/#11 |
| FL-05 | Compare every readable field | Local compares aircraft/registration after known fixture anchor | Partial; full field/photo matching and preserved candidate ambiguity | #7 |
| FL-06 | Targeted uncertainty decisions | Ignore/override/reverse for two finding fields; TS/Host | Partial; anchor/crew/duplicate/unknown totals/questions/general drafts | #7/#8 |
| FL-07 | Exact durations, roles and totals | Domain fixture calculations; TS/Host | Partial UTC PIC/Dual; DST/overnight/corrected duration/FI-FE/real format rules | #7/#11 |
| FL-08 | Versioned overall result/provenance | Local records/templates/decisions; TS/Host, Android A | Partial synthetic; complete photo/matching/session lifecycle and safe restore | #1/#4/#7 |
| FL-09 | Exact readable copy instructions | Domain/App fixed snapshot; TS/Host, Android A | Partial synthetic; full T02 readability, real book/profile/input handling | #7/#8/#11 |
| FL-10 | Safe retries and fixed old revisions | Local synthetic idempotency; planner/capture retry checks | Partial; live transactional revisions, device conflicts and actual paid-job retries | #2/#4/#7 |
| FL-11 | Interruptions preserve work and resume | Local/Android A restart; Recovery TS; detail prototype | Partial; F01/F02, native current capture checkpoints/expiry, uploads/cloud failures | #4/#7/#8 |
| FL-12 | Historical paper review | No review workflow; synthetic historical extra source rows | Later; full page coverage/corrections without renumbering | #7 |
| FL-13 | Remember paper/source/pending state | Local/App; TS/Host, Android A | Partial synthetic local; real paper photo/source reconciliation, books and devices | #1/#2/#4/#7/#8/#11 |
| FL-14 | Scoped reusable/reversible decisions | Domain/Local fingerprints and versions; TS/Host | Partial; real photo/rule-change applicability, concurrent devices/duplicate decisions | #1/#4/#7/#8 |
| FL-15 | Exact aircraft counts | Domain query; TS/Host, bounded Android A | Partial fixed filters; real stable aircraft mapping, ambiguity/coverage/books | #9/#1/#2/#4/#11 |
| FL-16 | Exact person latest/count by role | Domain typed person/role query; TS/Host | Partial host only; real crew identities, general UI/native/auth/book scope | #9/#1/#2/#4/#11 |
| FL-17 | Later instructor duty query | Discovery observes historical duty views; no query integration | Later; future scope/timezone/assignment/access and source-backed answers | #10 |

## Acceptance scenarios

E scenarios are the full story expectations in the [canonical specification](../product/flight-logbook-user-stories.md#end-to-end-acceptance-scenarios). None is marked fully passed by this audit. The matrix identifies the existing useful subset and the missing proof.

| Scenario | Existing subset | Remaining distinction |
| --- | --- | --- |
| E01 Happy path | Synthetic page 69→70/71, exact totals/snapshot; TS/Host, Android A | Actual photo/source/account/book inputs and full journey |
| E02 Extra history | Synthetic older rows do not shift numbering | Real matching/coverage and historical warning scope |
| E03 Wrong aircraft | Fixture aircraft/registration findings retained | Every readable photo field, identity/time candidate ambiguity |
| E04 Unknown anchor/carry | Host unknown carryover rejection | Real unreadable input/correction and native targeted feedback |
| E05 Duplicate/overlap | Synthetic duplicate identity and planner conflict checks; Host overlap case | General review/defer flow, explicit duplicate credit and anchor/candidate overlap coverage |
| E06 Interrupted feedback | Persisted decisions/revision fingerprints | Multi-question draft session and changed photo-input revision |
| E07 Privacy/retry | Lab stale-write/idempotency tests | Real users/private files/jobs and server/device authorization |
| E08 Updated paper | Viewing does not advance; changed source preserves old template | Fresh-photo comparison against explicit copying assertions |
| E09 Source/backend outage | Failed synthetic refresh retains history; capture fail/timeout tests | Verified partial-live coverage, expiry, quota/pause and resumed jobs |
| E10 Time/roles | UTC PIC/Dual synthetic arithmetic | DST, overnight, corrected reported time and all role/format mappings |
| E11 Remembered state | Native synthetic offline restart/query/snapshot | Real history/paper data and later device convergence |
| E12 Reusable decisions | Relevant versus unrelated field change tested | Photo/rules/identity changes and full decision types |
| E13 Paper confirmation | Native subset copying and fixed snapshot restore | Conflicting later photo and multiple independent books |
| E14 Override/reversal | Source/effective views and old snapshots tested | Actual user-scoped facts and production integration |
| E15 Aircraft queries | Synthetic instance/model/date/dedup expected lists | Real unknown/class/catalogue/book associations and full native UI |
| E16 Person queries | Synthetic same-name IDs/roles/date gaps tested | Live scoped person mapping, native intent UI and authenticated negatives |
| E17 Roster | Bounded discovery only | No implemented roster query or live future-assignment acceptance |

| Presentation criterion | Evidence / status |
| --- | --- |
| T01 Continued page | Bounded synthetic TS/Host/Android page mapping; real book/profile/role/carry inputs open |
| T02 Readability/unknowns | Text labels and host unknown checks; full supported-device orientation/large-text/readability/feedback proof open |
| T03 Offline resume/confirmation | Android A passes bounded snapshot/copy/restart; fresh-photo/current capture/book/device cases open |
| T04 Optional export parity | Not applicable to unselected writing-file export; JSON backup is not a PDF/XLSX writing export |

## Supporting obligations without their own requirement IDs

| Source | Obligations reviewed | Implementation/evidence and remaining gap |
| --- | --- | --- |
| [Capture inventory](../product/vereinsflieger-capture-requirements.md) | Raw values/units/crew/aircraft/time/provenance, missing versus blank versus zero, source revisions and complete scope | List inspector preserves three raw states; desktop detail reader exists. Normalized unresolved/conflict states, account identity, role/time/catalogue mapping and complete native retrieval remain open (#2/#10). |
| [Capture model](../architecture/vereinsflieger-capture-data-model.md) | Shared provider evidence, list/detail status separation, catalogue association and optional cost records | Proposed model, not implemented schema. Costs not captured; optional costs must not gate mandatory flights. |
| [Routing/format research](../product/logbook-requirements-and-routing.md) | Actual edition/licence/time context, primary credit, combined books, TMG, successor dates and ambiguity | Recorded research/proposal only; current regulatory role amendments/actual profile mappings not fully accepted. Preserve approval gates (#11). |
| [AGENTS](../../AGENTS.md) / README invariants | No credentials/private samples in Git; synthetic tests; ownership per path; preserve pending work; deterministic arithmetic; scoped account/provider identity | Audit artifacts use only synthetic values. No comprehensive historical secret scan/security certification; runtime isolation and lifecycle remain open. |
| [ADR 0008](../adr/0008-logbook-ai-and-deterministic-boundary.md) | AI proposes with evidence, deterministic authority, relevant context, budgeted authenticated execution | Consistent current no-AI implementation; synthetic evaluation harness/quality targets and real handwriting remain future gated work. |
| [ADR 0009](../adr/0009-local-android-development-and-checkpoint-ci.md) | Local synthetic emulator safety, fast CI versus checkpoint acceptance, preserve dirty/private checkouts | Helper/policy tests and workflows implemented; audit does not reset/build-run devices; green fast checks are not new native acceptance. |
| [Cloud trial](../../pocs/supabase-trial/README.md) | Auth/recovery/RLS/files/server ownership/availability/deletion | Schema/probe prepared; no hosted execution. Separate early risk trial remains blocked (#1). |

## Decision register

| ADR | Current decision authority and scope | Audit interpretation |
| --- | --- | --- |
| [0001](../adr/0001-project-workflow.md) | Accepted repository/README/Issues/direct-main workflow | Applies; older two-product context does not settle packaging |
| [0002](../adr/0002-phase1-technology-proposal.md) | Accepted initial Expo/TypeScript/pnpm/expo-sqlite lab | Detailed sync/production schemas are not accepted; stale status paragraphs need annotation |
| [0003](../adr/0003-low-usage-backend-proposal.md) | Accepted Supabase Cloud Free first trial | Not production hosting/availability proof or paid approval |
| [0004](../adr/0004-local-first-sequencing.md) | Accepted local-first plus independent early cloud trial | Cross-device/account requirements retained |
| [0005](../adr/0005-host-lab-before-mobile-approval.md) | Initial native-lab recommendation accepted; host evidence bounded | Python host evidence does not adopt a mobile writer |
| [0006](../adr/0006-vereinsflieger-connector-proposal.md) | Browser direction confirmed; detailed connector proposed; development saved login authorized | No canonical production transport/import acceptance inferred |
| [0007](../adr/0007-multiple-logbooks-and-formats.md) | Proposed technical design; confirmed multi-book product requirement | Manuel review and bounded proof remain required |
| [0008](../adr/0008-logbook-ai-and-deterministic-boundary.md) | Accepted responsibility boundaries/sequence | Model/provider/budget/API execution unapproved |
| [0009](../adr/0009-local-android-development-and-checkpoint-ci.md) | Accepted local Android loop/checkpoint CI | Fast success alone cannot pass native features |

Maintain implementation, verification, approval and milestone scope as separate fields when expanding this register. Each materially changed requirement needs a linked current Issue, applicable decision, code and executed evidence or an explicit not-tested/blocked result. Do not erase historical failures or mark unfinished stories complete to make the register green.

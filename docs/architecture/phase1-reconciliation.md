# Phase 1 requirements reconciliation

Date: 2026-10-08. Status: completed documentation comparison; technology review and implementation remain open.

## Evidence and precedence

The full current content of `Segelflug_Plattform_Architektur_Phase1.md` was read: document draft 0.2, Library version 2, 337 lines, modified 2026-10-08. Its unchanged text is [archived here](../reference/Segelflug_Plattform_Architektur_Phase1.md).

Compared against repository main commit `4f865d3810ef995093f924afec49b34783be26f3`, README, AGENTS.md, ADR 0001 and Issues #1–#5. The comparison uses source text, not only the chat summary. Source technical/pricing claims have not been independently refreshed during this reconciliation.

Current user instructions take precedence: repository is MoFlight-App-framework; README is the central documentation; work directly on main without PRs; communicate in English. Existing source recommendations remain proposed unless approval is evidenced.

## Findings and resolution

| Topic | Earlier Phase 1 draft | Initial GitHub documentation | Reconciled result |
| --- | --- | --- | --- |
| Mobile baseline | Expo/React Native/strict TypeScript, pnpm recommended | Expo or Flutter reopened as candidates | Preserve recommendation; focused alternative/compatibility review in #5 |
| Accounts | One identity across both apps, separate sessions | Generic user identity only | Explicit same-account contract; no promised seamless SSO |
| Local data / sync | SQLite and early PowerSync trial | Generic local data; sync mostly after auth | Restore trial and early sync risk tests with #1/#4; broader expansion later |
| Security | API, sync, files, jobs, local databases | Mostly API/RLS negatives | Restore independent negatives on all paths |
| Test app | platform-lab before product shells | No tracked lab setup | Add #6 with reproducible setup/native build preparation |
| Files / export | Private jobs; Python generator reuse | Only generic AI integration | Add #7, separate observations from confirmation and deterministic arithmetic |
| RAG | Quantified 20-query evaluation | 20 queries but no specific metrics | Restore top-5 >=90%, contextual source IDs 100%, all gap cases |
| Demo content | Five knowledge sections, ten quiz questions | Unspecified small corpus | Carry demo counts separately from 20 evaluation queries |
| Two app shells / device acceptance | Explicit P6/P8 work and E2E checklist | Generic Android/iOS scope | Add #8, distinct identities, builds and per-platform outcomes |
| Data/API contracts | Ownership, versions, events, idempotency, jobs, deletion | Broad target only | Restore key invariants in README; original detailed table remains linked |
| Logbook rules | Confirmed anchors and original export; rule discrepancies | Minimal logbook goal | Preserve regression inventory; inspect current plugin/skill before reuse |
| Commercial lifecycle | Rights, export/deletion, entitlements/release concept | Partial risks | Restore boundary without implementing shop/release in Phase 1 |

## Superseded details and internal consistency

- Draft's tentative `soaring-platform` repository name is replaced by the actual MoFlight repository.
- Draft's `apps/glider-logbook` spelling maps to `apps/flight-logbook` in the current target layout. Neither exists as implementation yet.
- Vendor-specific Supabase directories are proposed only after selection; `backend/` remains the neutral boundary.
- Draft PR-based checks become checks on pushes to main. No PR or branch is needed for future work.
- Draft's statement that no GitHub repository had been created is historical; this repository and initial Issues now exist.
- Ten demo quiz items and twenty RAG evaluation queries are separate datasets, not contradictory requirements.
- Source ADR labels 001–012 are proposal labels, not twelve accepted repository ADRs. Repository ADR 0001 concerns workflow; ADR 0002 records the carried-forward technology proposal.
- Historical price tables/effort ranges remain in the source snapshot and are not promoted to freshly verified prices or commitments.
- Source's previous plugin/skill inspection and unofficial API findings are attributed to the draft; no new current-code/API verification is claimed.

## Requirement traceability

All R01–R13 are retained in README. R01/R02/R03 and integrated acceptance map to #8; R04/R05/R06 to #1/#4 plus #7/#8; R07/R10 to #6 and agent rules; R08/R13 to #3; R09 to #7; R11 to README lifecycle boundary and #5/#8; R12 to #2. Detailed acceptance remains in the Issues.

P1 comparison is complete. Technology review/approval #5 remains open. P2 is #6; P3 is #1/#4; P4 is #2; P5 is #3; P6 is #4/#8; P7 is #7; P8 is #8. No work package has a passed runtime result.

## Review performed

Read the complete source, checked the thirteen requirement rows and eight plan stages against the updated README/Issues, and reviewed relative links, status language and instruction precedence. No source proposal was marked approved; no live integration, pricing check, source-code reuse, cloud provisioning or device test was performed.

The next action is focused current-source validation of the technology proposal in #5, then a small platform-lab implementation and early auth/sync experiment.

## Later product and backend checkpoint — 2026-10-08

Manuel selected Supabase Cloud Free for the initial trial, with local Supabase as a possible later move. ADR 0003 records that limited decision; ADR 0002 remains proposed for mobile/workspace. [Flight-logbook user stories](../product/flight-logbook-user-stories.md) now capture the complete photo-to-PDF journey, persisted reconciliation/feedback and actual paper state. Current plugin/skill instructions and rulebooks were inspected and [captured](../reference/flugbuch-prototype/README.md); their rule differences are explicit. Generator code has not yet been inspected or reused. This checkpoint supersedes earlier pending-backend and uninspected-rule-document statements; it does not claim runtime success.

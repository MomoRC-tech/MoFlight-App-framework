# Remembered state and queries: documentation verification

Date: 2026-10-08. Baseline: prepared commit `0c12da03e95fa81fa632b63d57040695bdd2f4a0`; actual main remains `ab7db470ee507bf08ccb33ed3c2c7cb4f7384c14` because its update was rejected by automatic approval review. This documentation addition is a successor to that prepared commit, not a main change.

Read README, AGENTS, ADR 0003, existing user stories, product index and verification record from the prepared baseline; inspect current main and Issues #1/#2/#4/#5/#7/#8 plus the full open-Issue list before creating #9. No duplicate statistics task existed.

Changes: FL-13–FL-16 and E11–E16 add remembered paper/import state, scoped ignored/overridden decisions and aircraft/person counts/latest queries. The primary journey now permits reusing remembered evidence and entry-level copied confirmation, while keeping export generation separate from actual paper status. New product contract documents data basis, freshness, identity ambiguity, revisions and deterministic query semantics. README/index/ADR and Issues map the addition to implementation work.

Validation: relative links/anchors resolve against the prepared tree and staged files; Markdown table widths and whitespace checked; 16 unique sequential story IDs and 16 unique sequential scenario IDs verified. Reviewed source/effective/paper separation, ignored-versus-overridden behavior, changed-evidence decision review, unchanged-evidence reuse, aircraft instance/model, person name ambiguity, history coverage and offline/account boundaries. Supabase Cloud Free remains the selected first backend; no mobile/sync approval is inferred.

No app/schema/parser/query, cloud provisioning, live import, PDF/device test or paid AI call performed. Acceptance examples are synthetic planned fixtures, not test results or claims about the user's actual history. Previous prototype source snapshots remain unchanged.

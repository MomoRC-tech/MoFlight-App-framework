# Writing-template format clarification and publication

Date: 2026-10-08. Scope: documentation and Issue alignment only.

## Source and revision lineage

Manuel clarified that the writing template may use any user-friendly format showing exactly what to write into the paper Flugbuch, and instructed publishing all changes. This refinement builds on prepared commit `725ca935a2d7249801df5d1c96390100c6a5177e` (phone-local first, independent early Supabase feasibility and later Vereinsflieger discovery), whose parent is main's previously published `c8f125cb0ef0ee88a8b94bfdbc44090811adc8e7`. Publication includes both that pending priority revision and this format clarification.

## Changes and checks

- README, FL-09/journey/storage/scenarios, remembered-state language, ADRs and active implementation priorities now require exact in-app writing instructions from a resolved snapshot; PDF and other file exports are optional later work.
- The presentation contract specifies page/row/field mapping, deterministic values, readability, unknowns, offline reopening, immutable revisions and explicit copied-entry confirmation. Captured historical prototype output rules remain unchanged.
- Relevant open Issues are aligned with the current requirements and publication state; #7 no longer requires a Python worker or mandatory PDF. No Issue is marked completed.
- Local validation checks relative document targets against the repository tree, Markdown table structure, FL-01–FL-17/E01–E17 traceability, and conflicting mandatory-PDF/worker statements in active documentation. Publication must be checked against the resulting main ref and actual remote files.

## Limits

No application code, SQLite schema, runtime/device tests, live Vereinsflieger retrieval, photo recognition, cloud resources, export renderer, monitoring or paid requests were executed. Documentation checks do not establish product or security acceptance. Supabase Cloud Free remains the first cloud choice and is evaluated very early; phone-local persistence is the initial product data path. Mobile/workspace and detailed driver/sync choices remain proposed.

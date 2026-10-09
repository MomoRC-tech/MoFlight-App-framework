# Writing-template presentation

Current implementation note: the [bounded synthetic lab](../../apps/platform-lab/README.md) has 20 host/10 TypeScript checks plus [seven actual Android emulator checkpoints](../verification/2026-10-09-android-offline.md), including reopening the same fixed snapshot in airplane mode without paper advancement. Full T02 readability, selective-copy UI, external backup/picker, physical-phone/iOS and cloud/live/handwriting acceptance remain open; the requirements below remain the full target. Prepared observations and CSV are explicitly synthetic.

Date: 2026-10-08. Product owner: Manuel Singer. Source: Manuel's clarification that the output need not be a PDF, provided it is user-friendly and represents exactly what to write in the paper Flugbuch. Canonical story: [FL-09](flight-logbook-user-stories.md); implementation and acceptance: #7/#8.

## Required outcome

The pilot can see the exact entries to copy into the physical logbook without reconstructing them from a comparison report. Format is flexible; correctness, placement and readability are required. The initial implementation is an in-app view backed by a persisted resolved snapshot. PDF, HTML, images or other shareable formats are optional candidates, not selected dependencies or mandatory downloads.

## Content and interaction contract

- Bind the complete view to one immutable resolved snapshot with source, decision, calculation and presentation/rules versions. Reopen it after offline restart. Reconciliation changes create a new revision; do not silently mix new values into instructions while the pilot is copying them.
- Identify the target book/layout and continuation page, row and destination field for every new value. For the supported prototype book, continue the current ten-row page before opening the next. Screen dimensions need not imitate a 420 x 148 mm PDF spread.
- Show exact numbering, dates, aircraft, registration, launch information, crew/roles, durations, remarks and required carryovers/page totals according to the supported layout and resolved rules. Show units and the established time basis; use deterministic calculations. Distinguish intentional blanks from unreadable/unknown values. Required unknowns trigger feedback before the affected instructions become ready.
- Separate already-written context from new values to copy with text/symbols as well as visual treatment. A narrow-screen row or field view is acceptable if destinations remain clear. Text must be legible, unclipped and navigable without guessing which column it belongs to.
- Keep findings, provenance and explanations accessible beside the template. Clearly separate these from literal writing instructions; include report text in a paper remarks field only when it is explicitly part of the resolved entry.
- Preparation, viewing, download and sharing never advance confirmed paper status. The pilot explicitly confirms identified copied entries from a named revision, or supplies new photo evidence. Confirmation advances only those records; later conflicting evidence creates a finding ([state semantics](flight-logbook-state-and-queries.md)).
- Preserve older snapshots and their decisions. Show when newer evidence makes an older template require review; never silently rewrite it. Optional exports use the same snapshot and must agree with all copyable values and destinations.
- Keep local presentation and stored inputs private to the selected dataset/profile. Later cloud/account integration applies the independent ownership and negative-access gates. In-app presentation requires no export worker.

## Acceptance evidence to collect

| Scenario | Expected evidence |
| --- | --- |
| T01 Continued page | Start at number 69/row 9; show 70 in row 10 and 71 on the next page, with independently verified roles/carryovers/totals and existing context clearly identified. |
| T02 Readability and unknowns | On supported Android/iOS screens, every destination and value is readable; no color-only distinction. An unknown required value requests feedback rather than inventing writing instructions. |
| T03 Resume and paper confirmation | Reopen the same snapshot in airplane mode after process restart. Merely viewing it leaves paper state unchanged; explicit confirmation of a subset advances only that subset. New evidence preserves the old revision and prompts affected review. |
| T04 Optional export parity | If a file format is implemented, compare every copyable field/destination with the same in-app snapshot; verify actual export runtime and legibility. This test is not a prerequisite for delivery of the first in-app view. |

These are proposed acceptance criteria. No app view, renderer, offline device test or optional export has been implemented or tested by this documentation change. Prototype instruction/rule snapshots remain historical sources; current generator code reuse remains unverified.

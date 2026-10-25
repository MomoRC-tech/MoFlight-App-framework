# Phone usability — 25 October 2026

Approved package: #84 compact expandable filters, #87 role-first deduplicated crew and selected Solo rule, #78 chat-first presentation. Latest steering: omit unknowns from Flights overview; retain details/raw evidence. M1/M3–M5; R01/R04/R08/R12, FL-03/10/11, E07/E09/E11, AI07/AI08. Baseline da7e353. No new dependency, provider scope, schema, AI activation or paid execution.

Implementation: inline bounded filter form and single-choice menus; independently scrolling transcript/pinned composer with secondary history/privacy/usage/task sheets; full-source-name crew grouping and known-only flight rows. Raw evidence, filters, deterministic statistics and local chat contracts are preserved. Regression checks cover missing values versus zero, same initials/different names, PIC/SIC/FI/companions, Solo, filter/reset/detail/account return, menu dismissal, explicit Send and older-message scrolling. Existing persistence/controller tests cover drafts/cancellation/owner boundaries; native runtime is separate.

## Checkpoint in progress

Focused 32-test run passed before the final known-only-row regression was added. Initial combined host run: types/lint/fixtures passed; outdated preview expectation and malformed synthetic missing-field fixture were corrected, and new UI glyphs were replaced with existing catalogued symbols. The same run observed a concurrently edited, unrelated relay-policy expectation; its files are preserved outside this UI package. Handbook regeneration and focused reruns follow. No native or physical acceptance is claimed yet.

Ignored detailed logs: `build/phone-usability/`; first host logs `build/host-checks/20261025T093012Z-da196b6d/`. Generated run suffix is not a source commit.

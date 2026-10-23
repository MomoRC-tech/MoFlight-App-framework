# Club and season UI refinement — 24 October 2026

Approved by Manuel on 24 October; [#20](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/20), related #9/#10/#56. M4/R04/R12, FL-03/10/11, E07/E09. This package changes saved-data presentation, not synchronization, authentication, storage or provider capture.

The existing club artwork now fills the header to the card borders, with a growing minimum88 dp title area. Compact duties show grouped duty/date/name facts and the detail action; source coverage, retrieval time and unplaced rows remain in expanded details. The removed wording “Personen laut Quellzeile” referred to displayed source-row names, not verified partners. Single-token names no longer become one initial; multiword names retain the existing first-name/surname-initial display. Existing initials are not expanded, and names never establish ownership or cross-row identity.

Meine Saison has three metrics in one row. Flight comparisons retain current/prior rings and deltas; work hours use a symbol and completed/required labels. Enlarged text can scroll the row sideways. Completed hours use exactly one current-year annual source row; missing, invalid or ambiguous rows stay unknown. Required hours remain unknown: the imported Pflicht/Geleistet amounts are EUR, not a quota. A profile target is an unanswered product question; no financial conversion, partial-entry sum, invented percentage or new setting is implemented.

## Verification

Complete `pnpm check` passes all5 checks: 1,012 mobile tests,114 Python tests, TypeScript, lint and fixture parity (`build/host-checks/20261023T220955Z-9b4d819e/`, implementation working tree before source commit). The initial run caught outdated handbook colour/symbol coverage; maintained references and the synthetic currency literal were corrected, then the complete check passed. Generated handbook freshness also passes. Committed-source Release/native layout checks are pending. Meaningful regressions cover annual year selection, zero/decimal/clock values, missing/duplicate/invalid source rows, selected-account changes, name preservation and concise/detail information separation. Existing account isolation and sync checks are reused because their implementation is unchanged.

Physical review of these UI changes, iOS and spoken accessibility are not tested. The separate source256aa3f sync delivery received user-reported phone success; that feedback does not establish acceptance of this UI package.

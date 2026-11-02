# Local source-change review — 2 November 2026

## Scope and implementation

[#30](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/30), M4 / R04/R12 / FL-03/10/11 / E07/E09/E11. Manuel requested reasonable issue implementation and continued the proposed package with “proceed”. First import establishes a baseline without alerts; later changes, including reversals, remain marked until explicit acknowledgment. This increment implements source review, not the production paper-book workflow.

Flights and Statistics contributor cards show a small labelled amber “Geändert” marker. Details start with a collapsed source comparison: baseline/current revisions, exact changed raw fields and an explicit “Gesehen” action. Removed columns, empty source values and duplicate-label ambiguity are distinct; named-column reordering does not invent a change. A reversal explains the intermediate change even when current fields match the baseline. All intermediate source revisions remain in their existing history. Opening details does not acknowledge anything. Start and shared colors/navigation remain unchanged.

The implementation uses the existing immutable fact revision chain and exact stored payload digests. List summaries retain only revision/digest metadata; they do not parse all historical raw evidence or hash each flight again. Full raw comparisons are derived only for the opened detail. Acknowledgment performs a fresh ordinary local detail read and checks owner/store/account, displayed selection, revision, source identity, exact payload digest, foreground and pending work/restore. Late results cannot publish into another view. A racing later revision never inherits the earlier digest's acknowledgment.

Only last-seen flight ID/revision/digest are persisted in a separate owner/store/account-bound SQLite UI store. Missing storage creates nothing on read. Corrupt/unavailable metadata leaves source flights usable and conservatively requests review again, with retry in details. Transactions preserve prior state when guards fail; no authoritative flight, receipt, calculated credit, paper decision or writing snapshot is changed.

Supported-user archive versions1–5 and their historical coverage constants are unchanged. Local seen-state is explicitly excluded in the shared backup notice/Help/inventory; a restored or different history branch cannot inherit seen-state by revision number alone. Same-install updates retain the scoped file; uninstall loses it. Android system-backup eligibility is separate from portable export and remains unaccepted under #37. Owner-wide file removal remains part of #16's existing clearing gate; no new deletion action is introduced here.

## Verification

Focused checks cover repeated changes/identical refreshes/reversal, retained exact graph bytes, unknown/removed/raw columns, payload-specific acknowledgment, caller/result ownership, actual hook explicit-click behavior, real-SQLite reopen/isolation and transactional stale-write rollback. Existing reader, native-port stand-ins, Help, preview and Statistics return checks are reused. The first focused run failed because the duplicate-header test tried to admit an already-forbidden source shape; it now explicitly verifies admission rejection and separately checks defensive display behavior. No production validator was weakened.

Detailed logs remain ignored under build/source-review-*.log. The one broader host checkpoint, platform exports, committed-source Release and bounded native presentation results are recorded below after execution. Host SQLite/native-leaf stand-ins do not prove actual Android acknowledgment persistence or a real second-account journey. The synthetic DesignPreview source-change mode is fictional and nonpersisting; its “Gesehen” action changes local preview state only and cannot call production storage.

**Host checkpoint:** all five `pnpm check` groups and Android/iOS Hermes exports pass. Source recorded by the runner is3261942 plus this finalized implementation/test input; no later app/test edits before the source commit. Logs: build/host-checks/20261102T204123Z-cd0720a4 and build/source-review-bundle.log. Handbook freshness/393 local handbook links and whitespace pass. Earlier focused passes retain their bounded source/timing; no success from an earlier source is relabelled a native result.

## Remaining boundaries

#30 retains independent paper deviations, aggregate-only book markers and resolved-marker lifetime under #7/#11/#18; real book/format integration is not implemented by this package. Supabase/cross-device acknowledgment sync stays parked. Actual ordinary Android seen-state restart/write failure/account transitions, physical phone, iOS, beta light and spoken accessibility retain #8/#16/#107 and feature acceptance. No provider/model requests, source mutation, new dependency or spending.

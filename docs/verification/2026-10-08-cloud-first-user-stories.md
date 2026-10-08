# Cloud-first decision and logbook stories: documentation checks

Date: 2026-10-08. Baseline: main `ab7db470ee507bf08ccb33ed3c2c7cb4f7384c14`. Documentation-only change; current user selects Supabase Cloud Free first, possible local migration later.

- Read current README, AGENTS, ADRs 0002/0003, technology review, reconciliation, complete comparison and Issues #1/#2/#4/#5/#7/#8.
- Read both current Flugbuch prototype instructions and rulebooks; capture reference snapshots with original/snapshot SHA-256 hashes. Replace example registrations/instructor names with synthetic values. Do not copy photos, flight exports, reference PDFs, databases, credentials or generator code.
- Check 40 relative documentation links and linked anchors against staged files plus the baseline repository tree; all resolve.
- Check 24 Markdown tables for consistent column counts; all pass. Check trailing whitespace. Preserve source snapshot bytes/newline behavior where required by provenance.
- Verify four snapshot hashes, 12 story IDs and 10 end-to-end scenario IDs. Verify ADR 0002 remains Proposed and ADR 0003 accepts only initial provider/hosting, leaving exact sync details proposed.
- Review current Supabase choice versus historical alternatives, Issue mappings, source differences, persisted-result contract and actual paper-state rules.
- Recheck official Supabase pausing, SMTP restrictions, managed-to-self-hosted migration and Docker requirements. Sources are linked in the comparison/ADR.

Limits: no runtime/device/PDF test, handwriting analysis, live Vereinsflieger retrieval, cloud provisioning, monitor installation, NUC/Pi access or paid call. Generator source/code/schema reuse remains unverified. Documentation acceptance scenarios describe required behavior, not passed tests. General SMTP delivery, pause prevention and migration continuity have not been proven.

The earlier NUC-first commit `12af7989a357bd1e3e6e01b3d7b1efb0168c59b8` was not added to main. This change is based on actual main and the subsequent Cloud-first user instruction.

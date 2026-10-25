# Sync clarity and annual-target backup — 25 October 2026

Selected by Manuel after the bounded continuation at `0779a82`: #83 presentation proposal and #29 provisional annual-target inclusion, coordinated with #34/#8. M1–M3; R01/R04/R12, FL-03/10/11, E07/E09/E11. No new dependency, provider scope, AI activation or paid execution. Beta starting versions and replacement-device identity remain unselected.

## Implementation and verification scope

Sync uses a readable attention mark and explicit Details notices; session proof/timestamp and saved receipt remain independent in Profile/Status and accessibility. Work takes precedence over old results; settled local read failure precedes failed/partial results, then advice. Local read retry does not start provider work. Quiet idle remains quiet. Existing reduced-motion, duplicate-job, safe-save/cancel and source-result boundaries remain.

Manual backup v3 contains configured targets for the selected owner/store/account across years. Restore merges explicitly archived years, including zero; other years/accounts remain untouched. v1/v2 restore skips targets. Exact validation precedes activation; the existing aggregate recovery journal and target lock guard reads/edits while a multi-file restore is pending. Per-operation original bytes remain preserved. Legacy synthetic/foreign preferences are preserved outside the selected export. Ordinary target edits continue using their existing file format and name.

Focused state/component tests cover notice priorities, Details/retry, session/age separation, foreign source advice and reduced motion. Backup tests cover scoped contents, old versions, validation, interrupted replay and target-storage locks. Independent review found and corrected a post-read restore-lock race and a stale error after successful subscribed reload. Host and native results are recorded after the combined checkpoint below; implementation alone does not establish acceptance.

The Development target-file witness uses only fixed synthetic identities and restores its original fixture bytes. It exercises native target storage, not ordinary owner-registry/SAF/full-user replacement-device recovery. The synthetic Sync preview exercises presentation without provider retrieval. Prior source-specific live evidence is reused only within its recorded limits.

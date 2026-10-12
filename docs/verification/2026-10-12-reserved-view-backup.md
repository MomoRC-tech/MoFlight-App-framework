# Reserved provider backup and temporary export settings

Date: 2026-10-12, Europe/Berlin. Baseline clean local/remote main `eafafe9`. Manuel explicitly reserves `MoFlight App user view backup` as the only named configuration MoFlight manages and authorizes overwriting it when needed. [Contract](../architecture/vereinsflieger-view-preservation.md#reserved-configuration-policy--2026-10-12). Earlier collision refusal evidence remains in the [prior report](2026-10-11-vereinsflieger-view-preservation.md); it explains the superseded policy.

## Implemented policy

Journal the actual current supported settings before saving. Refresh the reserved name whether absent or already present, reload it and verify full supported readback. Account display continuity and actual-view equality still gate saving. Installation ownership metadata is no longer read/written; old tables are left intact. Existing version-2 recovery payloads remain unchanged and readable. Pending recovery blocks new exports and backup replacement; restore/verify never saves over a backup.

After backup verification, reset to unnamed active configuration and configure export there. No named export preset is selected, repaired, saved or deleted. Every later export command rejects named active state and changed display context before mutations. New captured snapshots truthfully carry unnamed label `Konfiguration laden` and adapter version 2; historical version-1 named snapshots remain readable. All other pagination, raw-data, scope and persistence guards remain.

## Checks before native trial

Strict TypeScript and all 97 mobile tests pass. Tests cover reserved-name refresh without ownership, a same-name configuration appearing after snapshot, absent/changed original refusal, changed-account refusal, pending-journal replacement/stale-cleanup refusal with real SQLite restart, ignored legacy ownership, temporary reset despite existing export presets, named-view mutation refusal and old/new snapshot compatibility. Git whitespace passes. Python/domain calculations were not changed; no new Python result is claimed.

Native build and live backup/export/restore trial remain pending at this documentation checkpoint. GitHub fast/checkpoint jobs have recently been refused by account billing/spending restrictions; local results do not count as hosted acceptance. Stable account identity, complete page-preference proof, interruption/account-switch matrix and iOS remain open. No LLM execution or private flight/photo/database evidence is committed.

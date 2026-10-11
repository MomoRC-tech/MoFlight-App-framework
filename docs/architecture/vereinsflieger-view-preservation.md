# Preserve the user's provider view during export

Date: 2026-10-11. User proposal under review, following the filter-first implementation. This is a design assessment, not acceptance of a completed restoration implementation.

## Live evidence

The active personal-list column configuration, period and participation survive opening a fresh authenticated desktop tab. Leaving the export configuration active therefore changes the user's subsequent provider experience.

Reselecting the existing `Flugbuch Export` preset changed the customized active 48-column layout to its saved 24-column definition, selected `Das letzte Jahr` and `Pilot`. A preset name does not describe the full current state. Simply remembering and reselecting that name would discard unsaved customizations. The saved configuration demonstrably carries period/participation as well as columns; a newly created backup still needs round-trip checks for filters, sorting and page preferences.

The original provider management UI offers **Aktuelle Konfiguration Speichern unter**, **Speichern**, and existing configurations with **Anwenden** and **Löschen**. No separate update control was observed. Same-name save behavior has not been exercised; do not assume it replaces an earlier backup safely. The quick selector offers **Zurücksetzen**. Default detection and the full scope of reset are not yet proven.

The earliest observed 40-column customized layout was restored in the desktop investigation, with the explicit 2026 period and `Pilot oder Fluglehrer` used before this preservation check. The saved `Flugbuch Export` definition was not overwritten. Earlier pre-investigation date/participation settings were not journaled, so their exact restoration is not claimed. Private screenshot proof is outside Git.

## Recommended provider-managed backup flow

1. Resolve any outstanding recovery for this provider account before starting another export. Never replace an unresolved original-view backup.
2. Observe the actual current configuration, including unsaved customization. Confirm whether it is genuinely the complete default state. An unnamed configuration or default-looking columns alone is insufficient.
3. For a custom state, save the actual current configuration as `MoFlight App user view backup` using the provider's normal controls. Verify creation and retain a local recovery marker before changing settings. Establish safe same-name reuse behavior first; never delete or overwrite an unrelated/user-owned configuration because its name happens to match.
4. Load/repair the export configuration, explicitly select the requested period and `Pilot oder Fluglehrer`, and capture all pages.
5. In cleanup after success, cancellation or failure, load the user-view backup; for a verified complete default state, use `Zurücksetzen`. Read back the restored settings and compare with the original evidence. Restore any settings that the preset/reset round trip does not preserve separately.
6. Clear the recovery marker only after verified restoration. Network loss, expired login, a changed account or process termination must leave a visible pending-recovery state. A captured export and restored preferences are separate outcomes. A new export must not replace unresolved recovery evidence.

Keeping one reusable provider backup is simpler than creating a growing collection. Retaining the latest backup also offers manual recovery after interruption. Its saved name becoming the active label is acceptable only if the actual user settings match; restoring the former display label without discarding unsaved settings may require separate handling.

## Remaining proof

Round-trip a newly saved backup with distinctive synthetic/authorized preferences: ordered columns, a restrictive text/checkbox filter, sorting, custom and relative periods, each participation scope and unchanged rows per page. Check existing-name save behavior and how the provider signals the genuine default state. Exercise reset only after a recoverable backup exists. Then implement and test the simpler verified backup/reset path, with durable cleanup ownership and no automatic restoration into a different account. The direct-setting replay draft remains unpublished; it is not the selected final design or native acceptance evidence.

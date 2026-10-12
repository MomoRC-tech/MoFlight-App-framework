# Preserve the user's provider view during export

Date: 2026-10-11. Provider-managed backup/reset is now implemented in the bounded access lab following desktop contract checks. Native/live-driver acceptance remains open. The earlier assessment below is retained as dated design evidence; the implementation section controls current behavior.

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

The initial proposal's proof list below was partially executed in this continuation. [Current evidence and limits](../verification/2026-10-11-vereinsflieger-view-preservation.md) separate desktop provider observations, synthetic tests and native acceptance.

Continuation checkpoint, 2026-10-11: local/remote `main` verified at `cd69e70`; unpublished replay files retained for adaptation. A fresh dedicated authenticated desktop tab created `MoFlight App user view backup`. Loading the older export definition and then the new backup restored the original 40-column order, explicit 2026 range and `Pilot oder Fluglehrer`. An app-created proof configuration round-tripped a restrictive aircraft-type text filter, a deselected launch-method checkbox, descending aircraft-type sorting and `Das letzte Jahr`. Saving the same proof name reports **aktualisiert** and updates its definition; automatic same-name saving therefore requires durable app ownership, never name-only ownership. One proof name was shortened by the provider; created names must be read back exactly.

Reset from that proof cleared sorting/restrictions, selected `Pilot`, `Das letzte Jahr`, the `Konfiguration laden` placeholder and ordered columns `1,2,3,4,5,6,7,8,9,10,105,11,12,13,14,15`. This is one observed default signature, not a universal guarantee. Default detection must compare the complete observed settings and fail conservatively to backup. Rows-per-page were left unchanged (100 observed); no global page-size preference mutation was tested. Desktop observations are not native acceptance.

Round-trip a newly saved backup with distinctive synthetic/authorized preferences: ordered columns, a restrictive text/checkbox filter, sorting, custom and relative periods, each participation scope and unchanged rows per page. Check existing-name save behavior and how the provider signals the genuine default state. Exercise reset only after a recoverable backup exists. Then implement and test the simpler verified backup/reset path, with durable cleanup ownership and no automatic restoration into a different account. The direct-setting replay draft remains unpublished; it is not the selected final design or native acceptance evidence.

## Implemented lab workflow

`view.ts` replaces the replay draft. It captures ordered columns, supported text/checkbox/operator states, sort indicators, displayed period/participation and account context. Default recognition requires the observed complete default signature, clear supported filters and no sort; an unnamed customized state uses backup. It does not replay unused hidden date defaults. `view-store.ts` persists an exact recovery payload before mutations and local ownership of the verified app-created backup. Pending recovery cannot be overwritten; old/invalid journal formats block exports.

For custom settings, save under the app backup name only when absent or locally owned by the same observed account context. Reload that backup and verify actual settings before export; do not infer save success from its name. Provider same-name saving updates definitions. Settings changed while a preset is active also appeared to be remembered under it, so export must leave the backup first. When no export preset exists, use the normal reset control after verifying the backup, then build the export view. No automatic deletion of provider presets is performed.

The current-document name/ownership guard is checked again immediately before backup save, after the original-view journal write. Every subsequent export command compares the journaled account display context before changing provider controls; host readback checks remain independent. These guards prevent observed-label changes and newly appearing unowned name collisions from reaching mutations. They do not establish stable account identity or detect deletion/recreation under an already owned name.

Snapshot refusal has fixed, bounded diagnostic reasons: unowned backup-name collision, unavailable account/list/configuration controls, unsupported filter controls and header/column mismatch. Host source/token/phase validation precedes reason decoding; unknown reasons become a generic fixed verdict. No provider exception text or raw field values are shown. A diagnosis does not adopt an existing provider configuration or relax recovery verification.

After capture saving, cancellation or error, load the backup or reset a verified default and compare full supported readback. A pre-mutation cancellation can verify the unchanged original. Only then clear the exact journal. Network/expiry/interruption or changed display context keeps visible recovery and blocks new exports. Captured data and restored preferences are separate outcomes. Recovery stays available after restart; cancellation is disabled during local writes/cleanup.

Columns, filters/operators, sort and displayed date/participation are verified; global rows-per-page are not changed by this workflow. Former preset label may become the backup label. Account protection is still display-context continuity, not a stable verified identity; equal labels and deletion/recreation of an app-owned name remain limitations. Production user-safety and full native acceptance cannot be claimed from these checks. Run the evidence report's native cases before handoff.

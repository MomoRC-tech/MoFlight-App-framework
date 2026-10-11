# Verified personal-list export workflow

Date: 2026-10-11, Europe/Berlin. User-authorized implementation; tracking [#2](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/2), discovery [#10](https://github.com/MomoRC-tech/MoFlight-App-framework/issues/10). This replaces mandatory per-flight detail traversal in the native access lab. Canonical import, production identity/multiple-book schema and AI execution remain separate.

Preservation correction under review: active provider settings persist across visits. The initial published filter slice does not yet restore the user's original view and must not be treated as the final user-safe retrieval flow. See the [provider backup/reset proposal and observed limitations](vereinsflieger-view-preservation.md). Restoration work is not yet published or natively accepted.

## Retrieval contract

`src/vereinsflieger/export.ts` contains the native command/decoder and standalone DOM-driver contract. `AccessProbe.tsx` uses it instead of the old default-list reader. The historical reader remains for legacy regression checks, not the active Retrieve flights path.

Each retrieval opens a fresh personal flightbook in the original-provider WebView session. Default dates are January 1 to December 31 of the device's current year, with editable inclusive YYYY-MM-DD bounds. This requests a calendar window, not lifetime history. Invalid/reversed dates fail before navigation. Provider navigation remains visible in this lab; the later hidden-navigation product flow remains open.

The driver verifies these phases:

1. Prefer an existing `MoFlight App export filter`, then `Flugbuch Export` (also accepting the user's lower-case spelling). Select it through the observed quick-configuration change handler. If absent, prepare the current configuration for a new `MoFlight App export filter`.
2. Inspect available/visible columns. Move every data column into the visible list using normal selection/arrow controls. Exclude observed presentation IDs 150 (Seitenanfang) and 151 (page subtotals); remove them if visible. Apply through the provider form and read back on the next document. Unknown future columns remain raw within explicit limits. Missing/changed contracts stop retrieval.
3. Clear restrictive column filters through the normal list-filter form and verify readback. Unrestricted observed checkbox groups have every option selected; text filters are blank.
4. Save the app-named preset only if absent. Existing saved named definitions are not overwritten: the active configuration is repaired and rechecked each run. A matching preset name alone never proves its columns. Global rows-per-page preferences are not changed.
5. Select `Pilot oder Fluglehrer` through its freshly rendered link and verify the label. This is the requested provider participation scope, not inferred legal credit.
6. Submit the rendered custom-period POST form with start/end and `daterange=date`. Use normal submit behavior and the current signed action; do not guess/persist signed templates. Verify returned `ab DD.MM.YYYY bis DD.MM.YYYY`.
7. Read aligned headers/raw cells/column IDs directly. Preserve `row<id>` references even where permitted rows lack detail links. Present view/edit IDs must agree with the row ID. No detail/edit link is followed.
8. Follow only the rendered sequential same-origin personal-list page link. On every page verify contiguous first/last/total record ranges, unchanged columns/account context, selected preset/period/participation and clear filters. Reject gaps, repeats, changed counts, conflicting references, missing next links and unsupported markup. Provider-marked duplicates with distinct references retain their flags; record count is not legal flight count.
9. Stage in memory and save one new raw snapshot only after the complete requested list validates. Errors/interruption/cancel cannot replace the previous capture. A verified empty period saves empty context; login/error pages never do. Offline opening uses saved data.

Run state lives in the native host, not webpage storage. Commands have fresh tokens matched to phase, sender origin and independently observed top-level document. Late deliveries are ignored. The export driver does not read credentials, cookies, browser storage, arbitrary scripts or private runtime objects. Form targets and participation/pagination links must remain on the same-origin personal flightbook. Each load/command has a 30-second timeout; Cancel discards staging. No automatic re-login/retry loop is added.

## Storage and interpretation

The existing isolated SQLite capture table remains unchanged. Historical snapshots without export context remain readable with legacy limited coverage. New snapshots use `coverage: complete-requested-list` plus requested dates, preset, participation, displayed account/club context, record/page counts, ordered column IDs and adapter version. Display context detects continuity changes; it is not a stable verified account ID. Source identity/time basis remain unverified. The isolated lab database is not production account isolation or multiple-book persistence.

All configured data cells, including unmapped columns, remain raw. The inspector additionally exposes costs/billing, guest/landing fees, duty/check-in/check-out, tow/winch and permission fields. `Eigene Kosten (Bezahlt)` keeps its original label/value; it is not automatically total expenditure, a paid invoice, a charge breakdown or parsed EUR. Blank is not zero; meter units and legal roles are not guessed.

Results use a virtualized native list. Explicit bounds: 128 configured columns, 1,000 rows/page, 20,000 records/window, 4,100 navigation/command attempts, 4,096 characters/cell, 2,000,000 serialized characters/bridge response and 20,000,000/staged run. Exceeding a bound fails visibly, preserves prior captures and calls for a narrower period; no truncation. Reference tracking uses a Set and staged size accumulates per page rather than repeatedly serializing prior pages.

Details/catalogue reads are optional future enrichment for charge breakdowns, audit fields, missing facts or verified units. List coverage alone does not prove field semantics or complete powered/TMG mapping. [Evidence and remaining native acceptance](../verification/2026-10-11-vereinsflieger-filter-export.md).

# Components, symbols and shapes

[Handbook entry point](README.md). This catalogue records current implementation and approved use. The portable guide includes schematic examples; source values and native evidence remain authoritative. Example labels/data are synthetic.

## Component map

| ID | Component / shape | Geometry / presentation | Function / source |
| --- | --- | --- | --- |
| C01 | Content card | Gradient panel, radius 14, border 1, padding 11 | Group coherent facts/actions; pressable only with an action. theme Card. |
| C02 | Primary / secondary action | Blue or raised bordered face, radius 16, minimum height 48 | Explicit action label; disabled opacity .5, pressed .72. theme Action. |
| C03 | Scope chip | Radius 20; face minimum 66 × 34 in a minimum-48-height target | Selected blue gradient; selected/disabled semantics. theme Chip. |
| C04 | Search / input | Search radius 22; profile radius 12 and font 16; provider radius 10 | Operate on named scope. MobileApp / ProfileSettings / ProviderConnection. |
| C05 | Shared header | Fixed photo/shade, logo 52, title 18/24, controls 48; content minimum height 64 and padding 10/5 | Header can grow; minimum is not universal actual height. AppHeader. |
| C06 | Header status group | Connection circle, growing Med, profile circle; gap 4 | Back replaces logo on app overlays. AppHeader / MedicalStatus / ShellIcons. |
| C07 | Bottom navigation | Attached dark bar, five equal targets, minimum height 60 | Icon above German label; cyan selected state. MobileApp. |
| C08 | Overlay / provider panel | Current dark full app overlay with one active header; provider has its own toolbar/history | Different from pale v0.30 prototype sheets. MobileApp / ProviderConnection. |
| C09 | Flight row | Padding 7, radius 13; no-track tile, route/time/role and detail chevron | Whole row opens saved facts. MobileApp FlightRow. |
| C10 | AI question / composer | Question radius 12; composer radius 20; send face 42 × 42; input max height 150 | Local questions calculate deterministically; free-text service unavailable. MobileApp. |
| C11 | Paper hero / action face | Orange-accent photo card, minimum height 144; normal hero height 154; CTA radius 15 | Opens reconciliation/writing tools, not automatic import or copied-entry confirmation. Dashboard. |
| C12 | Season ring | Diameter 62, thickness 6, aircraft segments, central value/label | Whole season card opens current-year flights. SeasonRing / season-model. |
| C13 | Badges / disclosures | Role pill radius 12; session badge minimum 16; details + / − | Role, session evidence and expansion remain separate meanings. MobileApp / ProviderConnection. |

Sources: [theme](../../../apps/platform-lab/src/mobile/theme.tsx), [MobileApp](../../../apps/platform-lab/src/mobile/MobileApp.tsx), [Dashboard](../../../apps/platform-lab/src/mobile/Dashboard.tsx), [AppHeader](../../../apps/platform-lab/src/mobile/AppHeader.tsx), [ProviderConnection](../../../apps/platform-lab/src/mobile/ProviderConnection.tsx), [MedicalStatus](../../../apps/platform-lab/src/mobile/MedicalStatus.tsx), [ProfileSettings](../../../apps/platform-lab/src/mobile/ProfileSettings.tsx) and [SeasonRing](../../../apps/platform-lab/src/mobile/SeasonRing.tsx).

## State presentation

| State | Current treatment / meaning |
| --- | --- |
| Default | Name the action/destination. Decorative submarks do not become nested controls. |
| Pressed | Shared controls use opacity .72; not selection or completion. |
| Selected | Chip fill and tab icon/label change; expose selected state. Med exposes selected while its sheet is active. |
| Disabled | Action .5 / Chip .45; blank send dims; existing guards block pressing. |
| Busy | Indeterminate spinner plus named operation and accessible busy wording where implemented. Preserve Cancel/Close distinctions. |
| Unknown | Neutral ?, unknown text or —; Medical remains Med / unbekannt. |
| Attention / error | Specific text and connection !; retain data/draft and applicable retry. |
| Empty / unavailable | Explain missing source/results without invented values or success styling. |
| Expanded / collapsed | + / − with expanded state; opening a disclosure alone executes no work. |
| Focus | Preserve semantic role, label and order. No universal authored native focus ring exists; keyboard/screen-reader focus remains a review gate. |

## Symbol ownership

The [51-entry catalogue](../symbol-reference.html) is the detailed meaning/function reference. [symbols.json](symbols.json) is its maintained source; both the compatibility catalogue and combined guide are generated from it. Keep N/H/S/D/K/A/T/X/B identifiers stable during redesigns.

Separate semantic roles even when characters repeat: a right arrow can mean route direction, continue or login required; a tick can mean selected book or previous session confirmation. Assess artwork size, optical balance, stroke and effective touch area separately.

Preserve approved side-view aircraft B and Thermik branding until a replacement is explicitly selected. Editable masters stay beside original assets; the app retains its current aircraft bitmap. No icon runtime/library is introduced.

[Style Option 2: Modern Duotone & Soft-Filled Glyphs](icon-options/option-2/index.html) is an authorized alternate design for review, with 40 editable vector masters and an explicit mapping of all 51 IDs. It preserves the selected aircraft, branding, data/text semantics and current app implementation. [Source notes and fidelity limits](icon-options/option-2/README.md) distinguish reference interpretation from pixel identity and application selection.

## Schematic examples

The combined HTML presents C01–C13 shapes/states alongside these rules: neutral Medical/session status, selected chips, disabled action, no-track/empty placeholder and illustrative distribution ring. These examples execute no app/provider operation and establish no native acceptance. Use a concrete example to discuss a proposed change, then verify the implemented control in context.

# Physical Android phone smoke checklist — 16 October 2026

**Purpose:** a 5–10 minute, manual check of the phone-compatible demo APK after installation on a physical device. The APK is a native four-tab shell backed by an opt-in synthetic library. This check does not establish live Vereinsflieger, club, weather or backend AI functionality.

## Record before starting

- Device model: **PENDING**
- Android version: **PENDING**
- Candidate APK: **MoFlight-demo-arm64.apk**, MoFlight Lab **0.1.0** / versionCode **1**, source `2090f7942f6962d3fd32bc72c9b6ba0fa1616c97`; application code unchanged from native-tested `b1d806a`. Installed version: **PENDING**
- Candidate APK SHA-256: `ca2970dd34c99e7dd70722066cc1bb2762f8e2abd10e00ab4db2d3601c161e65`. Confirm installed file: **PENDING**. Requires an ARM64-capable Android phone with API 24 / Android 7.0 or later; phone compatibility remains unconfirmed.
- Display resolution, density, logical width/height in dp, and font scale: **PENDING**
- Test date and tester: **PENDING**

Do not clear app storage, uninstall an existing installation, reset the device, or alter provider/account data. Use only the visible in-app synthetic fixture controls. If the app already contains personal data, stop before loading a fixture or changing books.

## Steps and observations

Mark each **PASS / FAIL / NOT RUN** only after doing it; add a brief note for failures. All results start **PENDING**.

| # | Action (about 1 minute each) | Expected observation | Result / note |
|---|---|---|---|
| 1 | Launch the installed demo APK. If no synthetic data is present, tap the header gear (**Entwicklungswerkzeuge öffnen**) → **Open multiple-logbook lab** → **Load four synthetic books**; choose **Open book: Gliding volume A**, then return with **Close multiple-logbook lab** and **‹ Zurück**. | App opens to **Übersicht** and shows the paper-logbook card **Papierflugbuch aktualisieren**. Fixture setup stays inside visible UI. | PENDING |
| 2 | Visit the four bottom tabs: **Übersicht**, **Flüge**, **Verein**, **AI**. | Each screen opens; tab labels and primary content fit and remain usable. | PENDING |
| 3 | In **Flüge**, inspect the list, tap a saved flight row, then return with **‹ Zurück**. | **Flugdetails** opens for the selected saved flight and returns to the list. | PENDING |
| 4 | Tap **Schulung**. Then tap **Alle**, focus **Flüge durchsuchen**, enter `NO-SUCH-FLIGHT`, and dismiss the keyboard. | Training filter selects; the query produces **Keine passenden Flüge** and the keyboard does not hide the result or navigation controls. | PENDING |
| 5 | Return to **Übersicht** and tap **Papierflugbuch aktualisieren**. Close the lab without making changes. | Existing synthetic multiple-logbook paper workflow opens; return to the dashboard works. | PENDING |
| 6 | In **AI**, tap **Wie viele Flugstunden habe ich dieses Jahr?**. Then try **Nachricht senden** and **Erneut versuchen**. | Local card reports **Deterministisch berechnet** without claiming generated AI. Free-form request reports **Deine Frage wurde nicht gesendet** and retry/unavailable state; this indicates backend AI is unavailable, not a failed local calculation. | PENDING |
| 7 | On the phone, temporarily enlarge system font and rotate to landscape; inspect **Übersicht**, **Flüge** and **AI**, including the search/composer keyboard if practical. Restore the original font and orientation afterward. | Text and actions remain reachable by scrolling; no critical overlap or clipped controls. Record actual dp width and font scale for each observed configuration if available. | PENDING |
| 8 | With no unsaved work, enable Airplane mode using Android Quick Settings, force-stop MoFlight from Android App info (do not clear storage), then reopen it. | App opens offline; the synthetic flight library remains visible. Turn Airplane mode off after the check. | PENDING |

## Outcome

- Overall physical-device result: **PENDING**
- Failures / follow-up: **PENDING**
- Screenshots or evidence location (optional): **PENDING**

This checklist is based on the existing visible-UI native workflow in `scripts/android_mobile_ui_smoke.py` and the [UI width-matrix report](2026-10-16-ui-fidelity-width-matrix.md). Existing emulator evidence does not count as a physical-device result. Device architecture compatibility remains **unknown until the phone model and installed APK are recorded**. Do not enter provider credentials; none are needed for these synthetic checks.

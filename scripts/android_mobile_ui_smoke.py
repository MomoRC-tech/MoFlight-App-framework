"""Five-tab committed-source native trial; dedicated synthetic emulator only.

Uses visible UI, never injects databases or accesses a provider session. Adds the
existing opt-in synthetic book fixture through its ordinary lab action. Does not
clear app data. Records screenshots and restores display/network settings.
"""
import argparse
import json
import time
from pathlib import Path
from android_smoke import Smoke, PACKAGE


def tab(smoke, title):
    node = next(n for n in smoke.dump() if n.get('content-desc') == title and n.get('clickable') == 'true')
    smoke.tap_node(node)


def top(smoke):
    for _ in range(8):
        smoke.swipe(up=False, duration=80)


def launch(smoke):
    smoke.shell('am', 'force-stop', PACKAGE)
    smoke.shell('am', 'start', '-W', '-n', f'{PACKAGE}/.MainActivity')
    # am start -W precedes React Native readiness; discard a retained previous activity tree.
    smoke.find('Papierflugbuch aktualisieren', attempts=40)
    smoke.find('Übersicht', exact=True, attempts=40)
    smoke.find('Profil & Einstellungen öffnen', attempts=40)


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == 'MoFlight_Synthetic_API37'
    smoke.emulator = True
    smoke.report['boundary'] = 'Synthetic native five-tab UI. Existing fixture loaded by UI; no live provider, AI, weather, club backend, device or iOS acceptance.'
    smoke.report['device'] = {k: smoke.shell('getprop', k) for k in ['ro.build.version.sdk', 'ro.product.model', 'ro.product.cpu.abi']}
    smoke.shell('wm', 'size', '390x900')
    smoke.shell('wm', 'density', '160')
    smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
    launch(smoke)
    smoke.find('Papierflugbuch aktualisieren')
    smoke.record('home-native-initial')
    smoke.tap('Profil & Einstellungen öffnen')
    smoke.tap('Entwicklungswerkzeuge öffnen', scroll=True)
    smoke.find('Remembered state loaded.', attempts=40)
    smoke.tap('Open multiple-logbook lab')
    smoke.find('Synthetic pilot library loaded.', attempts=40)
    smoke.tap('Load four synthetic books')
    smoke.find('Four synthetic books and explicit routing loaded.', attempts=40)
    if not any('Selected: Gliding volume A' in smoke.labels(n) for n in smoke.dump()):
        smoke.tap('Open book: Gliding volume A')
    smoke.tap('Close multiple-logbook lab')
    smoke.tap('‹ Zurück')
    smoke.find('Papierflugbuch aktualisieren')
    top(smoke)
    smoke.record('home-selected-book-data')
    tab(smoke, 'Flüge')
    smoke.find('Flüge durchsuchen')
    smoke.find('D-EX', scroll=True)
    top(smoke)
    smoke.record('flights-native-list')
    row = next(n for n in smoke.dump() if n.get('content-desc', '').endswith('Details öffnen') and n.get('clickable') == 'true')
    smoke.tap_node(row)
    smoke.find('Flugdetails')
    smoke.record('saved-flight-details')
    smoke.tap('‹ Zurück')
    smoke.tap('Schulung')
    smoke.record('flights-training-filter')
    smoke.tap('Alle')
    node = smoke.find('Flüge durchsuchen')
    smoke.tap_node(node)
    smoke.shell('input', 'text', 'NO-SUCH-FLIGHT')
    smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
    smoke.find('Keine passenden Flüge', scroll=True)
    smoke.record('search-empty-result')
    top(smoke)
    smoke.tap('Flugfilter öffnen')
    smoke.tap('Filter zurücksetzen')
    smoke.tap('Strecke ⓘ')
    smoke.find('Klassifikation nicht verfügbar')
    smoke.tap('‹ Zurück')
    tab(smoke, 'Verein')
    smoke.find('Keine Dienste verfügbar')
    smoke.record('club-native-overview')
    smoke.tap('Termine')
    smoke.find('Keine Termine verfügbar')
    smoke.record('club-events-unavailable')
    smoke.tap('Dienste')
    smoke.find('Keine Dienste verfügbar')
    smoke.tap('Mitteilungen')
    smoke.find('Keine Mitteilungen verfügbar')
    tab(smoke, 'AI')
    smoke.find('Dein Segelflug-Assistent')
    smoke.record('ai-native-overview')
    smoke.tap_node(smoke.find('Wie viele Flugstunden habe ich dieses Jahr? Lokal auswerten', exact=True))
    smoke.find('Deterministisch berechnet', scroll=True)
    smoke.record('ai-local-query-without-generated-answer')
    smoke.tap('Nachricht senden', scroll=True)
    smoke.find('Deine Frage wurde nicht gesendet', scroll=True)
    smoke.tap('Erneut versuchen')
    smoke.record('ai-unavailable-retry-preserves-draft')
    tab(smoke, 'Übersicht')
    top(smoke)
    smoke.tap('Papierflugbuch aktualisieren')
    smoke.find('Multiple-logbook lab')
    smoke.record('paper-workflow-open')
    smoke.tap('Close multiple-logbook lab')
    smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
    smoke.shell('svc', 'wifi', 'disable')
    launch(smoke)
    tab(smoke, 'Flüge')
    smoke.find('D-EX', scroll=True)
    smoke.record('offline-force-stop-local-library-survives')
    smoke.shell('wm', 'size', '360x900')
    smoke.shell('settings', 'put', 'system', 'font_scale', '1.4')
    launch(smoke)
    smoke.record('home-narrow-enlarged-text')
    tab(smoke, 'Flüge')
    smoke.record('flights-narrow-enlarged-text')
    tab(smoke, 'AI')
    smoke.record('ai-narrow-enlarged-text')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, default=Path('local-data/android-mobile-ui'))
    args = parser.parse_args()
    smoke = Smoke(args.output, args.serial, 'MoFlight_Synthetic_API37')
    try:
        execute(smoke)
    except Exception as error:
        smoke.finish('failed', error)
        raise
    else:
        smoke.finish('passed')
    finally:
        if smoke.emulator:
            smoke.shell('wm', 'size', 'reset')
            smoke.shell('wm', 'density', 'reset')
            smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
            smoke.shell('cmd', 'connectivity', 'airplane-mode', 'disable')
            smoke.shell('svc', 'wifi', 'enable')


if __name__ == '__main__':
    main()

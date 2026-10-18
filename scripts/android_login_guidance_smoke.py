"""Non-destructive, offline login presentation checks on a fresh dedicated AVD.

Never resets an app, reads a database or signs into a provider. The two existing
provider/synthetic AVDs are explicitly outside this harness's target contract.
"""
import argparse
import time
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch
from android_mobile_shell_smoke import viewport
from android_mobile_width_matrix import bounds, capture, finish, native_keyboard_top

AVD = 'MoFlight_LoginUX_API37'
DETAILS = 'Sitzungsdetails und weitere Optionen'
LAB = 'Entwicklungswerkzeuge für Rohbelege'


def control(smoke, label, *, exact=True, enabled=None):
    try:
        return smoke.find(label, exact=exact, enabled=enabled, attempts=1)
    except AssertionError:
        # Optional sections can retain scroll position after a collapse.
        for up in (False, True):
            try:
                return smoke.find(label, exact=exact, enabled=enabled, scroll=True, up=up, attempts=8)
            except AssertionError:
                pass
        raise AssertionError(f'Missing connection control: {label}')


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Emulator required'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD, 'Fresh dedicated AVD required'
    smoke.emulator = True
    original = viewport(smoke)
    smoke.report.update(boundary='Offline presentation only. No live provider, credentials, capture, clearing, private data, physical phone or iOS.',
                        avd=AVD, original=original)
    try:
        smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        smoke.shell('svc', 'wifi', 'disable')
        smoke.shell('svc', 'data', 'disable')
        for _ in range(20):
            network = {key: smoke.shell('settings', 'get', 'global', key) for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
            if network == {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}:
                break
            time.sleep(.25)
        assert network == {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}
        smoke.report['network'] = network
        for width, height, font in [(360, 900, 1.0), (390, 900, 1.0), (600, 1100, 1.0), (360, 900, 1.4), (840, 412, 1.0)]:
            smoke.shell('wm', 'size', f'{width}x{height}')
            smoke.shell('wm', 'density', '160')
            smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
            launch(smoke)
            smoke.tap_node(smoke.find('Verbindungen öffnen'))
            smoke.find('Sitzung ungeprüft', exact=True)
            main = smoke.find('Bei Vereinsflieger anmelden', exact=True, enabled=True)
            assert not any('Gespeicherte Anmeldung verwenden' in Smoke.labels(node) for node in smoke.dump())
            for label in (DETAILS, LAB):
                node = control(smoke, label)
                x1, y1, x2, y2 = bounds(node)
                assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
                assert y2 - y1 >= 48
            assert bounds(main)[3] <= bounds(control(smoke, DETAILS))[1], 'Main action overlaps details'
            capture(smoke, f'collapsed-{width}-{height}-font-{font}', viewport(smoke))

        # Optional controls remain reachable without starting them.
        smoke.shell('wm', 'size', '390x900')
        launch(smoke)
        smoke.tap_node(smoke.find('Verbindungen öffnen'))
        smoke.tap_node(control(smoke, DETAILS))
        control(smoke, 'Gespeicherte Anmeldung verwenden')
        control(smoke, 'Lokale Anbietersitzung löschen')
        control(smoke, 'Gespeicherte Zugangsdaten vergessen')
        capture(smoke, 'optional-controls-reachable', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        smoke.tap_node(smoke.find('Verbindungen öffnen'))
        assert not any('Gespeicherte Anmeldung verwenden' in Smoke.labels(node) for node in smoke.dump())
        capture(smoke, 'close-reopens-collapsed', viewport(smoke))

        # Existing date input exercises keyboard/scrolling without retrieval.
        smoke.tap_node(control(smoke, LAB))
        entry = control(smoke, 'Vereinsflieger Abruf von')
        smoke.tap_node(entry)
        for _ in range(10):
            try:
                keyboard, source = native_keyboard_top(smoke.shell('dumpsys', 'window'), 390, 900)
                break
            except AssertionError:
                time.sleep(.5)
        else:
            raise AssertionError('Keyboard geometry not observed')
        entry = control(smoke, 'Vereinsflieger Abruf von')
        assert bounds(entry)[3] <= keyboard, 'Focused date input covered by keyboard'
        smoke.find('Rohdaten abrufen', enabled=False, scroll=True, attempts=8)
        smoke.report['keyboard'] = {'top': keyboard, 'source': source}
        capture(smoke, 'raw-lab-keyboard-no-retrieval', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')

        # Offline page loading fails quickly and hides the original-page frame.
        # Provenance/loading guard is host-tested; do not claim live-page proof.
        smoke.tap_node(control(smoke, 'Bei Vereinsflieger anmelden'))
        control(smoke, 'Die Anbieterseite konnte nicht geladen werden.')
        capture(smoke, 'offline-page-failure', viewport(smoke))
        smoke.tap_node(control(smoke, 'Sitzung prüfen', enabled=True))
        control(smoke, 'Sitzung konnte nicht geprüft werden')
        control(smoke, 'Erneut prüfen')
        capture(smoke, 'offline-error-next-action', viewport(smoke))
    finally:
        # Only this fresh AVD is affected. Keep radios off and stop the app so
        # no provider navigation can run after the trial. Never clear app data.
        smoke.shell('am', 'force-stop', PACKAGE)
        smoke.shell('wm', 'size', f"{original['width_px']}x{original['height_px']}")
        smoke.shell('wm', 'density', str(original['density_dpi']))
        smoke.shell('settings', 'put', 'system', 'font_scale', str(original['font_scale']))
        smoke.report['final'] = {'display': viewport(smoke), 'app': 'stopped', 'radios': 'off'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    smoke = Smoke(args.output, serial=args.serial, expected_avd=AVD)
    try:
        execute(smoke)
    except Exception as error:
        finish(smoke, 'failed', error)
        raise
    finish(smoke, 'passed')

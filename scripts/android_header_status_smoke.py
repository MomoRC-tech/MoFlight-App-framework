"""Non-destructive offline header/navigation trial on the dedicated LoginUX AVD.

No app reset, provider sign-in, credentials, captures, database reads or seeding.
The two AVDs that may hold personal sessions are rejected before any mutation.
"""
import argparse
import time
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch, tab
from android_mobile_shell_smoke import viewport
from android_mobile_width_matrix import bounds, capture, finish, native_keyboard_top
from android_login_guidance_smoke import control

AVD = 'MoFlight_LoginUX_API37'
PROFILE = 'Profil & Einstellungen öffnen'
BACK = 'Zur vorherigen App-Ansicht'
CLOSE = 'Verbindungen schließen und zur App zurückkehren'


def active_header(smoke, width, height, *, back=False):
    nodes = smoke.dump()
    connection = [n for n in nodes if n.get('clickable') == 'true'
                  and 'Verbindungen öffnen' in n.get('content-desc', '')]
    profile = [n for n in nodes if n.get('content-desc') == PROFILE]
    assert len(connection) == len(profile) == 1, 'Expected one reachable active status group'
    controls = [connection[0], profile[0]]
    if back:
        previous = [n for n in nodes if n.get('content-desc') == BACK]
        assert len(previous) == 1, 'Expected one contextual Back'
        controls += previous
    for node in controls:
        x1, y1, x2, y2 = bounds(node)
        assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
        assert x2 - x1 >= 48 and y2 - y1 >= 48, 'Header control below 48 dp'
    assert bounds(connection[0])[2] <= bounds(profile[0])[0], 'Status controls overlap'
    return connection[0]


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Emulator required'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD, 'Dedicated LoginUX AVD required'
    smoke.emulator = True
    original = viewport(smoke)
    smoke.report.update(avd=AVD, original=original,
                        boundary='Offline header/navigation only; no Medical, live provider, credentials, captures, resets, data seeding, private reads, physical phone or iOS.')
    try:
        smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        smoke.shell('svc', 'wifi', 'disable')
        smoke.shell('svc', 'data', 'disable')
        for _ in range(20):
            network = {k: smoke.shell('settings', 'get', 'global', k) for k in ('airplane_mode_on', 'wifi_on', 'mobile_data')}
            if network == {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}:
                break
            time.sleep(.25)
        assert network == {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}
        smoke.report['network'] = network
        for width, height, font in [(360, 900, 1.0), (390, 900, 1.0), (412, 900, 1.0),
                                    (600, 1100, 1.0), (360, 900, 1.4), (840, 412, 1.0)]:
            smoke.shell('wm', 'size', f'{width}x{height}')
            smoke.shell('wm', 'density', '160')
            smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
            launch(smoke)
            active_header(smoke, width, height)
            capture(smoke, f'header-{width}-{height}-font-{font}', viewport(smoke))
            smoke.tap(PROFILE)
            smoke.find('Lokales Demoprofil', exact=True)
            active_header(smoke, width, height, back=True)
            capture(smoke, f'profile-{width}-{height}-font-{font}', viewport(smoke))

        # Check the new overlay layering and return path on a normal phone.
        smoke.shell('wm', 'size', '390x900')
        smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
        launch(smoke)
        before_scroll = bounds(control(smoke, 'Lokale Daten aktualisieren'))
        smoke.tap(PROFILE)
        smoke.find('Lokales Demoprofil', exact=True)
        smoke.tap(BACK)
        assert bounds(smoke.find('Lokale Daten aktualisieren', exact=True)) == before_scroll, 'Main scroll changed after overlay return'
        capture(smoke, 'main-scroll-preserved', viewport(smoke))
        launch(smoke)
        tab(smoke, 'Flüge')
        smoke.tap('Flugfilter öffnen')
        smoke.find('Flugfilter', exact=True)
        active_header(smoke, 390, 900, back=True)
        smoke.tap(PROFILE)
        smoke.find('Lokales Demoprofil', exact=True)
        smoke.tap_node(active_header(smoke, 390, 900, back=True))
        smoke.find('Sitzung ungeprüft', exact=True)
        assert not any(n.get('content-desc') == PROFILE for n in smoke.dump())
        smoke.tap(CLOSE)
        smoke.find('Lokales Demoprofil', exact=True)
        smoke.tap(BACK)
        smoke.find('Flugfilter', exact=True)
        active_header(smoke, 390, 900, back=True)
        smoke.tap(BACK)
        smoke.find('Flüge durchsuchen', exact=True)
        capture(smoke, 'nested-overlay-return', viewport(smoke))

        # Keyboard uses an existing field, without changing or saving its value.
        smoke.tap(PROFILE)
        smoke.tap('Anzeigename', exact=True)
        for _ in range(12):
            try:
                keyboard, keyboard_source = native_keyboard_top(smoke.shell('dumpsys', 'window'), 390, 900)
                break
            except AssertionError:
                time.sleep(.25)
        else:
            raise AssertionError('Native keyboard geometry unavailable')
        active_header(smoke, 390, 900, back=True)
        assert bounds(smoke.find('Anzeigename', exact=True))[3] <= keyboard + 2
        smoke.report['keyboard'] = {'top': keyboard, 'source': keyboard_source}
        capture(smoke, 'profile-keyboard', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        smoke.tap(BACK)

        # The original page remains offline. Positive history is a host check;
        # this native check covers the separate disabled Back, Close and origin.
        smoke.tap_node(active_header(smoke, 390, 900))
        smoke.tap('Bei Vereinsflieger anmelden', exact=True)
        control(smoke, 'Zugangsdaten nur auf der Originalseite eingeben.')
        smoke.find('Auf der Vereinsflieger-Seite zurück', exact=True, enabled=False)
        smoke.find(CLOSE, exact=True)
        smoke.find('https://www.vereinsflieger.de', exact=False)
        capture(smoke, 'offline-provider-toolbar', viewport(smoke))
        smoke.tap(CLOSE)
        smoke.find('Flüge durchsuchen', exact=True)
        active_header(smoke, 390, 900)
        capture(smoke, 'provider-close-returns-to-flights', viewport(smoke))
    finally:
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

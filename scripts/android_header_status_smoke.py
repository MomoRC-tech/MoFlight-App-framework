"""Non-destructive header/navigation trial on the dedicated LoginUX AVD.

No app reset, provider sign-in, credentials, captures, database reads or seeding.
The two AVDs that may hold personal sessions are rejected before any mutation.
Offline by default; --public-toolbar loads only the public login page online.
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
MEDICAL = 'Medical unbekannt. Details öffnen'
BACK = 'Zur vorherigen App-Ansicht'
CLOSE = 'Verbindungen schließen und zur App zurückkehren'


def active_header(smoke, width, height, *, back=False):
    nodes = smoke.dump()
    connection = [n for n in nodes if n.get('clickable') == 'true'
                  and 'Verbindungen öffnen' in n.get('content-desc', '')]
    profile = [n for n in nodes if n.get('content-desc') == PROFILE]
    medical = [n for n in nodes if n.get('content-desc') == MEDICAL]
    assert len(connection) == len(medical) == len(profile) == 1, 'Expected one reachable active status group'
    controls = [connection[0], medical[0], profile[0]]
    if back:
        previous = [n for n in nodes if n.get('content-desc') == BACK]
        assert len(previous) == 1, 'Expected one contextual Back'
        controls += previous
    for node in controls:
        x1, y1, x2, y2 = bounds(node)
        assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
        assert x2 - x1 >= 48 and y2 - y1 >= 48, 'Header control below 48 dp'
    assert bounds(connection[0])[2] <= bounds(medical[0])[0] and bounds(medical[0])[2] <= bounds(profile[0])[0], 'Status controls overlap or reorder'
    return connection[0]


def profile_input(smoke):
    return next(n for n in smoke.dump() if n.get('class') == 'android.widget.EditText'
                and n.get('content-desc') == 'Anzeigename')


def public_toolbar(smoke):
    smoke.shell('wm', 'size', '390x900')
    smoke.shell('wm', 'density', '160')
    smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
    launch(smoke)
    tab(smoke, 'Flüge')
    smoke.tap_node(active_header(smoke, 390, 900))
    smoke.shell('cmd', 'connectivity', 'airplane-mode', 'disable')
    smoke.shell('svc', 'data', 'disable')
    smoke.shell('cmd', 'wifi', 'set-wifi-enabled', 'enabled')
    for _ in range(40):
        if smoke.shell('settings', 'get', 'global', 'wifi_on') == '1':
            break
        time.sleep(.25)
    assert smoke.shell('settings', 'get', 'global', 'wifi_on') == '1'
    for _ in range(40):
        if 'Supplicant state: COMPLETED' in smoke.shell('cmd', 'wifi', 'status'):
            break
        time.sleep(.25)
    else:
        raise AssertionError('Public toolbar trial requires connected Wi-Fi')
    smoke.report['public_provider_network'] = 'Wi-Fi enabled only for anonymous public-login toolbar inspection; no credentials or retrieval'
    # A fresh process on this previously offline-only AVD has no active browser.
    smoke.tap_node(smoke.find('Bei Vereinsflieger anmelden', exact=True))
    smoke.find('Zugangsdaten nur auf der Originalseite eingeben.', exact=True, attempts=30)
    smoke.find('Anmeldung prüfen', exact=True, enabled=True, attempts=30)
    origins = [n.get('text') for n in smoke.dump()
               if n.get('text') in ('https://vereinsflieger.de', 'https://www.vereinsflieger.de')]
    assert len(origins) == 1, 'Expected the exact allowed HTTPS provider origin'
    smoke.report['public_provider_origin'] = origins[0]
    previous = smoke.find('Auf der Vereinsflieger-Seite zurück', exact=True)
    smoke.report['public_history_back_enabled'] = previous.get('enabled') == 'true'
    smoke.find(CLOSE, exact=True)
    assert not any(n.get('content-desc') == PROFILE for n in smoke.dump())
    capture(smoke, 'public-provider-toolbar', viewport(smoke))
    smoke.tap(CLOSE)
    smoke.find('Flüge durchsuchen', exact=True)
    active_header(smoke, 390, 900)
    capture(smoke, 'public-provider-close-returns-to-flights', viewport(smoke))


def medical_group(smoke):
    for width, height, font in [(360, 900, 1.0), (390, 900, 1.0), (412, 900, 1.0),
                                (600, 1100, 1.0), (360, 900, 1.4), (840, 412, 1.0)]:
        smoke.shell('wm', 'size', f'{width}x{height}')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
        launch(smoke)
        active_header(smoke, width, height)
        capture(smoke, f'med-header-{width}-{height}-font-{font}', viewport(smoke))
        smoke.tap(MEDICAL)
        smoke.find('Status unbekannt', exact=True)
        active_header(smoke, width, height, back=True)
        nodes = smoke.dump()
        assert not any(n.get('class') == 'android.widget.EditText' for n in nodes), 'Medical must be read-only'
        allowed = {BACK, MEDICAL, PROFILE}
        assert all(n.get('content-desc') in allowed or 'Verbindungen öffnen' in n.get('content-desc', '')
                   for n in nodes if n.get('package') == PACKAGE and n.get('clickable') == 'true'), 'Unexpected Medical data action'
        medical = next(n for n in nodes if n.get('content-desc') == MEDICAL)
        if font > 1.3:
            back = next(n for n in nodes if n.get('content-desc') == BACK)
            assert bounds(medical)[1] >= bounds(back)[3], 'Large-text status group must use the second row'
        capture(smoke, f'med-sheet-{width}-{height}-font-{font}', viewport(smoke))

    smoke.shell('wm', 'size', '390x900')
    smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
    launch(smoke)
    tab(smoke, 'Flüge')
    smoke.tap('Flugfilter öffnen')
    smoke.tap(MEDICAL)
    smoke.find('Status unbekannt', exact=True)
    smoke.tap_node(active_header(smoke, 390, 900, back=True))
    smoke.find('Sitzung ungeprüft', exact=True)
    assert not any(n.get('content-desc') == MEDICAL for n in smoke.dump()), 'Inactive Medical control remains reachable'
    smoke.tap(CLOSE)
    smoke.find('Status unbekannt', exact=True)
    smoke.tap(BACK)
    smoke.find('Flugfilter', exact=True)
    smoke.tap(BACK)
    smoke.find('Flüge durchsuchen', exact=True)
    active_header(smoke, 390, 900)
    capture(smoke, 'medical-nested-return', viewport(smoke))


def execute(smoke, *, back_only=False, continuation=False, public_only=False, medical_only=False):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Emulator required'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD, 'Dedicated LoginUX AVD required'
    smoke.emulator = True
    original = viewport(smoke)
    smoke.report.update(avd=AVD, original=original,
                        boundary='Header/navigation only; offline except optional anonymous public login page. No Medical, sign-in, credentials, captures, resets, data seeding, private reads, physical phone or iOS.')
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
        if medical_only:
            smoke.report['scope'] = 'Connection → Med → Profile, read-only unknown sheet and nested return; offline only'
            medical_group(smoke)
            return
        if public_only:
            smoke.report['scope'] = 'Anonymous public-provider toolbar'
            public_toolbar(smoke)
            return
        viewports = [] if continuation else [(360, 900, 1.0), (360, 900, 1.4)] if back_only else [
            (360, 900, 1.0), (390, 900, 1.0), (412, 900, 1.0),
            (600, 1100, 1.0), (360, 900, 1.4), (840, 412, 1.0)]
        smoke.report['scope'] = 'Keyboard/provider continuation' if continuation else 'Back appearance follow-up' if back_only else 'Header/navigation matrix and return paths'
        for width, height, font in viewports:
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

        if back_only:
            return

        # Check the new overlay layering and return path on a normal phone.
        smoke.shell('wm', 'size', '390x900')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
        assert viewport(smoke)['width_dp'] == 390
        launch(smoke)
        if not continuation:
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
        tab(smoke, 'Flüge')
        smoke.tap(PROFILE)
        smoke.tap_node(profile_input(smoke))
        for _ in range(12):
            try:
                keyboard, keyboard_source = native_keyboard_top(smoke.shell('dumpsys', 'window'), 390, 900)
                break
            except AssertionError:
                time.sleep(.25)
        else:
            raise AssertionError('Native keyboard geometry unavailable')
        active_header(smoke, 390, 900, back=True)
        assert bounds(profile_input(smoke))[3] <= keyboard + 2
        smoke.report['keyboard'] = {'top': keyboard, 'source': keyboard_source}
        capture(smoke, 'profile-keyboard', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        smoke.tap(BACK)

        # Existing load-error behavior hides the browser frame immediately.
        # Test the resulting panel/Close, not transient toolbar provenance.
        smoke.tap_node(active_header(smoke, 390, 900))
        smoke.tap_node(smoke.find('Bei Vereinsflieger anmelden', exact=True))
        control(smoke, 'Die Anbieterseite konnte nicht geladen werden.')
        smoke.find(CLOSE, exact=True)
        capture(smoke, 'offline-provider-page-error', viewport(smoke))
        smoke.tap(CLOSE)
        smoke.find('Flüge durchsuchen', exact=True)
        active_header(smoke, 390, 900)
        capture(smoke, 'provider-close-returns-to-flights', viewport(smoke))
    finally:
        smoke.shell('svc', 'wifi', 'disable')
        smoke.shell('svc', 'data', 'disable')
        smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        smoke.shell('am', 'force-stop', PACKAGE)
        smoke.shell('wm', 'size', f"{original['width_px']}x{original['height_px']}")
        smoke.shell('wm', 'density', str(original['density_dpi']))
        smoke.shell('settings', 'put', 'system', 'font_scale', str(original['font_scale']))
        smoke.report['final'] = {'display': viewport(smoke), 'app': 'stopped', 'radios': 'off'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    phases = parser.add_mutually_exclusive_group()
    phases.add_argument('--back-only', action='store_true', help='Repeat only narrow normal/large-text headers after a Back-appearance change')
    phases.add_argument('--continuation', action='store_true', help='Resume keyboard/provider checks after completed matrix/return checks')
    phases.add_argument('--public-toolbar', action='store_true', help='Inspect only the anonymous original public login toolbar; Wi-Fi is switched off afterward')
    phases.add_argument('--medical', action='store_true', help='Check only the selected Medical group and read-only sheet offline')
    args = parser.parse_args()
    smoke = Smoke(args.output, serial=args.serial, expected_avd=AVD)
    try:
        execute(smoke, back_only=args.back_only, continuation=args.continuation, public_only=args.public_toolbar, medical_only=args.medical)
    except Exception as error:
        finish(smoke, 'failed', error)
        raise
    finish(smoke, 'passed')

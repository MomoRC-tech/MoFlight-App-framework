"""Credential-free connection UI trial on MoFlight_Synthetic_API37 only.

No seeding, resets, credentials or provider network access. Restores exact display
overrides, font and network flags. Live hidden retrieval remains a separate gate.
"""
import argparse
import json
import re
import time
from pathlib import Path
from android_smoke import Smoke
from android_mobile_ui_smoke import launch, tab
from android_mobile_shell_smoke import viewport, PROFILE, LOGO
from android_mobile_width_matrix import AVD, bounds, capture, finish, override, native_keyboard_top


def connection(smoke):
    return smoke.find('Verbindungen öffnen', exact=False)


def panel(smoke):
    smoke.tap_node(connection(smoke))
    panel_control(smoke, 'Letzte Sitzungsprüfung:', exact=False)



def panel_control(smoke, text, *, exact=True, enabled=None):
    # Panels retain scroll position across close/reopen. Search toward the top
    # before traversing down; a one-way scan can miss newly added actions.
    try:
        return smoke.find(text, exact=exact, enabled=enabled, attempts=1)
    except AssertionError:
        try:
            return smoke.find(text, exact=exact, enabled=enabled, scroll=True, up=False, attempts=8)
        except AssertionError:
            return smoke.find(text, exact=exact, enabled=enabled, scroll=True, attempts=14)


def panel_tap(smoke, text):
    smoke.tap_node(panel_control(smoke, text, enabled=True))


def native_browser_ids(smoke):
    # Native Activity dump includes Java instance IDs on some Android builds.
    # Its absence is explicitly NOT TESTED rather than an inferred retention pass.
    text = smoke.shell('dumpsys', 'activity', 'top')
    return sorted(set(re.findall(r'(?:RNCWebView|RNCWebViewWrapper)\{([0-9a-f]+)', text)))


def execute(smoke):
    assert smoke.serial, 'Explicit synthetic serial required'
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Physical device refused'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD, 'Wrong AVD refused'
    smoke.emulator = True
    original = {
        'size': smoke.shell('wm', 'size'), 'density': smoke.shell('wm', 'density'),
        'font_scale': smoke.shell('settings', 'get', 'system', 'font_scale'),
        **{key: smoke.shell('settings', 'get', 'global', key) for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']},
    }
    smoke.report.update(boundary='Synthetic connection entry/layout/offline errors only. No live login, capture, provider preferences, canonical import, physical phone or iOS.', original=original)
    try:
        # Set all radios off before opening any provider view.
        smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        smoke.shell('svc', 'wifi', 'disable')
        smoke.shell('svc', 'data', 'disable')
        assert smoke.shell('settings', 'get', 'global', 'airplane_mode_on') == '1'
        assert smoke.shell('settings', 'get', 'global', 'wifi_on') in ['0', '3']
        assert smoke.shell('settings', 'get', 'global', 'mobile_data') == '0'
        smoke.report['provider_access'] = 'All radios disabled before browser creation; no provider network request could complete.'
        launch(smoke)
        smoke.tap(PROFILE)
        smoke.tap('Vereinsflieger', scroll=True)
        smoke.find('Letzte Sitzungsprüfung: noch nicht erfolgt', exact=True)
        capture(smoke, 'profile-opens-shared-connection-entry', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')

        for width, height, font in [(360, 900, 1.0), (390, 900, 1.0), (412, 900, 1.0), (600, 1100, 1.0), (840, 1100, 1.0), (360, 900, 1.4), (600, 1100, 1.4), (840, 412, 1.0)]:
            smoke.shell('wm', 'size', f'{width}x{height}')
            smoke.shell('wm', 'density', '160')
            smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
            launch(smoke)
            indicator = connection(smoke)
            logo = smoke.find(LOGO, exact=True)
            profile = smoke.find(PROFILE, exact=True)
            a, b, c = bounds(logo), bounds(indicator), bounds(profile)
            assert a[2] <= b[0] and b[2] <= c[0] and c[2] <= width, 'Header actions overlap'
            if (width == 390 and font == 1.0) or (width == 360 and font == 1.4):
                capture(smoke, f'connection-header-w{width}-font{font}', viewport(smoke))
            panel(smoke)
            smoke.find('Nicht verbunden', exact=True)
            button = smoke.find('Mit Vereinsflieger verbinden', exact=True, scroll=True)
            x1, y1, x2, y2 = bounds(button)
            assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
            if width >= 600:
                assert x2 - x1 <= 520, 'Connection form stretched on a large display'
            smoke.find('Gespeicherte Anmeldung verwenden', exact=True, scroll=True)
            disconnect = smoke.find('Bei Vereinsflieger abmelden', exact=True, scroll=True, enabled=False)
            dx1, dy1, dx2, dy2 = bounds(disconnect)
            assert 0 <= dx1 < dx2 <= width and 0 <= dy1 < dy2 <= height, 'Disabled disconnect action has invalid bounds'
            forget = smoke.find('Gespeicherte Zugangsdaten vergessen', exact=True, scroll=True, enabled=True)
            fx1, fy1, fx2, fy2 = bounds(forget)
            assert 0 <= fx1 < fx2 <= width and 0 <= fy1 < fy2 <= height, 'Forget-credentials action has invalid bounds'
            capture(smoke, f'connection-w{width}-h{height}-font{font}', viewport(smoke))
            if width == 360 and font == 1.4:
                field = smoke.find('Vereinsflieger Abruf von', exact=True, scroll=True)
                smoke.tap_node(field)
                time.sleep(.5)
                window = smoke.shell('dumpsys', 'input_method')
                assert re.search(r'(?:mInputShown|mIsInputViewShown|isInputViewShown)\s*[=:]\s*true', window), 'Keyboard did not open'
                keyboard_top, method = native_keyboard_top(smoke.shell('dumpsys', 'window', 'windows'), width, height)
                # Scroll inside the visible form, never on the keyboard surface.
                for _ in range(5):
                    fields = [n for n in smoke.dump() if n.get('content-desc') == 'Vereinsflieger Abruf bis']
                    if fields and 0 < bounds(fields[0])[1] < bounds(fields[0])[3] <= keyboard_top:
                        break
                    smoke.shell('input', 'swipe', str(width // 2), str(int(keyboard_top - 100)), str(width // 2), '120', '300')
                second = smoke.find('Vereinsflieger Abruf bis', exact=True, attempts=1)
                assert 0 < bounds(second)[1] < bounds(second)[3] <= keyboard_top, 'Second date field cannot be reached above the keyboard'
                smoke.report['keyboard_geometry'] = {'top_px': keyboard_top, 'source': method, 'field_bounds': bounds(second)}
                capture(smoke, 'connection-min-enlarged-keyboard', viewport(smoke))
                smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
            smoke.shell('input', 'keyevent', 'KEYCODE_BACK')

        smoke.shell('wm', 'size', '390x900')
        smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
        launch(smoke)
        panel(smoke)
        panel_tap(smoke, 'Mit Vereinsflieger verbinden')
        smoke.find('Abruf oder Seitenaufruf fehlgeschlagen', exact=False, scroll=True, attempts=20)
        first_ids = native_browser_ids(smoke)
        capture(smoke, 'offline-browser-error-preserves-unknown-state', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        tab(smoke, 'Flüge')
        smoke.find('Flüge durchsuchen', exact=True)
        capture(smoke, 'offline-error-close-retains-local-flight-screen', viewport(smoke))
        panel(smoke)
        panel_tap(smoke, 'Mit Vereinsflieger verbinden')
        smoke.find('Abruf oder Seitenaufruf fehlgeschlagen', exact=False, scroll=True, attempts=20)
        second_ids = native_browser_ids(smoke)
        if first_ids and second_ids:
            assert first_ids == second_ids, 'Native WebView instance changed across close/tab/retry'
            smoke.report['native_browser_retention'] = {'status': 'passed', 'first_ids': first_ids, 'second_ids': second_ids}
        else:
            smoke.report['native_browser_retention'] = {'status': 'not tested', 'reason': 'Activity dump did not expose native browser instance IDs', 'first_ids': first_ids, 'second_ids': second_ids}
        capture(smoke, 'offline-browser-explicit-retry', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        launch(smoke)
        panel(smoke)
        smoke.find('Nicht verbunden', exact=True)
        smoke.find('Letzte Sitzungsprüfung: noch nicht erfolgt', exact=True)
        capture(smoke, 'restart-does-not-infer-session-from-cookies', viewport(smoke))
        panel_control(smoke, 'Bei Vereinsflieger abmelden', enabled=False)
        panel_control(smoke, 'Gespeicherte Anmeldung verwenden')

        # Creating the owned browser is required before app-initiated
        # disconnect can be offered. This offline failure establishes only an
        # unknown session state and gives the synthetic AVD a browser to reuse.
        panel_tap(smoke, 'Mit Vereinsflieger verbinden')
        smoke.find('Abruf oder Seitenaufruf fehlgeschlagen', exact=False, scroll=True, attempts=20)
        panel_control(smoke, 'Sitzung aktuell ungeprüft')

        # Credential removal is an explicit MoFlight-only operation. On this
        # clean synthetic AVD there is no saved login to touch; it must not
        # change the provider session label or report provider logout.
        panel_tap(smoke, 'Gespeicherte Zugangsdaten vergessen')
        panel_control(smoke, 'Von MoFlight gespeicherte Zugangsdaten entfernt.', exact=False)
        panel_control(smoke, 'Sitzung aktuell ungeprüft')
        assert not any('Letzte bestätigte Abmeldung' in label for node in smoke.dump() for label in smoke.labels(node)), 'Forgetting absent synthetic credentials must not claim provider logout'
        panel_control(smoke, 'Von MoFlight gespeicherte Zugangsdaten entfernt.', exact=False)
        capture(smoke, 'forget-credentials-does-not-claim-provider-logout', viewport(smoke))

        # The browser has been created by the earlier offline connect attempts,
        # so disconnect becomes available. Its first protected-profile request
        # fails offline; that failure must return to the panel as unconfirmed.
        panel_tap(smoke, 'Bei Vereinsflieger abmelden')
        # The offline navigation can fail before the transient instruction is
        # readable. The controller returns to the connection panel; only its
        # explicit failure notice is asserted below.
        panel_control(smoke, 'Abmeldung nicht bestätigt.', exact=False)
        first_disconnect_ids = native_browser_ids(smoke)
        assert not any('Letzte bestätigte Abmeldung' in label for node in smoke.dump() for label in smoke.labels(node)), 'Offline failure cannot claim provider logout'
        panel_control(smoke, 'Sitzung aktuell ungeprüft')
        after_failure_ids = native_browser_ids(smoke)
        if first_disconnect_ids and after_failure_ids:
            assert first_disconnect_ids == after_failure_ids, 'WebView instance changed after disconnect failure'
        capture(smoke, 'offline-disconnect-failure-is-unconfirmed', viewport(smoke))

        panel_tap(smoke, 'Bei Vereinsflieger abmelden')
        panel_control(smoke, 'Abmeldung nicht bestätigt.', exact=False)
        retry_disconnect_ids = native_browser_ids(smoke)
        if first_disconnect_ids and retry_disconnect_ids:
            assert first_disconnect_ids == retry_disconnect_ids, 'WebView instance changed on disconnect retry'
        final_disconnect_ids = native_browser_ids(smoke)
        if retry_disconnect_ids and final_disconnect_ids:
            assert retry_disconnect_ids == final_disconnect_ids, 'WebView instance changed after disconnect retry failure'
        assert not any('Letzte bestätigte Abmeldung' in label for node in smoke.dump() for label in smoke.labels(node)), 'Repeated offline failure cannot claim provider logout'
        smoke.report['disconnect_offline_retry'] = {
            'status': 'passed' if first_disconnect_ids and retry_disconnect_ids and final_disconnect_ids else 'not tested',
            'first_ids': first_disconnect_ids, 'retry_ids': retry_disconnect_ids,
            'after_retry_ids': final_disconnect_ids,
            'reason': None if first_disconnect_ids and retry_disconnect_ids and final_disconnect_ids else 'Activity dump did not expose native browser instance IDs',
        }
        capture(smoke, 'offline-disconnect-retry-is-unconfirmed', viewport(smoke))
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
    finally:
        for kind, pattern in [('size', r'Override size:\s*(\d+x\d+)'), ('density', r'Override density:\s*(\d+)')]:
            smoke.shell('wm', kind, override(original[kind], pattern) or 'reset')
        if original['font_scale'] == 'null':
            smoke.shell('settings', 'delete', 'system', 'font_scale')
        else:
            smoke.shell('settings', 'put', 'system', 'font_scale', original['font_scale'])
        smoke.shell('cmd', 'connectivity', 'airplane-mode', 'enable' if original['airplane_mode_on'] == '1' else 'disable')
        smoke.shell('svc', 'wifi', 'enable' if original['wifi_on'] in ['1', '2'] else 'disable')
        smoke.shell('svc', 'data', 'enable' if original['mobile_data'] == '1' else 'disable')
        restored = {key: smoke.shell('settings', 'get', 'global', key) for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
        smoke.report['restored'] = {**restored, 'size': smoke.shell('wm', 'size'), 'density': smoke.shell('wm', 'density'), 'font_scale': smoke.shell('settings', 'get', 'system', 'font_scale')}
        assert smoke.report['restored'] == original, 'Original emulator settings were not restored exactly'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, default=Path('local-data/android-connection'))
    args = parser.parse_args()
    smoke = Smoke(args.output, args.serial, AVD)
    try:
        execute(smoke)
    except Exception as error:
        finish(smoke, 'failed', error)
        raise
    else:
        finish(smoke, 'passed')


if __name__ == '__main__':
    main()

"""Five-tab/header/profile native trial, on the dedicated synthetic AVD only.

Uses existing selected book; no seeding, resets, database injection, display or
network changes. Temporarily changes the local demo name through ordinary UI,
checks restart persistence, then restores the original name through that UI.
"""
import argparse
import re
from pathlib import Path

from android_smoke import Smoke
from android_mobile_ui_smoke import launch, tab
from android_mobile_width_matrix import AVD, TABS, assert_navigation, bounds, capture, finish


PROFILE = 'Profil & Einstellungen öffnen'
LOGO = 'MoFlight Thermik Logo'


def viewport(smoke):
    width, height = map(int, re.findall(r'(\d+)x(\d+)', smoke.shell('wm', 'size'))[-1])
    density = int(re.findall(r'\d+', smoke.shell('wm', 'density'))[-1])
    scale = smoke.shell('settings', 'get', 'system', 'font_scale')
    return {'width_px': width, 'height_px': height, 'density_dpi': density,
            'width_dp': width * 160 / density, 'height_dp': height * 160 / density,
            'font_scale': float(scale) if scale != 'null' else 1.0}


def header_bounds(smoke):
    result = {label: bounds(smoke.find(label, exact=True)) for label in [PROFILE, LOGO]}
    assert result[PROFILE][0] >= result[LOGO][2], 'Profile action overlaps brand logo'
    return result


def open_profile(smoke):
    smoke.tap(PROFILE)
    smoke.find('Lokales Demoprofil', exact=True)


def display_name_field(smoke):
    for _ in range(12):
        nodes = smoke.dump()
        fields = [node for node in nodes if node.get('class') == 'android.widget.EditText'
                  and node.get('content-desc') == 'Anzeigename' and node.get('enabled') == 'true']
        if fields:
            return fields[0]
        smoke.find('Anzeigename speichern', exact=True, enabled=True)
    raise AssertionError('Editable demo profile name field absent')


def save_name(smoke, value):
    assert re.fullmatch(r'[A-Za-z0-9 ._-]{0,60}', value), 'Cannot safely restore non-ASCII demo name using adb text input'
    smoke.tap_node(display_name_field(smoke))
    smoke.shell('input', 'keyevent', 'KEYCODE_MOVE_END')
    smoke.shell('input', 'keyevent', *(['KEYCODE_DEL'] * 60))
    if value:
        smoke.shell('input', 'text', value.replace(' ', '%s'))
    smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
    smoke.tap('Anzeigename speichern', scroll=True)
    smoke.find('Anzeigename gespeichert.', exact=True)
    assert field_value(display_name_field(smoke)) == value, 'Saved display name differs from requested value'


def field_value(node):
    # Android exposes the placeholder as EditText text while the value is empty.
    value = node.get('text', '')
    return '' if value == 'Dein Name (optional)' else value


def execute(smoke):
    assert smoke.serial, 'Explicit synthetic emulator serial required'
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Physical devices are refused'
    actual = smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip()
    assert actual == AVD, f'Refusing other AVD: {actual}'
    smoke.emulator = True
    dimensions = viewport(smoke)
    smoke.report['boundary'] = ('Synthetic local demo only; five tabs, fixed header, local profile persistence and '
                                'existing paper workflow entry. No account authentication, live services, '
                                'data resets, display/network changes or iOS acceptance.')
    smoke.report['viewport'] = dimensions
    launch(smoke)
    original_header = header_bounds(smoke)
    hero_before = bounds(smoke.find('Papierflugbuch aktualisieren', exact=True))
    for _ in range(3):
        smoke.swipe(up=True, duration=250)
    assert header_bounds(smoke) == original_header, 'Header moved while home content scrolled'
    heroes = [node for node in smoke.dump() if node.get('content-desc') == 'Papierflugbuch aktualisieren']
    assert not heroes or all(bounds(node) != hero_before for node in heroes), 'Home content did not move during scroll'
    capture(smoke, 'fixed-header-after-home-scroll', dimensions)
    for title, slug in TABS:
        tab(smoke, title)
        assert_navigation(smoke, title, dimensions['width_px'], dimensions['height_px'])
        assert header_bounds(smoke) == original_header, f'Header bounds changed on {title}'
        capture(smoke, f'five-tab-{slug}', dimensions)
    tab(smoke, 'Flugbuch')
    smoke.find('Flüge ohne gespeicherten Papiernachweis')
    smoke.tap('Papierabgleich öffnen', scroll=True)
    smoke.find('Multiple-logbook lab')
    capture(smoke, 'logbook-opens-existing-paper-workflow', dimensions)
    smoke.tap('Close multiple-logbook lab')
    smoke.find(PROFILE, exact=True)
    open_profile(smoke)
    original = field_value(display_name_field(smoke))
    assert re.fullmatch(r'[A-Za-z0-9 ._-]{0,60}', original), 'Non-ASCII original profile preserved; UI round-trip cannot safely restore it'
    modified = False
    try:
        modified = True  # Restore even if UI save fails midway.
        save_name(smoke, 'Synthetic Shell Trial')
        capture(smoke, 'local-profile-saved', dimensions)
        launch(smoke)
        open_profile(smoke)
        assert field_value(display_name_field(smoke)) == 'Synthetic Shell Trial', 'Local profile did not survive app restart'
        capture(smoke, 'local-profile-survives-restart', dimensions)
    finally:
        if modified:
            launch(smoke)
            open_profile(smoke)
            save_name(smoke, original)
            smoke.report['profile_restoration'] = 'Original local demo name restored through UI'
    smoke.tap('‹ Zurück')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, default=Path('local-data/android-mobile-shell'))
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

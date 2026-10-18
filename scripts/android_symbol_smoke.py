"""Reuse the guarded synthetic width/keyboard matrix for selected symbol checks.

No data reset, seeding, provider login or network mutation. Requires an installed
committed-source Release and the same exact synthetic AVD as the existing matrix.
"""
import argparse
from pathlib import Path

from android_smoke import Smoke
from android_mobile_width_matrix import execute, capture, finish, assert_navigation
from android_header_status_smoke import active_header, MEDICAL, BACK, CLOSE


def symbol_screen(smoke, title, viewport):
    width, height = viewport['width_dp'], viewport['height_dp']
    connection = active_header(smoke, width, height)
    if title != 'Flüge' or width != 390 or viewport['font_scale'] != 1.0:
        return
    smoke.tap(MEDICAL)
    smoke.find('Status unbekannt', exact=True)
    assert not any(n.get('class') == 'android.widget.EditText' for n in smoke.dump()), 'Medical must remain read-only'
    capture(smoke, 'selected-m2-medical-details', viewport)
    smoke.tap(BACK)
    smoke.find('Flüge durchsuchen', exact=True)
    connection = active_header(smoke, width, height)
    smoke.tap_node(connection)
    smoke.find(CLOSE, exact=True)
    capture(smoke, 'selected-duotone-connection-panel-offline', viewport)
    smoke.tap(CLOSE)
    smoke.find('Flüge durchsuchen', exact=True)
    assert_navigation(smoke, 'Flüge', width, height)
    active_header(smoke, width, height)
    capture(smoke, 'selected-symbol-nested-return', viewport)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise RuntimeError('Use a fresh evidence directory')
    smoke = Smoke(args.output, args.serial, 'MoFlight_Synthetic_API37')
    try:
        execute(smoke, on_screen=symbol_screen)
    except Exception as exc:
        finish(smoke, 'failed', exc)
        raise
    else:
        finish(smoke, 'passed')


if __name__ == '__main__':
    main()

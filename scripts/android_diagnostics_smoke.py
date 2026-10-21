"""Bounded support-screen trial on the named synthetic AVD; never sends a report.

No app reset, provider access, credentials, database injection or private sessions.
Uses the ordinary local read to produce diagnostics, opens/cancels OS sharing,
checks restart retention and clears only this synthetic diagnostic journal.
"""
import argparse
import json
import re
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch
from android_mobile_width_matrix import bounds, override, finish

AVD = 'MoFlight_Synthetic_API37'
PROFILE = 'Profil & Einstellungen öffnen'
BACK = 'Zur vorherigen App-Ansicht'


def open_diagnostics(smoke):
    smoke.tap(PROFILE)
    smoke.tap('Diagnose öffnen', scroll=True)
    smoke.find('Die letzten fünf technischen Vorgänge')


def report(smoke):
    node = smoke.find('MoFlight support diagnostics', scroll=True)
    value = next(label for label in smoke.labels(node) if 'MoFlight support diagnostics' in label)
    return json.loads(value)


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD
    smoke.emulator = True
    smoke.report['boundary'] = 'Support diagnostics only, synthetic Android local reads; no actual recipient/send, provider, iOS or physical-phone acceptance.'
    smoke.report['device'] = {key: smoke.shell('getprop', key) for key in ['ro.build.version.sdk', 'ro.product.cpu.abi']}
    original_size = smoke.shell('wm', 'size')
    original_density = smoke.shell('wm', 'density')
    original_scale = smoke.shell('settings', 'get', 'system', 'font_scale')
    try:
        for width, height, scale in [(360, 900, '1.0'), (390, 900, '1.0'), (600, 1100, '1.0'), (360, 900, '1.4')]:
            smoke.shell('wm', 'size', f'{width}x{height}')
            smoke.shell('wm', 'density', '160')
            smoke.shell('settings', 'put', 'system', 'font_scale', scale)
            launch(smoke)
            open_diagnostics(smoke)
            for label in ['Diagnosebericht teilen', 'Diagnosejournal leeren']:
                node = smoke.find(label, exact=True, scroll=True)
                x1, y1, x2, y2 = bounds(node)
                assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
                assert y2-y1 >= 48 and x2-x1 <= 520
            smoke.record(f'diagnostics-{width}-font-{scale}')
            smoke.report['checks'][-1]['viewport'] = {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': float(scale)}
            smoke.tap(BACK)
            smoke.find('Lokales Demoprofil', scroll=True)

        launch(smoke)
        open_diagnostics(smoke)
        before = report(smoke)
        assert 1 <= len(before['entries']) <= 5
        assert all(entry['action'] == 'read-flights' for entry in before['entries'])
        # Open/cancel only. Never choose a recipient or invoke a send action.
        smoke.tap('Diagnosebericht teilen', scroll=True)
        window = smoke.shell('dumpsys', 'window', 'windows')
        assert any(name in window for name in ['ChooserActivity', 'ResolverActivity', 'intentresolver']), 'OS share chooser did not open'
        smoke.record('explicit-os-share-chooser')
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        smoke.find('Diagnosejournal leeren', scroll=True)
        smoke.record('share-cancel-retains-diagnostics')
        retained = report(smoke)['entries'][-1]
        launch(smoke)
        open_diagnostics(smoke)
        after = report(smoke)
        assert any(entry['sequence'] == retained['sequence'] and entry['action'] == retained['action'] for entry in after['entries']), 'Last operation lost on process restart'
        smoke.record('journal-retained-after-process-restart')
        smoke.tap('Diagnosejournal leeren', scroll=True)
        smoke.find('Noch keine Diagnoseeinträge')
        smoke.record('clear-only-diagnostic-journal')
    finally:
        smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
        smoke.shell('wm', 'size', override(original_size, r'Override size:\s*(\d+x\d+)') or 'reset')
        smoke.shell('wm', 'density', override(original_density, r'Override density:\s*(\d+)') or 'reset')
        if original_scale == 'null':
            smoke.shell('settings', 'delete', 'system', 'font_scale')
        else:
            smoke.shell('settings', 'put', 'system', 'font_scale', original_scale)
        smoke.report['cleanup'] = {'display_restored': smoke.shell('wm', 'size') == original_size and smoke.shell('wm', 'density') == original_density and smoke.shell('settings', 'get', 'system', 'font_scale') == original_scale,
                                   'network': 'unchanged', 'provider_sessions': 'untouched', 'data_reset': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    smoke = Smoke(args.output, serial=args.serial, expected_avd=AVD)
    try:
        execute(smoke)
        finish(smoke, 'passed')
    except Exception as error:
        finish(smoke, 'failed', error)
        raise


if __name__ == '__main__':
    main()

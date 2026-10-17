"""Bounded destructive WebView-store proof, named synthetic AVD only.

Inline synthetic cookie/local/session/IndexedDB sentinels are native guarded.
No provider access, application reset, personal data or credential reads.
"""
import argparse
import json
import time
from pathlib import Path
from android_smoke import Smoke
from android_mobile_ui_smoke import launch, tab
from android_connection_smoke import panel, panel_control, wait_network_state
from android_mobile_shell_smoke import viewport


def execute(s):
    assert s.serial and s.shell('getprop', 'ro.kernel.qemu') == '1'
    assert s.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == 'MoFlight_Synthetic_API37'
    assert s.shell('getprop', 'ro.boot.qemu.avd_name') == 'MoFlight_Synthetic_API37'
    original = {k: s.shell('settings', 'get', 'global', k) for k in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
    s.report.update(boundary='Synthetic WebView cookie/local/session/IndexedDB removal, document recreation, SQLite/SecureStore sentinels. No live provider, server revocation, other apps, physical device or iOS.', original_network=original, viewport=viewport(s))
    try:
        s.shell('cmd', 'connectivity', 'airplane-mode', 'enable')
        s.shell('svc', 'wifi', 'disable'); s.shell('svc', 'data', 'disable')
        wait_network_state(s, {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'})
        launch(s); panel(s)
        for attempt in range(2):
            if attempt:
                launch(s); panel(s)  # Erase app-run feedback; cannot reuse a stale pass.
            control = panel_control(s, 'Synthetischer Browserstore-Test', enabled=True)
            s.tap_node(control)
            result = s.find('Synthetischer Store-Test bestanden:', exact=False, scroll=True, attempts=18)
            assert result.get('text') or result.get('content-desc')
            panel_control(s, 'Synthetischer Browserstore-Test', enabled=True)
            s.report['checks'].append({'name': f'native-synthetic-cookie-webstorage-document-and-independent-sentinels-{attempt + 1}', 'status': 'passed'})
            # The second explicit run must produce new proof, not a stale result.
            time.sleep(.2)
        s.shell('input', 'keyevent', 'KEYCODE_BACK'); tab(s, 'Flüge'); s.find('Flüge durchsuchen', exact=True)
        s.report['checks'].append({'name': 'local-library-reachable-after-store-clearing', 'status': 'passed'})
        s.report['status'] = 'passed'
    finally:
        s.shell('cmd', 'connectivity', 'airplane-mode', 'enable' if original['airplane_mode_on'] == '1' else 'disable')
        s.shell('svc', 'wifi', 'enable' if original['wifi_on'] in ['1', '2'] else 'disable')
        s.shell('svc', 'data', 'enable' if original['mobile_data'] == '1' else 'disable')
        restored = wait_network_state(s, original)
        s.report['restored_network'] = restored
        assert restored == original
        s.report['checks'].append({'name': 'original-network-restored-exactly', 'status': 'passed'})
        (s.output / 'report.json').write_text(json.dumps(s.report, indent=2), encoding='utf-8')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    execute(Smoke(args.output, args.serial, 'MoFlight_Synthetic_API37'))

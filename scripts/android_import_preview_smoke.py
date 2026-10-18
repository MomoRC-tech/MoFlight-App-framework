"""Non-destructive synthetic import preview acceptance on the named AVD only.

Only the preview's disposable memory is changed. Existing library and provider
sessions remain untouched. Network flags are read only; display is restored.
"""
import argparse
import hashlib
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch, tab, top
from android_mobile_width_matrix import bounds, capture, finish, override, save_report
from android_development_navigation_smoke import action, back, check, development

AVD = 'MoFlight_Synthetic_API37'


def editor(smoke, reference):
    top(smoke)
    action(smoke, f'Flug {reference} prüfen')
    smoke.find(f'Flug {reference} ·', scroll=True)


def confirm(smoke):
    action(smoke, 'Auswahl im Test bestätigen')
    smoke.find('im Test bestätigt.', scroll=True, up=False)


def library_facts(smoke):
    tab(smoke, 'Flüge')
    top(smoke)
    smoke.find('Gliding volume A')
    smoke.find('4', exact=True)
    smoke.find('1:10')


def open_preview(smoke):
    development(smoke)
    action(smoke, 'Importvorschau öffnen')
    smoke.find('Fiktive Flüge vergleichen')


def behavior(smoke):
    launch(smoke)
    library_facts(smoke)
    open_preview(smoke)
    smoke.find('Synthetischen Vergleich starten')
    check(smoke, 'entry-does-not-start-comparison')
    action(smoke, 'Synthetischen Vergleich starten')
    smoke.find('5 neu · 1 geändert · 1 unverändert · 1 widersprüchlich')
    action(smoke, 'Unvollständigen Testabruf prüfen')
    smoke.find('Unvollständigen Testabruf abgewiesen.', scroll=True, up=False)
    action(smoke, 'Vergleich erneut prüfen')
    smoke.find('Bestätigte Testauswahl bleibt erhalten.', scroll=True, up=False)
    check(smoke, 'incomplete-attempt-and-retry-retain-comparison')
    editor(smoke, '1002')
    smoke.find('Flugminuten: 12 → 14', scroll=True)
    action(smoke, 'Test-Segelflugbuch A')
    confirm(smoke)
    editor(smoke, '1003')
    action(smoke, 'Variante 2 wählen')
    action(smoke, 'Test-Segelflugbuch B')
    confirm(smoke)
    check(smoke, 'changed-choice-and-conflicting-variant-confirmed')
    editor(smoke, '1007')
    smoke.find('Flugminuten: unbekannt · Rolle: unbekannt', scroll=True)
    action(smoke, 'Später zuordnen')
    confirm(smoke)
    check(smoke, 'unknown-minutes-role-class-remain-unknown-and-deferred')
    action(smoke, 'Teststand übernehmen')
    smoke.find('0 neu · 0 geändert · 7 unverändert · 1 widersprüchlich', scroll=True, up=False)
    action(smoke, 'Vergleich erneut prüfen')
    back(smoke)
    action(smoke, 'Importvorschau öffnen')
    smoke.find('0 neu · 0 geändert · 7 unverändert · 1 widersprüchlich')
    editor(smoke, '1002')
    node = smoke.find('Test-Segelflugbuch A', scroll=True)
    assert node.get('selected') == 'true'
    action(smoke, 'Bearbeitung verwerfen')
    check(smoke, 'accepted-repeat-and-nested-return-preserve-manual-choice')


def matrix(smoke):
    for width, height, font in [(390, 900, 1.0), (360, 900, 1.6), (800, 600, 1.0)]:
        smoke.shell('wm', 'size', f'{width}x{height}')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
        launch(smoke)
        open_preview(smoke)
        action(smoke, 'Synthetischen Vergleich starten')
        top(smoke)
        smoke.find('Vergleichsergebnis', scroll=True)
        capture(smoke, f'{width}-font{font}-comparison', {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': font})
        editor(smoke, '1002')
        smoke.find('Flugminuten: 12 → 14', scroll=True)
        capture(smoke, f'{width}-font{font}-evidence', {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': font})
        action(smoke, 'Test-Segelflugbuch A')
        node = smoke.find('Auswahl im Test bestätigen', scroll=True)
        x1, y1, x2, y2 = bounds(node)
        assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height and y2 - y1 >= 48
        assert x2 - x1 <= 520
        if width >= 600:
            assert abs((x1 + x2) / 2 - width / 2) <= 2
        capture(smoke, f'{width}-font{font}-choices', {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': font})
        confirm(smoke)
        check(smoke, f'{width}-font{font}-choice-actions-reachable')


def execute(smoke, expected_hash, matrix_only=False):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD
    smoke.emulator = True
    original = {key: smoke.shell(*command) for key, command in [
        ('size', ('wm', 'size')), ('density', ('wm', 'density')),
        ('font_scale', ('settings', 'get', 'system', 'font_scale'))]}
    smoke.report.update(boundary='Disposable synthetic preview only. No saved-library write, seed, clear, restore or provider operation.', original_display=original)
    smoke.report['device'] = {key: smoke.shell('getprop', key) for key in ['ro.build.version.sdk', 'ro.product.model', 'ro.product.cpu.abi']}
    smoke.report['network_before'] = {key: smoke.shell('settings', 'get', 'global', key) for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
    assert smoke.report['network_before'] == {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}, 'Offline prerequisite not met; no network changes permitted'
    path = smoke.shell('pm', 'path', PACKAGE).removeprefix('package:')
    installed = smoke.output / 'installed-base.apk'
    smoke.adb('pull', path, str(installed))
    actual_hash = hashlib.sha256(installed.read_bytes()).hexdigest()
    assert actual_hash == expected_hash, 'Installed APK does not match the tested committed source'
    smoke.report['installed_apk_sha256'] = actual_hash
    smoke.report['installation_before'] = smoke.shell('dumpsys', 'package', PACKAGE)
    try:
        smoke.shell('wm', 'size', '390x900')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
        if not matrix_only:
            behavior(smoke)
        matrix(smoke)
        launch(smoke)
        library_facts(smoke)
        open_preview(smoke)
        smoke.find('Synthetischen Vergleich starten')
        check(smoke, 'offline-restart-discards-only-preview-preserves-library')
    finally:
        smoke.shell('wm', 'size', override(original['size'], r'Override size: (\d+x\d+)') or 'reset')
        smoke.shell('wm', 'density', override(original['density'], r'Override density: (\d+)') or 'reset')
        if original['font_scale'] == 'null':
            smoke.shell('settings', 'delete', 'system', 'font_scale')
        else:
            smoke.shell('settings', 'put', 'system', 'font_scale', original['font_scale'])
        smoke.report['restored_display'] = {key: smoke.shell(*command) for key, command in [
            ('size', ('wm', 'size')), ('density', ('wm', 'density')),
            ('font_scale', ('settings', 'get', 'system', 'font_scale'))]}
        smoke.report['network_after'] = {key: smoke.shell('settings', 'get', 'global', key) for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}
        assert smoke.report['restored_display'] == original
        assert smoke.report['network_before'] == smoke.report['network_after']
        save_report(smoke)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--expected-apk-sha256', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--matrix-only', action='store_true', help='Reuse applicable behavior evidence after a harness correction')
    args = parser.parse_args()
    assert not args.output.exists(), 'Use a new evidence directory'
    smoke = Smoke(args.output, args.serial, AVD)
    try:
        execute(smoke, args.expected_apk_sha256, args.matrix_only)
    except Exception as error:
        finish(smoke, 'failed', error)
        raise
    else:
        finish(smoke, 'passed')


if __name__ == '__main__':
    main()

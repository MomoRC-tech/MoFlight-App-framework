"""Non-destructive Development/backup navigation trial on the synthetic AVD.

Requires the committed Release already installed and the existing selected book.
Never clears/seeds/restores data or invokes provider operations. Native pickers
are cancelled. Display overrides are restored even on failure; network unchanged.
"""
import argparse
import re
import time
from pathlib import Path

from android_smoke import Smoke, PACKAGE
from android_mobile_ui_smoke import launch, tab, top
from android_mobile_width_matrix import bounds, capture, finish, override, save_report


BACK = 'Zur vorherigen App-Ansicht'
AVD = 'MoFlight_Synthetic_API37'


def check(smoke, name):
    smoke.report['checks'].append({'name': name, 'status': 'passed'})
    save_report(smoke)
    print('PASS ' + name, flush=True)


def absent(smoke, *labels):
    actual = [value for node in smoke.dump() for value in smoke.labels(node)]
    assert not any(label in value for label in labels for value in actual), labels


def profile(smoke):
    smoke.tap('Profil & Einstellungen öffnen')


def development(smoke):
    profile(smoke)
    smoke.tap('Entwicklung öffnen', scroll=True)
    smoke.find('Testwerkzeuge dieses experimentellen Lab-Builds')


def back(smoke):
    smoke.tap(BACK)


def action(smoke, label):
    """A card heading can have the same text as its button; select the button."""
    for _ in range(12):
        node = next((n for n in smoke.dump() if n.get('clickable') == 'true'
                     and n.get('enabled') == 'true' and n.get('content-desc') == label), None)
        # Android can expose off-screen scroll children with inverted/clipped
        # bounds. Never tap those coordinates (they may lie over the tab bar).
        if node is not None and bounds(node)[3] - bounds(node)[1] >= 48:
            smoke.tap_node(node)
            return
        smoke.swipe(up=True)
    raise AssertionError('Missing visible action: ' + label)


def book_facts(smoke):
    tab(smoke, 'Flüge')
    smoke.find('D-EX', scroll=True)
    top(smoke)
    smoke.find('4', exact=True)
    smoke.find('1:10')
    absent(smoke, 'Flugworkflow öffnen', 'Load four synthetic books')
    check(smoke, 'selected-library-four-flights-known-time-1h10')


def behavior(smoke):
    launch(smoke)
    book_facts(smoke)
    row = next(n for n in smoke.dump() if ', D-EX' in n.get('content-desc', '') and n.get('content-desc', '').endswith('Details öffnen') and n.get('clickable') == 'true')
    smoke.tap_node(row)
    smoke.find('Flugdetails')
    development(smoke)
    smoke.tap('Flugbuchtest öffnen', scroll=True)
    smoke.find('Synthetic pilot library loaded.', attempts=40)
    smoke.find('Selected: Gliding volume A', scroll=True)
    smoke.tap('Close multiple-logbook lab')
    smoke.find('Testwerkzeuge dieses experimentellen Lab-Builds', scroll=True, up=False)
    back(smoke)
    smoke.find('Entwicklung öffnen', scroll=True)
    back(smoke)
    smoke.find('Flugdetails', attempts=30)
    check(smoke, 'book-proof-exit-retains-detail-and-nested-profile-path')
    back(smoke)
    development(smoke)
    smoke.tap('Datensatztest öffnen')
    smoke.find('Remembered state loaded.', attempts=40)
    absent(smoke, 'Open multiple-logbook lab', 'Open Vereinsflieger access PoC')
    back(smoke)
    smoke.find('Testwerkzeuge dieses experimentellen Lab-Builds')
    check(smoke, 'dataset-proof-has-one-owner-no-duplicate-provider-entry')
    smoke.tap('Anbieterdiagnose öffnen', scroll=True)
    smoke.find('Synthetischer Browserstore-Test', scroll=True)
    absent(smoke, 'Browserstore-Test erfolgreich')
    smoke.tap('Verbindungen schließen und zur App zurückkehren')
    back(smoke)
    # Per-sheet offset is retained when returning to Settings.
    smoke.find('Entwicklung öffnen')
    top(smoke)
    smoke.tap('Sicherung & Wiederherstellung')
    smoke.find('Lokale synthetische Bibliothek · 4 Flugbücher', attempts=30)
    for action, result in [('Sicherung auswählen', 'Dateiauswahl abgebrochen.'),
                           ('In Geräteordner sichern', 'Ordnerauswahl abgebrochen.'),
                           ('Sicherung teilen', 'Sicherung vorbereitet.')]:
        top(smoke)
        smoke.tap(action, scroll=True)
        time.sleep(1)
        smoke.cancel_system_ui()
        smoke.find(result, scroll=True, up=False, attempts=25)
        smoke.find(BACK, enabled=True)
        check(smoke, 'native-cancel-' + action)
    back(smoke)
    top(smoke)
    smoke.tap('Datenstatus', scroll=True)
    smoke.tap('Vereinsflieger öffnen', scroll=True)
    smoke.find('Rohbelege und begrenzter Abruf', scroll=True)
    absent(smoke, 'Synthetischer Browserstore-Test')
    smoke.tap('Verbindungen schließen und zur App zurückkehren')
    smoke.find('Datenstatus', scroll=True, up=False)
    check(smoke, 'normal-source-and-recovery-entry-without-development-diagnostic')
    back(smoke)
    back(smoke)
    tab(smoke, 'Flugbuch')
    smoke.tap('Papierstand ansehen')
    smoke.find('Gespeicherter Papierstand')
    absent(smoke, 'Load four synthetic books', 'Prepare writing', 'I copied')
    check(smoke, 'normal-paper-read-only-no-proof-actions')
    back(smoke)
    smoke.tap('Flugbuch auswählen')
    absent(smoke, 'Load four synthetic books', 'Flugbuchtest öffnen')
    back(smoke)
    launch(smoke)
    book_facts(smoke)
    smoke.report['preservation'] = 'Same selected synthetic book, four flights and known time 1:10 after force-stop/reopen. No seed, clear, restore, provider action or network change.'


def layout(smoke, widths=None):
    for width, height, font in [(390, 900, 1.0), (360, 900, 1.6), (800, 600, 1.0)]:
        if widths and width not in widths:
            continue
        smoke.shell('wm', 'size', f'{width}x{height}')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
        launch(smoke)
        viewport = {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': font}
        for route in ['hub', 'backup', 'paper']:
            launch(smoke)
            if route == 'hub':
                development(smoke)
                target = 'Datensatztest öffnen'
            elif route == 'backup':
                tab(smoke, 'Flugbuch')
                action(smoke, 'Sicherung & Wiederherstellung')
                smoke.find('Lokale synthetische Bibliothek · 4 Flugbücher', attempts=30)
                target = 'In Geräteordner sichern'
            else:
                smoke.tap('Papierstand ansehen')
                target = 'Flugbuch auswählen'
            node = smoke.find(target, scroll=True)
            x1, y1, x2, y2 = bounds(node)
            assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height
            assert x2 - x1 <= 520 and y2 - y1 >= 48, (route, bounds(node))
            if width > 600:
                assert abs((x1 + x2) / 2 - width / 2) <= 2, (route, bounds(node))
            header = smoke.find(BACK)
            assert bounds(header)[2] - bounds(header)[0] >= 48
            # All remaining actions must be reachable by ordinary scrolling.
            capture(smoke, f'{width}-font{font}-{route}', viewport)
            smoke.report['checks'][-1]['assertion_scope'] = 'Target action inside viewport, at least 48dp high; 48dp Back; body/action capped and centered at wide width. Remaining actions checked separately. Visual review still required.'
            save_report(smoke)
            if route == 'hub':
                smoke.find('Anbieterdiagnose öffnen', scroll=True)
            elif route == 'backup':
                smoke.find('Sicherung auswählen', scroll=True)
            else:
                smoke.find('Sicherung & Wiederherstellung', scroll=True)
            check(smoke, f'{width}-font{font}-{route}-actions-reachable')
        if width == 360:
            launch(smoke)
            profile(smoke)
            field = smoke.find('Anzeigename', resource='')
            # Select the actual editable field, not the adjacent label.
            field = next(n for n in smoke.dump() if n.get('class') == 'android.widget.EditText')
            smoke.tap_node(field)
            assert 'mInputShown=true' in smoke.shell('dumpsys', 'input_method')
            smoke.shell('input', 'text', 'UNSAVED')
            smoke.shell('input', 'keyevent', 'KEYCODE_BACK')
            smoke.tap('Entwicklung öffnen', scroll=True)
            back(smoke)
            top(smoke)
            smoke.find('UNSAVED')
            check(smoke, 'narrow-enlarged-profile-keyboard-unsaved-draft-survives-hub')
    launch(smoke)  # Drops the deliberately unsaved draft, no save was invoked.
    book_facts(smoke)


def execute(smoke, matrix=True, behavior_checks=True, widths=None):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == AVD
    smoke.emulator = True
    smoke.report['boundary'] = 'Existing synthetic library; no data clearing/seeding/restoring or provider actions. Picker/share cancellation only. No physical/iOS/live-provider acceptance.'
    original = {key: smoke.shell(*command) for key, command in [
        ('size', ('wm', 'size')), ('density', ('wm', 'density')),
        ('font_scale', ('settings', 'get', 'system', 'font_scale'))]}
    smoke.report['original_display'] = original
    smoke.report['device'] = {key: smoke.shell('getprop', key) for key in ['ro.build.version.sdk', 'ro.product.model', 'ro.product.cpu.abi']}
    try:
        smoke.shell('wm', 'size', '390x900')
        smoke.shell('wm', 'density', '160')
        smoke.shell('settings', 'put', 'system', 'font_scale', '1.0')
        if behavior_checks:
            behavior(smoke)
        if matrix:
            layout(smoke, widths)
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
        assert smoke.report['restored_display'] == original
        save_report(smoke)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--skip-matrix', action='store_true')
    parser.add_argument('--matrix-only', action='store_true', help='Reuse applicable passed behavior evidence after a layout-harness correction')
    parser.add_argument('--widths', nargs='+', type=int, choices=[360, 390, 800], help='Run only specified matrix widths; preserve earlier applicable evidence')
    args = parser.parse_args()
    assert not args.output.exists(), 'Use a new evidence directory'
    smoke = Smoke(args.output, args.serial, AVD)
    try:
        assert not (args.skip_matrix and args.matrix_only)
        execute(smoke, not args.skip_matrix, not args.matrix_only, args.widths)
    except Exception as error:
        finish(smoke, 'failed', error)
        raise
    else:
        finish(smoke, 'passed')


if __name__ == '__main__':
    main()

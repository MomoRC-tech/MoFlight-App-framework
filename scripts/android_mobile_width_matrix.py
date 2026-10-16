"""Capture the four native tabs at MIN/MAIN/MAX widths on the synthetic AVD.

Requires an installed APK and the already selected synthetic book. Never seeds,
clears or injects data. Saves screenshot/XML evidence; visual fidelity still
requires human image review. Uses only Python's standard library and adb.
"""
import argparse
import json
import re
import time
from pathlib import Path

from android_smoke import Smoke
from android_mobile_ui_smoke import launch, tab


AVD = 'MoFlight_Synthetic_API37'
TABS = [('Übersicht', 'home'), ('Flüge', 'flights'), ('Verein', 'club'), ('AI', 'ai')]
VIEWPORTS = [(360, 900, 1.0), (390, 900, 1.0), (411, 900, 1.0),
             (600, 1100, 1.0), (840, 1100, 1.0), (360, 900, 1.4)]


def bounds(node):
    values = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
    assert len(values) == 4, 'Missing accessibility bounds'
    return values


def override(raw, pattern):
    match = re.search(pattern, raw)
    return match.group(1) if match else None


def capture(smoke, name, viewport):
    smoke.dump()
    smoke.record(name)
    prefix = f"{len(smoke.report['checks']):02d}-{name}"
    (smoke.output / f'{prefix}.xml').write_text(
        (smoke.output / 'last-screen.xml').read_text(encoding='utf-8'), encoding='utf-8')
    smoke.report['checks'][-1].update({
        'viewport': viewport, 'screenshot': f'{prefix}.png', 'hierarchy': f'{prefix}.xml',
        'assertion_scope': 'Visible native controls and selected tab; screenshot requires visual review',
    })
    save_report(smoke)


def save_report(smoke):
    (smoke.output / 'report.json').write_text(
        json.dumps(smoke.report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def finish(smoke, status, error=None):
    """Finalize locally: Smoke.finish also changes networking, so never call it."""
    smoke.report['status'] = status
    if error is not None:
        smoke.report['error'] = str(error)
    if not smoke.emulator:
        smoke.report['diagnostics'] = {'status': 'not collected', 'reason': 'Device selection rejected'}
    elif error is not None:
        try:
            # Display restoration already ran; identify this diagnostic honestly.
            (smoke.output / 'failure-after-display-restoration.png').write_bytes(
                smoke.adb('exec-out', 'screencap', '-p', binary=True).stdout)
            smoke.report['diagnostics'] = {'status': 'complete', 'display': 'Original settings restored before capture'}
        except Exception as diagnostic_error:
            smoke.report['diagnostics'] = {'status': 'incomplete', 'error_type': type(diagnostic_error).__name__}
    save_report(smoke)


def assert_navigation(smoke, selected, width, height):
    nodes = smoke.dump()
    for title, _ in TABS:
        matches = [node for node in nodes if node.get('content-desc') == title
                   and node.get('clickable') == 'true']
        assert len(matches) == 1, f'Expected one visible navigation control: {title}'
        node = matches[0]
        assert node.get('selected') == str(title == selected).lower(), f'Incorrect selected tab: {title}'
        assert node.get('enabled') == 'true', f'Disabled navigation control: {title}'
        x1, y1, x2, y2 = bounds(node)
        assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height, f'Navigation outside viewport: {title}'


def keyboard_trial(smoke, viewport, name):
    smoke.tap_node(smoke.find('Nachricht an MoFlight AI', exact=True, scroll=True))
    smoke.shell('input', 'text', 'Width%stest')
    time.sleep(1)
    method = smoke.shell('dumpsys', 'input_method')
    assert re.search(r'(?:mInputShown|mIsInputViewShown|isInputViewShown)\s*[=:]\s*true', method), 'IME did not open'
    (smoke.output / f'{name}-input-method.txt').write_text(method, encoding='utf-8')
    send = smoke.find('Nachricht senden', exact=True, scroll=True, attempts=8)
    assert send.get('enabled') == 'true', 'Composer send control disabled with a draft'
    nodes = smoke.dump()
    # Preserve the trial viewport even when an overlay assertion fails and the
    # outer finally subsequently restores the emulator's original display.
    (smoke.output / f'{name}-observed.xml').write_text(
        (smoke.output / 'last-screen.xml').read_text(encoding='utf-8'), encoding='utf-8')
    (smoke.output / f'{name}-observed.png').write_bytes(
        smoke.adb('exec-out', 'screencap', '-p', binary=True).stdout)
    width, height = viewport['width_dp'], viewport['height_dp']
    # Android's keyboard content container bounds provide an observable overlay
    # boundary. Exclude fullscreen IME accessibility wrappers starting at y=0.
    keyboard = [bounds(n) for n in nodes if ('inputmethod' in n.get('package', '')
                or 'keyboard' in n.get('package', '').lower()) and n.get('bounds')]
    panels = [b for b in keyboard if b[1] > 0 and b[2] - b[0] >= width * .8
              and b[3] - b[1] >= height * .1]
    assert panels, 'Cannot establish keyboard overlay bounds from native hierarchy'
    keyboard_top = min(b[1] for b in panels)
    x1, y1, x2, y2 = bounds(send)
    assert 0 <= x1 < x2 <= width and 0 <= y1 < y2 <= keyboard_top, 'Send button overlaps keyboard or viewport edge'
    capture(smoke, name, {**viewport, 'keyboard_top_px': keyboard_top,
                         'send_bounds_px': [x1, y1, x2, y2]})
    # Dismiss without submitting or mutating persisted assistant history.
    smoke.shell('input', 'keyevent', 'KEYCODE_BACK')


def execute(smoke):
    # No emulator/display/app mutation is allowed before both safety checks pass.
    assert smoke.serial, 'An explicit emulator serial is required'
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1', 'Refusing a physical device'
    actual = smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip()
    assert actual == AVD, f'Refusing other AVD: {actual}'
    smoke.emulator = True
    original = {
        'size': smoke.shell('wm', 'size'), 'density': smoke.shell('wm', 'density'),
        'font_scale': smoke.shell('settings', 'get', 'system', 'font_scale'),
    }
    smoke.report['original_display'] = original
    smoke.report['device'] = {key: smoke.shell('getprop', key) for key in
                              ['ro.build.version.sdk', 'ro.product.model', 'ro.product.cpu.abi']}
    smoke.report['boundary'] = ('Native synthetic book UI only. No data reset, fixture injection, '
                                'network changes, live-service or iOS acceptance. Automated checks '
                                'do not establish pixel fidelity or absence of all text clipping.')
    try:
        for width, height, font in VIEWPORTS:
            smoke.shell('wm', 'size', f'{width}x{height}')
            smoke.shell('wm', 'density', '160')
            smoke.shell('settings', 'put', 'system', 'font_scale', str(font))
            viewport = {'width_dp': width, 'height_dp': height, 'density_dpi': 160, 'font_scale': font,
                        'actual_size': smoke.shell('wm', 'size'),
                        'actual_density': smoke.shell('wm', 'density')}
            assert re.findall(r'(\d+)x(\d+)', viewport['actual_size'])[-1] == (str(width), str(height))
            assert re.findall(r'\d+', viewport['actual_density'])[-1] == '160'
            launch(smoke)
            prefix = f'w{width}-h{height}-font{font:g}'
            for title, slug in TABS:
                tab(smoke, title)
                assert_navigation(smoke, title, width, height)
                capture(smoke, f'{prefix}-{slug}', viewport)
            if width == 360:
                keyboard_trial(smoke, viewport, f'{prefix}-ai-keyboard')
    finally:
        # Restore actual pre-existing overrides, including an absent font setting.
        # Attempt every restoration even if one adb command fails.
        commands = [
            ('wm', 'size', override(original['size'], r'Override size:\s*(\d+x\d+)') or 'reset'),
            ('wm', 'density', override(original['density'], r'Override density:\s*(\d+)') or 'reset'),
            (('settings', 'delete', 'system', 'font_scale') if original['font_scale'] == 'null'
             else ('settings', 'put', 'system', 'font_scale', original['font_scale'])),
        ]
        errors = []
        for command in commands:
            try:
                smoke.shell(*command)
            except Exception as error:
                errors.append(f'{command}: {error}')
        restored = {}
        for key, command in [('size', ('wm', 'size')), ('density', ('wm', 'density')),
                             ('font_scale', ('settings', 'get', 'system', 'font_scale'))]:
            try:
                restored[key] = smoke.shell(*command)
                if restored[key] != original[key]:
                    errors.append(f'{key}: restored value differs from original')
            except Exception as error:
                errors.append(f'{key} verification: {error}')
        smoke.report['restoration'] = {'status': 'failed' if errors else 'passed', 'errors': errors,
                                       'actual_display': restored,
                                       'network': 'Never changed by this script'}
        save_report(smoke)
        if errors:
            raise RuntimeError('Display restoration failed: ' + '; '.join(errors))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, default=Path('local-data/android-mobile-width-matrix'))
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

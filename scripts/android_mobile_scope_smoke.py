"""Additional book/filter-state checks after android_mobile_ui_smoke.py seeded its synthetic fixture."""
import argparse
from pathlib import Path
from android_smoke import Smoke
from android_mobile_ui_smoke import tab, launch


def execute(smoke):
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == 'MoFlight_Synthetic_API37'
    smoke.emulator = True
    smoke.report['boundary'] = 'Existing opt-in synthetic fixture only. Book-scoped summary, remembered selection and tab filter state; no provider/auth/AI service acceptance.'
    smoke.shell('wm', 'size', '390x900')
    smoke.shell('wm', 'density', '160')
    launch(smoke)
    tab(smoke, 'Flüge')
    smoke.tap('2026')
    smoke.tap('Schulung')
    tab(smoke, 'Verein')
    tab(smoke, 'Flüge')
    for label in ['2026', 'Schulung']:
        assert any(n.get('content-desc') == label and n.get('selected') == 'true' for n in smoke.dump()), label
    smoke.record('year-and-training-selection-preserved-across-tabs')
    smoke.tap('Alle')
    smoke.tap('Alle Jahre')
    smoke.tap('Flugbuch auswählen')
    smoke.tap('Gliding volume B')
    smoke.find('Gliding volume B')
    assert any(n.get('text') == '0:30' for n in smoke.dump())
    smoke.record('selected-book-B-has-independent-known-time')
    smoke.tap('Flugbuch auswählen')
    smoke.tap('Gliding volume A')
    smoke.find('Gliding volume A')
    assert any(n.get('text') == '1:10' for n in smoke.dump())
    smoke.record('selected-book-A-restores-own-known-time')
    launch(smoke)
    tab(smoke, 'Flüge')
    smoke.find('Gliding volume A')
    assert any(n.get('text') == '1:10' for n in smoke.dump())
    smoke.record('selected-book-and-summary-survive-restart')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', type=Path, default=Path('local-data/android-mobile-scope'))
    args = parser.parse_args()
    smoke = Smoke(args.output, args.serial, 'MoFlight_Synthetic_API37')
    try:
        execute(smoke)
    except Exception as error:
        smoke.finish('failed', error)
        raise
    else:
        smoke.finish('passed')
    finally:
        if smoke.emulator:
            smoke.shell('wm', 'size', 'reset')
            smoke.shell('wm', 'density', 'reset')


if __name__ == '__main__':
    main()

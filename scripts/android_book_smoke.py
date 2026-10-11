"""Additional synthetic multi-book native UI checks on a named disposable AVD.

Run after android_smoke.py using the same Release APK. Never resets app data,
installs on a provider-session emulator, injects databases or accesses credentials.
"""
import argparse
import json
import hashlib
from pathlib import Path
from android_smoke import Smoke


def book_top(smoke):
    for _ in range(30):
        if any('Multiple-logbook lab' in smoke.labels(n) for n in smoke.dump()):
            return
        smoke.swipe(up=False, duration=80)
    raise AssertionError('Could not reach multi-book controls')


def open_books(smoke):
    smoke.launch()
    smoke.tap('Open multiple-logbook lab')
    smoke.find('Synthetic pilot library loaded.', attempts=40)


def execute(smoke):
    assert smoke.serial and smoke.expected_avd == 'MoFlight_Synthetic_API37'
    assert smoke.shell('getprop', 'ro.kernel.qemu') == '1'
    assert smoke.adb('emu', 'avd', 'name').stdout.splitlines()[0].strip() == smoke.expected_avd
    smoke.emulator = True
    smoke.report['boundary'] = 'Dedicated synthetic AVD; multi-book UI, native SQLite, external backup/picker. No live provider, physical phone, iOS or real formats.'
    open_books(smoke)
    smoke.tap('Load four synthetic books')
    smoke.find('Four synthetic books and explicit routing loaded.', attempts=40)
    smoke.record('four-books-created-with-explicit-synthetic-routing')
    smoke.tap('Use paper aircraft_model in selected book', scroll=True)
    book_top(smoke)
    smoke.tap('Prepare selected-book writing snapshot', scroll=True)
    smoke.tap('Confirm only entry 70 copied', scroll=True)
    book_top(smoke)
    smoke.find('Confirmed copied entries: 1.', scroll=True)
    smoke.record('selected-gliding-book-review-write-and-individual-confirmation')
    book_top(smoke)
    smoke.tap('Open book: Gliding volume B')
    smoke.find('Confirmed copied entries: 0.', scroll=True)
    smoke.tap('Prepare selected-book writing snapshot', scroll=True)
    smoke.tap('Confirm only entry 1 copied', scroll=True)
    book_top(smoke)
    smoke.find('Confirmed copied entries: 1.', scroll=True)
    smoke.record('second-format-independent-copy-state-and-overlapping-position')
    open_books(smoke)
    smoke.find('Selected: Gliding volume B')
    smoke.find('Confirmed copied entries: 1.', scroll=True)
    smoke.record('selected-book-and-copied-state-survive-offline-force-stop')

    old_files = set(smoke.external_files())
    smoke.tap('Save pilot backup to a device folder', scroll=True)
    smoke.picker_ready()
    smoke.tap('MoFlightSmoke')
    select = next(n for n in smoke.dump() if any(v.lower() == 'use this folder' for v in smoke.labels(n)))
    smoke.tap_node(select)
    smoke.tap_node(smoke.resource('android:id/button1'))
    book_top(smoke)
    smoke.find('Pilot backup saved and verified in the selected device folder.', attempts=40)
    new_files = set(smoke.external_files()) - old_files
    assert len(new_files) == 1
    filename = new_files.pop()
    backup = smoke.read_external(filename)
    envelope = json.loads(backup)
    assert envelope['format'] == 'moflight-pilot-proof-v1'
    assert len(json.loads(envelope['payload'])['books']) == 4
    smoke.record('actual-external-complete-pilot-backup')
    smoke.tap('Restore pilot backup into new library', scroll=True)
    smoke.picker_ready()
    smoke.tap_node(smoke.find(filename, exact=True, scroll=True, attempts=15, enabled=True, resource='android:id/title'))
    book_top(smoke)
    smoke.find('Pilot backup restored to a new database; previous library preserved.', attempts=40)
    smoke.find('Confirmed copied entries: 1.', scroll=True)
    smoke.record('actual-document-picker-restores-pilot-backup')
    open_books(smoke)
    smoke.find('Selected: Gliding volume B')
    smoke.find('Confirmed copied entries: 1.', scroll=True)
    smoke.record('restored-pilot-library-selection-survives-offline-restart')
    book_top(smoke)
    smoke.tap('Close multiple-logbook lab')
    smoke.find('11 individually confirmed paper entries.', scroll=True)
    smoke.record('multi-book-proof-preserves-original-schema-v1-lab')
    original = smoke.selected_database()
    report = json.loads(Path('local-data/android-smoke/report.json').read_text(encoding='utf-8'))
    envelope = json.loads(smoke.read_external(report['external_backup']['filename']))
    payload = json.loads(envelope['payload'])
    flight = next(r for r in payload['records'] if r['kind'] == 'flight')
    value = json.loads(flight['payload'])
    value['registration'] = {'unsupported': 'object'}
    flight['payload'] = json.dumps(value, separators=(',', ':'))
    envelope['payload'] = json.dumps(payload, separators=(',', ':'))
    envelope['checksum'] = hashlib.sha256(envelope['payload'].encode()).hexdigest()
    smoke.push_document('invalid-semantics.json', json.dumps(envelope))
    smoke.choose_restore('invalid-semantics.json')
    smoke.find('String or null flight field required')
    assert smoke.selected_database() == original
    smoke.find('11 individually confirmed paper entries.', scroll=True)
    smoke.launch()
    assert smoke.selected_database() == original
    smoke.record('checksum-valid-semantic-backup-rejected-with-original-selection-after-restart')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--expected-avd', required=True, choices=['MoFlight_Synthetic_API37'])
    parser.add_argument('--output', type=Path, default=Path('local-data/android-books'))
    args = parser.parse_args()
    smoke = Smoke(args.output, args.serial, args.expected_avd)
    try:
        execute(smoke)
    except Exception as error:
        smoke.finish('failed', error)
        raise
    else:
        smoke.finish('passed')


if __name__ == '__main__':
    main()

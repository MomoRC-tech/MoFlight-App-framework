"""Synthetic lab UI checks on an Android emulator; never clears a physical phone.

No Metro, test-only app API, database injection or third-party Python package.
The release APK uses the same native SQLite adapter and buttons as the lab UI.
"""
import argparse
import hashlib
import json
import re
import subprocess
import time
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

PACKAGE = "de.momorc.moflight.lab"


def check_apk(path):
    with zipfile.ZipFile(path) as apk:
        names = apk.namelist()
        assert apk.getinfo("assets/index.android.bundle").file_size > 0, "No embedded JavaScript"
        for arch in ("arm64-v8a", "x86_64"):
            assert any(n.startswith(f"lib/{arch}/") for n in names), f"Missing {arch}"
    return {"apk_sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "apk_bytes": path.stat().st_size, "embedded_javascript": True,
            "architectures": ["arm64-v8a", "x86_64"]}


class Smoke:
    def __init__(self, output):
        self.output = output
        output.mkdir(parents=True, exist_ok=True)
        self.report = {"status": "running", "checks": [], "boundary":
                       "Android emulator only; synthetic prepared observations/CSV. "
                       "Native UI and external synthetic backup/picker checks. "
                       "No OCR, live retrieval, cloud Auth, physical phone or iOS."}
        self.screen = None
        self.emulator = False

    def adb(self, *args, check=True, binary=False):
        return subprocess.run(["adb", *args], check=check, capture_output=True,
                              text=not binary, timeout=45)

    def shell(self, *args, check=True):
        return self.adb("shell", *args, check=check).stdout.strip()

    def dump(self):
        # Dump after the preceding tap/scroll has settled; retries cover startup.
        self.shell("uiautomator", "dump", "/sdcard/moflight-smoke.xml")
        xml = self.shell("cat", "/sdcard/moflight-smoke.xml")
        self.screen = ET.fromstring(xml)
        (self.output / "last-screen.xml").write_text(xml)
        return list(self.screen.iter("node"))

    @staticmethod
    def labels(node):
        return [node.get("text", ""), node.get("content-desc", "")]

    def find(self, text, *, exact=False, scroll=False, attempts=12):
        for _ in range(attempts):
            try:
                nodes = self.dump()
                labels = [label for node in nodes for label in self.labels(node)]
                system_anr = next((v for v in labels if v in {
                    "Pixel Launcher isn't responding", "System UI isn't responding"}), None)
                if system_anr:
                    # A background emulator shell/launcher dialog may cover a
                    # healthy app. Never dismiss a MoFlight/app error dialog.
                    events = self.report.setdefault("emulator_dialogs", [])
                    if len(events) >= 4:
                        raise AssertionError('Repeated emulator system ANRs block this trial')
                    close = next(n for n in nodes if n.get('resource-id') == 'android:id/aerr_close')
                    x1, y1, x2, y2 = map(int, re.findall(r"\d+", close.get('bounds', '')))
                    events.append({"dialog": system_anr, "action": "close background system app"})
                    print(f"EMULATOR: {system_anr}; closing background system app", flush=True)
                    self.shell('input', 'tap', str((x1 + x2) // 2), str((y1 + y2) // 2))
                    time.sleep(.5)
                    continue
                for node in nodes:
                    if any(label == text if exact else text in label for label in self.labels(node)):
                        bounds = list(map(int, re.findall(r"\d+", node.get("bounds", ""))))
                        if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                            return node
            except (ET.ParseError, subprocess.CalledProcessError):
                pass
            if scroll:
                self.swipe(up=True)
            else:
                time.sleep(0.5)
        raise AssertionError(f"Visible UI did not contain {text!r}")

    def swipe(self, *, up, duration=700):
        size = self.shell("wm", "size")
        width, height = map(int, re.findall(r"(\d+)x(\d+)", size)[-1])
        start, end = (int(height * .8), int(height * .3))
        if not up:
            start, end = end, start
        self.shell("input", "swipe", str(width // 2), str(start), str(width // 2), str(end), str(duration))

    def tap(self, text, *, scroll=False):
        node = self.find(text, exact=True, scroll=scroll, attempts=100 if scroll else 12)
        self.tap_node(node)

    def tap_node(self, node):
        text = node.get('text') or node.get('content-desc') or node.get('resource-id')
        assert node.get("enabled") == "true", f"Disabled button: {text}"
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds", "")))
        self.shell("input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        time.sleep(0.5)

    def top(self):
        for _ in range(25):
            if any('MoFlight Lab' in self.labels(n) for n in self.dump()):
                return
            self.swipe(up=False, duration=60)
        raise AssertionError('Could not scroll back to app status')

    def resource(self, suffix):
        for _ in range(15):
            match = next((n for n in self.dump() if n.get('resource-id', '').endswith(suffix)), None)
            if match is not None:
                return match
            time.sleep(.5)
        raise AssertionError(f'Android UI resource absent: {suffix}')

    def picker_ready(self):
        for _ in range(20):
            if any('documentsui' in n.get('package', '') for n in self.dump()):
                return
            time.sleep(.5)
        raise AssertionError('Actual Android DocumentsUI picker did not open')

    def choose_restore(self, filename):
        self.launch()
        self.tap('Restore a backup into a new local database', scroll=True)
        self.picker_ready()
        # Navigate the real storage provider; adb never supplies the chosen URI.
        self.tap('Show roots')
        self.tap('sdk_gphone64_x86_64')
        self.tap('Documents')
        self.tap('MoFlightSmoke')
        self.tap(filename)
        self.top()

    def selected_database(self):
        self.top()
        node = self.find('Local dataset: synthetic-lab-')
        return next(v for v in self.labels(node) if v.startswith('Local dataset:'))

    def copy_state(self, snapshot, *, count=10, pending=True):
        self.find(f'{count} individually confirmed paper entries.', scroll=True)
        self.find('Source DG-1000 S / paper ASK 21 · override', scroll=True)
        self.tap('ASK 21', scroll=True)
        self.find('4 established flights', scroll=True)
        assert self.snapshot_id() == snapshot
        node = self.find('This entry is confirmed copied', exact=True, scroll=True, attempts=100)
        assert node.get('enabled') == 'false', 'Entry 70 can be confirmed twice'
        if pending:
            node = self.find('I copied only entry 71 to page 8, row 1', exact=True, scroll=True, attempts=100)
            assert node.get('enabled') == 'true', 'Entry 71 was unexpectedly confirmed or blocked'

    def save_external(self):
        self.launch()
        self.tap('Save synthetic backup to a device folder', scroll=True)
        self.picker_ready()
        self.tap('MoFlightSmoke')
        select = next((n for n in self.dump() if any(v.lower() == 'use this folder' for v in self.labels(n))), None)
        assert select is not None, 'Folder picker has no selection action'
        self.tap_node(select)
        allow = self.resource('android:id/button1')
        assert any(v.lower() == 'allow' for v in self.labels(allow)), 'Unexpected folder grant dialog'
        self.tap_node(allow)
        self.top()
        self.find('Backup saved and verified in the selected device folder.')

    def external_files(self):
        return self.shell('ls', '/sdcard/Documents/MoFlightSmoke').splitlines()

    def push_document(self, filename, text):
        # Input files belong to the normal external document provider, never DB/app storage.
        path = self.output / filename
        path.write_text(text)
        self.adb('push', str(path), f'/sdcard/Documents/MoFlightSmoke/{filename}')

    def read_external(self, filename):
        return self.shell('cat', f'/sdcard/Documents/MoFlightSmoke/{filename}')

    def launch(self):
        self.shell("am", "force-stop", PACKAGE)
        self.shell("am", "start", "-W", "-n", f"{PACKAGE}/.MainActivity")
        self.find("Remembered state loaded.", attempts=40)

    def record(self, name):
        self.report["checks"].append({"name": name, "status": "passed"})
        shot = self.adb("exec-out", "screencap", "-p", binary=True).stdout
        (self.output / f"{len(self.report['checks']):02d}-{name}.png").write_bytes(shot)
        (self.output / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")
        print(f"PASS: {name}", flush=True)

    def snapshot_id(self):
        # Dataset activation can resize the long ScrollView. Start from its
        # visible heading and avoid a fast fling skipping the short ID label.
        self.top()
        node = self.find("Fixed snapshot ", scroll=True, attempts=45)
        label = next(v for v in self.labels(node) if "Fixed snapshot " in v)
        found = re.search(r"Fixed snapshot ([^. ]+)", label)
        assert found, label
        return found.group(1)

    def execute(self, apk):
        assert self.shell("getprop", "ro.kernel.qemu") == "1", "Refusing to reset a physical phone"
        self.emulator = True
        self.report.update(check_apk(apk))
        self.report["device"] = {k: self.shell("getprop", k) for k in
                                 ("ro.build.version.sdk", "ro.product.model", "ro.product.cpu.abi")}
        # A smaller software-rendered emulator limits CI graphics overhead.
        # Record its actual settings; this is not a Pixel/physical-screen claim.
        self.shell("wm", "size", "480x800")
        self.shell("wm", "density", "160")
        self.report["display"] = {"size": self.shell("wm", "size"),
                                  "density": self.shell("wm", "density")}
        self.shell("logcat", "-c")
        # The entire native fixture journey is offline, also avoiding Google
        # background downloads during the first boot of this disposable image.
        self.shell("cmd", "connectivity", "airplane-mode", "enable")
        self.shell("svc", "wifi", "disable")
        self.shell("svc", "data", "disable")
        self.adb("install", "-r", str(apk))
        assert self.shell("pm", "clear", PACKAGE) == "Success"
        self.launch()
        self.find("0 individually confirmed paper entries.", scroll=True)
        self.record("fresh-install-empty-without-metro")

        self.launch()
        self.tap("Import prepared synthetic CSV and page")
        self.find("9 individually confirmed paper entries.", scroll=True)
        self.tap("Override effective aircraft_model with paper value", scroll=True)
        self.tap("ASK 21", scroll=True)
        self.find("4 established flights", scroll=True)
        self.record("native-import-decision-exact-query")
        self.tap("Prepare a new fixed writing snapshot", scroll=True)
        snapshot = self.snapshot_id()
        self.report["snapshot_id"] = snapshot
        self.record("fixed-writing-snapshot-prepared")

        # Network state is explicitly set and read back. No app endpoint/Metro is run.
        self.shell("cmd", "connectivity", "airplane-mode", "enable")
        self.shell("svc", "wifi", "disable")
        self.shell("svc", "data", "disable")
        assert self.shell("settings", "get", "global", "airplane_mode_on") == "1"
        assert self.shell("settings", "get", "global", "wifi_on") == "0"
        self.report["airplane_mode"] = True
        self.launch()
        self.find("9 individually confirmed paper entries.", scroll=True)
        self.find("Source DG-1000 S / paper ASK 21 · override", scroll=True)
        self.tap("ASK 21", scroll=True)
        self.find("4 established flights", scroll=True)
        assert self.snapshot_id() == snapshot, "Writing snapshot changed across offline process restart"
        self.record("airplane-mode-force-stop-reopen-same-state")

        self.launch()
        self.tap("Open dataset B")
        self.find("0 individually confirmed paper entries.", scroll=True)
        self.find("Last successful import: none", scroll=True)
        self.find("0 established flights", scroll=True)
        self.record("empty-dataset-b-isolated")
        self.launch()
        self.find("Local dataset: synthetic-lab-b")
        self.tap("Open dataset A")
        self.find("9 individually confirmed paper entries.", scroll=True)
        self.find("Source DG-1000 S / paper ASK 21 · override", scroll=True)
        assert self.snapshot_id() == snapshot
        self.record("selection-survives-restart-original-dataset-preserved")

        self.launch()
        self.tap("Import prepared synthetic CSV and page")
        self.find("9 individually confirmed paper entries.", scroll=True)
        self.tap("ASK 21", scroll=True)
        self.find("4 established flights", scroll=True)
        assert self.snapshot_id() == snapshot
        self.record("repeated-import-does-not-duplicate-or-rewrite-snapshot")

        self.tap('I copied only entry 70 to page 7, row 10', scroll=True)
        node = self.find('This entry is confirmed copied', exact=True)
        assert node.get('enabled') == 'false'
        node = self.find('I copied only entry 71 to page 8, row 1', exact=True, scroll=True, attempts=100)
        assert node.get('enabled') == 'true'
        self.record('copy-only-entry-70-entry-71-still-pending')
        self.launch()
        self.copy_state(snapshot)
        self.record('copied-state-survives-offline-restart')

        self.shell('mkdir', '-p', '/sdcard/Documents/MoFlightSmoke')
        assert not self.external_files(), 'External test folder must start empty'
        for button, expected, name in [
            ('Save synthetic backup to a device folder', 'Backup save cancelled. No external file created.', 'cancel-folder-save-preserves-data'),
            ('Restore a backup into a new local database', 'Backup restore cancelled. Current data unchanged.', 'cancel-restore-preserves-data'),
        ]:
            self.launch()
            before = self.selected_database()
            self.tap(button, scroll=True)
            self.picker_ready()
            self.shell('input', 'keyevent', 'KEYCODE_BACK')
            self.top()
            self.find(expected)
            assert self.selected_database() == before
            self.find('10 individually confirmed paper entries.')
            assert not self.external_files()
            self.record(name)

        self.launch()
        self.tap('Save / share versioned synthetic backup', scroll=True)
        for _ in range(20):
            if any(n.get('package') in {'android', 'com.android.intentresolver'} for n in self.dump()):
                break
            time.sleep(.5)
        else:
            raise AssertionError('Native share sheet did not open')
        self.shell('input', 'keyevent', 'KEYCODE_BACK')
        self.top()
        self.find('Backup prepared in app storage. Sharing does not confirm external saving.')
        assert not self.external_files()
        self.find('10 individually confirmed paper entries.')
        self.record('share-cancellation-does-not-claim-external-backup')

        self.save_external()
        files = self.external_files()
        assert len(files) == 1 and files[0].endswith('.json'), files
        filename = files[0]
        backup = self.read_external(filename)
        envelope = json.loads(backup)
        assert envelope['format'] == 'moflight-native-lab-backup-v1'
        assert hashlib.sha256(envelope['payload'].encode()).hexdigest() == envelope['checksum']
        payload = json.loads(envelope['payload'])
        assert payload['dataset_id'] == 'synthetic-lab-a' and payload['schema'] == 1
        rows = payload['records']
        papers = {r['id'] for r in rows if r['kind'] == 'paper'}
        assert len(papers) == 10 and 'fixture:f70' in papers and 'fixture:f71' not in papers
        assert any(r['kind'] == 'template' and r['id'] == snapshot for r in rows)
        assert any(r['kind'] == 'import' and json.loads(r['payload']).get('raw_csv') for r in rows)
        assert any(r['kind'] == 'observation' and json.loads(r['payload']).get('raw_page') for r in rows)
        self.report['external_backup'] = {'filename': filename, 'sha256': hashlib.sha256(backup.encode()).hexdigest(),
                                          'record_revisions': len(rows), 'paper_entries': 10, 'checksum_verified': True}
        self.record('external-folder-backup-original-bytes-history-and-checksum')

        bad_checksum = dict(envelope, checksum='0' * 64)
        for bad_name, text, error, checkpoint in [
            ('invalid-checksum.json', json.dumps(bad_checksum), 'Backup integrity/format failure', 'checksum-rejection-preserves-current-database'),
            ('oversized.json', ' ' * 2_000_001, 'Backup exceeds synthetic lab limit', 'oversize-rejection-preserves-current-database'),
            ('malformed.json', '{broken-json', 'JSON', 'malformed-json-rejection-preserves-current-database'),
        ]:
            self.launch()
            before = self.selected_database()
            self.push_document(bad_name, text)
            self.choose_restore(bad_name)
            self.find(error)
            assert self.selected_database() == before
            self.find('10 individually confirmed paper entries.')
            self.record(checkpoint)
            self.launch()
            self.copy_state(snapshot)

        # Advance the original only after proving selective confirmation; the
        # saved ten-entry backup must restore independently of this newer work.
        self.tap('I copied only entry 71 to page 8, row 1')
        self.launch()
        self.find('11 individually confirmed paper entries.', scroll=True)
        self.record('original-database-advanced-after-backup')
        self.launch()
        self.tap('Open dataset B')
        self.find('0 individually confirmed paper entries.')
        self.choose_restore(filename)
        self.find('Backup restored into a new local database. Previous database preserved.')
        restored = self.selected_database()
        assert re.fullmatch(r'Local dataset: synthetic-lab-a · restore-[\w-]+\.sqlite', restored), restored
        self.report['restored_selection'] = restored
        self.copy_state(snapshot)
        self.record('real-document-picker-restores-ten-entry-backup-into-new-database')
        self.launch()
        assert self.selected_database() == restored
        self.copy_state(snapshot)
        self.record('restored-selection-and-copy-state-survive-offline-restart')

        existing = set(self.external_files())
        self.save_external()
        new_files = set(self.external_files()) - existing
        assert len(new_files) == 1
        assert self.read_external(new_files.pop()) == backup, 'Restore/re-export changed source bytes or revisions'
        self.record('restored-reexport-preserves-entire-backup-byte-for-byte')
        self.launch()
        self.tap('Open dataset A')
        self.find('Local dataset: synthetic-lab-a · lab-a.sqlite')
        self.find('11 individually confirmed paper entries.')
        self.record('restore-preserves-newer-original-database')

    def finish(self, status, error=None):
        self.report["status"] = status
        if error:
            self.report["error"] = str(error)
        (self.output / "report.json").write_text(json.dumps(self.report, indent=2) + "\n")
        try:
            (self.output / "logcat.txt").write_text(self.shell("logcat", "-d"))
            if error:
                shot = self.adb("exec-out", "screencap", "-p", binary=True).stdout
                (self.output / "failure.png").write_bytes(shot)
        finally:
            if self.emulator:
                self.shell("cmd", "connectivity", "airplane-mode", "disable", check=False)
                self.shell("svc", "wifi", "enable", check=False)
                self.shell("svc", "data", "enable", check=False)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-apk", type=Path)
    mode.add_argument("--apk", type=Path)
    parser.add_argument("--output", type=Path, default=Path("local-data/android-smoke"))
    args = parser.parse_args()
    if args.check_apk:
        print(json.dumps(check_apk(args.check_apk), indent=2))
        return
    smoke = Smoke(args.output)
    try:
        smoke.execute(args.apk)
    except Exception as error:
        smoke.finish("failed", error)
        raise
    else:
        smoke.finish("passed")


if __name__ == "__main__":
    main()

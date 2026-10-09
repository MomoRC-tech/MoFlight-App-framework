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
                       "No OCR, live retrieval, cloud Auth, physical phone, iOS or external backup test."}
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
                for node in self.dump():
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

    def swipe(self, *, up):
        size = self.shell("wm", "size")
        width, height = map(int, re.findall(r"(\d+)x(\d+)", size)[-1])
        start, end = (int(height * .8), int(height * .3))
        if not up:
            start, end = end, start
        self.shell("input", "swipe", str(width // 2), str(start), str(width // 2), str(end), "220")

    def tap(self, text, *, scroll=False):
        node = self.find(text, exact=True, scroll=scroll, attempts=45 if scroll else 12)
        assert node.get("enabled") == "true", f"Disabled button: {text}"
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", node.get("bounds", "")))
        self.shell("input", "tap", str((x1 + x2) // 2), str((y1 + y2) // 2))
        time.sleep(0.5)

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

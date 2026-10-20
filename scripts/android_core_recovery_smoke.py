"""Bounded native process-death proof; never resets an emulator or database."""
import argparse
import hashlib
import json
import re
import time
from pathlib import Path

from android_smoke import PACKAGE, Smoke, check_apk


EXPECTED_AVD = "MoFlight_Synthetic_API37"
CASES = ("after-facts", "after-commit", "restore-record")


def require_synthetic(serial, avd):
    if not re.fullmatch(r"emulator-\d+", serial or "") or avd != EXPECTED_AVD:
        raise ValueError("Process-death proof requires MoFlight_Synthetic_API37")


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(apk, original_apk, serial, output):
    require_synthetic(serial, EXPECTED_AVD)
    if output.exists():
        raise ValueError("Use a new evidence directory; previous results are preserved")
    if digest(apk) == digest(original_apk):
        raise ValueError("The proof and original APK must be distinct artifacts")
    smoke = Smoke(output, serial, EXPECTED_AVD)
    report = {"status": "running", "serial": serial, "cases": [],
              "proof_apk": check_apk(apk), "original_apk_sha256": digest(original_apk),
              "boundary": "Synthetic Android process death, not physical power loss or disk-full"}

    def guard():
        avd = smoke.adb("emu", "avd", "name").stdout.splitlines()[0].strip()
        require_synthetic(serial, avd)

    def stop():
        guard()
        smoke.shell("am", "force-stop", PACKAGE)

    def launch():
        guard()
        smoke.shell("am", "start", "-W", "-n", PACKAGE + "/.MainActivity")

    def wait_for(label):
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            labels = [label for node in smoke.dump() for label in smoke.labels(node)]
            failures = [value for value in labels if value.startswith("FAIL:")]
            if failures:
                raise AssertionError(failures[0])
            if label in labels:
                return
            time.sleep(.2)
        raise AssertionError("Native checkpoint unavailable: " + label)

    installed = False
    guard()
    remote = smoke.shell("pm", "path", PACKAGE).splitlines()[0].removeprefix("package:")
    assert remote.startswith("/data/app/") and remote.endswith("/base.apk")
    before_apk = output / "original-installed-apk.apk"
    smoke.adb("pull", remote, str(before_apk.resolve()))
    assert digest(before_apk) == report["original_apk_sha256"], "Original APK argument mismatch"
    initially_running = bool(smoke.shell("pidof", PACKAGE, check=False))
    try:
        stop()
        guard()
        installed = True
        smoke.adb("install", "-r", str(apk.resolve()))
        launch()
        wait_for("Synthetic Android core recovery PoC")
        wait_for("READY")
        for case in CASES:
            smoke.tap_node(smoke.find("Run next case", exact=True, enabled=True))
            wait_for("READY_TO_STOP:" + case)
            before = smoke.shell("pidof", PACKAGE)
            stop()
            assert not smoke.shell("pidof", PACKAGE, check=False), "Process still running"
            launch()
            wait_for("PASS:" + case)
            after = smoke.shell("pidof", PACKAGE)
            assert before and after and before != after, "A different process must recover"
            report["cases"].append({"case": case, "passed": True, "different_process": True})
            print("PASS " + case, flush=True)
        wait_for("ALL_CASES_PASSED")
        report["status"] = "passed"
    except BaseException:
        report["status"] = "failed"
        raise
    finally:
        try:
            if installed:
                stop()
                guard()
                smoke.adb("install", "-r", str(original_apk.resolve()))
                remote = smoke.shell("pm", "path", PACKAGE).splitlines()[0].removeprefix("package:")
                assert remote.startswith("/data/app/") and remote.endswith("/base.apk")
                restored = output / "restored-apk.apk"
                smoke.adb("pull", remote, str(restored.resolve()))
                assert digest(restored) == report["original_apk_sha256"], "Original APK mismatch"
                report["original_apk_restored_exactly"] = True
                if initially_running:
                    launch()
                report["original_running_state_restored"] = initially_running
        except BaseException:
            report["status"] = "failed"
            report["cleanup_failed"] = True
            raise
        finally:
            (output / "report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apk", type=Path, required=True)
    parser.add_argument("--original-apk", type=Path, required=True)
    parser.add_argument("--serial", required=True)
    parser.add_argument("--output", type=Path, required=True)
    arguments = parser.parse_args()
    run(arguments.apk, arguments.original_apk, arguments.serial, arguments.output)

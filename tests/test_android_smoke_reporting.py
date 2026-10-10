"""The emulator diagnostic collector must preserve the functional verdict."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock

from scripts.android_smoke import Smoke


class SmokeReportingTests(unittest.TestCase):
    def test_logcat_failure_preserves_passed_checks_without_raw_output(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder))
            smoke.report["checks"] = [{"name": "completed-check", "status": "passed"}]
            smoke.shell = Mock(side_effect=subprocess.CalledProcessError(
                255, ["adb", "shell", "logcat", "-d"], output="private diagnostic output"))
            smoke.finish("passed")
            report = json.loads((Path(folder) / "report.json").read_text())
            self.assertEqual(report["status"], "passed")
            self.assertEqual(report["checks"], smoke.report["checks"])
            self.assertEqual(report["diagnostic_errors"][0]["returncode"], 255)
            self.assertNotIn("private diagnostic output", json.dumps(report))

    def test_diagnostics_do_not_mask_original_functional_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder))
            smoke.shell = Mock(side_effect=OSError("adb unavailable"))
            smoke.adb = Mock(side_effect=subprocess.TimeoutExpired("adb", 45))
            smoke.finish("failed", AssertionError("expected row missing"))
            report = json.loads((Path(folder) / "report.json").read_text())
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["error"], "expected row missing")
            self.assertEqual(len(report["diagnostic_errors"]), 2)

    def test_cleanup_timeout_still_writes_report_and_attempts_other_cleanup(self):
        with tempfile.TemporaryDirectory() as folder:
            smoke = Smoke(Path(folder))
            smoke.emulator = True
            smoke.shell = Mock(side_effect=["logs", subprocess.TimeoutExpired("adb", 45), "", ""])
            smoke.finish("passed")
            report = json.loads((Path(folder) / "report.json").read_text())
            self.assertEqual(report["status"], "passed")
            self.assertEqual(smoke.shell.call_count, 4)
            self.assertEqual(report["diagnostic_errors"][0]["error_type"], "TimeoutExpired")


if __name__ == "__main__":
    unittest.main()

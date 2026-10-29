"""Regression protection for the evidence ledger, not application acceptance."""
import copy
import csv
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("performance_ledger", ROOT / "scripts/performance_ledger.py")
ledger = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ledger)


class PerformanceLedgerTests(unittest.TestCase):
    def setUp(self):
        self.data = {
            "version": 1, "coverage": ["Synthetic test only"], "runs": [{
                "id": "test-baseline", "recorded_date": "2026-10-29", "kind": "emulator-synthetic",
                "source_commit": "abcdef0", "apk_sha256": None, "device": "Synthetic API37",
                "input": "Fixed synthetic fixture", "conditions": "Offline", "method": "Measured operation",
                "limits": ["No physical acceptance"], "evidence": ["README.md"], "comparison": None,
                "samples": [{"id": "trial-1", "metric": "unchanged", "milliseconds": 2000,
                             "outcome": "success", "details": {"saveMs": 1000, "hashCalls": 3}}],
            }],
        }

    def test_csv_retains_every_value_and_units(self):
        data = ledger.validate(self.data)
        rows = list(csv.DictReader(io.StringIO(ledger.flat_csv(data))))
        self.assertEqual([(r["measurement"], r["value"], r["unit"]) for r in rows],
                         [("milliseconds", "2000", "ms"), ("saveMs", "1000", "ms"), ("hashCalls", "3", "count")])

    def test_rejects_nonfinite_negative_and_private_raw_fields(self):
        for value in [float("nan"), float("inf"), -1, True, "1000"]:
            with self.subTest(value=value):
                data = copy.deepcopy(self.data)
                data["runs"][0]["samples"][0]["milliseconds"] = value
                with self.assertRaises(ValueError):
                    ledger.validate(data)
        for location in ["run", "sample", "details"]:
            data = copy.deepcopy(self.data)
            run = data["runs"][0]
            target = run if location == "run" else run["samples"][0] if location == "sample" else run["samples"][0]["details"]
            target["rawContext"] = "PRIVATE_SENTINEL"
            with self.assertRaises(ValueError):
                ledger.validate(data)

    def test_rejects_duplicate_samples_and_missing_evidence(self):
        data = copy.deepcopy(self.data)
        data["runs"][0]["samples"] *= 2
        with self.assertRaises(ValueError):
            ledger.validate(data)
        self.data["runs"][0]["evidence"] = ["../outside-workspace.json"]
        with self.assertRaises(ValueError):
            ledger.validate(self.data)

    def paired(self):
        base = self.data["runs"][0]
        base["comparison"] = {"group": "experiment", "variant": "baseline"}
        candidate = copy.deepcopy(base)
        candidate["id"] = "test-candidate"
        candidate["comparison"]["variant"] = "candidate"
        candidate["samples"][0]["milliseconds"] = 1500
        self.data["runs"].append(candidate)
        return candidate

    def test_comparison_median_and_chart_update_from_samples(self):
        candidate = self.paired()
        ledger.validate(self.data)
        self.assertIn("-25.0%", ledger.comparison_chart(self.data))
        candidate["samples"][0]["milliseconds"] = 1000
        self.assertIn("-50.0%", ledger.comparison_chart(self.data))
        self.assertIn("1,000", ledger.history(self.data))

    def test_cannot_compare_different_inputs_methods_or_outcomes(self):
        candidate = self.paired()
        for key in ["kind", "device", "input", "conditions", "method"]:
            data = copy.deepcopy(self.data)
            data["runs"][1][key] = "host" if key == "kind" else "Different"
            with self.subTest(key=key), self.assertRaises(ValueError):
                ledger.validate(data)
        candidate["samples"][0]["outcome"] = "failed"
        with self.assertRaises(ValueError):
            ledger.validate(self.data)

    def test_failed_and_running_samples_remain_in_history_but_not_success_chart(self):
        run = self.data["runs"][0]
        run["kind"] = "phone"
        sample = run["samples"][0]
        sample["metric"] = "update-flights"
        for outcome in ["failed", "running", "cancelled", "partial", "blocked"]:
            sample["outcome"] = outcome
            self.assertIn(outcome, ledger.history(self.data))
            self.assertNotIn("abcdef0 · phone", ledger.observation_chart(self.data))
        sample["outcome"] = "success"
        self.assertIn("abcdef0 · phone", ledger.observation_chart(self.data))

    def test_add_check_and_invalid_add_preserve_existing_ledger(self):
        with tempfile.TemporaryDirectory() as folder:
            directory = Path(folder)
            path = directory / "ledger.json"
            path.write_text(json.dumps(self.data), encoding="utf-8")
            with patch.object(ledger, "DIRECTORY", directory), patch("sys.argv", ["performance_ledger.py"]):
                self.assertEqual(ledger.main(), 0)
            with patch.object(ledger, "DIRECTORY", directory), patch("sys.argv", ["performance_ledger.py", "--check"]):
                self.assertEqual(ledger.main(), 0)
                (directory / "sync-history.svg").write_text("stale", encoding="utf-8")
                self.assertEqual(ledger.main(), 1)
            invalid = directory / "invalid.json"
            invalid.write_text(json.dumps(self.data["runs"][0]), encoding="utf-8")
            before = path.read_bytes()
            with patch.object(ledger, "DIRECTORY", directory), patch("sys.argv", ["performance_ledger.py", "--add-run", str(invalid)]):
                with self.assertRaises(ValueError):
                    ledger.main()
            self.assertEqual(path.read_bytes(), before)
            valid = copy.deepcopy(self.data["runs"][0])
            valid["id"] = "new-measured-run"
            invalid.write_text(json.dumps(valid), encoding="utf-8")
            with patch.object(ledger, "DIRECTORY", directory), patch("sys.argv", ["performance_ledger.py", "--add-run", str(invalid)]):
                self.assertEqual(ledger.main(), 0)
            self.assertEqual(len(json.loads(path.read_text())["runs"]), 2)

    def test_maintained_ledger_and_outputs_are_consistent(self):
        data = json.loads((ledger.DIRECTORY / "ledger.json").read_text(encoding="utf-8"))
        ledger.validate(data)
        for name, content in ledger.outputs(data).items():
            with self.subTest(name=name):
                self.assertEqual((ledger.DIRECTORY / name).read_text(encoding="utf-8"), content)

    def test_backfill_matches_committed_phone_and_native_samples(self):
        data = json.loads((ledger.DIRECTORY / "ledger.json").read_text(encoding="utf-8"))
        assets = ROOT / "docs/verification/assets/2026-10-21-simple-flight-loading"
        phone = json.loads((assets / "pixel6a-mobile-2026-10-26.json").read_text())
        run = next(r for r in data["runs"] if r["id"] == "supplied-android-cdd2adb-s28")
        for operation in phone["operations"]:
            sample = next(s for s in run["samples"] if s["id"] == f's28-o{operation["sequence"]}')
            self.assertEqual(sample["milliseconds"], operation["milliseconds"])
            for stage, value in operation["selectedInclusiveStagesMs"].items():
                self.assertEqual(sample["details"][f"stages.{stage}.milliseconds"], value)
        native = json.loads((assets / "replay-derivation-2026-10-27.json").read_text())
        for variant in ["baseline", "candidate"]:
            run = next(r for r in data["runs"] if r["id"] == "replay-27oct-"+variant)
            expected = [s["milliseconds"] for row in native["results"] for s in row[variant]["samples"]]
            self.assertEqual([s["milliseconds"] for s in run["samples"]], expected)

    def test_reported_disjoint_windows_sum_to_operation_elapsed(self):
        data = json.loads((ledger.DIRECTORY / "ledger.json").read_text(encoding="utf-8"))
        checked = 0
        for run in data["runs"]:
            for sample in run["samples"]:
                windows = [v for k, v in sample["details"].items() if k.startswith("disjoint-windows.")]
                if windows:
                    self.assertEqual(sum(windows), sample["milliseconds"])
                    checked += 1
        self.assertGreaterEqual(checked, 5)


if __name__ == "__main__":
    unittest.main()

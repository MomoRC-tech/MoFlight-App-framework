import csv
import json
import select
import socket
import subprocess
import sys
import tempfile
import unittest
import time
import zipfile
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import urlopen
from urllib.error import URLError

from pocs.local_logbook.lab import Lab, canonical, literal_fields, render, restore

FIXTURE = Path(__file__).parent / "fixtures/local-logbook"
COVERAGE = {"from": "2026-01-01", "through": "2026-06-01", "complete": False}
AT = "2026-06-02T12:00:00Z"
FINDING = "fixture:f69:aircraft_model"


class FieldsParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.fields = []
        self.current = None

    def handle_starttag(self, tag, attrs):
        if tag in ("dt", "dd"):
            self.current = ""

    def handle_data(self, data):
        if self.current is not None:
            self.current += data

    def handle_endtag(self, tag):
        if tag in ("dt", "dd") and self.current is not None:
            self.fields.append(self.current)
            self.current = None


class LocalLogbookTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.lab = Lab(self.root / "a", "synthetic-dataset-a")
        self.lab.import_csv(FIXTURE / "flights.csv", COVERAGE, AT)
        self.lab.prepare_page(FIXTURE / "page.json")

    def tearDown(self):
        self.lab.close()
        self.temp.cleanup()

    def change(self, flight_id, field, value, successful=True):
        with (FIXTURE / "flights.csv").open() as source:
            reader = csv.DictReader(source, delimiter=";")
            names, rows = reader.fieldnames, list(reader)
        for row in rows:
            if row["id"] == flight_id:
                row[field] = value
        path = self.root / "changed.csv"
        with path.open("w", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=names, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        return self.lab.import_csv(path, COVERAGE, "2026-06-03T12:00:00Z", successful)

    def respond(self, action, value=None):
        self.lab.respond(FINDING, action, value, reason="synthetic test", at=AT, expected_revision=self.lab.revision())

    def ids(self, **params):
        return [r["value"]["id"] for r in self.lab.query(**params)["supporting_flights"]]

    def test_exact_queries_identity_roles_duplicate_rows_and_coverage(self):
        self.assertEqual(self.ids(registration="D-EX01"), ["fixture:f69", "fixture:f70"])
        self.assertEqual(self.ids(aircraft_model="ASK 21"), ["fixture:older", "fixture:f70", "fixture:f71"])
        self.assertEqual(self.ids(person_id="fixture:p1", role="instructor"), ["fixture:older", "fixture:f69"])
        q = self.lab.query(person_id="fixture:p1")
        self.assertEqual((q["count"], q["latest_recorded_date"], q["latest_date_flight_ids"]), (2, "2026-06-01", ["fixture:f69"]))
        self.assertEqual(self.ids(person_id="fixture:p2"), ["fixture:f71"])
        self.assertEqual(self.ids(date_from="2026-06-01", date_to="2026-06-01"), ["fixture:f69", "fixture:f70", "fixture:f71"])
        self.assertTrue(q["offline_cached"])
        self.assertEqual(q["coverage"], COVERAGE)
        self.assertEqual(q["last_successful_import"], AT)
        self.assertIn("zero does not mean never", q["limitation"])
        self.assertEqual(self.lab.query(person_id="Example Alex")["count"], 0)

    def test_import_is_idempotent_and_original_duplicate_rows_retained(self):
        revision = self.lab.revision()
        self.lab.import_csv(FIXTURE / "flights.csv", COVERAGE, AT)
        self.assertEqual(self.lab.revision(), revision)
        self.lab.import_csv(FIXTURE / "flights.csv", COVERAGE, "2026-06-04T12:00:00Z")
        self.assertEqual(len(self.lab.all("flight")), 4)
        self.assertEqual(len(self.lab.all("import")[-1]["raw_rows"]), 5)
        self.assertEqual(len(self.lab.query()["supporting_flights"]), 4)

    def test_ignore_override_reverse_preserve_source_and_old_snapshot(self):
        self.respond("ignore")
        self.assertEqual(self.lab.findings()[0]["status"], "ignore")
        self.assertEqual(self.lab.query(aircraft_model="ASK 21")["count"], 3)
        old = self.lab.template()
        self.respond("override", "ASK 21")
        self.assertEqual(self.lab.query(aircraft_model="ASK 21")["count"], 4)
        self.assertEqual(self.lab.query(aircraft_model="ASK 21", view="source")["count"], 3)
        self.respond("reverse")
        self.assertEqual(self.lab.query(aircraft_model="ASK 21")["count"], 3)
        self.assertEqual(self.lab.findings()[0]["status"], "open")
        self.assertEqual(self.lab.get("template", old["id"]), old)
        self.assertEqual(self.lab.db.execute("SELECT count(*) FROM records WHERE kind='decision'").fetchone()[0], 3)

    def test_only_relevant_evidence_stales_decision(self):
        self.respond("override", "ASK 21")
        self.lab.import_csv(FIXTURE / "flights.csv", COVERAGE, "2026-06-04T12:00:00Z")
        self.assertEqual(self.lab.findings()[0]["status"], "override")
        self.change("fixture:f69", "remarks", "unrelated change")
        self.assertEqual(self.lab.findings()[0]["status"], "override")
        self.change("fixture:f69", "aircraft_model", "DG-1000 T")
        self.assertEqual(self.lab.findings()[0]["status"], "stale-review-required")
        self.assertEqual(self.lab.query(aircraft_model="ASK 21")["count"], 3)
        self.assertEqual(self.lab.db.execute("SELECT count(*) FROM records WHERE kind='decision'").fetchone()[0], 1)

    def test_failed_refresh_does_not_replace_usable_history(self):
        old = self.lab.get("state", "last_success")
        self.change("fixture:f70", "aircraft_model", "OTHER", successful=False)
        self.assertEqual(self.lab.get("state", "last_success"), old)
        self.assertEqual(self.lab.query(aircraft_model="ASK 21")["count"], 3)
        self.assertFalse(self.lab.all("import")[-1]["successful"])

    def test_page_layout_totals_and_viewing_never_marks_copied(self):
        before = self.lab.all("paper")
        t = self.lab.template()
        first, second = t["pages"]
        self.assertEqual((first["page"], first["rows"][-1]["nr"], first["rows"][-1]["row"]), (7, 70, 10))
        self.assertEqual((second["page"], second["rows"][0]["nr"], second["rows"][0]["row"]), (8, 71, 1))
        self.assertEqual(first["page_total"], dict(minutes=110, pic_minutes=20, dual_minutes=90, fi_minutes=0, landings=10))
        self.assertEqual(first["cumulative_total"], dict(minutes=710, pic_minutes=420, dual_minutes=290, fi_minutes=0, landings=70))
        self.assertEqual(second["carry"], first["cumulative_total"])
        self.assertIsNone(second["page_total"])
        self.assertIsNone(second["cumulative_total"])
        self.assertEqual(self.lab.template()["id"], t["id"])
        render(t)
        self.assertEqual(self.lab.all("paper"), before)

    def test_exact_host_fields_escape_and_intentional_blanks(self):
        t = self.lab.template()
        p = FieldsParser()
        p.feed(render(t))
        expected = []
        for page in t["pages"]:
            for row in page["rows"]:
                for key, value in literal_fields(row).items():
                    expected.extend([key, value or "(leave blank)"])
        self.assertEqual(p.fields, expected)
        solo, dual = [literal_fields(t["pages"][i]["rows"][-1]) for i in (0, 1)]
        self.assertEqual((solo["PIC (h:mm)"], solo["Dual (h:mm)"], dual["PIC (h:mm)"], dual["Dual (h:mm)"]), ("0:20", "", "", "0:30"))
        t["pages"][1]["rows"][0]["flight"]["remarks"] = '<script>alert("x")</script>'
        self.assertNotIn("<script>", render(t))
        self.assertIn("&lt;script&gt;", render(t))

    def test_confirm_subset_only_and_changed_evidence_requires_review(self):
        t = self.lab.template()
        self.lab.confirm_copied(t["id"], ["fixture:f70"], at=AT, expected_revision=self.lab.revision())
        self.assertIsNotNone(self.lab.get("paper", "fixture:f70"))
        self.assertIsNone(self.lab.get("paper", "fixture:f71"))
        with self.assertRaises(ValueError):
            self.lab.template()
        self.change("fixture:f71", "registration", "D-NEW")
        with self.assertRaises(ValueError):
            self.lab.confirm_copied(t["id"], ["fixture:f71"], at=AT, expected_revision=self.lab.revision())
        self.assertEqual(self.lab.get("template", t["id"]), t)

    def test_invalid_scope_and_stale_write_are_atomic(self):
        t = self.lab.template()
        before = self.lab.revision()
        for ids in (["fixture:f70", "foreign:flight"], ["fixture:f70", "fixture:f70"]):
            with self.assertRaises(ValueError):
                self.lab.confirm_copied(t["id"], ids, at=AT, expected_revision=before)
        with self.assertRaises(ValueError):
            self.lab.respond(FINDING, "ignore", reason="test", at=AT, expected_revision=before - 1)
        self.assertEqual(self.lab.revision(), before)

    def test_unknowns_and_overlaps_block_template_and_query_reports_unknown(self):
        self.change("fixture:f71", "date", "")
        q = self.lab.query(person_id="fixture:p2")
        self.assertEqual(q["count"], 0)
        self.assertEqual(q["unknown_ids"], ["fixture:f71"])
        with self.assertRaises(ValueError):
            self.lab.template()
        with (FIXTURE / "flights.csv").open() as source:
            reader = csv.DictReader(source, delimiter=";")
            names, rows = reader.fieldnames, list(reader)
        for r in rows:
            if r["id"] == "fixture:f71":
                r.update(start="10:10", landing="10:40")
        path = self.root / "overlap.csv"
        with path.open("w", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=names, delimiter=";")
            writer.writeheader()
            writer.writerows(rows)
        self.lab.import_csv(path, COVERAGE, "2026-06-05T12:00:00Z")
        with self.assertRaisesRegex(ValueError, "overlapping"):
            self.lab.template()

    def test_changed_snapshot_shows_review_without_mutating_old_instructions(self):
        t = self.lab.template()
        self.assertFalse(self.lab.review_required(t))
        self.change("fixture:f71", "registration", "D-CHANGED")
        self.assertTrue(self.lab.review_required(t))
        self.assertIn("Review required", render(t, self.lab.review_required(t)))
        self.assertEqual(self.lab.get("template", t["id"]), t)

    def test_missing_time_reports_latest_date_ambiguity_and_blocks_writing(self):
        self.change("fixture:f71", "start", "")
        q = self.lab.query(aircraft_model="ASK 21")
        self.assertCountEqual(q["latest_flight_ids"], ["fixture:f70", "fixture:f71"])
        self.assertEqual(q["latest_time_order"], "date-only-ambiguous-or-empty")
        with self.assertRaises(ValueError):
            self.lab.template()

    def test_unknown_carryover_blocks_without_zero_default(self):
        page = self.lab.get("page", "prepared-page")
        page["carry"]["minutes"] = None
        with self.lab.db:
            self.lab.append("page", "prepared-page", page)
        with self.assertRaisesRegex(ValueError, "carryover"):
            self.lab.template()

    def test_two_selected_datasets_do_not_share_rows_assets_or_aggregate(self):
        other = Lab(self.root / "b", "synthetic-dataset-b")
        try:
            self.assertEqual(other.query(registration="D-EX01")["count"], 0)
            self.assertEqual(other.all("paper"), [])
            self.assertEqual(list(other.assets.iterdir()), [])
            with self.assertRaises(ValueError):
                other.respond(FINDING, "ignore", reason="test", at=AT, expected_revision=0)
        finally:
            other.close()
        with self.assertRaises(ValueError):
            Lab(self.root / "a", "synthetic-dataset-b")

    def test_fresh_process_without_network_reopens_identical_state(self):
        self.respond("ignore")
        t = self.lab.template()
        expected = self.lab.query(registration="D-EX01")
        script = """import socket,json,sys
from pocs.local_logbook.lab import Lab,canonical
def deny(*args,**kwargs): raise RuntimeError('network forbidden')
socket.socket.connect=deny
socket.create_connection=deny
l=Lab(sys.argv[1], 'synthetic-dataset-a')
print(canonical({'query':l.query(registration='D-EX01'),'template':l.get('template',sys.argv[2]),'paper':l.all('paper')}))
l.close()
"""
        result = subprocess.run([sys.executable, "-c", script, str(self.lab.directory), t["id"]], text=True, capture_output=True, check=True)
        actual = json.loads(result.stdout)
        self.assertEqual(actual["query"], expected)
        self.assertEqual(actual["template"], t)
        self.assertEqual(actual["paper"], self.lab.all("paper"))

    def test_live_read_only_host_view_keeps_fixed_snapshot_and_paper(self):
        self.lab.template()
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            port = s.getsockname()[1]
        before = self.lab.revision()
        process = subprocess.Popen([sys.executable, "-m", "pocs.local_logbook.lab", "serve", "--data", str(self.lab.directory), "--port", str(port)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        try:
            self.assertTrue(select.select([process.stdout], [], [], 5)[0], "viewer startup timeout")
            self.assertIn("Read-only fixed host snapshot", process.stdout.readline())
            for attempt in range(10):
                try:
                    with urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
                        first = response.read()
                        self.assertEqual(response.status, 200)
                    break
                except URLError:
                    if attempt == 9:
                        raise
                    time.sleep(.05)
            with urlopen(f"http://127.0.0.1:{port}/", timeout=2) as response:
                self.assertEqual(response.read(), first)
            self.assertIn(b"new-copy", first)
            self.assertIn(b"existing-context-do-not-copy", first)
            self.assertEqual(self.lab.revision(), before)
            self.assertEqual(len(self.lab.all("paper")), 9)
        finally:
            process.terminate()
            process.communicate(timeout=5)

    def test_backup_restore_preserves_all_revisions_assets_and_fixed_snapshot(self):
        self.respond("override", "ASK 21")
        t = self.lab.template()
        archive = self.root / "private-backup.zip"
        self.lab.backup(archive)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        restore(archive, self.root / "restored")
        other = Lab(self.root / "restored", self.lab.dataset_id)
        try:
            self.assertEqual([tuple(r) for r in other.db.execute("SELECT * FROM records")], [tuple(r) for r in self.lab.db.execute("SELECT * FROM records")])
            self.assertEqual(other.query(), self.lab.query())
            self.assertEqual(render(other.get("template", t["id"])), render(t))
            self.assertEqual({p.name:p.read_bytes() for p in other.assets.iterdir()}, {p.name:p.read_bytes() for p in self.lab.assets.iterdir()})
        finally:
            other.close()
        with self.assertRaises(ValueError):
            restore(archive, self.root / "restored")

    def test_restore_rejects_tampering_traversal_and_missing_evidence(self):
        original = self.root / "backup.zip"
        self.lab.backup(original)
        with zipfile.ZipFile(original) as z:
            files = {n:z.read(n) for n in z.namelist()}
        for mode in ("tamper", "traversal", "missing"):
            modified = dict(files)
            if mode == "tamper":
                modified["state.sqlite3"] = b"broken"
            else:
                manifest = json.loads(modified["manifest.json"])
                if mode == "traversal":
                    manifest["files"]["../escape"] = "unused"
                    modified["../escape"] = b"bad"
                else:
                    key = next(k for k in manifest["files"] if k.startswith("assets/"))
                    del manifest["files"][key]
                    del modified[key]
                modified["manifest.json"] = canonical(manifest).encode()
            path = self.root / (mode + ".zip")
            with zipfile.ZipFile(path, "w") as z:
                for name, raw in modified.items():
                    z.writestr(name, raw)
            target = self.root / mode
            with self.assertRaises(ValueError):
                restore(path, target)
            self.assertFalse(target.exists())
        self.assertFalse((self.root / "escape").exists())

    def test_unknown_schema_is_rejected_without_reinitialization(self):
        with self.lab.db:
            self.lab.db.execute("PRAGMA user_version=99")
        with self.assertRaises(ValueError):
            Lab(self.root / "a")
        self.assertEqual(len(self.lab.all("paper")), 9)

    def test_invalid_filters_are_rejected_and_sql_text_is_only_a_value(self):
        for params in ({"view":"anything"}, {"role":"instructor"}, {"date_from":"2026-07-01","date_to":"2026-06-01"}):
            with self.assertRaises(ValueError):
                self.lab.query(**params)
        self.assertEqual(self.lab.query(registration="'; DROP TABLE records; --")["count"], 0)
        self.assertEqual(len(self.lab.all("flight")), 4)


if __name__ == "__main__":
    unittest.main()

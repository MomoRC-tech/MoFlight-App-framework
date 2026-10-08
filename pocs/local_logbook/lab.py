"""Dependency-free, synthetic-only host lab for #4/#6/#7/#9.

Use one database/file directory per dataset. Append record revisions; never
replace original evidence. Python is a test harness, not the mobile stack.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import html
import io
import json
import os
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RULES = "synthetic-ten-row-v1"
COUNTERS = ("minutes", "pic_minutes", "dual_minutes", "fi_minutes", "landings")
FLIGHT_FIELDS = {"id", "date", "start", "landing", "time_basis", "minutes",
                 "registration", "aircraft_model", "pilot_role", "crew", "launch",
                 "start_place", "landing_place", "landings", "remarks"}
REQUIRED = FLIGHT_FIELDS - {"crew", "remarks"}
OVERRIDES = {"registration", "aircraft_model"}


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def digest(value):
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def file_hash(raw):
    return hashlib.sha256(raw).hexdigest()


def validate_flight(f):
    if set(f) != FLIGHT_FIELDS or not isinstance(f["id"], str) or not f["id"]:
        raise ValueError("invalid flight schema/identity")
    for field in ("minutes", "landings"):
        if f[field] is not None and (type(f[field]) is not int or f[field] < 0):
            raise ValueError("integer minutes/landings required")
    if f["date"] is not None:
        date.fromisoformat(f["date"])
    for field in ("start", "landing"):
        if f[field] is not None:
            datetime.strptime(f[field], "%H:%M")
    if f["pilot_role"] not in (None, "PIC", "Dual", "FI"):
        raise ValueError("unknown pilot role")
    if not isinstance(f["crew"], list):
        raise ValueError("crew list required")
    for c in f["crew"]:
        if set(c) != {"person_id", "name", "role"} or not c["person_id"] or c["role"] not in ("PIC", "instructor", "companion"):
            raise ValueError("stable person identity and established crew role required")


def counters(f):
    return {"minutes": f["minutes"], "landings": f["landings"],
            "pic_minutes": f["minutes"] if f["pilot_role"] == "PIC" else 0,
            "dual_minutes": f["minutes"] if f["pilot_role"] == "Dual" else 0,
            "fi_minutes": f["minutes"] if f["pilot_role"] == "FI" else 0}


def totals(rows):
    return {k: sum(counters(r["flight"])[k] for r in rows) for k in COUNTERS}


class Lab:
    def __init__(self, directory, dataset_id=None):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        db = self.directory / "state.sqlite3"
        self.db = sqlite3.connect(db)
        self.db.row_factory = sqlite3.Row
        version = self.db.execute("PRAGMA user_version").fetchone()[0]
        if version == 0:
            if self.db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchone():
                self.close()
                raise ValueError("unversioned existing database; refusing to overwrite")
            self.db.executescript(Path(__file__).with_name("schema.sql").read_text())
            with self.db:
                self.db.execute("INSERT INTO dataset VALUES (?,1)", (dataset_id or str(uuid.uuid4()),))
        elif version != 1:
            self.close()
            raise ValueError("unsupported database schema; preserve dataset")
        self.dataset_id = self.db.execute("SELECT id FROM dataset").fetchone()[0]
        if dataset_id is not None and dataset_id != self.dataset_id:
            self.close()
            raise ValueError("dataset identity mismatch")
        os.chmod(db, 0o600)
        self.assets = self.directory / "assets"
        self.assets.mkdir(exist_ok=True, mode=0o700)

    def close(self):
        self.db.close()

    def revision(self):
        return self.db.execute("SELECT coalesce(max(seq),0) FROM records").fetchone()[0]

    def get(self, kind, record_id):
        row = self.db.execute("SELECT payload FROM records WHERE kind=? AND id=? ORDER BY revision DESC LIMIT 1",
                              (kind, record_id)).fetchone()
        return json.loads(row[0]) if row else None

    def all(self, kind):
        return [json.loads(r[0]) for r in self.db.execute(
            "SELECT payload FROM records r WHERE kind=? AND revision=(SELECT max(revision) FROM records WHERE kind=r.kind AND id=r.id) ORDER BY seq",
            (kind,))]

    def append(self, kind, record_id, payload):
        revision = self.db.execute("SELECT coalesce(max(revision),0)+1 FROM records WHERE kind=? AND id=?",
                                   (kind, record_id)).fetchone()[0]
        self.db.execute("INSERT INTO records(kind,id,revision,payload) VALUES (?,?,?,?)",
                        (kind, record_id, revision, canonical(payload)))

    def asset(self, raw):
        name = file_hash(raw)
        path = self.assets / name
        if not path.exists():
            with path.open("xb") as output:
                output.write(raw)
            os.chmod(path, 0o600)
        elif path.read_bytes() != raw:
            raise ValueError("asset hash mismatch")
        return name

    def import_csv(self, path, coverage, retrieved_at, successful=True):
        """Normalized synthetic CSV only: this is not a Vereinsflieger adapter."""
        raw = Path(path).read_bytes()
        asset = self.asset(raw)
        rows = list(csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), delimiter=";"))
        snapshot_id = digest({"asset": asset, "coverage": coverage, "retrieved_at": retrieved_at, "successful": successful})
        if self.get("import", snapshot_id):
            return snapshot_id
        normalized = []
        if successful:
            for row in rows:
                f = dict(row)
                for k in ("minutes", "landings"):
                    f[k] = int(f[k]) if f[k] else None
                f["crew"] = json.loads(f["crew"])
                for k in f:
                    if f[k] == "":
                        f[k] = None
                validate_flight(f)
                normalized.append(f)
            ids = {}
            for f in normalized:
                if f["id"] in ids and ids[f["id"]] != f:
                    raise ValueError("conflicting rows under one source ID; requires review")
                ids[f["id"]] = f
        with self.db:
            self.append("import", snapshot_id, {"id": snapshot_id, "asset": asset, "raw_rows": rows,
                "coverage": coverage, "retrieved_at": retrieved_at, "successful": successful,
                "transport": "synthetic-prepared-csv", "time_basis": "per-flight"})
            if successful:
                for f in ids.values():
                    old = self.get("flight", f["id"])
                    if old is None or old["value"] != f:
                        self.append("flight", f["id"], {"id": f["id"], "value": f, "source_snapshot": snapshot_id})
                self.append("state", "last_success", {"snapshot_id": snapshot_id})
        return snapshot_id

    def prepare_page(self, path):
        raw = Path(path).read_bytes()
        page = json.loads(raw)
        if page["provenance"] != "synthetic-prepared-observations-no-OCR":
            raise ValueError("only clearly labelled prepared observations accepted")
        if len(page["rows"]) != 9 or [r["row"] for r in page["rows"]] != list(range(1, 10)):
            raise ValueError("this bounded fixture requires nine established rows")
        for r in page["rows"]:
            validate_flight(r["flight"])
            if any(r["flight"][k] is None for k in REQUIRED) or r["flight"]["time_basis"] != "UTC":
                raise ValueError("existing rows need confirmed fields and UTC for this lab")
        observed_asset = self.asset(raw)
        anchor = page["rows"][-1]
        source = self.get("flight", anchor["flight"]["id"])
        if not source or any(source["value"][k] != anchor["flight"][k] for k in ("date", "start", "landing")):
            raise ValueError("anchor identity/time not established")
        with self.db:
            if self.get("page", page["id"]) == page:
                return
            # Later conflicting paper evidence is not silently applied in this slice.
            if self.get("page", page["id"]):
                raise ValueError("changed page evidence requires explicit review; original retained")
            self.append("observation", page["id"], {"asset": observed_asset, "provenance": page["provenance"]})
            self.append("page", page["id"], page)
            for r in page["rows"]:
                self.append("paper", r["flight"]["id"], {**r, "page": page["page"],
                    "confirmed_at": page["confirmed_at"], "author": "synthetic-pilot", "evidence": observed_asset})
            for r in page["rows"]:
                source = self.get("flight", r["flight"]["id"])
                if source:
                    for field in OVERRIDES:
                        if source["value"][field] != r["flight"][field]:
                            finding_id = r["flight"]["id"] + ":" + field
                            self.append("finding", finding_id, {"id": finding_id, "flight_id": r["flight"]["id"],
                                "field": field, "paper_value": r["flight"][field], "scope": "flight-field",
                                "severity": "historical-warning", "rules": RULES})

    def fingerprint(self, finding):
        flight = self.get("flight", finding["flight_id"])
        return digest({"flight_id": finding["flight_id"], "field": finding["field"],
            "source": flight["value"][finding["field"]], "paper": finding["paper_value"], "rules": finding["rules"]})

    def findings(self):
        result = []
        for f in self.all("finding"):
            d = self.get("decision", f["id"])
            status = "open"
            if d and d["action"] != "reverse":
                status = d["action"] if d["fingerprint"] == self.fingerprint(f) else "stale-review-required"
            result.append({**f, "status": status, "source_value": self.get("flight", f["flight_id"])["value"][f["field"]]})
        return result

    def respond(self, finding_id, action, value=None, *, reason, at, expected_revision):
        if action not in ("ignore", "override", "reverse"):
            raise ValueError("unsupported response")
        f = self.get("finding", finding_id)
        if not f:
            raise ValueError("finding does not belong to selected dataset")
        if action == "override" and (f["field"] not in OVERRIDES or not isinstance(value, str) or not value.strip()):
            raise ValueError("bounded nonempty aircraft override required")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            if expected_revision != self.revision():
                raise ValueError("stale base revision; response not applied")
            self.append("decision", finding_id, {"id": finding_id, "action": action, "value": value,
                "reason": reason, "author": "synthetic-pilot", "at": at, "fingerprint": self.fingerprint(f)})

    def flights(self, view="effective"):
        if view not in ("effective", "source", "paper"):
            raise ValueError("invalid query basis")
        if view == "paper":
            return [{"value": p["flight"], "provenance": {"paper_evidence": p["evidence"]}} for p in self.all("paper")]
        result = []
        for record in self.all("flight"):
            f = dict(record["value"])
            applied = []
            if view == "effective":
                for field in OVERRIDES:
                    fid = f["id"] + ":" + field
                    d, finding = self.get("decision", fid), self.get("finding", fid)
                    if d and finding and d["action"] == "override" and d["fingerprint"] == self.fingerprint(finding):
                        f[field] = d["value"]
                        applied.append(d)
            result.append({"value": f, "provenance": {"source_snapshot": record["source_snapshot"], "decisions": applied}})
        return result

    def query(self, *, registration=None, aircraft_model=None, person_id=None, role=None,
              date_from=None, date_to=None, view="effective", offline=True):
        if role not in (None, "PIC", "instructor", "companion") or (role and not person_id):
            raise ValueError("role requires selected stable person ID")
        for d in (date_from, date_to):
            if d:
                date.fromisoformat(d)
        if date_from and date_to and date_from > date_to:
            raise ValueError("invalid date range")
        matches, unknown = [], []
        for record in self.flights(view):
            f = record["value"]
            tests = [("registration", registration), ("aircraft_model", aircraft_model)]
            if any(v is not None and f[k] is not None and f[k] != v for k, v in tests):
                continue
            crew = [c for c in f["crew"] if c["person_id"] == person_id and (role is None or c["role"] == role)]
            if person_id and (f["crew"] or f["pilot_role"] == "PIC") and not crew:
                continue
            if f["date"] and ((date_from and f["date"] < date_from) or (date_to and f["date"] > date_to)):
                continue
            if f["date"] is None or any(v is not None and f[k] is None for k, v in tests) or (person_id and not f["crew"]):
                unknown.append(f["id"])
            else:
                matches.append(record)
        matches.sort(key=lambda r: (r["value"]["date"], r["value"]["start"] or "", r["value"]["id"]))
        latest_date = max((r["value"]["date"] for r in matches), default=None)
        latest = [r["value"]["id"] for r in matches if r["value"]["date"] == latest_date]
        latest_records = [r["value"] for r in matches if r["value"]["date"] == latest_date]
        ordered = all(f["start"] is not None and f["time_basis"] == "UTC" for f in latest_records)
        latest_flight_ids = [f["id"] for f in latest_records if f["start"] == max(x["start"] for x in latest_records)] if latest_records and ordered else latest
        state = self.get("state", "last_success")
        source = self.get("import", state["snapshot_id"]) if state else None
        return {"dataset_id": self.dataset_id, "revision": self.revision(), "basis": view,
            "filters": {"registration": registration, "aircraft_model": aircraft_model, "person_id": person_id,
                        "role": role, "date_from": date_from, "date_to": date_to},
            "count": len(matches), "supporting_flights": matches, "latest_recorded_date": latest_date,
            "latest_date_flight_ids": latest, "latest_flight_ids": latest_flight_ids,
            "latest_time_order": "UTC-start" if latest_records and ordered else "date-only-ambiguous-or-empty",
            "unknown_ids": unknown, "excluded_ids": [], "coverage": source["coverage"] if source else None,
            "last_successful_import": source["retrieved_at"] if source else None,
            "latest_import_attempt": {k: self.all("import")[-1][k] for k in ("retrieved_at", "successful")} if self.all("import") else None,
            "data_through": max((r["value"]["date"] for r in self.flights(view) if r["value"]["date"]), default=None),
            "offline_cached": offline, "pending_findings": self.findings(),
            "limitation": "available recorded coverage only; zero does not mean never"}

    def template(self, page_id="prepared-page"):
        page = self.get("page", page_id)
        if not page:
            raise ValueError("confirmed page required")
        anchor = page["rows"][-1]
        carry = page["carry"]
        if set(carry) != set(COUNTERS) or any(type(v) is not int or v < 0 for v in carry.values()):
            raise ValueError("unknown carryover needs targeted feedback")
        for paper in self.all("paper"):
            if paper["page"] > page["page"] or (paper["page"] == page["page"] and paper["row"] > anchor["row"]):
                raise ValueError("paper advanced; confirm a new continuation page before generating another template")
        anchor_key = (anchor["flight"]["date"], anchor["flight"]["start"])
        candidates = []
        for record in self.flights():
            f = record["value"]
            if f["date"] is None or f["start"] is None:
                raise ValueError("unknown chronology needs targeted feedback")
            if (f["date"], f["start"]) > anchor_key and not self.get("paper", f["id"]):
                if any(f[k] is None for k in REQUIRED) or f["time_basis"] != "UTC":
                    raise ValueError("required field/time basis needs targeted feedback; no guessed values")
                if f["pilot_role"] not in ("PIC", "Dual"):
                    raise ValueError("FI/FE presentation is outside this bounded lab")
                if f["pilot_role"] == "Dual" and not any(c["role"] == "instructor" for c in f["crew"]):
                    raise ValueError("dual flight needs established instructor")
                candidates.append(record)
        candidates.sort(key=lambda r: (r["value"]["date"], r["value"]["start"], r["value"]["id"]))
        intervals = []
        for record in candidates:
            f = record["value"]
            start, end = (datetime.fromisoformat(f["date"] + "T" + f[k] + ":00+00:00") for k in ("start", "landing"))
            if end <= start or int((end - start).total_seconds()) != f["minutes"] * 60:
                raise ValueError("time interval/duration needs targeted feedback")
            if intervals and start < intervals[-1][1]:
                raise ValueError("overlapping/duplicate flight candidates need review")
            intervals.append((start, end))
        pages = [{"page": page["page"], "carry": carry, "rows": [{**r, "entry_state": "existing-context-do-not-copy"} for r in page["rows"]]}]
        nr = anchor["nr"]
        for record in candidates:
            current = pages[-1]
            if len(current["rows"]) == 10:
                summed = totals(current["rows"])
                pages.append({"page": current["page"] + 1, "carry": {k: current["carry"][k] + summed[k] for k in COUNTERS}, "rows": []})
                current = pages[-1]
            nr += 1
            current["rows"].append({"row": len(current["rows"]) + 1, "nr": nr,
                "flight": record["value"], "entry_state": "new-copy", "provenance": record["provenance"]})
        for p in pages:
            p["page_total"] = totals(p["rows"]) if len(p["rows"]) == 10 else None
            p["cumulative_total"] = {k: p["carry"][k] + p["page_total"][k] for k in COUNTERS} if p["page_total"] else None
        payload = {"dataset_id": self.dataset_id, "rules": RULES, "presentation": "host-field-view-v1",
            "layout": "synthetic-ten-row-book", "source_revision": self.revision(),
            "source_snapshot": self.get("state", "last_success"), "decisions": self.all("decision"),
            "findings": self.findings(), "pages": pages}
        # Ignore a template's own append when deciding whether the same content exists.
        old = self.all("template")
        if old and {k: v for k, v in old[-1].items() if k not in ("id", "source_revision")} == {k: v for k, v in payload.items() if k != "source_revision"}:
            return old[-1]
        payload["id"] = digest(payload)
        with self.db:
            self.append("template", payload["id"], payload)
        return payload

    def confirm_copied(self, template_id, flight_ids, *, at, expected_revision):
        t = self.get("template", template_id)
        if not t or not flight_ids or len(set(flight_ids)) != len(flight_ids):
            raise ValueError("identified snapshot and distinct selected entries required")
        eligible = {r["flight"]["id"]: {**r, "page": p["page"]} for p in t["pages"] for r in p["rows"] if r["entry_state"] == "new-copy"}
        if not set(flight_ids) <= set(eligible):
            raise ValueError("entry is not in this writing snapshot")
        # Relevant changes after preparation need review; template bytes stay unchanged.
        current = {r["value"]["id"]: r["value"] for r in self.flights()}
        if any(current.get(fid) != eligible[fid]["flight"] for fid in flight_ids):
            raise ValueError("changed flight evidence; review before confirming copied")
        with self.db:
            self.db.execute("BEGIN IMMEDIATE")
            if expected_revision != self.revision():
                raise ValueError("stale base revision")
            for fid in flight_ids:
                r = eligible[fid]
                old = self.get("paper", fid)
                value = {**r, "confirmed_at": at, "author": "synthetic-pilot", "evidence": "user-assertion:" + template_id}
                if old and any(old[k] != value[k] for k in ("flight", "page", "row", "nr")):
                    raise ValueError("conflicting paper evidence requires review")
                if not old:
                    self.append("paper", fid, value)

    def review_required(self, t):
        current = {r["value"]["id"]: r["value"] for r in self.flights()}
        return (t["findings"] != self.findings() or any(
            current.get(r["flight"]["id"]) != r["flight"]
            for p in t["pages"] for r in p["rows"] if r["entry_state"] == "new-copy"))

    def backup(self, target):
        """Versioned unencrypted archive; private by host mode only, no crypto claim."""
        target = Path(target)
        with tempfile.TemporaryDirectory() as temporary:
            copy = sqlite3.connect(str(Path(temporary) / "state.sqlite3"))
            self.db.backup(copy)
            copy.close()
            files = {"state.sqlite3": (Path(temporary) / "state.sqlite3").read_bytes()}
            referenced = {x["asset"] for kind in ("import", "observation") for x in self.all(kind)}
            for name in referenced:
                raw = (self.assets / name).read_bytes()
                if file_hash(raw) != name:
                    raise ValueError("asset corruption; backup refused")
                files["assets/" + name] = raw
            manifest = {"format": "moflight-host-backup-v1", "dataset_id": self.dataset_id,
                        "files": {name: file_hash(raw) for name, raw in files.items()}}
            with target.open("xb") as output:
                os.chmod(target, 0o600)
                with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
                    archive.writestr("manifest.json", canonical(manifest))
                    for name, raw in files.items():
                        archive.writestr(name, raw)


def restore(archive_path, destination):
    destination = Path(destination)
    if destination.exists():
        raise ValueError("restore requires a new directory; existing data preserved")
    with zipfile.ZipFile(archive_path) as archive:
        if len(archive.namelist()) != len(set(archive.namelist())) or sum(i.file_size for i in archive.infolist()) > 10_000_000:
            raise ValueError("duplicate/oversized backup")
        manifest = json.loads(archive.read("manifest.json"))
        if manifest["format"] != "moflight-host-backup-v1" or set(archive.namelist()) != {"manifest.json", *manifest["files"]}:
            raise ValueError("unsupported backup format/file set")
        files = {}
        for name, expected in manifest["files"].items():
            if name != "state.sqlite3" and (not name.startswith("assets/") or len(name) != 71 or any(c not in "0123456789abcdef" for c in name[7:])):
                raise ValueError("unsafe archive path")
            raw = archive.read(name)
            if file_hash(raw) != expected or (name.startswith("assets/") and expected != name[7:]):
                raise ValueError("backup integrity mismatch")
            files[name] = raw
        if "state.sqlite3" not in files:
            raise ValueError("database missing")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        stage = Path(temporary) / "restored"
        stage.mkdir(mode=0o700)
        for name, raw in files.items():
            path = stage / name
            path.parent.mkdir(exist_ok=True, mode=0o700)
            path.write_bytes(raw)
            os.chmod(path, 0o600)
        restored = Lab(stage, manifest["dataset_id"])
        try:
            if restored.db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("database integrity failure")
            references = {x["asset"] for kind in ("import", "observation") for x in restored.all(kind)}
            if not references <= {name[7:] for name in files if name.startswith("assets/")}:
                raise ValueError("referenced evidence bytes missing")
        finally:
            restored.close()
        stage.rename(destination)


def literal_fields(r):
    f = r["flight"]
    instructor = next((c["name"] for c in f["crew"] if c["role"] == "instructor"), None)
    pic = instructor if f["pilot_role"] == "Dual" else "Synthetic Pilot"
    companion = ", ".join(c["name"] for c in f["crew"] if c["role"] == "companion") if f["pilot_role"] != "Dual" else ""
    minutes = lambda n: f"{n // 60}:{n % 60:02}"
    c = counters(f)
    return {"Number": str(r["nr"]), "Date": f["date"], "Aircraft model": f["aircraft_model"],
        "Registration": f["registration"], "PIC / instructor": pic, "Companion": companion,
        "Launch": f["launch"], "Departure": f["start_place"], "Arrival": f["landing_place"],
        "Start (UTC)": f["start"], "Landing (UTC)": f["landing"], "Total (h:mm)": minutes(c["minutes"]),
        "PIC (h:mm)": minutes(c["pic_minutes"]) if f["pilot_role"] == "PIC" else "",
        "Dual (h:mm)": minutes(c["dual_minutes"]) if f["pilot_role"] == "Dual" else "",
        "FI/FE (h:mm)": minutes(c["fi_minutes"]) if f["pilot_role"] == "FI" else "",
        "Landings": str(f["landings"]), "Remarks": f["remarks"] or ""}


def render(t, review_required=False):
    """Read-only host viewer; no file export, confirmation or paper write."""
    esc = lambda v: html.escape(str(v), quote=True)
    body = ["<h1>MoFlight synthetic host lab</h1><p>Prepared observations / CSV. No OCR or live retrieval. "
            "Viewing never confirms copying. Blank means intentionally blank.</p>",
            "<p>Fixed snapshot: " + esc(t["id"]) + "</p>"]
    if review_required:
        body.append("<p><strong>Review required: relevant evidence changed. These retained instructions are unchanged.</strong></p>")
    display_totals = lambda values: "; ".join(
        f"{esc(k)}: {values[k] if k == 'landings' else str(values[k] // 60) + ':' + format(values[k] % 60, '02')}" for k in COUNTERS)
    for p in t["pages"]:
        body.append(f"<h2>Paper page {p['page']}</h2><p>Carryover (h:mm / landings): {display_totals(p['carry'])}</p>")
        for r in p["rows"]:
            body.append(f"<article><h3>Row {r['row']} · {esc(r['entry_state'])}</h3><dl>")
            body.extend(f"<dt>{esc(k)}</dt><dd>{esc(v) if v != '' else '(leave blank)'}</dd>" for k, v in literal_fields(r).items())
            body.append("</dl></article>")
        body.append("<p>Page totals / cumulative totals (h:mm / landings): " +
            (display_totals(p["page_total"]) + " / " + display_totals(p["cumulative_total"]) if p["page_total"] else "leave all blank — partial page") + "</p>")
    body.append("<details><summary>Findings and provenance — explanation, not remarks to copy</summary><pre>" +
                esc(json.dumps({k: t[k] for k in ("findings", "source_snapshot", "decisions", "rules")}, indent=2, sort_keys=True)) + "</pre></details>")
    return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MoFlight host lab</title><style>body{max-width:46rem;margin:auto;padding:1rem;font:18px system-ui}article{border:1px solid #888;padding:1rem;margin:1rem 0}dt{font-weight:bold}dd{margin:0 0 .7rem;overflow-wrap:anywhere}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style>' + "".join(body) + "</html>"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("demo", "query", "template", "serve", "backup", "restore", "confirm"))
    parser.add_argument("--data", required=True)
    parser.add_argument("--archive")
    parser.add_argument("--registration")
    parser.add_argument("--person-id")
    parser.add_argument("--snapshot")
    parser.add_argument("--flight-id", action="append")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    if args.command == "restore":
        restore(args.archive, args.data)
        return
    lab = Lab(args.data)
    try:
        if args.command == "demo":
            fixture = ROOT / "tests/fixtures/local-logbook"
            lab.import_csv(fixture / "flights.csv", {"from": "2026-01-01", "through": "2026-06-01", "complete": False}, "2026-06-02T12:00:00Z")
            lab.prepare_page(fixture / "page.json")
            if not lab.get("decision", "fixture:f69:aircraft_model"):
                lab.respond("fixture:f69:aircraft_model", "ignore", reason="synthetic historical warning", at="2026-06-02T12:05:00Z", expected_revision=lab.revision())
            print(canonical(lab.template()))
        elif args.command == "query":
            print(canonical(lab.query(registration=args.registration, person_id=args.person_id)))
        elif args.command == "template":
            print(canonical(lab.get("template", args.snapshot) if args.snapshot else lab.template()))
        elif args.command == "backup":
            lab.backup(args.archive)
        elif args.command == "confirm":
            lab.confirm_copied(args.snapshot, args.flight_id, at=datetime.now().astimezone().isoformat(), expected_revision=lab.revision())
        elif args.command == "serve":
            templates = lab.all("template")
            if not templates:
                raise ValueError("prepare a template first")
            fixed = lab.get("template", args.snapshot) if args.snapshot else templates[-1]
            if not fixed:
                raise ValueError("unknown snapshot")
            class Handler(BaseHTTPRequestHandler):
                def do_GET(self):
                    self.send_response(200 if self.path == "/" else 404)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Cache-Control", "no-store")
                    self.end_headers()
                    self.wfile.write(render(fixed, lab.review_required(fixed)).encode() if self.path == "/" else b"Not found")
            print(f"Read-only fixed host snapshot at http://127.0.0.1:{args.port}", flush=True)
            HTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
    finally:
        lab.close()


if __name__ == "__main__":
    main()

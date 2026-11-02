"""Deterministic fake HTTP outcomes for probe logic; hosted RLS is unverified."""
import importlib.util
import io
import json
import os
from pathlib import Path
import unittest
from urllib.error import HTTPError
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("supabase_trial_probe", ROOT / "pocs/supabase-trial/probe.py")
probe = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(probe)


class ScriptedTransport:
    """Return scripted route outcomes and retain only fixture rows for readbacks."""

    def __init__(self, fault=None):
        self.users = {"synthetic-a-token": "user-a", "synthetic-b-token": "user-b"}
        self.fault = fault
        self.counts = {}
        self.dataset_ids = {}
        self.created_datasets = []
        self.deleted_datasets = []
        self.flight_rows = {}
        self.profile_rows = {}
        self.attempt_rows = {}
        self.uploaded_paths = []
        self.deleted_paths = []
        # This existing ID is deliberately outside the generated per-run UUIDs.
        self.existing_dataset_id = "existing-dataset"

    @staticmethod
    def json_response(status, value=None):
        body = json.dumps(value).encode("utf-8") if value is not None else b""
        return _Response(status, body)

    @staticmethod
    def rejected(request, status):
        # The probe must discard this synthetic provider body.
        raise HTTPError(request.full_url, status, "synthetic fake response", {}, io.BytesIO(b"PROVIDER_BODY_SENTINEL"))

    @staticmethod
    def body(request):
        return json.loads(request.data.decode("utf-8")) if request.data else None

    @staticmethod
    def filters(request):
        return {key: value[0][3:] for key, value in parse_qs(urlsplit(request.full_url).query).items()
                if value and value[0].startswith("eq.")}

    def count(self, route):
        self.counts[route] = self.counts.get(route, 0) + 1
        return self.counts[route]

    def open(self, request, timeout=15):
        if timeout != 15 or not request.full_url.startswith("https://trial.supabase.co/"):
            raise AssertionError("unexpected fake request configuration")
        url = urlsplit(request.full_url)
        path, method, query = url.path, request.get_method(), self.filters(request)
        authorization = request.get_header("Authorization") or ""
        token = authorization.removeprefix("Bearer ") if authorization else None
        owner, data = self.users.get(token), self.body(request)

        if path == "/auth/v1/user":
            return self.json_response(200, {"id": owner}) if owner else self.rejected(request, 401)
        if (path.startswith("/rest/v1/") or path.startswith("/storage/v1/")) and owner is None:
            return self.rejected(request, 401)

        if path == "/rest/v1/mf_trial_datasets" and method == "POST":
            dataset_id = data["id"]
            self.dataset_ids[owner] = dataset_id
            self.created_datasets.append((owner, dataset_id))
            return self.json_response(201, [{"owner": owner, "id": dataset_id}])
        if path == "/rest/v1/mf_trial_datasets" and method == "DELETE":
            self.deleted_datasets.append((query.get("owner"), query.get("id")))
            return self.json_response(200, [{"owner": query.get("owner"), "id": query.get("id")}])

        if path == "/rest/v1/rpc/mf_trial_record" and method == "POST":
            call = self.count(("flight-command", owner))
            if call in (1, 2):
                row = {"owner": owner, "id": data["p_flight"], "dataset_id": data["p_dataset"],
                       "payload": data["p_payload"]}
                self.flight_rows[(owner, row["id"])] = row
                return self.json_response(200, row["id"])
            return self.rejected(request, 403 if call in (3, 5) else 400)

        if path == "/rest/v1/mf_trial_flights":
            if method == "GET":
                call = self.count(("flight-read", owner))
                if call == 1:
                    return self.json_response(200, [self.flight_rows[(owner, query["id"])]])
                return self.json_response(200, [])
            if method == "PATCH":
                if data.get("owner"):
                    return self.rejected(request, 403)
                return self.json_response(200, [])
            if method == "POST":
                call = self.count(("flight-direct-write", owner))
                return self.rejected(request, 403 if call == 1 else 409)

        if path == "/rest/v1/mf_trial_profile_settings":
            if method == "POST":
                call = self.count(("profile-create", owner))
                if call == 1:
                    row = {"owner": owner, **data}
                    self.profile_rows[owner] = row
                    response_row = dict(row)
                    if self.fault == "wrong_profile_owner":
                        response_row["owner"] = "wrong-owner"
                    return self.json_response(201, [response_row])
                return self.rejected(request, 403 if call == 2 else 409)
            if method == "GET":
                call = self.count(("profile-read", owner))
                # These are canned outcomes in request order: own row, foreign
                # filter, target-owner readback, then post-check own readback.
                if (owner == "user-a" and call in (1, 3, 4)) or (owner == "user-b" and call in (1, 2, 4)):
                    row = self.profile_rows.get(owner)
                    return self.json_response(200, [row] if row else [])
                return self.json_response(200, [])
            if method == "PATCH":
                call = self.count(("profile-update", owner))
                if call == 1:
                    row = self.profile_rows[owner]
                    row.update(data)
                    return self.json_response(200, [row])
                if call == 2:
                    if self.fault == "foreign_profile_write_leak":
                        other = "user-b" if owner == "user-a" else "user-a"
                        return self.json_response(200, [self.profile_rows[other]])
                    return self.json_response(200, [])
                return self.rejected(request, 403 if call == 3 else 400)

        if path == "/rest/v1/mf_trial_learning_attempts":
            if method == "POST":
                call = self.count(("attempt-create", owner))
                if call == 1:
                    row = {"owner": owner, **data}
                    self.attempt_rows[owner] = row
                    return self.json_response(201, [row])
                return self.rejected(request, (403, 409, 400, 400, 400, 400)[call - 2])
            if method == "GET":
                call = self.count(("attempt-read", owner))
                # As above, return fixed own/foreign/target-owner fixtures.
                if (owner == "user-a" and call in (1, 3)) or (owner == "user-b" and call in (1, 2)):
                    row = self.attempt_rows.get(owner)
                    return self.json_response(200, [row] if row else [])
                return self.json_response(200, [])
            if method == "PATCH":
                return self.json_response(200, [])

        if path.startswith("/storage/v1/object/"):
            parts = path.split("/")
            if method == "DELETE" and len(parts) == 5:
                self.deleted_paths.extend(data.get("prefixes", []))
                return self.json_response(200, {"message": "ok"})
            if method == "POST" and len(parts) >= 6 and parts[4] == "moflight-trial":
                object_path = "/".join(parts[5:])
                self.uploaded_paths.append(object_path)
                self.files = getattr(self, "files", {})
                self.files[object_path] = request.data or b""
                return self.json_response(201, {"Key": object_path})
            if len(parts) >= 7 and parts[5] == "moflight-trial":
                object_path = "/".join(parts[6:])
                if method == "GET" and parts[4] == "authenticated":
                    if object_path.startswith(owner + "/"):
                        return _Response(200, self.files[object_path])
                    return self.rejected(request, 403)
                if method == "POST" and parts[4] == "sign":
                    return self.rejected(request, 403)

        return self.rejected(request, 404)


class _Response:
    def __init__(self, status, body):
        self.status, self.body = status, body

    def read(self, size=-1):
        return self.body if size < 0 else self.body[:size]

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False


class SupabaseTrialProbeTests(unittest.TestCase):
    def run_fake_probe(self, transport):
        request = probe.make_request("https://trial.supabase.co", "sb_publishable_synthetic", opener=transport.open)
        return probe.run_probe("synthetic-a-token", "synthetic-b-token", request)

    def test_scripted_success_checks_new_flows_and_exact_run_cleanup(self):
        transport = ScriptedTransport()
        report = self.run_fake_probe(transport)

        self.assertEqual(report["status"], "passed", report)
        names = [item["check"] for item in report["checks"] if item["status"] == "passed"]
        for name in ("own-profile-settings-create-0", "own-profile-settings-update-0",
                     "target-profile-settings-unchanged-1", "profile-owner-with-check-denied-0",
                     "own-learning-attempt-create-v1-0", "target-learning-attempt-unchanged-1",
                     "unsupported-learning-attempt-format-rejected-0", "missing-learning-attempt-format-version-rejected-0",
                     "mismatched-learning-attempt-format-version-rejected-0"):
            self.assertIn(name, names)
        self.assertEqual(transport.deleted_datasets, transport.created_datasets)
        self.assertTrue(all(dataset != transport.existing_dataset_id for _, dataset in transport.deleted_datasets))
        self.assertEqual(transport.deleted_paths, transport.uploaded_paths)
        self.assertTrue(all(transport.existing_dataset_id not in path for path in transport.deleted_paths))
        rendered = json.dumps(report)
        self.assertNotIn("synthetic-a-token", rendered)
        self.assertNotIn("synthetic-b-token", rendered)
        self.assertNotIn("PROVIDER_BODY_SENTINEL", rendered)

    def test_probe_detects_wrong_returned_owner_and_cleans_created_dataset(self):
        transport = ScriptedTransport(fault="wrong_profile_owner")
        report = self.run_fake_probe(transport)

        self.assertEqual(report["status"], "failed")
        self.assertIn({"check": "own-profile-settings-create-0", "status": "failed"}, report["checks"])
        self.assertEqual(transport.deleted_datasets, transport.created_datasets[:1])
        self.assertNotIn(transport.existing_dataset_id, [dataset for _, dataset in transport.deleted_datasets])

    def test_probe_detects_foreign_write_result_and_cleans_created_datasets(self):
        transport = ScriptedTransport(fault="foreign_profile_write_leak")
        report = self.run_fake_probe(transport)

        self.assertEqual(report["status"], "failed")
        self.assertIn({"check": "foreign-profile-settings-write-filtered-0", "status": "failed"}, report["checks"])
        self.assertEqual(transport.deleted_datasets, transport.created_datasets)

    def test_missing_configuration_blocks_before_network(self):
        output = io.StringIO()
        with patch.dict(os.environ, {}, clear=True), patch("sys.stdout", output), patch.object(probe, "urlopen") as opener:
            self.assertEqual(probe.main(), 2)
        opener.assert_not_called()
        result = json.loads(output.getvalue())
        self.assertEqual(result["status"], "blocked")
        self.assertIn("no requests sent", result["reason"])


if __name__ == "__main__":
    unittest.main()

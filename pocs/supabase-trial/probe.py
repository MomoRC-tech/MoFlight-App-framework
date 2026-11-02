"""Real REST probe, blocked unless explicitly configured for a disposable project.

Only synthetic records; print check names/status, never response bodies or secrets.
Registration/confirmation/recovery and device tests are separate manual gates.
"""
import base64
import json
import os
import re
import sys
import uuid
from urllib.error import HTTPError
from urllib.request import Request, urlopen


NOT_TESTED = [
    "registration",
    "confirmation",
    "recovery",
    "expired-real-session",
    "native-token-storage",
    "sync",
    "jobs",
    "idle-return",
]


def make_request(url, key, opener=None):
    """Build the bounded HTTP transport; tests inject an in-memory opener."""
    open_request = opener or urlopen

    def request(method, path, token=None, data=None, raw=False):
        headers = {"apikey": key, "Content-Type": "application/json", "Prefer": "return=representation"}
        if token:
            headers["Authorization"] = "Bearer " + token
        body = data if raw else json.dumps(data).encode("utf-8") if data is not None else None
        try:
            with open_request(Request(url + path, data=body, headers=headers, method=method), timeout=15) as response:
                value = response.read(100_000)
                return response.status, value if raw else json.loads(value) if value else None
        except HTTPError as error:
            return error.code, None  # Never read or log the provider response body.

    return request


def run_probe(token_a, token_b, request):
    """Run checks and clean up only UUID rows/objects created by this invocation."""
    results = []
    created_datasets = []  # (token, authenticated owner, per-run dataset UUID)
    file_paths = []  # (token, exact per-run storage object path)

    def check(name, condition):
        results.append({"check": name, "status": "passed" if condition else "failed"})
        if not condition:
            raise RuntimeError("probe check failed")

    try:
        users = []
        for label, token in (("a", token_a), ("b", token_b)):
            status, user = request("GET", "/auth/v1/user", token)
            check("verified-session-" + label, status == 200 and isinstance(user, dict) and bool(user.get("id")))
            users.append(user["id"])
        check("distinct-auth-identities", users[0] != users[1])

        datasets = [str(uuid.uuid4()) for _ in users]
        flights = [str(uuid.uuid4()) for _ in users]
        attempts = [str(uuid.uuid4()) for _ in users]
        labels = ["Synthetic Pilot A", "Synthetic Pilot B"]
        profile_settings = [
            {"synthetic": True, "distanceUnit": "km", "practiceMode": True},
            {"synthetic": True, "distanceUnit": "km", "practiceMode": True},
        ]
        updated_settings = [settings | {"practiceMode": False} for settings in profile_settings]
        attempt_payloads = [
            {"synthetic": True, "formatVersion": 1, "question": "sample-a", "answer": "sample-answer"},
            {"synthetic": True, "formatVersion": 1, "question": "sample-b", "answer": "sample-answer"},
        ]

        for i, token in enumerate((token_a, token_b)):
            status, value = request("POST", "/rest/v1/mf_trial_datasets", token, {"id": datasets[i]})
            if status == 201:
                created_datasets.append((token, users[i], datasets[i]))
            check("own-dataset-create-" + str(i),
                  status == 201 and isinstance(value, list) and len(value) == 1
                  and value[0].get("owner") == users[i] and value[0].get("id") == datasets[i])

            status, value = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset": datasets[i], "p_flight": flights[i], "p_payload": {"synthetic": True, "minutes": 10}})
            check("authenticated-command-" + str(i), status == 200 and value == flights[i])
            status, value = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset": datasets[i], "p_flight": flights[i], "p_payload": {"synthetic": True, "minutes": 10}})
            check("command-repeat-" + str(i), status == 200 and value == flights[i])
            status, rows = request("GET", "/rest/v1/mf_trial_flights?id=eq." + flights[i], token)
            check("repeat-does-not-inflate-" + str(i), status == 200 and isinstance(rows, list) and len(rows) == 1)

            profile = {"dataset_id": datasets[i], "label": labels[i], "settings": profile_settings[i]}
            status, value = request("POST", "/rest/v1/mf_trial_profile_settings", token, profile)
            check("own-profile-settings-create-" + str(i),
                  status == 201 and isinstance(value, list) and len(value) == 1
                  and value[0].get("owner") == users[i]
                  and value[0].get("dataset_id") == datasets[i]
                  and value[0].get("label") == labels[i]
                  and value[0].get("settings") == profile_settings[i])
            status, rows = request("GET", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[i], token)
            check("own-profile-settings-read-" + str(i),
                  status == 200 and isinstance(rows, list) and len(rows) == 1
                  and rows[0].get("owner") == users[i]
                  and rows[0].get("settings") == profile_settings[i])
            status, value = request("PATCH", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[i],
                                    token, {"settings": updated_settings[i]})
            check("own-profile-settings-update-" + str(i),
                  status == 200 and isinstance(value, list) and len(value) == 1
                  and value[0].get("owner") == users[i]
                  and value[0].get("dataset_id") == datasets[i]
                  and value[0].get("settings") == updated_settings[i])

            status, value = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[i], "id": attempts[i], "format_version": 1, "payload": attempt_payloads[i]})
            check("own-learning-attempt-create-v1-" + str(i),
                  status == 201 and isinstance(value, list) and len(value) == 1
                  and value[0].get("owner") == users[i]
                  and value[0].get("dataset_id") == datasets[i]
                  and value[0].get("id") == attempts[i]
                  and value[0].get("format_version") == 1
                  and value[0].get("payload") == attempt_payloads[i])
            status, rows = request("GET", "/rest/v1/mf_trial_learning_attempts?dataset_id=eq." + datasets[i]
                                   + "&id=eq." + attempts[i], token)
            check("own-learning-attempt-read-v1-" + str(i),
                  status == 200 and isinstance(rows, list) and len(rows) == 1
                  and rows[0].get("owner") == users[i]
                  and rows[0].get("format_version") == 1
                  and rows[0].get("payload") == attempt_payloads[i])

        for i, token in enumerate((token_a, token_b)):
            foreign = 1 - i

            status, rows = request("GET", "/rest/v1/mf_trial_flights?id=eq." + flights[foreign], token)
            check("foreign-flight-read-" + str(i), status == 200 and rows == [])
            status, rows = request("PATCH", "/rest/v1/mf_trial_flights?id=eq." + flights[foreign], token,
                                   {"payload": {"synthetic": True, "minutes": 99}})
            check("foreign-flight-write-" + str(i), status == 200 and rows == [])
            status, _ = request("POST", "/rest/v1/mf_trial_flights", token,
                {"owner": users[foreign], "id": str(uuid.uuid4()), "dataset_id": datasets[foreign],
                 "payload": {"synthetic": True}})
            check("forged-owner-" + str(i), status in (401, 403))
            status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset": datasets[foreign], "p_flight": str(uuid.uuid4()), "p_payload": {"synthetic": True}})
            check("foreign-reference-command-" + str(i), status in (401, 403))
            status, _ = request("POST", "/rest/v1/mf_trial_flights", token,
                {"id": str(uuid.uuid4()), "dataset_id": datasets[foreign], "payload": {"synthetic": True}})
            check("foreign-reference-direct-" + str(i), status in (400, 403, 409))
            status, _ = request("PATCH", "/rest/v1/mf_trial_flights?id=eq." + flights[i], token,
                                {"owner": users[foreign]})
            check("owner-reassignment-denied-" + str(i), status in (400, 403, 409))
            status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset": datasets[i], "p_flight": str(uuid.uuid4()), "p_payload": {"minutes": 10}})
            check("invalid-command-payload-" + str(i), status == 400)

            # A foreign filter is hidden by USING and normally yields 200 with no rows.
            status, rows = request("GET", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[foreign], token)
            check("foreign-profile-settings-read-filtered-" + str(i), status == 200 and rows == [])
            status, rows = request("PATCH", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[foreign], token,
                                   {"settings": {"synthetic": True, "distanceUnit": "nm", "practiceMode": False}})
            check("foreign-profile-settings-write-filtered-" + str(i), status == 200 and rows == [])
            status, rows = request("GET", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[foreign],
                                   (token_a, token_b)[foreign])
            check("target-profile-settings-unchanged-" + str(i),
                  status == 200 and isinstance(rows, list) and len(rows) == 1
                  and rows[0].get("owner") == users[foreign]
                  and rows[0].get("settings") == updated_settings[foreign])

            status, _ = request("POST", "/rest/v1/mf_trial_profile_settings", token,
                {"owner": users[foreign], "dataset_id": datasets[foreign], "label": "Synthetic Forged",
                 "settings": {"synthetic": True}})
            check("profile-owner-with-check-denied-" + str(i), status in (401, 403))
            status, _ = request("POST", "/rest/v1/mf_trial_profile_settings", token,
                {"dataset_id": datasets[foreign], "label": "Synthetic Foreign Reference",
                 "settings": {"synthetic": True}})
            check("profile-foreign-reference-denied-" + str(i), status in (400, 403, 409))
            status, _ = request("PATCH", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[i],
                                token, {"owner": users[foreign]})
            check("profile-owner-reassignment-denied-" + str(i), status in (401, 403))
            status, rows = request("GET", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[i], token)
            check("profile-after-owner-check-unchanged-" + str(i),
                  status == 200 and isinstance(rows, list) and len(rows) == 1
                  and rows[0].get("owner") == users[i]
                  and rows[0].get("settings") == updated_settings[i])
            status, _ = request("PATCH", "/rest/v1/mf_trial_profile_settings?dataset_id=eq." + datasets[i], token,
                                {"settings": {"synthetic": False}})
            check("invalid-profile-settings-rejected-" + str(i), status == 400)

            # Attempts use row filtering for foreign IDs; the target owner re-reads
            # the original after the filtered request to prove it was not changed.
            status, rows = request("GET", "/rest/v1/mf_trial_learning_attempts?dataset_id=eq." + datasets[foreign]
                                   + "&id=eq." + attempts[foreign], token)
            check("foreign-learning-attempt-read-filtered-" + str(i), status == 200 and rows == [])
            changed_attempt = attempt_payloads[foreign] | {"answer": "unauthorized-change"}
            status, rows = request("PATCH", "/rest/v1/mf_trial_learning_attempts?dataset_id=eq." + datasets[foreign]
                                   + "&id=eq." + attempts[foreign], token, {"payload": changed_attempt})
            check("foreign-learning-attempt-write-filtered-" + str(i), status == 200 and rows == [])
            status, rows = request("GET", "/rest/v1/mf_trial_learning_attempts?dataset_id=eq." + datasets[foreign]
                                   + "&id=eq." + attempts[foreign], (token_a, token_b)[foreign])
            check("target-learning-attempt-unchanged-" + str(i),
                  status == 200 and isinstance(rows, list) and len(rows) == 1
                  and rows[0].get("owner") == users[foreign]
                  and rows[0].get("format_version") == 1
                  and rows[0].get("payload") == attempt_payloads[foreign])
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"owner": users[foreign], "dataset_id": datasets[foreign], "id": str(uuid.uuid4()),
                 "format_version": 1, "payload": {"synthetic": True, "formatVersion": 1}})
            check("learning-attempt-owner-with-check-denied-" + str(i), status in (401, 403))
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[foreign], "id": str(uuid.uuid4()), "format_version": 1,
                 "payload": {"synthetic": True, "formatVersion": 1}})
            check("learning-attempt-foreign-reference-denied-" + str(i), status in (400, 403, 409))
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[i], "id": str(uuid.uuid4()), "format_version": 2,
                 "payload": {"synthetic": True, "formatVersion": 2}})
            check("unsupported-learning-attempt-format-rejected-" + str(i), status == 400)
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[i], "id": str(uuid.uuid4()), "format_version": 1,
                 "payload": {"formatVersion": 1, "answer": "missing-synthetic-marker"}})
            check("invalid-learning-attempt-payload-rejected-" + str(i), status == 400)
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[i], "id": str(uuid.uuid4()), "format_version": 1,
                 "payload": {"synthetic": True, "answer": "missing-format-version"}})
            check("missing-learning-attempt-format-version-rejected-" + str(i), status == 400)
            status, _ = request("POST", "/rest/v1/mf_trial_learning_attempts", token,
                {"dataset_id": datasets[i], "id": str(uuid.uuid4()), "format_version": 1,
                 "payload": {"synthetic": True, "formatVersion": 2, "answer": "mismatched-format-version"}})
            check("mismatched-learning-attempt-format-version-rejected-" + str(i), status == 400)

            path = users[i] + "/" + datasets[i] + "/synthetic.json"
            status, _ = request("POST", "/storage/v1/object/moflight-trial/" + path, token, {"synthetic": True})
            if status in (200, 201):
                file_paths.append((token, path))
            check("private-file-upload-" + str(i), status in (200, 201))

        for i, token in enumerate((token_a, token_b)):
            own = users[i] + "/" + datasets[i] + "/synthetic.json"
            foreign = users[1 - i] + "/" + datasets[1 - i] + "/synthetic.json"
            status, content = request("GET", "/storage/v1/object/authenticated/moflight-trial/" + own, token, raw=True)
            check("own-private-download-" + str(i), status == 200 and json.loads(content) == {"synthetic": True})
            status, _ = request("GET", "/storage/v1/object/authenticated/moflight-trial/" + foreign, token, raw=True)
            check("foreign-private-download-" + str(i), status in (400, 401, 403, 404))
            status, _ = request("POST", "/storage/v1/object/sign/moflight-trial/" + foreign, token, {"expiresIn": 60})
            check("foreign-signed-link-" + str(i), status in (400, 401, 403, 404))

        status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", None,
            {"p_dataset": datasets[0], "p_flight": str(uuid.uuid4()), "p_payload": {"synthetic": True}})
        check("anonymous-command-denied", status in (401, 403))
        status, _ = request("GET", "/rest/v1/mf_trial_flights")
        check("anonymous-rows-denied", status in (401, 403))
        status, _ = request("GET", "/rest/v1/mf_trial_flights", "invalid-session")
        check("invalid-session-denied", status == 401)
    except (RuntimeError, OSError, KeyError, IndexError, TypeError, ValueError):
        results.append({"check": "probe-completion", "status": "failed",
                        "reason": "see named checks; provider bodies deliberately omitted"})
    finally:
        # Delete only this run's identified synthetic objects; never bulk-delete.
        for token, path in file_paths:
            try:
                status, _ = request("DELETE", "/storage/v1/object/moflight-trial", token, {"prefixes": [path]})
                results.append({"check": "synthetic-file-cleanup", "status": "passed" if status == 200 else "failed"})
            except Exception:
                results.append({"check": "synthetic-file-cleanup", "status": "failed"})
        for token, owner, dataset in created_datasets:
            try:
                path = "/rest/v1/mf_trial_datasets?owner=eq." + owner + "&id=eq." + dataset
                status, value = request("DELETE", path, token)
                removed = status == 204 or (status == 200 and isinstance(value, list)
                                            and any(row.get("owner") == owner and row.get("id") == dataset for row in value))
                results.append({"check": "synthetic-row-cleanup", "status": "passed" if removed else "failed"})
            except Exception:
                results.append({"check": "synthetic-row-cleanup", "status": "failed"})

    return {"status": "failed" if any(r["status"] == "failed" for r in results) else "passed",
            "checks": results, "not_tested": NOT_TESTED}


def main():
    names = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "MOFLIGHT_TRIAL_A_TOKEN", "MOFLIGHT_TRIAL_B_TOKEN")
    values = [os.environ.get(k) for k in names]
    if not all(values) or os.environ.get("MOFLIGHT_DISPOSABLE_TRIAL") != "yes":
        print(json.dumps({"status": "blocked", "reason": "disposable test project, public key and two synthetic user sessions required; no requests sent"}))
        return 2
    url, key, token_a, token_b = values
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
        print(json.dumps({"status": "blocked", "reason": "expected explicit Supabase Cloud test-project HTTPS URL"}))
        return 2
    if key.startswith("sb_secret_"):
        print(json.dumps({"status": "blocked", "reason": "privileged keys forbidden in client probe"}))
        return 2
    if key.count(".") == 2:
        try:
            encoded = key.split(".")[1]
            role = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))).get("role")
            if role != "anon":
                raise ValueError()
        except (ValueError, KeyError, TypeError, json.JSONDecodeError):
            print(json.dumps({"status": "blocked", "reason": "expected public client key"}))
            return 2
    report = run_probe(token_a, token_b, make_request(url, key))
    print(json.dumps(report))
    return 1 if report["status"] == "failed" else 0


if __name__ == "__main__":
    sys.exit(main())

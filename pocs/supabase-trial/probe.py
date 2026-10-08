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
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def main():
    names = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "MOFLIGHT_TRIAL_A_TOKEN", "MOFLIGHT_TRIAL_B_TOKEN")
    values = [os.environ.get(k) for k in names]
    if not all(values) or os.environ.get("MOFLIGHT_DISPOSABLE_TRIAL") != "yes":
        print(json.dumps({"status":"blocked", "reason":"disposable test project, public key and two synthetic user sessions required; no requests sent"}))
        return 2
    url, key, a, b = values
    if not re.fullmatch(r"https://[a-z0-9-]+\.supabase\.co", url):
        print(json.dumps({"status":"blocked", "reason":"expected explicit Supabase Cloud test-project HTTPS URL"}))
        return 2
    if key.startswith("sb_secret_"):
        print(json.dumps({"status":"blocked", "reason":"privileged keys forbidden in client probe"}))
        return 2
    if key.count(".") == 2:
        try:
            encoded = key.split(".")[1]
            role = json.loads(base64.urlsafe_b64decode(encoded + "=" * (-len(encoded) % 4))).get("role")
            if role != "anon":
                raise ValueError()
        except (ValueError, KeyError):
            print(json.dumps({"status":"blocked", "reason":"expected public client key"}))
            return 2
    results = []

    def request(method, path, token=None, data=None, raw=False):
        headers = {"apikey":key, "Content-Type":"application/json", "Prefer":"return=representation"}
        if token:
            headers["Authorization"] = "Bearer " + token
        body = data if raw else json.dumps(data).encode() if data is not None else None
        try:
            with urlopen(Request(url + path, data=body, headers=headers, method=method), timeout=15) as response:
                value = response.read(100_000)
                return response.status, value if raw else json.loads(value) if value else None
        except HTTPError as error:
            return error.code, None  # never log the provider response or reflected secrets

    def check(name, condition):
        results.append({"check": name, "status": "passed" if condition else "failed"})
        if not condition:
            raise RuntimeError("probe check failed")

    created = []
    users = []
    file_paths = []
    try:
        for label, token in (("a",a),("b",b)):
            status, user = request("GET", "/auth/v1/user", token)
            check("verified-session-" + label, status == 200 and isinstance(user,dict) and bool(user.get("id")))
            users.append(user["id"])
        check("distinct-auth-identities", users[0] != users[1])
        datasets, flights = [str(uuid.uuid4()) for _ in range(2)], [str(uuid.uuid4()) for _ in range(2)]
        for i, token in enumerate((a,b)):
            status, value = request("POST", "/rest/v1/mf_trial_datasets", token, {"id":datasets[i]})
            check("own-dataset-create-" + str(i), status == 201 and value[0]["owner"] == users[i])
            created.append((token,datasets[i]))
            status, value = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset":datasets[i],"p_flight":flights[i],"p_payload":{"synthetic":True,"minutes":10}})
            check("authenticated-command-" + str(i), status == 200 and value == flights[i])
            status, value = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset":datasets[i],"p_flight":flights[i],"p_payload":{"synthetic":True,"minutes":10}})
            check("command-repeat-" + str(i), status == 200 and value == flights[i])
            status, rows = request("GET", "/rest/v1/mf_trial_flights?id=eq." + flights[i], token)
            check("repeat-does-not-inflate-" + str(i), status == 200 and len(rows) == 1)
        for i, token in enumerate((a,b)):
            foreign = 1-i
            status, rows = request("GET", "/rest/v1/mf_trial_flights?id=eq." + flights[foreign], token)
            check("foreign-flight-read-" + str(i), status == 200 and rows == [])
            status, rows = request("PATCH", "/rest/v1/mf_trial_flights?id=eq." + flights[foreign], token, {"payload":{"synthetic":True,"minutes":99}})
            check("foreign-flight-write-" + str(i), status == 200 and rows == [])
            status, _ = request("POST", "/rest/v1/mf_trial_flights", token,
                {"owner":users[foreign],"id":str(uuid.uuid4()),"dataset_id":datasets[foreign],"payload":{"synthetic":True}})
            check("forged-owner-" + str(i), status in (401,403))
            status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset":datasets[foreign],"p_flight":str(uuid.uuid4()),"p_payload":{"synthetic":True}})
            check("foreign-reference-command-" + str(i), status in (401,403))
            status, _ = request("POST", "/rest/v1/mf_trial_flights", token,
                {"id":str(uuid.uuid4()),"dataset_id":datasets[foreign],"payload":{"synthetic":True}})
            check("foreign-reference-direct-" + str(i), status in (400,403,409))
            status, _ = request("PATCH", "/rest/v1/mf_trial_flights?id=eq." + flights[i], token, {"owner":users[foreign]})
            check("owner-reassignment-denied-" + str(i), status in (403,409))
            status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", token,
                {"p_dataset":datasets[i],"p_flight":str(uuid.uuid4()),"p_payload":{"minutes":10}})
            check("invalid-command-payload-" + str(i), status == 400)
            path = users[i] + "/synthetic.json"
            status, _ = request("POST", "/storage/v1/object/moflight-trial/" + path, token, {"synthetic":True})
            check("private-file-upload-" + str(i), status in (200,201))
            file_paths.append((token,path))
        for i, token in enumerate((a,b)):
            own = users[i] + "/synthetic.json"
            foreign = users[1-i] + "/synthetic.json"
            status, content = request("GET", "/storage/v1/object/authenticated/moflight-trial/" + own, token, raw=True)
            check("own-private-download-" + str(i), status == 200 and json.loads(content) == {"synthetic":True})
            status, _ = request("GET", "/storage/v1/object/authenticated/moflight-trial/" + foreign, token, raw=True)
            check("foreign-private-download-" + str(i), status in (400,401,403,404))
            status, _ = request("POST", "/storage/v1/object/sign/moflight-trial/" + foreign, token, {"expiresIn":60})
            check("foreign-signed-link-" + str(i), status in (400,401,403,404))
        status, _ = request("POST", "/rest/v1/rpc/mf_trial_record", None,
            {"p_dataset":datasets[0],"p_flight":str(uuid.uuid4()),"p_payload":{"synthetic":True}})
        check("anonymous-command-denied", status in (401,403))
        status, _ = request("GET", "/rest/v1/mf_trial_flights")
        check("anonymous-rows-denied", status in (401,403))
        status, _ = request("GET", "/rest/v1/mf_trial_flights", "invalid-session")
        check("invalid-session-denied", status == 401)
    except (RuntimeError, URLError, KeyError, TypeError, ValueError):
        results.append({"check":"probe-completion", "status":"failed", "reason":"see named checks; provider bodies deliberately omitted"})
    finally:
        # Only this run's identified synthetic objects are cleaned up. No bulk delete.
        for token,path in file_paths:
            try:
                status, _ = request("DELETE", "/storage/v1/object/moflight-trial", token, {"prefixes":[path]})
                results.append({"check":"synthetic-file-cleanup", "status":"passed" if status == 200 else "failed"})
            except URLError:
                results.append({"check":"synthetic-file-cleanup", "status":"failed"})
        for token,dataset in created:
            try:
                status, _ = request("DELETE", "/rest/v1/mf_trial_datasets?id=eq." + dataset, token)
                results.append({"check":"synthetic-row-cleanup", "status":"passed" if status in (200,204) else "failed"})
            except URLError:
                results.append({"check":"synthetic-row-cleanup", "status":"failed"})
    print(json.dumps({"status":"failed" if any(r["status"] == "failed" for r in results) else "passed", "checks":results,
        "not_tested":["registration","confirmation","recovery","expired-real-session","native-token-storage","sync","jobs","idle-return"]}))
    return 1 if any(r["status"] == "failed" for r in results) else 0


if __name__ == "__main__":
    sys.exit(main())

"""Reuse an unexpired lab APK only when the complete app input tree is unchanged.

Docs and the CI/emulator harness may differ; every other path forces compilation.
GitHub artifact metadata supplies the actual compiled source commit/run, never
an assumed current-main binary. Needs only read-only Actions/contents permission.
"""
import json
import os
import subprocess
import urllib.request
from pathlib import Path


def harness_only(path):
    return (path.startswith("docs/") or path.startswith(".github/workflows/") or
            path in {"README.md", "apps/platform-lab/README.md",
                     "scripts/android_smoke.py", "scripts/android_build_plan.py"}
            or path in {"tests/test_android_smoke.py", "tests/test_android_smoke_reporting.py",
                        "tests/test_android_build_policy.py"})


def main():
    checkout_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    repo = os.environ["GITHUB_REPOSITORY"]
    request = urllib.request.Request(
        f"https://api.github.com/repos/{repo}/actions/artifacts?per_page=30",
        headers={"Authorization": f"Bearer {os.environ['GH_TOKEN']}",
                 "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"})
    run_id = source_commit = ""
    try:
        if os.environ.get("FORCE_FRESH", "").lower() == "true":
            raise ValueError("Fresh compilation requested")
        with urllib.request.urlopen(request, timeout=30) as response:
            artifacts = json.load(response)["artifacts"]
        for artifact in artifacts:
            if artifact["name"] != "moflight-synthetic-android-offline" or artifact["expired"]:
                continue
            commit = artifact["workflow_run"]["head_sha"]
            # No-renames reports both old and new paths, preventing an app file
            # moved into a documentation path from being mistaken for docs only.
            diff = subprocess.run(["git", "diff", "--no-renames", "--name-only", commit, "HEAD"],
                                  text=True, capture_output=True, timeout=30, check=True)
            if all(harness_only(path) for path in diff.stdout.splitlines()):
                source_commit = commit
                run_id = str(artifact["workflow_run"]["id"])
                break
    except Exception as error:
        # Read/cache failure means compile; it never grants artifact reuse.
        print(f"No verified reusable APK ({type(error).__name__}); compile current source.")
    with Path(os.environ["GITHUB_OUTPUT"]).open("a") as output:
        output.write(f"run_id={run_id}\nsource_commit={source_commit}\n")
        output.write(f"checkout_commit={checkout_commit}\n")
    if summary := os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(summary).open("a") as output:
            output.write(f"## Android checkpoint\nRequested source: `{checkout_commit}`\n\n")
            output.write(f"Reuse APK from run {run_id}, compiled source `{source_commit}`.\n" if run_id
                         else "Compile a new standalone APK.\n")
    print(f"Reuse compiled run {run_id}, source {source_commit}" if run_id else "Compile current source")


if __name__ == "__main__":
    main()

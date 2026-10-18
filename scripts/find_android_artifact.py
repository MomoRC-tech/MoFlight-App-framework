"""Optional GitHub adapter: find an unexpired APK for the exact checked-out commit."""
import json
import os
from pathlib import Path
import urllib.request


def select_artifact(artifacts, commit):
    return next((a for a in artifacts if a['name'] == f'moflight-apk-{commit}'
                 and not a['expired'] and a['workflow_run']['head_sha'] == commit), None)


def main():
    repo, commit = os.environ['GITHUB_REPOSITORY'], os.environ['GITHUB_SHA']
    request = urllib.request.Request(f'https://api.github.com/repos/{repo}/actions/artifacts?per_page=100',
                                     headers={'Authorization': f'Bearer {os.environ["GH_TOKEN"]}',
                                              'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(request, timeout=30) as response:
        artifact = select_artifact(json.load(response)['artifacts'], commit)
    if not artifact:
        raise RuntimeError('No unexpired APK for this commit. Run Android APK for the same ref first (3-day retention).')
    request.full_url = f'https://api.github.com/repos/{repo}/actions/runs/{artifact["workflow_run"]["id"]}'
    with urllib.request.urlopen(request, timeout=30) as response:
        workflow = json.load(response)
    if workflow['conclusion'] != 'success' or workflow['path'] != '.github/workflows/android-build.yml':
        raise RuntimeError('Matching APK was not produced by a successful Android APK workflow.')
    with Path(os.environ['GITHUB_OUTPUT']).open('a', encoding='utf-8') as output:
        output.write(f'run_id={workflow["id"]}\n')
    print(f'Exact-commit APK: {workflow["html_url"]}')


if __name__ == '__main__':
    main()

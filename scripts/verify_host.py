"""Local host checks with compact output and separate logs; no model calls."""
import argparse
from collections import deque
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]


def default_checks():
    pnpm = shutil.which('pnpm') or 'pnpm'
    return [
        ('typecheck', [pnpm, 'typecheck']),
        ('mobile-tests', [pnpm, 'test']),
        ('python-tests', [sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v']),
        ('fixtures', [sys.executable, 'scripts/mobile_fixtures.py', '--check']),
    ]


def source_identity(cwd):
    try:
        commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=cwd,
                                         text=True, stderr=subprocess.DEVNULL).strip()
        dirty = subprocess.check_output(['git', 'status', '--porcelain'], cwd=cwd,
                                        text=True, stderr=subprocess.DEVNULL).strip()
        return {'commit': commit, 'working_tree_dirty': bool(dirty)}
    except (OSError, subprocess.CalledProcessError):
        return {'commit': None, 'working_tree_dirty': None}


def run_checks(checks, output, *, cwd=ROOT, source=None, timeout=180):
    # A run owns a new directory; never overwrite previous diagnostic evidence.
    output = Path(output).resolve()
    output.mkdir(parents=True, exist_ok=False)
    report = {'started_at_utc': datetime.now(timezone.utc).isoformat(),
              'source': source, 'python': sys.version.split()[0],
              'status': 'running', 'checks': []}
    report_path = output / 'report.json'
    env = dict(os.environ, PYTHONUTF8='1', PYTHONIOENCODING='utf-8', NO_COLOR='1')
    env.pop('FORCE_COLOR', None)
    for index, (name, command) in enumerate(checks, 1):
        log_path = output / f'{index:02d}.log'
        started = time.perf_counter()
        with log_path.open('wb') as log:
            try:
                result = subprocess.run(command, cwd=cwd, env=env, stdout=log,
                                        stderr=subprocess.STDOUT, timeout=timeout)
                exit_code = result.returncode
            except OSError as error:
                exit_code = 127
                log.write(f'Could not start check: {error}\n'.encode('utf-8'))
            except subprocess.TimeoutExpired:
                exit_code = 124
                log.write(f'Check exceeded {timeout} seconds.\n'.encode('utf-8'))
        elapsed = round(time.perf_counter() - started, 3)
        passed = exit_code == 0
        report['checks'].append({'name': name, 'command': list(command),
                                 'status': 'passed' if passed else 'failed',
                                 'exit_code': exit_code, 'seconds': elapsed,
                                 'log': log_path.name})
        report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print(f'{"PASS" if passed else "FAIL"} {name} ({elapsed:.2f}s)', flush=True)
        if not passed:
            with log_path.open(encoding='utf-8', errors='replace') as log:
                for line in deque(log, maxlen=12):
                    print(f'  {line.rstrip()}', flush=True)
    passed = bool(report['checks']) and all(check['status'] == 'passed' for check in report['checks'])
    report['status'] = 'passed' if passed else 'failed'
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    count = sum(check['status'] == 'passed' for check in report['checks'])
    print(f'{count}/{len(report["checks"])} host checks passed. Logs: {output}', flush=True)
    return report


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, help='New log directory; existing directories are refused.')
    args = parser.parse_args(argv)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    output = args.output or ROOT / 'build' / 'host-checks' / f'{stamp}-{uuid.uuid4().hex[:8]}'
    report = run_checks(default_checks(), output, source=source_identity(ROOT))
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    raise SystemExit(main())

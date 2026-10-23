"""Actual Android WebView TCP interruption/timeout tests with loopback-only fixtures.

Installs a build-only proof temporarily. Never clears data or uses provider URLs.
ADB reverse bypasses radios: these results do not establish Wi-Fi/carrier handover.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import socket
import threading
import time

from scripts.android_smoke import PACKAGE, Smoke, check_apk
from scripts.maestro_smoke import require_synthetic

PORT = 18765
PROFILE = '/member/profile/viewprofile'
FLIGHTS = '/member/profile/flightlog.php'
DUTIES = '/member/profile/myservices.php'


def fixture_html(path, count):
    if path == PROFILE:
        return '<table class="tablelist alternative"><tr><td>Benutzernummer</td><td>123</td></tr></table><div id="topnavi"><a href="/member/community/main">Synthetic club</a></div>'
    if path not in (FLIGHTS, DUTIES):
        raise ValueError('Unsupported synthetic path')
    flight = path == FLIGHTS
    headings = ['Datum', 'Lfz.', 'Start', 'Landung', 'Flugzeit'] if flight else ['Dienst', 'Diensttausch', 'Zeitraum', 'Person(en)', 'Dienstplan von']
    return ('<form id="frmfilter"><input name="col2" type="text" value=""></form>'
            '<div id="globalfilter">ab 01.01.2026 bis 31.12.2026</div><div id="globalfilter2">Pilot oder Fluglehrer</div>'
            + ('' if flight else '<select><option value="own" selected>Meine Dienste</option></select>')
            + '<ul id="LST_VISIBLE">' + ''.join(f'<li value="{i+1}"></li>' for i in range(5)) + '</ul>'
            + f'<table id="tablelist_{20 if flight else 32}"><thead><tr>'
            + ''.join(f'<th>{h}</th>' for h in headings) + '</tr></thead><tbody></tbody></table>'
            + f'<div>{count if flight else 0} Datensätze</div>')


class FixtureServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self):
        super().__init__(('127.0.0.1', PORT), FixtureHandler)
        self.configure()

    def configure(self, mode='healthy', at=0, count=21):
        self.mode, self.at, self.count = mode, at, count
        self.requests = []
        self.reached, self.release = threading.Event(), threading.Event()


class FixtureHandler(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_GET(self):
        server = self.server
        if self.path not in (PROFILE, FLIGHTS, DUTIES):
            self.send_error(404)
            return
        server.requests.append(self.path)
        mode = server.mode if len(server.requests) == server.at else 'healthy'
        try:
            if mode in ('drop-headers', 'stall-headers'):
                server.reached.set()
                server.release.wait(20)
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            body = fixture_html(self.path, server.count).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            half = len(body) // 2
            self.wfile.write(body[:half])
            self.wfile.flush()
            if mode in ('drop-body', 'stall-body'):
                server.reached.set()
                server.release.wait(20)
                self.connection.shutdown(socket.SHUT_RDWR)
                self.connection.close()
                return
            if server.mode == 'slow':
                time.sleep(.35)
            self.wfile.write(body[half:])
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            # Client AbortController is expected to close stalled requests.
            pass


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(apk, serial, output):
    if output.exists():
        raise ValueError('Use a new evidence directory')
    require_synthetic('adb', serial)
    smoke = Smoke(output, serial, 'MoFlight_Synthetic_API37')
    mapping = f'tcp:{PORT}'
    if any(mapping in line.split() for line in smoke.adb('reverse', '--list').stdout.splitlines()):
        raise RuntimeError('Proof port already forwarded; preserve the existing mapping')
    remote = smoke.shell('pm', 'path', PACKAGE).splitlines()[0].removeprefix('package:')
    if not remote.startswith('/data/app/') or not remote.endswith('/base.apk'):
        raise RuntimeError('Installed original APK is required')
    original = output / 'original-installed.apk'
    smoke.adb('pull', remote, str(original.resolve()))
    running = bool(smoke.shell('pidof', PACKAGE, check=False))
    report = {'status': 'running', 'serial': serial, 'proof': check_apk(apk),
              'original_sha256': digest(original), 'checks': [],
              'started_at': datetime.now(timezone.utc).isoformat(),
              'boundary': 'Actual WebView TCP/stream/10-second timeout via ADB reverse; no radio handover, live provider, normal coordinator, physical Android or iOS'}
    installed = forwarded = False
    server = None

    def launch():
        smoke.shell('am', 'start', '-W', '-n', PACKAGE + '/.MainActivity')

    def state(wanted, timeout=35):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            labels = [label for node in smoke.dump() for label in smoke.labels(node)]
            if 'FATAL' in labels:
                raise AssertionError('Native proof fatal error')
            values = [re.fullmatch(r'(READY|RUNNING|SUCCESS|FAILED):SAVED=(\d+):WRITES=(\d+)', label) for label in labels]
            for match in values:
                if match and match[1] == wanted:
                    return int(match[2]), int(match[3])
            time.sleep(.15)
        raise AssertionError('Native state timeout: ' + wanted)

    def probe():
        smoke.tap_node(smoke.find('PROBE', exact=True, enabled=True))

    def record(name, **details):
        report['checks'].append({'name': name, 'passed': True, **details})
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        print('PASS ' + name, flush=True)

    try:
        server = FixtureServer()
        threading.Thread(target=server.serve_forever, daemon=True).start()
        smoke.adb('reverse', mapping, mapping)
        forwarded = True
        smoke.shell('am', 'force-stop', PACKAGE)
        installed = True
        smoke.adb('install', '-r', str(apk.resolve()))
        launch()
        before = state('READY')
        smoke.find('DOCUMENT_READY', exact=True)
        server.configure()
        probe()
        baseline = state('SUCCESS')
        assert baseline == (21, before[1] + 1)
        assert server.requests == [PROFILE, FLIGHTS, DUTIES, PROFILE]
        record('healthy-real-WebView-request', saved=baseline)

        cases = [('drop-headers', 1), ('drop-body', 2), ('drop-body', 4), ('stall-headers', 2), ('stall-body', 2)]
        for mode, at in cases:
            server.configure(mode, at, count=baseline[0] + 1)
            probe()
            if not server.reached.wait(8):
                raise AssertionError('Synthetic fault stage not reached')
            started = time.monotonic()
            if mode.startswith('drop'):
                server.release.set()  # Actually close the incomplete TCP response.
            failed = state('FAILED')
            elapsed = time.monotonic() - started
            server.release.set()
            assert failed == baseline, 'Failed request changed persisted snapshot or save count'
            requests = list(server.requests)
            time.sleep(.4)
            assert server.requests == requests, 'Unexpected automatic retry after failure'
            if mode.startswith('stall'):
                assert elapsed >= 7, 'Stalled response did not exercise the real 10-second timer'
            record(f'{mode}-stage-{at}', seconds=round(elapsed, 2), saved=failed, requests=requests)
            server.configure(count=baseline[0] + 1)
            probe()
            recovered = state('SUCCESS')
            assert recovered == (baseline[0] + 1, baseline[1] + 1)
            assert server.requests == [PROFILE, FLIGHTS, DUTIES, PROFILE]
            baseline = recovered
            record(f'explicit-recovery-{mode}-{at}', saved=baseline)

        # Remove only our mapping. The already loaded WebView now has no listener
        # at localhost:18765, exercising an actual connection refusal before fetch.
        smoke.adb('reverse', '--remove', mapping)
        forwarded = False
        probe()
        assert state('FAILED') == baseline
        record('connection-unavailable-before-request', saved=baseline)
        smoke.shell('am', 'force-stop', PACKAGE)
        launch()
        assert state('READY') == baseline
        record('saved-snapshot-survives-unavailable-network-process-restart', saved=baseline)
        smoke.adb('reverse', mapping, mapping)
        forwarded = True
        server.configure(mode='slow', count=baseline[0] + 1)
        smoke.tap_node(smoke.find('RELOAD FIXTURE', exact=True, enabled=True))
        smoke.find('DOCUMENT_READY', exact=True)
        server.configure(mode='slow', count=baseline[0] + 1)
        probe()
        assert state('SUCCESS') == (baseline[0] + 1, baseline[1] + 1)
        record('slow-stream-success-after-reconnect')
        report['status'] = 'passed'
    except Exception as error:
        report.update(status='failed', error=str(error))
        raise
    finally:
        cleanup_errors = []
        if server:
            server.release.set()
            server.shutdown()
            server.server_close()
        if forwarded:
            try:
                smoke.adb('reverse', '--remove', mapping)
            except Exception as error:
                cleanup_errors.append('reverse: ' + str(error))
        if installed:
            try:
                require_synthetic('adb', serial)
                smoke.shell('am', 'force-stop', PACKAGE)
                smoke.adb('install', '-r', str(original.resolve()))
                restored_remote = smoke.shell('pm', 'path', PACKAGE).splitlines()[0].removeprefix('package:')
                restored = output / 'restored-installed.apk'
                smoke.adb('pull', restored_remote, str(restored.resolve()))
                assert digest(restored) == report['original_sha256']
                if running:
                    launch()
                report['original_apk_restored_exactly'] = True
                report['original_running_state_restored'] = True
            except Exception as error:
                cleanup_errors.append('installed APK: ' + str(error))
        report['cleanup_errors'] = cleanup_errors
        if cleanup_errors:
            report['status'] = 'failed'
        (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        if cleanup_errors:
            raise RuntimeError('Cleanup failed; see report.json')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apk', required=True, type=Path)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    run(args.apk, args.serial, args.output)

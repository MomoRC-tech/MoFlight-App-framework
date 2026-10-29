"""Bounded, non-clearing Android UI sessions for a Codex Sol/Low subagent.

Uses local ADB and a short-lived authenticated loopback controller; no model API.
Only controller UI actions are counted, not the assistant's surrounding tools.
"""
import argparse
from datetime import datetime, timezone
import hashlib
from http.server import BaseHTTPRequestHandler, HTTPServer
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import struct
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request

if __package__:
    from .android_smoke import effective_enabled
else:
    from android_smoke import effective_enabled
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
RUNS = ROOT / 'build/ui-agent'
AVD = 'MoFlight_Synthetic_API37'
APP = 'de.momorc.moflight.lab'
STATUSES = {'passed', 'failed', 'blocked', 'not_tested'}
DEFAULT_LABELS = ['Übersicht', 'Flüge', 'Flugbuch', 'Verein', 'AI',
                  'Profil & Einstellungen öffnen', 'Entwicklung öffnen',
                  'Zur vorherigen App-Ansicht', 'Papierstand ansehen']
DEFAULT_IDS = ['tab-home', 'tab-flights', 'tab-logbook', 'tab-club', 'tab-ai',
               'development-entry', 'paper-assistant-entry']


def keyboard_state(raw):
    """Only confirmed hidden input/view state admits a generic gesture.

    Input-method dumps can change between Android versions. Missing, malformed
    or conflicting evidence must never silently allow a swipe over an IME.
    Return fixed flags only, not surrounding input-method/editor diagnostics.
    """
    names = ('mInputShown', 'mIsInputViewShown', 'mShowRequested')
    values = {name: re.findall(r'\b' + name + r'=(\S*)', raw) for name in names}
    flags = [f'{name}={value}' for name in names
             for value in sorted(set(v if v in ('true', 'false') else 'unknown' for v in values[name]))]
    if any('true' in values[name] for name in names[:2]):
        visibility = 'visible'
    elif 'true' in values['mShowRequested']:
        visibility = 'pending'
    elif all(values[name] for name in names[:2]) and all(
            value == 'false' for entries in values.values() for value in entries):
        visibility = 'hidden'
    else:
        visibility = 'unknown'
    return {'visibility': visibility, 'flags': flags}


def utc():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    """Replace a complete JSON file atomically, never expose a partial report."""
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    os.replace(temporary, path)


class Device:
    def __init__(self, adb, serial):
        if not re.fullmatch(r'emulator-\d+', serial):
            raise ValueError('An explicit emulator serial is required; physical devices refused.')
        self.adb, self.serial = str(adb), serial

    def run(self, *args, binary=False):
        result = subprocess.run([self.adb, '-s', self.serial, *map(str, args)],
                                capture_output=True, timeout=15, check=True)
        return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()

    def shell(self, *args):
        return self.run('shell', *args)

    def verify(self):
        if self.shell('getprop', 'ro.kernel.qemu') != '1':
            raise RuntimeError('Physical devices refused.')
        if self.run('emu', 'avd', 'name').splitlines()[0].strip() != AVD:
            raise RuntimeError(f'Only {AVD} is permitted.')

    def display(self):
        return {'size': self.shell('wm', 'size'), 'density': self.shell('wm', 'density'),
                'font': self.shell('settings', 'get', 'system', 'font_scale')}

    def network(self):
        return {key: self.shell('settings', 'get', 'global', key)
                for key in ['airplane_mode_on', 'wifi_on', 'mobile_data']}

    def identity(self):
        return [line.strip() for line in self.shell('dumpsys', 'package', APP).splitlines()
                if any(key in line for key in ['codePath=', 'versionCode=', 'versionName=',
                                               'firstInstallTime=', 'lastUpdateTime='])]

    def restore(self, original):
        self.verify()
        errors = []
        for key in ['size', 'density', 'font']:
            try:
                if key == 'font':
                    command = ('delete', 'system', 'font_scale') if original[key] == 'null' else (
                        'put', 'system', 'font_scale', original[key])
                    self.shell('settings', *command)
                else:
                    match = re.search(r'Override (?:size|density):\s*(\S+)', original[key])
                    self.shell('wm', key, match.group(1) if match else 'reset')
            except Exception as error:
                errors.append(f'{key}: {type(error).__name__}: {error}')
        actual = self.display()
        if actual != original:
            errors.append('Display settings do not match the original snapshot.')
        if errors:
            raise RuntimeError('; '.join(errors))
        return actual

    def tree(self, remote):
        self.shell('uiautomator', 'dump', '--compressed', remote)
        return ET.fromstring(self.shell('cat', remote))


class Session:
    """All UI mutations happen here, after the durable snapshot exists."""
    def __init__(self, output, device, options, *, clock=time.monotonic):
        self.output, self.device, self.options, self.clock = Path(output), device, options, clock
        self.original = None
        self.closed = False
        self.report = {'status': 'starting', 'created_utc': utc(), 'expected_worker_model': 'gpt-6.1-sol',
                       'expected_worker_reasoning_effort': 'low', 'actions_used': 0, 'captures_used': 0,
                       'limits': {k: options[k] for k in ['seconds', 'actions', 'captures']},
                       'counter_scope': 'Each attempted controller UI action, including each batch item. '
                                        'Status/finish/automatic cleanup and external LLM tools are excluded.',
                       'action_errors': [], 'cleanup_errors': []}

    def save(self):
        write(self.output / 'report.json', self.report)

    def open(self):
        self.device.verify()
        build = read(self.options['build'])
        if build.get('configuration') != 'Release' or not re.fullmatch(r'[0-9a-f]{40}', build.get('source_commit', '')):
            raise ValueError('A committed-source Release build manifest is required.')
        subprocess.run(['git', 'cat-file', '-e', build['source_commit'] + '^{commit}'],
                       cwd=ROOT, check=True, capture_output=True, timeout=10)
        apk = Path(self.options['build']).parent / build['apk']
        digest = hashlib.sha256(apk.read_bytes()).hexdigest()
        if digest != build.get('apk_sha256'):
            raise ValueError('Local APK does not match build manifest.')
        paths = self.device.shell('pm', 'path', APP).splitlines()
        base = next(line.removeprefix('package:') for line in paths if line.endswith('/base.apk'))
        installed = hashlib.sha256(self.device.run('exec-out', 'cat', base, binary=True)).hexdigest()
        if installed != digest:
            raise ValueError('Installed APK differs; no automatic install/update is allowed.')
        network = self.device.network()
        if network != {'airplane_mode_on': '1', 'wifi_on': '0', 'mobile_data': '0'}:
            raise ValueError('Offline precondition missing; this runner never changes networking.')
        self.original = self.device.display()
        self.report.update(original_display=self.original, original_network=network,
                           original_identity=self.device.identity(), application_commit=build['source_commit'],
                           apk_sha256=digest, avd=AVD, serial=self.device.serial,
                           android_api=self.device.shell('getprop', 'ro.build.version.sdk'),
                           controller_repository_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                           controller_source_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
        # Persist before the first viewport or other UI mutation, including partial failures.
        self.save()
        self.started = self.clock()
        self.deadline = self.started + self.options['seconds']
        self.report.update(status='running', active_started_utc=utc())
        self.save()

    def close(self, reason):
        if self.closed:
            return
        self.closed = True
        self.report['close_reason'] = reason
        if self.original is not None:
            try:
                self.report['restored_display'] = self.device.restore(self.original)
            except Exception as error:
                self.report['cleanup_errors'].append(str(error))
            for key, getter, expected in [('network', self.device.network, 'original_network'),
                                          ('identity', self.device.identity, 'original_identity')]:
                try:
                    # Identity is rechecked before collecting anything on a possibly reused serial.
                    self.device.verify()
                    actual = getter()
                    self.report[f'final_{key}'] = actual
                    if actual != self.report[expected]:
                        self.report['cleanup_errors'].append(f'{key} changed; not silently repaired.')
                except Exception as error:
                    self.report['cleanup_errors'].append(f'{key}: {error}')
        self.report.update(status='cleanup_failed' if self.report['cleanup_errors'] else reason,
                           finished_utc=utc())
        if hasattr(self, 'started'):
            self.report['active_elapsed_seconds'] = self.clock() - self.started
        self.save()

    def status(self):
        return {**self.report, 'seconds_remaining': max(0, self.deadline - self.clock())
                if hasattr(self, 'deadline') and not self.closed else 0}

    def action(self, command):
        if not isinstance(command, dict):
            raise ValueError('A UI action must be a JSON object.')
        if self.closed:
            raise ValueError('Session closed; inspect report.json. No more UI actions.')
        if self.clock() >= self.deadline:
            self.close('timed_out')
            raise ValueError('Deadline reached; original settings restored.')
        if self.report['actions_used'] >= self.options['actions']:
            self.close('action_limit')
            raise ValueError('UI-action limit reached; original settings restored.')
        self.report['actions_used'] += 1
        entry = {'utc': utc(), 'number': self.report['actions_used'], 'command': command}
        try:
            self.device.verify()
            result = self.perform(command)
            entry['status'] = 'completed'
            return result
        except Exception as error:
            entry.update(status='failed', error=f'{type(error).__name__}: {error}')
            self.report['action_errors'].append(entry)
            if command.get('op') == 'viewport':
                self.close('action_failed')  # A partially applied viewport must be restored immediately.
            raise
        finally:
            with (self.output / 'actions.jsonl').open('a', encoding='utf-8') as log:
                log.write(json.dumps(entry, ensure_ascii=False) + '\n')
            self.save()

    def perform(self, command):
        op = command.get('op')
        remote = '/sdcard/moflight-ui-agent.xml'
        if op == 'viewport':
            size, density, font = {'main': ('390x900', '160', '1.0'),
                                   'min': ('360x900', '160', '1.6'),
                                   'wide': ('800x600', '160', '1.0')}[command['name']]
            self.device.shell('wm', 'size', size)
            self.device.shell('wm', 'density', density)
            self.device.shell('settings', 'put', 'system', 'font_scale', font)
            time.sleep(.3)  # Let the native window reflow; captures also validate actual dimensions.
            return self.device.display()
        if op in ['launch', 'restart']:
            if op == 'restart':
                self.device.shell('am', 'force-stop', APP)
            self.device.shell('am', 'start', '-W', '-n', f'{APP}/.MainActivity')
            return {'operation': op}
        if op == 'back':
            self.device.shell('input', 'keyevent', 'KEYCODE_BACK')
            return {'operation': op}
        if op == 'keyboard':
            return keyboard_state(self.device.shell('dumpsys', 'input_method'))
        if op == 'swipe':
            if command.get('direction') not in ['up', 'down']:
                raise ValueError('Swipe direction must be up or down.')
            width, height = self.dimensions()
            low, high = int(height * .72), int(height * .32)
            start, end = (low, high) if command['direction'] == 'up' else (high, low)
            if keyboard_state(self.device.shell('dumpsys', 'input_method'))['visibility'] != 'hidden':
                raise ValueError('Swipe refused: keyboard visible, pending or unknown. Dismiss it before scrolling.')
            self.device.shell('input', 'swipe', str(width // 2), str(start),
                              str(width // 2), str(end), '400')
            return {'operation': op}
        if op in ['dump', 'capture', 'tap']:
            if op == 'capture':
                if self.report['captures_used'] >= self.options['captures']:
                    self.close('capture_limit')
                    raise ValueError('Capture limit reached; original settings restored.')
                self.report['captures_used'] += 1
            tree = self.device.tree(remote)
            if op == 'tap':
                return self.tap(tree, command)
            name = command.get('name', f'screen-{self.report["actions_used"]:02d}')
            if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,47}', name):
                raise ValueError('Evidence name must be lowercase letters/numbers/hyphens, <=48 chars.')
            target = self.output / 'worker' / f'{name}.xml'
            if target.exists():
                raise ValueError('Evidence exists; use a new name, never overwrite.')
            target.write_bytes(ET.tostring(tree, encoding='utf-8', xml_declaration=True))
            if op == 'capture':
                raw = self.device.run('exec-out', 'screencap', '-p', binary=True)
                if raw[:8] != b'\x89PNG\r\n\x1a\n':
                    raise ValueError('Invalid screenshot bytes.')
                (target.with_suffix('.png')).write_bytes(raw)
                if len(raw) < 24 or struct.unpack('>II', raw[16:24]) != self.dimensions():
                    raise ValueError('Screenshot still transitioning to viewport; captured bytes retained, retry with a new name.')
            enabled = effective_enabled(tree)
            return {'hierarchy': str(target), 'image': str(target.with_suffix('.png')) if op == 'capture' else None,
                    'nodes': [{'text': n.get('text'), 'label': n.get('content-desc'),
                               'id': n.get('resource-id'), 'class': n.get('class'),
                               'bounds': n.get('bounds'), 'clickable': n.get('clickable'),
                               'enabled': enabled[n]}
                              for n in tree.iter('node') if n.get('text') or n.get('content-desc')][:100]}
        raise ValueError('Unknown operation; raw shell, text input, network and data commands are refused.')

    def dimensions(self):
        raw = self.device.shell('wm', 'size')
        match = re.search(r'Override size: (\d+)x(\d+)', raw) or re.search(r'Physical size: (\d+)x(\d+)', raw)
        return tuple(map(int, match.groups()))

    def tap(self, tree, command):
        key, value = command.get('by'), command.get('value')
        permitted = ((key == 'label' and value in DEFAULT_LABELS + self.options.get('allow_labels', [])) or
                     (key == 'id' and value in DEFAULT_IDS) or
                     (key == 'class' and value == 'android.widget.EditText') or
                     (key == 'label' and isinstance(value, str) and re.fullmatch(r'\d{2}.*?, D-EX[^,]*, Details öffnen', value)))
        if not permitted:
            raise ValueError('Selector not in this session navigation allowlist; ask parent to scope it.')
        attribute = {'label': 'content-desc', 'id': 'resource-id', 'class': 'class'}[key]
        enabled = effective_enabled(tree)
        width, height = self.dimensions()
        candidates = []
        for node in tree.iter('node'):
            actual = node.get(attribute, '')
            matches = actual == value or (key == 'label' and node.get('text') == value) or (
                key == 'id' and actual.endswith('/' + value))
            match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
            if not (matches and match and node.get('clickable') == 'true' and enabled[node]):
                continue
            left, top, right, bottom = map(int, match.groups())
            if 0 <= left < right <= width and 0 <= top < bottom <= height:
                candidates.append(((left + right) // 2, (top + bottom) // 2))
        if len(candidates) != 1:
            raise ValueError(f'Expected exactly one enabled fully visible clickable match; got {len(candidates)}.')
        x, y = candidates[0]
        self.device.shell('input', 'tap', str(x), str(y))
        return {'selector': {'by': key, 'value': value}, 'tap': [x, y]}


def alive(pid):
    if os.name == 'nt':
        import ctypes
        kernel = ctypes.WinDLL('kernel32', use_last_error=True)
        kernel.OpenProcess.restype = ctypes.c_void_p
        handle = kernel.OpenProcess(0x1000, False, pid)
        if not handle:
            return ctypes.get_last_error() == 5  # Unknown/access denied is not safe to recover.
        try:
            code = ctypes.c_ulong()
            return not kernel.GetExitCodeProcess(ctypes.c_void_p(handle), ctypes.byref(code)) or code.value == 259
        finally:
            kernel.CloseHandle(ctypes.c_void_p(handle))
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(3)  # An incomplete client body must not defeat the idle deadline.

    def log_message(self, *args):
        pass  # Never log authentication headers.

    def do_POST(self):
        self.authorized = False
        if self.path != '/command' or not secrets.compare_digest(
                self.headers.get('Authorization', ''), 'Bearer ' + self.server.token):
            self.reply(403, {'error': 'Forbidden'})
            return
        self.authorized = True
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 32768:
                raise ValueError('JSON request size outside bounds.')
            command = json.loads(self.rfile.read(length))
            if not isinstance(command, dict):
                raise ValueError('A JSON object is required.')
            session = self.server.session
            if command.get('op') == 'status':
                result = session.status()
            elif command.get('op') == 'finish':
                result_file = session.output / 'worker/result.json'
                if not result_file.resolve().is_relative_to((session.output / 'worker').resolve()):
                    raise ValueError('Worker result must remain under worker/.')
                if result_file.stat().st_size > 131072:
                    raise ValueError('Worker result exceeds 128 KiB.')
                result = read(result_file)
                checks = result.get('checks', {})
                if not isinstance(checks, dict) or not checks or any(not isinstance(v, dict) or v.get('status') not in STATUSES or
                                     not v.get('observation') for v in checks.values()):
                    raise ValueError('worker/result.json needs checks with status and observation.')
                for check in checks.values():
                    evidence = check.get('evidence', [])
                    if not isinstance(evidence, list):
                        raise ValueError('Each evidence field must be a list.')
                    for name in evidence:
                        path = (session.output / 'worker' / name).resolve()
                        if not path.is_relative_to((session.output / 'worker').resolve()) or not path.is_file():
                            raise ValueError('Evidence must name an existing file under worker/.')
                session.report['worker_result'] = str(result_file)
                session.close('completed')  # Execution completed, not automatic UI acceptance.
                result = session.report
            elif command.get('op') == 'stop':
                session.close('stopped')
                result = session.report
            elif command.get('op') == 'batch':
                items = command.get('actions')
                if not isinstance(items, list) or not 1 <= len(items) <= 12:
                    raise ValueError('A batch contains 1–12 UI actions, each counted separately.')
                result = []
                for item in items:
                    result.append(session.action(item))
            else:
                result = session.action(command)
            self.reply(200, result)
        except Exception as error:
            self.reply(400, {'error': f'{type(error).__name__}: {error}'})

    def reply(self, code, value):
        data = json.dumps(value, ensure_ascii=False).encode('utf-8')
        try:
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            if self.authorized:
                self.server.session.close('client_disconnected')


def serve(output):
    options = read(output / 'options.json')
    lock = RUNS / 'synthetic.lock'
    session = None
    server = None
    owns_lock = False
    try:
        with lock.open('x', encoding='utf-8') as stream:
            json.dump({'pid': os.getpid(), 'output': str(output)}, stream)
        owns_lock = True
        session = Session(output, Device(options['adb'], options['serial']), options)
        session.open()
        server = HTTPServer(('127.0.0.1', 0), Handler)
        server.timeout = .2
        server.session, server.token = session, secrets.token_hex(32)
        write(output / 'session.json', {'port': server.server_port, 'token': server.token, 'pid': os.getpid()})
        template = (ROOT / 'docs/development/ui-agent-task.md').read_text(encoding='utf-8')
        task = template.replace('{{session}}', str(output)).replace('{{scope}}', options['scope'])
        (output / 'task.md').write_text(task, encoding='utf-8')
        while not session.closed:
            if session.clock() >= session.deadline:
                session.close('timed_out')
                break
            server.handle_request()
    except BaseException as error:
        if session is not None:
            session.report['controller_error'] = f'{type(error).__name__}: {error}'
        else:
            write(output / 'report.json', {'status': 'blocked', 'error': str(error)})
    finally:
        cleanup_complete = session is None
        try:
            if session is not None:
                session.close('blocked' if session.report['status'] == 'starting' else 'controller_failed')
                cleanup_complete = not session.report['cleanup_errors']
        finally:
            if server is not None:
                server.server_close()
            # A failed cleanup/report write must not let a new owner overwrite recovery state.
            if owns_lock and cleanup_complete and lock.exists() and read(lock).get('output') == str(output):
                lock.unlink()


def request(output, command):
    meta = read(output / 'session.json')
    req = Request(f'http://127.0.0.1:{meta["port"]}/command',
                  json.dumps(command).encode('utf-8'),
                  {'Authorization': 'Bearer ' + meta['token'], 'Content-Type': 'application/json'})
    # Do not use system proxies for the local controller.
    from urllib.request import ProxyHandler, build_opener
    try:
        with build_opener(ProxyHandler({})).open(req, timeout=120) as response:
            return json.loads(response.read())
    except HTTPError as error:
        raise ValueError(error.read().decode('utf-8', errors='replace')) from error


def session_path(raw):
    path = Path(raw).resolve()
    if not path.is_relative_to(RUNS.resolve()) or path == RUNS.resolve():
        raise ValueError(f'Sessions must be under {RUNS}.')
    return path


def main(argv=None):
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    start = commands.add_parser('start')
    start.add_argument('--serial', required=True)
    start.add_argument('--build', type=Path, required=True, help='Existing matching Release build.json; no rebuild/install.')
    start.add_argument('--adb', default=shutil.which('adb') or str(Path(os.environ.get('LOCALAPPDATA', '')) / 'Android/Sdk/platform-tools/adb.exe'))
    start.add_argument('--output', type=Path)
    start.add_argument('--scope', default='Run the eight-check non-mutating baseline below.')
    start.add_argument('--allow-label', action='append', default=[], help='Parent-reviewed additional navigation action only.')
    start.add_argument('--seconds', type=int, default=720)
    start.add_argument('--actions', type=int, default=40)
    start.add_argument('--captures', type=int, default=8)
    worker = commands.add_parser('serve', help=argparse.SUPPRESS)
    worker.add_argument('--session', required=True)
    for name in ['status', 'finish', 'stop', 'recover']:
        item = commands.add_parser(name)
        item.add_argument('--session', required=True)
    action = commands.add_parser('action')
    action.add_argument('--session', required=True)
    source = action.add_mutually_exclusive_group(required=True)
    source.add_argument('--json', help='One JSON action or {op:batch,actions:[...]}.')
    source.add_argument('--file', type=Path, help='JSON request file, avoids shell quoting.')
    args = parser.parse_args(argv)
    if args.command == 'start':
        if not (1 <= args.seconds <= 720 and 1 <= args.actions <= 40 and 1 <= args.captures <= 8):
            raise ValueError('Limits must be positive and cannot exceed 720 seconds /40 actions /8 captures.')
        # Validate serial before creating any session or contacting a device.
        Device(args.adb, args.serial)
        output = session_path(args.output or RUNS / (datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '-' + secrets.token_hex(4)))
        output.mkdir(parents=True, exist_ok=False)
        (output / 'worker').mkdir()
        write(output / 'options.json', {'serial': args.serial, 'adb': str(Path(args.adb).resolve()),
              'build': str(args.build.resolve()), 'scope': args.scope, 'allow_labels': args.allow_label,
              'seconds': args.seconds, 'actions': args.actions, 'captures': args.captures})
        with (output / 'controller.log').open('wb') as log:
            process = subprocess.Popen([sys.executable, '-u', str(Path(__file__).resolve()), 'serve', '--session', str(output)],
                       stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, close_fds=True,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                       start_new_session=os.name != 'nt')
        until = time.monotonic() + 90
        while time.monotonic() < until:
            if (output / 'task.md').exists():
                print(json.dumps({'session': str(output), 'task': str(output / 'task.md'),
                                  'model': 'gpt-6.1-sol', 'reasoning_effort': 'low', 'fork_turns': 'none'}))
                return 0
            if process.poll() is not None:
                raise ValueError(f'Controller startup failed; inspect {output / "report.json"}.')
            time.sleep(.1)
        raise ValueError(f'Controller startup timed out; inspect/recover {output}. Do not bypass its lock.')
    output = session_path(args.session)
    if args.command == 'serve':
        serve(output)
        return 0
    if args.command == 'recover':
        meta = read(output / 'session.json') if (output / 'session.json').exists() else None
        lock = RUNS / 'synthetic.lock'
        owner = read(lock) if lock.exists() else None
        if owner and owner.get('output') != str(output):
            raise ValueError('Another session owns the emulator; recovery refused.')
        if (owner and alive(owner['pid'])) or (meta and alive(meta['pid'])):
            raise ValueError('Controller still alive; use stop, never recover an active session.')
        report = read(output / 'report.json')
        original = report.get('original_display')
        if not original:
            raise ValueError('No saved display snapshot; no recovery mutation performed.')
        options = read(output / 'options.json')
        device = Device(options['adb'], options['serial'])
        try:
            report['recovery'] = {'utc': utc(), 'restored_display': device.restore(original)}
        except Exception as error:
            report.update(status='cleanup_failed', recovery_error=f'{type(error).__name__}: {error}')
            write(output / 'report.json', report)
            raise
        report.update(status='recovered', finished_utc=utc())
        write(output / 'report.json', report)
        if owner:
            lock.unlink()
        print(json.dumps(report['recovery']))
        return 0
    if args.command == 'status' and (output / 'report.json').exists():
        report = read(output / 'report.json')
        if report['status'] != 'running':
            print(json.dumps(report, ensure_ascii=False))
            return 0 if report['status'] in ['completed', 'stopped', 'recovered'] else 1
    command = (read(args.file) if args.file else json.loads(args.json)) if args.command == 'action' else {'op': args.command}
    result = request(output, command)
    print(json.dumps(result, ensure_ascii=False))
    if isinstance(result, dict) and result.get('status') == 'cleanup_failed':
        return 1
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError, StopIteration) as error:
        print(f'UI session failed: {error}', file=sys.stderr)
        raise SystemExit(1)

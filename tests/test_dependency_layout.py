"""Keep check/exec commands from silently reinstalling native dependencies."""
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

from scripts.dependency_layout import inspect_layout

ROOT = Path(__file__).resolve().parents[1]


class PnpmLayoutTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which('pnpm'), 'Pinned pnpm required')
    def test_checks_and_exec_preserve_hoisted_layout_and_workspace_aliases(self):
        with tempfile.TemporaryDirectory(prefix='moflight-layout-') as folder:
            root = Path(folder)
            def write(path, value):
                target = root / path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(value if isinstance(value, str) else json.dumps(value), encoding='utf-8')
            write('package.json', {'name': 'synthetic-root', 'private': True,
                                  'scripts': {'check': 'node witness.cjs'}})
            # Keep workspace/run settings, but exclude patches for tools this
            # dependency-free fixture intentionally does not install.
            workspace = (ROOT / 'pnpm-workspace.yaml').read_text()
            write('pnpm-workspace.yaml', re.sub(r'(?m)^patchedDependencies:\n(?:[ \t].*\n)*', '', workspace))
            for name in ['flight-logbook', 'local-data']:
                write(f'packages/{name}/package.json', {'name': '@moflight/' + name,
                      'version': '1.0.0', 'main': 'index.js'})
                write(f'packages/{name}/index.js', 'module.exports = {};\n')
            write('apps/platform-lab/package.json', {'name': 'synthetic-app', 'dependencies': {
                '@moflight/flight-logbook': 'workspace:*', '@moflight/local-data': 'workspace:*'}})
            write('witness.cjs', "for (const name of ['flight-logbook','local-data']) "
                  "console.log(require.resolve('@moflight/'+name,{paths:['./apps/platform-lab']}));")
            native = root / 'apps/platform-lab/android/app/build/generated/layout.txt'
            write(str(native.relative_to(root)), 'synthetic generated native path witness\n')
            def run(args):
                return subprocess.run([shutil.which('pnpm'), *args], cwd=root,
                    env=dict(os.environ, CI='1'), capture_output=True, text=True, timeout=45, check=True)
            run(['install', '--offline', '--node-linker=hoisted', '--ignore-scripts'])
            metadata = root / 'node_modules/.modules.yaml'
            before = metadata.read_bytes()
            self.assertEqual(json.loads(before)['nodeLinker'], 'hoisted')
            for args in [['check'], ['exec', 'node', 'witness.cjs']]:
                with self.subTest(command=args):
                    result = run(args)
                    self.assertEqual(metadata.read_bytes(), before, result.stdout)
                    for name in ['flight-logbook', 'local-data']:
                        target = root / f'apps/platform-lab/node_modules/@moflight/{name}'
                        self.assertEqual(target.resolve(), (root / f'packages/{name}').resolve())
            self.assertEqual(native.read_text(), 'synthetic generated native path witness\n')
            write('node_modules/expo-modules-core/package.json', {'name': 'expo-modules-core'})
            self.assertEqual(inspect_layout(root, native=True, windows=True)['node_linker'], 'hoisted')
            stale = root / 'apps/platform-lab/android/build/generated/autolinking/autolinking.json'
            write(str(stale.relative_to(root)), {'sourceDir': 'C:/synthetic/node_modules/.pnpm/expo/android'})
            before_stale = stale.read_bytes()
            with self.assertRaisesRegex(RuntimeError, 'new short --build-directory'):
                inspect_layout(root, native=True, windows=True)
            self.assertEqual(stale.read_bytes(), before_stale)


class LayoutGuardTests(unittest.TestCase):
    def test_missing_metadata_and_aliases_fail_with_recoverable_messages(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with self.assertRaisesRegex(RuntimeError, 'Explicitly install'):
                inspect_layout(root)
            metadata = root / 'node_modules/.modules.yaml'
            metadata.parent.mkdir()
            metadata.write_text('{"nodeLinker":"isolated"}')
            with self.assertRaisesRegex(RuntimeError, 'Windows native builds require'):
                inspect_layout(root, native=True, windows=True)
            with self.assertRaisesRegex(RuntimeError, 'Workspace alias @moflight/flight-logbook'):
                inspect_layout(root)
            self.assertEqual(metadata.read_text(), '{"nodeLinker":"isolated"}')

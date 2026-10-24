"""Read-only dependency-layout guard for host checks and isolated native builds."""
import argparse
import json
import os
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]


def inspect_layout(root=ROOT, *, native=False, windows=None):
    root = Path(root).resolve()
    windows = os.name == 'nt' if windows is None else windows
    try:
        # Pinned pnpm 11 writes JSON (also valid YAML) here.
        metadata = json.loads((root / 'node_modules/.modules.yaml').read_text(encoding='utf-8'))
        linker = metadata['nodeLinker']
    except (OSError, ValueError, KeyError) as error:
        raise RuntimeError('Missing/unsupported pnpm dependency metadata. Explicitly install with '
                           'pinned pnpm and --frozen-lockfile; use --node-linker=hoisted for Windows native builds.') from error
    if linker not in ('isolated', 'hoisted') or native and windows and linker != 'hoisted':
        raise RuntimeError(f'Unsupported dependency layout: {linker}. Windows native builds require '
                           'an explicit pnpm install --frozen-lockfile --node-linker=hoisted; '
                           'preserve this checkout or choose a new short --build-directory.')
    aliases = {}
    for name in ('flight-logbook', 'local-data'):
        target = root / f'apps/platform-lab/node_modules/@moflight/{name}'
        expected = root / f'packages/{name}'
        if not target.is_dir() or target.resolve() != expected.resolve():
            raise RuntimeError(f'Workspace alias @moflight/{name} is missing or points outside this checkout. '
                               'Preserve existing links/data and explicitly reinstall frozen dependencies '
                               'with the intended node linker, or use a new --build-directory.')
        aliases[name] = str(target.resolve())
    native_roots = {}
    if native and windows:
        core = root / 'node_modules/expo-modules-core'
        if not (core / 'package.json').is_file() or '/node_modules/.pnpm/' in core.resolve().as_posix():
            raise RuntimeError('Native expo-modules-core does not resolve through the hoisted root. '
                               'Preserve this checkout and explicitly install frozen hoisted dependencies '
                               'or choose a new short --build-directory.')
        native_roots['expo-modules-core'] = str(core.resolve())
        android = root / 'apps/platform-lab/android'
        generated = list((android / 'build/generated/autolinking').glob('*.json'))
        generated += list((android / 'app/build/generated/autolinking').rglob('*.cmake'))
        generated += list((android / 'app/.cxx').rglob('CMakeCache.txt'))
        generated += list((core / 'android/.cxx').rglob('CMakeCache.txt'))
        for path in generated:
            text = path.read_text(encoding='utf-8', errors='replace').replace('\\', '/')
            if re.search(r'node_modules/+\.pnpm/', text):
                raise RuntimeError('Generated native files still reference an older isolated dependency layout. '
                                   'Preserve this checkout and use a new short --build-directory; '
                                   'no generated files or caches were deleted.')
    return {'node_linker': linker, 'workspace_aliases': aliases, 'native_roots': native_roots}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--native', action='store_true')
    args = parser.parse_args(argv)
    try:
        print(json.dumps(inspect_layout(args.root, native=args.native), sort_keys=True))
        return 0
    except RuntimeError as error:
        print(f'Dependency layout refused: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

"""Install a checksum-pinned Maestro distribution into ignored local tooling."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    config = json.loads((ROOT / 'scripts/android-toolchain.json').read_text())
    version = config['maestroVersion']
    target = ROOT / 'build/tools' / f'maestro-{version}'
    if target.exists():
        raise RuntimeError(f'{target} already exists; use the existing installation or preserve it and choose a fresh checkout.')
    url = f'https://github.com/mobile-dev-inc/Maestro/releases/download/cli-{version}/maestro.zip'
    with tempfile.TemporaryDirectory() as folder:
        archive = Path(folder) / 'maestro.zip'
        urllib.request.urlretrieve(url, archive)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != config['maestroSha256']:
            raise RuntimeError('Maestro checksum mismatch; refusing to install.')
        with zipfile.ZipFile(archive) as bundle:
            for member in bundle.infolist():
                path = (target / member.filename).resolve()
                if not path.is_relative_to(target.resolve()):
                    raise RuntimeError('Unsafe path in Maestro archive.')
            bundle.extractall(target)
        if os.name != 'nt':
            for executable in target.glob('**/bin/*'):
                executable.chmod(0o755)
    print(f'Maestro {version}: {target} (checksum verified; no cloud account needed)')


if __name__ == '__main__':
    main()

"""Deterministic platform exports of the approved Thermik icon; no model calls.

Generation uses the already available Pillow. --check needs only the standard
library. Originals remain unchanged. PNGs use unfiltered rows for a small,
dependency-free integrity/safe-area check in CI.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('docs/assets/branding/moflight-app-icon-ai.png')
DEST = Path('apps/platform-lab/assets/branding/launcher')
BACKGROUND = '#009bad'
SIZE = 1024


def sha(blob: bytes) -> str:
    return hashlib.sha256(blob).hexdigest()


def png(width: int, height: int, channels: int, pixels: bytes) -> bytes:
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))
    stride = width * channels
    rows = b''.join(b'\0' + pixels[y * stride:(y + 1) * stride] for y in range(height))
    header = struct.pack('>IIBBBBB', width, height, 8, 2 if channels == 3 else 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b'')


def pixels(blob: bytes) -> tuple[int, int, int, bytes]:
    if blob[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not a PNG export')
    width, height, depth, color, compression, filtering, interlace = struct.unpack('>IIBBBBB', blob[16:29])
    if (width, height) != (SIZE, SIZE) or depth != 8 or color not in (2, 6) or compression or filtering or interlace:
        raise ValueError('Expected 1024px RGB/RGBA PNG')
    channels = 3 if color == 2 else 4
    position, data = 8, bytearray()
    while position < len(blob):
        length = struct.unpack('>I', blob[position:position + 4])[0]
        kind = blob[position + 4:position + 8]
        if kind == b'IDAT':
            data.extend(blob[position + 8:position + 8 + length])
        position += length + 12
    raw = zlib.decompress(data)
    stride = width * channels + 1
    if len(raw) != height * stride or any(raw[y * stride] for y in range(height)):
        raise ValueError('Expected complete unfiltered export rows')
    return width, height, channels, b''.join(raw[y * stride + 1:(y + 1) * stride] for y in range(height))


def check(root: Path = ROOT) -> dict:
    manifest = json.loads((root / DEST / 'manifest.json').read_text(encoding='utf-8'))
    if manifest['source_sha256'] != sha((root / SOURCE).read_bytes()):
        raise ValueError('Approved source changed; review and regenerate')
    if set(manifest['assets']) != {'icon.png', 'adaptive-foreground.png'}:
        raise ValueError('Incomplete launcher exports')
    for name, fingerprint in manifest['assets'].items():
        blob = (root / DEST / name).read_bytes()
        if sha(blob) != fingerprint:
            raise ValueError('Launcher export changed: ' + name)
        width, height, channels, raw = pixels(blob)
        if name == 'icon.png':
            if channels != 3:
                raise ValueError('iOS/legacy icon must be opaque RGB')
        else:
            if channels != 4:
                raise ValueError('Adaptive foreground requires alpha')
            visible = [i for i, alpha in enumerate(raw[3::4]) if alpha]
            if not visible or max(raw[3::4]) != 255:
                raise ValueError('Empty adaptive artwork')
            # Android guarantees the central 66dp circle on a 108dp canvas.
            radius = width * 33 / 108
            if any(math.hypot(i % width + .5 - width / 2, i // width + .5 - height / 2) > radius for i in visible):
                raise ValueError('Adaptive artwork exceeds the safe circle')
    config = json.loads((root / 'apps/platform-lab/app.json').read_text())['expo']
    icon = './assets/branding/launcher/icon.png'
    foreground = './assets/branding/launcher/adaptive-foreground.png'
    if config.get('icon') != icon or config['ios'].get('icon') != icon or config['android'].get('icon') != icon:
        raise ValueError('Missing platform launcher icon configuration')
    if config['android'].get('adaptiveIcon') != {'foregroundImage': foreground, 'monochromeImage': foreground, 'backgroundColor': BACKGROUND}:
        raise ValueError('Missing adaptive/themed launcher configuration')
    return {'source': str(SOURCE), 'exports': 2, 'size': SIZE, 'adaptive_safe_circle_dp': 66, 'status': 'fresh'}


def generate(root: Path = ROOT) -> dict:
    from PIL import Image

    source = Image.open(root / SOURCE).convert('RGB')
    legacy = source.resize((SIZE, SIZE), Image.Resampling.LANCZOS)
    # The approved artwork is white on teal. Separate that existing silhouette
    # by red-channel chroma key; no tracing, redrawing or generated replacement.
    alpha = source.getchannel('R').point([max(0, min(255, round((v - 32) * 255 / 208))) for v in range(256)])
    alpha = alpha.crop(alpha.getbbox())
    cx, cy = alpha.width / 2, alpha.height / 2
    radius = max(math.hypot(x + .5 - cx, y + .5 - cy)
                 for y in range(alpha.height) for x in range(alpha.width) if alpha.getpixel((x, y)))
    # 62dp leaves 2dp clearance inside the guaranteed 66dp diameter, including
    # resampling fringes. Preserve the original shape/aspect ratio.
    scale = (SIZE * 31 / 108 - 3) / radius
    alpha = alpha.resize((round(alpha.width * scale), round(alpha.height * scale)), Image.Resampling.LANCZOS)
    foreground = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
    foreground.paste(Image.merge('RGBA', (Image.new('L', alpha.size, 255),) * 3 + (alpha,)),
                     ((SIZE - alpha.width) // 2, (SIZE - alpha.height) // 2))
    dest = root / DEST
    dest.mkdir(parents=True, exist_ok=True)
    exports = {'icon.png': png(SIZE, SIZE, 3, legacy.tobytes()),
               'adaptive-foreground.png': png(SIZE, SIZE, 4, foreground.tobytes())}
    for name, blob in exports.items():
        (dest / name).write_bytes(blob)
    manifest = {'source': SOURCE.as_posix(), 'source_sha256': sha((root / SOURCE).read_bytes()),
                'method': 'Lanczos resize; white silhouette by red-channel key 32..240; centered 62dp circle on 108dp canvas',
                'assets': {name: sha(blob) for name, blob in exports.items()}}
    (dest / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    return check(root)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    print(json.dumps(check() if args.check else generate()))

"""Build/check the default offline MoFlight symbol library; no app/network calls."""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
from html import escape
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

if __package__:
    from .duotone_icons import GLYPHS
else:
    from duotone_icons import GLYPHS

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('docs/product/design/symbols')
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
# None means intentionally retain current artwork/text, not an omitted redesign.
MAPPING = {
    'N01': 'home', 'N02': 'flight-paper-plane', 'N03': 'book', 'N04': 'club', 'N05': 'sparkle',
    'H01': None, 'H02': 'back', 'H03': 'chain', 'H04': 'medical-card', 'H05': 'profile',
    'S01': 'chain', 'S02': 'chain', 'S03': 'chain', 'S04': 'chain', 'S05': None,
    'D01': 'logbook', 'D02': 'sparkle', 'D03': 'glider', 'D04': 'clock',
    'D05': 'location', 'D06': 'weather', 'D07': None, 'D08': None, 'D09': 'chart',
    'K01': 'duty', 'K02': 'calendar-neutral', 'K03': 'messages',
    'A01': 'search', 'A02': 'filter', 'A03': 'down', 'A04': 'refresh',
    'A05': 'info', 'A06': 'right', 'A07': 'arrow', 'A08': 'arrow',
    'A09': 'send', 'A10': 'check', 'A11': 'plus', 'A12': 'back',
    'T01': None, 'T02': None, 'T03': None, 'T04': None, 'T05': None, 'T06': None, 'T07': None, 'T08': None, 'T09': None,
    'B01': None, 'B02': None, 'B03': None,
}


def data_uri(path: Path) -> str:
    mime = {'.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml'}[path.suffix]
    return 'data:' + mime + ';base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def vector(name: str, size: int = 40, extra: str = '') -> str:
    return f'<svg class="icon {extra}" width="{size}" height="{size}" viewBox="0 0 96 96" aria-hidden="true"><use href="#o2-{name}"/></svg>'


def build(root: Path = ROOT) -> tuple[dict[Path, str], dict]:
    source = (root / BASE / 'glyphs.svg').read_text(encoding='utf-8')
    tree = ET.fromstring(source)
    symbols = {s.attrib['id']: s for s in tree.findall(f'{{{SVG}}}symbol')}
    if not symbols or any(s.attrib.get('viewBox') != '0 0 96 96' for s in symbols.values()):
        raise ValueError('Glyph masters need a 96-unit viewBox')
    catalogue = json.loads((root / 'docs/product/design/symbols.json').read_text(encoding='utf-8'))
    entries = [e for group in catalogue['groups'] for e in group['entries']]
    if set(MAPPING) != {e['id'] for e in entries}:
        raise ValueError('Every stable catalogue ID needs an explicit mapping')
    used = {n for n in MAPPING.values() if n} | set(GLYPHS)
    if used - symbols.keys():
        raise ValueError('Missing master: ' + ', '.join(sorted(used - symbols.keys())))
    if symbols.keys() - set(GLYPHS):
        raise ValueError('Unselected master: ' + ', '.join(sorted(symbols.keys() - set(GLYPHS))))
    # Prefix all SVG identifiers so embedded current examples cannot collide.
    defs = ET.tostring(tree.find(f'{{{SVG}}}defs'), encoding='unicode')
    symbol_text = ''.join(ET.tostring(s, encoding='unicode') for s in symbols.values())
    def prefix(value: str) -> str:
        value = re.sub(r'\bid="([^"]+)"', r'id="o2-\1"', value)
        return re.sub(r'url\(#([^)]+)\)', r'url(#o2-\1)', value)
    defs = prefix(defs)
    symbol_text = prefix(symbol_text)
    sprite = f'<svg xmlns="{SVG}" aria-hidden="true" width="0" height="0" style="position:absolute;overflow:hidden">{defs}{symbol_text}</svg>'
    outputs = {}
    for name in symbols:
        outputs[BASE / 'assets' / f'{name}.svg'] = (
            f'<svg xmlns="{SVG}" viewBox="0 0 96 96" role="img" aria-labelledby="title">'
            f'<title id="title">MoFlight Modern Duotone: {escape(name)}</title>{defs}'
            + re.sub(r'<symbol\b[^>]*>', '<g>', prefix(ET.tostring(symbols[name], encoding='unicode'))).replace('</symbol>', '</g>')
            + '</svg>\n'
        )
    board = ''.join(
        f'<a class="glyph-tile" href="assets/{name}.svg" aria-label="{escape(name.replace('-', ' '))} SVG">'
        f'<span class="soft-tile">{vector(name, 60)}</span><span>{escape(name.replace('-', ' '))}</span></a>'
        for name in GLYPHS
    )
    def current(e: dict) -> str:
        return re.sub(r'src="asset:([^"]+)"', lambda m: 'src="' + data_uri(root / m[1]) + '"', e['sample'])
    def artwork(name: str, size: int, tone: str = 'default') -> str:
        uri = data_uri(root / f'apps/platform-lab/assets/icons/duotone/{name}-{tone}.png')
        return f'<img class="icon" src="{uri}" width="{size}" height="{size}" alt="" aria-hidden="true">'

    def sample(e: dict, size: int = 40, tone: str = 'default') -> str:
        ident, name = e['id'], MAPPING[e['id']]
        if name is None:
            return '<span class="retained">' + current(e) + '</span>'
        tone = 'paper' if ident == 'D01' else 'assistant' if ident == 'D02' else tone
        result = artwork(name, size, tone)
        if ident in {'H03', 'S01', 'S02', 'S03', 'S04'}:
            badge, tone = {'S02': ('✓', 'confirmed'), 'S03': ('→', 'login'), 'S04': ('!', 'attention')}.get(ident, ('?', 'unknown'))
            result = f'<span class="session {tone}">{result}<b>{badge}</b></span>'
        if ident == 'H04':
            result += '<span class="med-label">Med<small>unbekannt</small></span>'
        if ident == 'A11':
            result += artwork('minus', size, tone)
        if ident == 'A12':
            result += artwork('close', size, tone)
        if ident in {'K02', 'D06'}:
            # Dates/weather in the reference are illustration only; contextual
            # unavailable wording prevents this art from becoming data evidence.
            result += '<span class="sr-only">Illustration, no connected source</span>'
        return result
    mapping_rows = []
    for group in catalogue['groups']:
        mapping_rows.append('<h3 class="group-title">' + escape(group['title']) + '</h3><div class="catalogue">')
        for e in group['entries']:
            ident = e['id']
            name = MAPPING[ident]
            why = 'Retained · ' + ('data graphic' if ident in {'D07', 'D08'} else 'text / state semantics' if ident.startswith('T') else 'native busy indicator' if ident == 'S05' else 'original brand artwork')
            href = f'assets/{name}.svg' if name else '../../symbol-reference.html#' + ident
            mapping_rows.append(f'<article class="catalogue-item" id="{ident}"><div class="sample">{sample(e)}</div><p class="eyebrow">{ident} / {"SELECTED" if name else "PRESERVED"}</p><h4>{escape(e["title"])}</h4><p>{escape(e["meaning"])}</p><details><summary>Meaning, action &amp; states</summary><p>{escape(e["behavior"])}</p><p>{escape(e["states"])}</p></details><a class="asset-link" href="{href}">{"SVG master ↗" if name else escape(why) + " ↗"}</a></article>')
        mapping_rows.append('</div>')
    manifest = {
        'status': 'Default family approved by Manuel on 18 October 2026; app integration implemented, native verification recorded separately',
        'reference_sha256': hashlib.sha256((root / BASE / 'reference.jpg').read_bytes()).hexdigest(),
        'grid': 96,
        'tile': {'ui_sizes_px': [40, 48, 56], 'ui_radius_px': [12, 14, 16]},
        'palette': {'canvas': '#041328', 'cyan': ['#32f1ef', '#00d9e8', '#00b9df'], 'slate': ['#8caac1', '#7094b1', '#46688b']},
        'mapping': {e['id']: {'glyph': MAPPING[e['id']], 'title': e['title'], 'status': 'selected' if MAPPING[e['id']] else 'preserved'} for e in entries},
        'assets': sorted(f'assets/{name}.svg' for name in symbols),
    }
    outputs[BASE / 'manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    template = (root / BASE / '_library.html').read_text(encoding='utf-8')
    lookup = {e['id']: e for e in entries}
    compact = ''.join(f'<div class="size-row"><span>{size} px</span>' + ''.join(vector(n, size) for n in ['home', 'book', 'club', 'search', 'weather', 'medical-card', 'flight-paper-plane']) + '</div>' for size in [24, 28, 32])
    compact += '<div class="tile-specimens">' + ''.join(f'<div><span class="soft-tile" style="width:{size}px;height:{size}px;border-radius:{radius}px">{vector("home", int(size*.6))}</span><small>{size}px / r{radius}</small></div>' for size, radius in [(40, 12), (48, 14), (56, 16)]) + '</div>'
    nav = ''.join(f'<div class="nav-item {"active" if ident == "N01" else ""}">{sample(lookup[ident],28,"default" if ident == "N01" else "muted")}<span>{label}</span></div>' for ident, label in [('N01', 'Übersicht'), ('N02', 'Flüge'), ('N03', 'Flugbuch'), ('N04', 'Verein'), ('N05', 'AI')])
    header = f'<div class="context-header"><b>MoFlight</b><div class="header-controls"><span class="header-action" aria-label="Verbindung unbekannt">{sample(lookup["H03"],24,"muted")}</span><span class="header-med">{sample(lookup["H04"],20)}</span><span class="header-action" aria-label="Profil">{artwork("profile",26)}</span></div></div>'
    fields = {'SPRITE': sprite, 'BOARD': board, 'CATALOGUE': ''.join(mapping_rows), 'COMPACT': compact, 'NAV': nav, 'HEADER': header, 'COUNT': str(len(symbols)), 'IDS': str(len(entries))}
    for key, value in fields.items():
        template = template.replace('{{' + key + '}}', value)
    if re.search(r'\{\{[A-Z_]+\}\}', template):
        raise ValueError('Unresolved template value')
    outputs[BASE / 'index.html'] = template
    # Parse every generated SVG, check references, and keep review coverage honest.
    for path, value in outputs.items():
        if path.suffix == '.svg':
            parsed = ET.fromstring(value)
            ids = [el.attrib['id'] for el in parsed.iter() if 'id' in el.attrib]
            if len(ids) != len(set(ids)):
                raise ValueError('Duplicate SVG IDs: ' + str(path))
            refs = re.findall(r'(?:url\(#|href="#)([^)" ]+)', value)
            if set(refs) - set(ids):
                raise ValueError('Missing SVG reference: ' + str(path))
    return outputs, {'glyphs': len(symbols), 'catalogue_ids': len(MAPPING), 'selected_ids': sum(bool(n) for n in MAPPING.values()), 'preserved_ids': sum(n is None for n in MAPPING.values()), 'generated_files': len(outputs)}


def unexpected_outputs(root: Path, outputs: dict[Path, str]) -> list[str]:
    generated = list((root / BASE / 'assets').glob('*.svg'))
    generated += [p for p in (root / BASE).glob('*.html') if not p.name.startswith('_')]
    generated += [p for p in (root / BASE).glob('*.svg') if p.name != 'glyphs.svg']
    return sorted(str(p.relative_to(root)) for p in generated if p.relative_to(root) not in outputs)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        outputs, report = build()
        stale = []
        for rel, value in outputs.items():
            path = ROOT / rel
            if not path.exists() or path.read_text(encoding='utf-8') != value:
                stale.append(str(rel))
                if not args.check:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(value, encoding='utf-8', newline='\n')
        report['stale' if args.check else 'updated'] = stale
        report['obsolete_outputs'] = unexpected_outputs(ROOT, outputs)
        print(json.dumps(report))
        return int(bool(report['obsolete_outputs']) or (args.check and bool(stale)))
    except (OSError, ValueError, KeyError, ET.ParseError) as exc:
        print('Symbol library build error: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

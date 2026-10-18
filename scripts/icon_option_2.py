"""Build/check the proposed offline duotone icon review; no app or network operations."""
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

ROOT = Path(__file__).resolve().parents[1]
BASE = Path('docs/product/design/icon-options/option-2')
SVG = 'http://www.w3.org/2000/svg'
ET.register_namespace('', SVG)
# None means intentionally retain current artwork/text, not an omitted redesign.
MAPPING = {
    'N01': 'home', 'N02': 'flight-paper-plane', 'N03': 'book', 'N04': 'club', 'N05': 'sparkle',
    'H01': None, 'H02': 'back', 'H03': 'chain', 'H04': 'medical-card', 'H05': 'profile',
    'S01': 'chain', 'S02': 'chain', 'S03': 'chain', 'S04': 'chain', 'S05': None,
    'D01': 'logbook', 'D02': 'sparkle', 'D03': 'glider', 'D04': 'clock',
    'D05': 'location', 'D06': 'weather', 'D07': None, 'D08': None,
    'K01': 'duty', 'K02': 'calendar-neutral', 'K03': 'messages',
    'A01': 'search', 'A02': 'filter', 'A03': 'down', 'A04': 'refresh',
    'A05': 'info', 'A06': 'right', 'A07': 'arrow', 'A08': 'arrow',
    'A09': 'send', 'A10': 'check', 'A11': 'plus', 'A12': 'back',
    'T01': None, 'T02': None, 'T03': None, 'T04': None, 'T05': None, 'T06': None,
    'X01': None, 'X02': None, 'X03': None,
    'B01': None, 'B02': None, 'B03': None, 'B04': None,
}
BOARD = [
    ('search', 'SEARCH'), ('calendar', 'CALENDAR'), ('messages', 'MESSAGES'),
    ('profile', 'PROFILE'), ('logbook', 'LOGBOOK'), ('compass', 'COMPASS'),
    ('location', 'LOCATION'), ('dashboard', 'DASHBOARD'), ('settings', 'SETTINGS'),
    ('bell', 'NOTIFICATIONS'), ('person', 'PERSON'), ('aircraft', 'AIRCRAFT'),
    ('home', 'HOME'), ('explore', 'EXPLORE'), ('profile-cyan', 'PROFILE'),
    ('flight-plan', 'FLIGHT PLAN'), ('weather', 'WEATHER'), ('analytics', 'ANALYTICS'),
]
ALTERNATIVES = [
    {'id': 'M1', 'target': 'H04', 'glyph': 'medical-certificate', 'title': 'Medical certificate', 'note': 'A medical cross on a folded document. Closest to the pilot Medical record.', 'recommended': True},
    {'id': 'M2', 'target': 'H04', 'glyph': 'medical-card', 'title': 'Medical card', 'note': 'A wide credential card with a clear cross. Familiar and compact.', 'recommended': False},
    {'id': 'M3', 'target': 'H04', 'glyph': 'medical-heart', 'title': 'Heart + cross', 'note': 'The clearest general health symbol; less specific to a certificate.', 'recommended': False},
    {'id': 'F1', 'target': 'N02', 'glyph': 'flight-sailplane', 'title': 'Banking sailplane', 'note': 'Long tapered wings and a slim fuselage. Most distinctive for MoFlight.', 'recommended': True},
    {'id': 'F2', 'target': 'N02', 'glyph': 'flight-light-plane', 'title': 'Light aircraft', 'note': 'A broader, compact aircraft silhouette for general aviation.', 'recommended': False},
    {'id': 'F3', 'target': 'N02', 'glyph': 'flight-side-profile', 'title': 'Clean side profile', 'note': 'A familiar side-view plane, redrawn with stronger filled geometry.', 'recommended': False},
]


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
    used = {n for n in MAPPING.values() if n} | {n for n, _ in BOARD} | {a['glyph'] for a in ALTERNATIVES}
    if used - symbols.keys():
        raise ValueError('Missing master: ' + ', '.join(sorted(used - symbols.keys())))
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
            f'<title id="title">MoFlight Option 2: {escape(name)}</title>{defs}'
            + re.sub(r'<symbol\b[^>]*>', '<g>', prefix(ET.tostring(symbols[name], encoding='unicode'))).replace('</symbol>', '</g>')
            + '</svg>\n'
        )
    board_parts = [f'<svg xmlns="{SVG}" viewBox="0 0 1280 698" role="img" aria-labelledby="board-title"><title id="board-title">Style Option 2 — reference-layout vector interpretation</title>', defs, symbol_text, '<rect width="1280" height="698" fill="#041328"/>']
    for i, (name, label) in enumerate(BOARD):
        col, row = i % 6, i // 6
        x, y = [81, 275, 469, 662, 855, 1048][col], [68, 271, 462][row]
        board_parts.append(f'<rect x="{x}" y="{y+4}" width="150" height="147" rx="24" fill="#000b18" opacity=".4"/>')
        board_parts.append(f'<rect x="{x}" y="{y}" width="150" height="147" rx="24" fill="url(#o2-glass)" stroke="url(#o2-edge)" stroke-width="1.6"/>')
        board_parts.append(f'<rect x="{x+2}" y="{y+2}" width="146" height="143" rx="22" fill="url(#o2-sheen)"/>')
        if name in {'bell', 'person', 'home'}:
            board_parts.append(f'<path d="M{x+1} {y+100}v-30a74 46 0 0 1 148 0v30" fill="url(#o2-sheen)" stroke="url(#o2-edge)" stroke-width="1"/>')
        # Optical sizes follow the photograph; the larger aircraft is deliberate.
        size = 110 if name == 'aircraft' else 106
        board_parts.append(f'<use href="#o2-{name}" x="{x+(150-size)/2}" y="{y+20}" width="{size}" height="{size}" filter="url(#o2-lift)"/>')
        board_parts.append(f'<text x="{x+75}" y="{y+171}" text-anchor="middle" fill="#e0e5ed" font-family="Arial, sans-serif" font-size="13.5">{label}</text>')
    board_parts.append('</svg>')
    board = ''.join(board_parts).replace('o2-', 'board-')
    outputs[BASE / 'reference-board.svg'] = board + '\n'
    reference = data_uri(root / BASE / 'reference.jpg')
    def current(e: dict) -> str:
        return re.sub(r'src="asset:([^"]+)"', lambda m: 'src="' + data_uri(root / m[1]) + '"', e['sample'])
    def sample(e: dict, size: int = 40) -> str:
        ident, name = e['id'], MAPPING[e['id']]
        if name is None:
            return '<span class="retained">' + current(e) + '</span>'
        result = vector(name, size)
        if ident in {'H03', 'S01', 'S02', 'S03', 'S04'}:
            badge, tone = {'S02': ('✓', 'confirmed'), 'S03': ('→', 'login'), 'S04': ('!', 'attention')}.get(ident, ('?', 'unknown'))
            result = f'<span class="session {tone}">{result}<b>{badge}</b></span>'
        if ident == 'H04':
            result += '<span class="med-label">Med<small>unbekannt</small></span>'
        if ident == 'A11':
            result += vector('minus', size)
        if ident == 'D01':
            result = '<span class="paper-accent">' + result + '</span>'
        if ident in {'N05', 'D02'}:
            result = '<span class="ai-accent">' + result + '</span>'
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
            why = 'Retained · ' + ('data graphic' if ident in {'D07', 'D08'} else 'approved aircraft B' if ident == 'N02' else 'text / state semantics' if ident.startswith('T') else 'historical only' if ident.startswith('X') or ident == 'B04' else 'native busy indicator' if ident == 'S05' else 'original brand artwork')
            href = f'assets/{name}.svg' if name else '../../../symbol-reference.html#' + ident
            mapping_rows.append(f'<article class="catalogue-item" id="{ident}"><div class="sample">{sample(e)}</div><p class="eyebrow">{ident} / {"SELECTED" if name else "PRESERVED"}</p><h4>{escape(e["title"])}</h4><p>{escape(e["meaning"])}</p><details><summary>Meaning, action &amp; states</summary><p>{escape(e["behavior"])}</p><p>{escape(e["states"])}</p></details><a class="asset-link" href="{href}">{"SVG master ↗" if name else escape(why) + " ↗"}</a></article>')
        mapping_rows.append('</div>')
    manifest = {
        'status': 'Selected by Manuel on 18 October 2026; app integration implemented, native verification recorded separately',
        'source_sha256': hashlib.sha256((root / BASE / 'reference.jpg').read_bytes()).hexdigest(),
        'grid': 96, 'reference_board': [1280, 698],
        'tile': {'reference_px': [150, 147], 'reference_radius_px': 24, 'ui_sizes_px': [40, 48, 56], 'ui_radius_px': [12, 14, 16]},
        'palette': {'canvas': '#041328', 'cyan': ['#32f1ef', '#00d9e8', '#00b9df'], 'slate': ['#8caac1', '#7094b1', '#46688b']},
        'mapping': {e['id']: {'glyph': MAPPING[e['id']], 'title': e['title'], 'status': 'selected' if MAPPING[e['id']] else 'preserved'} for e in entries},
        'assets': sorted(f'assets/{name}.svg' for name in symbols),
        'alternatives': {'status': 'Proposals only; no candidate selected', 'review': 'alternatives.html', 'candidates': ALTERNATIVES},
    }
    outputs[BASE / 'manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2) + '\n'
    template = (root / BASE / '_review.html').read_text(encoding='utf-8')
    lookup = {e['id']: e for e in entries}
    compact = ''.join(f'<div class="size-row"><span>{size} px</span>' + ''.join(vector(n, size) for n in ['home', 'book', 'club', 'search', 'weather', 'medical-card', 'settings']) + '</div>' for size in [24, 28, 32])
    compact += '<div class="tile-specimens">' + ''.join(f'<div><span class="soft-tile" style="width:{size}px;height:{size}px;border-radius:{radius}px">{vector("home", int(size*.6))}</span><small>{size}px / r{radius}</small></div>' for size, radius in [(40, 12), (48, 14), (56, 16)]) + '</div>'
    nav = ''.join(f'<div class="nav-item {"active" if ident == "N01" else ""}">{sample(lookup[ident],28)}<span>{label}</span></div>' for ident, label in [('N01', 'Übersicht'), ('N02', 'Flüge'), ('N03', 'Flugbuch'), ('N04', 'Verein'), ('N05', 'AI')])
    header = f'<div class="context-header"><b>MoFlight</b><div class="header-controls"><span class="header-action" aria-label="Verbindung unbekannt">{sample(lookup["H03"],24)}</span><span class="header-med">{sample(lookup["H04"],20)}</span><span class="header-action" aria-label="Profil">{vector("profile",26)}</span></div></div>'
    fields = {'SPRITE': sprite, 'BOARD': board, 'REFERENCE': reference, 'CATALOGUE': ''.join(mapping_rows), 'COMPACT': compact, 'NAV': nav, 'HEADER': header, 'COUNT': str(len(symbols))}
    for key, value in fields.items():
        template = template.replace('{{' + key + '}}', value)
    if re.search(r'\{\{[A-Z_]+\}\}', template):
        raise ValueError('Unresolved template value')
    outputs[BASE / 'index.html'] = template
    alternatives_template = (root / BASE / '_alternatives.html').read_text(encoding='utf-8')
    candidate_html = []
    for candidate in ALTERNATIVES:
        ident, glyph = candidate['id'], candidate['glyph']
        sizes = [20, 24, 28] if candidate['target'] == 'H04' else [24, 28, 32]
        candidate_html.append(
            f'<article class="candidate {"recommended" if candidate["recommended"] else ""}" id="{ident}">'
            f'<div class="candidate-top"><span>{ident} / {candidate["target"]}</span><span>{"RECOMMENDED" if candidate["recommended"] else "ALTERNATIVE"}</span></div>'
            f'<div class="candidate-art"><span class="art-tile">{vector(glyph,72)}</span></div>'
            f'<h3>{escape(candidate["title"])}</h3><p>{escape(candidate["note"])}</p>'
            '<div class="candidate-sizes">' + ''.join(f'<span>{vector(glyph,size)}<small>{size}px</small></span>' for size in sizes) + '</div>'
            f'<div class="candidate-actions"><button type="button" data-choice="{ident}" data-glyph="{glyph}" data-target="{candidate["target"]}" aria-pressed="{str(candidate["recommended"]).lower()}">Preview {ident}</button><a href="assets/{glyph}.svg" download>SVG ↓</a></div></article>'
        )
    alt_fields = {'SPRITE': sprite, 'MEDICAL': ''.join(candidate_html[:3]), 'FLIGHT': ''.join(candidate_html[3:])}
    for key, value in alt_fields.items():
        alternatives_template = alternatives_template.replace('{{' + key + '}}', value)
    if re.search(r'\{\{[A-Z_]+\}\}', alternatives_template):
        raise ValueError('Unresolved alternative template value')
    outputs[BASE / 'alternatives.html'] = alternatives_template
    comparison = [f'<svg xmlns="{SVG}" viewBox="0 0 1080 740" role="img" aria-labelledby="alternatives-title"><title id="alternatives-title">Medical and aircraft alternatives — M1 and F1 recommended</title>', defs, symbol_text,
                  '<rect width="1080" height="740" fill="#061224"/><text x="32" y="41" fill="#eef5fc" font-family="Arial,sans-serif" font-size="23">MoFlight / Medical &amp; Flight alternatives</text><text x="32" y="67" fill="#a1b4c9" font-family="Arial,sans-serif" font-size="12">Style Option 2 · proposed artwork · recommendation: M1 + F1</text>']
    for i, candidate in enumerate(ALTERNATIVES):
        x, y = 32 + (i % 3) * 350, 94 + (i // 3) * 310
        edge = '#2aabb9' if candidate['recommended'] else '#283e55'
        comparison.append(f'<rect x="{x}" y="{y}" width="316" height="284" rx="16" fill="#0e2035" stroke="{edge}"/><text x="{x+20}" y="{y+27}" fill="#a1b4c9" font-family="Arial,sans-serif" font-size="11">{candidate["id"]} / {candidate["target"]}</text>')
        if candidate['recommended']:
            comparison.append(f'<text x="{x+296}" y="{y+27}" text-anchor="end" fill="#32e4eb" font-family="Arial,sans-serif" font-size="10">RECOMMENDED</text>')
        comparison.append(f'<rect x="{x+107}" y="{y+48}" width="102" height="102" rx="22" fill="url(#o2-glass)" stroke="url(#o2-edge)"/><use href="#o2-{candidate["glyph"]}" x="{x+121}" y="{y+62}" width="74" height="74" filter="url(#o2-lift)"/><text x="{x+158}" y="{y+181}" text-anchor="middle" fill="#eef5fc" font-family="Arial,sans-serif" font-size="17">{escape(candidate["title"])}</text>')
        sizes = [20, 24, 28] if candidate['target'] == 'H04' else [24, 28, 32]
        for j, size in enumerate(sizes):
            center = x + 77 + j * 81
            comparison.append(f'<use href="#o2-{candidate["glyph"]}" x="{center-size/2}" y="{y+199+(32-size)/2}" width="{size}" height="{size}"/><text x="{center}" y="{y+253}" text-anchor="middle" fill="#a1b4c9" font-family="Arial,sans-serif" font-size="10">{size}px</text>')
    comparison.append('<text x="32" y="720" fill="#a1b4c9" font-family="Arial,sans-serif" font-size="12">Historical comparison. M2 + the supplied folded plane were subsequently selected. Med remains unknown.</text></svg>')
    outputs[BASE / 'alternatives-board.svg'] = ''.join(comparison) + '\n'
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
    return outputs, {'glyphs': len(symbols), 'catalogue_ids': len(MAPPING), 'selected_ids': sum(bool(n) for n in MAPPING.values()), 'preserved_ids': sum(n is None for n in MAPPING.values()), 'reference_compositions': len(BOARD), 'generated_files': len(outputs)}


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
        print(json.dumps(report))
        return int(args.check and bool(stale))
    except (OSError, ValueError, KeyError, ET.ParseError) as exc:
        print('Option 2 build error: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())

"""Generate/check the local UI handbook using only the Python standard library.

Maintained inputs: handbook Markdown, symbols.json and _template.html.
Application source is read-only. Generated values document implementation,
not product approval. No network, package installation or application execution.
"""
from __future__ import annotations

import argparse
import base64
from collections import defaultdict
import hashlib
from html import escape
from html.parser import HTMLParser
import json
import mimetypes
from pathlib import Path
import posixpath
import re
import sys
import unicodedata
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
DESIGN = Path('docs/product/design')
MOBILE = Path('apps/platform-lab/src/mobile')
CHAPTERS = ['README.md', 'alternative-ui.md', 'foundations.md', 'components.md', 'patterns.md', 'implementation-inventory.md', 'history.md']
HEX = re.compile(r'#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{4}\b|#[0-9a-fA-F]{3}\b')
MD_LINK = re.compile(r'(!?)\[([^\]]+)\]\(([^)]+)\)')


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8')


def digest(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def slug(text: str) -> str:
    return re.sub(r'[^\w\- ]', '', text.lower()).replace(' ', '-')


def chapter_id(name: str) -> str:
    return 'chapter-' + ('overview' if name == 'README.md' else Path(name).stem)


def asset_uri(path: Path, root: Path = ROOT) -> str:
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root.resolve()) or not resolved.is_file():
        raise ValueError(f'Asset outside repository or missing: {path}')
    mime = mimetypes.guess_type(str(path))[0]
    if mime not in {'image/png', 'image/jpeg', 'image/svg+xml'}:
        raise ValueError(f'Unsupported embedded asset: {path}')
    return f'data:{mime};base64,' + base64.b64encode(resolved.read_bytes()).decode('ascii')


def theme_values(root: Path = ROOT) -> dict[str, str]:
    match = re.search(r'export const colors = \{([^}]+)\}', read(root / MOBILE / 'theme.tsx'))
    if not match:
        raise ValueError('Cannot locate shared theme colors')
    values = dict(re.findall(r"(\w+):\s*'([^']+)'", match[1]))
    if set(values) != set(json.loads(read(root/DESIGN/'color-roles.json'))):
        raise ValueError('Theme token roles changed; reconcile the handbook role map')
    return values


def theme_table(values: dict[str, str], root: Path = ROOT) -> str:
    roles=json.loads(read(root/DESIGN/'color-roles.json'))
    rows = ['| Semantic role / code key | Value | Allowed/current use | Pairing context |', '| --- | --- | --- | --- |']
    for key, value in values.items():
        role, use, pairing = roles[key]
        rows.append(f'| {role} / `{key}` | `{value}` | {use} | {pairing} |')
    return '\n'.join(rows)


def contrast(foreground: str, background: str) -> float:
    def luminance(color):
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', color):
            raise ValueError('Contrast calculation requires opaque six-digit hex')
        rgb = [int(color[i:i+2], 16) / 255 for i in (1, 3, 5)]
        linear = [c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4 for c in rgb]
        return sum(c * w for c, w in zip(linear, (.2126, .7152, .0722)))
    a, b = sorted((luminance(foreground), luminance(background)))
    return (b + .05) / (a + .05)


def contrast_table(values: dict[str, str]) -> str:
    pairs = [('Primary text / canvas', values['text'], values['background']),
             ('Muted text / card', values['muted'], values['card']),
             ('Action label / mint action', '#031326', values['blue']),
             ('General mint accent / canvas', values['cyan'], values['background']),
             ('Brightest Back arrow gradient stop / opaque Back face', '#123a50', values['blue'])]
    return '\n'.join(['| Opaque pair | Foreground | Background | Calculated ratio |', '| --- | --- | --- | --- |'] +
                     [f'| {name} | `{fg}` | `{bg}` | {contrast(fg,bg):.2f}:1 |' for name,fg,bg in pairs])


def replace_generated(text: str, name: str, value: str) -> str:
    pattern = re.compile(rf'<!-- generated:{name}:start -->.*?<!-- generated:{name}:end -->', re.S)
    if len(pattern.findall(text)) != 1:
        raise ValueError(f'Expected one generated block: {name}')
    return pattern.sub(lambda _: f'<!-- generated:{name}:start -->\n{value}\n<!-- generated:{name}:end -->', text)


def ui_sources(root: Path = ROOT) -> list[Path]:
    """Product mobile styles/models plus app-owned TSX lab/adapter surfaces."""
    return sorted(set((root/MOBILE).glob('*.ts')) | set((root/'apps/platform-lab/src').rglob('*.tsx')))


def source_inventory(root: Path = ROOT) -> tuple[str, dict[str, str], set[str]]:
    fingerprints = {}
    literal_colors = set()
    sections = []
    for path in ui_sources(root):
        text = read(path)
        source = path.relative_to(root).as_posix()
        fingerprints[source] = digest(text)
        colors, effects, typography, geometry = (defaultdict(list) for _ in range(4))
        for number, line in enumerate(text.splitlines(), 1):
            for value in HEX.findall(line):
                colors[value.lower()].append(number)
                literal_colors.add(value.lower())
            for value in re.findall(r"\b\w*[Cc]olor\s*:\s*['\"]([A-Za-z]+)['\"]", line):
                colors[value].append(number)
            for value in re.findall(r"['\"](linear-gradient\([^'\"]+\))['\"]", line):
                effects[value].append(number)
            for key, value in re.findall(r"\b(fontSize|lineHeight|fontWeight|letterSpacing|fontFamily)\s*:\s*('[^']+'|\"[^\"]+\"|-?[\d.]+)", line):
                typography[f'{key}: {value}'].append(number)
            for key, value in re.findall(r"\b(borderRadius|borderWidth|minHeight|minWidth|maxWidth|maxHeight|width|height|padding(?:Horizontal|Vertical)?|gap|opacity|shadowOpacity)\s*:\s*('[^']+'|-?[\d.]+)", line):
                geometry[f'{key}: {value}'].append(number)
        if not any((colors,effects,typography,geometry)):
            continue
        surface = 'Product mobile UI/model' if path.parent==root/MOBILE else 'Retained app-owned lab/adapter surface; document its existing appearance as an exception'
        sections += [f'## {path.name}', f'{surface}. Source: [{source}](../../../{source}); normalized SHA-256 `{fingerprints[source]}`.']
        for title, data in [('Literal colors', colors), ('Gradients', effects), ('Typography declarations', typography), ('Geometry / opacity declarations', geometry)]:
            if data:
                sections.append(f'### {title}')
                table = ['| Value / declaration | Source line(s) |', '| --- | --- |']
                for value, lines in sorted(data.items()):
                    table.append(f'| `{value}` | {", ".join(map(str,sorted(set(lines))))} |')
                sections.append('\n'.join(table))
    header = '# Platform-lab UI implementation inventory\n\n[Handbook entry point](README.md). Generated by `python scripts/design_handbook.py`; do not hand-edit.\n\n'
    header += f'Scope: {len(fingerprints)} product mobile TypeScript/model and app-owned TSX UI/adapter files; {len(literal_colors)} distinct hexadecimal color literals (spelling variants such as #fff and #ffffff are separate literals). Colors include all static hex and named color-property literals, even in retained/unused declarations. Gradients and literal numeric/string typography/geometry are listed; computed expressions, conditional combinations, effective hit regions and actual rendering still require reading the linked source. Older lab surfaces retain their existing visual exceptions. Source declarations are implementation evidence, not visual approval. Line numbers refer to the current normalized source snapshot. No provider data or runtime state is read.\n\n'
    return header + '\n\n'.join(sections) + '\n', fingerprints, literal_colors


def local_target(href: str, origin: Path, root: Path = ROOT) -> tuple[Path | None, str]:
    url = urlsplit(href)
    if url.scheme:
        if url.scheme not in {'http','https'}:
            raise ValueError(f'Unsupported link protocol: {href}')
        return None, url.fragment
    target = (root / origin.parent / unquote(url.path)).resolve() if url.path else (root / origin).resolve()
    if not target.is_relative_to(root.resolve()):
        raise ValueError(f'Link escapes repository: {href}')
    return target, url.fragment


def validate_links(text: str, origin: Path, virtual: dict[Path, str], root: Path = ROOT) -> int:
    count = 0
    for _, _, href in MD_LINK.findall(text):
        target, fragment = local_target(href, origin, root)
        if target is None:
            continue
        rel = target.relative_to(root.resolve())
        if rel not in virtual and not target.exists():
            raise ValueError(f'{origin}: missing link {href}')
        if fragment and target.suffix == '.md':
            content = virtual.get(rel, read(target) if target.exists() else '')
            anchors = {slug(h) for h in re.findall(r'^#+\s+(.+)$', content, re.M)}
            if fragment not in anchors:
                raise ValueError(f'{origin}: missing anchor {href}')
        count += 1
    return count


def output_href(href: str, origin: Path, output: Path, combined: bool, root: Path = ROOT) -> str:
    target, fragment = local_target(href, origin, root)
    if target is None:
        return href
    rel = target.relative_to(root.resolve())
    if combined and rel.parent == DESIGN and rel.name in CHAPTERS:
        return '#' + chapter_id(rel.name) + ('-' + fragment if fragment else '')
    if combined and rel == Path('docs/product/symbol-reference.html'):
        return '#' + (fragment or 'symbol-catalogue')
    result = posixpath.relpath(rel.as_posix(), output.parent.as_posix())
    return result + ('#' + fragment if fragment else '')


def inline(text: str, origin: Path, output: Path, root: Path = ROOT) -> str:
    pattern = re.compile(r'(`[^`]+`|!?\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|\*[^*]+\*)')
    parts, start = [], 0
    for match in pattern.finditer(text):
        parts.append(escape(text[start:match.start()]))
        token = match[0]
        if token.startswith('`'):
            value = token[1:-1]
            swatch = f'<i class="swatch" style="background:{value}" aria-hidden="true"></i>' if HEX.fullmatch(value) else ''
            parts.append(swatch + '<code>' + escape(value) + '</code>')
        elif token.startswith('**'):
            parts.append('<strong>' + escape(token[2:-2]) + '</strong>')
        elif token.startswith('*'):
            parts.append('<em>' + escape(token[1:-1]) + '</em>')
        else:
            image, label, href = MD_LINK.fullmatch(token).groups()
            if image:
                target, _ = local_target(href, origin, root)
                if target is None:
                    raise ValueError('Remote chapter images are not portable')
                parts.append(f'<img alt="{escape(label,quote=True)}" src="{asset_uri(target.relative_to(root.resolve()),root)}">')
            else:
                link = output_href(href,origin,output,True,root)
                parts.append(f'<a href="{escape(link,quote=True)}">{escape(label)}</a>')
        start = match.end()
    parts.append(escape(text[start:]))
    return ''.join(parts)


def render_markdown(text: str, origin: Path, output: Path, root: Path = ROOT) -> str:
    """Render our deliberately small chapter format; reject unhandled HTML."""
    text = re.sub(r'<!--.*?-->', '', text, flags=re.S)
    outside_fences = re.sub(r'```.*?```', '', text, flags=re.S)
    if re.search(r'<[A-Za-z!/]', outside_fences):
        raise ValueError(f'Raw HTML is unsupported in {origin}')
    lines, result, i = text.splitlines(), [], 0
    heading_counts = defaultdict(int)
    prefix = chapter_id(origin.name)
    while i < len(lines):
        line = lines[i]
        if not line.strip(): i += 1; continue
        if line.startswith('```'):
            block=[];i+=1
            while i < len(lines) and not lines[i].startswith('```'):
                block.append(lines[i]);i+=1
            if i == len(lines): raise ValueError(f'Unclosed code fence: {origin}')
            result.append('<pre><code>'+escape('\n'.join(block))+'</code></pre>');i+=1
        elif match := re.match(r'^(#{1,6}) (.+)$',line):
            level=min(6,len(match[1])+1)
            base_id=prefix+'-'+slug(match[2])
            suffix='-'+str(heading_counts[base_id]) if heading_counts[base_id] else ''
            heading_counts[base_id]+=1
            result.append(f'<h{level} id="{base_id}{suffix}">{inline(match[2],origin,output,root)}</h{level}>');i+=1
        elif line.startswith('|'):
            rows=[]
            while i < len(lines) and lines[i].startswith('|'):
                rows.append([cell.strip() for cell in lines[i].strip().strip('|').split('|')]);i+=1
            if len(rows)<2 or not all(re.fullmatch(r':?-+:?',c) for c in rows[1]):
                raise ValueError(f'Invalid table in {origin}')
            result.append('<div class="table-wrap"><table><thead><tr>'+''.join('<th>'+inline(c,origin,output,root)+'</th>' for c in rows[0])+'</tr></thead><tbody>')
            for row in rows[2:]:
                if len(row)!=len(rows[0]): raise ValueError(f'Inconsistent table columns: {origin}')
                result.append('<tr>'+''.join('<td>'+inline(c,origin,output,root)+'</td>' for c in row)+'</tr>')
            result.append('</tbody></table></div>')
        elif re.match(r'^(?:- |\d+\. )',line):
            ordered=bool(re.match(r'^\d+\. ',line));tag='ol' if ordered else 'ul';result.append(f'<{tag}>')
            pattern=r'^\d+\. ' if ordered else r'^- '
            while i<len(lines) and re.match(pattern,lines[i]):
                result.append('<li>'+inline(re.sub(pattern,'',lines[i]),origin,output,root)+'</li>');i+=1
            result.append(f'</{tag}>')
        else:
            paragraph=[]
            while i<len(lines) and lines[i].strip() and not re.match(r'^(?:#|\||```|- |\d+\. )',lines[i]):
                paragraph.append(lines[i]);i+=1
            if not paragraph:
                raise ValueError(f'Unsupported Markdown block in {origin}: {line}')
            result.append('<p>'+inline(' '.join(paragraph),origin,output,root)+'</p>')
    return '\n'.join(result)


class SampleValidator(HTMLParser):
    def handle_starttag(self, tag, attrs):
        if tag not in {'span','img','svg','path','circle','rect','g','b','strong','small','br'}:
            raise ValueError(f'Unsupported sample element: {tag}')
        for name,value in attrs:
            if name.startswith('on') or name in {'href','xlink:href'}:
                raise ValueError('Executable/external sample attribute')
            if name == 'src' and not value.startswith('asset:'):
                raise ValueError('Sample images must reference local asset masters')


def load_catalogue(root: Path = ROOT) -> dict:
    data=json.loads(read(root/DESIGN/'symbols.json'))
    ids=[]
    for group in data['groups']:
        for entry in group['entries']:
            ident=entry['id']
            if not re.fullmatch(r'[A-Z]\d{2}',ident) or ident in ids:
                raise ValueError(f'Invalid/duplicate symbol ID: {ident}')
            ids.append(ident)
            if not (root/entry['file']).exists(): raise ValueError(f'Missing symbol source: {ident}')
            SampleValidator().feed(entry['sample'])
            for asset in re.findall(r'src="asset:([^"]+)"',entry['sample']): asset_uri(Path(asset),root)
    if not ids: raise ValueError('Empty catalogue')
    return data


def render_catalogue(data: dict, output: Path, root: Path = ROOT) -> tuple[str,str]:
    html=['<section id="symbol-catalogue"><h2>Symbols, icons and state marks</h2><p>Maintained source: symbols.json. Original assets are embedded unchanged. Native View marks are schematic SVG redraws, enlarged on neutral tiles; glyph rendering depends on fonts. Browser samples do not establish native acceptance.</p>']
    brief=['SYMBOLS, ICONS AND STATE MARKS\nModern Duotone is the default symbol family, including M2 Medical card and the folded paper plane. Preserve current stable IDs, labels, meanings, actions, states and approved Thermik branding. Retired icon designs have been removed. Samples are schematic except unchanged source images.']
    for group in data['groups']:
        html += [f'<h3>{escape(group["title"])}</h3><p>{escape(group["intro"])}</p><div class="entries">']
        brief += [group['title']+'\n'+group['intro']]
        for e in group['entries']:
            sample=re.sub(r'src="asset:([^"]+)"',lambda m:'src="'+asset_uri(Path(m[1]),root)+'"',e['sample'])
            html.append(f'<article class="entry" id="{e["id"]}"><div class="entry-head"><div class="sample" role="img" aria-label="{escape(e["title"],quote=True)} sample">{sample}</div><div><p class="eyebrow">{e["id"]} · {escape(e["status"])}</p><h4>{escape(e["title"])}</h4></div></div><dl>')
            fields=[('Appearance','appearance'),('Where','where'),('Meaning','meaning'),('Function / action','behavior'),('States / limits','states')]
            lines=[e['id']+' · '+e['status'],e['title']]
            for label,key in fields:
                html.append(f'<dt>{label}</dt><dd>{escape(e[key])}</dd>');lines.append(label+': '+e[key])
            href=posixpath.relpath(e['file'],output.parent.as_posix())
            html.append(f'<dt>Source</dt><dd><a href="{escape(href,quote=True)}">{escape(e["file"])}</a><br>{escape(e["locator"])}</dd></dl></article>')
            lines.append('Source: '+e['file']+'\n'+e['locator']);brief.append('\n'.join(lines))
        html.append('</div>')
    html.append('</section>')
    return '\n'.join(html),'\n\n'.join(brief)


def fill_template(template: str, fields: dict[str,str]) -> str:
    for key,value in fields.items(): template=template.replace('{{'+key+'}}',value)
    if re.search(r'\{\{[A-Z_]+\}\}',template): raise ValueError('Unfilled template field')
    return template


class HtmlAudit(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids=[]; self.links=[]; self.images=[]; self.brief=[]; self.in_brief=False
    def handle_starttag(self, tag, attrs):
        attrs=dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag=='a': self.links.append(attrs.get('href',''))
        if tag=='img':
            if not attrs.get('alt'): raise ValueError('Embedded image missing alt text')
            self.images.append(attrs.get('src',''))
        if tag in {'script','link','iframe'} and (attrs.get('src') or attrs.get('href')):
            raise ValueError('Generated guide contains an external display/runtime dependency')
        if tag=='textarea' and attrs.get('id')=='brief': self.in_brief=True
    def handle_endtag(self,tag):
        if tag=='textarea': self.in_brief=False
    def handle_data(self,data):
        if self.in_brief: self.brief.append(data)


def validate_html(outputs: dict[Path,str], symbol_ids: list[str], root: Path = ROOT) -> dict:
    parsed={}
    for path,content in outputs.items():
        if path.suffix!='.html': continue
        audit=HtmlAudit();audit.feed(content);parsed[path]=audit
        if len(audit.ids)!=len(set(audit.ids)): raise ValueError(f'Duplicate HTML IDs: {path}')
        if not set(symbol_ids).issubset(audit.ids): raise ValueError(f'Missing rendered symbols: {path}')
        text=''.join(audit.brief)
        if not all(re.search(r'^'+re.escape(ident)+r' · ',text,re.M) for ident in symbol_ids):
            raise ValueError(f'Incomplete copyable catalogue: {path}')
        if 'base64,' in text: raise ValueError('Image data leaked into text handoff')
        for src in audit.images:
            if not src.startswith('data:image/'): raise ValueError(f'Nonembedded display asset: {path}')
            base64.b64decode(src.split(',',1)[1],validate=True)
    for origin,audit in parsed.items():
        for href in audit.links:
            target,fragment=local_target(href,origin,root)
            if target is None: continue
            rel=target.relative_to(root.resolve())
            if rel not in outputs and not target.exists(): raise ValueError(f'{origin}: missing HTML link {href}')
            if fragment and rel in parsed and fragment not in parsed[rel].ids:
                raise ValueError(f'{origin}: missing HTML anchor {href}')
    full=DESIGN/'design-guide.html'
    if ''.join(parsed[full].brief)!=outputs[DESIGN/'design-brief.txt']:
        raise ValueError('HTML and plain-text handoff differ')
    return {'html_pages':len(parsed),'embedded_images':{p.as_posix():len(a.images) for p,a in parsed.items()}}


def build(root: Path = ROOT) -> tuple[dict[Path,str],dict]:
    values=theme_values(root)
    inventory,fingerprints,colors=source_inventory(root)
    foundations=read(root/DESIGN/'foundations.md')
    foundations=replace_generated(foundations,'theme',theme_table(values,root))
    foundations=replace_generated(foundations,'contrast',contrast_table(values))
    chapters={name:read(root/DESIGN/name) for name in CHAPTERS if name not in {'foundations.md','implementation-inventory.md'}}
    chapters.update({'foundations.md':foundations,'implementation-inventory.md':inventory})
    native_palettes=json.loads(read(root/Path('apps/platform-lab/assets/icons/duotone/manifest.json')))['config']['tones']
    asset_colors={value.lower() for palette in native_palettes.values() for value in palette}
    for value in HEX.findall(foundations):
        if value.lower() not in colors and value.lower() not in asset_colors:
            raise ValueError(f'Foundation color absent from implementation: {value}')
    catalogue=load_catalogue(root)
    # Scope is source glyph coverage, not inferred native rendering acceptance.
    glyphs=set()
    for path in ui_sources(root):
        glyphs.update(c for c in read(path) if ord(c)>127 and unicodedata.category(c).startswith('S'))
    catalogue_text=json.dumps(catalogue,ensure_ascii=False)
    if glyphs-set(catalogue_text): raise ValueError('Mobile source has symbols absent from the catalogue')
    template=read(root/DESIGN/'_template.html')
    examples=read(root/DESIGN/'_examples.html')
    examples=re.sub(r'src="asset:([^"]+)"',lambda m:'src="'+asset_uri(Path(m[1]),root)+'"',examples)
    source_hash=digest(json.dumps({'chapters':chapters,'catalogue':catalogue,'source':fingerprints,'template':template,'examples':examples},ensure_ascii=False,sort_keys=True))
    outputs={DESIGN/'foundations.md':foundations,DESIGN/'implementation-inventory.md':inventory}
    full=DESIGN/'design-guide.html'
    cat_html,cat_brief=render_catalogue(catalogue,full,root)
    full_brief='MOFLIGHT — CURRENT UI DESIGN HANDBOOK AND AI HANDOFF\n\n'+'\n\n'.join(chapters[name].strip() for name in CHAPTERS)+'\n\n'+cat_brief+'\n'
    # Embed the approved design evidence unchanged; it is not application artwork.
    reference='<section id="approved-reference"><h2>Approved main-branch visual baseline</h2><p>Historical authority for main; this branch explores the separately authorized alternative in the handbook. 16 October supplied reference; illustrative data. Original bytes embedded unchanged.</p><img class="reference" alt="Approved four-screen MoFlight visual baseline" src="'+asset_uri(Path('docs/product/design-sources/2026-10-16-four-screen/reference.png'),root)+'"></section>'
    body=[]
    for name in CHAPTERS:
        body.append(f'<section class="chapter" id="{chapter_id(name)}">'+render_markdown(chapters[name],DESIGN/name,full,root)+'</section>')
        if name=='README.md': body.append(reference)
        if name=='components.md': body.append(examples)
    body.append(cat_html)
    nav=' '.join(f'<a href="#{chapter_id(name)}">{escape(name.replace(".md","").replace("README","Overview"))}</a>' for name in CHAPTERS)+' <a href="#component-examples">Examples</a> <a href="#symbol-catalogue">Symbols</a> <a href="#copy-area">Copy text</a>'
    common={'HASH':source_hash,'DATE':'22 October 2026'}
    outputs[full]=fill_template(template,{**common,'TITLE':'MoFlight UI design handbook','LEAD':'Current design direction, color map, component shapes, presentation patterns and symbols. Generated from maintained repository sources.','NAV':nav,'BODY':'\n'.join(body),'BRIEF':escape(full_brief),'DOWNLOAD':'moflight-design-brief.txt','HOME':'README.md'})
    outputs[DESIGN/'design-brief.txt']=full_brief
    compat=Path('docs/product/symbol-reference.html')
    cat_html,cat_brief=render_catalogue(catalogue,compat,root)
    context='MOFLIGHT — CURRENT SYMBOL CATALOGUE\n\nModern Duotone is the default app family, including M2 Medical card and the folded paper plane. Preserve each current ID, label, meaning, function, state and approved Thermik branding. Superseded icon designs have been removed. This artwork establishes no medical/AI/weather evidence or provider integration. Read the current handbook for complete direction, colors, geometry and change authority.\n\n'
    count=sum(len(g['entries']) for g in catalogue['groups'])
    outputs[compat]=fill_template(template,{**common,'TITLE':'MoFlight symbol catalogue','LEAD':f'The same maintained {count}-entry symbol catalogue used by the complete UI design handbook.','NAV':'<a href="design/design-guide.html">Complete handbook</a> <a href="#symbol-catalogue">Catalogue</a> <a href="#copy-area">Copy text</a>','BODY':cat_html,'BRIEF':escape(context+cat_brief+'\n'),'DOWNLOAD':'moflight-symbol-brief.txt','HOME':'design/README.md'})
    virtual={DESIGN/name:text for name,text in chapters.items()};virtual.update(outputs)
    links=sum(validate_links(text,DESIGN/name,virtual,root) for name,text in chapters.items())
    report={'symbols':sum(len(g['entries']) for g in catalogue['groups']),'ui_source_files':len(fingerprints),'distinct_hex_colors':len(colors),'local_markdown_links':links,'input_sha256':source_hash,'generated_files':len(outputs)}
    report.update(validate_html(outputs,[e['id'] for g in catalogue['groups'] for e in g['entries']],root))
    return outputs,report


def write_outputs(outputs: dict[Path,str], root: Path = ROOT, check: bool = False) -> list[str]:
    stale=[]
    for rel,content in outputs.items():
        path=root/rel
        if not path.exists() or read(path)!=content:
            stale.append(rel.as_posix())
            if not check:
                path.parent.mkdir(parents=True,exist_ok=True)
                path.write_text(content,encoding='utf-8',newline='\n')
    return stale


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Validate freshness without modifying files')
    args=parser.parse_args()
    try:
        outputs,report=build()
        stale=write_outputs(outputs,check=args.check)
    except (ValueError,KeyError,OSError,json.JSONDecodeError) as error:
        print(f'Design handbook error: {error}',file=sys.stderr);return 1
    report.update({'mode':'check' if args.check else 'generate','stale' if args.check else 'updated':stale})
    print(json.dumps(report,ensure_ascii=True))
    return 1 if args.check and stale else 0


if __name__=='__main__':
    raise SystemExit(main())

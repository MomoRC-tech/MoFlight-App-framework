"""Check tracked Markdown file destinations and conventional heading fragments.

No network requests. Excludes fenced code. Anchor warnings need manual review;
this is a structural check, not a semantic consistency or approval checker.
"""
import json
import re
import subprocess
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
files = subprocess.check_output(['git', 'ls-files', '--', '*.md'], cwd=ROOT, text=True).splitlines()
# Include new audit documents before their first commit.
files = sorted(set(files + [str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'pocs/project-audit').glob('*.md')] +
                   [str(p.relative_to(ROOT)).replace('\\', '/') for p in (ROOT / 'docs/verification').glob('*project-audit*.md')]))

def prose(text):
    return re.sub(r'^\s*(`{3,}|~{3,})[^\n]*\n.*?^\s*\1\s*$', '', text, flags=re.M | re.S)

def anchors(path):
    seen, result = {}, set()
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', prose(path.read_text(encoding='utf-8-sig')), re.M):
        heading = re.sub(r'\[([^]]+)\]\([^)]*\)', r'\1', heading)
        slug = ''.join(c for c in heading.lower().replace(' ', '-') if c.isalnum() or c in '_-')
        count = seen.get(slug, 0)
        seen[slug] = count + 1
        result.add(slug if count == 0 else f'{slug}-{count}')
    return result

missing, fragments = [], []
checked = 0
for filename in files:
    path = ROOT / filename
    text = prose(path.read_text(encoding='utf-8-sig'))
    for match in re.finditer(r'!?\[[^\]]*\]\((<[^>]+>|[^\s)]+)(?:\s+"[^"]*")?\)', text):
        destination = match.group(1).strip('<>')
        parts = urlsplit(destination)
        if parts.scheme or parts.netloc:
            continue
        target = (path.parent / unquote(parts.path)).resolve() if parts.path else path
        checked += 1
        line = text[:match.start()].count('\n') + 1
        finding = {'file': filename, 'proseLine': line, 'destination': destination}
        if not target.exists():
            missing.append(finding)
        elif parts.fragment and target.suffix.lower() == '.md' and unquote(parts.fragment) not in anchors(target):
            fragments.append(finding)
print(json.dumps({'markdownFiles': len(files), 'localDestinationsChecked': checked,
                  'missingFiles': missing, 'headingWarnings': fragments}, indent=2))
raise SystemExit(1 if missing else 0)

"""Inline the pinned runtime assets in the rendered phone-preview export."""

import html
from pathlib import Path
import re
from urllib.request import urlopen


target = Path(__file__).with_name("moflight-design-v0.19.html")
document = target.read_text(encoding="utf-8")
frame_match = re.search(r'data-srcdoc="([^"]*)"', document)
if frame_match is None:
    raise SystemExit("Rendered frame missing")
frame = html.unescape(frame_match.group(1))
allowed = {
    "https://unpkg.com/@floating-ui/core@1.7.3/dist/floating-ui.core.umd.min.js",
    "https://unpkg.com/@floating-ui/dom@1.7.4/dist/floating-ui.dom.umd.min.js",
    "https://unpkg.com/lucide@1.17.0/dist/umd/lucide.js",
}


def inline_script(match):
    url = match.group(2)
    if url not in allowed:
        raise ValueError(f"Unexpected external asset: {url}")
    with urlopen(url, timeout=45) as response:
        source = response.read().decode("utf-8")
    attrs = re.sub(r'\s*src="[^"]*"', "", match.group(1))
    attrs = re.sub(r"\s+async\b", "", attrs)
    source = source.replace("</script", r"<\/script")
    print(f"Embedded {url}: {len(source)} characters")
    return f"<script{attrs}>\n{source}\n</script>"


frame = re.sub(
    r'<script([^>]*\bsrc="([^"]+)"[^>]*)>\s*</script>',
    inline_script,
    frame,
)
document = (
    document[: frame_match.start(1)]
    + html.escape(frame, quote=True)
    + document[frame_match.end(1) :]
)
target.write_text(document, encoding="utf-8")
print(f"Standalone export: {target.stat().st_size} bytes")
print(f"External script tags remaining: {len(re.findall(r'<script[^>]+src=', frame))}")

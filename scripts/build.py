#!/usr/bin/env python3
"""Bundle the editable sources into a self-contained index.html (Python 3.9+)."""

import base64
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]


def digest(text):
    return (
        "'sha256-"
        + base64.b64encode(hashlib.sha256(text.encode("utf-8")).digest()).decode(
            "ascii"
        )
        + "'"
    )


def build():
    template = (ROOT / "templates/index.html").read_text(encoding="utf-8")
    styles = (ROOT / "assets/css/styles.css").read_text(encoding="utf-8")
    data = (ROOT / "assets/js/data.js").read_text(encoding="utf-8")
    brands = (ROOT / "assets/js/brands.js").read_text(encoding="utf-8")
    health = (ROOT / "assets/js/health.js").read_text(encoding="utf-8")
    content = (ROOT / "assets/js/content.js").read_text(encoding="utf-8")
    i18n = (ROOT / "assets/js/i18n.js").read_text(encoding="utf-8")
    app = (ROOT / "assets/js/app.js").read_text(encoding="utf-8")
    # JSON strings may contain HTML end tags; prevent closing the script early.
    scripts = [
        re.sub(r"</script", lambda m: r"<\/script", code, flags=re.I)
        for code in [data, brands, health, content, i18n, app]
    ]
    if re.search(r"</style", styles, re.I):
        raise ValueError("Unexpected closing style tag in stylesheet")
    stylesheet_tag = '<link rel="stylesheet" href="assets/css/styles.css" />'
    if template.count(stylesheet_tag) != 1:
        raise ValueError("Expected one stylesheet marker in the template")
    template = template.replace(stylesheet_tag, "<style>" + styles + "</style>", 1)
    for filename in [
        "data.js",
        "brands.js",
        "health.js",
        "content.js",
        "i18n.js",
        "app.js",
    ]:
        marker = '<script src="assets/js/' + filename + '" defer></script>'
        if template.count(marker) != 1:
            raise ValueError("Missing script marker: " + filename)
        template = template.replace(marker, "", 1)
    icon = "data:image/svg+xml," + quote(
        (ROOT / "assets/images/favicon.svg").read_text(encoding="utf-8"), safe=""
    )
    template = template.replace(
        'href="assets/images/favicon.svg"', 'href="' + icon + '"', 1
    )
    mark = "data:image/svg+xml," + quote(
        (ROOT / "assets/images/logo-mark.svg").read_text(encoding="utf-8"), safe=""
    )
    template = template.replace(
        'src="assets/images/logo-mark.svg"', 'src="' + mark + '"', 1
    )
    policy = (
        "default-src 'none'; connect-src 'self' https://status.openai.com https://status.claude.com https://www.google.com; img-src data:; style-src "
        + digest(styles)
        + "; script-src "
        + " ".join(digest(code) for code in scripts)
        + "; base-uri 'none'; form-action 'none'; object-src 'none'"
    )
    template, count = re.subn(
        r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*("\s*/?>)',
        lambda m: m[1] + policy + m[2],
        template,
        count=1,
    )
    if count != 1:
        raise ValueError("Missing content policy marker")
    # Inline scripts execute only after the document elements have been parsed.
    template = template.replace(
        "</body>",
        "\n".join("<script>" + code + "</script>" for code in scripts) + "\n</body>",
        1,
    )
    temporary = ROOT / "index.html.tmp"
    temporary.write_text(template, encoding="utf-8")
    temporary.replace(ROOT / "index.html")
    payload = json.loads(
        data.split("window.MODEL_WATCH_DATA = ", 1)[1].strip().removesuffix(";")
    )
    temporary_feed = ROOT / "content.json.tmp"
    temporary_feed.write_text(
        json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )
    temporary_feed.replace(ROOT / "content.json")
    print(
        "Built index.html and public content.json with matching content-security hashes."
    )


if __name__ == "__main__":
    build()

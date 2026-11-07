#!/usr/bin/env python3
"""Collect public content for a static Pages deployment; no runtime backend.

python3 refresh_content.py
python3 refresh_content.py --previous-url https://USER.github.io/REPO/content.json
python3 refresh_content.py --fixtures /path/to/source-fixtures
"""

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import json
from pathlib import Path
import re
import sys
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

from bs4 import BeautifulSoup
from refresh_status import read_data, validate

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "openai": {
        "label": "OpenAI News",
        "url": "https://openai.com/news/rss.xml",
        "kind": "official",
    },
    "claude": {
        "label": "Anthropic News",
        "url": "https://www.anthropic.com/news",
        "kind": "official",
    },
    "gemini": {
        "label": "Gemini API release notes",
        "url": "https://aistudio.google.com/docs/changelog.md",
        "kind": "official",
    },
    "resets": {
        "label": "AI IDE List reset archive",
        "url": "https://aiidelist.com/codex-reset",
        "kind": "archive",
    },
}
NEWS_HOSTS = {
    "openai": {"openai.com", "www.openai.com"},
    "claude": {"anthropic.com", "www.anthropic.com"},
    "gemini": {"ai.google.dev", "aistudio.google.com"},
}
DATE_PATTERN = r"\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+20\d{2}\b"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def plain(value, limit=300):
    return re.sub(
        r"\s+", " ", BeautifulSoup(str(value), "html.parser").get_text(" ", strip=True)
    ).strip()[:limit]


def canonical_url(value, hosts=None):
    p = urlsplit(value)
    if (
        p.scheme != "https"
        or not p.hostname
        or p.username
        or p.password
        or p.port not in (None, 443)
    ):
        raise ValueError("Invalid public URL")
    host = p.hostname.lower()
    if hosts and host not in hosts:
        raise ValueError("Unexpected source host")
    return urlunsplit(("https", host, p.path.rstrip("/") or "/", "", p.fragment))


def identity(provider, url, title=""):
    return (
        "auto-"
        + provider
        + "-"
        + hashlib.sha256((url + "|" + title).encode()).hexdigest()[:18]
    )


def classify(title, url="", category=""):
    if re.search(r"deprecat|shut.?down|retir(?:e|ing)", title, re.I):
        return "API update"
    models = r"(?:GPT[-‑ ]?\d|Claude\s+(?:Opus|Sonnet|Haiku|Mythos|Fable)|Gemini\s+(?:\d|Nano Banana)|Images\s+\d|Sora\s+\d)"
    if (
        re.match(r"^(?:Introducing|Meet|Announcing)\s+" + models, title, re.I)
        or (
            re.match(r"^" + models, title, re.I)
            and re.search(
                r"generally available|general availability|released|launch", title, re.I
            )
        )
        or re.search(r"/introducing-(?:gpt-\d|claude-|images-\d|sora-\d)", url, re.I)
    ):
        return "Model release"
    if re.search(r"\bCLI\b|developer tool|\bSDK\b", title, re.I):
        return "Developer tools"
    if "api" in title.lower() or "release notes" in category.lower():
        return "API update"
    return {
        "engineering": "Engineering",
        "research": "Research",
        "security": "Security",
        "safety": "Safety",
        "company": "Company",
    }.get(category.lower(), "News")


def news_item(provider, date, title, url, category=""):
    url = canonical_url(url, NEWS_HOSTS[provider])
    title = plain(title)
    parsed = datetime.strptime(date, "%Y-%m-%d").date()
    if (
        parsed.isoformat() != date
        or parsed > datetime.now(timezone.utc).date()
        or not title
    ):
        raise ValueError("Invalid publication date or title")
    kind = classify(title, url, category)
    labels = {
        "openai": "OpenAI",
        "claude": "Anthropic",
        "gemini": "Gemini API release notes",
    }
    # Keep metadata concise; source articles are linked, not republished.
    summary = (
        "Official model launch announcement."
        if kind == "Model release"
        else (
            "Official release notes update."
            if provider == "gemini"
            else "Official company update."
        )
    ) + " Open the source for details."
    return {
        "id": identity(provider, url, title if provider == "gemini" else ""),
        "provider": provider,
        "date": date,
        "category": kind,
        "title": title,
        "summary": summary,
        "url": url,
        "source": labels[provider],
        "automatic": True,
    }


def parse_openai(raw):
    root = ElementTree.fromstring(raw)
    entries = root.findall("./channel/item")
    if not entries:
        raise ValueError("RSS contains no recognizable items")
    result = []
    for item in entries:
        try:
            published = parsedate_to_datetime(item.findtext("pubDate") or "")
            if published.tzinfo is None:
                raise ValueError("Publication timezone is missing")
            date = published.astimezone(timezone.utc).date().isoformat()
            result.append(
                news_item(
                    "openai",
                    date,
                    item.findtext("title") or "",
                    item.findtext("link") or "",
                    item.findtext("category") or "",
                )
            )
        except (ValueError, TypeError, OverflowError):
            continue
        if len(result) >= 100:
            break
    if not result:
        raise ValueError("RSS items did not validate")
    return result


def english_day(text):
    text = re.sub(r"\bSept\b", "Sep", text)
    for fmt in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError("Invalid date")


def parse_claude(raw):
    soup = BeautifulSoup(raw, "html.parser")
    result = []
    seen = set()
    # The published news list uses semantic list items; avoid generated CSS names.
    for row in soup.find_all("li"):
        heading = row.find(["h2", "h3", "h4"])
        if not heading:
            continue
        anchor = heading.find_parent("a", href=True) or heading.find("a", href=True)
        dates = set(re.findall(DATE_PATTERN, row.get_text(" ", strip=True)))
        if not anchor or len(dates) != 1:
            continue
        try:
            item = news_item(
                "claude",
                english_day(dates.pop()),
                heading.get_text(" ", strip=True),
                urljoin(SOURCES["claude"]["url"], anchor["href"]),
            )
        except ValueError:
            continue
        if item["url"] not in seen:
            result.append(item)
            seen.add(item["url"])
    if not result:
        raise ValueError("No dated Anthropic news rows found")
    return result[:100]


def markdown_plain(text):
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", text)
    return re.sub(r"[`*_]", "", text).strip()


def parse_gemini(raw):
    # The endpoint is advertised by rel=alternate type=text/markdown on Google's docs.
    if "# Release notes" not in raw or "<html" in raw[:500].lower():
        raise ValueError("Expected Gemini Markdown release notes")
    headings = list(
        re.finditer(
            r"^##\s+(" + DATE_PATTERN.replace(r"\b", "") + r")\s*[^\n]*$", raw, re.M
        )
    )
    result = []
    for index, heading in enumerate(headings[:90]):
        day = english_day(heading.group(1))
        section = raw[
            heading.end() : (
                headings[index + 1].start() if index + 1 < len(headings) else len(raw)
            )
        ]
        bullets = list(re.finditer(r"^\*\s+", section, re.M))
        for n, bullet in enumerate(bullets):
            text = section[
                bullet.end() : (
                    bullets[n + 1].start() if n + 1 < len(bullets) else len(section)
                )
            ].strip()
            bold = re.match(r"\*\*(.+?)\*\*", text, re.S)
            label = bold.group(1) if bold else text.split("\n", 1)[0]
            label = markdown_plain(label).rstrip(": ")
            try:
                result.append(
                    news_item(
                        "gemini",
                        day,
                        label,
                        "https://aistudio.google.com/docs/changelog#"
                        + datetime.strptime(day, "%Y-%m-%d").strftime("%m-%d-%Y"),
                        "release notes",
                    )
                )
            except ValueError:
                continue
        if len(result) >= 100:
            break
    if not result:
        raise ValueError("No dated Gemini release entries found")
    return result[:100]


def parse_resets(raw):
    soup = BeautifulSoup(raw, "html.parser")
    result = []
    for row in soup.select("article.cr-event"):
        time = row.find("time", datetime=True)
        kinds = [plain(k.get_text(" ", strip=True), 60) for k in row.select(".cr-kind")]
        anchor = row.select_one(".cr-event-sources a[href]")
        if not time or not kinds or not anchor:
            continue
        try:
            stamp = datetime.fromisoformat(time["datetime"].replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError("Announcement timezone is missing")
            stamp = stamp.astimezone(timezone.utc)
            if stamp > datetime.now(timezone.utc):
                continue
            announcement = canonical_url(
                urljoin(SOURCES["resets"]["url"], anchor["href"]),
                {
                    "x.com",
                    "www.x.com",
                    "twitter.com",
                    "www.twitter.com",
                    "openai.com",
                    "www.openai.com",
                    "aiidelist.com",
                    "codex-resets.com",
                },
            )
            label = row.select_one(".cr-verification")
            verification = (
                plain(label.get_text(" ", strip=True), 80)
                if label
                else "Archived report"
            )
            kind = " + ".join(kinds)
            result.append(
                {
                    "date": stamp.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "type": kind,
                    "title": "Codex " + kind.lower() + " announcement",
                    "source": "AI IDE List archive",
                    "url": SOURCES["resets"]["url"] + "#" + str(row.get("id", "")),
                    "announcementUrl": announcement,
                    "note": verification
                    + ". Third-party archive; confirm timing and eligibility in the original announcement.",
                }
            )
        except (ValueError, TypeError):
            continue
    if not result:
        raise ValueError("No valid archived reset records found")
    return result


PARSERS = {
    "openai": parse_openai,
    "claude": parse_claude,
    "gemini": parse_gemini,
    "resets": parse_resets,
}


def fetch_text(url):
    path = urlsplit(url).path
    accept = (
        "text/markdown"
        if path.endswith(".md")
        else (
            "application/json"
            if path.endswith(".json")
            else (
                "application/rss+xml, text/xml"
                if path.endswith(".xml")
                else "text/html"
            )
        )
    )
    request = Request(
        url,
        headers={
            "User-Agent": "kepoAI/1.0 (public static AI update tracker)",
            "Accept": accept,
        },
    )
    with urlopen(request, timeout=30) as response:
        raw = response.read(4_000_001)
    if len(raw) > 4_000_000:
        raise ValueError("Source response too large")
    return raw.decode("utf-8-sig")


def load_previous(url):
    canonical_url(url)
    separator = "&" if "?" in url else "?"
    url = (
        url
        + separator
        + "archive_check="
        + str(int(datetime.now(timezone.utc).timestamp()))
    )
    try:
        data = json.loads(fetch_text(url))
    except HTTPError as error:
        if error.code == 404:
            return None  # First publication, or migration from the old single-file version.
        raise
    validate(data)
    return data


def merge_updates(old, incoming, replace_gemini_sections=True):
    # Google's dated sections may contain several independent updates at one URL.
    incoming_gemini_urls = {u["url"] for u in incoming if u["provider"] == "gemini"}
    merged = {}

    def key(item):
        url = canonical_url(item["url"])
        return (
            item["provider"],
            url,
            item["title"].lower() if item["provider"] == "gemini" else "",
        )

    for item in old:
        if (
            replace_gemini_sections
            and item["provider"] == "gemini"
            and canonical_url(item["url"]) in incoming_gemini_urls
        ):
            continue
        merged[key(item)] = item
    for item in incoming:
        k = key(item)
        prior = merged.get(k)
        if prior and not prior.get("automatic"):
            # Preserve existing hand-written summaries and IDs for the same article.
            item = {
                **item,
                "id": prior["id"],
                "title": prior["title"],
                "summary": prior["summary"],
                "category": prior["category"],
                "automatic": False,
            }
        merged[k] = item
    return sorted(
        merged.values(),
        key=lambda u: (u["date"], u["provider"], u["title"].lower()),
        reverse=True,
    )[:900]


def merge_resets(old, incoming):
    result = {canonical_url(r["announcementUrl"]): r for r in old}
    for record in incoming:
        result[canonical_url(record["announcementUrl"])] = record
    return sorted(
        result.values(), key=lambda r: (r["date"], r["announcementUrl"]), reverse=True
    )[:1000]


def collect(data, fixtures=None):
    previous_sources = {
        s["id"]: s
        for s in data.get("contentMeta", {}).get("sources", [])
        if isinstance(s, dict) and s.get("id") in SOURCES
    }
    updates = list(data["updates"])
    resets = list(data["resets"])
    statuses = {}

    def run(source_id):
        raw = (
            (fixtures / (source_id + ".txt")).read_text()
            if fixtures
            else fetch_text(SOURCES[source_id]["url"])
        )
        return PARSERS[source_id](raw)

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(run, source_id): source_id for source_id in SOURCES}
        for future in as_completed(futures):
            source_id = futures[future]
            checked = now_iso()
            metadata = {"id": source_id, **SOURCES[source_id], "checkedAt": checked}
            try:
                records = future.result()
                if source_id == "resets":
                    resets = merge_resets(resets, records)
                else:
                    updates = merge_updates(updates, records)
                metadata.update(
                    status="ok", lastSuccessAt=checked, records=len(records), error=None
                )
                print(source_id + ": " + str(len(records)) + " records checked")
            except Exception as error:
                old = previous_sources.get(source_id, {})
                metadata.update(
                    status="error",
                    lastSuccessAt=old.get("lastSuccessAt"),
                    records=old.get("records", 0),
                    error="Source request or format check failed",
                )
                print(
                    "::warning::"
                    + source_id
                    + " refresh failed ("
                    + type(error).__name__
                    + "); previous records retained.",
                    file=sys.stderr,
                )
            statuses[source_id] = metadata
    # Updates are ordered after every merge, independent of concurrent completion order.
    changed = updates != data["updates"] or resets != data["resets"]
    checked = now_iso()
    result = {
        **data,
        "updates": updates,
        "resets": resets,
        "updatedAt": checked if changed else data["updatedAt"],
        "contentMeta": {
            "version": 1,
            "generatedAt": checked,
            "intervalMinutes": 60,
            "sources": [statuses[k] for k in SOURCES],
        },
    }
    validate(result)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--previous-url",
        help="Previous deployed content.json; failures other than 404 stop publication to protect the archive",
    )
    parser.add_argument(
        "--fixtures",
        type=Path,
        help="Read local source fixtures instead of making upstream requests",
    )
    parser.add_argument(
        "--github-output",
        type=Path,
        help="Write whether public records changed to the Actions step-output file",
    )
    args = parser.parse_args()
    data = read_data()
    validate(data)
    repo_records = json.dumps([data["updates"], data["resets"]], sort_keys=True)
    if args.previous_url:
        try:
            previous = load_previous(args.previous_url)
        except Exception as error:
            print(
                "Previous published archive could not be loaded ("
                + type(error).__name__
                + "). Publication stopped; existing Pages content is untouched.",
                file=sys.stderr,
            )
            return 2
        if previous:
            # Repo edits and prior published records both survive the next collection.
            older, newer = (
                (data, previous)
                if previous["updatedAt"] >= data["updatedAt"]
                else (previous, data)
            )
            data["updates"] = merge_updates(
                older["updates"], newer["updates"], replace_gemini_sections=False
            )
            data["resets"] = merge_resets(older["resets"], newer["resets"])
            data["updatedAt"] = max(data["updatedAt"], previous["updatedAt"])
            data["contentMeta"] = previous.get("contentMeta", {})
    data = collect(data, args.fixtures)
    temporary = ROOT / "assets/js/data.js.tmp"
    temporary.write_text(
        "/* Public content collected at build time. No visitor data is stored. */\nwindow.MODEL_WATCH_DATA = "
        + json.dumps(data, ensure_ascii=True, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    temporary.replace(ROOT / "assets/js/data.js")
    if args.github_output:
        changed = repo_records != json.dumps(
            [data["updates"], data["resets"]], sort_keys=True
        )
        with args.github_output.open("a", encoding="utf-8") as output:
            output.write("content_changed=" + ("true" if changed else "false") + "\n")
    print(
        "Content collected. Run python3 scripts/build.py to generate index.html and content.json."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

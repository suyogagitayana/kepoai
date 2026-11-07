#!/usr/bin/env python3
"""Optional maintenance command; never runs in the browser or on your web host.

python3 refresh_status.py           # Refresh OpenAI/Claude provider status.
python3 refresh_status.py --from-json snapshot.json  # Import JSON and rebuild index.html.
python3 refresh_status.py --export snapshot.json     # Export bundled data for editing.
"""

import argparse
import json
from urllib.parse import urlsplit
import sys
from build import build
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "assets/js/data.js"
PREFIX = "window.MODEL_WATCH_DATA = "
IDS = {"openai", "claude", "gemini"}
STATUSES = {"operational", "degraded", "outage", "unknown"}


def read_data():
    text = DATA_FILE.read_text(encoding="utf-8")
    return json.loads(text.split(PREFIX, 1)[1].strip().removesuffix(";"))


def write_data(data):
    temporary = DATA_FILE.with_suffix(".js.tmp")
    temporary.write_text(
        "/* Public site content. Live status uses separate official feeds. */\n"
        + PREFIX
        + json.dumps(data, ensure_ascii=True, indent=2)
        + ";\n",
        encoding="utf-8",
    )
    temporary.replace(DATA_FILE)
    build()


def validate(data):
    """Guard publishing; browser import additionally checks length/duplicate limits."""

    def require(condition):
        if not condition:
            raise ValueError("Invalid snapshot")

    def url(value):
        if not isinstance(value, str) or any(c.isspace() or ord(c) < 32 for c in value):
            return False
        try:
            parsed = urlsplit(value)
            return (
                parsed.scheme == "https"
                and bool(parsed.hostname)
                and not parsed.username
                and not parsed.password
                and parsed.port in (None, 443)
                and "\\" not in value
            )
        except ValueError:
            return False

    def timestamp(value):
        return (
            isinstance(value, str)
            and value.endswith("Z")
            and datetime.fromisoformat(value.replace("Z", "+00:00"))
        )

    def day(value):
        return (
            isinstance(value, str)
            and datetime.strptime(value, "%Y-%m-%d").strftime("%Y-%m-%d") == value
        )

    require(data["version"] == 1 and timestamp(data["updatedAt"]))
    require(len(data["updates"]) <= 2000 and len(data["resets"]) <= 1000)
    require(len(data["providers"]) == 3 and {p["id"] for p in data["providers"]} == IDS)
    for p in data["providers"]:
        require(
            p["status"] in STATUSES
            and timestamp(p["checkedAt"])
            and url(p["statusUrl"])
        )
        require(
            all(
                isinstance(p[k], str) and p[k]
                for k in ["name", "subtitle", "scope", "uptimePeriod"]
            )
        )
        require(
            p["uptime"] is None
            or (
                type(p["uptime"]) in [float, int]
                and 0 <= p["uptime"] <= 100
                and url(p["uptimeSource"])
            )
        )
        require(len(p["history"]) <= 4000)
        require(len({h["date"] for h in p["history"]}) == len(p["history"]))
        for h in p["history"]:
            require(
                day(h["date"])
                and h["status"] in STATUSES
                and h["date"] <= p["checkedAt"][:10]
            )
    require(len({u["id"] for u in data["updates"]}) == len(data["updates"]))
    for u in data["updates"]:
        require(u["provider"] in IDS and day(u["date"]) and url(u["url"]))
        require(
            all(
                isinstance(u[k], str) and u[k]
                for k in ["id", "category", "title", "summary", "source"]
            )
        )
    for r in data["resets"]:
        require(timestamp(r["date"]) and url(r["url"]) and url(r["announcementUrl"]))
        require(
            all(
                isinstance(r[k], str) and r[k]
                for k in ["type", "title", "source", "note"]
            )
        )


def fetch_status(provider):
    endpoints = {
        "openai": "https://status.openai.com/api/v2/status.json",
        "claude": "https://status.claude.com/api/v2/status.json",
    }
    req = Request(
        endpoints[provider],
        headers={"User-Agent": "kepoAI-Snapshot/1.0", "Accept": "application/json"},
    )
    with urlopen(req, timeout=20) as response:
        report = json.load(response)
    indicator = report["status"]["indicator"]
    mapping = {
        "none": "operational",
        "minor": "degraded",
        "major": "outage",
        "critical": "outage",
        "maintenance": "degraded",
    }
    if indicator not in mapping:
        raise ValueError("Unrecognized status indicator")
    return mapping[indicator]


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--from-json", type=Path, help="Validate and bundle an edited snapshot JSON"
    )
    group.add_argument("--export", type=Path, help="Export bundled snapshot as JSON")
    args = parser.parse_args()
    if args.from_json:
        data = json.loads(args.from_json.read_text(encoding="utf-8"))
        validate(data)
        write_data(data)
        print(
            "Snapshot bundled and index.html rebuilt. Upload index.html to publish it."
        )
        return 0
    data = read_data()
    validate(data)
    if args.export:
        args.export.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
        print("Snapshot JSON exported.")
        return 0
    failures = []
    for p in data["providers"]:
        if p["id"] not in {"openai", "claude"}:
            continue  # Do not substitute Google Cloud status for Gemini status.
        try:
            new_status = fetch_status(p["id"])
        except Exception as error:
            # Preserve both last verified status AND its timestamp on failure.
            failures.append(p["name"])
            print(
                f'{p["name"]}: refresh failed ({type(error).__name__}); prior timestamp retained.',
                file=sys.stderr,
            )
            continue
        now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        p["status"] = new_status
        p["checkedAt"] = now
        p["scope"] = (
            "Provider-wide aggregate from the official status API. Per-model, regional and account availability can differ."
        )
        today = now[:10]
        records = {h["date"]: h["status"] for h in p["history"]}
        # Keep the worst observed state per day, not a misleading end-of-day recovery.
        severity = {"unknown": -1, "operational": 0, "degraded": 1, "outage": 2}
        old = records.get(today, "unknown")
        records[today] = max([old, new_status], key=severity.get)
        p["history"] = [
            {"date": date, "status": state} for date, state in sorted(records.items())
        ][-4000:]
        # No historical uptime percentage is manufactured from point checks.
        p["uptime"] = None
        p["uptimeSource"] = None
        print(f'{p["name"]}: {new_status}, checked {now}')
    # updatedAt refers to the overall snapshot. Advance only if something was checked.
    times = [p["checkedAt"] for p in data["providers"]]
    data["updatedAt"] = max([data["updatedAt"]] + times)
    validate(data)
    write_data(data)
    print(
        "News and reset records were not refreshed. Gemini status is unchanged. Upload index.html to publish."
    )
    return 1 if failures else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (KeyError, TypeError, ValueError) as error:
        print(
            f"Invalid snapshot; data.js was not changed. {type(error).__name__}",
            file=sys.stderr,
        )
        sys.exit(2)

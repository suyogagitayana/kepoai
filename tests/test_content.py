import copy
from datetime import datetime, timezone
import io
import json
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import refresh_content as c

RSS = """<rss><channel><item><title>Introducing GPT-6.1 Sol</title><link>https://openai.com/index/introducing-gpt-6-1-sol</link><pubDate>Tue, 29 Sep 2026 12:00:00 GMT</pubDate><category>Product</category></item><item><title>Bad URL</title><link>javascript:alert(1)</link><pubDate>Tue, 29 Sep 2026 12:00:00 GMT</pubDate></item></channel></rss>"""
CLAUDE = """<ul><li><a href="/news/introducing-claude-haiku-5-5"><h3>Introducing Claude Haiku 5.5</h3></a><p>Oct 7, 2026</p></li><li><a href="/news/undated"><h3>No date</h3></a></li></ul>"""
GEMINI = """# Release notes
## October 13, 2026 {% id="10-13-2026" %}
* **Gemini 4 Argon generally available (GA)**: Released a model.
* **Computer Use generally available**: Released a tool.
## October 8, 2026 {% id="10-08-2026" %}
* **Gemini 3.7 Flash deprecation**: Migrate to another model.
"""
RESETS = """<article class="cr-event" id="one"><time datetime="2026-11-01T23:27:20Z"></time><span class="cr-kind">Banked reset</span><span class="cr-verification">Archived X post</span><div class="cr-event-sources"><a href="https://x.com/person/status/one?utm_source=archive">Source</a></div></article><article class="cr-event" id="two"><time datetime="2026-11-01T00:43:20Z"></time><span class="cr-kind">Global reset</span><span class="cr-kind">Compensation</span><div class="cr-event-sources"><a href="https://x.com/person/status/two">Source</a></div></article>"""


class ContentTests(unittest.TestCase):
    def test_official_rss_and_url_filter(self):
        items = c.parse_openai(RSS)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["category"], "Model release")
        self.assertEqual(items[0]["date"], "2026-09-29")
        with self.assertRaises(ValueError):
            c.canonical_url("https://evil.test/news", c.NEWS_HOSTS["openai"])

    def test_claude_requires_a_dated_news_row(self):
        self.assertEqual(len(c.parse_claude(CLAUDE)), 1)
        with self.assertRaises(ValueError):
            c.parse_claude("<html>Sign in / access denied</html>")

    def test_release_classification_is_conservative(self):
        items = c.parse_gemini(GEMINI)
        self.assertEqual(
            [i["category"] for i in items],
            ["Model release", "API update", "API update"],
        )
        self.assertNotEqual(
            c.classify("Computer Use generally available"), "Model release"
        )
        self.assertNotEqual(
            c.classify("GPT-6 and Intelligent UI for everyone"), "Model release"
        )
        with self.assertRaises(ValueError):
            c.parse_gemini("<html>Loading</html>")

    def test_resets_preserve_multiple_records_on_one_day(self):
        records = c.parse_resets(RESETS)
        self.assertEqual(len(records), 2)
        self.assertTrue(all(r["date"].startswith("2026-11-01") for r in records))
        self.assertEqual(records[1]["type"], "Global reset + Compensation")
        self.assertNotIn("utm_", records[0]["announcementUrl"])
        with self.assertRaises(ValueError):
            c.parse_resets("<html>No recognizable archive</html>")
        with self.assertRaises(ValueError):
            c.parse_resets(
                RESETS.replace("T23:27:20Z", "T23:27:20").replace(
                    "T00:43:20Z", "T00:43:20"
                )
            )

    def test_merge_is_idempotent_and_keeps_old_entries(self):
        fetched = c.parse_openai(RSS)
        old = {
            **fetched[0],
            "id": "editorial",
            "automatic": False,
            "summary": "Editorial summary",
        }
        first = c.merge_updates([old], fetched)
        second = c.merge_updates(first, fetched)
        self.assertEqual(first, second)
        self.assertEqual(first[0]["summary"], "Editorial summary")
        old_reset = {
            **c.parse_resets(RESETS)[0],
            "announcementUrl": "https://x.com/person/status/older",
            "date": "2026-10-01T00:00:00Z",
        }
        self.assertEqual(len(c.merge_resets([old_reset], c.parse_resets(RESETS))), 3)

    def test_partial_and_total_failures_do_not_clear_content(self):
        data = c.read_data()
        saved_updates = copy.deepcopy(data["updates"])
        saved_resets = copy.deepcopy(data["resets"])
        saved_stamp = data["updatedAt"]
        with patch.object(c, "fetch_text", side_effect=ValueError("blocked")), patch(
            "sys.stderr", io.StringIO()
        ):
            result = c.collect(data)
        self.assertEqual(result["updates"], saved_updates)
        self.assertEqual(result["resets"], saved_resets)
        self.assertEqual(result["updatedAt"], saved_stamp)
        self.assertTrue(
            all(s["status"] == "error" for s in result["contentMeta"]["sources"])
        )
        responses = {
            c.SOURCES[k]["url"]: v
            for k, v in [("openai", RSS), ("claude", CLAUDE), ("gemini", GEMINI)]
        }

        def fetch(url):
            if url not in responses:
                raise ValueError("archive unavailable")
            return responses[url]

        with patch.object(c, "fetch_text", side_effect=fetch), patch(
            "sys.stderr", io.StringIO()
        ):
            result = c.collect(data)
        self.assertEqual(result["resets"], saved_resets)
        self.assertEqual(
            sum(s["status"] == "ok" for s in result["contentMeta"]["sources"]), 3
        )

    def test_previous_archive_failure_stops_publication(self):
        before = (
            c.DATA_FILE.read_bytes()
            if hasattr(c, "DATA_FILE")
            else (c.ROOT / "assets/js/data.js").read_bytes()
        )
        with patch.object(
            c, "load_previous", side_effect=ValueError("invalid published copy")
        ), patch.object(
            sys,
            "argv",
            [
                "refresh_content.py",
                "--previous-url",
                "https://example.github.io/tracker/content.json",
            ],
        ), patch(
            "sys.stderr", io.StringIO()
        ):
            self.assertEqual(c.main(), 2)
        self.assertEqual((c.ROOT / "assets/js/data.js").read_bytes(), before)

    def test_repeated_collection_does_not_change_content_timestamps(self):
        responses = {
            c.SOURCES[k]["url"]: v
            for k, v in [
                ("openai", RSS),
                ("claude", CLAUDE),
                ("gemini", GEMINI),
                ("resets", RESETS),
            ]
        }
        with patch.object(c, "fetch_text", side_effect=lambda url: responses[url]):
            first = c.collect(c.read_data())
            second = c.collect(first)
        self.assertEqual(first["updates"], second["updates"])
        self.assertEqual(first["resets"], second["resets"])
        self.assertEqual(first["updatedAt"], second["updatedAt"])


if __name__ == "__main__":
    unittest.main()

import copy
from pathlib import Path
import subprocess
import sys
import unittest

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
from refresh_status import read_data, validate


class SnapshotSecurityTests(unittest.TestCase):
    def test_rejects_unsafe_source_urls(self):
        for url in [
            "https://user:password@example.com/",
            "https://example.com:8080/",
            "https://example.com\\@evil.test/",
            "https://example.com/\n",
            "javascript:alert(1)",
        ]:
            with self.subTest(url=url):
                data = copy.deepcopy(read_data())
                data["updates"][0]["url"] = url
                with self.assertRaises(ValueError):
                    validate(data)

    def test_optimized_python_keeps_validation(self):
        result = subprocess.run(
            [
                sys.executable,
                "-O",
                "-c",
                'from refresh_status import read_data, validate; d=read_data(); d["version"]=0; validate(d)',
            ],
            cwd=SCRIPTS,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("ValueError: Invalid snapshot", result.stderr)


if __name__ == "__main__":
    unittest.main()

"""Tests fuer fetch_layout.py. Kein Netz: der Abruf ist ein Stub."""

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_layout as fl  # noqa: E402

STORE_ID = "AD61389A-7486-48FA-AFA2-9B5E4132F6A8"
LAYOUT = {
    "shopName": "X", "gridSize": {"width": 12, "height": 10},
    "elements": [
        {"id": 1, "type": "beacon", "x": 2, "y": 3, "beaconId": "Indooro1", "identityKey": "u:1:1"},
        {"id": 2, "type": "shelf", "x": 5, "y": 5},
    ],
}


def stub(fallback=False, layout=LAYOUT, calls=None):
    def fetch(url):
        if calls is not None:
            calls.append(url)
        if url.endswith("/mobile/stores"):
            return json.dumps([{"id": STORE_ID, "storeCode": "SPAR-Leonding-002"}]).encode()
        if url.endswith("/layout/current"):
            return json.dumps({"storeId": STORE_ID, "layoutId": "L1", "fallback": fallback, "layout": layout}).encode()
        raise AssertionError(url)
    return fetch


class FetchLayoutTests(unittest.TestCase):
    def run_main(self, args, fetch):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = fl.main(args, fetch)
        return code, out.getvalue(), err.getvalue()

    def test_writes_layout_object_and_uses_only_the_two_get_urls(self):
        calls = []
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "sub" / "layout.json"
            code, out, _ = self.run_main(["--store", "spar-leonding-002", "--out", str(target), "--api-base", "https://x/api/"], stub(calls=calls))
            self.assertEqual(code, 0)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), LAYOUT)
        self.assertEqual(calls, ["https://x/api/mobile/stores", f"https://x/api/mobile/stores/{STORE_ID.lower()}/layout/current"])
        self.assertIn("Indooro1  x=2 y=3", out)

    def test_fallback_layout_is_refused_unless_allowed(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "layout.json"
            code, _, err = self.run_main(["--store", "SPAR-Leonding-002", "--out", str(target)], stub(fallback=True))
            self.assertEqual(code, 1)
            self.assertFalse(target.exists())
            self.assertIn("Fallback", err)
            code, _, _ = self.run_main(["--store", "SPAR-Leonding-002", "--out", str(target), "--allow-fallback"], stub(fallback=True))
            self.assertEqual(code, 0)

    def test_unknown_store_lists_available_codes(self):
        with tempfile.TemporaryDirectory() as directory:
            code, _, err = self.run_main(["--store", "NOPE", "--out", str(Path(directory) / "l.json")], stub())
            self.assertEqual(code, 2)
            self.assertIn("SPAR-Leonding-002", err)

    def test_layout_without_beacons_exits_1(self):
        bare = {"gridSize": {"width": 1, "height": 1}, "elements": []}
        with tempfile.TemporaryDirectory() as directory:
            code, _, err = self.run_main(["--store", "SPAR-Leonding-002", "--out", str(Path(directory) / "l.json")], stub(layout=bare))
            self.assertEqual(code, 1)
            self.assertIn("ohne Beacons", err)

    def test_network_error_exits_2(self):
        def broken(url):
            raise fl.FetchError("offline")
        with tempfile.TemporaryDirectory() as directory:
            code, _, err = self.run_main(["--store", "X", "--out", str(Path(directory) / "l.json")], broken)
            self.assertEqual(code, 2)
            self.assertIn("offline", err)


if __name__ == "__main__":
    unittest.main()

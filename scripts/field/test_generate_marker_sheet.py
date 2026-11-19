"""Tests fuer generate_marker_sheet.py. Kein Netz: der Abruf ist ein Stub."""

import contextlib
import io
import json
import re
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import generate_marker_sheet as gm  # noqa: E402

FIXTURE = Path(__file__).resolve().parent / "fixtures" / "marker" / "layout-spar-leonding-002.json"
STORE_ID = "AD61389A-7486-48FA-AFA2-9B5E4132F6A8"


def load():
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


class PlanTests(unittest.TestCase):
    def test_plan_for_fixture_layout(self):
        plan = gm.plan_markers(load())
        self.assertEqual(
            [(m["id"], m["x"], m["y"]) for m in plan],
            [("M1", 0.5, 7.5), ("M2", 4.5, 7.5), ("M3", 4.5, 5.5), ("M4", 0.5, 5.5),
             ("M5", 0.5, 3.5), ("M6", 4.5, 3.5), ("M7", 4.5, 1.5), ("M8", 0.5, 1.5)],
        )

    def test_plan_has_no_warnings(self):
        layout = load()
        self.assertEqual(gm.check_markers(layout, gm.plan_markers(layout)), [])

    def test_ids_match_recorder_pattern(self):
        for marker in gm.plan_markers(load()):
            self.assertRegex(str(marker["id"]), r"^M[0-9]{1,3}$")

    def test_markers_avoid_shelves_and_beacons(self):
        layout = load()
        blocked = gm.blocked_cells(layout)
        for marker in gm.plan_markers(layout):
            self.assertNotIn((int(marker["x"]), int(marker["y"])), blocked)

    def test_rotated_shelf_swaps_size(self):
        layout = {"gridSize": {"width": 3, "height": 3},
                  "elements": [{"type": "shelf", "x": 0, "y": 0, "width": 2, "height": 1, "rotation": 90}]}
        self.assertEqual(gm.blocked_cells(layout), {(0, 0), (0, 1)})

    def test_empty_plan_is_error(self):
        layout = {"gridSize": {"width": 2, "height": 1},
                  "elements": [{"type": "shelf", "x": 0, "y": 0, "width": 2, "height": 1}]}
        with self.assertRaises(gm.SheetError):
            gm.build(layout, "x", 1.0)


class ValidationTests(unittest.TestCase):
    def test_rejects_bad_id(self):
        with self.assertRaises(gm.SheetError):
            gm.validate_markers([{"id": "marker1", "x": 1, "y": 1}])

    def test_rejects_duplicate_id(self):
        with self.assertRaises(gm.SheetError):
            gm.validate_markers([{"id": "M1", "x": 1, "y": 1}, {"id": "M1", "x": 2, "y": 2}])

    def test_warns_for_shelf_beacon_outside_and_app_range(self):
        layout = load()
        markers = gm.validate_markers([
            {"id": "M1", "x": 1.0, "y": 0.5},    # Regal Reihe 0
            {"id": "M2", "x": 0.5, "y": 8.5},    # nah an Indooro4 (0, 9)
            {"id": "M3", "x": 9.0, "y": 1.5},    # ausserhalb
            {"id": "M31", "x": 2.0, "y": 3.5},   # ueber dem App-Bereich
        ])
        text = " ".join(gm.check_markers(layout, markers))
        self.assertIn("M1 liegt auf einem Regal", text)
        self.assertIn("M2 ist weniger als", text)
        self.assertIn("M3 liegt ausserhalb", text)
        self.assertIn("M31: die App-Auswahl", text)


class RenderTests(unittest.TestCase):
    def test_one_page_per_marker_plus_overview(self):
        text, plan, _ = gm.build(load(), "SPAR-Leonding-002", 1.0)
        self.assertEqual(text.count('<section class="page">'), len(plan) + 1)
        for marker in plan:
            self.assertIn(f'<p class="big">{marker["id"]}</p>', text)

    def test_metres_use_cell_size(self):
        text, _, _ = gm.build(load(), "X", 1.5)
        self.assertIn("x = 6,75 m, y = 11,25 m", text)  # M2: 4.5 und 7.5 * 1.5

    def test_html_escapes_names(self):
        layout = load()
        layout["shopName"] = "<script>alert(1)</script>"
        text, _, _ = gm.build(layout, "X", 1.0)
        self.assertNotIn("<script>", text)
        self.assertIn("&lt;script&gt;", text)

    def test_next_marker_hint_and_origin(self):
        text, _, _ = gm.build(load(), "X", 1.0)
        self.assertIn("Nächster Marker: <b>M2</b>, nach rechts", text)
        self.assertIn("Beacon Indooro3", text)
        self.assertIn("Letzter Marker", text)

    def test_cell_counting_from_zero(self):
        text, _, _ = gm.build(load(), "X", 1.0)
        self.assertIn("Spalte 4, Reihe 7 (Zählung ab 0, wie im Layout)", text)  # M2 (4.5 / 7.5)
        self.assertIn("4 Zellen nach rechts, 7 Zellen nach unten", text)


class CliTests(unittest.TestCase):
    def run_main(self, args, fetch=None):
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = gm.main(args, fetch) if fetch else gm.main(args)
        return code, out.getvalue(), err.getvalue()

    def test_layout_file_writes_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "sub" / "marker.html"
            code, out, _ = self.run_main(["--layout", str(FIXTURE), "--out", str(target)])
            self.assertEqual(code, 0)
            self.assertIn("8 Marker", out)
            self.assertTrue(target.read_text(encoding="utf-8").startswith("<!doctype html>"))

    def test_live_layout_via_fetch_stub(self):
        layout = load()

        def fetch(url):
            if url.endswith("/mobile/stores"):
                return json.dumps([{"id": STORE_ID, "storeCode": "SPAR-Leonding-002"}]).encode()
            return json.dumps({"layout": layout, "fallback": False}).encode()

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "m.html"
            code, _, _ = self.run_main(["--store", "SPAR-Leonding-002", "--out", str(target)], fetch)
            self.assertEqual(code, 0)
            self.assertIn("SPAR-Leonding-002", target.read_text(encoding="utf-8"))

    def test_custom_markers_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            markers = Path(tmp) / "m.json"
            markers.write_text(json.dumps([{"id": "M1", "x": 2.0, "y": 3.5}]), encoding="utf-8")
            target = Path(tmp) / "m.html"
            code, out, _ = self.run_main(["--layout", str(FIXTURE), "--out", str(target), "--markers", str(markers)])
            self.assertEqual(code, 0)
            self.assertIn("1 Marker", out)

    def test_missing_layout_is_exit_2(self):
        code, _, err = self.run_main(["--layout", "/nonexistent/layout.json", "--out", "/tmp/never.html"])
        self.assertEqual(code, 2)
        self.assertIn("Fehler", err)

    def test_bad_cell_size_is_exit_2(self):
        code, _, _ = self.run_main(["--layout", str(FIXTURE), "--out", "/tmp/never.html", "--cell-m", "0"])
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()

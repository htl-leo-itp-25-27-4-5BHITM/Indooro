"""Planner tests: incremental coverage, greedy determinism, outputs, CLI exit codes and the demo run."""
import csv
import filecmp
import json
import os
import subprocess
import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from candidates import generate_candidates  # noqa: E402
from coverage import CoverageState, build_cover, build_universe  # noqa: E402
from layout import load_layout, parse_layout  # noqa: E402
from rule import load_rule  # noqa: E402
from selection import PlanParams, plan_beacons  # noqa: E402

REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
PLAN = os.path.join(HERE, "plan.py")
DEMO = os.path.join(REPO, "swift", "indooro-EinkaeuferFinal", "indooroApp", "Resources", "layout-demosupermarkt.json")
ROOM = os.path.join(REPO, "swift", "indooro-EinkaeuferFinal", "indooroApp", "Resources", "layout.json")
RULE_FILE = os.path.join(REPO, "backend", "indooro_server", "src", "main", "resources", "readiness", "coverage-rule.json")


def _read_bytes(path):
    with open(path, "rb") as handle:
        return handle.read()


def _run(*args):
    return subprocess.run([sys.executable, "-I", PLAN, *args], capture_output=True, text=True, timeout=120)


def _synthetic_layout():
    return parse_layout({
        "gridSize": {"width": 20, "height": 20},
        "elements": [
            {"id": 1, "type": "entrance", "x": 0, "y": 0, "width": 2, "height": 1},
            {"id": 2, "type": "shelf", "x": 4, "y": 4, "width": 8, "height": 1, "category": "520/1", "label": "Milch"},
            {"id": 3, "type": "shelf", "x": 4, "y": 10, "width": 8, "height": 1, "category": "510/1", "label": "Saft"},
            {"id": 4, "type": "shelf", "x": 4, "y": 15, "width": 8, "height": 1, "category": "430/1", "label": "Nudeln"},
        ],
    })


class CoverageStateTests(unittest.TestCase):
    def test_incremental_add_and_remove_match_a_fresh_state(self):
        layout = _synthetic_layout()
        rule = load_rule(RULE_FILE)
        universe = build_universe(layout)
        candidates = generate_candidates(layout)
        cover = build_cover(universe, candidates, rule.radius_m)
        first, second, third = 0, 1, 2

        incremental = CoverageState(universe, cover, 3, 2.5)
        for cid in (first, second, third):
            incremental.add(cid)
        incremental.remove(first)

        fresh = CoverageState(universe, cover, 3, 2.5)
        for cid in (second, third):
            fresh.add(cid)

        self.assertEqual(incremental.count, fresh.count)
        self.assertEqual(incremental.ok, fresh.ok)
        self.assertEqual(incremental.ok_ios, fresh.ok_ios)
        self.assertEqual(incremental.sxx, fresh.sxx)
        self.assertEqual(incremental.sxy, fresh.sxy)

    def test_adding_a_beacon_never_turns_an_ok_cell_back_to_not_ok(self):
        layout = _synthetic_layout()
        universe = build_universe(layout)
        candidates = generate_candidates(layout)
        cover = build_cover(universe, candidates, 8.0)
        state = CoverageState(universe, cover, 3, 2.5)
        previously = [False] * len(universe.cells)
        for cid in range(min(40, len(candidates))):
            state.add(cid)
            for cell in range(len(universe.cells)):
                if previously[cell]:
                    self.assertTrue(state.ok[cell])
                previously[cell] = state.ok[cell]


class SelectionTests(unittest.TestCase):
    def test_greedy_selection_is_deterministic(self):
        layout = _synthetic_layout()
        rule = load_rule(RULE_FILE)
        candidates = generate_candidates(layout)
        params = PlanParams(radius_m=rule.radius_m, k=rule.min_beacons_per_cell, max_beacons=30)
        first = plan_beacons(layout, rule, params, candidates)
        second = plan_beacons(layout, rule, params, candidates)
        self.assertEqual(first.beacons, second.beacons)
        self.assertEqual(first.reached, second.reached)

    def test_unreachable_target_reports_not_reached_with_at_most_max_beacons(self):
        layout = load_layout(DEMO)
        rule = load_rule(RULE_FILE)
        candidates = generate_candidates(layout)
        result = plan_beacons(layout, rule, PlanParams(radius_m=8.0, k=3, max_beacons=4), candidates)
        self.assertFalse(result.reached)
        self.assertLessEqual(len(result.beacons), 4)
        self.assertLess(result.ok_share, 0.95)

    def _all_candidates_share(self, **options):
        layout = load_layout(DEMO)
        rule = load_rule(RULE_FILE)
        candidates = generate_candidates(layout, **options)
        universe = build_universe(layout)
        cover = build_cover(universe, candidates, rule.radius_m)
        state = CoverageState(universe, cover, rule.min_beacons_per_cell, 2.5)
        for cid in range(len(candidates)):
            state.add(cid)
        return len(candidates), state.ok_share_ios()

    def test_demo_without_entrance_edge_cannot_reach_the_target(self):
        # Finding: with the entrance border excluded, even all admissible candidates give 84.5 %.
        count, share = self._all_candidates_share(entrance_edge=False, allow_checkout=False)
        self.assertEqual(count, 242)
        self.assertLess(share, 0.95)
        self.assertAlmostEqual(share, 0.845, places=3)

    def test_demo_without_checkout_tops_cannot_reach_the_target(self):
        # Finding: entrance border admissible, checkout tops excluded: all 252 candidates give 90.4 %.
        count, share = self._all_candidates_share(allow_checkout=False)
        self.assertEqual(count, 252)
        self.assertLess(share, 0.95)
        self.assertAlmostEqual(share, 0.904, places=3)

    def test_demo_default_candidates_reach_the_target(self):
        count, share = self._all_candidates_share()
        self.assertEqual(count, 262)
        self.assertGreaterEqual(share, 0.95)


class CliTests(unittest.TestCase):
    def test_test_room_reaches_target_and_writes_all_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(ROOM, "--out", tmp)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("Ziel erreicht", result.stdout)
            for name in ("beacons-plan.csv", "coverage.svg", "layout-with-beacons.json"):
                self.assertTrue(os.path.isfile(os.path.join(tmp, name)), name)

    def test_csv_header_line_endings_and_two_decimals(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(_run(ROOM, "--out", tmp).returncode, 0)
            with open(os.path.join(tmp, "beacons-plan.csv"), "rb") as handle:
                raw = handle.read()
            self.assertNotIn(b"\r", raw)
            lines = raw.decode("utf-8").split("\n")
            self.assertEqual(lines[0], "minor,x_m,y_m,mount,notes")
            rows = list(csv.reader(lines[1:-1]))
            self.assertTrue(rows)
            # Testraum has beacon minors 1-4, so the plan continues at 5 (same numbering as the patch).
            self.assertEqual([row[0] for row in rows], [str(i) for i in range(5, 5 + len(rows))])
            for row in rows:
                self.assertRegex(row[1], r"^\d+\.\d{2}$")
                self.assertRegex(row[2], r"^\d+\.\d{2}$")

    def test_two_runs_produce_byte_identical_outputs(self):
        with tempfile.TemporaryDirectory() as tmp:
            first = os.path.join(tmp, "a")
            second = os.path.join(tmp, "b")
            self.assertEqual(_run(ROOM, "--out", first).returncode, 0)
            self.assertEqual(_run(ROOM, "--out", second).returncode, 0)
            for name in ("beacons-plan.csv", "coverage.svg", "layout-with-beacons.json"):
                self.assertTrue(filecmp.cmp(os.path.join(first, name), os.path.join(second, name), shallow=False),
                                name)

    def test_svg_is_well_formed_xml(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(_run(ROOM, "--out", tmp).returncode, 0)
            root = ET.parse(os.path.join(tmp, "coverage.svg")).getroot()
            self.assertTrue(root.tag.endswith("svg"))
            texts = [node.text for node in root.iter() if node.tag.endswith("text")]
            self.assertIn("5 m", texts)
            self.assertIn("Beacons im Radius", texts)

    def test_layout_patch_keeps_input_and_adds_beacons_after_existing_minors(self):
        with tempfile.TemporaryDirectory() as tmp:
            input_copy = os.path.join(tmp, "input.json")
            with open(ROOM, "rb") as source, open(input_copy, "wb") as target:
                target.write(source.read())
            before = _read_bytes(input_copy)
            out = os.path.join(tmp, "out")
            self.assertEqual(_run(input_copy, "--out", out).returncode, 0)
            self.assertEqual(_read_bytes(input_copy), before)

            with open(os.path.join(out, "layout-with-beacons.json"), encoding="utf-8") as handle:
                patched = json.load(handle)
            original = json.loads(before.decode("utf-8"))
            new = [e for e in patched["elements"] if e not in original["elements"]]
            self.assertEqual(len(new), 3)
            self.assertTrue(all(e["type"] == "beacon" for e in new))
            self.assertEqual([e["beaconMinor"] for e in new], [5, 6, 7])
            self.assertEqual(len({e["id"] for e in patched["elements"]}), len(patched["elements"]))
            self.assertEqual(new[0]["beaconUUID"], "00000000-0000-0000-0000-000000000000")
            self.assertEqual(new[0]["beaconId"], "Indooro5")

    def test_csv_and_patch_share_one_numbering_and_positions(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(_run(ROOM, "--out", tmp).returncode, 0)
            with open(os.path.join(tmp, "beacons-plan.csv"), encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
            with open(os.path.join(tmp, "layout-with-beacons.json"), encoding="utf-8") as handle:
                patched = json.load(handle)
            original_ids = {e["id"] for e in json.loads(_read_bytes(ROOM).decode("utf-8"))["elements"]}
            new = [e for e in patched["elements"] if e["id"] not in original_ids]
            self.assertEqual(sorted(int(r["minor"]) for r in rows), sorted(e["beaconMinor"] for e in new))
            by_minor = {e["beaconMinor"]: e for e in new}
            for row in rows:
                element = by_minor[int(row["minor"])]
                self.assertEqual(f"{element['x']:.2f}", row["x_m"])
                self.assertEqual(f"{element['y']:.2f}", row["y_m"])
                self.assertEqual(element["beaconId"], f"Indooro{row['minor']}")

    def test_layout_without_beacons_starts_numbering_at_one(self):
        layout = {"gridSize": {"width": 20, "height": 20}, "elements": [
            {"id": 1, "type": "entrance", "x": 0, "y": 0, "width": 2, "height": 1},
            {"id": 2, "type": "shelf", "x": 4, "y": 4, "width": 8, "height": 1, "category": "520/1", "label": "Milch"},
        ]}
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "plain.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(layout, handle)
            out = os.path.join(tmp, "out")
            result = _run(path, "--out", out)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            with open(os.path.join(out, "beacons-plan.csv"), encoding="utf-8") as handle:
                minors = [int(r["minor"]) for r in csv.DictReader(handle)]
            self.assertEqual(minors, list(range(1, len(minors) + 1)))

    def test_unreachable_target_exits_two_and_still_writes_files(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(DEMO, "--max-beacons", "4", "--out", tmp)
            self.assertEqual(result.returncode, 2, result.stderr + result.stdout)
            self.assertIn("NICHT erreicht", result.stdout)
            self.assertTrue(os.path.isfile(os.path.join(tmp, "beacons-plan.csv")))

    def test_missing_layout_exits_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(os.path.join(tmp, "missing.json"), "--out", tmp)
            self.assertEqual(result.returncode, 1)

    def test_layout_without_grid_size_exits_one(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "layout.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"elements": []}, handle)
            self.assertEqual(_run(path, "--out", os.path.join(tmp, "out")).returncode, 1)

    def test_broken_rule_file_exits_three(self):
        with tempfile.TemporaryDirectory() as tmp:
            rule_path = os.path.join(tmp, "rule.json")
            with open(rule_path, "w", encoding="utf-8") as handle:
                json.dump({"radiusMeters": 99.0}, handle)
            result = _run(ROOM, "--rule", rule_path, "--out", tmp)
            self.assertEqual(result.returncode, 3, result.stderr)

    def test_argument_errors_exit_one_not_two(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(ROOM, "--k", "0", "--out", tmp)
            self.assertEqual(result.returncode, 1)
            result = _run(ROOM, "--bogus-option", "--out", tmp)
            self.assertEqual(result.returncode, 1)

    def test_input_file_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "layout-with-beacons.json")
            with open(ROOM, "rb") as source, open(path, "wb") as target:
                target.write(source.read())
            before = _read_bytes(path)
            self.assertEqual(_run(path, "--out", tmp).returncode, 1)
            self.assertEqual(_read_bytes(path), before)


def _summary(stdout, label):
    for line in stdout.splitlines():
        if line.startswith(label):
            return line
    raise AssertionError(f"'{label}' not in output:\n{stdout}")


class DemoRunTests(unittest.TestCase):
    """Demo supermarket under the current defaults. Figures are pinned so rule changes show up here.

    Defaults (R 8, k 3, HDOP 2.5, target 0.95, max 200; entrance border and checkout tops admissible):
      default: 262 candidates, reached with 73 beacons, 95.0 %, readiness OK
      --no-checkout: 252 candidates, not reached (cap 200), 90.4 %, readiness WARN
      --no-checkout --no-entrance-edge: 242 candidates, not reached (cap 200), 84.5 %, readiness WARN
    """

    def test_demo_defaults_reach_target_with_readiness_ok(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(DEMO, "--out", tmp)
            self.assertEqual(result.returncode, 0, result.stderr + result.stdout)
            self.assertIn("Kandidaten: 262", result.stdout)
            self.assertIn("Ziel erreicht", result.stdout)
            self.assertIn("Readiness-Pruefung", result.stdout)
            self.assertIn("OK (", result.stdout)
            beacons = int(_summary(result.stdout, "Beacons:").split(":")[1])
            self.assertEqual(beacons, 73)
            share = float(_summary(result.stdout, "Abdeckung:").split(":")[1].split("%")[0])
            self.assertGreaterEqual(share, 95.0)

    def test_demo_no_checkout_does_not_reach_the_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(DEMO, "--no-checkout", "--out", tmp)
            self.assertEqual(result.returncode, 2, result.stderr + result.stdout)
            self.assertIn("Kandidaten: 252", result.stdout)
            self.assertIn("90.4 %", result.stdout)
            self.assertIn("Ziel NICHT erreicht", result.stdout)
            self.assertIn("WARN", result.stdout)

    def test_demo_no_checkout_no_entrance_edge_does_not_reach_the_target(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = _run(DEMO, "--no-checkout", "--no-entrance-edge", "--out", tmp)
            self.assertEqual(result.returncode, 2, result.stderr + result.stdout)
            self.assertIn("Kandidaten: 242", result.stdout)
            self.assertIn("84.5 %", result.stdout)
            self.assertIn("Ziel NICHT erreicht", result.stdout)

    def test_default_never_needs_more_beacons_than_no_checkout_run(self):
        # The no-checkout run stops at the cap (200) without reaching the target.
        with tempfile.TemporaryDirectory() as tmp:
            default = _run(DEMO, "--out", os.path.join(tmp, "a"))
            restricted = _run(DEMO, "--no-checkout", "--out", os.path.join(tmp, "b"))
            default_count = int(_summary(default.stdout, "Beacons:").split(":")[1])
            restricted_count = int(_summary(restricted.stdout, "Beacons:").split(":")[1])
            self.assertLessEqual(default_count, restricted_count)


class CompareGridTests(unittest.TestCase):
    GRID = os.path.join(HERE, "compare_grid.py")

    def _grid(self, layout, *extra):
        return subprocess.run([sys.executable, "-I", self.GRID, layout, *extra],
                              capture_output=True, text=True, timeout=120)

    def test_grid_on_demo_is_deterministic_and_places_forty_beacons(self):
        first = self._grid(DEMO)
        second = self._grid(DEMO)
        self.assertEqual(first.returncode, 0, first.stderr)
        self.assertEqual(first.stdout, second.stdout)
        self.assertIn("Beacons: 40", first.stdout)
        self.assertIn("Readiness-Pruefung:", first.stdout)

    def test_grid_positions_follow_the_swift_injection(self):
        import compare_grid
        positions = compare_grid.grid_positions(40, 60, 8.0)
        self.assertEqual(len(positions), 40)
        self.assertEqual(positions[0], (4.0, 4.0))
        self.assertEqual(positions[-1], (36.0, 59.5))  # y clamped to height - 0.5, as in TestLayouts.swift

    def test_grid_on_test_room_places_one_beacon(self):
        result = self._grid(ROOM)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Beacons: 1", result.stdout)

    def test_grid_rejects_non_positive_cell(self):
        self.assertEqual(self._grid(DEMO, "--cell", "0").returncode, 1)


if __name__ == "__main__":
    unittest.main()

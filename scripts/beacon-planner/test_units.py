"""Unit tests: rule loading, layout rules, candidates, HDOP and the readiness mirror."""
import contextlib
import io
import json
import math
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import export_vectors  # noqa: E402
from candidates import MOUNT_CHECKOUT_TOP, MOUNT_SHELF_TOP, MOUNT_WALL, generate_candidates  # noqa: E402
from coverage import hdop, readiness_report  # noqa: E402
from layout import (  # noqa: E402
    LayoutError,
    load_layout,
    parse_layout,
    readiness_blocked_cells,
    readiness_walkable_cells,
    ios_blocked_cells,
    walkable_cells,
)
from rule import DEFAULT_RULE_PATH, CoverageRule, RuleError, load_rule, parse_rule  # noqa: E402

UUID_HEX = "0f0e0d0c0b0a09080706050403020100"


def _layout(width, height, *elements):
    return parse_layout({"gridSize": {"width": width, "height": height}, "elements": list(elements)})


def _element(kind, x, y, width=1, height=1, **extra):
    node = {"type": kind, "x": x, "y": y, "width": width, "height": height, "id": extra.pop("id", 1)}
    node.update(extra)
    return node


def _beacon(x, y, minor=1):
    return {"type": "beacon", "id": 100 + minor, "x": x, "y": y, "beaconMinor": minor,
            "beaconUUID": "00000000-0000-0000-0000-000000000000", "beaconMajor": 1}


_RULE = CoverageRule(radius_m=8.0, min_radius_m=0.5, max_radius_m=30.0,
                     min_beacons_per_cell=3, max_low_coverage_share=0.05)


class RuleTests(unittest.TestCase):
    def test_shared_rule_file_has_expected_defaults(self):
        self.assertTrue(os.path.isfile(DEFAULT_RULE_PATH), DEFAULT_RULE_PATH)
        rule = load_rule()
        self.assertEqual(rule.radius_m, 8.0)
        self.assertEqual(rule.min_beacons_per_cell, 3)
        self.assertEqual(rule.max_low_coverage_share, 0.05)
        self.assertEqual(rule.min_radius_m, 0.5)
        self.assertEqual(rule.max_radius_m, 30.0)

    def _doc(self, **overrides):
        document = {"radiusMeters": 8.0, "minRadiusMeters": 0.5, "maxRadiusMeters": 30.0,
                    "minBeaconsPerCell": 3, "maxLowCoverageShare": 0.05}
        document.update(overrides)
        return document

    def test_invalid_values_are_rejected(self):
        bad = [
            self._doc(radiusMeters=40.0),
            self._doc(radiusMeters=0.1),
            self._doc(minRadiusMeters=0.0),
            self._doc(minRadiusMeters=31.0),
            self._doc(minBeaconsPerCell=0),
            self._doc(minBeaconsPerCell=2.5),
            self._doc(maxLowCoverageShare=1.5),
            self._doc(maxLowCoverageShare=-0.1),
        ]
        for document in bad:
            with self.subTest(document=document):
                with self.assertRaises(RuleError):
                    parse_rule(document)

    def test_missing_field_and_wrong_type_are_rejected(self):
        document = self._doc()
        del document["radiusMeters"]
        with self.assertRaises(RuleError):
            parse_rule(document)
        with self.assertRaises(RuleError):
            parse_rule(self._doc(radiusMeters="8"))
        with self.assertRaises(RuleError):
            parse_rule(self._doc(minBeaconsPerCell=True))
        with self.assertRaises(RuleError):
            parse_rule([1, 2, 3])

    def test_broken_files_raise_rule_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            broken = os.path.join(tmp, "broken.json")
            with open(broken, "w", encoding="utf-8") as handle:
                handle.write("{not json")
            with self.assertRaises(RuleError):
                load_rule(broken)
            with self.assertRaises(RuleError):
                load_rule(os.path.join(tmp, "missing.json"))


class LayoutRuleTests(unittest.TestCase):
    def test_axis_aligned_shelf_blocks_its_cells_and_beacon_entrance_do_not(self):
        layout = _layout(6, 6,
                         _element("shelf", 2, 2, 2, 1),
                         _element("entrance", 0, 5, 1, 1),
                         _beacon(4.0, 4.0))
        blocked = ios_blocked_cells(layout)
        self.assertEqual(blocked, {(2, 2), (3, 2)})
        self.assertNotIn((0, 5), blocked)
        self.assertNotIn((4, 4), blocked)
        self.assertEqual(len(walkable_cells(layout)), 36 - 2)

    def test_anchor_type_does_not_block_on_ios_but_blocks_in_readiness(self):
        layout = _layout(4, 4, _element("anchor", 1, 1, 1, 1, id=5))
        self.assertNotIn((1, 1), ios_blocked_cells(layout))
        self.assertIn((1, 1), readiness_blocked_cells(layout))

    def test_rotated_shelf_blocks_only_cells_with_real_area(self):
        # 1 m wide, 4 m long, rotated by 90 degrees: a vertical strip x in [3.5, 4.5], y in [0.5, 4.5].
        layout = _layout(8, 8, _element("shelf", 2, 2, 4, 1, rotation=90))
        blocked = ios_blocked_cells(layout)
        expected = {(i, j) for i in (3, 4) for j in range(0, 5)}
        self.assertEqual(blocked, expected)

    def test_rotated_shelf_at_45_degrees_is_narrower_than_its_bounding_box(self):
        layout = _layout(12, 12, _element("shelf", 4, 4, 4, 1, rotation=45))
        ios = ios_blocked_cells(layout)
        readiness = readiness_blocked_cells(layout)
        self.assertGreater(len(ios), 0)
        self.assertLess(len(ios), len(readiness))
        self.assertTrue(ios <= readiness)
        # Cell (6, 2) lies inside the bounding box of the rotated bar but not inside the bar itself.
        self.assertIn((6, 2), readiness)
        self.assertNotIn((6, 2), ios)

    def test_readiness_walkable_is_complement_of_its_blocked_set(self):
        layout = _layout(5, 5, _element("counter", 0, 0, 2, 2))
        walk = readiness_walkable_cells(layout)
        blocked = readiness_blocked_cells(layout)
        self.assertEqual(walk | blocked, {(i, j) for i in range(5) for j in range(5)})
        self.assertFalse(walk & blocked)

    def test_invalid_layout_files_raise_layout_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "layout.json")
            with self.assertRaises(LayoutError):
                load_layout(os.path.join(tmp, "missing.json"))
            with open(path, "w", encoding="utf-8") as handle:
                handle.write("{broken")
            with self.assertRaises(LayoutError):
                load_layout(path)
            with open(path, "w", encoding="utf-8") as handle:
                json.dump({"elements": []}, handle)
            with self.assertRaises(LayoutError):
                load_layout(path)


class CandidateTests(unittest.TestCase):
    def test_shelf_points_are_about_two_metres_apart_on_the_long_axis(self):
        layout = _layout(20, 20, _element("shelf", 2, 5, 10, 1, category="530/1", label="Kaese"))
        candidates = [c for c in generate_candidates(layout) if c.mount == MOUNT_SHELF_TOP]
        self.assertEqual([round(c.x, 2) for c in candidates], [3.0, 5.0, 7.0, 9.0, 11.0])
        self.assertTrue(all(abs(c.y - 5.5) < 1e-9 for c in candidates))

    def test_entrance_interior_is_excluded_but_its_border_is_admissible_by_default(self):
        layout = _layout(20, 20,
                         _element("entrance", 0, 0, 20, 1),
                         _element("shelf", 2, 5, 10, 1, category="530/1", label="Kaese"))
        candidates = generate_candidates(layout)
        for candidate in candidates:
            self.assertFalse(0 < candidate.x < 20 and 0 < candidate.y < 1, candidate)
        # Grid-edge points on the entrance border (y = 0, x between 0 and 20) stay admissible.
        self.assertTrue(any(c.y == 0.0 and 0 < c.x < 20 for c in candidates))
        strict = generate_candidates(layout, entrance_edge=False)
        self.assertFalse(any(0 <= c.x <= 20 and 0 <= c.y <= 1 for c in strict))

    def test_checkout_points_are_excluded_when_checkout_tops_are_off(self):
        layout = _layout(20, 20,
                         _element("shelf", 2, 5, 10, 1, category="530/1", label="Kaese"),
                         _element("checkout", 2, 4, 4, 2, label="Kasse"))
        candidates = generate_candidates(layout, allow_checkout=False)
        for candidate in candidates:
            self.assertFalse(2 <= candidate.x <= 6 and 4 <= candidate.y <= 6, candidate)
        self.assertFalse(any(c.mount == MOUNT_CHECKOUT_TOP for c in candidates))

    def test_checkout_tops_are_candidates_by_default(self):
        layout = _layout(20, 20,
                         _element("checkout", 2, 4, 6, 2, label="Kasse"))
        candidates = generate_candidates(layout)
        tops = [c for c in candidates if c.mount == MOUNT_CHECKOUT_TOP]
        self.assertTrue(tops)
        self.assertTrue(all(abs(c.y - 5.0) < 1e-9 for c in tops))
        self.assertTrue(all(c.notes.startswith("Kasse") for c in tops))

    def test_keyword_excludes_element_candidates_case_insensitive(self):
        layout = _layout(20, 20,
                         _element("shelf", 2, 5, 10, 1, category="530/1", label="TIEFKUEHLPRODUKTE", id=7),
                         _element("shelf", 2, 12, 10, 1, category="520/1", label="Milch", id=8))
        shelf_points = [c for c in generate_candidates(layout) if c.mount == MOUNT_SHELF_TOP]
        self.assertTrue(shelf_points)
        self.assertTrue(all(abs(c.y - 12.5) < 1e-9 for c in shelf_points))

    def test_keywords_argument_is_used_as_given(self):
        layout = _layout(20, 20, _element("shelf", 2, 5, 10, 1, category="530/1", label="Gefrier"))
        # Default list does not know "gefrier", so the shelf keeps its candidates.
        self.assertTrue([c for c in generate_candidates(layout) if c.mount == MOUNT_SHELF_TOP])
        # Passing the keyword explicitly excludes the shelf.
        self.assertFalse([c for c in generate_candidates(layout, keywords=["gefrier"])
                          if c.mount == MOUNT_SHELF_TOP])

    def test_grid_edge_points_are_wall_candidates_and_deterministic(self):
        layout = _layout(10, 6)
        first = generate_candidates(layout)
        second = generate_candidates(layout)
        self.assertEqual(first, second)
        self.assertTrue(all(c.mount == MOUNT_WALL for c in first))
        self.assertTrue(all(c.x in (0.0, 10.0) or c.y in (0.0, 6.0) for c in first))
        ids = [c.id for c in first]
        self.assertEqual(ids, list(range(len(first))))

    def test_points_closer_than_a_quarter_metre_are_merged(self):
        layout = _layout(10, 10, _element("wall", 0, 0, 10, 1, id=3),
                         _element("wall", 0, 0.1, 10, 1, id=4))
        candidates = generate_candidates(layout)
        for a in candidates:
            for b in candidates:
                if a.id != b.id:
                    self.assertGreaterEqual(math.hypot(a.x - b.x, a.y - b.y), 0.25)


class ShelfPenaltyTests(unittest.TestCase):
    def test_blocked_run_on_the_line_of_sight_shrinks_reach(self):
        from coverage import build_cover, build_universe
        from candidates import Candidate
        from layout import ios_blocked_cells

        layout = _layout(12, 4, _element("shelf", 6, 0, 1, 4, id=9))
        universe = build_universe(layout)
        beacon = [Candidate(0, 2.5, 2.0, MOUNT_SHELF_TOP, "test")]
        plain = build_cover(universe, beacon, 8.0)[0]
        penalised = build_cover(universe, beacon, 8.0, ios_blocked_cells(layout), 2.0)[0]
        self.assertLess(len(penalised), len(plain))
        # Cells on the beacon's own side are not affected by the shelf.
        own_side = {(i, j) for (i, j) in universe.cells if i < 6}
        plain_own = {universe.cells[pos] for pos, _, _ in plain if universe.cells[pos] in own_side}
        penalised_own = {universe.cells[pos] for pos, _, _ in penalised if universe.cells[pos] in own_side}
        self.assertEqual(plain_own, penalised_own)


class HdopTests(unittest.TestCase):
    def test_collinear_beacons_give_infinite_hdop(self):
        self.assertEqual(hdop((0.5, 0.5), [(5.0, 0.5), (10.0, 0.5), (15.0, 0.5)]), math.inf)
        self.assertEqual(hdop((0.5, 0.5), [(5.0, 0.5), (-4.0, 0.5)]), math.inf)

    def test_spread_beacons_give_small_hdop(self):
        spread = [(5.0, 0.5), (0.5, 5.0), (-4.0, 0.5), (0.5, -4.0)]
        self.assertAlmostEqual(hdop((0.5, 0.5), spread), 1.0, places=9)
        triangle = [(0.5 + 5 * math.cos(a), 0.5 + 5 * math.sin(a)) for a in (0.0, 2.0944, 4.1888)]
        value = hdop((0.5, 0.5), triangle)
        self.assertLess(value, 2.5)
        self.assertAlmostEqual(value, math.sqrt(4 / 3), places=3)

    def test_too_few_beacons_are_infinite(self):
        self.assertEqual(hdop((0.5, 0.5), []), math.inf)
        self.assertEqual(hdop((0.5, 0.5), [(5.0, 5.0)]), math.inf)


class ReadinessMirrorTests(unittest.TestCase):
    """Numbers taken from backend StoreReadinessEvaluatorTest (20 x 20 room, entrance at 0,0)."""

    def _walk_layout(self, beacons):
        return _layout(20, 20, _element("entrance", 0, 0, 1, 1), *beacons)

    def _beacon_list(self, points):
        return [_beacon(x, y, minor=index + 1) for index, (x, y) in enumerate(points)]

    def test_four_corner_beacons_leave_all_cells_uncovered_at_radius_eight(self):
        layout = self._walk_layout(self._beacon_list([(0, 0), (20, 0), (0, 20), (20, 20)]))
        report = readiness_report(layout, [(0, 0), (20, 0), (0, 20), (20, 20)], _RULE)
        self.assertEqual(report["walkable"], 400)
        self.assertEqual(report["low_coverage"], 400)
        self.assertFalse(report["ok"])

    def test_nine_beacons_three_by_three_warn_at_radius_eight_with_136_low_cells(self):
        axis = (10.0 / 3, 10.0, 50.0 / 3)
        points = [(x, y) for x in axis for y in axis]
        report = readiness_report(self._walk_layout([]), points, _RULE, radius=8.0)
        self.assertEqual(report["walkable"], 400)
        self.assertEqual(report["low_coverage"], 136)
        self.assertFalse(report["ok"])

    def test_nine_beacons_three_by_three_pass_at_radius_ten_with_8_low_cells(self):
        axis = (10.0 / 3, 10.0, 50.0 / 3)
        points = [(x, y) for x in axis for y in axis]
        report = readiness_report(self._walk_layout([]), points, _RULE, radius=10.0)
        self.assertEqual(report["low_coverage"], 8)
        self.assertTrue(report["ok"])

    def test_sixteen_beacons_at_five_metre_spacing_pass_at_default_radius(self):
        axis = (2.5, 7.5, 12.5, 17.5)
        points = [(x, y) for x in axis for y in axis]
        report = readiness_report(self._walk_layout([]), points, _RULE)
        self.assertEqual(report["low_coverage"], 0)
        self.assertTrue(report["ok"])

    def test_empty_walkable_area_is_ok(self):
        layout = _layout(2, 2, _element("counter", 0, 0, 2, 2))
        report = readiness_report(layout, [], _RULE)
        self.assertEqual(report["walkable"], 0)
        self.assertTrue(report["ok"])


class SharedVectorTests(unittest.TestCase):
    """fixtures/vectors.json is read by admin-ui/src/editor/coverage.test.ts; it must match the generator."""

    def test_checked_in_vectors_match_the_generator(self):
        checked_in = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "vectors.json")
        with open(checked_in, encoding="utf-8", newline="") as handle:
            stored = handle.read()
        with tempfile.TemporaryDirectory() as tmp:
            regenerated = os.path.join(tmp, "vectors.json")
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(export_vectors.main([regenerated]), 0)
            with open(regenerated, encoding="utf-8", newline="") as handle:
                fresh = handle.read()
        self.assertEqual(fresh, stored, "fixtures/vectors.json ist veraltet: python3 -I scripts/beacon-planner/export_vectors.py")

    def test_vectors_have_the_expected_shape(self):
        vectors = export_vectors.build_vectors()
        self.assertGreaterEqual(len(vectors), 6)
        self.assertLessEqual(len(vectors), 10)
        for vector in vectors:
            with self.subTest(vector=vector["name"]):
                expected = vector["expected"]
                self.assertEqual(len(expected["counts"]), vector["layout"]["gridSize"]["height"])
                self.assertTrue(all(len(row) == vector["layout"]["gridSize"]["width"] for row in expected["counts"]))
                self.assertEqual(sum(1 for row in expected["counts"] for c in row if c is not None),
                                 expected["walkableCells"])


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Exports shared coverage test vectors for the TypeScript port (admin-ui/src/editor/coverage.ts).

Usage: python -I scripts/beacon-planner/export_vectors.py [output.json]

Default output: scripts/beacon-planner/fixtures/vectors.json. The expected values are produced only
by the planner's own functions: readiness walkable cells (layout.readiness_walkable_cells), the
coverage cover (coverage.build_cover) and the readiness mirror (coverage.readiness_report, used as a
cross-check of the low-coverage count).

Cell convention: cell (i, j) has its centre at (i + 0.5, j + 0.5); counts[j][i] is the number of beacons
within the radius (centre distance squared <= radius squared) for cell x = i, y = j. Blocked cells are null.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I does not add the script directory

import argparse  # noqa: E402
import dataclasses  # noqa: E402
import json  # noqa: E402

from candidates import Candidate  # noqa: E402
from coverage import build_cover, build_universe, readiness_report  # noqa: E402
from layout import Layout, parse_layout, readiness_walkable_cells  # noqa: E402
from rule import load_rule  # noqa: E402

DEFAULT_OUTPUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "vectors.json")
FLOAT_DIGITS = 6


def _shelf(element_id, x, y, width, height, **extra):
    node = {"id": element_id, "type": "shelf", "x": x, "y": y, "width": width, "height": height,
            "category": "310/1", "meter": 1, "label": f"Regal {element_id}"}
    node.update(extra)
    return node


def _beacon(element_id, x, y):
    return {"id": element_id, "type": "beacon", "x": x, "y": y, "label": f"Beacon {element_id}"}


def _layout(width, height, *elements):
    return {"gridSize": {"width": width, "height": height}, "elements": list(elements)}


def _vector_definitions():
    """Synthetic layouts. Keep them small; the expected values are computed, not typed in."""
    return [
        {"name": "leer-10x10", "layout": _layout(10, 10), "radius": 8.0, "minBeacons": 3},
        {"name": "regalreihe-mit-beacons", "radius": 5.0, "minBeacons": 2, "layout": _layout(
            20, 10,
            _shelf(1, 2, 2, 4, 1, label="Obst"),
            _shelf(2, 8, 2, 4, 1),
            _shelf(3, 14, 2, 4, 1),
            _beacon(10, 4, 4), _beacon(11, 10, 4), _beacon(12, 16, 4))},
        {"name": "gedrehtes-regal", "radius": 6.0, "minBeacons": 2, "layout": _layout(
            12, 12,
            _shelf(1, 3, 3, 6, 1, rotation=30),
            _beacon(10, 2, 8), _beacon(11, 9, 9))},
        {"name": "wand", "radius": 5.0, "minBeacons": 1, "layout": _layout(
            12, 8,
            {"id": 1, "type": "wall", "x": 0, "y": 0, "width": 12, "height": 1},
            {"id": 2, "type": "wall", "x": 0, "y": 0, "width": 1, "height": 8},
            _beacon(10, 6, 4))},
        {"name": "kasse", "radius": 8.0, "minBeacons": 3, "layout": _layout(
            14, 10,
            {"id": 1, "type": "checkout", "x": 5, "y": 4, "width": 4, "height": 2, "label": "Kasse"},
            _beacon(10, 2.5, 2.5), _beacon(11, 11.5, 7.5), _beacon(12, 2.5, 7.5), _beacon(13, 11.5, 2.5))},
        {"name": "eingang-und-anker", "radius": 3.0, "minBeacons": 3, "layout": _layout(
            10, 12,
            {"id": 1, "type": "entrance", "x": 4, "y": 0, "width": 3, "height": 1, "label": "Eingang"},
            {"id": 2, "type": "anchor", "x": 0, "y": 6, "width": 1, "height": 1, "anchorId": "A-1"},
            _beacon(10, 5, 6), _beacon(11, 2, 3), _beacon(12, 8, 3))},
        {"name": "ohne-beacons", "radius": 8.0, "minBeacons": 3, "layout": _layout(
            15, 9,
            _shelf(1, 1, 1, 5, 2, category="520/1"),
            {"id": 2, "type": "counter", "x": 9, "y": 6, "width": 4, "height": 2})},
        {"name": "platzierte-beacons", "radius": 8.0, "minBeacons": 3, "layout": _layout(
            30, 20,
            {"id": 1, "type": "entrance", "x": 12, "y": 0, "width": 4, "height": 1, "label": "Haupteingang"},
            _shelf(2, 3, 4, 10, 1, category="310/1"),
            _shelf(3, 17, 4, 10, 1, category="320/1"),
            _shelf(4, 3, 12, 1, 6, category="330/1"),
            _beacon(10, 5, 2), _beacon(11, 15, 7), _beacon(12, 25, 14),
            _beacon(13, 31, 21), _beacon(14, 10, 17), _beacon(15, 20, 2),
            _beacon(16, 27, 8), _beacon(17, 7, 9))},
        {"name": "grenzfall-radius", "radius": 2.0, "minBeacons": 1, "layout": _layout(
            6, 6, _beacon(10, 2.5, 2.5))},
        {"name": "minimalradius", "radius": 0.5, "minBeacons": 1, "layout": _layout(
            6, 6, _beacon(10, 2.5, 2.5))},
    ]


def _expected(layout_document, radius, min_beacons):
    """Expected values from the planner functions only."""
    layout: Layout = parse_layout(layout_document)
    walkable = readiness_walkable_cells(layout)
    universe = build_universe(layout)

    beacon_points = [(e.x, e.y) for e in layout.elements if e.type == "beacon" and e.has_position]
    candidates = [Candidate(id=index, x=x, y=y, mount="beacon", notes="")
                  for index, (x, y) in enumerate(beacon_points)]
    tally = [0] * len(universe.cells)
    for entries in build_cover(universe, candidates, radius):
        for position, _, _ in entries:
            tally[position] += 1
    count_of = {cell: tally[position] for position, cell in enumerate(universe.cells)}

    counts = []
    for j in range(layout.height):
        row = []
        for i in range(layout.width):
            row.append(count_of.get((i, j), 0) if (i, j) in walkable else None)
        counts.append(row)

    total = len(walkable)
    covered = sum(1 for cell in walkable if count_of.get(cell, 0) >= min_beacons)
    low = total - covered
    covered_share = covered / total if total else 1.0
    low_share = low / total if total else 0.0

    rule = dataclasses.replace(load_rule(), min_beacons_per_cell=min_beacons)
    report = readiness_report(layout, beacon_points, rule, radius=radius)
    if report["low_coverage"] != low or abs(report["low_share"] - low_share) > 1e-12:
        raise RuntimeError("Abdeckungszaehlung weicht vom Readiness-Spiegel ab (Generator fehlerhaft).")

    return {
        "walkableCells": total,
        "counts": counts,
        "coveredShare": covered_share,
        "lowCoverageShare": low_share,
    }


def _round_floats(value):
    if isinstance(value, float):
        return round(value, FLOAT_DIGITS)
    if isinstance(value, dict):
        return {key: _round_floats(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_round_floats(item) for item in value]
    return value


def build_vectors():
    vectors = []
    for definition in _vector_definitions():
        expected = _expected(definition["layout"], definition["radius"], definition["minBeacons"])
        vectors.append({
            "name": definition["name"],
            "layout": definition["layout"],
            "radius": definition["radius"],
            "minBeacons": definition["minBeacons"],
            "expected": expected,
        })
    return vectors


def render(vectors):
    """Deterministic text: sorted keys, indent 1, floats rounded to six digits, trailing newline."""
    return json.dumps(_round_floats(vectors), indent=1, sort_keys=True, ensure_ascii=False) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description="Schreibt die gemeinsamen Abdeckungs-Testvektoren.")
    parser.add_argument("output", nargs="?", default=DEFAULT_OUTPUT, help="Zieldatei (Default: fixtures/vectors.json)")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    text = render(build_vectors())
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)
    print(f"Geschrieben: {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

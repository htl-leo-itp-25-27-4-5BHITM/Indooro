#!/usr/bin/env python3
"""Evaluates the 8 x 8 m beacon grid from the synthetic iOS tests with the planner's coverage rule.

Placement mirrors swift/indooro-EinkaeuferFinal/Tests/IndooroNavigationCoreTests/TestLayouts.swift
(demoSupermarket): one beacon per spacing x spacing cell, at (cellX + s/2, cellY + s/2), clamped to
(width - 0.5, height - 0.5). Beacons are not moved, even if they sit in a blocked element.

Usage: python -I scripts/beacon-planner/compare_grid.py <layout.json> [--cell 8]
Exit codes: 0 evaluated, 1 input error, 3 coverage rule error.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I does not add the script directory

import argparse  # noqa: E402

from candidates import Candidate  # noqa: E402
from coverage import CoverageState, build_cover, build_universe, readiness_report  # noqa: E402
from layout import LayoutError, load_layout  # noqa: E402
from rule import RuleError, load_rule  # noqa: E402

DEFAULT_HDOP = 2.5
EXIT_OK = 0
EXIT_INPUT = 1
EXIT_RULE = 3


def grid_positions(width, height, spacing):
    """Beacon positions exactly as TestLayouts.demoSupermarket injects them."""
    positions = []
    cell_y = 0.0
    while cell_y < height:
        cell_x = 0.0
        while cell_x < width:
            positions.append((min(cell_x + spacing / 2, width - 0.5), min(cell_y + spacing / 2, height - 0.5)))
            cell_x += spacing
        cell_y += spacing
    return positions


def evaluate(layout, rule, spacing=8.0, hdop_limit=DEFAULT_HDOP):
    """Returns the figures printed by the tool (plain dict, testable)."""
    positions = grid_positions(layout.width, layout.height, spacing)
    beacons = [Candidate(id=index, x=x, y=y, mount="grid", notes="Raster") for index, (x, y) in enumerate(positions)]
    universe = build_universe(layout)
    cover = build_cover(universe, beacons, rule.radius_m)
    state = CoverageState(universe, cover, rule.min_beacons_per_cell, hdop_limit)
    for beacon in beacons:
        state.add(beacon.id)
    readiness = readiness_report(layout, positions, rule)
    return {
        "beacons": len(positions),
        "spacing": spacing,
        "ok_share": state.ok_share_ios(),
        "ios_walkable": state.ios_total,
        "readiness": readiness,
        "radius": rule.radius_m,
        "k": rule.min_beacons_per_cell,
        "hdop": hdop_limit,
    }


def format_report(name, figures, rule):
    readiness = figures["readiness"]
    verdict = "OK" if readiness["ok"] else "WARN"
    return "\n".join([
        f"Raster-Vergleich ({name}): Beacon je {figures['spacing']:g} m x {figures['spacing']:g} m Zelle",
        f"Beacons: {figures['beacons']}",
        f"Abdeckung (ok-Zellen, {figures['ios_walkable']} iOS-begehbar): {100 * figures['ok_share']:.1f} %"
        f" (Regel: R {rule.radius_m:.2f} m, k {rule.min_beacons_per_cell}, HDOP <= {figures['hdop']:.2f})",
        f"Readiness-Pruefung: {verdict} ({100 * readiness['low_share']:.1f} % unter k, "
        f"Grenze {100 * rule.max_low_coverage_share:.1f} %)",
    ])


def main(argv=None):
    parser = argparse.ArgumentParser(description="Raster-Beacons aus TestLayouts.swift mit der Planer-Regel bewerten.")
    parser.add_argument("layout", help="Layout-JSON")
    parser.add_argument("--cell", type=float, default=8.0, help="Rasterkante in m (Default: 8)")
    parser.add_argument("--rule", default=None, help="Pfad zur Abdeckungsregel (Default: backend-Datei)")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    if not args.cell > 0:
        sys.stderr.write("Eingabefehler: --cell muss groesser als 0 sein.\n")
        return EXIT_INPUT
    try:
        rule = load_rule(args.rule)
    except RuleError as error:
        sys.stderr.write(f"Regelfehler: {error}\n")
        return EXIT_RULE
    try:
        layout = load_layout(args.layout)
    except LayoutError as error:
        sys.stderr.write(f"Eingabefehler: {error}\n")
        return EXIT_INPUT
    figures = evaluate(layout, rule, spacing=args.cell)
    print(format_report(os.path.basename(args.layout), figures, rule))
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

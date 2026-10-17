#!/usr/bin/env python3
"""Beacon placement planner: proposes beacon positions for a layout JSON.

Usage: python -I scripts/beacon-planner/plan.py <layout.json> [options]

Exit codes: 0 target reached, 2 target not reached (files are still written),
1 input error (layout or arguments), 3 coverage rule error.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I does not add the script directory

import argparse  # noqa: E402

from candidates import DEFAULT_EXCLUDE_KEYWORDS, generate_candidates  # noqa: E402
from layout import LayoutError, load_layout, readiness_walkable_cells, walkable_cells  # noqa: E402
from outputs import (  # noqa: E402
    NumberedBeacon,
    ensure_dir,
    max_existing_minor,
    write_csv,
    write_layout_patch,
    write_svg,
)
from rule import RuleError, load_rule  # noqa: E402
from selection import PlanParams, plan_beacons  # noqa: E402

EXIT_OK = 0
EXIT_INPUT = 1
EXIT_UNREACHED = 2
EXIT_RULE = 3


class _Parser(argparse.ArgumentParser):
    """Argument errors exit with 1 so that 2 keeps meaning 'target not reached'."""

    def error(self, message):  # type: ignore[override]
        self.print_usage(sys.stderr)
        sys.stderr.write(f"Eingabefehler: {message}\n")
        sys.exit(EXIT_INPUT)


EPILOG = """Teamentscheidungen (US-31 offen, Defaults bis zur Entscheidung):
  * Randpunkte auf der Grenze des entrance-Rechtecks sind als Wandmontage zulaessig
    (Wand neben der Tuer). Nur das Innere des Eingangs bleibt ausgeschlossen.
    Abschalten mit --no-entrance-edge.
  * Kassen- und Theken-Oberkanten sind zulaessig (Montage "checkout-top"); der Default folgt
    der Spec-Szene "Demo erreicht 95 %" (Vorrang vor design.md Entscheidung 2). Ausschliessen
    mit --no-checkout.
Beacon-Minors: CSV und Layout-Patch nutzen dieselbe Nummerierung, beginnend nach dem
groessten beacon-Minor der Eingabe (ohne vorhandene Beacons ab 1).
"""


def _parse_args(argv):
    parser = _Parser(description="Beacon-Platzierungsplaner (Planungshilfe, keine Messung).",
                     epilog=EPILOG, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("layout", help="Layout-JSON mit gridSize und elements (1 Einheit = 1 m)")
    parser.add_argument("--radius", type=float, default=None,
                        help="Planungsradius in m (Default: aus der Abdeckungsregel)")
    parser.add_argument("--k", type=int, default=None,
                        help="Mindestanzahl Beacons pro Zelle (Default: aus der Regel)")
    parser.add_argument("--target", type=float, default=0.95,
                        help="Ziel-Anteil abgedeckter begehbarer Zellen (Default: 0.95)")
    parser.add_argument("--max-beacons", type=int, default=200, help="Obergrenze (Default: 200)")
    parser.add_argument("--hdop", type=float, default=2.5, help="HDOP-Grenze (Default: 2.5)")
    parser.add_argument("--rule", default=None,
                        help="Pfad zur Abdeckungsregel (Default: backend coverage-rule.json)")
    parser.add_argument("--exclude-keyword", nargs="*", default=[], metavar="KW",
                        help="Zusaetzliche Stichwoerter fuer den Ausschluss (zu den Defaults)")
    parser.add_argument("--shelf-penalty", type=float, default=0.0,
                        help="Radius-Abschlag in m je gekreuztem Regal auf der Sichtlinie (Default: 0 = aus)")
    parser.add_argument("--no-entrance-edge", action="store_true",
                        help="Randpunkte auf der Grenze des Eingangs ausschliessen (Teamentscheidung: "
                             "Default ist zulaessig als Wandmontage neben der Tuer)")
    parser.add_argument("--no-checkout", action="store_true",
                        help="Oberkanten von Kassen/Theken als Montageort ausschliessen (Montage 'checkout-top'). "
                             "Teamentscheidung US-31 offen; der Default folgt der Spec-Szene 'Demo erreicht 95 %%'")
    parser.add_argument("--out", default="./beacon-plan-out", help="Ausgabeverzeichnis")
    return parser.parse_args(argv)


def _fail(message, code):
    sys.stderr.write(message + "\n")
    return code


def _numbered(beacons, offset):
    """One numbering for CSV, SVG and layout patch: offset+1.. in (y, x) order."""
    return [NumberedBeacon(minor=offset + index + 1, x=b.x, y=b.y, mount=b.mount, notes=b.notes)
            for index, b in enumerate(beacons)]


def main(argv=None):
    args = _parse_args(sys.argv[1:] if argv is None else argv)

    try:
        rule = load_rule(args.rule)
    except RuleError as error:
        return _fail(f"Regelfehler: {error}", EXIT_RULE)

    try:
        layout = load_layout(args.layout)
    except LayoutError as error:
        return _fail(f"Eingabefehler: {error}", EXIT_INPUT)

    radius = rule.radius_m if args.radius is None else args.radius
    k = rule.min_beacons_per_cell if args.k is None else args.k
    if not radius > 0:
        return _fail("Eingabefehler: --radius muss groesser als 0 sein.", EXIT_INPUT)
    if k < 1:
        return _fail("Eingabefehler: --k muss mindestens 1 sein.", EXIT_INPUT)
    if not 0 < args.target <= 1:
        return _fail("Eingabefehler: --target muss zwischen 0 (exklusiv) und 1 liegen.", EXIT_INPUT)
    if not args.hdop > 0:
        return _fail("Eingabefehler: --hdop muss groesser als 0 sein.", EXIT_INPUT)
    if args.max_beacons < 0:
        return _fail("Eingabefehler: --max-beacons darf nicht negativ sein.", EXIT_INPUT)
    if args.shelf_penalty < 0:
        return _fail("Eingabefehler: --shelf-penalty darf nicht negativ sein.", EXIT_INPUT)

    out_dir = os.path.abspath(args.out)
    layout_abs = os.path.abspath(args.layout)
    patch_path = os.path.join(out_dir, "layout-with-beacons.json")
    if os.path.abspath(patch_path) == layout_abs:
        return _fail("Eingabefehler: Die Eingabedatei darf nicht ueberschrieben werden.", EXIT_INPUT)

    keywords = list(DEFAULT_EXCLUDE_KEYWORDS) + [kw for kw in args.exclude_keyword if kw]
    candidates = generate_candidates(layout, keywords, entrance_edge=not args.no_entrance_edge,
                                     allow_checkout=not args.no_checkout)
    params = PlanParams(radius_m=radius, k=k, hdop_limit=args.hdop, target=args.target,
                        max_beacons=args.max_beacons, shelf_penalty_m=args.shelf_penalty)
    result = plan_beacons(layout, rule, params, candidates)

    # One numbering for CSV, coverage map and layout patch: continue after the largest existing minor.
    patch_offset = max_existing_minor(layout.source)
    csv_beacons = _numbered(result.beacons, patch_offset)
    patch_beacons = csv_beacons

    ensure_dir(out_dir)
    write_csv(os.path.join(out_dir, "beacons-plan.csv"), csv_beacons)
    title = (f"Beacon-Plan: {len(csv_beacons)} Beacons, {100 * result.ok_share:.1f} % abgedeckt "
             f"(R {radius:.1f} m, k {k}, HDOP <= {args.hdop:.1f})")
    write_svg(os.path.join(out_dir, "coverage.svg"), layout, walkable_cells(layout),
              result.counts, csv_beacons, title)
    write_layout_patch(patch_path, layout, patch_beacons)

    rd = result.readiness
    print(f"Layout: {os.path.basename(args.layout)} ({layout.width} x {layout.height} m)")
    print(f"Kandidaten: {result.candidate_count}")
    print(f"Planung: Radius {radius:.2f} m, k {k}, HDOP <= {args.hdop:.2f}, Ziel {100 * args.target:.1f} %")
    print(f"Beacons: {len(csv_beacons)}")
    print(f"Abdeckung: {100 * result.ok_share:.1f} % der begehbaren Zellen (iOS)"
          f" -- {'Ziel erreicht' if result.reached else 'Ziel NICHT erreicht'}")
    print(f"Zellen unter k: {result.low_cells_ios} von {result.ios_walkable} begehbaren Zellen (iOS)")
    readiness_status = "OK" if rd["ok"] else "WARN"
    print(f"Readiness-Pruefung (Regel: Radius {rule.radius_m:.2f} m, k {rule.min_beacons_per_cell}, "
          f"max. {100 * rule.max_low_coverage_share:.1f} % unter k): {readiness_status} "
          f"({100 * rd['low_share']:.1f} % unter k)")
    if radius != rule.radius_m or k != rule.min_beacons_per_cell:
        print("Hinweis: Planung und Readiness-Pruefung verwenden unterschiedliche Werte "
              "(Readiness nutzt immer die Regel).")
    entrances = sum(1 for e in layout.elements if e.type == "entrance")
    if entrances != 1:
        print(f"Hinweis: Das Layout hat {entrances} Eingaenge; die Readiness-Pruefung verlangt genau einen.")
    if len(walkable_cells(layout)) != len(readiness_walkable_cells(layout)):
        print("Hinweis: iOS- und Readiness-Begehbarkeit unterscheiden sich (gedrehte Elemente).")
    if patch_offset:
        print(f"Hinweis: Layout enthaelt bereits Beacons bis Minor {patch_offset}; "
              f"die neuen Minors beginnen bei {patch_offset + 1} (CSV und Layout-Patch gleich).")
    print(f"Kandidatenregel: Eingangsrand {'zulaessig' if not args.no_entrance_edge else 'ausgeschlossen'}, "
          f"Kassen-Oberkanten {'ausgeschlossen' if args.no_checkout else 'zulaessig'}")
    print(f"Dateien: {os.path.join(out_dir, 'beacons-plan.csv')}, {os.path.join(out_dir, 'coverage.svg')}, "
          f"{patch_path}")
    if not result.reached:
        print(f"Ziel nicht erreicht mit maximal {args.max_beacons} Beacons.")
        return EXIT_UNREACHED
    return EXIT_OK


if __name__ == "__main__":
    sys.exit(main())

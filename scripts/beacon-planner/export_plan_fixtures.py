#!/usr/bin/env python3
"""Exports the shared plan-import fixtures for admin-ui/src/editor/planImport.ts.

Usage: python -I scripts/beacon-planner/export_plan_fixtures.py [output_dir]

Default output directory: scripts/beacon-planner/fixtures. Writes two files, both produced by the planner's
own writers (outputs.write_csv and outputs.write_layout_patch) from the same three beacons:
  beacons-plan.sample.csv   the CSV as the planner writes it
  plan-elements.sample.json the beacon elements that write_layout_patch appends to the input layout
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # -I does not add the script directory

import argparse  # noqa: E402
import json  # noqa: E402
import tempfile  # noqa: E402

from candidates import MOUNT_CHECKOUT_TOP, MOUNT_SHELF_TOP, MOUNT_WALL  # noqa: E402
from layout import parse_layout  # noqa: E402
from outputs import NumberedBeacon, write_csv, write_layout_patch  # noqa: E402

DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
CSV_NAME = "beacons-plan.sample.csv"
ELEMENTS_NAME = "plan-elements.sample.json"

# The grid is part of the contract: admin-ui/src/editor/planImport.test.ts builds its document with this size.
INPUT_LAYOUT = {
    "shopName": "Plan-Fixture",
    "gridSize": {"width": 20, "height": 10},
    "elements": [
        {"id": 1, "type": "entrance", "x": 4, "y": 0, "width": 3, "height": 1, "label": "Eingang"},
        {"id": 2, "type": "shelf", "x": 9, "y": 4, "width": 4, "height": 2, "category": "310/1", "meter": 1,
         "label": "Obst"},
    ],
}
BEACONS = (
    NumberedBeacon(minor=1, x=2.5, y=1.5, mount=MOUNT_WALL, notes="Eingang, links"),
    NumberedBeacon(minor=2, x=12.5, y=3.0, mount=MOUNT_SHELF_TOP, notes='Obst "Kuehlung"'),
    NumberedBeacon(minor=3, x=19.0, y=9.5, mount=MOUNT_CHECKOUT_TOP, notes="Kasse"),
)


def build_plan_fixtures(scratch_dir):
    """Returns (csv_text, elements_text) produced by the planner writers in scratch_dir."""
    csv_path = os.path.join(scratch_dir, "beacons-plan.csv")
    patch_path = os.path.join(scratch_dir, "layout-with-beacons.json")
    write_csv(csv_path, BEACONS)
    layout = parse_layout(INPUT_LAYOUT)
    write_layout_patch(patch_path, layout, BEACONS)
    with open(csv_path, encoding="utf-8", newline="") as handle:
        csv_text = handle.read()
    with open(patch_path, encoding="utf-8", newline="") as handle:
        patched = json.load(handle)
    appended = patched["elements"][len(INPUT_LAYOUT["elements"]):]
    elements_text = json.dumps(appended, indent=2, ensure_ascii=False) + "\n"
    return csv_text, elements_text


def main(argv=None):
    parser = argparse.ArgumentParser(description="Schreibt die gemeinsamen Plan-Import-Fixtures.")
    parser.add_argument("output_dir", nargs="?", default=DEFAULT_OUTPUT_DIR, help="Zielverzeichnis (Default: fixtures/)")
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    with tempfile.TemporaryDirectory() as scratch:
        csv_text, elements_text = build_plan_fixtures(scratch)
    os.makedirs(args.output_dir, exist_ok=True)
    for name, text in ((CSV_NAME, csv_text), (ELEMENTS_NAME, elements_text)):
        with open(os.path.join(args.output_dir, name), "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
        print(f"Geschrieben: {os.path.join(args.output_dir, name)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

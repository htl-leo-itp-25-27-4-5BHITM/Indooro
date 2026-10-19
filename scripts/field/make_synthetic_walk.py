#!/usr/bin/env python3
"""Erzeugt die SYNTHETISCHE Probe-Aufnahme fuer den Testraum-Tag (keine Messung).

Ein Raum 12 x 10 m mit 8 Regalen und 4 Beacons, eine Aufnahme mit allen drei Laeufen aus
`docs/pilot-readiness/hardware/TESTRAUM_TAG.md`: gerade Linie, Runde um die Regale, 30 s Stand an
jedem Beacon. Die Funkwerte folgen einem Log-Distanz-Modell mit festem Seed. Sie sagen nichts ueber
die Positionsqualitaet im echten Raum.

Zweck: `scripts/field/analyze_walk.sh` vor dem Termin ohne iPhone durchspielen und in Tests pruefen.
Dateien (Namen beginnen mit `synthetic-`, daran erkennt `analyze_walk.py` sie):

    swift/indooro-EinkaeuferFinal/NavigationFixtures/synthetic/synthetic-testraum-2026-10-19-1.jsonl
    swift/indooro-EinkaeuferFinal/NavigationFixtures/synthetic/layout-synthetic-testraum.json

Aufruf (Repo-Wurzel):
    python -I scripts/field/make_synthetic_walk.py [--out-dir DIR]
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

Point = Tuple[float, float]

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUT_DIR = REPO_ROOT / "swift" / "indooro-EinkaeuferFinal" / "NavigationFixtures" / "synthetic"
RECORDING_NAME = "synthetic-testraum-2026-10-19-1.jsonl"
LAYOUT_NAME = "layout-synthetic-testraum.json"

SEED = 20261019
START_TIME = 1_792_000_000.0  # fest, Aufnahmezeit ist nicht echt
SPEED_MPS = 1.2
TICK_S = 0.35
RANGING_PERIOD_S = 1.0
TX_POWER_AT_1M = -59.0
PATH_LOSS_EXPONENT = 2.2
RSSI_SIGMA_DB = 2.5
HEAR_RANGE_M = 14.0
STAND_SECONDS = 30.0

# Beacons: Name wie im Layout (`beaconId`), Major 1 = Testraum, Minor 1..4.
BEACONS: List[Tuple[str, int, Point]] = [
    ("Indooro1", 1, (2.0, 1.5)),
    ("Indooro2", 2, (10.0, 1.5)),
    ("Indooro3", 3, (2.0, 8.5)),
    ("Indooro4", 4, (10.0, 8.5)),
]
BEACON_UUID = "B5CAA23B-BB89-4040-99D2-FCED3EA4A62B"
# Regale: zwei Reihen mit je vier Regalen (x, y, Breite, Hoehe), Quergaenge von 1 m.
SHELVES: List[Tuple[int, int, int, int]] = [
    (x, y, 2, 1) for y in (3, 6) for x in (1, 4, 7, 10)
]
# Ein fremder iBeacon in der Naehe (Nachbarraum): erscheint nur als `scan`-Zeile.
FOREIGN_BEACON = (7, 99, (18.0, 5.0))


def build_layout() -> Dict[str, object]:
    elements: List[Dict[str, object]] = []
    next_id = 9_000_000_000
    for index, (x, y, width, height) in enumerate(SHELVES, start=1):
        elements.append({
            "id": next_id, "type": "shelf", "x": x, "y": y, "width": width, "height": height,
            "label": f"Regal {index}", "category": f"{500 + index}/1", "meter": 1, "color": "#2196F3",
        })
        next_id += 1
    elements.append({"id": next_id, "type": "entrance", "x": 0, "y": 8, "width": 1, "height": 2, "label": "Eingang"})
    next_id += 1
    for name, minor, (x, y) in BEACONS:
        elements.append({
            "id": next_id, "type": "beacon", "x": x, "y": y, "beaconId": name,
            "beaconUUID": BEACON_UUID, "beaconMajor": 1, "beaconMinor": minor,
        })
        next_id += 1
    return {
        "shopName": "SYNTHETISCHER Testraum (keine Messung)",
        "gridSize": {"width": 12, "height": 10},
        "elements": elements,
        "exportDate": "2026-10-19",
    }


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _walk_points(polyline: Sequence[Point], speed: float, tick: float) -> List[Tuple[Point, float]]:
    """(Punkt, zurueckgelegte Strecke) entlang der Polylinie im festen Zeitabstand; erster Punkt = Start."""
    segments = list(zip(polyline, polyline[1:]))
    total = sum(_distance(a, b) for a, b in segments)
    steps = int(math.ceil(total / (speed * tick)))
    points: List[Tuple[Point, float]] = []
    for step in range(steps + 1):
        travelled = min(total, speed * tick * step)
        remaining = travelled
        for a, b in segments:
            length = _distance(a, b)
            if remaining <= length and length > 0:
                fraction = remaining / length
                points.append(((a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction), travelled))
                break
            remaining -= length
        else:
            points.append((polyline[-1], travelled))
    return points


class Writer:
    def __init__(self) -> None:
        self.rng = random.Random(SEED)
        self.t = START_TIME
        self.next_ranging = START_TIME
        self.lines: List[Dict[str, object]] = [{"type": "layout", "t": START_TIME, "revision": 1}]

    def _measure(self, truth: Point) -> None:
        if self.t + 1e-9 < self.next_ranging:
            return
        self.next_ranging = self.t + RANGING_PERIOD_S
        for name, _minor, position in BEACONS:
            distance = max(0.3, _distance(truth, position))
            if distance > HEAR_RANGE_M:
                continue
            rssi = TX_POWER_AT_1M - 10 * PATH_LOSS_EXPONENT * math.log10(distance) + self.rng.gauss(0, RSSI_SIGMA_DB)
            accuracy = max(0.4, distance + self.rng.gauss(0, 0.4))
            self.lines.append({
                "type": "measurement", "t": round(self.t, 3), "source": "ranging", "beacon": name,
                "rssi": int(round(rssi)), "accuracy": round(accuracy, 3),
                "proximity": "immediate" if distance < 1 else ("near" if distance < 4 else "far"),
            })
        major, minor, position = FOREIGN_BEACON
        distance = _distance(truth, position)
        if distance <= HEAR_RANGE_M + 8:
            rssi = TX_POWER_AT_1M - 10 * PATH_LOSS_EXPONENT * math.log10(max(distance, 0.3)) + self.rng.gauss(0, RSSI_SIGMA_DB)
            self.lines.append({"type": "scan", "t": round(self.t, 3), "major": major, "minor": minor, "rssi": int(round(rssi))})

    def truth(self, point: Point) -> None:
        self.lines.append({"type": "truth", "t": round(self.t, 3), "x": round(point[0], 3), "y": round(point[1], 3)})

    def step(self, truth: Point) -> None:
        self._measure(truth)
        self.t += TICK_S

    def stand(self, point: Point, seconds: float) -> None:
        """Long-Press am Anfang und am Ende, dazwischen ruhig stehen (Protokoll S1)."""
        self.truth(point)
        for _ in range(int(round(seconds / TICK_S))):
            self.step(point)
        self.truth(point)

    def walk(self, polyline: Sequence[Point], mark: Sequence[int] = ()) -> None:
        """Gehen; Long-Press beim Passieren der Polylinien-Ecken mit den Indizes `mark`."""
        corner_distance = [0.0]
        for a, b in zip(polyline, polyline[1:]):
            corner_distance.append(corner_distance[-1] + _distance(a, b))
        pending = sorted(mark)
        for point, travelled in _walk_points(polyline, SPEED_MPS, TICK_S):
            while pending and travelled + 1e-9 >= corner_distance[pending[0]]:
                self.truth(polyline[pending.pop(0)])
            self.step(point)
        for index in pending:
            self.truth(polyline[index])

    def pause(self, seconds: float, point: Point) -> None:
        for _ in range(int(round(seconds / TICK_S))):
            self.step(point)


def build_recording() -> List[Dict[str, object]]:
    writer = Writer()
    # 1. Gerade Linie durch den mittleren Gang (S2 kurz).
    line = [(1.0, 5.0), (11.0, 5.0)]
    writer.stand(line[0], 5.0)
    writer.walk(line, mark=[1])
    writer.pause(3.0, line[1])
    # 2. Runde um alle Regale.
    loop = [(11.0, 5.0), (11.0, 8.5), (1.0, 8.5), (1.0, 5.0), (1.0, 1.5), (11.0, 1.5), (11.0, 5.0)]
    writer.walk(loop, mark=[1, 2, 3, 4, 5])
    writer.pause(3.0, loop[-1])
    # 3. 30 s Stand an jedem Beacon (Protokoll S1); Wege nur durch Gaenge und Quergaenge (x = 6.5).
    stand_points = [(x, y + (0.4 if y < 5 else -0.4)) for _name, _minor, (x, y) in BEACONS]
    routes = [
        [loop[-1], (6.5, 5.0), (6.5, stand_points[0][1]), stand_points[0]],
        [stand_points[0], stand_points[1]],
        [stand_points[1], (6.5, stand_points[1][1]), (6.5, stand_points[2][1]), stand_points[2]],
        [stand_points[2], stand_points[3]],
    ]
    for route, stand_point in zip(routes, stand_points):
        writer.walk(route)
        writer.stand(stand_point, STAND_SECONDS)
    return writer.lines


def dump_lines(lines: Sequence[Dict[str, object]]) -> str:
    return "\n".join(json.dumps(line, sort_keys=True, separators=(",", ":")) for line in lines) + "\n"


def dump_layout(layout: Dict[str, object]) -> str:
    return json.dumps(layout, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, metavar="DIR")
    args = parser.parse_args(argv)
    args.out_dir.mkdir(parents=True, exist_ok=True)
    (args.out_dir / RECORDING_NAME).write_text(dump_lines(build_recording()), encoding="utf-8")
    (args.out_dir / LAYOUT_NAME).write_text(dump_layout(build_layout()), encoding="utf-8")
    print(f"Geschrieben: {args.out_dir / RECORDING_NAME}")
    print(f"Geschrieben: {args.out_dir / LAYOUT_NAME}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

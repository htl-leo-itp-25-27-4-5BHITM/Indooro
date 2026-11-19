#!/usr/bin/env python3
"""Erzeugt SYNTHETISCHE Aufnahmen im Format `indooro-recording/2` fuer die Generalprobe des Feldtags.

Raum wie `SPAR-Leonding-002`: Raster 5 x 9 m, 8 Regale, 4 Beacons `Indooro1` bis `Indooro4` an den Ecken.
Fuenf Dateien, deterministisch (fester Seed je Lauf), jede mit `session`-Zeile, Wahrheitsmarken `M<n>` und
Funkwerten aus einem Log-Distanz-Modell:

    rehearsal-eval-1.jsonl          Rolle evaluation, S2, alles in Ordnung
    rehearsal-eval-2.jsonl          Rolle evaluation, S2, anderes Geraet
    rehearsal-eval-3.jsonl          Rolle evaluation, S3
    rehearsal-eval-bad-beacon4.jsonl  Rolle evaluation, absichtlich schlecht: Beacon Indooro4 nie gehoert, starkes Rauschen
    rehearsal-calibration-1.jsonl   Rolle calibration (zaehlt nie fuer die Entscheidung)

Namen beginnen mit `rehearsal-`, nicht mit `synthetic-`: Der Feldtag-Auswerter zeigt sie als PROBELAUF, die
Entscheidungsregel behandelt sie sonst wie Feldaufnahmen. Damit laesst sich die ganze Kette ohne iPhone
durchspielen, auch ein BESSER. **Die Zahlen sind keine Messung und werden nie zitiert.**

Aufruf (Repo-Wurzel):
    python -I scripts/field/make_synthetic_recordings.py [--out-dir DIR] [--layout-out FILE]
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

Point = Tuple[float, float]

HERE = Path(__file__).resolve().parent
FIXTURE_DIR = HERE / "fixtures" / "synthetic"
LAYOUT_FIXTURE = FIXTURE_DIR / "layout-spar-leonding-002.json"
REHEARSAL_PREFIX = "rehearsal-"

GRID = (5, 9)
BEACON_UUID = "B5CAA23B-BB89-4040-99D2-FCED3EA4A62B"  # Projekt-UUID (BEACON_STANDARD.md), von der Pruefung erlaubt
BEACONS: List[Tuple[str, int, Point]] = [
    ("Indooro1", 1, (0.5, 0.5)),
    ("Indooro2", 2, (4.5, 0.5)),
    ("Indooro3", 3, (0.5, 8.5)),
    ("Indooro4", 4, (4.5, 8.5)),
]
# 8 Regale 1 x 1 in zwei Spalten (x = 1 und 3), Gang in der Mitte (x = 2..3) und an den Waenden.
SHELVES: List[Tuple[int, int, int, int]] = [(x, y, 1, 1) for y in (1, 3, 5, 7) for x in (1, 3)]

TICK_S = 0.35
SPEED_MPS = 1.2
RANGING_PERIOD_S = 1.0
TX_POWER_AT_1M = -59.0
PATH_LOSS_EXPONENT = 2.2
HEAR_RANGE_M = 14.0
START_TIME = 1_795_000_000.0  # fest, nicht echt


@dataclass(frozen=True)
class RunSpec:
    name: str
    seed: int
    role: str  # evaluation | calibration
    scenario: str  # S1..S4
    device_model: str
    os: str
    rssi_sigma_db: float = 2.5
    silent_beacons: Tuple[str, ...] = ()
    sync_label: Optional[str] = None


RUN_SPECS: List[RunSpec] = [
    RunSpec("rehearsal-eval-1.jsonl", 11, "evaluation", "S2", "iPhone15,3", "iOS 18.1", sync_label="sync-1"),
    RunSpec("rehearsal-eval-2.jsonl", 22, "evaluation", "S2", "iPhone14,5", "iOS 17.6"),
    RunSpec("rehearsal-eval-3.jsonl", 33, "evaluation", "S3", "iPhone15,3", "iOS 18.1"),
    RunSpec("rehearsal-eval-bad-beacon4.jsonl", 44, "evaluation", "S2", "iPhone15,3", "iOS 18.1",
            rssi_sigma_db=7.0, silent_beacons=("Indooro4",)),
    RunSpec("rehearsal-calibration-1.jsonl", 55, "calibration", "S1", "iPhone15,3", "iOS 18.1"),
]

# Weg: zweimal um die Regale, dann durch den mittleren Gang hin und zurueck. Marker an jeder Ecke.
LOOP: List[Point] = [(0.5, 0.5), (4.5, 0.5), (4.5, 8.5), (0.5, 8.5), (0.5, 0.5)]
AISLE: List[Point] = [(0.5, 0.5), (2.5, 0.5), (2.5, 8.5), (2.5, 0.5)]


def build_layout() -> Dict[str, object]:
    elements: List[Dict[str, object]] = []
    next_id = 9_100_000_000
    for index, (x, y, width, height) in enumerate(SHELVES, start=1):
        elements.append({
            "id": next_id, "type": "shelf", "x": x, "y": y, "width": width, "height": height,
            "label": f"Regal {index}", "category": f"{600 + index}/1", "meter": 1, "color": "#2196F3",
        })
        next_id += 1
    elements.append({"id": next_id, "type": "entrance", "x": 0, "y": 8, "width": 1, "height": 1, "label": "Eingang"})
    next_id += 1
    for name, minor, (x, y) in BEACONS:
        elements.append({
            "id": next_id, "type": "beacon", "x": x, "y": y, "beaconId": name,
            "beaconUUID": BEACON_UUID, "beaconMajor": 1, "beaconMinor": minor,
        })
        next_id += 1
    return {
        "shopName": "SYNTHETISCHER Testraum (keine Messung)",
        "gridSize": {"width": GRID[0], "height": GRID[1]},
        "elements": elements,
        "exportDate": "2026-11-20",
    }


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def _path_points(polyline: Sequence[Point]) -> List[Tuple[Point, float]]:
    """(Punkt, zurueckgelegte Strecke) im festen Zeitabstand entlang der Polylinie."""
    segments = list(zip(polyline, polyline[1:]))
    total = sum(_distance(a, b) for a, b in segments)
    steps = int(math.ceil(total / (SPEED_MPS * TICK_S)))
    points: List[Tuple[Point, float]] = []
    for step in range(steps + 1):
        travelled = min(total, SPEED_MPS * TICK_S * step)
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
    def __init__(self, spec: RunSpec, index: int) -> None:
        self.spec = spec
        self.rng = random.Random(spec.seed)
        self.t = START_TIME + 3600.0 * index
        self.next_ranging = self.t
        self.markers = 0
        self.lines: List[Dict[str, object]] = [
            {"type": "session", "t": self.t, "schema": "indooro-recording/2", "app": "Indooro 1.0 (rehearsal)",
             "deviceModel": spec.device_model, "os": spec.os, "scenario": spec.scenario, "role": spec.role},
            {"type": "layout", "t": self.t, "revision": 1},
        ]
        if spec.sync_label:
            self.lines.append({"type": "sync", "t": round(self.t, 3), "label": spec.sync_label})

    def _measure(self, position: Point) -> None:
        if self.t + 1e-9 < self.next_ranging:
            return
        self.next_ranging = self.t + RANGING_PERIOD_S
        for name, _minor, beacon in BEACONS:
            if name in self.spec.silent_beacons:
                continue
            distance = max(0.3, _distance(position, beacon))
            if distance > HEAR_RANGE_M:
                continue
            rssi = TX_POWER_AT_1M - 10 * PATH_LOSS_EXPONENT * math.log10(distance) + self.rng.gauss(0, self.spec.rssi_sigma_db)
            accuracy = max(0.4, distance + self.rng.gauss(0, 0.4))
            self.lines.append({
                "type": "measurement", "t": round(self.t, 3), "source": "ranging", "beacon": name,
                "rssi": int(round(rssi)), "accuracy": round(accuracy, 3),
                "proximity": "immediate" if distance < 1 else ("near" if distance < 4 else "far"),
            })

    def truth(self, point: Point) -> None:
        self.markers += 1
        self.lines.append({
            "type": "truth", "t": round(self.t, 3), "x": round(point[0], 3), "y": round(point[1], 3),
            "marker": f"M{self.markers}",
        })

    def step(self, position: Point) -> None:
        self._measure(position)
        self.t += TICK_S

    def stand(self, point: Point, seconds: float) -> None:
        self.truth(point)
        for _ in range(int(round(seconds / TICK_S))):
            self.step(point)
        self.truth(point)

    def walk(self, polyline: Sequence[Point], corners: Sequence[int]) -> None:
        """Gehen; Marker beim Passieren der Ecken mit den Indizes `corners` (ausser dem Start)."""
        corner_distance = [0.0]
        for a, b in zip(polyline, polyline[1:]):
            corner_distance.append(corner_distance[-1] + _distance(a, b))
        pending = sorted(corners)
        for point, travelled in _path_points(polyline):
            while pending and travelled + 1e-9 >= corner_distance[pending[0]]:
                self.truth(polyline[pending.pop(0)])
            self.step(point)
        for index in pending:
            self.truth(polyline[index])


def build_recording(spec: RunSpec, index: int) -> List[Dict[str, object]]:
    writer = Writer(spec, index)
    writer.stand(LOOP[0], 4.0)
    writer.walk(LOOP + LOOP[1:], corners=range(1, 2 * len(LOOP) - 1))
    writer.walk(AISLE, corners=range(1, len(AISLE)))
    writer.stand(AISLE[-1], 3.0)
    return writer.lines


def dump_lines(lines: Sequence[Dict[str, object]]) -> str:
    return "\n".join(json.dumps(line, sort_keys=True, separators=(",", ":")) for line in lines) + "\n"


def dump_layout(layout: Dict[str, object]) -> str:
    return json.dumps(layout, sort_keys=True, indent=2, ensure_ascii=False) + "\n"


def write_all(out_dir: Path, layout_out: Optional[Path] = None) -> List[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    written: List[Path] = []
    for index, spec in enumerate(RUN_SPECS):
        target = out_dir / spec.name
        target.write_text(dump_lines(build_recording(spec, index)), encoding="utf-8")
        written.append(target)
    if layout_out is not None:
        layout_out.parent.mkdir(parents=True, exist_ok=True)
        layout_out.write_text(dump_layout(build_layout()), encoding="utf-8")
        written.append(layout_out)
    return written


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--out-dir", type=Path, required=True, metavar="DIR", help="Ordner fuer die Aufnahmen")
    parser.add_argument("--layout-out", type=Path, metavar="FILE", help=f"Layout zusaetzlich schreiben (Standard-Fixture: {LAYOUT_FIXTURE.relative_to(HERE.parents[1])})")
    args = parser.parse_args(argv)
    for path in write_all(args.out_dir, args.layout_out):
        print(f"Geschrieben: {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

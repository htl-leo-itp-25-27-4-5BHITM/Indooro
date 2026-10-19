#!/usr/bin/env python3
"""Bausteine fuer den Walk-Report: sichtbare Beacons je Position und Spruenge (Feldtag Testraum).

Reine Funktionen auf der (anonymisierten) Aufnahme und der Tick-CSV. Kein Aufruf der Positionierung,
keine Annahmen ueber den Raum. `analyze_walk.py` setzt daraus den Report im Format von
`docs/pilot-readiness/hardware/reports/0000-synthetic-baseline.md` zusammen.

Positionen sind die Long-Press-Stellen (`truth`-Zeilen). Zwei Long-Presses an derselben Stelle
(hoechstens 0,25 m, hoechstens 180 s Abstand, wie in `field_stats.py`) bilden einen Aufenthalt.
Ein einzelner Long-Press (Gehschleife) wertet +-2,5 s um den Zeitpunkt aus.
"""

from __future__ import annotations

import csv
import io
import json
import math
import statistics
from dataclasses import dataclass, field
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

Point = Tuple[float, float]

SAME_POINT_M = 0.25      # wie VISIT_SAME_POINT_M in field_stats.py
MAX_VISIT_GAP_S = 180.0  # wie VISIT_MAX_GAP_S in field_stats.py
SINGLE_PRESS_HALF_WINDOW_S = 2.5
MIN_SAMPLES_STABLE = 3   # darunter gilt ein Beacon an der Stelle als "kaum hoerbar"
# Sprung-Gate der Schaetzer-Konfiguration (StabilizedNavigationConfig.poseFusion, Stand 2026-10, provisional).
JUMP_SPEED_MPS = 2.5
JUMP_MARGIN_M = 0.85
EXPECTED_TICK_HEADER = [
    "t", "truth_x", "truth_y", "est_x", "est_y", "proj_x", "proj_y",
    "confidence", "beacons_used", "route_rebuild", "stop_change",
]


class ReportInputError(Exception):
    """Fehlerhafte Eingabe (Aufnahme, Layout oder Tick-CSV)."""


@dataclass
class Visit:
    point: Point
    t_start: float
    t_end: float
    presses: int


@dataclass
class BeaconAtVisit:
    name: str
    samples: int
    median_rssi: float
    distance_m: Optional[float]  # Abstand Position -> Layout-Koordinate des Beacons


@dataclass
class VisitReport:
    visit: Visit
    beacons: List[BeaconAtVisit]
    nearest_layout_beacon: Optional[str]
    nearest_distance_m: Optional[float]
    solver_beacons_mean: Optional[float] = None
    solver_beacons_min: Optional[int] = None

    @property
    def visible(self) -> int:
        return len(self.beacons)

    @property
    def stable(self) -> int:
        return sum(1 for beacon in self.beacons if beacon.samples >= MIN_SAMPLES_STABLE)

    @property
    def strongest(self) -> Optional[BeaconAtVisit]:
        return max(self.beacons, key=lambda beacon: beacon.median_rssi) if self.beacons else None


@dataclass
class Jump:
    t: float
    step_m: float
    gate_m: float


@dataclass
class UnmatchedBeacon:
    key: str  # "major-minor"
    samples: int
    median_rssi: float


@dataclass
class RecordingSummary:
    lines: int = 0
    measurements: int = 0
    truths: int = 0
    scans: int = 0
    events: int = 0
    t_first: Optional[float] = None
    t_last: Optional[float] = None
    beacons: List[str] = field(default_factory=list)

    @property
    def duration_s(self) -> float:
        return (self.t_last - self.t_first) if self.t_first is not None and self.t_last is not None else 0.0


def parse_recording(text: str) -> List[Dict[str, object]]:
    """JSON-Lines-Objekte. Leere Zeilen werden uebersprungen, kaputte Zeilen melden die Zeilennummer."""
    records: List[Dict[str, object]] = []
    for number, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip():
            continue
        try:
            record = json.loads(raw)
        except ValueError as error:
            raise ReportInputError(f"Aufnahme Zeile {number}: kein gueltiges JSON ({error})")
        if not isinstance(record, dict) or not isinstance(record.get("type"), str):
            raise ReportInputError(f"Aufnahme Zeile {number}: kein Objekt mit 'type'")
        records.append(record)
    return records


def _time(record: Dict[str, object]) -> float:
    value = record.get("t")
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ReportInputError(f"Zeile vom Typ {record.get('type')!r} ohne Zeit 't'")
    return float(value)


def summarize_recording(records: Sequence[Dict[str, object]]) -> RecordingSummary:
    summary = RecordingSummary(lines=len(records))
    names: List[str] = []
    for record in records:
        kind = record["type"]
        t = _time(record)
        summary.t_first = t if summary.t_first is None else min(summary.t_first, t)
        summary.t_last = t if summary.t_last is None else max(summary.t_last, t)
        if kind == "measurement":
            summary.measurements += 1
            name = str(record.get("beacon", ""))
            if name and name not in names:
                names.append(name)
        elif kind == "truth":
            summary.truths += 1
        elif kind == "scan":
            summary.scans += 1
        elif kind == "event":
            summary.events += 1
    summary.beacons = sorted(names)
    return summary


def layout_beacons(layout: Dict[str, object]) -> Dict[str, Point]:
    """Beacon-Namen (`beaconId`) und Koordinaten aus dem Layout-JSON (1 Zelle = 1 m)."""
    result: Dict[str, Point] = {}
    elements = layout.get("elements")
    if not isinstance(elements, list):
        raise ReportInputError("Layout ohne 'elements'")
    for element in elements:
        if isinstance(element, dict) and element.get("type") == "beacon" and isinstance(element.get("beaconId"), str):
            x, y = element.get("x"), element.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                result[element["beaconId"]] = (float(x), float(y))
    return result


def truth_visits(records: Sequence[Dict[str, object]]) -> List[Visit]:
    presses = sorted(
        ((_time(r), (float(r["x"]), float(r["y"]))) for r in records if r["type"] == "truth"),
        key=lambda item: item[0],
    )
    visits: List[Visit] = []
    for t, point in presses:
        if visits:
            last = visits[-1]
            if math.hypot(point[0] - last.point[0], point[1] - last.point[1]) <= SAME_POINT_M and t - last.t_start <= MAX_VISIT_GAP_S:
                count = last.presses + 1
                last.point = (
                    (last.point[0] * last.presses + point[0]) / count,
                    (last.point[1] * last.presses + point[1]) / count,
                )
                last.t_end = t
                last.presses = count
                continue
        visits.append(Visit(point=point, t_start=t, t_end=t, presses=1))
    return visits


def _distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def visit_reports(
    records: Sequence[Dict[str, object]],
    visits: Sequence[Visit],
    beacons: Dict[str, Point],
    ticks: Optional[Sequence[Dict[str, float]]] = None,
) -> List[VisitReport]:
    measurements = [
        (_time(r), str(r["beacon"]), int(r["rssi"]))
        for r in records
        if r["type"] == "measurement" and isinstance(r.get("rssi"), int) and isinstance(r.get("beacon"), str)
    ]
    reports: List[VisitReport] = []
    for visit in visits:
        if visit.presses >= 2:
            start, end = visit.t_start, visit.t_end
        else:
            start, end = visit.t_start - SINGLE_PRESS_HALF_WINDOW_S, visit.t_start + SINGLE_PRESS_HALF_WINDOW_S
        per_beacon: Dict[str, List[int]] = {}
        for t, name, rssi in measurements:
            if start <= t <= end and rssi != 0 and rssi != 127:
                per_beacon.setdefault(name, []).append(rssi)
        heard = [
            BeaconAtVisit(
                name=name,
                samples=len(values),
                median_rssi=float(statistics.median(values)),
                distance_m=_distance(visit.point, beacons[name]) if name in beacons else None,
            )
            for name, values in per_beacon.items()
        ]
        heard.sort(key=lambda beacon: (-beacon.median_rssi, beacon.name))
        nearest_name: Optional[str] = None
        nearest_distance: Optional[float] = None
        if beacons:
            nearest_name, nearest_distance = min(
                ((name, _distance(visit.point, point)) for name, point in beacons.items()),
                key=lambda item: (item[1], item[0]),
            )
        report = VisitReport(visit, heard, nearest_name, nearest_distance)
        if ticks:
            used = [int(tick["beacons_used"]) for tick in ticks if start <= tick["t"] <= end]
            if used:
                report.solver_beacons_mean = sum(used) / len(used)
                report.solver_beacons_min = min(used)
        reports.append(report)
    return reports


def unmatched_beacons(records: Sequence[Dict[str, object]]) -> List[UnmatchedBeacon]:
    per_key: Dict[str, List[int]] = {}
    for record in records:
        if record["type"] == "scan" and isinstance(record.get("rssi"), int):
            per_key.setdefault(f"{record.get('major')}-{record.get('minor')}", []).append(int(record["rssi"]))
    return [
        UnmatchedBeacon(key, len(values), float(statistics.median(values)))
        for key, values in sorted(per_key.items())
    ]


def parse_ticks(text: str) -> List[Dict[str, float]]:
    """Spalten der Tick-CSV als Zahlen; leere Felder fehlen im Dict."""
    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise ReportInputError("Tick-CSV ist leer")
    if header != EXPECTED_TICK_HEADER:
        raise ReportInputError("Tick-CSV hat nicht den erwarteten Kopf (NavigationReplay.csvHeader)")
    rows: List[Dict[str, float]] = []
    for number, cells in enumerate(reader, start=2):
        if not cells:
            continue
        if len(cells) != len(header):
            raise ReportInputError(f"Tick-CSV Zeile {number}: {len(cells)} statt {len(header)} Spalten")
        row: Dict[str, float] = {}
        for key, cell in zip(header, cells):
            if cell == "":
                continue
            try:
                row[key] = float(cell)
            except ValueError:
                raise ReportInputError(f"Tick-CSV Zeile {number}: '{cell}' ist keine Zahl")
        if "t" not in row:
            raise ReportInputError(f"Tick-CSV Zeile {number}: Zeit fehlt")
        row.setdefault("beacons_used", 0.0)
        rows.append(row)
    return rows


def find_jumps(ticks: Sequence[Dict[str, float]]) -> Tuple[List[Jump], float]:
    """Schritte der projizierten Position ueber dem Gate `2.5 m/s * dt + 0.85 m`; zusaetzlich der groesste Schritt."""
    jumps: List[Jump] = []
    largest = 0.0
    previous: Optional[Dict[str, float]] = None
    for tick in ticks:
        if "proj_x" not in tick or "proj_y" not in tick:
            continue
        if previous is not None:
            step = math.hypot(tick["proj_x"] - previous["proj_x"], tick["proj_y"] - previous["proj_y"])
            gate = JUMP_SPEED_MPS * max(0.0, tick["t"] - previous["t"]) + JUMP_MARGIN_M
            largest = max(largest, step)
            if step > gate:
                jumps.append(Jump(tick["t"], step, gate))
        previous = tick
    return jumps, largest


# MARK: - Markdown


def _table(headers: Sequence[str], rows: Iterable[Sequence[str]]) -> List[str]:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return lines


def render_visit_table(reports: Sequence[VisitReport], t0: float) -> List[str]:
    if not reports:
        return ["Keine `truth`-Zeilen in der Aufnahme: keine Positionen auswertbar. Long-Press auf der Karte an bekannten Stellen setzen."]
    rows = []
    for number, report in enumerate(reports, start=1):
        visit = report.visit
        kind = f"Stand {visit.t_end - visit.t_start:.0f} s" if visit.presses >= 2 else "Durchgang"
        solver = "–" if report.solver_beacons_mean is None else f"{report.solver_beacons_mean:.1f} / {report.solver_beacons_min}"
        strongest = report.strongest
        if strongest is None:
            strongest_text = "–"
        else:
            hint = ""
            if report.nearest_layout_beacon and strongest.name != report.nearest_layout_beacon:
                hint = f" ≠ nächster {report.nearest_layout_beacon}"
            strongest_text = f"{strongest.name} ({strongest.median_rssi:.0f} dBm){hint}"
        nearest = "–" if report.nearest_layout_beacon is None else f"{report.nearest_layout_beacon} ({report.nearest_distance_m:.1f} m)"
        rows.append([
            str(number), f"{visit.point[0]:.2f} / {visit.point[1]:.2f}", f"{visit.t_start - t0:.0f}", kind,
            str(report.visible), str(report.stable), solver, strongest_text, nearest,
        ])
    lines = _table(
        ["Nr.", "Position (x / y, m)", "t (s)", "Art", "hörbar", f"≥ {MIN_SAMPLES_STABLE} Samples", "im Solver Ø / min",
         "stärkstes Signal", "nächster Layout-Beacon"],
        rows,
    )
    lines.append("")
    for number, report in enumerate(reports, start=1):
        if not report.beacons:
            continue
        detail = ", ".join(
            f"{b.name} {b.median_rssi:.0f} dBm (n={b.samples}" + ("" if b.distance_m is None else f", {b.distance_m:.1f} m") + ")"
            for b in report.beacons
        )
        lines.append(f"- Nr. {number}: {detail}")
    return lines


def render_jumps(jumps: Sequence[Jump], largest: float, t0: float, limit: int = 8) -> List[str]:
    lines = [
        f"- Schritte der projizierten Position über dem Gate ({JUMP_SPEED_MPS} m/s · dt + {JUMP_MARGIN_M} m): **{len(jumps)}**",
        f"- Größter Schritt: {largest:.2f} m",
    ]
    if jumps:
        lines.append("")
        lines.extend(_table(
            ["t (s)", "Schritt (m)", "Gate (m)"],
            [[f"{jump.t - t0:.1f}", f"{jump.step_m:.2f}", f"{jump.gate_m:.2f}"] for jump in jumps[:limit]],
        ))
        if len(jumps) > limit:
            lines.append("")
            lines.append(f"({len(jumps) - limit} weitere nicht gezeigt.)")
    return lines


def render_unmatched(items: Sequence[UnmatchedBeacon]) -> List[str]:
    if not items:
        return ["Keine layout-fremden iBeacons gehört (oder Aufnahme von einem Build ohne `scan`-Zeilen)."]
    lines = _table(
        ["Major-Minor", "scan-Zeilen", "Median RSSI (dBm)"],
        [[item.key, str(item.samples), f"{item.median_rssi:.0f}"] for item in items],
    )
    lines.append("")
    lines.append(
        "Diese Beacons hat das iPhone gehört, aber sie passen zu keinem Beacon im Layout. Eigene Beacons hier: "
        "Registrierung (Major/Minor/UUID) und Layout abgleichen. Fremde Beacons (Nachbarraum) sind unkritisch."
    )
    return lines

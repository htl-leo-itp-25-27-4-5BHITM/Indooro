#!/usr/bin/env python3
"""Statistik der Feldmessung aus den Tick-CSVs (Task 4.4).

Liest `<name>-ticks.csv` (Spalten laut NavigationReplay.csvHeader), findet Standzeit-Fenster
ueber die Bodenwahrheit (`truth`), berechnet den Positionsfehler je Marker, den Anteil der
Gehzeit im richtigen Gang sowie Reroutes und Stoppwechsel je Aufnahme und schreibt
Markdown-Tabellen fuer REPORT_TEMPLATE.md.

Aufruf (Repo-Wurzel):
    python -I scripts/field/field_stats.py --ticks A-ticks.csv [B-ticks.csv ...]
        [--markers sites/<site>.md] [--layout sites/layout-<site>.json]
        [--source est|proj] [--min-window SECONDS] [--replay-lines FILE] [--out FILE.md]

Exit: 0 ok, 2 Eingabe nicht lesbar oder fehlerhaft.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import math
import re
import sys
from bisect import bisect_right
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

Point = Tuple[float, float]

EXPECTED_HEADER: List[str] = [
    "t", "truth_x", "truth_y", "est_x", "est_y", "proj_x", "proj_y",
    "confidence", "beacons_used", "route_rebuild", "stop_change",
]
VISIT_MAX_GAP_S = 180.0        # gleiche Stelle: Starts hoechstens so weit auseinander
VISIT_SAME_POINT_M = 0.25      # gleiche Stelle: Truth-Koordinaten hoechstens so weit auseinander
MARKER_MATCH_M = 0.75          # Fenster-Koordinate einem Marker zuordnen, wenn naher
GROUP_MAX_INDEX_GAP = 2        # hoechstens ein Tick ohne Truth innerhalb einer Gruppe
DEFAULT_MIN_WINDOW_S = 20.0
PLACEHOLDER_MARK = "(Mensch"
SEPARATOR_CELL_RE = re.compile(r":?-{3,}:?")
REPLAY_TOKEN_RE = re.compile(r"([A-Za-z][A-Za-z0-9_]*)=(\[[^\]]*\]|\S+)")
REPLAY_LABELS: Dict[str, str] = {
    "ticks": "Ticks",
    "duration": "Dauer (s)",
    "reroutes": "Reroutes",
    "reroutesPerMin": "Reroutes/min",
    "stopChanges": "Stoppwechsel",
    "jumps": "Sprünge",
    "maxStep": "Max. Schritt (m)",
    "lagMean": "Lag Mittel (m)",
    "lagP95": "Lag P95 (m)",
    "offRouteDelays": "Off-Route-Verzögerung (s)",
    "lowConfToggles": "Konfidenz-Wechsel",
    "planning": "Planungen",
}


class InputError(Exception):
    """Unlesbare oder fehlerhafte Eingabe. Fuehrt zu Exit 2."""


# MARK: - Datenmodell


@dataclass(frozen=True)
class Tick:
    t: float
    truth: Optional[Point]
    est: Optional[Point]
    proj: Optional[Point]
    route_rebuild: bool
    stop_change: bool


@dataclass
class TruthGroup:
    """Zusammenhaengende Ticks mit gleicher Truth-Koordinate (ein Long-Press)."""

    first: int
    last: int
    point: Point
    t_first: float
    t_last: float

    @property
    def center_t(self) -> float:
        return (self.t_first + self.t_last) / 2.0


@dataclass
class Visit:
    """Truth-Gruppen an derselben Stelle, zeitlich nah beieinander (Start und Ende einer Standzeit)."""

    groups: List[TruthGroup]

    @property
    def point(self) -> Point:
        xs = [group.point[0] for group in self.groups]
        ys = [group.point[1] for group in self.groups]
        return (sum(xs) / len(xs), sum(ys) / len(ys))


@dataclass(frozen=True)
class Marker:
    name: str
    x: float
    y: float
    description: str


@dataclass(frozen=True)
class Aisle:
    name: str
    x0: float
    y0: float
    x1: float
    y1: float

    def contains(self, point: Point) -> bool:
        return self.x0 <= point[0] <= self.x1 and self.y0 <= point[1] <= self.y1


@dataclass(frozen=True)
class SiteData:
    markers: List[Marker]
    aisles: List[Aisle]


@dataclass
class WindowResult:
    first: int
    last: int
    point: Point
    duration_s: float
    marker_index: Optional[int]
    errors: List[float]


@dataclass
class RecordingResult:
    name: str
    tick_count: int
    duration_s: float
    windows: List[WindowResult]
    walking: Optional[Tuple[int, int, int]]  # (ausgewertet, im richtigen Gang, ausgeschlossen); None ohne Gaenge
    reroutes: int
    stop_changes: int


@dataclass
class LabelStats:
    label: str
    marker: Optional[Marker]
    point: Optional[Point]
    windows: int = 0
    errors: List[float] = field(default_factory=list)


# MARK: - Mathematik


def distance(a: Point, b: Point) -> float:
    return math.hypot(a[0] - b[0], a[1] - b[1])


def percentile(values: Sequence[float], p: float) -> Optional[float]:
    """Perzentil mit linearer Interpolation (wie numpy-Standard). Leere Eingabe ergibt None."""
    if not 0.0 <= p <= 100.0:
        raise ValueError(f"Perzentil muss zwischen 0 und 100 liegen, nicht {p}")
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return float(ordered[0])
    rank = (p / 100.0) * (len(ordered) - 1)
    low = math.floor(rank)
    high = math.ceil(rank)
    return ordered[low] + (ordered[high] - ordered[low]) * (rank - low)


def median(values: Sequence[float]) -> Optional[float]:
    return percentile(values, 50.0)


# MARK: - Einlesen


def _number(text: str, where: str) -> float:
    try:
        value = float(text.strip())
    except ValueError:
        raise InputError(f"{where}: '{text.strip()}' ist keine Zahl (Punkt als Dezimaltrenner, keine Platzhalter)")
    if not math.isfinite(value):
        raise InputError(f"{where}: Wert ist nicht endlich")
    return value


def _optional_point(x_text: str, y_text: str, where: str) -> Optional[Point]:
    if x_text.strip() == "" and y_text.strip() == "":
        return None
    if x_text.strip() == "" or y_text.strip() == "":
        raise InputError(f"{where}: Koordinate nur teilweise gesetzt")
    return (_number(x_text, where), _number(y_text, where))


def _flag(text: str, where: str) -> bool:
    if text.strip() == "0":
        return False
    if text.strip() == "1":
        return True
    raise InputError(f"{where}: '{text}' ist kein Flag (0 oder 1)")


def parse_ticks(text: str, name: str) -> List[Tick]:
    """Tick-CSV aus Text lesen. `name` dient nur den Fehlermeldungen."""
    rows = [row for row in csv.reader(io.StringIO(text)) if row]
    if not rows:
        raise InputError(f"{name}: Datei ist leer")
    if rows[0] != EXPECTED_HEADER:
        raise InputError(f"{name}: Kopfzeile passt nicht zu NavigationReplay.csvHeader")
    ticks: List[Tick] = []
    for number, row in enumerate(rows[1:], start=2):
        where = f"{name}, Zeile {number}"
        if len(row) != len(EXPECTED_HEADER):
            raise InputError(f"{where}: {len(EXPECTED_HEADER)} Spalten erwartet, {len(row)} gefunden")
        ticks.append(Tick(
            t=_number(row[0], where),
            truth=_optional_point(row[1], row[2], where),
            est=_optional_point(row[3], row[4], where),
            proj=_optional_point(row[5], row[6], where),
            route_rebuild=_flag(row[9], where),
            stop_change=_flag(row[10], where),
        ))
    return ticks


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        raise InputError(f"Datei nicht gefunden: {path}")
    except (OSError, UnicodeDecodeError) as error:
        raise InputError(f"{path} ist nicht lesbar ({error})")


def recording_name(path: Path) -> str:
    stem = path.stem
    return stem[: -len("-ticks")] if stem.endswith("-ticks") else stem


def read_ticks_file(path: Path) -> List[Tick]:
    return parse_ticks(read_text(path), path.name)


def markdown_tables(text: str) -> List[Tuple[List[str], List[List[str]]]]:
    """Alle Markdown-Tabellen (Kopfzeile, Zeilen) einer Datei. Trennzeilen werden uebersprungen."""
    tables: List[Tuple[List[str], List[List[str]]]] = []
    header: Optional[List[str]] = None
    rows: List[List[str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) >= 2 and line.startswith("|") and line.endswith("|"):
            cells = [cell.strip() for cell in line[1:-1].split("|")]
            if header is None:
                header = cells
                rows = []
            elif all(SEPARATOR_CELL_RE.fullmatch(cell) for cell in cells):
                continue
            else:
                rows.append(cells)
        elif header is not None:
            tables.append((header, rows))
            header = None
            rows = []
    if header is not None:
        tables.append((header, rows))
    return tables


def _is_placeholder(cells: List[str]) -> bool:
    return any(PLACEHOLDER_MARK in cell for cell in cells)


def parse_site_markdown(text: str, name: str = "Standort-Datei") -> SiteData:
    """Marker- und Gang-Tabelle aus der Standort-Datei lesen. Platzhalterzeilen werden ignoriert."""
    markers: List[Marker] = []
    aisles: List[Aisle] = []
    for header, rows in markdown_tables(text):
        if header == ["Marker", "x_m", "y_m", "Beschreibung"]:
            for cells in rows:
                if not any(cells) or _is_placeholder(cells):
                    continue
                if len(cells) < 4 or not cells[0]:
                    raise InputError(f"{name}: Marker-Zeile unvollstaendig: {' | '.join(cells)}")
                markers.append(Marker(
                    name=cells[0],
                    x=_number(cells[1], f"{name}, Marker {cells[0]}, x_m"),
                    y=_number(cells[2], f"{name}, Marker {cells[0]}, y_m"),
                    description=cells[3],
                ))
        elif header == ["Gang", "x_m", "y_m", "width_m", "height_m"]:
            for cells in rows:
                if not any(cells) or _is_placeholder(cells):
                    continue
                if len(cells) < 5 or not cells[0]:
                    raise InputError(f"{name}: Gang-Zeile unvollstaendig: {' | '.join(cells)}")
                x = _number(cells[1], f"{name}, Gang {cells[0]}, x_m")
                y = _number(cells[2], f"{name}, Gang {cells[0]}, y_m")
                width = _number(cells[3], f"{name}, Gang {cells[0]}, width_m")
                height = _number(cells[4], f"{name}, Gang {cells[0]}, height_m")
                if width <= 0 or height <= 0:
                    raise InputError(f"{name}, Gang {cells[0]}: width_m und height_m muessen groesser als 0 sein")
                aisles.append(Aisle(cells[0], x, y, x + width, y + height))
    return SiteData(markers=markers, aisles=aisles)


def read_site_file(path: Path) -> SiteData:
    return parse_site_markdown(read_text(path), path.name)


def read_layout_aisles(path: Path) -> List[Aisle]:
    """Gaenge aus dem Layout-JSON: Elemente mit type "aisle" (x, y, width, height in Zellen = Meter)."""
    try:
        layout = json.loads(read_text(path))
    except ValueError as error:
        raise InputError(f"{path.name} ist kein gueltiges JSON ({error})")
    if not isinstance(layout, dict) or not isinstance(layout.get("elements", []), list):
        raise InputError(f"{path.name}: Feld 'elements' fehlt oder ist keine Liste")
    aisles: List[Aisle] = []
    for index, element in enumerate(layout.get("elements", [])):
        if not isinstance(element, dict) or element.get("type") != "aisle":
            continue
        where = f"{path.name}, Element {element.get('id', index)}"
        values = []
        for key in ("x", "y", "width", "height"):
            value = element.get(key)
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise InputError(f"{where}: '{key}' fehlt oder ist keine Zahl")
            values.append(float(value))
        x, y, width, height = values
        if width <= 0 or height <= 0:
            raise InputError(f"{where}: width und height muessen groesser als 0 sein")
        label = element.get("label")
        name = label if isinstance(label, str) and label else f"aisle-{element.get('id', index)}"
        aisles.append(Aisle(name, x, y, x + width, y + height))
    return aisles


def _replay_value(raw: str) -> object:
    if raw.startswith("[") and raw.endswith("]"):
        inner = raw[1:-1].strip()
        if not inner:
            return []
        try:
            return [float(item) for item in inner.split(",")]
        except ValueError:
            return raw
    if re.fullmatch(r"-?\d+x", raw):
        return int(raw[:-1])
    if re.fullmatch(r"-?\d+(\.\d+)?s", raw):
        return float(raw[:-1])
    if re.fullmatch(r"-?\d+", raw):
        return int(raw)
    if re.fullmatch(r"-?\d+\.\d+", raw):
        return float(raw)
    return raw


def parse_replay_lines(text: str) -> List[Tuple[str, Dict[str, object]]]:
    """`REPLAY <name> key=value ...`-Zeilen aus `swift test` lesen. Andere Zeilen werden ignoriert."""
    rows: List[Tuple[str, Dict[str, object]]] = []
    for raw in text.splitlines():
        stripped = raw.strip()
        if not stripped.startswith("REPLAY "):
            continue
        parts = stripped.split(maxsplit=2)
        if len(parts) < 2:
            continue
        rest = parts[2] if len(parts) > 2 else ""
        values = {match.group(1): _replay_value(match.group(2)) for match in REPLAY_TOKEN_RE.finditer(rest)}
        rows.append((parts[1], values))
    return rows


# MARK: - Standzeit-Fenster und Gehzeit


def estimate(tick: Tick, source: str) -> Optional[Point]:
    return tick.est if source == "est" else tick.proj


def build_truth_groups(ticks: Sequence[Tick]) -> List[TruthGroup]:
    """Maximale Laeufe von Ticks mit gleicher Truth-Koordinate. Ein fehlender Tick darin wird toleriert."""
    groups: List[TruthGroup] = []
    for index, tick in enumerate(ticks):
        if tick.truth is None:
            continue
        if groups and groups[-1].point == tick.truth and index - groups[-1].last <= GROUP_MAX_INDEX_GAP:
            groups[-1].last = index
            groups[-1].t_last = tick.t
        else:
            groups.append(TruthGroup(index, index, tick.truth, tick.t, tick.t))
    return groups


def build_visits(groups: Sequence[TruthGroup]) -> List[Visit]:
    """Aufeinanderfolgende Gruppen an derselben Stelle (hoechstens 0,25 m) mit Start-Abstand bis 180 s."""
    visits: List[Visit] = []
    for group in groups:
        if visits:
            previous = visits[-1].groups[-1]
            same_place = distance(previous.point, group.point) <= VISIT_SAME_POINT_M
            close_in_time = group.t_first - previous.t_first <= VISIT_MAX_GAP_S
            if same_place and close_in_time:
                visits[-1].groups.append(group)
                continue
        visits.append(Visit([group]))
    return visits


def match_marker(point: Point, markers: Sequence[Marker]) -> Optional[int]:
    """Index des naechsten Markers innerhalb von 0,75 m, sonst None."""
    best: Optional[int] = None
    best_distance = math.inf
    for index, marker in enumerate(markers):
        d = distance(point, (marker.x, marker.y))
        if d <= MARKER_MATCH_M and d < best_distance:
            best = index
            best_distance = d
    return best


def truth_at(index: int, ticks: Sequence[Tick], groups: Sequence[TruthGroup], starts: Sequence[int]) -> Point:
    """Bodenwahrheit eines Ticks: Gruppenkoordinate innerhalb einer Gruppe, sonst zeitlich interpoliert
    zwischen den Gruppenmitten davor und danach."""
    position = bisect_right(starts, index) - 1
    group = groups[position]
    if index <= group.last:
        return group.point
    following = groups[position + 1]
    t0, t1 = group.center_t, following.center_t
    if t1 <= t0:
        return group.point
    alpha = min(1.0, max(0.0, (ticks[index].t - t0) / (t1 - t0)))
    return (
        group.point[0] + alpha * (following.point[0] - group.point[0]),
        group.point[1] + alpha * (following.point[1] - group.point[1]),
    )


def walking_counts(
    ticks: Sequence[Tick],
    groups: Sequence[TruthGroup],
    stationary: Sequence[bool],
    aisles: Optional[Sequence[Aisle]],
    source: str,
) -> Optional[Tuple[int, int, int]]:
    """Gehzeit im richtigen Gang: (ausgewertet, im richtigen Gang, ausgeschlossen). None ohne Gaenge."""
    if aisles is None:
        return None
    evaluated = correct = excluded = 0
    if not groups:
        return (0, 0, 0)
    starts = [group.first for group in groups]
    for index in range(groups[0].first, groups[-1].last + 1):
        if stationary[index]:
            continue
        estimated = estimate(ticks[index], source)
        if estimated is None:
            continue
        truth = truth_at(index, ticks, groups, starts)
        truth_aisles = {k for k, aisle in enumerate(aisles) if aisle.contains(truth)}
        if not truth_aisles:
            excluded += 1
            continue
        evaluated += 1
        estimate_aisles = {k for k, aisle in enumerate(aisles) if aisle.contains(estimated)}
        if truth_aisles & estimate_aisles:
            correct += 1
    return (evaluated, correct, excluded)


def analyze_recording(
    name: str,
    ticks: Sequence[Tick],
    markers: Sequence[Marker],
    aisles: Optional[Sequence[Aisle]],
    source: str,
    min_window: float,
) -> RecordingResult:
    groups = build_truth_groups(ticks)
    stationary = [False] * len(ticks)
    windows: List[WindowResult] = []
    for visit in build_visits(groups):
        first = visit.groups[0].first
        last = visit.groups[-1].last
        duration = ticks[last].t - ticks[first].t
        if duration < min_window:
            continue
        point = visit.point
        errors = []
        for index in range(first, last + 1):
            stationary[index] = True
            estimated = estimate(ticks[index], source)
            if estimated is not None:
                errors.append(distance(estimated, point))
        windows.append(WindowResult(first, last, point, duration, match_marker(point, markers), errors))

    duration_s = (max(t.t for t in ticks) - min(t.t for t in ticks)) if ticks else 0.0
    return RecordingResult(
        name=name,
        tick_count=len(ticks),
        duration_s=duration_s,
        windows=windows,
        walking=walking_counts(ticks, groups, stationary, aisles, source),
        reroutes=sum(1 for tick in ticks if tick.route_rebuild),
        stop_changes=sum(1 for tick in ticks if tick.stop_change),
    )


def pool_by_label(recordings: Sequence[RecordingResult], markers: Sequence[Marker]) -> List[LabelStats]:
    """Fehler je Marker, gepoolt ueber alle Aufnahmen. Nicht zugeordnete Fenster nach Koordinate."""
    per_marker = [LabelStats(marker.name, marker, (marker.x, marker.y)) for marker in markers]
    unmatched: Dict[str, LabelStats] = {}
    for recording in recordings:
        for window in recording.windows:
            if window.marker_index is not None:
                entry = per_marker[window.marker_index]
            else:
                key = f"kein Marker ({window.point[0]:.2f} / {window.point[1]:.2f})"
                entry = unmatched.setdefault(key, LabelStats(key, None, window.point))
            entry.windows += 1
            entry.errors.extend(window.errors)
    return per_marker + [unmatched[key] for key in sorted(unmatched)]


# MARK: - Ausgabe


def _fmt(value: Optional[float]) -> str:
    return "n/a" if value is None else f"{value:.2f}"


def _fmt_replay(value: object) -> str:
    if isinstance(value, list):
        return "; ".join(f"{item:.2f}" for item in value) if value else "–"
    if isinstance(value, bool):
        return str(value)
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        return f"{value:.2f}"
    return str(value)


def _table(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> List[str]:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return lines


def render_report(
    recordings: Sequence[RecordingResult],
    markers: Sequence[Marker],
    aisles: Optional[Sequence[Aisle]],
    aisle_source: str,
    source: str,
    min_window: float,
    replay_rows: Optional[Sequence[Tuple[str, Dict[str, object]]]],
) -> str:
    source_label = "Schätzung (est)" if source == "est" else "projizierte Position (proj)"
    lines: List[str] = [
        "# Feldauswertung",
        "",
        f"- Positionsquelle: {source_label}",
        f"- Mindestdauer Standzeit: {min_window:.0f} s",
        f"- Aufnahmen: {len(recordings)} ({', '.join(recording.name for recording in recordings) or 'keine'})",
        f"- Marker: {len(markers)}",
        f"- Gangdefinition: {aisle_source}",
        "",
        "## Positionsfehler je Marker",
        "",
    ]

    stats = pool_by_label(recordings, markers)
    total_windows = sum(len(recording.windows) for recording in recordings)
    if total_windows == 0:
        lines.append(f"Keine Standzeit-Fenster gefunden (Mindestdauer {min_window:.0f} s).")
        lines.append("")
    marker_rows = []
    for entry in stats:
        if entry.marker is not None:
            label, description = entry.marker.name, entry.marker.description or "–"
        else:
            label, description = "kein Marker", "–"
        coords = "n/a" if entry.point is None else f"{entry.point[0]:.2f} / {entry.point[1]:.2f}"
        marker_rows.append([
            label, description, coords, str(entry.windows), str(len(entry.errors)),
            _fmt(median(entry.errors)), _fmt(percentile(entry.errors, 90.0)),
        ])
    if marker_rows:
        lines.extend(_table(
            ["Marker", "Beschreibung", "Koordinate (x / y)", "Fenster", "n", "Median (m)", "P90 (m)"],
            marker_rows,
        ))
    lines.append("")

    lines.append("## Gesamt")
    lines.append("")
    all_errors = [error for recording in recordings for window in recording.windows for error in window.errors]
    overall_rows = [[
        "Alle Standzeiten (gepoolt)", str(len(recordings)), str(total_windows), str(len(all_errors)),
        _fmt(median(all_errors)), _fmt(percentile(all_errors, 90.0)),
    ]]
    for recording in recordings:
        errors = [error for window in recording.windows for error in window.errors]
        overall_rows.append([
            f"Aufnahme {recording.name}", "1", str(len(recording.windows)), str(len(errors)),
            _fmt(median(errors)), _fmt(percentile(errors, 90.0)),
        ])
    lines.extend(_table(["Ebene", "Aufnahmen", "Fenster", "n", "Median (m)", "P90 (m)"], overall_rows))
    lines.append("")

    lines.append("## Gehzeit im richtigen Gang")
    lines.append("")
    if aisles is None:
        lines.append("n/a (keine Gangdefinition)")
    else:
        walk_rows = []
        totals = [0, 0, 0]
        for recording in recordings:
            evaluated, correct, excluded = recording.walking or (0, 0, 0)
            totals = [totals[0] + evaluated, totals[1] + correct, totals[2] + excluded]
            share = (100.0 * correct / evaluated) if evaluated else None
            walk_rows.append([recording.name, str(evaluated), str(correct), _fmt(share), str(excluded)])
        total_share = (100.0 * totals[1] / totals[0]) if totals[0] else None
        walk_rows.append(["Gesamt", str(totals[0]), str(totals[1]), _fmt(total_share), str(totals[2])])
        lines.extend(_table(
            ["Aufnahme", "Ausgewertete Gehticks", "Im richtigen Gang", "Anteil (%)",
             "Ausgeschlossen (Wahrheit in keinem Gang)"],
            walk_rows,
        ))
    lines.append("")

    lines.append("## Reroutes und Stoppwechsel je Aufnahme")
    lines.append("")
    route_rows = []
    total_reroutes = total_stops = 0
    total_minutes = 0.0
    for recording in recordings:
        minutes = recording.duration_s / 60.0
        per_minute = recording.reroutes / minutes if minutes > 0 else None
        total_reroutes += recording.reroutes
        total_stops += recording.stop_changes
        total_minutes += minutes
        route_rows.append([
            recording.name, _fmt(minutes), str(recording.reroutes), _fmt(per_minute), str(recording.stop_changes),
        ])
    total_per_minute = total_reroutes / total_minutes if total_minutes > 0 else None
    route_rows.append([
        "Summe", _fmt(total_minutes), str(total_reroutes), _fmt(total_per_minute), str(total_stops),
    ])
    lines.extend(_table(
        ["Aufnahme", "Dauer (min)", "Reroutes", "Reroutes je Minute", "Stoppwechsel (ohne Event-Zuordnung)"],
        route_rows,
    ))
    lines.append("")

    if replay_rows is not None:
        lines.append("## Replay-Metriken")
        lines.append("")
        keys: List[str] = []
        for _, values in replay_rows:
            for key in values:
                if key not in keys:
                    keys.append(key)
        headers = ["Szenario"] + [REPLAY_LABELS.get(key, key) for key in keys]
        replay_table = []
        for name, values in replay_rows:
            replay_table.append([name] + [_fmt_replay(values[key]) if key in values else "–" for key in keys])
        if replay_table:
            lines.extend(_table(headers, replay_table))
        else:
            lines.append("Keine REPLAY-Zeilen gefunden.")
        lines.append("")

    return "\n".join(lines)


# MARK: - CLI


def _non_negative_float(text: str) -> float:
    try:
        value = float(text)
    except ValueError:
        raise argparse.ArgumentTypeError(f"'{text}' ist keine Zahl")
    if not math.isfinite(value) or value < 0:
        raise argparse.ArgumentTypeError("Wert muss eine endliche Zahl >= 0 sein")
    return value


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Positionsfehler, Gang-Anteil, Reroutes und Stoppwechsel aus Tick-CSVs berechnen.",
    )
    parser.add_argument(
        "--ticks", action="extend", nargs="+", type=Path, required=True, metavar="FILE",
        help="Tick-CSV je Aufnahme (wiederholbar)",
    )
    parser.add_argument("--markers", type=Path, metavar="SITE.md", help="Standort-Datei mit Marker- und Gang-Tabelle")
    parser.add_argument("--layout", type=Path, metavar="LAYOUT.json", help="Layout mit Gang-Elementen (type aisle)")
    parser.add_argument("--source", choices=["est", "proj"], default="est", help="Positionsquelle (Standard: est)")
    parser.add_argument(
        "--min-window", type=_non_negative_float, default=DEFAULT_MIN_WINDOW_S, metavar="SECONDS",
        help="Mindestdauer einer Standzeit in Sekunden (Standard: 20)",
    )
    parser.add_argument("--replay-lines", type=Path, metavar="FILE", help="Ausgabe mit REPLAY-Zeilen")
    parser.add_argument("--out", type=Path, metavar="FILE.md", help="Markdown in Datei statt Standardausgabe")
    args = parser.parse_args(argv)

    try:
        recordings_ticks = [(recording_name(path), read_ticks_file(path)) for path in args.ticks]
        site = read_site_file(args.markers) if args.markers else SiteData(markers=[], aisles=[])
        layout_aisles = read_layout_aisles(args.layout) if args.layout else []
        replay_rows = parse_replay_lines(read_text(args.replay_lines)) if args.replay_lines else None
    except InputError as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2

    if site.aisles:
        aisles: Optional[List[Aisle]] = site.aisles
        aisle_source = "Standort-Datei (Gang-Tabelle)"
    elif layout_aisles:
        aisles = layout_aisles
        aisle_source = "Layout-JSON (type aisle)"
    else:
        aisles = None
        aisle_source = "n/a (keine Gangdefinition)"

    recordings = [
        analyze_recording(name, ticks, site.markers, aisles, args.source, args.min_window)
        for name, ticks in recordings_ticks
    ]
    text = render_report(recordings, site.markers, aisles, aisle_source, args.source, args.min_window, replay_rows)

    if args.out is not None:
        try:
            args.out.write_text(text, encoding="utf-8")
        except OSError as error:
            print(f"Fehler: {args.out} kann nicht geschrieben werden ({error})", file=sys.stderr)
            return 2
        print(f"Tabelle geschrieben: {args.out}", file=sys.stderr)
    else:
        print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())

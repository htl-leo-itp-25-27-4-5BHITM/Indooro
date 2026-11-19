#!/usr/bin/env python3
"""Druckbogen fuer die Bodenmarker eines Messtags (A4, ein Marker je Seite) aus dem Layout.

Das Layout kommt aus einer Datei (`--layout`, Format `LayoutData` oder Antwort von `layout/current`) oder
live aus dem Backend (`--store`, nur lesend, ueber `fetch_layout.py`). Die Marker-IDs `M1`..`Mn` sind
dieselben wie im Recorder (`truth.marker`, Format `indooro-recording/2`, `M<n>`; die App kennt M1 bis M30).

Standard-Plan (ohne `--markers`): Gangzeilen sind Zellenzeilen, in denen die erste und die letzte Zelle
frei von Regalen sind. Je zusammenhaengendem Block solcher Zeilen entsteht eine Marker-Zeile (je ein Marker
in der ersten und letzten Zelle, jeweils Zellmitte). Von unten nach oben, abwechselnd links->rechts
und rechts->links (Schlangenlinie). Marker naeher als 1 Einheit an einem Beacon werden verworfen.

Aufruf (Repo-Wurzel):
    python -I scripts/field/generate_marker_sheet.py --store SPAR-Leonding-002 --out marker.html
    python -I scripts/field/generate_marker_sheet.py --layout layout.json --out marker.html [--cell-m 1.0]
        [--markers marker.json]   # [{"id": "M1", "x": 0.5, "y": 7.5}, ...] statt Standard-Plan

Meter ab Ursprung = Layout-Einheiten * `--cell-m`. Der Standard 1,0 ist die Annahme der App (1 Zelle = 1 m);
vor Ort mit dem Maßband bestaetigen.

Exit: 0 geschrieben, 2 Aufruf-, Netz- oder Eingabefehler.
"""

from __future__ import annotations

import argparse
import html
import json
import math
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))

import fetch_layout as fl  # noqa: E402

MARKER_RE = re.compile(r"^M[0-9]{1,3}$")
MIN_BEACON_DISTANCE = 1.0
MAX_APP_MARKER = 30


class SheetError(Exception):
    """Ungueltige Eingabe."""


Marker = Dict[str, object]


def grid_size(layout: Dict[str, object]) -> Tuple[int, int]:
    size = layout.get("gridSize")
    if not isinstance(size, dict):
        raise SheetError("Layout ohne gridSize")
    try:
        width, height = int(size["width"]), int(size["height"])  # type: ignore[arg-type]
    except (KeyError, TypeError, ValueError):
        raise SheetError("gridSize ohne width/height")
    if width < 1 or height < 1:
        raise SheetError("gridSize muss positiv sein")
    return width, height


def elements(layout: Dict[str, object], kind: str) -> List[Dict[str, object]]:
    items = layout.get("elements")
    if not isinstance(items, list):
        raise SheetError("Layout ohne elements")
    return [e for e in items if isinstance(e, dict) and e.get("type") == kind]


def shelf_rect(shelf: Dict[str, object]) -> Optional[Tuple[int, int, int, int]]:
    """(x, y, Breite, Hoehe) in Zellen; bei Drehung um 90/270 Grad vertauscht."""
    try:
        x, y = int(shelf.get("x", 0)), int(shelf.get("y", 0))  # type: ignore[arg-type]
        w, h = max(int(shelf.get("width", 1)), 1), max(int(shelf.get("height", 1)), 1)  # type: ignore[arg-type]
        rotation = int(shelf.get("rotation", 0) or 0)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if rotation % 180 == 90:
        w, h = h, w
    return x, y, w, h


def blocked_cells(layout: Dict[str, object]) -> set:
    cells = set()
    for shelf in elements(layout, "shelf"):
        rect = shelf_rect(shelf)
        if rect is None:
            continue
        x, y, w, h = rect
        for dx in range(w):
            for dy in range(h):
                cells.add((x + dx, y + dy))
    return cells


def beacon_points(layout: Dict[str, object]) -> List[Tuple[str, float, float]]:
    points = []
    for beacon in elements(layout, "beacon"):
        try:
            points.append((str(beacon.get("beaconId")), float(beacon["x"]), float(beacon["y"])))  # type: ignore[arg-type]
        except (KeyError, TypeError, ValueError):
            continue
    return points


def plan_markers(layout: Dict[str, object]) -> List[Marker]:
    width, height = grid_size(layout)
    blocked = blocked_cells(layout)
    aisle_rows = [y for y in range(height) if (0, y) not in blocked and (width - 1, y) not in blocked]
    bands: List[List[int]] = []
    for y in aisle_rows:
        if bands and bands[-1][-1] == y - 1:
            bands[-1].append(y)
        else:
            bands.append([y])
    beacons = beacon_points(layout)
    markers: List[Marker] = []
    left_to_right = True
    for band in reversed(bands):
        row = band[(len(band) - 1) // 2]
        xs = [0.5, width - 0.5] if width > 1 else [0.5]
        if not left_to_right:
            xs.reverse()
        left_to_right = not left_to_right
        for x in xs:
            y = row + 0.5
            if any(math.hypot(x - bx, y - by) < MIN_BEACON_DISTANCE for _, bx, by in beacons):
                continue
            markers.append({"x": x, "y": y})
    for number, marker in enumerate(markers, start=1):
        marker["id"] = f"M{number}"
    return markers


def load_markers(path: Path) -> List[Marker]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise SheetError(f"{path}: {error}")
    if not isinstance(data, list) or not data:
        raise SheetError(f"{path}: erwartet wird eine nicht leere Liste")
    return validate_markers(data)


def validate_markers(items: Sequence[object]) -> List[Marker]:
    markers: List[Marker] = []
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise SheetError("Marker muss ein Objekt sein")
        marker_id = item.get("id")
        if not isinstance(marker_id, str) or not MARKER_RE.match(marker_id):
            raise SheetError(f"ungueltige Marker-ID {marker_id!r} (erlaubt: M<n>)")
        if marker_id in seen:
            raise SheetError(f"doppelte Marker-ID {marker_id}")
        seen.add(marker_id)
        try:
            markers.append({"id": marker_id, "x": float(item["x"]), "y": float(item["y"])})  # type: ignore[arg-type]
        except (KeyError, TypeError, ValueError):
            raise SheetError(f"{marker_id}: x und y muessen Zahlen sein")
    return markers


def check_markers(layout: Dict[str, object], markers: Sequence[Marker]) -> List[str]:
    """Warnungen: Marker ausserhalb, auf Regal, zu nah an Beacon, ID ueber dem App-Bereich."""
    width, height = grid_size(layout)
    blocked = blocked_cells(layout)
    beacons = beacon_points(layout)
    warnings = []
    for marker in markers:
        x, y, name = float(marker["x"]), float(marker["y"]), str(marker["id"])  # type: ignore[arg-type]
        if not (0 <= x <= width and 0 <= y <= height):
            warnings.append(f"{name} liegt ausserhalb des Rasters ({x:g}, {y:g})")
        elif (int(math.floor(x)), int(math.floor(y))) in blocked:
            warnings.append(f"{name} liegt auf einem Regal ({x:g}, {y:g})")
        if any(math.hypot(x - bx, y - by) < MIN_BEACON_DISTANCE for _, bx, by in beacons):
            warnings.append(f"{name} ist weniger als {MIN_BEACON_DISTANCE:g} vom naechsten Beacon entfernt")
        if int(name[1:]) > MAX_APP_MARKER:
            warnings.append(f"{name}: die App-Auswahl kennt nur M1 bis M{MAX_APP_MARKER}")
    return warnings


def metres(value: float, cell_m: float) -> str:
    return f"{value * cell_m:.2f}".replace(".", ",")


def units(value: float) -> str:
    return f"{value:g}".replace(".", ",")


def direction_text(src: Marker, dst: Marker) -> str:
    dx, dy = float(dst["x"]) - float(src["x"]), float(dst["y"]) - float(src["y"])  # type: ignore[arg-type]
    if abs(dx) >= abs(dy):
        return "nach rechts (x wächst)" if dx > 0 else "nach links (x sinkt)"
    return "auf der Karte nach unten (y wächst)" if dy > 0 else "auf der Karte nach oben (y sinkt)"


def map_svg(layout: Dict[str, object], markers: Sequence[Marker], highlight: Optional[str], px: int) -> str:
    width, height = grid_size(layout)
    cell = px / max(width, height)
    w, h = width * cell, height * cell
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 -14 {w + 28:.1f} {h + 28:.1f}" '
             f'width="{w + 28:.0f}" height="{h + 28:.0f}" role="img" aria-label="Rasterkarte">']
    parts.append(f'<rect x="0" y="0" width="{w:.1f}" height="{h:.1f}" fill="#fff" stroke="#000" stroke-width="2"/>')
    for i in range(1, width):
        parts.append(f'<line x1="{i * cell:.1f}" y1="0" x2="{i * cell:.1f}" y2="{h:.1f}" stroke="#bbb" stroke-width="0.7"/>')
    for j in range(1, height):
        parts.append(f'<line x1="0" y1="{j * cell:.1f}" x2="{w:.1f}" y2="{j * cell:.1f}" stroke="#bbb" stroke-width="0.7"/>')
    for shelf in elements(layout, "shelf"):
        rect = shelf_rect(shelf)
        if rect is None:
            continue
        sx, sy, sw, sh = rect
        parts.append(f'<rect x="{sx * cell:.1f}" y="{sy * cell:.1f}" width="{sw * cell:.1f}" height="{sh * cell:.1f}" '
                     f'fill="#d9d9d9" stroke="#555" stroke-width="1"/>')
    for beacon_id, bx, by in beacon_points(layout):
        anchor = "start" if bx < width / 2 else "end"
        tx = bx * cell + (7 if bx < width / 2 else -7)
        ty = by * cell + (-8 if by > height / 2 else 14)
        parts.append(f'<circle cx="{bx * cell:.1f}" cy="{by * cell:.1f}" r="5" fill="#fff" stroke="#000" stroke-width="2"/>')
        parts.append(f'<text x="{tx:.1f}" y="{ty:.1f}" font-size="9" text-anchor="{anchor}">{html.escape(beacon_id)}</text>')
    for marker in markers:
        name = str(marker["id"])
        mx, my = float(marker["x"]) * cell, float(marker["y"]) * cell  # type: ignore[arg-type]
        active = highlight is None or name == highlight
        r = 11 if highlight and active else (8 if active else 5)
        fill = "#000" if active else "#fff"
        parts.append(f'<circle cx="{mx:.1f}" cy="{my:.1f}" r="{r}" fill="{fill}" stroke="#000" stroke-width="1.5"/>')
        if active:
            parts.append(f'<text x="{mx:.1f}" y="{my + 3:.1f}" font-size="9" text-anchor="middle" fill="#fff" '
                         f'font-weight="bold">{html.escape(name[1:])}</text>')
    parts.append('<text x="-4" y="-3" font-size="8" text-anchor="end">0,0</text>')
    parts.append("</svg>")
    return "".join(parts)


def origin_hint(layout: Dict[str, object]) -> str:
    for beacon_id, bx, by in beacon_points(layout):
        if bx == 0 and by == 0:
            return f"oben links auf der Karte, an der Ecke von Beacon {beacon_id}"
    return "oben links auf der Karte"


CSS = """
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; }
body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #000; background: #fff; margin: 0; }
section.page { page-break-after: always; break-after: page; padding: 4mm 2mm; min-height: 270mm; }
section.page:last-child { page-break-after: auto; break-after: auto; }
h1 { font-size: 20pt; margin: 0 0 4mm; }
.big { font-size: 150pt; font-weight: 800; line-height: 1; margin: 0 0 6mm; letter-spacing: -2pt; }
.row { display: flex; gap: 8mm; align-items: flex-start; }
table { border-collapse: collapse; font-size: 14pt; }
td, th { border: 1.5px solid #000; padding: 2mm 4mm; text-align: left; }
th { background: #eee; }
.arrow { margin-top: 6mm; font-size: 14pt; }
.arrow svg { vertical-align: middle; }
.fill { border-bottom: 1.5px solid #000; display: inline-block; min-width: 30mm; }
.note { font-size: 12pt; margin-top: 6mm; }
.warn { border: 2px solid #000; padding: 3mm; margin: 4mm 0; font-size: 12pt; }
@media screen { section.page { border: 1px solid #999; margin: 8mm auto; max-width: 190mm; background: #fff; } body { background: #eee; } }
"""

UP_ARROW = ('<svg width="46" height="60" viewBox="0 0 46 60" aria-hidden="true">'
            '<path d="M23 2 L44 28 L30 28 L30 58 L16 58 L16 28 L2 28 Z" fill="#000"/></svg>')


def render(layout: Dict[str, object], markers: Sequence[Marker], store: str, cell_m: float, warnings: Sequence[str]) -> str:
    width, height = grid_size(layout)
    shop = html.escape(str(layout.get("shopName") or store))
    store_h = html.escape(store)
    out = [
        '<!doctype html><html lang="de"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>Marker {store_h}</title><style>{CSS}</style></head><body>",
        '<section class="page">',
        f"<h1>Marker-Übersicht · {shop} · {store_h}</h1>",
        f"<p>Raster {width} × {height} Zellen, 1 Zelle = {metres(1, cell_m)} m (Annahme, vor Ort mit dem Maßband "
        f"bestätigen). Ursprung (0,0): {html.escape(origin_hint(layout))}. Graue Flächen sind Regale, Kreise mit Namen "
        "sind Beacons, schwarze Punkte sind Marker.</p>",
        f"<div>{map_svg(layout, markers, None, 520)}</div>",
    ]
    for text in warnings:
        out.append(f'<div class="warn">Warnung: {html.escape(text)}</div>')
    out.append("<table><tr><th>Marker</th><th>x (Einheiten)</th><th>y (Einheiten)</th>"
               "<th>x ab Ursprung (m)</th><th>y ab Ursprung (m)</th></tr>")
    for marker in markers:
        x, y = float(marker["x"]), float(marker["y"])  # type: ignore[arg-type]
        out.append(f"<tr><td><b>{html.escape(str(marker['id']))}</b></td><td>{units(x)}</td><td>{units(y)}</td>"
                   f"<td>{metres(x, cell_m)}</td><td>{metres(y, cell_m)}</td></tr>")
    out.append("</table>")
    out.append('<p class="note">Reihenfolge der Begehung: M1, M2, … in der Nummernfolge, danach rückwärts. '
               "Auf den folgenden Seiten steht je ein Marker.</p>")
    out.append("</section>")
    origin_text = origin_hint(layout).split("Ecke von ")[-1] if "Ecke von " in origin_hint(layout) else "dem Ursprung (0,0)"
    for index, marker in enumerate(markers):
        name = html.escape(str(marker["id"]))
        x, y = float(marker["x"]), float(marker["y"])  # type: ignore[arg-type]
        col, row = int(math.floor(x)), int(math.floor(y))
        nxt = markers[index + 1] if index + 1 < len(markers) else None
        out.append('<section class="page">')
        out.append(f"<h1>{shop} · Marker</h1>")
        out.append('<div class="row">')
        out.append(f'<div><p class="big">{name}</p><table>')
        out.append(f"<tr><th>Zelle</th><td>Spalte {col}, Reihe {row} (Zählung ab 0, wie im Layout)</td></tr>")
        out.append(f"<tr><th>So zählen</th><td>Ab der Ecke mit {html.escape(origin_text)}: {col} Zellen nach rechts, {row} Zellen nach unten, dann in diese Zelle. Jede Zelle ist {metres(1, cell_m)} m groß.</td></tr>")
        out.append(f"<tr><th>Layout</th><td>x = {units(x)}, y = {units(y)}</td></tr>")
        out.append(f"<tr><th>Meter ab Ursprung</th><td>x = {metres(x, cell_m)} m, y = {metres(y, cell_m)} m</td></tr>")
        out.append(f"<tr><th>Ursprung (0,0)</th><td>{html.escape(origin_hint(layout))}</td></tr>")
        out.append("</table></div>")
        out.append(f"<div>{map_svg(layout, markers, str(marker['id']), 360)}</div>")
        out.append("</div>")
        out.append(f'<p class="arrow">{UP_ARROW} Pfeil zeigt zur Oberkante der Karte (y = 0). '
                   "Blatt so hinlegen, dass der Pfeil dorthin zeigt.</p>")
        if nxt is not None:
            out.append(f'<p class="arrow">Nächster Marker: <b>{html.escape(str(nxt["id"]))}</b>, '
                       f"{html.escape(direction_text(marker, nxt))}.</p>")
        else:
            out.append('<p class="arrow">Letzter Marker. Danach rückwärts zurück zu M1.</p>')
        out.append('<p class="note">Geklebt: &#9744; &nbsp; Mit Maßband geprüft: &#9744; &nbsp; '
                   'Abweichung: <span class="fill"></span> m</p>')
        out.append(f'<p class="note">Der Marker ist die Mitte eines Klebeband-Kreuzes am Boden, nicht das Blatt. '
                   f"Maßband ab Ursprung: x {metres(x, cell_m)} m, y {metres(y, cell_m)} m.</p>")
        out.append("</section>")
    out.append("</body></html>")
    return "\n".join(out) + "\n"


def build(layout: Dict[str, object], store: str, cell_m: float,
          markers: Optional[List[Marker]] = None) -> Tuple[str, List[Marker], List[str]]:
    plan = markers if markers is not None else plan_markers(layout)
    if not plan:
        raise SheetError("kein Marker geplant (keine Gangzeile mit freien Enden)")
    warnings = check_markers(layout, plan)
    return render(layout, plan, store, cell_m, warnings), plan, warnings


def main(argv: Optional[Sequence[str]] = None, fetch: fl.Fetcher = fl.http_get) -> int:
    parser = argparse.ArgumentParser(description="Druckbogen fuer Bodenmarker aus dem Layout erzeugen.")
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--layout", type=Path, metavar="FILE.json")
    source.add_argument("--store", metavar="CODE", help="storeCode, Layout live (lesend) holen")
    parser.add_argument("--api-base", default=fl.DEFAULT_API_BASE, metavar="URL")
    parser.add_argument("--out", required=True, type=Path, metavar="FILE.html")
    parser.add_argument("--cell-m", type=float, default=1.0, metavar="M", help="Meter je Layout-Einheit (Standard 1,0)")
    parser.add_argument("--markers", type=Path, metavar="FILE.json", help="eigene Marker statt Standard-Plan")
    parser.add_argument("--name", metavar="TEXT", help="Name im Kopf (Standard: storeCode oder Dateiname)")
    args = parser.parse_args(argv)

    try:
        if args.cell_m <= 0:
            raise SheetError("--cell-m muss positiv sein")
        if args.layout:
            try:
                layout = fl.unwrap_layout(json.loads(args.layout.read_text(encoding="utf-8")))
            except (OSError, ValueError) as error:
                raise SheetError(f"{args.layout}: {error}")
            store = args.name or args.layout.stem
        else:
            layout = fl.unwrap_layout(fl.fetch_layout(args.api_base, args.store, fetch))
            store = args.name or args.store
        markers = load_markers(args.markers) if args.markers else None
        text, plan, warnings = build(layout, store, args.cell_m, markers)
    except (SheetError, fl.FetchError) as error:
        print(f"Fehler: {error}", file=sys.stderr)
        return 2

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"Geschrieben: {args.out} ({len(plan)} Marker)")
    for marker in plan:
        print(f"  {marker['id']}  x={float(marker['x']):g} y={float(marker['y']):g}")  # type: ignore[arg-type]
    for warning in warnings:
        print(f"Warnung: {warning}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

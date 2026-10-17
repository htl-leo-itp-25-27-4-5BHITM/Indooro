"""Writers for beacons-plan.csv, coverage.svg and layout-with-beacons.json.

All writers produce byte-identical output for identical input (no timestamps, fixed number formats,
LF line endings). The input layout file is never written.
"""
from __future__ import annotations

import copy
import csv
import json
import os
from dataclasses import dataclass
from typing import Iterable, Sequence
from xml.sax.saxutils import escape

from layout import Element, Layout, is_axis_aligned

PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000"
CSV_HEADER = ("minor", "x_m", "y_m", "mount", "notes")
PALETTE = (
    ("#f4c7c3", "0 Beacons"),
    ("#fde7a1", "1 Beacon"),
    ("#cfe8b0", "2 Beacons"),
    ("#6fbf73", "3 oder mehr"),
)
SHELF_FILL = "#9e9e9e"
ENTRANCE_FILL = "#90caf9"


@dataclass(frozen=True)
class NumberedBeacon:
    minor: int
    x: float
    y: float
    mount: str
    notes: str


def max_existing_minor(document: dict) -> int:
    """Largest beaconMinor (or minor) among existing beacon elements; 0 when there are none."""
    largest = 0
    for element in document.get("elements", []) or []:
        if not isinstance(element, dict) or element.get("type") != "beacon":
            continue
        for key in ("beaconMinor", "minor"):
            value = element.get(key)
            if isinstance(value, int) and not isinstance(value, bool):
                largest = max(largest, value)
    return largest


def write_csv(path: str, beacons: Iterable[NumberedBeacon]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(CSV_HEADER)
        for beacon in beacons:
            writer.writerow([beacon.minor, f"{beacon.x:.2f}", f"{beacon.y:.2f}", beacon.mount, beacon.notes])


def _element_rect(element: Element) -> tuple[float, float, float, float]:
    return element.x, element.y, element.w, element.h


def write_svg(path: str, layout: Layout, ios_walkable: set, counts: dict,
              beacons: Sequence[NumberedBeacon], title: str) -> None:
    """Coverage map: walkable cells coloured by beacons in range, obstacles grey, numbered beacons."""
    scale = max(4.0, min(16.0, 1000.0 / max(layout.width, layout.height)))
    margin_top = 56.0
    margin = 16.0
    legend_width = 190.0
    map_width = layout.width * scale
    map_height = layout.height * scale
    width = max(margin * 2 + map_width + legend_width, margin * 2 + len(title) * 9.5)
    height = margin_top + map_height + margin + 40.0
    out: list[str] = []
    out.append('<?xml version="1.0" encoding="UTF-8"?>')
    out.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.0f}" height="{height:.0f}" '
               f'viewBox="0 0 {width:.0f} {height:.0f}">')
    out.append('<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>')
    out.append(f'<text x="{margin:.1f}" y="30" font-family="sans-serif" font-size="16" font-weight="bold">'
               f'{escape(title)}</text>')
    origin_x = margin
    origin_y = margin_top

    out.append(f'<g transform="translate({origin_x:.1f} {origin_y:.1f})">')
    for cell in sorted(ios_walkable):
        i, j = cell
        count = counts.get(cell, 0)
        fill = PALETTE[min(count, 3)][0]
        out.append(f'<rect x="{i * scale:.2f}" y="{j * scale:.2f}" width="{scale:.2f}" height="{scale:.2f}" '
                   f'fill="{fill}" stroke="#ffffff" stroke-width="0.3"/>')
    for element in layout.elements:
        if element.type in ("beacon", "entrance") or not element.has_position:
            continue
        x, y, w, h = _element_rect(element)
        rotate = ""
        if element.rotation is not None and not is_axis_aligned(element.rotation):
            cx = (x + w / 2) * scale
            cy = (y + h / 2) * scale
            rotate = f' transform="rotate({element.rotation:.2f} {cx:.2f} {cy:.2f})"'
        out.append(f'<rect x="{x * scale:.2f}" y="{y * scale:.2f}" width="{w * scale:.2f}" '
                   f'height="{h * scale:.2f}" fill="{SHELF_FILL}" fill-opacity="0.85" stroke="#616161"'
                   f' stroke-width="0.6"{rotate}/>')
    for element in layout.elements:
        if element.type != "entrance" or not element.has_position:
            continue
        x, y, w, h = _element_rect(element)
        out.append(f'<rect x="{x * scale:.2f}" y="{y * scale:.2f}" width="{w * scale:.2f}" '
                   f'height="{h * scale:.2f}" fill="{ENTRANCE_FILL}" fill-opacity="0.6" stroke="#1565c0" '
                   f'stroke-width="1.5" stroke-dasharray="4 2"/>')
        out.append(f'<text x="{(x + w / 2) * scale:.2f}" y="{(y + h / 2) * scale:.2f}" font-family="sans-serif" '
                   f'font-size="11" text-anchor="middle" dominant-baseline="middle" fill="#0d47a1">Eingang</text>')
    radius_px = max(4.0, scale * 0.45)
    for beacon in beacons:
        cx = beacon.x * scale
        cy = beacon.y * scale
        out.append(f'<circle cx="{cx:.2f}" cy="{cy:.2f}" r="{radius_px:.2f}" fill="#1a237e" stroke="#ffffff" '
                   f'stroke-width="1"/>')
        out.append(f'<text x="{cx:.2f}" y="{cy:.2f}" font-family="sans-serif" font-size="{max(8.0, radius_px * 1.1):.1f}" '
                   f'text-anchor="middle" dominant-baseline="central" fill="#ffffff">{beacon.minor}</text>')
    out.append('</g>')

    legend_x = origin_x + map_width + 24.0
    out.append(f'<text x="{legend_x:.1f}" y="{origin_y + 14:.1f}" font-family="sans-serif" font-size="13" '
               f'font-weight="bold">Beacons im Radius</text>')
    for index, (colour, label) in enumerate(PALETTE):
        y = origin_y + 26 + index * 22
        out.append(f'<rect x="{legend_x:.1f}" y="{y:.1f}" width="16" height="16" fill="{colour}" stroke="#757575"/>')
        out.append(f'<text x="{legend_x + 24:.1f}" y="{y + 12:.1f}" font-family="sans-serif" font-size="12">'
                   f'{escape(label)}</text>')
    y = origin_y + 26 + len(PALETTE) * 22
    out.append(f'<rect x="{legend_x:.1f}" y="{y:.1f}" width="16" height="16" fill="{SHELF_FILL}"/>')
    out.append(f'<text x="{legend_x + 24:.1f}" y="{y + 12:.1f}" font-family="sans-serif" font-size="12">'
               f'Regal / Hindernis</text>')
    y += 22
    out.append(f'<circle cx="{legend_x + 8:.1f}" cy="{y + 8:.1f}" r="7" fill="#1a237e"/>')
    out.append(f'<text x="{legend_x + 24:.1f}" y="{y + 12:.1f}" font-family="sans-serif" font-size="12">'
               f'Beacon (Minor)</text>')

    bar_y = origin_y + map_height + 22.0
    bar_length = 5 * scale
    out.append(f'<line x1="{origin_x:.1f}" y1="{bar_y:.1f}" x2="{origin_x + bar_length:.1f}" y2="{bar_y:.1f}" '
               f'stroke="#000000" stroke-width="2"/>')
    out.append(f'<text x="{origin_x:.1f}" y="{bar_y + 16:.1f}" font-family="sans-serif" font-size="11">5 m</text>')
    out.append('</svg>')

    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(out) + "\n")


def write_layout_patch(path: str, layout: Layout, beacons: Sequence[NumberedBeacon]) -> None:
    """Writes the input layout plus new beacon elements; the input document is copied, never changed.

    Element IDs continue after the largest integer ID. The beacon meter/category follow the
    placeholder convention of the existing test layouts (meter = minor, category undefined/<minor>).
    """
    document = copy.deepcopy(layout.source)
    elements = document.get("elements")
    if not isinstance(elements, list):
        elements = []
        document["elements"] = elements
    integer_ids = [e.get("id") for e in elements
                   if isinstance(e, dict) and isinstance(e.get("id"), int) and not isinstance(e.get("id"), bool)]
    next_id = (max(integer_ids) if integer_ids else 0) + 1
    for beacon in beacons:
        elements.append({
            "id": next_id,
            "type": "beacon",
            "beaconId": f"Indooro{beacon.minor}",
            "beaconUUID": PLACEHOLDER_UUID,
            "beaconMajor": 1,
            "beaconMinor": beacon.minor,
            "x": beacon.x,
            "y": beacon.y,
            "meter": beacon.minor,
            "category": f"undefined/{beacon.minor}",
        })
        next_id += 1
    with open(path, "w", encoding="utf-8", newline="\n") as handle:
        json.dump(document, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)
